/**
 * "tapps made this. support her work →" — the little signature line at the
 * bottom of home and about. On web the links are real anchors (the external
 * one opens in a new tab); on native they open via Linking / the router.
 */

import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { palette, radius, spacing, type as typeScale } from "@/theme";

const SITE = "https://tapps.design";
const WEB = Platform.OS === "web";

export default function MadeBy() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.line}>
        <Text
          accessibilityRole="link"
          accessibilityLabel="tapps (opens tapps.design in a new tab)"
          style={styles.link}
          {...(WEB
            ? ({ href: SITE, hrefAttrs: { target: "_blank", rel: "noopener" } } as object)
            : { onPress: () => void Linking.openURL(SITE) })}
        >
          tapps
        </Text>{" "}
        made this.
      </Text>
      <Link href="/support" style={styles.support} accessibilityRole="link">
        support her work →
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    columnGap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    // same quiet scrim as the home links, so it reads over the terrain
    backgroundColor: "#17141BD9",
  },
  line: { ...typeScale.small, color: palette.textDim, paddingVertical: 12 },
  link: { color: palette.text, textDecorationLine: "underline" },
  support: { ...typeScale.small, color: palette.accent, paddingVertical: 12, textDecorationLine: "underline" },
});
