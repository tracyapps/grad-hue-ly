import { describe, expect, it } from "vitest";
import {
  rgbToLab,
  labToRgb,
  labToHex,
  hexToLab,
  lchToLab,
  labToLch,
  deltaEok,
  inGamut,
  type Lab,
} from "./color";

const WHITE: Lab = { l: 1, a: 0, b: 0 };
const BLACK: Lab = { l: 0, a: 0, b: 0 };

describe("OKLab conversions", () => {
  it("white and black survive the round trip", () => {
    const white = rgbToLab({ r: 255, g: 255, b: 255 });
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.a).toBeCloseTo(0, 3);
    expect(white.b).toBeCloseTo(0, 3);

    const black = rgbToLab({ r: 0, g: 0, b: 0 });
    expect(black.l).toBeCloseTo(0, 3);

    const backWhite = labToRgb(white);
    expect(backWhite.r).toBeCloseTo(255, 0);
    expect(backWhite.g).toBeCloseTo(255, 0);
    expect(backWhite.b).toBeCloseTo(255, 0);
  });

  it("hex round trips within perceptual noise", () => {
    const lab: Lab = { l: 0.68, a: 0.06, b: -0.05 };
    const hex = labToHex(lab);
    const back = hexToLab(hex);
    expect(deltaEok(lab, back)).toBeLessThan(0.008);
  });

  it("hue 0 (pinkish red) is warmer than hue 0.35 (green)", () => {
    const warm = labToRgb(lchToLab({ l: 0.7, c: 0.09, h: 0.0 }));
    const green = labToRgb(lchToLab({ l: 0.7, c: 0.09, h: 0.35 }));
    expect(warm.r).toBeGreaterThan(warm.b);
    expect(green.g).toBeGreaterThan(green.b);
  });

  it("lch round trip", () => {
    const lab: Lab = { l: 0.6, a: 0.08, b: 0.04 };
    const lch = labToLch(lab);
    const back = lchToLab(lch);
    expect(back.l).toBeCloseTo(lab.l, 8);
    expect(back.a).toBeCloseTo(lab.a, 8);
    expect(back.b).toBeCloseTo(lab.b, 8);
  });

  it("inGamut accepts whites and rejects impossible chroma at high L", () => {
    expect(inGamut(WHITE)).toBe(true);
    expect(inGamut({ l: 0.97, a: 0.3, b: 0.3 })).toBe(false);
  });
});

describe("deltaEok scale", () => {
  it("white ↔ black is exactly the unit distance", () => {
    expect(deltaEok(WHITE, BLACK)).toBeCloseTo(1, 6);
  });

  it("is symmetric and satisfies the triangle inequality", () => {
    const a: Lab = { l: 0.5, a: 0.05, b: -0.03 };
    const b: Lab = { l: 0.62, a: -0.02, b: 0.06 };
    const c: Lab = { l: 0.45, a: 0.01, b: 0.02 };
    expect(deltaEok(a, b)).toBeCloseTo(deltaEok(b, a), 10);
    expect(deltaEok(a, c) + deltaEok(c, b)).toBeGreaterThanOrEqual(deltaEok(a, b) - 1e-9);
  });
});
