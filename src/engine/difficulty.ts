/**
 * The endless difficulty curve.
 *
 * Two dials, turned slowly and independently:
 *   • board size — a ladder of 17 rungs from 4×4 to 10×14 (portrait, like a
 *     phone), climbed over the first ~280 levels;
 *   • step — the ΔE_OK2 between neighboring tiles, from an obvious 0.115
 *     down to a whisper of ~0.04, never lower than 0.036 (below that,
 *     typical screens and eyes stop being able to tell neighbors apart).
 * Every tenth level is a breather (smaller, clearer), and each chapter opens
 * a notch gentler than it closes. Every chapter has its own color mood.
 * Corner locks are a player setting applied at play time, not part of the
 * puzzle.
 */

import type { Mood } from "./palettes";
import { CHAPTER_MOODS, OPEN_MOOD } from "./palettes";

export interface PuzzleParams {
  cols: number;
  rows: number;
  /** Target mean ΔE_OK2 between neighboring tiles. */
  step: number;
  /** Twist range (0 flat … 0.8 four distinct corners). */
  twist: [number, number];
  mood: Mood;
  /** How long the solved board is shown before the shuffle. */
  revealMs: number;
}

export const CHAPTER_SIZE = 25;

const CHAPTER_NAMES = [
  "DAWN",
  "EVENTIDE",
  "VERDIGRIS",
  "MULBERRY",
  "SOLSTICE",
  "GEODE",
  "TIDEPOOL",
  "SUMAC",
  "GLACIER",
  "LANTERN",
  "PLUMERIA",
  "OXIDE",
  "MEADOWLARK",
  "VESPER",
  "INDIGO",
  "SAFFRON",
  "MOSS",
  "CAMEO",
  "AURORA",
  "PETRICHOR",
  "SEAGLASS",
  "AMARYLLIS",
  "DUSK",
  "PRISM",
] as const;

function roman(n: number): string {
  const table: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let v = n;
  for (const [val, sym] of table) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

/** Zero-based chapter index. */
export function chapterOf(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / CHAPTER_SIZE);
}

export function chapterName(level: number): string {
  const c = chapterOf(level);
  const name = CHAPTER_NAMES[c % CHAPTER_NAMES.length];
  const cycle = Math.floor(c / CHAPTER_NAMES.length);
  return cycle === 0 ? name : `${name} ${roman(cycle + 1)}`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function chapterMood(level: number): Mood {
  return CHAPTER_MOODS[chapterOf(level) % CHAPTER_MOODS.length];
}

/** Board sizes in order of tile count. */
export const SIZE_LADDER: ReadonlyArray<readonly [number, number]> = [
  [4, 4],
  [4, 5],
  [5, 5],
  [5, 6],
  [5, 7],
  [6, 7],
  [6, 8],
  [7, 8],
  [7, 9],
  [7, 10],
  [8, 10],
  [8, 11],
  [9, 11],
  [9, 12],
  [9, 13],
  [10, 13],
  [10, 14],
];

/** The step can never go below this — the "still fair on any screen" floor. */
export const MIN_STEP = 0.036;

/**
 * Widest color span (ΔE_OK2, edge to edge) one board axis should cover. Two
 * such spans meet at every corner, and the screen's gamut is only so big —
 * so bigger boards take smaller steps (never below MIN_STEP, which the
 * largest boards are allowed to stretch a little past this span to keep).
 */
export const MAX_SPAN = 0.4;

export function maxStepFor(cols: number, rows: number): number {
  return Math.max(MIN_STEP, MAX_SPAN / Math.max(1, Math.max(cols, rows) - 1));
}

export function levelParams(level: number): PuzzleParams {
  const n = Math.max(1, Math.floor(level));
  const p = clamp((n - 1) / 280, 0, 1);
  const top = SIZE_LADDER.length - 1;

  const breather = n > 10 && n % 10 === 0;
  const opener = n > CHAPTER_SIZE && (n - 1) % CHAPTER_SIZE === 0;

  let rung = Math.round(top * Math.pow(p, 0.8) + 0.45 * Math.sin(n * 1.7));
  if (breather) rung -= 2;
  if (opener) rung -= 1;
  rung = clamp(rung, 0, top);
  const [cols, rows] = SIZE_LADDER[rung];

  // Past the curve, the whisper keeps tightening — very slowly — to the floor.
  const late = n > 281 ? clamp((n - 281) / 400, 0, 1) : 0;
  let step = lerp(0.105, 0.042, Math.pow(p, 0.85)) - 0.006 * late;
  step *= 1 + 0.07 * Math.sin(n * 0.9);
  if (breather) step *= 1.3;
  if (opener) step *= 1.12;
  // A board can only span so much color before it leaves the screen's gamut
  // (or turns to mud), so bigger boards necessarily take smaller steps.
  step = Math.max(MIN_STEP, Math.min(step, maxStepFor(cols, rows)));

  return {
    cols,
    rows,
    step,
    twist: [lerp(0, 0.3, p), lerp(0.25, 0.8, p)],
    mood: chapterMood(n),
    revealMs: Math.round(lerp(4200, 2400, p)),
  };
}

export type ZenSize = "small" | "medium" | "large" | "grand";
export type ZenSubtlety = "gentle" | "subtle" | "ethereal";

export interface ZenOptions {
  size?: ZenSize;
  subtlety?: ZenSubtlety;
}

export const ZEN_SIZES: Record<ZenSize, [number, number]> = {
  small: [5, 6],
  medium: [7, 9],
  large: [9, 12],
  grand: [10, 14],
};

export const ZEN_STEP: Record<ZenSubtlety, number> = {
  gentle: 0.085,
  subtle: 0.058,
  ethereal: 0.04,
};

export function zenParams(opts: ZenOptions = {}): PuzzleParams {
  const [cols, rows] = ZEN_SIZES[opts.size ?? "medium"];
  return {
    cols,
    rows,
    step: Math.min(ZEN_STEP[opts.subtlety ?? "subtle"], maxStepFor(cols, rows)),
    twist: [0.2, 0.7],
    mood: OPEN_MOOD,
    revealMs: 3000,
  };
}

/** The shared daily puzzle: a stable, moderate board for the date. */
export function todayParams(dateISO: string): PuzzleParams {
  const days = Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / 86400000);
  const level = 90 + (((days % 120) + 120) % 120);
  return { ...levelParams(level), mood: OPEN_MOOD, revealMs: 3200 };
}
