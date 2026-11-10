/**
 * Gradient-field generation — the soul of the game.
 *
 * Boards are TRUE multidimensional gradients: color flows from source colors
 * at the four corners, bilinearly interpolated in OKLab (where linear mixes
 * match what the eye sees). Between opposing corners chroma cancels
 * naturally, producing the gray-lavender middles the original was loved for.
 *
 * Two flows, straight out of I Love Hue 1:
 *  - "diagonal": two opposing corners carry the color; the other two sit at
 *    the midpoint — the classic easy sweep.
 *  - "quad": all four corners are distinct but related (a hue arc along one
 *    diagonal, a lightness ramp along the other) — coherent, yet 2D.
 *
 * After interpolation the field is tuned — scaled around its mean — until the
 * *mean* perceptual distance between adjacent tiles lands in the difficulty
 * band, then repaired locally so every tile stays distinct and traceable.
 */

import { Lab, lchToLab, fitToGamut, deltaEok } from "./color";
import { Rng } from "./rng";
import { GridSpec, adjacentPairs, neighborIndices } from "./grid";

export interface FieldParams {
  /** Hue arc between the two flow endpoints, in turns. */
  hueSpan: number;
  lightRange: [number, number];
  chromaRange: [number, number];
  /** Target floor for the MEAN ΔEok between 4-adjacent tiles. */
  minAdjacentDelta: number;
  /** Target cap for the mean adjacent ΔEok (keeps things from getting easy). */
  maxAdjacentDelta: number;
}

export type CornerMode = "diagonal" | "quad";

