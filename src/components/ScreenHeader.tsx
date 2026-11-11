/** Every secondary screen's header: back, the title, and the logomark home. */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import HomeMark from "@/components/brand/HomeMark";
import { palette, spacing, type as typeScale } from "@/theme";

export default function ScreenHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        style={styles.side}
      >
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header" aria-level={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>
        <HomeMark size={30} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  side: { width: 56, height: 44, justifyContent: "center" },
  right: { alignItems: "flex-end" },
  backIcon: { color: palette.textDim, fontSize: 30, lineHeight: 32, paddingLeft: 8 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
});
