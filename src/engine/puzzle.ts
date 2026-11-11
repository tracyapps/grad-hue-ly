/**
 * Puzzle assembly: corner field → colors, full shuffle → starting board.
 *
 * Everything is a pure function of (params, seed). Two devices given the same
 * seed produce byte-identical puzzles, which is what lets sync carry nothing
 * but seeds and counters.
 *
 * Corner locks are a player setting, not baked into the puzzle: the engine
 * always shuffles every tile, and callers apply `applyCornerLocks` at play
 * time when the assist is on. That keeps a board identical whether the
 * helper is enabled or not.
 */

import { Rng, hashSeed } from "./rng";
import { generateField } from "./field";
import {
  PuzzleParams,
  zenParams,
  levelParams,
  levelParamsAt,
  endlessParams,
  todayParams,
  ZenOptions,
  type ZenSubtlety,
} from "./difficulty";
import { Lab, hexToLab } from "./color";
import { shuffledPlacement } from "./shuffle";
import { quantizeField } from "./quantize";

export interface Puzzle {
  cols: number;
  rows: number;
  /** Hex color of tile i (tile i belongs at cell i when solved). */
  colors: string[];
  /** cell → tile currently sitting there (fully shuffled, no locks). */
  placement: number[];
  params: PuzzleParams;
  seed: number;
}

/** Fixed default so guests (and tests) share one deterministic world. */
export const DEFAULT_WORLD_SEED = 20251109;

export function levelSeed(level: number, worldSeed: number = DEFAULT_WORLD_SEED): number {
  return hashSeed("level", level, worldSeed);
}

export function todaySeed(dateISO: string, worldSeed: number = DEFAULT_WORLD_SEED): number {
  return hashSeed("today", dateISO, worldSeed);
}

export function zenSeed(nonce: number, worldSeed: number = DEFAULT_WORLD_SEED): number {
  return hashSeed("zen", nonce, worldSeed);
}

/** The four corner cell indices. */
export function cornerCells(cols: number, rows: number): [number, number, number, number] {
  return [0, cols - 1, (rows - 1) * cols, cols * rows - 1];
}

/**
 * Place the four corner tiles into their solved cells (assists that trade
 * away no difficulty of the interior). Pure: returns a new placement.
 */
export function applyCornerLocks(placement: number[], cols: number, rows: number): number[] {
  const next = placement.slice();
  for (const corner of cornerCells(cols, rows)) {
    const at = next.indexOf(corner);
    if (at !== corner) {
      next[at] = next[corner];
      next[corner] = corner;
    }
  }
  return next;
}

export function generatePuzzle(params: PuzzleParams, seed: number): Puzzle {
  const rng = new Rng(seed);
  const field = generateField(rng, {
    cols: params.cols,
    rows: params.rows,
    step: params.step,
    twist: params.twist,
    mood: params.mood,
  });
  const colors = quantizeField(field.labs, params.cols, params.rows);
  const placement = shuffledPlacement(rng, colors.length, new Set());
  return { cols: params.cols, rows: params.rows, colors, placement, params, seed };
}

/**
 * Build a puzzle from an explicit solved OKLab field (Studio boards: corner
 * blends and resampled images). The field is quantized faithfully — no
 * smoothing, no nudging — so what you designed is what you play.
 */
export function puzzleFromField(
  labs: Lab[],
  cols: number,
  rows: number,
  seed: number,
  revealMs = 3200,
): Puzzle {
  if (labs.length !== cols * rows) {
    throw new Error(`expected ${cols * rows} colors, got ${labs.length}`);
  }
  const colors = quantizeField(labs, cols, rows);
  const rng = new Rng(seed);
  const placement = shuffledPlacement(rng, colors.length, new Set());
  return {
    cols,
    rows,
    colors,
    placement,
    params: { ...zenParams({ size: "medium" }), cols, rows, revealMs },
    seed,
  };
}

/** Convenience: a puzzle from solved hex colors. */
export function puzzleFromColors(
  colors: string[],
  cols: number,
  rows: number,
  seed: number,
): Puzzle {
  return puzzleFromField(colors.map(hexToLab), cols, rows, seed);
}

export function generateLevel(
  level: number,
  worldSeed: number = DEFAULT_WORLD_SEED,
  size?: { cols: number; rows: number },
): Puzzle {
  const params = size ? levelParamsAt(level, size.cols, size.rows) : levelParams(level);
  return generatePuzzle(params, levelSeed(level, worldSeed));
}

export function endlessSeed(nonce: number, worldSeed: number = DEFAULT_WORLD_SEED): number {
  return hashSeed("endless", nonce, worldSeed);
}

/** An endless board: any size, any subtlety; the nonce also picks the mood. */
export function generateEndless(
  nonce: number,
  cols: number,
  rows: number,
  subtlety: ZenSubtlety,
  worldSeed: number = DEFAULT_WORLD_SEED,
): Puzzle {
  const seed = endlessSeed(nonce, worldSeed);
  return generatePuzzle(endlessParams(cols, rows, subtlety, seed % 9973), seed);
}

export function generateToday(dateISO: string, worldSeed: number = DEFAULT_WORLD_SEED): Puzzle {
  return generatePuzzle(todayParams(dateISO), todaySeed(dateISO, worldSeed));
}

export function generateZen(
  nonce: number,
  opts: ZenOptions = {},
  worldSeed: number = DEFAULT_WORLD_SEED,
): Puzzle {
  return generatePuzzle(zenParams(opts), zenSeed(nonce, worldSeed));
}

export function isSolved(placement: number[]): boolean {
  for (let i = 0; i < placement.length; i++) if (placement[i] !== i) return false;
  return true;
}

/** Pure swap of the tiles at two cells. */
export function applySwap(placement: number[], a: number, b: number): number[] {
  const next = placement.slice();
  const t = next[a];
  next[a] = next[b];
  next[b] = t;
  return next;
}