export interface GeneratedField {
  labs: Lab[];
  /** TL, TR, BL, BR */
  corners: [Lab, Lab, Lab, Lab];
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
const mixLab = (a: Lab, b: Lab, t: number): Lab => ({
  l: lerp(a.l, b.l, t),
  a: lerp(a.a, b.a, t),
  b: lerp(a.b, b.b, t),
});

/** Bilinear sample of a corner field at normalized [0,1]² position. */
export function bilinearSample(
  corners: readonly [Lab, Lab, Lab, Lab],
  u: number,
  v: number,
): Lab {
  const top = mixLab(corners[0], corners[1], u);
  const bottom = mixLab(corners[2], corners[3], u);
  return mixLab(top, bottom, v);
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

/**
 * Scale the field away/toward its mean color. Deliberately does NOT clamp to
 * gamut per iteration — repeated partial clamping is what creates kinks.
 * A single gamut fit happens once, after tuning, and the smoothing pass
 * afterward evens out any step that fit leaves behind.
 */
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
  return labs.map((c) => ({
    l: clamp(ml + (c.l - ml) * f, 0.08, 0.97),
    a: ma + (c.a - ma) * f,
    b: mb + (c.b - mb) * f,
  }));
}

/**
 * Push two nearly-coincident colors apart in the a/b plane, along their
 * existing difference (or a fixed direction when degenerate). Caps keep
 * nudges sub-perceptual — they exist only as a last-resort repair, never as
 * the primary tool (that's what the smooth ramp + blur are for).
 */
function pushApart(x: Lab, y: Lab, need: number, cap: number): void {
  let da = x.a - y.a;
  let db = x.b - y.b;
  if (Math.hypot(da, db) < 1e-6) {
    da = 1;
    db = 0.5;
  }
  const m = Math.hypot(da, db);
  const s = Math.min(need, cap) / m / 2;
  x.a += da * s;
  x.b += db * s;
  y.a -= da * s;
  y.b -= db * s;
}

/**
 * Laplacian smoothing: pull every cell toward the average of its 4
 * neighbors. This is the kink killer — it evens out steps introduced by
 * gamut clamping, distinctness repairs, and 8-bit quantization while
 * preserving the board's large-scale corner-driven structure.
 */
export function smoothField(
  labs: Lab[],
  grid: GridSpec,
  iterations = 2,
  alpha = 0.3,
): Lab[] {
  let cur = labs;
  for (let iter = 0; iter < iterations; iter++) {
    const next = cur.map((c) => ({ ...c }));
    for (let i = 0; i < cur.length; i++) {
      const ns = neighborIndices(grid, i);
      if (ns.length === 0) continue;
      let l = 0;
      let a = 0;
      let b = 0;
      for (const j of ns) {
        l += cur[j].l;
        a += cur[j].a;
        b += cur[j].b;
      }
      l /= ns.length;
      a /= ns.length;
      b /= ns.length;
      next[i] = {
        l: cur[i].l * (1 - alpha) + l * alpha,
        a: cur[i].a * (1 - alpha) + a * alpha,
        b: cur[i].b * (1 - alpha) + b * alpha,
      };
    }
    cur = next;
  }
  return cur;
}

/**
 * A whisper-thin linear ramp in the a/b plane. Perfectly smooth by
 * construction, it gives every iso-line a gentle drift so no two cells ever
 * tie — replacing what pair-nudges used to do, without ever creating a step.
 */
function applyMicroRamp(labs: Lab[], grid: GridSpec, rng: Rng, perStep = 0.0007): Lab[] {
  const angle = rng.range(0, Math.PI * 2);
  const rx = Math.cos(angle) * perStep;
  const ry = Math.sin(angle) * perStep;
  // Ramp lives in the a/b plane split across the two channels.
  const ax = rx * 0.7;
  const bx = rx * 0.7;
  const ay = ry * 0.7;
  const by = -ry * 0.7;
  return labs.map((c, i) => {
    const { x, y } = grid.cells[i];
    return {
      l: c.l,
      a: c.a + ax * x + ay * y,
      b: c.b + bx * x + by * y,
    };
  });
}

/**
 * Guarantee distinctness with a light touch: floors keep parallel rows
 * distinguishable and every tile unique; caps keep repairs invisible.
 * Exported because the Studio's image-sampled boards need the same promise.
 */
export function ensureDistinct(
  labs: Lab[],
  grid: GridSpec,
  adjacentGap = 0.005,
  uniqueGap = 0.0015,
): Lab[] {
  const out = labs.map((c) => ({ ...c }));

  for (let pass = 0; pass < 6; pass++) {
    let touched = false;
    for (const [i, j] of adjacentPairs(grid)) {
      const d = deltaEok(out[i], out[j]);
      if (d < adjacentGap) {
        pushApart(out[i], out[j], (adjacentGap - d) / 2 + 0.0002, 0.0012);
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
          pushApart(out[i], out[j], (uniqueGap - d) / 2 + 0.0001, 0.0012);
          touched = true;
        }
      }
    }
    if (!touched) break;
  }

  return out;
}

function sampleCornerColors(rng: Rng, p: FieldParams, mode: CornerMode): [Lab, Lab, Lab, Lab] {
  const h0 = rng.next();
  const span = p.hueSpan * rng.range(0.75, 1.25);

  // A lightness difference between the two "sides" of the board guarantees
  // the field is genuinely 2D — never a pure 1D sweep with identical
  // anti-diagonal neighbors.
  let l0 = rng.range(p.lightRange[0], p.lightRange[1]);
  let l1 = rng.range(p.lightRange[0], p.lightRange[1]);
  let guard = 12;
  while (Math.abs(l1 - l0) < 0.14 && guard-- > 0) {
    l1 = rng.range(p.lightRange[0], p.lightRange[1]);
  }
  const veil = rng.next() < 0.2; // one low-chroma endpoint for misty middles

  if (mode === "diagonal") {
    // Hue + chroma flow TL → BR; lightness flows across the perpendicular
    // diagonal (both off-corners shifted the same way), like game 1's early
    // boards — brighter at the top, deeper at the bottom.
    const A = fitToGamut(
      lchToLab({
        l: l0,
        c: veil ? rng.range(0.02, 0.045) : rng.range(p.chromaRange[0], p.chromaRange[1]),
        h: h0,
      }),
    );
    const B = fitToGamut(
      lchToLab({
        l: l0,
        c: rng.range(p.chromaRange[0], p.chromaRange[1]),
        h: h0 + span,
      }),
    );
    const mid = mixLab(A, B, 0.5);
    const dl = (l1 - l0) * 0.7;
    const lift = (lab: Lab): Lab =>
      fitToGamut({ l: clamp(lab.l + dl, 0.14, 0.94), a: lab.a, b: lab.b });
    return [A, lift(mid), lift(mid), B];
  }

  // quad: hue arc runs along one diagonal, lightness along the other.
  const A = fitToGamut(
    lchToLab({
      l: l0,
      c: veil ? rng.range(0.02, 0.045) : rng.range(p.chromaRange[0], p.chromaRange[1]),
      h: h0,
    }),
  );
  const B = fitToGamut(
    lchToLab({ l: l0, c: rng.range(p.chromaRange[0], p.chromaRange[1]), h: h0 + span }),
  );
  const dH = span * 0.35 * (rng.bool() ? 1 : -1);
  const A2 = fitToGamut(
    lchToLab({ l: l1, c: rng.range(p.chromaRange[0], p.chromaRange[1]), h: h0 + dH }),
  );
  const B2 = fitToGamut(
    lchToLab({ l: l1, c: rng.range(p.chromaRange[0], p.chromaRange[1]), h: h0 + span - dH }),
  );
  return [A, A2, B2, B];
}

