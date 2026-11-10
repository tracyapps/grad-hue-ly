import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { chapterName } from "@/engine";
import { useProfile } from "@/state/profile";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function Stats() {
  const { level, solvedCount, totalMoves, bestMoves, gallery } = useProfile();

  const bests = Object.values(bestMoves);
  const avgMoves = bests.length
    ? Math.round(bests.reduce((s, b) => s + b, 0) / bests.length)
    : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>stats</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.content}>
        <View style={styles.statRow}>
          <Stat value={level - 1} label="levels solved" />
          <Stat value={solvedCount} label="puzzles played" />
        </View>
        <View style={styles.statRow}>
          <Stat value={avgMoves} label="avg moves" />
          <Stat value={gallery.length} label="in gallery" />
        </View>

        <Text style={styles.sectionLabel}>now playing</Text>
        <View style={styles.chapterCard}>
          <Text style={styles.chapterName}>{chapterName(level)}</Text>
          <Text style={styles.chapterMeta}>
            level {level} · {totalMoves} lifetime moves
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bgMenu },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: palette.textDim, fontSize: 26 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  statRow: { flexDirection: "row", gap: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  statValue: { ...typeScale.display, color: palette.text, fontVariant: ["tabular-nums"] },
  statLabel: { ...typeScale.small, ...trackedUpper, color: palette.textFaint },
  sectionLabel: { ...typeScale.small, ...trackedUpper, color: palette.accent, marginTop: spacing.lg },
  chapterCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  chapterName: { ...typeScale.heading, ...trackedUpper, color: palette.text },
  chapterMeta: { ...typeScale.body, color: palette.textDim },
});
