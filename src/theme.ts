/**
 * Design tokens. gradhuely is dark-forward: near-black boards let the
 * gradients carry all the color, while menus stay quiet and modern.
 *
 * Type: Google Sans Flex (variable) on the web — bold, slightly rounded
 * headlines (ROND 15, 650–720) over light-to-regular, unrounded body text
 * (ROND 0, ~340). Native builds fall back to Outfit until the font ships
 * in the app bundle.
 */

import { Platform, type TextStyle } from "react-native";

export const palette = {
  /** Gameplay backdrop — matches the near-black of the original. */
  bgPlay: "#141118",
  /** Menu backdrop. */
  bgMenu: "#17141B",
  /** Elevated surfaces (sheets, cards). */
  surface: "#1F1B24",
  surfaceRaised: "#282330",
  /** Warm off-white text. */
  text: "#ECE7E1",
  textDim: "#ABA4AF",
  /** Quietest text — still ≥ 4.5:1 on every surface (WCAG AA). */
  textFaint: "#958E9C",
  /** Accent — the brand's rose (≥ 6:1 on every surface; dark text on it 7.5:1). */
  accent: "#FF7A8C",
  accentSoft: "#FF7A8C2E",
  /** Text on accent-filled buttons. */
  onAccent: "#1A0F14",
  /** Hairlines. */
  line: "#FFFFFF14",
  /** Locked anchor marker dot. */
  lockDot: "#000000AA",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

/** Loaded in the root layout via expo-google-fonts. */
export const font = {
  regular: "Outfit",
  medium: "Outfit-Medium",
  semiBold: "Outfit-SemiBold",
  bold: "Outfit-Bold",
} as const;

/** The brand signature gradient (from the identity palette). */
export const brand = {
  violet: "#9264EF",
  orchid: "#F674D0",
  rose: "#FF687E",
  amber: "#FFC43D",
  /** The [hue] treatment: orchid → rose → amber. */
  hue: ["#F674D0", "#FF687E", "#FFC43D"] as const,
} as const;

const WEB = Platform.OS === "web";
export const FLEX_FAMILY = '"Google Sans Flex", "Outfit", system-ui, -apple-system, sans-serif';

/**
 * A Google Sans Flex face: any weight 1–1000 and roundness 0–100 (web).
 * On native it falls back to the nearest Outfit cut.
 */
export function face(weight: number, round = 0): TextStyle {
  if (WEB) {
    return {
      fontFamily: FLEX_FAMILY,
      fontWeight: String(Math.round(weight)) as TextStyle["fontWeight"],
      // react-native-web passes this straight through to CSS
      ...({ fontVariationSettings: `"ROND" ${round}, "slnt" 0` } as object),
    };
  }
  const cut = weight >= 650 ? font.bold : weight >= 540 ? font.semiBold : weight >= 440 ? font.medium : font.regular;
  return { fontFamily: cut };
}

export const type = {
  /** Big display numerals/titles. */
  display: { fontSize: 34, lineHeight: 40, ...face(720, 15) },
  title: { fontSize: 24, lineHeight: 30, ...face(690, 15) },
  heading: { fontSize: 17, lineHeight: 22, ...face(640, 15) },
  body: { fontSize: 15, lineHeight: 22, ...face(340, 0) },
  label: { fontSize: 13, lineHeight: 18, ...face(620, 15) },
  small: { fontSize: 12, lineHeight: 16, ...face(400, 0) },
} as const;

/**
 * Chapter labels, buttons, kickers — letter-spaced uppercase. Tiny caps need
 * more weight than body text to stay legible, so this also sets the face.
 */
export const trackedUpper = {
  textTransform: "uppercase",
  letterSpacing: 2.2,
  ...face(600, 15),
} as const;

/** Default tile spring — the feel of the whole game lives here. */
export const tileSpring = {
  stiffness: 320,
  damping: 30,
  mass: 1,
} as const;

export const uiSpring = {
  stiffness: 260,
  damping: 26,
  mass: 1,
} as const;
