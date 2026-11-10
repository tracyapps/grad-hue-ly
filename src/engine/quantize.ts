/**
 * Quantization — the last mile from a perfect OKLab surface to 8-bit hex.
 *
 * Plain per-channel rounding throws away up to half a code value on every
 * channel independently, so two neighbors can round in opposite directions
 * and a whisper-quiet step suddenly looks twice as big (or vanishes). Here
 * each tile instead picks among the 8 floor/ceil corners of its 8-bit cell,
 * choosing the combination that best preserves the DIFFERENCES between
 * neighbors (what the eye compares across a grout line), not just each
 * tile's absolute color. A few Gauss-Seidel sweeps settle it.
 */

import { Lab, Rgb, hexToLab, labToRgb, rgbToHex } from "./color";
import { labToP, type Vec3 } from "./field";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sq = (a: Vec3) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];

/** Weight of "stay close to the ideal color" vs "keep steps faithful". */
const ANCHOR = 0.35;
const SWEEPS = 6;

export function quantizeField(labs: Lab[], cols: number, rows: number): string[] {
  const n = labs.length;
  const ideal = labs.map(labToP);

  // Candidate hexes (and their P-space positions) per tile.
  const cands: string[][] = [];
  const candP: Vec3[][] = [];
  for (let i = 0; i < n; i++) {
    const rgb: Rgb = labToRgb(labs[i]);
    const opts = new Set<string>();
    for (const fr of [Math.floor, Math.ceil])
      for (const fg of [Math.floor, Math.ceil])
        for (const fb of [Math.floor, Math.ceil])
          opts.add(rgbToHex({ r: fr(rgb.r), g: fg(rgb.g), b: fb(rgb.b) }));
    const list = [...opts];
    cands.push(list);
    candP.push(list.map((h) => labToP(hexToLab(h))));
  }

  const neighbors: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = i % cols;
    const y = (i - x) / cols;
    const ns: number[] = [];
    if (x > 0) ns.push(i - 1);
    if (x < cols - 1) ns.push(i + 1);
    if (y > 0) ns.push(i - cols);
    if (y < rows - 1) ns.push(i + cols);
    neighbors.push(ns);
  }

  // Start from the closest candidate.
  const choice = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bestD = Infinity;
    candP[i].forEach((p, k) => {
      const d = sq(sub(p, ideal[i]));
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    choice[i] = best;
  }

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = choice[i];
      let bestCost = Infinity;
      for (let k = 0; k < candP[i].length; k++) {
        const q = candP[i][k];
        let cost = ANCHOR * sq(sub(q, ideal[i]));
        for (const j of neighbors[i]) {
          const qj = candP[j][choice[j]];
          const want = sub(ideal[i], ideal[j]);
          const got = sub(q, qj);
          cost += sq(sub(got, want));
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = k;
        }
      }
      if (best !== choice[i]) {
        choice[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const out = choice.map((k, i) => cands[i][k]);

  // Literal uniqueness (geometry already guarantees it for engine boards;
  // Studio art can be flat in places).
  const seen = new Set<string>();
  return out.map((hex) => {
    let h = hex;
    for (let guard = 1; seen.has(h) && guard <= 24; guard++) {
      const v = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
      const ch = guard % 3;
      const delta = Math.ceil(guard / 3) * (v[ch] < 128 ? 1 : -1);
      v[ch] = Math.max(0, Math.min(255, v[ch] + delta));
      h = rgbToHex({ r: v[0], g: v[1], b: v[2] });
    }
    seen.add(h);
    return h;
  });
}
