import { describe, expect, it } from "vitest";
import {
  bilinearField,
  fieldQuality,
  hexToLab,
  isAmbiguous,
  isSolvedBy,
  labToHex,
  quantizeField,
  resampleField,
  type Lab,
} from "@/engine";

/** A four-corner Studio board, rebuilt the way the server checks it. */
function board(corners: string[], cols: number, rows: number): Lab[] {
  const canon = bilinearField(corners.map(hexToLab) as [Lab, Lab, Lab, Lab], 12, 18).map(labToHex);
  return quantizeField(resampleField(canon.map(hexToLab), 12, 18, cols, rows), cols, rows).map(hexToLab);
}

describe("look-alike tiles", () => {
  // Real player boards that read fine but used to be rejected because a
  // diagonal neighbor sits close to the gradient's "flat" direction.
  const fair = {
    goldToBlue: ["#b07818", "#8fc12e", "#d03214", "#3060c0"],
    rainbow: ["#f8f86c", "#ee1111", "#2c1080", "#3bcc22"],
    paleLimeToInk: ["#c7e55d", "#702caf", "#7fb99b", "#3a3c40"],
  };
  const unfair = {
    mirrored: ["#ff2020", "#2040ff", "#2040ff", "#ff2020"],
    nearlyMirrored: ["#ff3030", "#3050f0", "#2848ff", "#f02828"],
    twoCornersSame: ["#ff8000", "#ff8000", "#2040ff", "#40c040"],
    saddle: ["#e0e0e0", "#202020", "#202020", "#e0e0e0"],
  };

  for (const [name, c] of Object.entries(fair))
    it(`accepts ${name} at 7×9 and 10×14`, () => {
      for (const [cols, rows] of [[7, 9], [10, 14]]) expect(isAmbiguous(fieldQuality(board(c, cols, rows), cols, rows))).toBe(false);
    });

  for (const [name, c] of Object.entries(unfair))
    it(`rejects ${name}`, () => {
      expect(isAmbiguous(fieldQuality(board(c, 7, 9), 7, 9))).toBe(true);
    });

  it("counts a swap of near-identical tiles as solved, but not a real mistake", () => {
    const labs: Lab[] = [0.5, 0.6, 0.7, 0.505, 0.8, 0.9].map((l): Lab => ({ l, a: 0, b: 0 }));
    expect(isSolvedBy([3, 1, 2, 0, 4, 5], labs)).toBe(true); // 0.005 apart
    expect(isSolvedBy([1, 0, 2, 3, 4, 5], labs)).toBe(false); // 0.1 apart
    expect(isSolvedBy([0, 1, 2, 3, 4, 5], labs)).toBe(true);
  });
});
