import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import { useProfile } from "@/state/profile";
import type { ZenSize, ZenSubtlety } from "@/engine";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

const SIZES: Array<{ id: ZenSize; label: string; hint: string }> = [
  { id: "small", label: "small", hint: "5 × 6" },
  { id: "medium", label: "medium", hint: "7 × 9" },
  { id: "large", label: "large", hint: "9 × 12" },
  { id: "grand", label: "grand", hint: "10 × 14" },
];

const SUBTLETIES: Array<{ id: ZenSubtlety; label: string; hint: string }> = [
  { id: "gentle", label: "gentle", hint: "clear steps" },
  { id: "subtle", label: "subtle", hint: "soft whispers" },
  { id: "ethereal", label: "ethereal", hint: "barely there" },
];

export default function Zen() {
  const [size, setSize] = useState<ZenSize>("medium");
  const [subtlety, setSubtlety] = useState<ZenSubtlety>("subtle");
  const nextZenNonce = useProfile((s) => s.nextZenNonce);

  const begin = () => {
    const nonce = nextZenNonce();
    router.replace({
      pathname: "/play",
      params: { mode: "zen", v: String(nonce), size, subtlety },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.content}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>zen</Text>
        <Text style={styles.subtitle}>no levels, no locks, no numbers that matter</Text>

        <Text style={styles.sectionLabel}>board</Text>
        <View style={styles.grid}>
          {SIZES.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.choice, size === s.id && styles.choiceActive]}
              onPress={() => setSize(s.id)}
            >
              <Text style={[styles.choiceLabel, size === s.id && styles.choiceLabelActive]}>
                {s.label}
              </Text>
              <Text style={styles.choiceHint}>{s.hint}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>subtlety</Text>
        <View style={styles.grid}>
          {SUBTLETIES.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.choice, subtlety === s.id && styles.choiceActive]}
              onPress={() => setSubtlety(s.id)}
            >
              <Text style={[styles.choiceLabel, subtlety === s.id && styles.choiceLabelActive]}>
                {s.label}
              </Text>
              <Text style={styles.choiceHint}>{s.hint}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.begin} onPress={begin}>
          <Text style={styles.beginText}>begin</Text>
        </Pressable>
      </View>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bgMenu },
  back: { position: "absolute", top: spacing.sm, left: spacing.sm, zIndex: 1, padding: spacing.sm },
  backIcon: { color: palette.textDim, fontSize: 26 },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  title: { ...typeScale.display, color: palette.text },
  subtitle: { ...typeScale.body, color: palette.textDim, marginBottom: spacing.lg },
  sectionLabel: { ...typeScale.small, ...trackedUpper, color: palette.accent, marginTop: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  choiceActive: { borderColor: palette.accent, backgroundColor: palette.surfaceRaised },
  choiceLabel: { ...typeScale.heading, color: palette.textDim },
  choiceLabelActive: { color: palette.text },
  choiceHint: { ...typeScale.small, color: palette.textFaint },
  begin: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  beginText: { ...typeScale.label, ...trackedUpper, color: "#1D1208" },
});
