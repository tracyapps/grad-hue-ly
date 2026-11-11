/**
 * grad[hue]ly, set in Google Sans Flex — bold and a little rounded, with the
 * brackets light and quiet and "hue" filled with the signature gradient,
 * drifting through every color (grad·hue·ly — get it).
 */

import { Platform, Text, View } from "react-native";
import { useProfile } from "@/state/profile";
import { brand, face, palette } from "@/theme";

export default function Wordmark({ size = 40 }: { size?: number }) {
  const reduceMotion = useProfile((s) => s.settings.reduceMotion);

  if (Platform.OS === "web") {
    const base = {
      fontFamily: '"Google Sans Flex", "Outfit", system-ui, sans-serif',
      fontSize: size,
      lineHeight: 1.1,
      letterSpacing: "-0.02em",
      fontWeight: 720,
      fontVariationSettings: '"ROND" 15, "slnt" 0',
      color: palette.text,
      whiteSpace: "nowrap" as const,
    };
    const bracket = {
      fontWeight: 230,
      fontVariationSettings: '"ROND" 0, "slnt" 0',
      color: "#8E8896",
      margin: "0 0.02em",
    };
    return (
      <View accessibilityRole="header" aria-level={1} accessibilityLabel="grad[hue]ly">
        <span style={base} aria-hidden="true">
          grad<span style={bracket}>[</span>
          <span
            className={reduceMotion ? "gh-hue-text" : "gh-hue-text gh-hue-spin"}
            style={{ backgroundImage: `linear-gradient(90deg, ${brand.hue.join(", ")})` }}
          >
            hue
          </span>
          <span style={bracket}>]</span>ly
        </span>
      </View>
    );
  }

  const big = { fontSize: size, lineHeight: size * 1.15, ...face(720, 15), color: palette.text };
  return (
    <Text accessibilityRole="header" accessibilityLabel="grad[hue]ly" style={big}>
      grad<Text style={{ color: "#8E8896", ...face(230) }}>[</Text>
      <Text style={{ color: brand.rose }}>hue</Text>
      <Text style={{ color: "#8E8896", ...face(230) }}>]</Text>ly
    </Text>
  );
}
