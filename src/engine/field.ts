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
import { GridSpec, adjacentPairs } from "./grid";

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
 * Exported because the Studio's image-sampled boards need the same promise.
 */
export function ensureDistinct(
  labs: Lab[],
  grid: GridSpec,
  adjacentGap = 0.0042,
  uniqueGap = 0.003,
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

  const labs: Lab[] = grid.cells.map(({ x, y }) => {
    const u = grid.cols === 1 ? 0.5 : x / (grid.cols - 1);
    const v = grid.rows === 1 ? 0.5 : y / (grid.rows - 1);
    return bilinearSample(corners, u, v);
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
  const resolved = ensureDistinct(
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