export function generateCornerField(
  rng: Rng,
  grid: GridSpec,
  p: FieldParams,
  mode: CornerMode,
): GeneratedField {
  const corners = sampleCornerColors(rng, p, mode);

  const raw: Lab[] = grid.cells.map(({ x, y }) => {
    const u = grid.cols === 1 ? 0.5 : x / (grid.cols - 1);
    const v = grid.rows === 1 ? 0.5 : y / (grid.rows - 1);
    return bilinearSample(corners, u, v);
  });

  const pairs = adjacentPairs(grid);
  const floor = p.minAdjacentDelta;
  const cap = p.maxAdjacentDelta;

  // The smoothness pipeline — one clean gamut fit → a whisper ramp that
  // unties iso-lines → Laplacian blur that erases every kink. Blur is linear,
  // so it commutes with scaling: build the smooth SHAPE first, then tune the
  // post-smooth field directly into the difficulty band. Tuning before the
  // blur would let the blur drag the contrast back below the floor.
  const shape = smoothField(
    applyMicroRamp(raw.map(fitToGamut), grid, rng),
    grid,
    2,
    0.3,
  );

  let cur = shape;
  for (let iter = 0; iter < 12; iter++) {
    const { mean } = adjacentStats(cur, pairs);
    if (mean >= floor * 0.99 && mean <= cap) break;
    const ratio = mean < floor ? (floor * 1.02) / mean : cap / Math.max(mean, 1e-9);
    cur = scaleAroundMean(cur, Math.max(0.8, Math.min(1.25, ratio)));
  }

  const tuned = adjacentStats(cur, pairs);
  if (tuned.mean < floor * 0.97) {
    throw new FieldTuneError(
      `could not raise mean adjacent contrast above ${floor.toFixed(4)} (got ${tuned.mean.toFixed(4)})`,
    );
  }

  // Light-touch distinctness floors keep parallel rows distinguishable and
  // every tile unique; caps keep any repair invisible.
  const resolved = ensureDistinct(
    cur,
    grid,
    Math.max(0.005, floor * 0.28),
    0.0015,
  );

  const stats = adjacentStats(resolved, pairs);
  const minPair = minPairwise(resolved);
  if (stats.min < 0.0042 || minPair < 0.0012) {
    throw new FieldTuneError("distinctness repair failed");
  }

  // Report corners from the FINAL field so callers (lock dots, previews)
  // always see the colors that actually rendered.
  const finalCorners: [Lab, Lab, Lab, Lab] = [
    resolved[0],
    resolved[grid.cols - 1],
    resolved[(grid.rows - 1) * grid.cols],
    resolved[grid.cells.length - 1],
  ];

  return {
    labs: resolved,
    corners: finalCorners,
    minAdjacent: stats.min,
    meanAdjacent: stats.mean,
    maxAdjacent: stats.max,
    minPairwise: minPair,
  };
}
