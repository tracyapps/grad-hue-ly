/**
 * Gradient quality audit — metrics on the FINAL hex colors (what the screen
 * shows), in ΔE_OK2. Run: npx tsx scripts/audit/audit.ts [count] [worldSeed]
 *   evenness — worst max/min step ratio along any row/column (1 = perfect)
 *   kink     — worst change between consecutive steps ÷ mean step (jumps)
 *   twin     — closest NON-adjacent pair ÷ mean step (< 0.6 = ambiguous)
 */
import { generateLevel, hexToLab, fieldQuality, DEFAULT_WORLD_SEED, generateField, levelParams, levelSeed, Rng } from "../../src/engine";

const N = Number(process.argv[2] ?? 300);
const world = Number(process.argv[3] ?? DEFAULT_WORLD_SEED);
const attempts: number[] = [];
let worstEven = 0, worstKink = 0, worstTwin = Infinity, minStep = Infinity;
const t0 = Date.now();
for (let n = 1; n <= N; n++) {
  const p = generateLevel(n, world);
  const lp = levelParams(n);
  const att = generateField(new Rng(levelSeed(n, world)), lp).attempts;
  attempts.push(att);
  const q = fieldQuality(p.colors.map(hexToLab), p.cols, p.rows);
  worstEven = Math.max(worstEven, q.evenness);
  worstKink = Math.max(worstKink, q.kink);
  worstTwin = Math.min(worstTwin, q.twin);
  minStep = Math.min(minStep, q.minStep);
  if (n <= 6 || n % 25 === 0 || q.twin < 0.8 || q.evenness > 1.8)
    console.log(
      `L${n} ${p.cols}x${p.rows} step=${p.params.step.toFixed(3)} mean=${q.meanStep.toFixed(4)} min=${q.minStep.toFixed(4)} even=${q.evenness.toFixed(2)} kink=${q.kink.toFixed(2)} twin=${q.twin.toFixed(2)} tries=${att}`,
    );
}
console.log(
  `\n${N} levels in ${Date.now() - t0}ms · worst evenness ${worstEven.toFixed(2)} · worst kink ${worstKink.toFixed(2)} · worst twin ${worstTwin.toFixed(2)} · smallest step ${minStep.toFixed(4)}`,
);
attempts.sort((a, b) => a - b);
console.log(`attempts: median ${attempts[attempts.length >> 1]}, p95 ${attempts[Math.floor(attempts.length * 0.95)]}, max ${attempts[attempts.length - 1]}, fallbacks ${attempts.filter((a) => a >= 1300).length}, loosened ${attempts.filter((a) => a > 350).length}`);
