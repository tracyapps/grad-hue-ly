/**
 * Endless — no levels, no finish line: pick the board you enjoy (any size,
 * any contrast) and play fresh gradients forever. Your choice is remembered.
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import BoardPicker, { type BoardChoice } from "@/components/BoardPicker";
import { generateEndless } from "@/engine";
import { useProfile } from "@/state/profile";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export default function Endless() {
  const endless = useProfile((s) => s.settings.endless);
  const updateSettings = useProfile((s) => s.updateSettings);
  const nextNonce = useProfile((s) => s.nextZenNonce);
  const worldSeed = useProfile((s) => s.worldSeed);
  const zenNonce = useProfile((s) => s.zenNonce);
  const [peek, setPeek] = useState(0);

  const choice: BoardChoice = endless;
  const preview = useMemo(() => {
    const p = generateEndless(zenNonce + peek, choice.cols, choice.rows, choice.subtlety ?? "subtle", worldSeed);
    return { colors: p.colors, cols: p.cols, rows: p.rows };
  }, [zenNonce, peek, choice.cols, choice.rows, choice.subtlety, worldSeed]);

  const begin = () => {
    // Skip past any colors already peeked at so "begin" plays what you saw.
    let nonce = nextNonce();
    for (let i = 0; i < peek; i++) nonce = nextNonce();
    router.replace({
      pathname: "/play",
      params: {
        mode: "endless",
        v: String(nonce),
        cols: String(endless.cols),
        rows: String(endless.rows),
        sub: endless.subtlety,
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">endless</Text>
          <View style={styles.back} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            no levels to grind through — choose the board you love and play new gradients forever.
          </Text>
          <View style={styles.card}>
            <BoardPicker
              value={choice}
              onChange={(c) =>
                updateSettings({ endless: { cols: c.cols, rows: c.rows, subtlety: c.subtlety ?? "subtle" } })
              }
              preview={preview}
              showSubtlety
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show different colors"
              onPress={() => setPeek((v) => v + 1)}
              style={styles.peek}
            >
              <Text style={styles.peekText}>show me other colors</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" style={styles.begin} onPress={begin}>
            <Text style={styles.beginText}>
              begin · {endless.cols}×{endless.rows}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: palette.textDim, fontSize: 26 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
  content: { padding: spacing.xl, gap: spacing.lg, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 60 },
  subtitle: { ...typeScale.body, color: palette.textDim, textAlign: "center" },
  card: { backgroundColor: "#1F1B24EE", borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  peek: { alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 40, justifyContent: "center" },
  peekText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  begin: { backgroundColor: palette.accent, borderRadius: radius.pill, paddingVertical: 15, alignItems: "center" },
  beginText: { ...typeScale.label, ...trackedUpper, color: "#1D1208" },
});
