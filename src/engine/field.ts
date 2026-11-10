/**
 * Gradient-field generation — the soul of the game.
 *
 * A board is a smooth 2D color surface sampled at tile centers:
 *
 *     f(s, t) = center + s·U + t·V + 4·s·t·W        s, t ∈ [-½, ½]
 *
 * U and V are two ORTHOGONAL flow directions (one leaning on hue, one on
 * lightness), W is an optional "twist" perpendicular to both that gives the
 * four corners their own voices (two opposite corners bloom in chroma, the
 * other two soften). This is exactly a bilinear corner blend — the I Love
 * Hue look — but built from the inside out, so we can promise things a
 * corner picker can't:
 *
 *  1. Even steps. Along any row or column the step is a constant vector, so
 *     there are no jumps anywhere. Because W ⟂ U and W ⟂ V, the twist can
 *     never shrink a step, only bend the surface.
 *  2. No twins. Two tiles k columns and j rows apart differ by at least
 *     |k·u + j·v| — and u ⟂ v — so every tile is at least one full step
 *     from every other tile. The old generator mirrored two corners, which
 *     made (x, y) and (y, x) the same color; that is now impossible.
 *  3. No clipping. The whole surface is checked against the sRGB gamut
 *     BEFORE it is accepted; colors are never clamped, so nothing kinks.
 *
 * All distances are ΔE_OK2 (see color.ts), measured in "P-space":
 * (L, 2a, 2b). A step of 0.04 is a whisper; 0.11 is a teaching gradient.
 */

import { Lab, deltaP, inGamut, labToLch } from "./color";
import type { Mood } from "./palettes";
import { Rng } from "./rng";

export type Vec3 = [number, number, number];

export interface FieldSpec {
  cols: number;
  rows: number;
  /** Target mean ΔE_OK2 between 4-adjacent tiles. */
  step: number;
  /** Twist range, 0 (flat, two-axis sweep) … 0.8 (four distinct corners). */
  twist: [number, number];
  mood: Mood;
}

export interface GeneratedField {
  labs: Lab[];
  /** TL, TR, BL, BR. */
  corners: [Lab, Lab, Lab, Lab];
  /** How many attempts the search used (diagnostics). */
  attempts: number;
}

// ---------------------------------------------------------------- vectors

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const labToP = (c: Lab): Vec3 => [c.l, 2 * c.a, 2 * c.b];
export const pToLab = (p: Vec3): Lab => ({ l: p[0], a: p[1] / 2, b: p[2] / 2 });

// ---------------------------------------------------------------- sampling

/** Grid coordinate → centered parameter in [-½, ½]. */
const centered = (i: number, n: number) => (n === 1 ? 0 : i / (n - 1) - 0.5);

function sampleSurface(
  c: Vec3,
  U: Vec3,
  V: Vec3,
  W: Vec3,
  cols: number,
  rows: number,
): Vec3[] {
  const out: Vec3[] = [];
  for (let y = 0; y < rows; y++) {
    const t = centered(y, rows);
    for (let x = 0; x < cols; x++) {
      const s = centered(x, cols);
      out.push(add(add(add(c, scale(U, s)), scale(V, t)), scale(W, 4 * s * t)));
    }
  }
  return out;
}

/** Bilinear sample of a corner field (TL, TR, BL, BR) at normalized u, v. */
export function bilinearSample(
  corners: readonly [Lab, Lab, Lab, Lab],
  u: number,
  v: number,
): Lab {
  const [tl, tr, bl, br] = corners;
  const w00 = (1 - u) * (1 - v);
  const w10 = u * (1 - v);
  const w01 = (1 - u) * v;
  const w11 = u * v;
  return {
    l: tl.l * w00 + tr.l * w10 + bl.l * w01 + br.l * w11,
    a: tl.a * w00 + tr.a * w10 + bl.a * w01 + br.a * w11,
    b: tl.b * w00 + tr.b * w10 + bl.b * w01 + br.b * w11,
  };
}

/** A whole board from four corner colors (Studio "corners" gradients). */
export function bilinearField(
  corners: readonly [Lab, Lab, Lab, Lab],
  cols: number,
  rows: number,
): Lab[] {
  const out: Lab[] = [];
  for (let y = 0; y < rows; y++) {
    const v = rows === 1 ? 0.5 : y / (rows - 1);
    for (let x = 0; x < cols; x++) {
      const u = cols === 1 ? 0.5 : x / (cols - 1);
      out.push(bilinearSample(corners, u, v));
    }
  }
  return out;
}

