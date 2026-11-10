/**
 * Gradient-field generation — the soul of the game.
 *
 * We scatter anchor colors across the board and interpolate them in OKLab
 * with softened inverse-distance weighting. Between competing anchors chroma
 * cancels naturally, which is what produces those gray-lavender centers the
 * original game was loved for. A gentle sinusoidal drift keeps fields organic
 * instead of mathematically banded, and guarantees the "flat" direction of a
 * gradient still carries perceptible signal.
 *
 * After interpolation the field is tuned — scaled around its mean — until the
 * *mean* perceptual distance between 4-adjacent tiles lands inside the
 * difficulty band. Individual pairs may dip lower (iso-line neighbors on a
 * calm gradient genuinely look similar — that's part of the game), but never
 * below a hard floor that keeps every tile distinct and traceable.
 */

import { Lab, lchToLab, fitToGamut, deltaEok } from "./color";
import { Rng } from "./rng";
import { GridSpec, adjacentPairs } from "./grid";

export interface FieldParams {
  /** 3–6 color anchors blended across the board. */
  anchors: number;
  /** Hue arc covered by the anchors, in turns (0.08 = whisper-subtle). */
  hueSpan: number;
  lightRange: [number, number];
  chromaRange: [number, number];
  /** Target floor for the MEAN ΔEok between 4-adjacent tiles. */
  minAdjacentDelta: number;
  /** Target cap for the mean adjacent ΔEok (keeps things from getting easy). */
  maxAdjacentDelta: number;
  /** Amplitude of the organic wobble (a/b, and 0.6× in L). */
  drift: number;
}

export interface Anchor {
  u: number;
  v: number;
  lab: Lab;
}

export interface GeneratedField {
  labs: Lab[];
  anchors: Anchor[];
  minAdjacent: number;
  meanAdjacent: number;
  maxAdjacent: number;
  minPairwise: number;
}

export class FieldTuneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldTuneError";
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function anchorPositions(rng: Rng, k: number): Array<{ u: number; v: number }> {
  const pos: Array<{ u: number; v: number }> = [];
  const inset = () => rng.range(0.02, 0.18);

  // First two anchors live in opposite corners — the classic diagonal pull.
  const flip = rng.bool();
  const c0 = flip ? { u: 0, v: 0 } : { u: 1, v: 0 };
  const c1 = flip ? { u: 1, v: 1 } : { u: 0, v: 1 };
  pos.push({ u: c0.u === 0 ? inset() : 1 - inset(), v: c0.v === 0 ? inset() : 1 - inset() });
  pos.push({ u: c1.u === 0 ? inset() : 1 - inset(), v: c1.v === 0 ? inset() : 1 - inset() });

  // Extras spread with a minimum-distance rejection loop.
  for (let i = 2; i < k; i++) {
    let sep = 0.38;
    for (let attempt = 0; attempt < 40; attempt++) {
      const u = rng.range(0.08, 0.92);
      const v = rng.range(0.08, 0.92);
      const ok = pos.every((p) => Math.hypot(p.u - u, p.v - v) >= sep);
      if (ok) {
        pos.push({ u, v });
        break;
      }
      sep *= 0.92;
      if (attempt === 39) pos.push({ u, v });
    }
  }
  return pos;
}

function adjacentStats(
  labs: Lab[],
  pairs: Array<[number, number]>,
): { min: number; mean: number; max: number } {
  let min = Infinity;
  let max = 0;
  let sum = 0;
  for (const [i, j] of pairs) {
    const d = deltaEok(labs[i], labs[j]);
    if (d < min) min = d;
    if (d > max) max = d;
    sum += d;
  }
  return { min, mean: sum / pairs.length, max };
}

function minPairwise(labs: Lab[]): number {
  let min = Infinity;
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = deltaEok(labs[i], labs[j]);
      if (d < min) min = d;
    }
  }
  return min;
}

/** Scale the field away/toward its mean color, staying in gamut. */
function scaleAroundMean(labs: Lab[], f: number): Lab[] {
  let ml = 0;
  let ma = 0;
  let mb = 0;
  for (const c of labs) {
    ml += c.l;
    ma += c.a;
    mb += c.b;
  }
  const n = labs.length;
  ml /= n;
  ma /= n;
  mb /= n;
  return labs.map((c) =>
    fitToGamut({
      l: clamp(ml + (c.l - ml) * f, 0.1, 0.96),
      a: ma + (c.a - ma) * f,
      b: mb + (c.b - mb) * f,
    }),
  );
}

/**
 * Push two nearly-coincident colors apart in the a/b plane, along their
 * existing difference (or a fixed direction when degenerate). Individual
 * nudges are capped so they stay far below visual noise.
 */
function pushApart(x: Lab, y: Lab, need: number): void {
  let da = x.a - y.a;
  let db = x.b - y.b;
  if (Math.hypot(da, db) < 1e-6) {
    da = 1;
    db = 0.5;
  }
  const m = Math.hypot(da, db);
  const s = Math.min(need, 0.004) / m / 2;
  x.a += da * s;
  x.b += db * s;
  y.a -= da * s;
  y.b -= db * s;
}

/**
 * Guarantee distinctness. Smooth fields inevitably contain local extrema
 * where the gradient crosses zero, leaving adjacent pairs nearly identical —
 * global scaling can't fix a local property, so we repair locally with
 * sub-perceptual nudges (≤0.004 ΔE per pass, chroma plane only).
 */
