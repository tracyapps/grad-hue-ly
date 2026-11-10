/**
 * Puzzle assembly: field → colors, locks → anchors, shuffle → starting board.
 *
 * Everything is a pure function of (params, seed). Two devices given the same
 * seed produce byte-identical puzzles, which is what lets sync carry nothing
 * but seeds and counters.
 */

import { Rng, hashSeed } from "./rng";
import { makeRect } from "./grid";
import { generateField, FieldTuneError } from "./field";
import { PuzzleParams, zenParams, levelParams, todayParams, ZenOptions } from "./difficulty";
import { Lab, labToHex } from "./color";
import { shuffledPlacement } from "./shuffle";

export interface Puzzle {
  cols: number;
  rows: number;
  /** Hex color of tile i (tile i belongs at cell i when solved). */
  colors: string[];
  /** cell → tile currently sitting there. */
  placement: number[];
  /** Locked cell indices — tiles that never move. */
  locked: number[];
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

/** Corner cells in lock priority order. */
function cornerLocks(cols: number, rows: number, count: number): number[] {
  if (count <= 0) return [];
  const corners = [
    0,
    cols * rows - 1,
    cols - 1,
    (rows - 1) * cols,
  ];
  return [...new Set(corners)].slice(0, Math.min(4, count));
}

export function generatePuzzle(params: PuzzleParams, seed: number): Puzzle {
  const grid = makeRect(params.cols, params.rows);
  const rng = new Rng(seed);
  const locked = cornerLocks(params.cols, params.rows, params.locks);

  // Field generation retries with a slightly relaxed contrast floor; retries
  // consume the same rng stream, so the whole search stays deterministic.
  let labs: Lab[] | null = null;
  let used = params;
  for (let attempt = 0; attempt < 8; attempt++) {
    const p: PuzzleParams =
      attempt === 0
        ? params
        : {
            ...params,
            minAdjacentDelta: params.minAdjacentDelta * Math.pow(0.93, attempt),
          };
    try {
      labs = generateField(rng, grid, p).labs;
      used = p;
      break;
    } catch (e) {
      if (!(e instanceof FieldTuneError)) throw e;
    }
  }
  if (!labs) {
    throw new Error(`field generation failed for seed ${seed}`);
  }

  const colors = labs.map(labToHex);
  const placement = shuffledPlacement(rng, grid.cells.length, new Set(locked));

  return {
    cols: params.cols,
    rows: params.rows,
    colors,
    placement,
    locked,
    params: used,
    seed,
  };
}

export function generateLevel(level: number, worldSeed: number = DEFAULT_WORLD_SEED): Puzzle {
  return generatePuzzle(levelParams(level), levelSeed(level, worldSeed));
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