/** Catmull-Rom weight helper (C¹-smooth, passes through samples). */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Resample a stored color grid to any board size with bicubic (Catmull-Rom)
 * interpolation in OKLab. The old nearest-neighbor resample skipped source
 * columns unevenly (12 → 10 lands on 0,1,2,4,5,6,7,9…), which is exactly
 * what made Studio boards show visible "jumps" between some columns.
 */
export function resampleField(
  labs: Lab[],
  fromCols: number,
  fromRows: number,
  toCols: number,
  toRows: number,
): Lab[] {
  if (labs.length !== fromCols * fromRows) {
    throw new Error(`expected ${fromCols * fromRows} colors, got ${labs.length}`);
  }
  const at = (x: number, y: number) =>
    labs[
      Math.min(fromRows - 1, Math.max(0, y)) * fromCols + Math.min(fromCols - 1, Math.max(0, x))
    ];
  const out: Lab[] = [];
  for (let y = 0; y < toRows; y++) {
    const fy = toRows === 1 ? (fromRows - 1) / 2 : (y / (toRows - 1)) * (fromRows - 1);
    const y1 = Math.min(fromRows - 2, Math.floor(fy));
    const ty = fromRows === 1 ? 0 : fy - Math.max(0, y1);
    for (let x = 0; x < toCols; x++) {
      const fx = toCols === 1 ? (fromCols - 1) / 2 : (x / (toCols - 1)) * (fromCols - 1);
      const x1 = Math.min(fromCols - 2, Math.floor(fx));
      const tx = fromCols === 1 ? 0 : fx - Math.max(0, x1);
      const ch = (k: "l" | "a" | "b") => {
        const row = (yy: number) =>
          catmull(at(x1 - 1, yy)[k], at(x1, yy)[k], at(x1 + 1, yy)[k], at(x1 + 2, yy)[k], tx);
        return catmull(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
      };
      const l = ch("l");
      out.push({ l: Math.min(1, Math.max(0, l)), a: ch("a"), b: ch("b") });
    }
  }
  return out;
}

// ---------------------------------------------------------------- quality

export interface FieldQuality {
  /** Mean ΔE_OK2 between 4-adjacent tiles. */
  meanStep: number;
  minStep: number;
  maxStep: number;
  /** Worst max/min step ratio along any single row or column (1 = perfect). */
  evenness: number;
  /** Worst change between consecutive steps on a line, ÷ mean step (jumps). */
  kink: number;
  /**
   * Closest pair of NON-adjacent tiles, ÷ mean step. Below ~0.6 two tiles
   * in different places look interchangeable — the board is ambiguous.
   */
  twin: number;
  /** Same, absolute ΔE_OK2. */
  twinAbs: number;
}

export function fieldQuality(labs: Lab[], cols: number, rows: number): FieldQuality {
  const at = (x: number, y: number) => labs[y * cols + x];
  const lines: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const s: number[] = [];
    for (let x = 0; x < cols - 1; x++) s.push(deltaP(at(x, y), at(x + 1, y)));
    if (s.length) lines.push(s);
  }
  for (let x = 0; x < cols; x++) {
    const s: number[] = [];
    for (let y = 0; y < rows - 1; y++) s.push(deltaP(at(x, y), at(x, y + 1)));
    if (s.length) lines.push(s);
  }
  let sum = 0;
  let count = 0;
  let minStep = Infinity;
  let maxStep = 0;
  for (const s of lines)
    for (const d of s) {
      sum += d;
      count++;
      minStep = Math.min(minStep, d);
      maxStep = Math.max(maxStep, d);
    }
  const meanStep = count ? sum / count : 0;
  let evenness = 1;
  let kink = 0;
  for (const s of lines) {
    evenness = Math.max(evenness, Math.max(...s) / Math.max(1e-9, Math.min(...s)));
    for (let k = 0; k < s.length - 1; k++)
      kink = Math.max(kink, Math.abs(s[k + 1] - s[k]) / Math.max(meanStep, 1e-9));
  }
  let twinAbs = Infinity;
  for (let i = 0; i < labs.length; i++) {
    const xi = i % cols;
    const yi = (i - xi) / cols;
    for (let j = i + 1; j < labs.length; j++) {
      const xj = j % cols;
      const yj = (j - xj) / cols;
      if (Math.abs(xi - xj) + Math.abs(yi - yj) <= 1) continue;
      const d = deltaP(labs[i], labs[j]);
      if (d < twinAbs) twinAbs = d;
    }
  }
  if (!Number.isFinite(twinAbs)) twinAbs = meanStep;
  return {
    meanStep,
    minStep: Number.isFinite(minStep) ? minStep : 0,
    maxStep,
    evenness,
    kink,
    twin: twinAbs / Math.max(meanStep, 1e-9),
    twinAbs,
  };
}

