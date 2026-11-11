import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useState } from "react";
import BoardSheet from "@/components/BoardSheet";
import type { BoardChoice } from "@/components/BoardPicker";
import { chapterName, generateLevel } from "@/engine";
import MiniBoard from "@/components/MiniBoard";
import Logomark from "@/components/brand/Logomark";
import Wordmark from "@/components/brand/Wordmark";
import { useAccount } from "@/sync/account";
import { accountsAvailable } from "@/sync/auth";
import { useProfile } from "@/state/profile";
import GradientBackdrop from "@/components/GradientBackdrop";
import Onboarding from "@/components/play/Onboarding";
import { face, font, palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export default function Home() {
  const level = useProfile((s) => s.level);
  const setLevel = useProfile((s) => s.setLevel);
  const onboarded = useProfile((s) => s.onboarded);
  const setOnboarded = useProfile((s) => s.setOnboarded);
  const reduceMotion = useProfile((s) => s.settings.reduceMotion);
  const worldSeed = useProfile((s) => s.worldSeed);
  const accountStatus = useAccount((s) => s.status);
  const syncing = useAccount((s) => s.syncing);
  const username = useAccount((s) => s.username);
  const todayKey = new Date().toISOString().slice(0, 10);
  const journeySize = useProfile((s) => s.settings.journeySize);
  const endless = useProfile((s) => s.settings.endless);
  const updateSettings = useProfile((s) => s.updateSettings);
  const fixed = journeySize.mode === "fixed" ? journeySize : undefined;
  const next = useMemo(
    () => generateLevel(level, worldSeed, fixed && { cols: fixed.cols, rows: fixed.rows }),
    [level, worldSeed, fixed],
  );
  const [sizing, setSizing] = useState<BoardChoice | null>(null);
  const sizingPreview = useMemo(() => {
    if (!sizing) return null;
    const pz = generateLevel(level, worldSeed, sizing);
    return { colors: pz.colors, cols: pz.cols, rows: pz.rows };
  }, [sizing, level, worldSeed]);
  const todayDone = useProfile((s) => s.today[todayKey]?.solved ?? false);

  const openLevel = (n: number) =>
    router.push({ pathname: "/play", params: { mode: "level", n: String(n) } });

  if (!onboarded) return <Onboarding onDone={setOnboarded} />;

  return (
    <View style={styles.root}>
      <GradientBackdrop reduceMotion={reduceMotion} palette={next} variant="hero" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
      {accountsAvailable() && accountStatus !== "unknown" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accountStatus === "signed-in" ? "Account: signed in, progress synced" : "Sign in to sync your progress"}
          onPress={() => router.push("/account")}
          style={styles.accountChip}
        >
          <View style={[styles.accountDot, accountStatus === "signed-in" && styles.accountDotOn]} />
          <Text style={styles.accountChipText}>
            {accountStatus === "signed-in" ? (syncing ? "syncing" : username ? `@${username}` : "synced") : "sign in"}
          </Text>
        </Pressable>
      )}
      <ScrollView contentContainerStyle={styles.content}>
        {/* Wordmark */}
        <View style={styles.wordmarkRow}>
          <Logomark size={52} label="" />
          <Wordmark size={46} />
        </View>
        <Text style={styles.tagline}>endless gradients, at your pace</Text>

        {/* Continue */}
        <Pressable
          style={styles.cardPrimary}
          onPress={() => openLevel(level)}
          accessibilityRole="button"
          accessibilityLabel={`Continue: ${chapterName(level)}, level ${level}`}
        >
          <MiniBoard colors={next.colors} cols={next.cols} rows={next.rows} height={58} radius={6} />
          <View style={styles.cardPrimaryLeft}>
            <Text style={styles.cardKicker}>continue</Text>
            <Text style={styles.cardTitle}>
              {chapterName(level)} · {level}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Journey board size: ${fixed ? `always ${fixed.cols} by ${fixed.rows}` : "grows with the levels"}. Change`}
              hitSlop={8}
              onPress={() => setSizing({ cols: next.cols, rows: next.rows })}
              style={styles.sizeChip}
            >
              <Text style={styles.sizeChipText}>
                {next.cols}×{next.rows} · {fixed ? "your size" : "grows"} ▾
              </Text>
            </Pressable>
          </View>
          <View style={styles.steppers}>
            <Pressable accessibilityRole="button"
              hitSlop={10}
              style={styles.stepper}
              onPress={() => setLevel(Math.max(1, level - 25))}
              accessibilityLabel="Jump back 25 levels"
            >
              <Text style={styles.stepperText}>–25</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              hitSlop={10}
              style={styles.stepper}
              onPress={() => setLevel(level + 25)}
              accessibilityLabel="Jump ahead 25 levels"
            >
              <Text style={styles.stepperText}>+25</Text>
            </Pressable>
          </View>
        </Pressable>

        {/* Endless + Community */}
        <View style={styles.rowPair}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Endless: ${endless.cols} by ${endless.rows}. Choose your board and play forever`}
            style={[styles.card, styles.cardHalf]}
            onPress={() => router.push("/endless")}
          >
            <Text style={styles.cardKicker}>endless</Text>
            <Text style={styles.cardTitleSmall}>
              your board, forever · {endless.cols}×{endless.rows}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.card, styles.cardHalf]}
            onPress={() => router.push("/community")}
          >
            <Text style={styles.cardKicker}>community</Text>
            <Text style={styles.cardTitleSmall}>boards made by players</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          style={[styles.card, styles.cardSlim]}
          onPress={() => router.push({ pathname: "/play", params: { mode: "today" } })}
        >
          <Text style={styles.cardKicker}>today</Text>
          <Text style={styles.cardTitleSmall}>
            {todayDone ? "solved ✓ — see you tomorrow" : "one gradient, shared by everyone"}
          </Text>
        </Pressable>

        {/* Secondary */}
        <View style={styles.links}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/gallery")}>
            <Text style={styles.link}>gallery</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/stats")}>
            <Text style={styles.link}>stats</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/settings")}>
            <Text style={styles.link}>settings</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/about")}>
            <Text style={styles.link}>about</Text>
          </Pressable>
          {Platform.OS === "web" && (
            <>
              <Pressable accessibilityRole="button" onPress={() => router.push("/studio")}>
                <Text style={styles.link}>studio</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
      </SafeAreaView>
      <BoardSheet
        visible={sizing !== null}
        title="journey board size"
        byline={`${chapterName(level).toLowerCase()} · level ${level}`}
        value={sizing ?? { cols: next.cols, rows: next.rows }}
        onChange={setSizing}
        preview={sizingPreview}
        note={{ text: "every journey level will use this size — its colors stay the same", warn: false }}
        playLabel="use this size"
        onPlay={() => {
          if (sizing) updateSettings({ journeySize: { mode: "fixed", cols: sizing.cols, rows: sizing.rows } });
          setSizing(null);
        }}
        onClose={() => setSizing(null)}
        footer={
          fixed ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                updateSettings({ journeySize: { ...journeySize, mode: "grow" } });
                setSizing(null);
              }}
              style={styles.growButton}
            >
              <Text style={styles.growText}>let boards grow with the levels instead</Text>
            </Pressable>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  accountChip: {
    position: "absolute",
    top: spacing.md,
    right: spacing.lg,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: "#17141BD9",
    borderWidth: 1,
    borderColor: palette.line,
  },
  accountDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.textFaint },
  accountDotOn: { backgroundColor: "#7FD1A8" },
  accountChipText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
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
  wordmarkRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14 },
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
  cardMeta: { ...typeScale.small, color: palette.textFaint, marginTop: 2 },
  cardSlim: { paddingVertical: spacing.lg },
  sizeChip: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: spacing.md,
    minHeight: 30,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
  },
  sizeChipText: { ...typeScale.small, color: palette.textDim, ...face(560, 10) },
  growButton: { alignItems: "center", paddingVertical: spacing.md },
  growText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  cardTitleSmall: { ...typeScale.body, color: palette.textDim, marginTop: 2 },
  rowPair: { flexDirection: "row", gap: spacing.md },
  steppers: { flexDirection: "row", gap: spacing.sm },
  stepperText: { ...typeScale.small, color: palette.textDim, ...trackedUpper },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignSelf: "center",
    columnGap: spacing.lg,
    rowGap: 0,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 0,
    borderRadius: radius.pill,
    // a quiet scrim so the links stay legible over the living terrain
    backgroundColor: "#17141BD9",
  },
  // padded so every link is a comfortable ≥ 40px target
  link: { ...typeScale.small, ...trackedUpper, color: palette.textDim, paddingVertical: 12, paddingHorizontal: 2 },
  linkDot: { color: palette.textFaint },
});
