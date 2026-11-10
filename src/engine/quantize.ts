/**
 * Quantization-aware color finalization — the last mile.
 *
 * Everything upstream is perceptually uniform OKLab, but screens show 8-bit
 * sRGB, and sRGB quantization steps are NOT perceptually even: rounding can
 * erase a subtle step entirely or inflate it, and Lab-space repairs round
 * unpredictably. So finalization happens in hex space, where every repair is
 * exactly one 1/255 step — the smallest change a display can express —
 * nudged along the gradient's own direction.
 */

import { Lab, deltaEok, hexToLab, labToHex } from "./color";
import { GridSpec, adjacentPairs } from "./grid";

/** All hexes reachable by ±1 on one or two channels. */
function hexNeighbors(hex: string): string[] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const out: string[] = [];
  const chans: Array<[number, number]> = [
    [0, r],
    [1, g],
    [2, b],
  ];
  const bump = (vals: [number, number, number]) =>
    `#${vals.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;

  for (const [ci, cv] of chans) {
    for (const d of [-1, 1]) {
      const vals: [number, number, number] = [r, g, b];
      vals[ci] = cv + d;
      out.push(bump(vals));
      // diagonal steps too — finer direction control
      for (const [cj, cvj] of chans) {
        if (cj === ci) continue;
        for (const dj of [-1, 1]) {
          const v2: [number, number, number] = [vals[0], vals[1], vals[2]];
          v2[cj] = cvj + dj;
          out.push(bump(v2));
        }
      }
    }
  }
  return [...new Set(out)];
}

/**
 * Lift every adjacent pair above `floor` with minimal exact steps. `guide`
 * carries the pre-quantization OKLab field so repairs move WITH the flow,
 * never across it.
 */
function relaxHex(
  colors: string[],
  grid: GridSpec,
  guide: Lab[],
  floor: number,
): string[] {
  const hex = [...colors];
  const labs = hex.map(hexToLab);
  const pairs = adjacentPairs(grid);

  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const [i, j] of pairs) {
      const d = deltaEok(labs[i], labs[j]);
      if (d >= floor) continue;

      // The gradient's direction across this pair (from the smooth field).
      const dir = {
        l: guide[j].l - guide[i].l,
        a: guide[j].a - guide[i].a,
        b: guide[j].b - guide[i].b,
      };

      // Move tile j among its exact 1-step neighbors to just clear the
      // floor, along the flow, with the least overshoot.
      let best: string | null = null;
      let bestScore = Infinity;
      for (const cand of hexNeighbors(hex[j])) {
        const candLab = hexToLab(cand);
        const dd = deltaEok(labs[i], candLab);
        if (dd < floor * 0.98) continue;
        const along =
          (candLab.l - labs[j].l) * dir.l +
          (candLab.a - labs[j].a) * dir.a +
          (candLab.b - labs[j].b) * dir.b;
        if (along <= 0) continue; // never fight the gradient
        const overshoot = Math.abs(dd - floor * 1.15);
        const score = overshoot - along * 20; // prefer flow-aligned, minimal overshoot
        if (score < bestScore) {
          bestScore = score;
          best = cand;
        }
      }
      if (best) {
        hex[j] = best;
        labs[j] = hexToLab(best);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return hex;
}

/** Hex-level uniqueness: identical colors get a single-channel ±1 bump. */
function dedupeHex(colors: string[]): string[] {
  const seen = new Set<string>();
  return colors.map((hex) => {
    if (!seen.has(hex)) {
      seen.add(hex);
      return hex;
    }
    let h = hex;
    for (let guard = 1; seen.has(h) && guard <= 24; guard++) {
      const r = parseInt(h.slice(1, 3), 16);
      const g = parseInt(h.slice(3, 5), 16);
      const b = parseInt(h.slice(5, 7), 16);
      const vals: [number, number, number] = [r, g, b];
      const ci = guard % 3;
      vals[ci] = vals[ci] < 255 ? vals[ci] + 1 : vals[ci] - 1;
      h = `#${vals.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    }
    seen.add(h);
    return h;
  });
}

/**
 * Full finalization: quantize → restore any contrast the rounding stole →
 * relax exact steps → guarantee literal uniqueness.
 *
 * - `meanFloor`: difficulty band floor for the MEAN adjacent ΔEok post-hex
 *   (engine-generated boards). Omit to leave an artwork's own contrast
 *   untouched (Studio boards).
 * - `adjacentFloor`: minimum adjacent ΔEok every pair must clear after
 *   quantization — keeps parallel rows distinguishable everywhere.
 */
export function finalizeColors(
  labs: Lab[],
  grid: GridSpec,
  opts: { meanFloor?: number; adjacentFloor?: number } = {},
): string[] {
  const adjacentFloor = opts.adjacentFloor ?? 0.0055;

  // Quantization compresses the mean slightly; if it dipped below the band,
  // scale the smooth field up a touch and requantize (≤3 rounds).
  let scaled = labs;
  let hex = scaled.map(labToHex);
  if (opts.meanFloor !== undefined) {
    for (let round = 0; round < 3; round++) {
      const pairs = adjacentPairs(grid);
      let mean = 0;
      for (const [i, j] of pairs) mean += deltaEok(hexToLab(hex[i]), hexToLab(hex[j]));
      mean /= pairs.length;
      if (mean >= opts.meanFloor * 0.98) break;
      scaled = scaled.map((c) => ({ l: c.l, a: c.a * 1.06, b: c.b * 1.06 }));
      hex = scaled.map(labToHex);
    }
  }

  const target = Math.max(adjacentFloor, (opts.meanFloor ?? 0) * 0.28);
  const relaxed = relaxHex(hex, grid, scaled, target);
  return dedupeHex(relaxed);
}
