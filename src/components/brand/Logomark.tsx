/**
 * The "solved" logomark — a finished 6×6 board in the signature gradient,
 * slowly cycling through every hue (84 s per lap, like the design file).
 * Stops cycling for reduce-motion (system setting or the in-app one).
 */

import { Platform, View } from "react-native";
import { useProfile } from "@/state/profile";
import { MARK_COLORS } from "./markColors";

const CELL = 77.33;
const GAP = 85.33;

export default function Logomark({
  size = 40,
  animated = true,
  label = "grad[hue]ly",
}: {
  size?: number;
  animated?: boolean;
  /** Accessible name; pass "" when it sits beside the wordmark. */
  label?: string;
}) {
  const reduceMotion = useProfile((s) => s.settings.reduceMotion);
  const spin = animated && !reduceMotion;

  if (Platform.OS === "web") {
    const rects = MARK_COLORS.map((c, i) => {
      const x = 4 + (i % 6) * GAP;
      const y = 4 + Math.floor(i / 6) * GAP;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${CELL}" height="${CELL}" rx="17.01" fill="${c}"/>`;
    }).join("");
    const html = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" ${
      label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"'
    } style="display:block"><rect width="512" height="512" rx="116" fill="#101114"/><g class="${
      spin ? "gh-hue-spin" : ""
    }">${rects}</g></svg>`;
    return (
      <View style={{ width: size, height: size }}>
        <span style={{ display: "block", lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
      </View>
    );
  }

  // Native: the same board as plain views (static).
  const s = size / 512;
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label || undefined}
      style={{ width: size, height: size, borderRadius: 116 * s, backgroundColor: "#101114", overflow: "hidden" }}
    >
      {MARK_COLORS.map((c, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: (4 + (i % 6) * GAP) * s,
            top: (4 + Math.floor(i / 6) * GAP) * s,
            width: CELL * s,
            height: CELL * s,
            borderRadius: 17 * s,
            backgroundColor: c,
          }}
        />
      ))}
    </View>
  );
}
