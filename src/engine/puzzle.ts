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
import { makeRect } from "./grid";
import { generateCornerField, ensureDistinct, smoothField, FieldTuneError } from "./field";
import { PuzzleParams, zenParams, levelParams, todayParams, ZenOptions } from "./difficulty";
import { Lab, hexToLab } from "./color";
import { shuffledPlacement } from "./shuffle";
import { finalizeColors } from "./quantize";

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
  const grid = makeRect(params.cols, params.rows);
  const rng = new Rng(seed);

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
      labs = generateCornerField(rng, grid, p, p.cornerMode).labs;
      used = p;
      break;
    } catch (e) {
      if (!(e instanceof FieldTuneError)) throw e;
    }
  }
  if (!labs) {
    throw new Error(`field generation failed for seed ${seed}`);
  }

  const colors = finalizeColors(labs, grid, { meanFloor: used.minAdjacentDelta });
  const placement = shuffledPlacement(rng, grid.cells.length, new Set());

  return { cols: params.cols, rows: params.rows, colors, placement, params: used, seed };
}

/**
 * Build a puzzle from an explicit solved color set (the Studio's image- and
 * corner-crafted boards). Colors are repaired for distinctness so the board
 * is always unambiguously solvable.
 */
export function puzzleFromColors(
  colors: string[],
  cols: number,
  rows: number,
  seed: number,
): Puzzle {
  if (colors.length !== cols * rows) {
    throw new Error(`expected ${cols * rows} colors, got ${colors.length}`);
  }
  const grid = makeRect(cols, rows);
  // A light smoothing before finalization so image sampling noise and JPEG
  // artifacts never become visible steps; artwork contrast is preserved.
  const smoothed = smoothField(colors.map(hexToLab), grid, 1, 0.2);
  const distinct = ensureDistinct(smoothed, grid);
  const fixed = finalizeColors(distinct, grid, { adjacentFloor: 0.0055 });
  const rng = new Rng(seed);
  const placement = shuffledPlacement(rng, fixed.length, new Set());
  const mode = colors.length > 60 ? "quad" : "diagonal";
  return {
    cols,
    rows,
    colors: fixed,
    placement,
    params: {
      ...zenParams({ size: "medium" }),
      cols,
      rows,
      cornerMode: mode,
      revealMs: 3200,
    },
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

/**
 * Nearest-neighbor resample of a solved color grid at a new size — how the
 * Studio serves one canonical gradient at every difficulty.
 */
export function resampleColors(
  colors: string[],
  fromCols: number,
  fromRows: number,
  toCols: number,
  toRows: number,
): string[] {
  if (colors.length !== fromCols * fromRows) {
    throw new Error(`expected ${fromCols * fromRows} colors, got ${colors.length}`);
  }
  const out: string[] = [];
  for (let y = 0; y < toRows; y++) {
    const sy = Math.min(
      fromRows - 1,
      Math.round((y / Math.max(1, toRows - 1)) * (fromRows - 1)),
    );
    for (let x = 0; x < toCols; x++) {
      const sx = Math.min(
        fromCols - 1,
        Math.round((x / Math.max(1, toCols - 1)) * (fromCols - 1)),
      );
      out.push(colors[sy * fromCols + sx]);
    }
  }
  return out;
}

/** Pure swap of the tiles at two cells. */
export function applySwap(placement: number[], a: number, b: number): number[] {
  const next = placement.slice();
  const t = next[a];
  next[a] = next[b];
  next[b] = t;
  return next;
}