// ---------------------------------------------------------------- generator

const LIGHT_MIN = 0.28;
const LIGHT_MAX = 0.97;
const CHROMA_MAX = 0.2;
const GAMUT_MARGIN = 0;

/**
 * Dark yellows, oranges and olives read as mud and brown, not color — the
 * one region of color space the original never visited. Light yellows and
 * dark near-neutrals are fine.
 */
function muddy(lab: Lab, c: number): boolean {
  if (c < 0.03) return false; // a true gray is a gray, not mud
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  // Olive/khaki needs real lightness to read as yellow; orange only turns to
  // brown when it gets properly dark (rust and terracotta are fine).
  if (h >= 75 && h <= 115) return lab.l < 0.64;
  if (h >= 55 && h < 75) return lab.l < 0.57;
  if (h >= 40 && h < 55) return lab.l < 0.46;
  return false;
}

/** Smallest arc (degrees) covering every hue in the list. */
function hueRange(hues: number[]): number {
  if (hues.length < 2) return 0;
  const sorted = [...hues].sort((a, b) => a - b);
  let gap = 360 - sorted[sorted.length - 1] + sorted[0];
  for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, sorted[i] - sorted[i - 1]);
  return 360 - gap;
}

function acceptable(points: Vec3[], mood: Mood, loose: boolean, hueAllowance: number): Lab[] | null {
  const labs: Lab[] = new Array(points.length);
  let chromaSum = 0;
  const hues: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const lab = pToLab(points[i]);
    if (lab.l < LIGHT_MIN || lab.l > LIGHT_MAX) return null;
    const c = Math.hypot(lab.a, lab.b);
    if (c > CHROMA_MAX) return null;
    if (muddy(lab, c)) return null;
    if (!inGamut(lab, GAMUT_MARGIN)) return null;
    if (c >= 0.03) {
      let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
      if (h < 0) h += 360;
      hues.push(h);
    }
    chromaSum += c;
    labs[i] = lab;
  }
  if (chromaSum / points.length < mood.minMeanChroma * (loose ? 0.5 : 1)) return null;
  if (hueRange(hues) > hueAllowance * (loose ? 1.3 : 1)) return null;
  return labs;
}

const MAX_ATTEMPTS = 1000;

function meanStep(points: Vec3[], cols: number, rows: number): number {
  let sum = 0;
  let count = 0;
  const d = (i: number, j: number) => {
    const a = points[i];
    const b = points[j];
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  };
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (x < cols - 1) {
        sum += d(i, i + 1);
        count++;
      }
      if (y < rows - 1) {
        sum += d(i, i + cols);
        count++;
      }
    }
  return count ? sum / count : 0;
}

/** Lightness slides tried for every candidate surface (shift never changes a step). */
const NUDGES = [0, 0.05, -0.05, 0.1, -0.1];

/**
 * Fit a candidate surface into the mood's lightness band and the gamut by
 * sliding its lightness. Returns the accepted colors or null.
 */
function fitSurface(
  base: Vec3[],
  mood: Mood,
  band: [number, number],
  loose: boolean,
  hueAllowance: number,
): Lab[] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of base) {
    lo = Math.min(lo, q[0]);
    hi = Math.max(hi, q[0]);
  }
  const [fLo, fHi] = band;
  if (hi - lo > fHi - fLo) return null;
  const minShift = hi > fHi ? fHi - hi : lo < fLo ? fLo - lo : 0;
  for (const nudge of NUDGES) {
    const shift = minShift + nudge;
    if (lo + shift < fLo - 1e-9 || hi + shift > fHi + 1e-9) continue;
    const points = shift === 0 ? base : base.map((q): Vec3 => [q[0] + shift, q[1], q[2]]);
    const labs = acceptable(points, mood, loose, hueAllowance);
    if (labs) return labs;
  }
  return null;
}

interface Center {
  L: number;
  C: number;
  /** Hue in radians. */
  h: number;
}

/**
 * "Arc" boards: the hue axis is a true hue ARC at constant chroma (a ring
 * in OKLab, so every step along it is identical), the other axis is a
 * straight lightness/chroma ramp. Rows stay vivid end to end instead of
 * dipping toward gray — sunsets, tide pools, berry fields.
 */
