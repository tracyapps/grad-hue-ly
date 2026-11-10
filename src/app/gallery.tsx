import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlatList } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import { generateLevel, generateToday, generateZen } from "@/engine";
import { useProfile, type GalleryItem } from "@/state/profile";
import { useStudio } from "@/state/studio";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

/** A compact solved-board thumbnail — regenerated deterministically. */
function GradientCard({ item, worldSeed }: { item: GalleryItem; worldSeed: number }) {
  const gradients = useStudio((s) => s.gradients);

  const colors = useMemo((): [string, string, ...string[]] => {
    let source: string[] = [];
    if (item.kind === "studio" && item.studioId) {
      const g = gradients.find((x) => x.id === item.studioId);
      source = g ? g.canonical : [];
    } else if (item.kind === "level" && item.level !== undefined) {
      source = generateLevel(item.level, worldSeed).colors;
    } else if (item.kind === "today" && item.dateISO) {
      source = generateToday(item.dateISO, worldSeed).colors;
    } else {
      const nonce = Number(item.key.split(":")[1]) || 0;
      source = generateZen(nonce, { size: item.size, subtlety: item.subtlety }, worldSeed).colors;
    }
    const n = source.length;
    if (n === 0) return ["#282330", "#3A3442", "#282330"];
    // Sample up to 16 stops along the solved diagonal.
    return Array.from({ length: Math.min(n, 16) }, (_, i) =>
      source[Math.round((i * (n - 1)) / (Math.min(n, 16) - 1))],
    ) as [string, string, ...string[]];
  }, [item, worldSeed, gradients]);

  const label =
    item.kind === "level"
      ? `level ${item.level}`
      : item.kind === "today"
        ? `today · ${item.dateISO}`
        : item.kind === "studio"
          ? `studio · ${item.grid ?? ""}`
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
  const [tab, setTab] = useState<"all" | "level" | "today" | "zen" | "studio">("all");

  const items = useMemo(
    () => (tab === "all" ? gallery : gallery.filter((g) => g.kind === tab)),
    [gallery, tab],
  );

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.title}>gallery</Text>
          <View style={styles.back} />
        </View>

        <View style={styles.tabs}>
          {(["all", "level", "today", "zen", "studio"] as const).map((t) => (
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
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bgMenu },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: palette.textDim, fontSize: 26 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md, flexWrap: "wrap" },
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
