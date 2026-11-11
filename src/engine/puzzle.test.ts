import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "./rng";
import { generateField, fieldQuality, bilinearField, resampleField } from "./field";
import { shuffledPlacement } from "./shuffle";
import {
  generateEndless,
  generateLevel,
  generateToday,
  generateZen,
  generatePuzzle,
  puzzleFromColors,
  puzzleFromField,
  isSolved,
  applySwap,
  applyCornerLocks,
  cornerCells,
} from "./puzzle";
import {
  levelParams,
  chapterName,
  CHAPTER_SIZE,
  zenParams,
  MIN_STEP,
  SIZE_LADDER,
  SIZE_PRESETS,
  stepFor,
} from "./difficulty";
import { CHAPTER_MOODS } from "./palettes";
import { hexToLab, inGamut } from "./color";

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
  it("hits the step target exactly, in gamut, every chapter mood", () => {
    CHAPTER_MOODS.forEach((mood, i) => {
      for (const [cols, rows] of [SIZE_LADDER[0], SIZE_LADDER[8], SIZE_LADDER[16]]) {
        const step = Math.max(MIN_STEP, 0.4 / (Math.max(cols, rows) - 1));
        const f = generateField(new Rng(1000 + i), { cols, rows, step, twist: [0.2, 0.6], mood });
        expect(f.labs).toHaveLength(cols * rows);
        for (const lab of f.labs) expect(inGamut(lab)).toBe(true);
        const q = fieldQuality(f.labs, cols, rows);
        // Exact target, or (rare last resort for oversized steps) a bit quieter.
        expect(q.meanStep).toBeGreaterThan(step * 0.75);
        expect(q.meanStep).toBeLessThan(step * 1.01);
      }
    });
  });

  it("never produces mirrored corners (the old level-2 bug)", () => {
    for (let seed = 0; seed < 60; seed++) {
      const f = generateField(new Rng(seed), {
        cols: 5,
        rows: 5,
        step: 0.1,
        twist: [0, 0.25],
        mood: CHAPTER_MOODS[seed % CHAPTER_MOODS.length],
      });
      const q = fieldQuality(f.labs, 5, 5);
      // Every non-neighbor is at least a full step away.
      expect(q.twin).toBeGreaterThan(1);
    }
  });

  it("corner blends sample their corners exactly", () => {
    const corners = ["#e5b95c", "#b48cd9", "#7fb99b", "#4e6fb8"].map(hexToLab) as [
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
    ];
    const f = bilinearField(corners, 7, 9);
    expect(f[0]).toEqual(corners[0]);
    expect(f[6]).toEqual(corners[1]);
    expect(f[56]).toEqual(corners[2]);
    expect(f[62]).toEqual(corners[3]);
  });

  it("resampling a smooth grid stays smooth (no nearest-neighbor jumps)", () => {
    const corners = ["#e5b95c", "#b48cd9", "#7fb99b", "#4e6fb8"].map(hexToLab) as [
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
    ];
    // A 12×18 canonical grid resampled to 10×14 — the Studio's worst case.
    const canonical = bilinearField(corners, 12, 18);
    const resampled = resampleField(canonical, 12, 18, 10, 14);
    const q = fieldQuality(resampled, 10, 14);
    expect(q.evenness).toBeLessThan(1.05);
    // The old nearest-neighbor path skipped columns: 2× steps beside 1×.
    const nearest: typeof canonical = [];
    for (let y = 0; y < 14; y++)
      for (let x = 0; x < 10; x++)
        nearest.push(canonical[Math.round((y / 13) * 17) * 12 + Math.round((x / 9) * 11)]);
    expect(fieldQuality(nearest, 10, 14).evenness).toBeGreaterThan(1.8);
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
    for (let level = 1; level <= 600; level++) {
      const p = levelParams(level);
      expect(p.cols).toBeGreaterThanOrEqual(4);
      expect(p.cols).toBeLessThanOrEqual(10);
      expect(p.rows).toBeGreaterThanOrEqual(p.cols);
      expect(p.rows).toBeLessThanOrEqual(14);
      expect(p.step).toBeGreaterThanOrEqual(MIN_STEP);
      expect(p.step).toBeLessThanOrEqual(0.14);
    }
  });

  it("gets subtler and bigger over time", () => {
    expect(levelParams(3).step).toBeGreaterThan(levelParams(80).step);
    expect(levelParams(80).step).toBeGreaterThan(levelParams(300).step);
    expect(levelParams(1).cols * levelParams(1).rows).toBeLessThan(
      levelParams(300).cols * levelParams(300).rows,
    );
  });

  it("chapters have names and moods, cycling with numerals", () => {
    expect(chapterName(1)).toBe("DAWN");
    const lastChapterFirstCycle = CHAPTER_SIZE * 24;
    expect(chapterName(lastChapterFirstCycle)).toBe("PRISM");
    expect(chapterName(lastChapterFirstCycle + 1)).toBe("DAWN II");
    expect(levelParams(1).mood).toBe(CHAPTER_MOODS[0]);
    expect(levelParams(26).mood).toBe(CHAPTER_MOODS[1]);
  });
});