function arcSurface(
  rng: Rng,
  cols: number,
  rows: number,
  step: number,
  ctr: Center,
  hueAllowance: number,
  fit: (pts: Vec3[]) => Lab[] | null,
): Lab[] | null {
  // Draw every random choice up front so the chroma retries below stay
  // deterministic and comparable.
  // The hue arc usually takes the board's long side — lightness has far
  // less room to travel than hue does.
  const hueAcross = rng.bool(cols >= rows ? 0.75 : 0.25);
  const nH = hueAcross ? cols : rows;
  const nV = hueAcross ? rows : cols;
  const dCfrac = rng.range(0, 1) * (rng.bool(0.8) ? -1 : 1); // usually: lighter → softer
  const dLsign = rng.bool() ? 1 : -1;
  const hueDir = rng.bool() ? 1 : -1;
  const leanFrac = rng.range(-0.15, 0.15);

  // Quieter chroma = wider hue fan for the same step; try a few.
  for (const chromaK of [1, 0.8, 0.64, 0.5]) {
    const C0 = ctr.C * chromaK;
    const T = step * Math.max(1, nV - 1); // ramp length (P units)
    // Chroma may vary along the ramp, but only so much — row steps scale
    // with chroma, so this bounds how much harder the pale end feels (≤1.35×).
    const dC = Math.min(0.3 * C0, T / 2) * dCfrac;
    const dL = Math.sqrt(Math.max(0, T * T - 4 * dC * dC)) * dLsign;
    const totalHue = (step * Math.max(1, nH - 1)) / (2 * C0); // arc length / radius
    if ((totalHue * 180) / Math.PI > Math.min(hueAllowance, 200)) return null;
    const lean = leanFrac * step * Math.max(1, nH - 1);

    const out: Vec3[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const sH = centered(hueAcross ? x : y, nH);
        const sV = centered(hueAcross ? y : x, nV);
        const h = ctr.h + hueDir * totalHue * sH;
        const C = C0 + dC * sV;
        const L = ctr.L + dL * sV + lean * sH;
        out.push([L, 2 * C * Math.cos(h), 2 * C * Math.sin(h)]);
      }
    }
    // True mean (chords vs arcs, the lean): scale around the center — keeps
    // the shape, makes the step exact.
    const measured = meanStep(out, cols, rows);
    if (measured < 1e-9) return null;
    const k = step / measured;
    const pts = Math.abs(k - 1) < 1e-3 ? out : arcScaled({ ...ctr, C: C0 }, out, k);
    const labs = fit(pts);
    if (labs) return labs;
  }
  return null;
}

function arcScaled(ctr: Center, pts: Vec3[], k: number): Vec3[] {
  const c: Vec3 = [ctr.L, 2 * ctr.C * Math.cos(ctr.h), 2 * ctr.C * Math.sin(ctr.h)];
  return pts.map((q) => add(c, scale(add(q, scale(c, -1)), k)));
}

/**
 * "Sweep" boards: two straight, orthogonal flows plus an optional twist —
 * the classic bilinear corner blend. Hue sweeps that pass near gray give
 * the misty, gray-lavender middles of the original's later packs.
 */
function sweepSurface(
  rng: Rng,
  cols: number,
  rows: number,
  step: number,
  twist: [number, number],
  ctr: Center,
  bandWidth: number,
): Vec3[] {
  const hueAcrossPre = rng.bool();
  const eL: Vec3 = [1, 0, 0];
  const eH: Vec3 = [0, -Math.sin(ctr.h), Math.cos(ctr.h)];
  const eC: Vec3 = [0, Math.cos(ctr.h), Math.sin(ctr.h)];
  const center: Vec3 = [ctr.L, 2 * ctr.C * Math.cos(ctr.h), 2 * ctr.C * Math.sin(ctr.h)];

  // Axis 1 leans on hue, with a little lightness/chroma mixed in.
  const wH = rng.range(0.8, 0.98);
  const rest = Math.sqrt(1 - wH * wH);
  const psi = rng.range(0, Math.PI * 2);
  const dHue = norm(
    add(scale(eH, wH), add(scale(eL, rest * Math.cos(psi)), scale(eC, rest * Math.sin(psi)))),
  );
  // Axis 2 leans on lightness, exactly orthogonal to axis 1, tilted so
  // lighter usually means softer.
  const lPerp = norm(add(eL, scale(dHue, -dot(eL, dHue))));
  const third = cross(dHue, lPerp);
  const towardMist = dot(third, eC) < 0 ? 1 : -1;
  // Narrow lightness bands (the yellow moods) can't hold a long pure-L ramp:
  // tilt it further toward chroma (pale gold ↔ deep saffron) until it fits.
  const ramp = step * Math.max(1, (hueAcrossPre ? rows : cols) - 1);
  const thetaMin = Math.min(1.15, Math.acos(Math.min(1, (0.85 * bandWidth) / Math.max(ramp, 1e-9))));
  const theta =
    rng.range(Math.max(0.12, thetaMin), Math.max(0.6, thetaMin + 0.25)) *
    (rng.bool(0.8) ? towardMist : -towardMist);
  const dLight = norm(add(scale(lPerp, Math.cos(theta)), scale(third, Math.sin(theta))));
  const normal = norm(cross(dHue, dLight));

  const hueAcross = hueAcrossPre;
  const dX = scale(hueAcross ? dHue : dLight, rng.bool() ? 1 : -1);
  const dY = scale(hueAcross ? dLight : dHue, rng.bool() ? 1 : -1);

  let U = scale(dX, step * Math.max(1, cols - 1));
  let V = scale(dY, step * Math.max(1, rows - 1));
  const tau = rng.range(twist[0], twist[1]);
  let W = scale(normal, 0.5 * tau * Math.min(len(U), len(V)) * (rng.bool() ? 1 : -1));

  // The twist lengthens steps a touch away from the middle; rescale so the
  // true mean step is exactly the target.
  const measured = meanStep(sampleSurface(center, U, V, W, cols, rows), cols, rows);
  if (measured > 1e-9) {
    const k = step / measured;
    U = scale(U, k);
    V = scale(V, k);
    W = scale(W, k);
  }
  return sampleSurface(center, U, V, W, cols, rows);
}

