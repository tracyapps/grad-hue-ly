import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "./rng";
import { makeRect, adjacentPairs } from "./grid";
import { generateCornerField } from "./field";
import { shuffledPlacement } from "./shuffle";
import {
  generateLevel,
  generateToday,
  generateZen,
  puzzleFromColors,
  isSolved,
  applySwap,
  applyCornerLocks,
  cornerCells,
} from "./puzzle";
import { levelParams, chapterName, CHAPTER_SIZE, zenParams } from "./difficulty";
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

describe("corner field generation", () => {
  const grid = makeRect(8, 10);

  it("produces valid colors in the requested mean contrast band", () => {
    const rng = new Rng(777);
    const p = levelParams(80);
    const field = generateCornerField(rng, grid, p, p.cornerMode);
    expect(field.labs).toHaveLength(80);
    for (const lab of field.labs) {
      expect(lab.l).toBeGreaterThan(0.05);
      expect(lab.l).toBeLessThan(1);
    }
    expect(field.meanAdjacent).toBeGreaterThanOrEqual(p.minAdjacentDelta * 0.97);
    expect(field.meanAdjacent).toBeLessThanOrEqual(p.maxAdjacentDelta * 1.15);
  });

  it("corner colors flow to the corners of the field", () => {
    const rng = new Rng(2024);
    const p = levelParams(60);
    const field = generateCornerField(rng, grid, p, p.cornerMode);
    const [tl, tr, bl, br] = field.corners;
    expect(deltaEok(field.labs[0], tl)).toBeLessThan(0.01);
    expect(deltaEok(field.labs[7], tr)).toBeLessThan(0.01);
    expect(deltaEok(field.labs[72], bl)).toBeLessThan(0.01);
    expect(deltaEok(field.labs[79], br)).toBeLessThan(0.01);
  });

  it("all tile colors are perceptually distinct", () => {
    const rng = new Rng(31337);
    const p = levelParams(200);
    const field = generateCornerField(rng, makeRect(p.cols, p.rows), p, p.cornerMode);
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

describe("corner assist", () => {
  it("locks corners into their solved cells without breaking the permutation", () => {
    const puzzle = generateLevel(30);
    const assisted = applyCornerLocks(puzzle.placement, puzzle.cols, puzzle.rows);
    expect(assisted.slice().sort((a, b) => a - b)).toEqual(puzzle.placement.map((_, i) => i));
    for (const c of cornerCells(puzzle.cols, puzzle.rows)) {
      expect(assisted[c]).toBe(c);
    }
    // The engine's own placement is a full shuffle — corners are not
    // deliberately placed (a stray fixed point is allowed by the ≤8% rule).
    const preplaced = cornerCells(puzzle.cols, puzzle.rows).filter(
      (c) => puzzle.placement[c] === c,
    );
    expect(preplaced.length).toBeLessThan(4);
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
      expect(["diagonal", "quad"]).toContain(p.cornerMode);
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
    }
  });

  it("level one is a gentle 4-wide diagonal flow", () => {
    const p1 = generateLevel(1);
    expect(p1.cols).toBe(4);
    expect(p1.params.cornerMode).toBe("diagonal");
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
    expect(zenParams({ size: "grand" }).cornerMode).toBe("quad");
  });
});

describe("puzzles from explicit colors (Studio)", () => {
  it("builds a distinct, shuffled, solvable board at any size", () => {
    const src = generateLevel(60); // reuse a known-good palette
    const cols = 6;
    const rows = 8;
    const sampled: string[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const sx = Math.round((x / (cols - 1)) * (src.cols - 1));
        const sy = Math.round((y / (rows - 1)) * (src.rows - 1));
        sampled.push(src.colors[sy * src.cols + sx]);
      }
    }
    const p = puzzleFromColors(sampled, cols, rows, 12345);
    expect(p.colors).toHaveLength(48);
    expect(new Set(p.colors).size).toBe(48);
    expect(isSolved(p.placement)).toBe(false);
    expect(p.placement.slice().sort((a, b) => a - b)).toEqual(
      Array.from({ length: 48 }, (_, i) => i),
    );
  });

  it("rejects mismatched color counts", () => {
    expect(() => puzzleFromColors(["#ffffff", "#000000"], 3, 3, 1)).toThrow();
  });
});

describe("boards are true multidimensional gradients", () => {
  it("solved boards fit a bilinear corner model closely (the game-1 look)", () => {
    // Least-squares fit of each solved board against a bilinear model in
    // OKLab; R² must be high — boards are flows from corner sources, never
    // abstract noise.
    for (const level of [1, 17, 60, 300]) {
      const puzzle = generateLevel(level);
      const labs = puzzle.colors.map(hexToLab);
      const { cols, rows } = puzzle;
      const n = labs.length;

      // Design matrix per channel: [1, u, v, u·v] — solve normal equations.
      const X = (x: number, y: number) => {
        const u = x / (cols - 1);
        const v = y / (rows - 1);
        return [1, u, v, u * v];
      };
      const solve = (key: "l" | "a" | "b") => {
        const A = [0, 0, 0, 0].map(() => [0, 0, 0, 0]);
        const b = [0, 0, 0, 0];
        let ssTot = 0;
        let mean = 0;
        for (const lab of labs) mean += lab[key];
        mean /= n;
        for (let i = 0; i < n; i++) {
          const x = X(i % cols, Math.floor(i / cols));
          const y = labs[i][key];
          for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) A[r][c] += x[r] * x[c];
            b[r] += x[r] * y;
          }
          ssTot += (y - mean) ** 2;
        }
        // Solve 4×4 via Gaussian elimination.
        const M = A.map((row, r) => [...row, b[r]]);
        for (let col = 0; col < 4; col++) {
          let piv = col;
          for (let r = col + 1; r < 4; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
          [M[col], M[piv]] = [M[piv], M[col]];
          for (let r = 0; r < 4; r++) {
            if (r === col) continue;
            const f = M[r][col] / M[col][col];
            for (let c = col; c < 5; c++) M[r][c] -= f * M[col][c];
          }
        }
        const beta = [0, 1, 2, 3].map((r) => M[r][4] / M[r][r]);
        let ssRes = 0;
        for (let i = 0; i < n; i++) {
          const x = X(i % cols, Math.floor(i / cols));
          const pred = beta[0] + beta[1] * x[1] + beta[2] * x[2] + beta[3] * x[3];
          ssRes += (labs[i][key] - pred) ** 2;
        }
        return 1 - ssRes / ssTot;
      };
      const r2 = (solve("l") + solve("a") + solve("b")) / 3;
      expect(r2).toBeGreaterThan(0.9);
    }
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
