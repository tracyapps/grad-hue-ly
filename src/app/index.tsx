import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { chapterName } from "@/engine";
import { useProfile } from "@/state/profile";
import GradientBackdrop from "@/components/GradientBackdrop";
import Onboarding from "@/components/play/Onboarding";
import { font, palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export default function Home() {
  const level = useProfile((s) => s.level);
  const setLevel = useProfile((s) => s.setLevel);
  const onboarded = useProfile((s) => s.onboarded);
  const setOnboarded = useProfile((s) => s.setOnboarded);
  const reduceMotion = useProfile((s) => s.settings.reduceMotion);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayDone = useProfile((s) => s.today[todayKey]?.solved ?? false);

  const openLevel = (n: number) =>
    router.push({ pathname: "/play", params: { mode: "level", n: String(n) } });

  if (!onboarded) return <Onboarding onDone={setOnboarded} />;

  return (
    <View style={styles.root}>
      <GradientBackdrop reduceMotion={reduceMotion} />
      <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Wordmark */}
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark}>grad</Text>
          <Text style={[styles.wordmark, styles.wordmarkHue]}>[hue]</Text>
          <Text style={styles.wordmark}>ly</Text>
        </View>
        <Text style={styles.tagline}>endless gradients, at your pace</Text>

        {/* Continue */}
        <Pressable style={styles.cardPrimary} onPress={() => openLevel(level)}>
          <View style={styles.cardPrimaryLeft}>
            <Text style={styles.cardKicker}>continue</Text>
            <Text style={styles.cardTitle}>
              {chapterName(level)} · {level}
            </Text>
          </View>
          <View style={styles.steppers}>
            <Pressable
              hitSlop={10}
              style={styles.stepper}
              onPress={() => setLevel(Math.max(1, level - 25))}
              accessibilityLabel="Jump back 25 levels"
            >
              <Text style={styles.stepperText}>–25</Text>
            </Pressable>
            <Pressable
              hitSlop={10}
              style={styles.stepper}
              onPress={() => setLevel(level + 25)}
              accessibilityLabel="Jump ahead 25 levels"
            >
              <Text style={styles.stepperText}>+25</Text>
            </Pressable>
          </View>
        </Pressable>

        {/* Today + Zen */}
        <View style={styles.rowPair}>
          <Pressable
            style={[styles.card, styles.cardHalf]}
            onPress={() => router.push({ pathname: "/play", params: { mode: "today" } })}
          >
            <Text style={styles.cardKicker}>today</Text>
            <Text style={styles.cardTitleSmall}>
              {todayDone ? "solved ✓" : "a gradient for everyone"}
            </Text>
          </Pressable>
          <Pressable style={[styles.card, styles.cardHalf]} onPress={() => router.push("/zen")}>
            <Text style={styles.cardKicker}>zen</Text>
            <Text style={styles.cardTitleSmall}>free play</Text>
          </Pressable>
        </View>

        {/* Secondary */}
        <View style={styles.links}>
          <Pressable onPress={() => router.push("/gallery")}>
            <Text style={styles.link}>gallery</Text>
          </Pressable>
          <Text style={styles.linkDot}>·</Text>
          <Pressable onPress={() => router.push("/stats")}>
            <Text style={styles.link}>stats</Text>
          </Pressable>
          <Text style={styles.linkDot}>·</Text>
          <Pressable onPress={() => router.push("/settings")}>
            <Text style={styles.link}>settings</Text>
          </Pressable>
        </View>
      </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  wordmarkRow: { flexDirection: "row", justifyContent: "center" },
  wordmark: {
    ...typeScale.display,
    color: palette.text,
    fontFamily: font.bold,
    fontSize: 40,
    lineHeight: 46,
  },
  wordmarkHue: { color: palette.accent },
  tagline: {
    ...typeScale.small,
    ...trackedUpper,
    color: palette.textFaint,
    textAlign: "center",
    marginBottom: spacing.xl,
    opacity: 0.85,
  },
  stepper: {
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    opacity: 0.55,
  },
  cardPrimary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardPrimaryLeft: { flex: 1 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  cardHalf: { flex: 1 },
  cardKicker: { ...typeScale.small, ...trackedUpper, color: palette.accent },
  cardTitle: { ...typeScale.heading, color: palette.text, marginTop: 2 },
  cardTitleSmall: { ...typeScale.body, color: palette.textDim, marginTop: 2 },
  rowPair: { flexDirection: "row", gap: spacing.md },
  steppers: { flexDirection: "row", gap: spacing.sm },
  stepperText: { ...typeScale.small, color: palette.textDim, ...trackedUpper },
  links: { flexDirection: "row", justifyContent: "center", gap: spacing.md, marginTop: spacing.sm },
  link: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  linkDot: { color: palette.textFaint },
});