function resolveCoincidences(
  labs: Lab[],
  grid: GridSpec,
  adjacentGap: number,
  uniqueGap: number,
): Lab[] {
  const out = labs.map((c) => ({ ...c }));

  for (let pass = 0; pass < 6; pass++) {
    let touched = false;
    for (const [i, j] of adjacentPairs(grid)) {
      const d = deltaEok(out[i], out[j]);
      if (d < adjacentGap) {
        pushApart(out[i], out[j], (adjacentGap - d) / 2 + 0.0004);
        touched = true;
      }
    }
    if (!touched) break;
  }

  for (let pass = 0; pass < 3; pass++) {
    let touched = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const d = deltaEok(out[i], out[j]);
        if (d < uniqueGap) {
          pushApart(out[i], out[j], (uniqueGap - d) / 2 + 0.0002);
          touched = true;
        }
      }
    }
    if (!touched) break;
  }

  return out.map(fitToGamut);
}

export function generateField(rng: Rng, grid: GridSpec, p: FieldParams): GeneratedField {
  const k = Math.max(3, Math.min(6, Math.round(p.anchors)));
  const baseHue = rng.next();
  let positions = anchorPositions(rng, k);
  const veilAnchor = rng.next() < 0.25 ? rng.int(k) : -1;

  // Shuffle the anchor→position assignment so the lightness ramp is not
  // spatially aligned with the hue arc — that alignment would collapse the
  // field onto a single gradient axis.
  positions = rng.shuffle(positions);

  const anchors: Anchor[] = positions.map((pos, i) => {
    const hue =
      (baseHue + p.hueSpan * (i / (k - 1) - 0.5) + rng.range(-0.02, 0.02) + 1) % 1;
    const l = lerp(p.lightRange[0], p.lightRange[1], i / (k - 1)) + rng.range(-0.05, 0.05);
    const c =
      i === veilAnchor
        ? rng.range(0.012, 0.035)
        : rng.range(p.chromaRange[0], p.chromaRange[1]);
    return {
      u: pos.u,
      v: pos.v,
      lab: fitToGamut(lchToLab({ l: clamp(l, 0.12, 0.95), c: Math.max(0.008, c), h: hue })),
    };
  });

  // Softened IDW (distance floor ≈ 0.1 keeps anchor neighborhoods gradual).
  const f1 = rng.range(0.6, 1.6);
  const f2 = rng.range(0.6, 1.6);
  const f3 = rng.range(0.6, 1.6);
  const ph1 = rng.range(0, Math.PI * 2);
  const ph2 = rng.range(0, Math.PI * 2);

  const labs: Lab[] = grid.cells.map(({ x, y }) => {
    const u = grid.cols === 1 ? 0.5 : x / (grid.cols - 1);
    const v = grid.rows === 1 ? 0.5 : y / (grid.rows - 1);
    let ws = 0;
    let sl = 0;
    let sa = 0;
    let sb = 0;
    for (const an of anchors) {
      const dx = u - an.u;
      const dy = v - an.v;
      const w = 1 / Math.pow(Math.max(dx * dx + dy * dy, 0.01), 1.25);
      ws += w;
      sl += w * an.lab.l;
      sa += w * an.lab.a;
      sb += w * an.lab.b;
    }
    return {
      l: sl / ws + p.drift * 0.6 * Math.sin(2 * Math.PI * (u * f1 + v * f2) + ph1),
      a: sa / ws + p.drift * Math.sin(2 * Math.PI * (u * f3 + v * f2) + ph2),
      b: sb / ws + p.drift * Math.cos(2 * Math.PI * (u * f1 + v * f3) + ph2),
    };
  });

  // Tune the MEAN adjacent delta into [floor, cap] by scaling around the mean.
  const pairs = adjacentPairs(grid);
  const floor = p.minAdjacentDelta;
  const cap = p.maxAdjacentDelta;

  let best = labs;
  let bestScore = Infinity;
  let cur = labs;
  for (let iter = 0; iter < 16; iter++) {
    const { mean } = adjacentStats(cur, pairs);
    const score = Math.max(0, floor - mean) * 6 + Math.max(0, mean - cap);
    if (score < bestScore) {
      bestScore = score;
      best = cur;
    }
    if (score === 0) break;
    const expand = Math.max(0, floor - mean) * 6 > Math.max(0, mean - cap);
    cur = scaleAroundMean(cur, expand ? 1.12 : 0.9);
  }

  const tuned = adjacentStats(best, pairs);
  if (tuned.mean < floor * 0.97) {
    throw new FieldTuneError(
      `could not raise mean adjacent contrast above ${floor.toFixed(4)} (got ${tuned.mean.toFixed(4)})`,
    );
  }

  // Local repair: every adjacent pair clearly distinct, every tile unique.
  // Calm iso-line neighbors are the game; interchangeable tiles are a bug.
  const resolved = resolveCoincidences(
    best,
    grid,
    Math.max(0.0042, floor * 0.1),
    Math.max(0.003, floor * 0.06),
  );

  const stats = adjacentStats(resolved, pairs);
  const minPair = minPairwise(resolved);
  if (stats.min < 0.0038 || minPair < 0.0028) {
    throw new FieldTuneError("distinctness repair failed");
  }

  return {
    labs: resolved,
    anchors,
    minAdjacent: stats.min,
    meanAdjacent: stats.mean,
    maxAdjacent: stats.max,
    minPairwise: minPair,
  };
}