/**
 * Search (deterministically, via `rng`) for a surface that honors the mood,
 * hits the step target exactly, and fits inside sRGB. Never throws: if the
 * mood is too tight for a huge board, later attempts loosen the mood first
 * and only then — as a last resort — the step.
 */
export function generateField(rng: Rng, spec: FieldSpec): GeneratedField {
  const { cols, rows, mood } = spec;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const loosen = attempt < 350 ? 0 : attempt < 750 ? 1 : 2;
    const loose = loosen !== 0;
    const step = spec.step * (loosen === 2 ? 0.9 : 1);
    const band: [number, number] = loose ? [LIGHT_MIN, LIGHT_MAX] : mood.field;
    // Big boards need room: a mood's hue window widens with the board.
    const longest = Math.max(cols, rows);
    const hueAllowance = mood.maxHueRange * (1 + 0.4 * Math.min(1, Math.max(0, (longest - 5) / 9)));

    const [h0, h1] = mood.hue;
    const ctr: Center = {
      h: ((loose ? rng.range(h0 - 25, h1 + 25) : rng.range(h0, h1)) / 180) * Math.PI,
      L: loose ? rng.range(0.55, 0.78) : rng.range(mood.light[0], mood.light[1]),
      C: rng.range(mood.chroma[0], mood.chroma[1]) * (loose ? 0.8 : 1),
    };

    let labs: Lab[] | null = null;
    if (rng.bool(0.55)) {
      labs = arcSurface(rng, cols, rows, step, ctr, hueAllowance, (pts) =>
        fitSurface(pts, mood, band, loose, hueAllowance),
      );
    } else {
      // Sweeps: try the sampled center, then quieter ones — a sweep through
      // a softer middle keeps big boards inside the gamut.
      for (const quiet of [1, 0.6, 0.3]) {
        const pts = sweepSurface(rng, cols, rows, step, spec.twist, { ...ctr, C: ctr.C * quiet }, band[1] - band[0]);
        labs = fitSurface(pts, mood, band, loose, hueAllowance);
        if (labs) break;
      }
    }
    if (!labs) continue;

    return {
      labs,
      corners: [labs[0], labs[cols - 1], labs[(rows - 1) * cols], labs[labs.length - 1]],
      attempts: attempt + 1,
    };
  }

  // Unreachable in practice (tests sweep the whole curve): a safe, quiet
  // two-axis board so the game can never crash on a seed.
  const fallback = sampleSurface(
    [0.68, 0.06, 0.04],
    [0, 0, 0.032 * Math.max(1, cols - 1)],
    [0.032 * Math.max(1, rows - 1), 0, 0],
    [0, 0, 0],
    cols,
    rows,
  ).map(pToLab);
  return {
    labs: fallback,
    corners: [
      fallback[0],
      fallback[cols - 1],
      fallback[(rows - 1) * cols],
      fallback[fallback.length - 1],
    ],
    attempts: MAX_ATTEMPTS,
  };
}

/** Average chroma of a field — used by the Studio's readability notes. */
export function meanChroma(labs: Lab[]): number {
  return labs.reduce((s, c) => s + labToLch(c).c, 0) / Math.max(1, labs.length);
}
