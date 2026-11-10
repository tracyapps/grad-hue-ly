import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlatList } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { galleryParams, useProfile, type GalleryItem } from "@/state/profile";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

/** A compact solved-board thumbnail, regenerated deterministically. */
function GradientCard({ item, worldSeed }: { item: GalleryItem; worldSeed: number }) {
  const colors = useMemo(() => {
    const { regenerate } = galleryParams(item);
    const puzzle = regenerate(worldSeed);
    const n = puzzle.colors.length;
    // Sample up to 18 stops along the solved diagonal.
    return Array.from({ length: Math.min(n, 18) }, (_, i) =>
      puzzle.colors[Math.round((i * (n - 1)) / 17)],
    ) as [string, string, ...string[]];
  }, [item, worldSeed]);

  const label =
    item.kind === "level"
      ? `level ${item.level}`
      : item.kind === "today"
        ? `today · ${item.dateISO}`
        : "zen";

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardStrip}
      />
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardMeta}>{item.moves} moves</Text>
    </View>
  );
}

export default function Gallery() {
  const gallery = useProfile((s) => s.gallery);
  const worldSeed = useProfile((s) => s.worldSeed);
  const [tab, setTab] = useState<"all" | "level" | "today" | "zen">("all");

  const items = useMemo(
    () => (tab === "all" ? gallery : gallery.filter((g) => g.kind === tab)),
    [gallery, tab],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>gallery</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.tabs}>
        {(["all", "level", "today", "zen"] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(g) => g.key}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.listRow}
        ListEmptyComponent={
          <Text style={styles.empty}>nothing here yet — solved gradients collect themselves</Text>
        }
        renderItem={({ item }) => <GradientCard item={item} worldSeed={worldSeed} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bgMenu },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: palette.textDim, fontSize: 26 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
  },
  tabActive: { backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.accent },
  tabText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  tabTextActive: { color: palette.accent },
  list: { padding: spacing.lg, gap: spacing.md },
  listRow: { gap: spacing.md },
  card: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardStrip: { width: "100%", height: 64, borderRadius: radius.sm },
  cardLabel: { ...typeScale.small, ...trackedUpper, color: palette.text, marginTop: spacing.sm },
  cardMeta: { ...typeScale.small, color: palette.textFaint },
  empty: { ...typeScale.body, color: palette.textFaint, textAlign: "center", marginTop: spacing.xxl },
});
