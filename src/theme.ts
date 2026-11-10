/**
 * Design tokens. gradhuely is dark-forward: near-black boards let the
 * gradients carry all the color, while menus stay quiet and modern.
 */

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
  /** Accent — soft coral, echoing the original's warmth. */
  accent: "#E08E6D",
  accentSoft: "#E08E6D33",
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

export const type = {
  /** Big display numerals/titles. */
  display: { fontSize: 34, lineHeight: 40, fontFamily: font.bold },
  title: { fontSize: 24, lineHeight: 30, fontFamily: font.bold },
  heading: { fontSize: 17, lineHeight: 22, fontFamily: font.semiBold },
  body: { fontSize: 15, lineHeight: 21, fontFamily: font.regular },
  label: { fontSize: 13, lineHeight: 18, fontFamily: font.semiBold },
  small: { fontSize: 11, lineHeight: 15, fontFamily: font.medium },
} as const;

/** Chapter labels etc. — the letter-spaced uppercase from the originals. */
export const trackedUpper = {
  textTransform: "uppercase",
  letterSpacing: 2.4,
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