describe("puzzle generation", () => {
  it("is deterministic per level and world", () => {
    expect(generateLevel(42)).toEqual(generateLevel(42));
    expect(generateLevel(42, 999)).not.toEqual(generateLevel(42));
  });

  it("every level 1–400 is fair: even, jump-free, twin-free, distinct", () => {
    for (let level = 1; level <= 400; level++) {
      const puzzle = generateLevel(level);
      const n = puzzle.cols * puzzle.rows;
      expect(puzzle.colors).toHaveLength(n);
      expect(new Set(puzzle.colors).size).toBe(n);
      expect(isSolved(puzzle.placement)).toBe(false);
      const q = fieldQuality(puzzle.colors.map(hexToLab), puzzle.cols, puzzle.rows);
      // What the screen shows (after 8-bit quantization):
      expect(q.evenness).toBeLessThan(1.35); // no row/column has uneven steps
      expect(q.kink).toBeLessThan(0.3); // no jumps
      expect(q.twin).toBeGreaterThan(1); // no two far-apart tiles look alike
      expect(q.minStep).toBeGreaterThan(0.027); // every neighbor visibly different
    }
  });

  it("other worlds are just as fair", () => {
    for (const world of [1, 77, 4242]) {
      for (let level = 1; level <= 300; level += 7) {
        const p = generateLevel(level, world);
        const q = fieldQuality(p.colors.map(hexToLab), p.cols, p.rows);
        expect(q.twin).toBeGreaterThan(1);
        expect(q.evenness).toBeLessThan(1.35);
      }
    }
  });

  it("level one is a small, clear board", () => {
    const p1 = generateLevel(1);
    expect(p1.cols).toBe(4);
    expect(p1.params.step).toBeGreaterThan(0.09);
  });

  it("top-end boards reach 10 wide and tall", () => {
    const sizes = [281, 283, 287, 291, 299, 301, 303].map((l) => levelParams(l));
    expect(sizes.some((p) => p.cols === 10 && p.rows >= 13)).toBe(true);
  });

  it("today and zen generators are stable and fair", () => {
    expect(generateToday("2025-11-09")).toEqual(generateToday("2025-11-09"));
    expect(generateToday("2025-11-09")).not.toEqual(generateToday("2025-11-10"));
    const z = generateZen(5, { size: "grand", subtlety: "ethereal" });
    expect(z).toEqual(generateZen(5, { size: "grand", subtlety: "ethereal" }));
    expect(zenParams({ size: "grand" }).cols).toBe(10);
    for (let nonce = 0; nonce < 20; nonce++) {
      const p = generateZen(nonce, { size: "grand", subtlety: "ethereal" });
      expect(fieldQuality(p.colors.map(hexToLab), p.cols, p.rows).twin).toBeGreaterThan(1);
    }
  });

  it("a hand-made params object works (the onboarding teach board)", () => {
    const p = generatePuzzle(
      { ...levelParams(1), cols: 3, rows: 3, step: 0.14, revealMs: 2600 },
      1337,
    );
    expect(p.colors).toHaveLength(9);
  });
});

describe("puzzles from explicit colors (Studio)", () => {
  it("builds a distinct, shuffled, solvable board at any size", () => {
    const src = generateLevel(60);
    const field = resampleField(src.colors.map(hexToLab), src.cols, src.rows, 6, 8);
    const p = puzzleFromField(field, 6, 8, 12345);
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

  it("flags ambiguous designs: mirrored corners make twins", () => {
    // TR == BL: tile (x, y) and (y, x) become the same color.
    const corners = ["#3fb8b0", "#5a6a90", "#5a6a90", "#c86fcf"].map(hexToLab) as [
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
      ReturnType<typeof hexToLab>,
    ];
    expect(fieldQuality(bilinearField(corners, 5, 5), 5, 5).twin).toBeLessThan(0.1);
  });
});

describe("endless boards at any size", () => {
  it("every preset × subtlety is fair, including the huge ones", () => {
    for (const [cols, rows] of SIZE_PRESETS) {
      for (const sub of ["gentle", "subtle", "ethereal"] as const) {
        for (const nonce of [0, 1, 2]) {
          const p = generateEndless(nonce, cols, rows, sub);
          expect(p.cols * p.rows).toBe(cols * rows);
          const q = fieldQuality(p.colors.map(hexToLab), cols, rows);
          expect(q.twin).toBeGreaterThan(1);
          expect(q.minStep).toBeGreaterThan(0.02);
          expect(new Set(p.colors).size).toBe(cols * rows);
        }
      }
    }
  });

  it("subtlety orders the step, and big boards converge to the floor", () => {
    expect(stepFor(6, 8, "gentle")).toBeGreaterThan(stepFor(6, 8, "subtle"));
    expect(stepFor(6, 8, "subtle")).toBeGreaterThan(stepFor(6, 8, "ethereal"));
    // big boards keep three distinct choices up to 18 on a side
    expect(stepFor(10, 14, "gentle")).toBeGreaterThan(stepFor(10, 14, "subtle"));
    expect(stepFor(12, 16, "subtle")).toBeGreaterThan(stepFor(12, 16, "ethereal"));
    expect(stepFor(14, 20, "gentle") - stepFor(14, 20, "ethereal")).toBeLessThan(0.0015);
  });

  it("journey levels can be played at a chosen size", () => {
    const p = generateLevel(3, undefined, { cols: 9, rows: 12 });
    expect([p.cols, p.rows]).toEqual([9, 12]);
    expect(p.params.mood).toBe(levelParams(3).mood);
    const q = fieldQuality(p.colors.map(hexToLab), 9, 12);
    expect(q.twin).toBeGreaterThan(1);
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
