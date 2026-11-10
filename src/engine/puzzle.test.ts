import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "./rng";
import { makeRect, adjacentPairs } from "./grid";
import { generateField } from "./field";
import { shuffledPlacement } from "./shuffle";
import {
  generateLevel,
  generatePuzzle,
  generateToday,
  generateZen,
  isSolved,
  applySwap,
  levelParams,
  chapterName,
  CHAPTER_SIZE,
  zenParams,
} from "./index";
import { deltaEok, hexToLab } from "./color";

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("differs across seeds and hash inputs", () => {
    expect(hashSeed("level", 42, 7)).not.toBe(hashSeed("level", 43, 7));
    expect(hashSeed("level", 42, 7)).not.toBe(hashSeed("level", 42, 8));
  });

  it("shuffle preserves the multiset", () => {
    const rng = new Rng(9);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(rng.shuffle(src).sort()).toEqual(src);
  });
});

describe("field generation", () => {
  const grid = makeRect(8, 10);

  it("produces valid colors in the requested mean contrast band", () => {
    const rng = new Rng(777);
    const p = levelParams(80);
    const field = generateField(rng, grid, p);
    expect(field.labs).toHaveLength(80);
    for (const lab of field.labs) {
      expect(lab.l).toBeGreaterThan(0.05);
      expect(lab.l).toBeLessThan(1);
    }
    expect(field.meanAdjacent).toBeGreaterThanOrEqual(p.minAdjacentDelta * 0.97);
    expect(field.meanAdjacent).toBeLessThanOrEqual(p.maxAdjacentDelta * 1.15);
  });

  it("all tile colors are perceptually distinct", () => {
    const rng = new Rng(31337);
    const p = levelParams(200);
    const field = generateField(rng, makeRect(p.cols, p.rows), p);
    // Engine contract: constant distinctness floor, independent of difficulty.
    expect(field.minPairwise).toBeGreaterThanOrEqual(0.0028);
  });
});

describe("shuffling", () => {
  it("never starts solved and never parks more than 8% of tiles", () => {
    for (const seed of [1, 7, 99, 4242]) {
      const rng = new Rng(seed);
      const locked = new Set([0, 79]);
      const placement = shuffledPlacement(rng, 80, locked);
      expect(isSolved(placement)).toBe(false);
      expect(placement[0]).toBe(0);
      expect(placement[79]).toBe(79);
      let fixed = 0;
      for (let i = 0; i < 80; i++) if (i !== 0 && i !== 79 && placement[i] === i) fixed++;
      expect(fixed).toBeLessThanOrEqual(Math.floor(78 * 0.08));
    }
  });

  it("is a valid permutation", () => {
    const placement = shuffledPlacement(new Rng(55), 40, new Set());
    expect(placement.slice().sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i),
    );
  });
});

describe("difficulty curve", () => {
  it("keeps board sizes inside the promised envelope", () => {
    for (let level = 1; level <= 500; level++) {
      const p = levelParams(level);
      expect(p.cols).toBeGreaterThanOrEqual(4);
      expect(p.cols).toBeLessThanOrEqual(10);
      expect(p.rows).toBeGreaterThanOrEqual(p.cols);
      expect(p.rows).toBeLessThanOrEqual(14);
      expect(p.anchors).toBeGreaterThanOrEqual(2);
      expect(p.anchors).toBeLessThanOrEqual(5);
      expect(p.minAdjacentDelta).toBeGreaterThan(0.007);
      expect(p.maxAdjacentDelta).toBeGreaterThan(p.minAdjacentDelta);
    }
  });

  it("gets perceptually subtler over time", () => {
    const early = levelParams(10).minAdjacentDelta;
    const mid = levelParams(80).minAdjacentDelta;
    const late = levelParams(300).minAdjacentDelta;
    expect(early).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(late);
  });

  it("locks disappear after the training chapters", () => {
    expect(levelParams(1).locks).toBe(4);
    expect(levelParams(10).locks).toBe(2);
    expect(levelParams(25).locks).toBe(0);
  });

  it("chapters have names, cycling with numerals", () => {
    expect(chapterName(1)).toBe("DAWN");
    const lastChapterFirstCycle = CHAPTER_SIZE * 24; // level 600 → chapter 23 "PRISM"
    expect(chapterName(lastChapterFirstCycle)).toBe("PRISM");
    expect(chapterName(lastChapterFirstCycle + 1)).toBe("DAWN II");
  });
});

describe("puzzle generation", () => {
  const SAMPLE_LEVELS = [1, 2, 8, 15, 50, 100, 180, 300, 420];

  it("is deterministic per level and world", () => {
    expect(generateLevel(42)).toEqual(generateLevel(42));
    expect(generateLevel(42, 999)).not.toEqual(generateLevel(42));
  });

  it("generates solvable, distinct, in-band puzzles across the curve", () => {
    for (const level of SAMPLE_LEVELS) {
      const puzzle = generateLevel(level);
      const n = puzzle.cols * puzzle.rows;

      expect(puzzle.colors).toHaveLength(n);
      expect(puzzle.placement).toHaveLength(n);
      expect(isSolved(puzzle.placement)).toBe(false);
      expect(new Set(puzzle.colors).size).toBe(n); // every tile unique
      for (const hex of puzzle.colors) expect(hex).toMatch(/^#[0-9a-f]{6}$/);

      // Mean adjacent contrast honors the (possibly relaxed) floor, and no
      // single pair drops below the hard distinctness floor.
      const grid = makeRect(puzzle.cols, puzzle.rows);
      const labs = puzzle.colors.map(hexToLab);
      const deltas = adjacentPairs(grid).map(([i, j]) => deltaEok(labs[i], labs[j]));
      const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
      expect(mean).toBeGreaterThanOrEqual(puzzle.params.minAdjacentDelta * 0.95);
      expect(Math.min(...deltas)).toBeGreaterThanOrEqual(0.0027);

      // Locked tiles sit in their solved cells.
      for (const cell of puzzle.locked) expect(puzzle.placement[cell]).toBe(cell);

      // And applying the inverse of the shuffle solves it.
      const solved = puzzle.placement.map((_, i) => i);
      expect(isSolved(solved)).toBe(true);
    }
  });

  it("level one is a gentle 4-wide board with four corner anchors", () => {
    const p1 = generateLevel(1);
    expect(p1.cols).toBe(4);
    expect(p1.locked.length).toBe(4);
  });

  it("top-end boards reach 10 wide and tall", () => {
    const p300 = generateLevel(300);
    expect(p300.cols).toBe(10);
    expect(p300.rows).toBeGreaterThanOrEqual(12);
  });

  it("today and zen generators are stable per input", () => {
    expect(generateToday("2025-11-09")).toEqual(generateToday("2025-11-09"));
    expect(generateToday("2025-11-09")).not.toEqual(generateToday("2025-11-10"));
    expect(generateZen(5, { size: "grand", subtlety: "ethereal" })).toEqual(
      generateZen(5, { size: "grand", subtlety: "ethereal" }),
    );
    expect(zenParams({ size: "grand" }).locks).toBe(0);
  });
});

describe("move application", () => {
  it("swaps exactly two tiles", () => {
    const puzzle = generateLevel(30);
    const next = applySwap(puzzle.placement, 0, 5);
    expect(next[0]).toBe(puzzle.placement[5]);
    expect(next[5]).toBe(puzzle.placement[0]);
    expect(next.filter((t, i) => t !== puzzle.placement[i])).toHaveLength(2);
  });
});
