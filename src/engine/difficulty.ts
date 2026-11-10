/**
 * The endless difficulty curve.
 *
 * Levels climb from 4×4 to 10×14 over roughly the first 300 levels — with
 * breathing oscillation so no jump ever feels like a wall — while adjacent-tile
 * contrast (the perceptual difficulty dial) tightens gradually from clear to
 * whisper-subtle. Early boards flow along one diagonal; later boards give all
 * four corners their own voice. Corner locks are a player setting, applied at
 * play time, not part of the puzzle itself.
 */

import type { CornerMode, FieldParams } from "./field";

export interface PuzzleParams extends FieldParams {
  cols: number;
  rows: number;
  cornerMode: CornerMode;
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

export function levelParams(level: number): PuzzleParams {
  const t = clamp(level / 300, 0, 1);
  const prog = 1 - Math.pow(1 - t, 1.6);
  const breather = level > 8 && level % 10 === 0;

  const cols = clamp(Math.round(lerp(4, 10, prog) + Math.sin(level * 0.7) * 0.49), 4, 10);
  // Portrait boards ease in over time — the opening levels stay square.
  const aspect = 1.0 + 0.4 * prog * (0.5 + 0.5 * Math.sin(level * 0.13 + 1));
  const rows = clamp(Math.round(cols * aspect), cols, 14);

  // One clean flow while learning; four-way flows once the eye is trained.
  const cornerMode: CornerMode = level <= 40 ? "diagonal" : "quad";

  // Hue span oscillates for variety — narrow whisper chapters, wide sweep
  // chapters — independent of raw difficulty.
  const hueSpan = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(level * 0.05));

  // Perceptual difficulty: mean ΔEok between adjacent tiles. 0.042 reads as
  // an obvious teaching gradient; 0.0095 is a genuine whisper — but never so
  // tight that parallel rows become indistinguishable.
  let minAdjacentDelta =
    lerp(0.042, 0.0095, prog) * (1 + 0.12 * Math.sin(level * 0.37));
  if (breather) minAdjacentDelta *= 1.5;
  minAdjacentDelta = clamp(minAdjacentDelta, 0.009, 0.05);

  // Every fifth chapter is a "jewel" chapter: darker, richer colors.
  const jewel = chapterOf(level) % 5 === 4;
  const lightRange: [number, number] = jewel ? [0.3, 0.66] : [0.46, 0.82];
  const chromaRange: [number, number] = jewel ? [0.075, 0.16] : [0.035, 0.115];

  return {
    cols,
    rows,
    cornerMode,
    hueSpan,
    lightRange,
    chromaRange,
    minAdjacentDelta,
    maxAdjacentDelta: minAdjacentDelta * 2.0 + 0.008,
    revealMs: Math.round(lerp(4200, 2000, prog)),
  };
}

export type ZenSize = "small" | "medium" | "large" | "grand";
export type ZenSubtlety = "gentle" | "subtle" | "ethereal";

export interface ZenOptions {
  size?: ZenSize;
  subtlety?: ZenSubtlety;
}

const ZEN_SIZES: Record<ZenSize, [number, number]> = {
  small: [5, 6],
  medium: [7, 9],
  large: [9, 12],
  grand: [10, 14],
};

const ZEN_SUBTLETY: Record<ZenSubtlety, number> = {
  gentle: 0.028,
  subtle: 0.014,
  ethereal: 0.009,
};

export function zenParams(opts: ZenOptions = {}): PuzzleParams {
  const [cols, rows] = ZEN_SIZES[opts.size ?? "medium"];
  const minAdjacentDelta = ZEN_SUBTLETY[opts.subtlety ?? "subtle"];
  return {
    cols,
    rows,
    cornerMode: opts.size === "small" ? "diagonal" : "quad",
    hueSpan: 0.28,
    lightRange: [0.46, 0.82],
    chromaRange: [0.035, 0.115],
    minAdjacentDelta,
    maxAdjacentDelta: minAdjacentDelta * 2.0 + 0.008,
    revealMs: 3000,
  };
}

/** The shared daily puzzle: a stable, moderate-to-spicy board for the date. */
export function todayParams(dateISO: string): PuzzleParams {
  const days = Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / 86400000);
  const level = 90 + (days % 120);
  return { ...levelParams(level), revealMs: 3200 };
}
