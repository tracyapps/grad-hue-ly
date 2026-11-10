/**
 * Moods — the color personality of each chapter.
 *
 * A mood doesn't fix a board's colors; it sets where the board's CENTER
 * color lives (hue window, lightness, chroma). The gradient then flows away
 * from that center in two directions, so every board in a chapter shares a
 * family resemblance — the way each I Love Hue pack had its own palette —
 * while no two boards are alike.
 *
 * Hues are OKLCH degrees: red≈25 · orange≈55 · yellow≈100 · green≈140 ·
 * teal≈190 · blue≈255 · violet≈300 · magenta≈340.
 */

export interface Mood {
  /** Center hue window in degrees; [lo, hi] may wrap past 360. */
  hue: [number, number];
  /** Center lightness window (OKLab L). */
  light: [number, number];
  /** Center chroma window. */
  chroma: [number, number];
  /** Floor for the board's average chroma — keeps boards from going gray. */
  minMeanChroma: number;
  /** Lightness every tile must stay within (keeps light moods airy). */
  field: [number, number];
  /** Widest hue range (degrees) the whole board may cover. */
  maxHueRange: number;
}

const m = (
  hue: [number, number],
  light: [number, number],
  chroma: [number, number],
  minMeanChroma = 0.035,
  extra: Partial<Pick<Mood, "field" | "maxHueRange">> = {},
): Mood => {
  // Default field band follows the mood's own lightness: airy moods stay
  // airy, deep moods may reach further down.
  const mid = (light[0] + light[1]) / 2;
  const field: [number, number] =
    mid >= 0.72 ? [0.5, 0.93] : mid >= 0.6 ? [0.4, 0.92] : [0.32, 0.88];
  return { hue, light, chroma, minMeanChroma, field, maxHueRange: 140, ...extra };
};

/** One mood per chapter, in chapter order (see CHAPTER_NAMES). */
export const CHAPTER_MOODS: readonly Mood[] = [
  m([5, 60], [0.7, 0.8], [0.06, 0.1]), //        DAWN — peach, rose, apricot
  m([265, 320], [0.55, 0.68], [0.06, 0.1]), //   EVENTIDE — lavender dusk
  m([150, 200], [0.6, 0.72], [0.05, 0.09]), //   VERDIGRIS — patina green-teal
  m([320, 360], [0.5, 0.64], [0.07, 0.12]), //   MULBERRY — berry purples
  m([45, 80], [0.76, 0.84], [0.07, 0.11], 0.035, { field: [0.56, 0.97] }), // SOLSTICE — gold light
  m([280, 330], [0.45, 0.58], [0.08, 0.13], 0.05), // GEODE — amethyst jewel
  m([185, 235], [0.58, 0.7], [0.05, 0.09]), //   TIDEPOOL — sea blues
  m([10, 40], [0.5, 0.62], [0.08, 0.12]), //     SUMAC — deep reds
  m([200, 250], [0.78, 0.86], [0.03, 0.06], 0.025), // GLACIER — ice
  m([45, 80], [0.68, 0.78], [0.08, 0.12], 0.035, { field: [0.5, 0.95] }), // LANTERN — warm amber
  m([340, 380], [0.74, 0.84], [0.05, 0.09]), //  PLUMERIA — blossom pinks
  m([30, 65], [0.55, 0.66], [0.04, 0.08]), //    OXIDE — rust & clay
  m([110, 150], [0.74, 0.84], [0.06, 0.1], 0.035, { field: [0.5, 0.96] }), // MEADOWLARK — spring greens
  m([280, 310], [0.5, 0.62], [0.04, 0.08]), //   VESPER — dusky violet
  m([255, 285], [0.45, 0.56], [0.08, 0.13], 0.05), // INDIGO — deep blue jewel
  m([60, 90], [0.78, 0.86], [0.08, 0.12], 0.035, { field: [0.56, 0.97] }), // SAFFRON — spice yellow
  m([120, 160], [0.58, 0.68], [0.04, 0.08]), //  MOSS — forest floor
  m([0, 50], [0.76, 0.84], [0.03, 0.06], 0.025), // CAMEO — powder & blush
  m([140, 320], [0.6, 0.72], [0.08, 0.12], 0.05, { maxHueRange: 220 }), // AURORA — anything luminous
  m([0, 360], [0.58, 0.7], [0.025, 0.05], 0.022, { maxHueRange: 360 }), // PETRICHOR — rain-soft neutrals
  m([160, 205], [0.74, 0.84], [0.04, 0.07]), //  SEAGLASS — frosted aqua
  m([355, 395], [0.55, 0.66], [0.1, 0.14], 0.05), // AMARYLLIS — vivid red-pink
  m([290, 380], [0.48, 0.6], [0.05, 0.09]), //   DUSK — plum to ember
  m([0, 360], [0.62, 0.74], [0.09, 0.13], 0.05, { maxHueRange: 220 }), // PRISM — the full wheel
];

/** Zen / Today: the whole wheel, the house look (soft, not neon). */
export const OPEN_MOOD: Mood = m([0, 360], [0.6, 0.78], [0.05, 0.1], 0.035, { maxHueRange: 180 });
