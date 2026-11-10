/**
 * Shuffling with dignity: never start near-solved, never move locked tiles.
 *
 * placement[cell] = tile sitting there. Tile i belongs at cell i, so the
 * puzzle is solved when placement is the identity. Locked cells are skipped
 * entirely — they are the player's reference anchors.
 */

import { Rng } from "./rng";

function fixedPoints(placement: number[], cells: number[]): number {
  let n = 0;
  for (const i of cells) if (placement[i] === i) n++;
  return n;
}

export function shuffledPlacement(rng: Rng, count: number, locked: ReadonlySet<number>): number[] {
  const placement: number[] = new Array(count);
  const movable: number[] = [];
  for (let i = 0; i < count; i++) {
    placement[i] = i;
    if (!locked.has(i)) movable.push(i);
  }
  if (movable.length < 2) return placement;

  // Random permutation of the movable tiles into the movable cells.
  const tiles = rng.shuffle(movable);
  for (let slot = 0; slot < movable.length; slot++) {
    placement[movable[slot]] = tiles[slot];
  }

  // Repair: at most ~8% of movable tiles may start in their solved cell.
  const maxFixed = Math.max(0, Math.floor(movable.length * 0.08));
  let guard = 200;
  while (fixedPoints(placement, movable) > maxFixed && guard-- > 0) {
    const fixedList = movable.filter((i) => placement[i] === i);
    const a = fixedList[rng.int(fixedList.length)];
    const b = movable[rng.int(movable.length)];
    const t = placement[a];
    placement[a] = placement[b];
    placement[b] = t;
  }

  // Guaranteed fallback: a cyclic shift has zero fixed points.
  if (fixedPoints(placement, movable) > maxFixed) {
    const shift = 1 + rng.int(movable.length - 1);
    const ring = movable.map((i) => placement[i]);
    movable.forEach((cell, idx) => {
      placement[cell] = ring[(idx + shift) % movable.length];
    });
  }

  return placement;
}
