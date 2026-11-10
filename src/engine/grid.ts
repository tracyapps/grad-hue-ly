/**
 * Grid geometry. Cells are an explicit list so non-rectangular boards (hex
 * masks, diamonds — the roadmap "shapes" update) can reuse everything above
 * this layer untouched.
 */

export interface Cell {
  x: number;
  y: number;
}

export interface GridSpec {
  cols: number;
  rows: number;
  /** Row-major cells; index === solution tile id. */
  cells: Cell[];
}

export function makeRect(cols: number, rows: number): GridSpec {
  const cells: Cell[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) cells.push({ x, y });
  }
  return { cols, rows, cells };
}

export function cellIndex(grid: GridSpec, x: number, y: number): number {
  return y * grid.cols + x;
}

/** 4-neighborhood indices. */
export function neighborIndices(grid: GridSpec, i: number): number[] {
  const { x, y } = grid.cells[i];
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < grid.cols - 1) out.push(i + 1);
  if (y > 0) out.push(i - grid.cols);
  if (y < grid.rows - 1) out.push(i + grid.cols);
  return out;
}

/** All 4-adjacent index pairs (each unordered pair once). */
export function adjacentPairs(grid: GridSpec): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < grid.cells.length; i++) {
    const { x, y } = grid.cells[i];
    if (x < grid.cols - 1) pairs.push([i, i + 1]);
    if (y < grid.rows - 1) pairs.push([i, i + grid.cols]);
  }
  return pairs;
}
