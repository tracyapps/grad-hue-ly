/**
 * Color math in OKLab / OKLCH — a perceptually uniform space.
 *
 * All gradient generation happens here because "subtle hue change" only means
 * something when equal numeric steps look equally different to the eye.
 * Distances are raw OKLab Euclidean distance (white↔black = 1.0); roughly
 * 0.01–0.02 is a just-noticeable difference for adjacent patches.
 */

export interface Lab {
  l: number;
  a: number;
  b: number;
}

/** OKLCH with hue in turns [0, 1). */
export interface Lch {
  l: number;
  c: number;
  h: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function lchToLab({ l, c, h }: Lch): Lab {
  const rad = h * 2 * Math.PI;
  return { l, a: Math.cos(rad) * c, b: Math.sin(rad) * c };
}

export function labToLch({ l, a, b }: Lab): Lch {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) / (2 * Math.PI);
  if (h < 0) h += 1;
  return { l, c, h };
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

export function rgbToLab({ r, g, b }: Rgb): Lab {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** Unclamped linear-sRGB channels — the truth about gamut membership. */
export function labToLinear({ l, a, b }: Lab): { r: number; g: number; b: number } {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    g: -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    b: -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  };
}

export function labToRgb(lab: Lab): Rgb {
  const lin = labToLinear(lab);
  return {
    r: linearToSrgb(lin.r) * 255,
    g: linearToSrgb(lin.g) * 255,
    b: linearToSrgb(lin.b) * 255,
  };
}

/**
 * True when the color sits inside sRGB without clamping. A positive `margin`
 * demands the color sit that far INSIDE the cube (in linear-light units), so
 * 8-bit rounding can never push it out.
 */
export function inGamut(lab: Lab, margin = -0.0005): boolean {
  const lin = labToLinear(lab);
  const eps = -margin;
  return (
    lin.r >= -eps && lin.r <= 1 + eps &&
    lin.g >= -eps && lin.g <= 1 + eps &&
    lin.b >= -eps && lin.b <= 1 + eps
  );
}

/**
 * Pull a color into sRGB by scaling chroma (a/b toward 0), preserving lightness
 * and hue. Rare with our palette ranges, but keeps generated fields renderable
 * without ugly channel clamping.
 */
export function fitToGamut(lab: Lab): Lab {
  if (inGamut(lab)) return lab;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const test: Lab = { l: lab.l, a: lab.a * mid, b: lab.b * mid };
    if (inGamut(test)) lo = mid;
    else hi = mid;
  }
  return { l: lab.l, a: lab.a * lo, b: lab.b * lo };
}

export function labToHex(lab: Lab): string {
  const { r, g, b } = labToRgb(fitToGamut(lab));
  const to2 = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

/** Perceptual distance; 1.0 = white↔black, ~0.01–0.02 = just-noticeable. */
export function deltaEok(x: Lab, y: Lab): number {
  const dl = x.l - y.l;
  const da = x.a - y.a;
  const db = x.b - y.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * ΔE_OK2 — OKLab distance with a/b weighted ×2 (the variant Color.js ships as
 * `deltaEOK2`). Plain ΔE_OK undercounts hue/chroma change relative to
 * lightness change; doubling a/b tracks CIEDE2000 — i.e. what eyes report —
 * far more closely. Every difficulty number in the engine is in these units,
 * so a "step" means the same visible amount whether a board flows through
 * hue or through lightness.
 */
export function deltaP(x: Lab, y: Lab): number {
  const dl = x.l - y.l;
  const da = 2 * (x.a - y.a);
  const db = 2 * (x.b - y.b);
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** sRGB 0–255 floats (unclamped beyond the transfer function's own clamp). */
export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
