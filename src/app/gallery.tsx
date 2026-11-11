import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlatList } from "react-native";
import MiniBoard from "@/components/MiniBoard";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import ScreenHeader from "@/components/ScreenHeader";
import { chapterName, generateEndless, generateLevel, generateToday, generateZen, quantizeField } from "@/engine";
import { useCommunity } from "@/sync/community";
import { parseGrid, useProfile, type GalleryItem } from "@/state/profile";
import { gradientField, useStudio } from "@/state/studio";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

/** A compact solved-board thumbnail — regenerated deterministically. */
function GradientCard({ item, worldSeed }: { item: GalleryItem; worldSeed: number }) {
  const gradients = useStudio((s) => s.gradients);
  const community = useCommunity((s) => s.boards);
  const size = parseGrid(item.grid);
  const board = useMemo((): { colors: string[]; cols: number; rows: number } | null => {
    if (item.kind === "studio" || item.kind === "community") {
      const src =
        item.kind === "studio"
          ? gradients.find((x) => x.id === item.studioId)
          : community.find((x) => x.id === item.boardId);
      if (!src) return null;
      const { cols, rows } = size ?? { cols: 7, rows: 9 };
      return { colors: quantizeField(gradientField(src, cols, rows), cols, rows), cols, rows };
    }
    const p =
      item.kind === "level" && item.level !== undefined
        ? generateLevel(item.level, worldSeed, size ?? undefined)
        : item.kind === "today" && item.dateISO
          ? generateToday(item.dateISO, worldSeed)
          : item.kind === "zen" && size && item.nonce !== undefined
            ? generateEndless(item.nonce, size.cols, size.rows, item.subtlety ?? "subtle", worldSeed)
            : generateZen(
                Number(item.key.split(":")[1]) || 0,
                { size: item.size, subtlety: item.subtlety },
                worldSeed,
              );
    return { colors: p.colors, cols: p.cols, rows: p.rows };
  }, [item, worldSeed, gradients, community, size]);

  const sizeText = size ? ` · ${size.cols}×${size.rows}` : "";
  const label =
    item.kind === "level"
      ? `${chapterName(item.level ?? 1).toLowerCase()} · ${item.level}${sizeText}`
      : item.kind === "today"
        ? `today · ${item.dateISO}`
        : item.kind === "studio"
          ? `studio${sizeText}`
          : item.kind === "community"
            ? `${item.boardName ?? "community"}${sizeText}`
            : `endless${sizeText}`;

  return (
    <View style={styles.card}>
      <View style={styles.cardArt}>
        {board ? (
          <MiniBoard colors={board.colors} cols={board.cols} rows={board.rows} height={120} />
        ) : (
          <View style={styles.cardMissing} />
        )}
      </View>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardMeta}>{item.moves} moves</Text>
    </View>
  );
}

export default function Gallery() {
  const gallery = useProfile((s) => s.gallery);
  const worldSeed = useProfile((s) => s.worldSeed);
  const [tab, setTab] = useState<"all" | "level" | "today" | "zen" | "studio" | "community">("all");

  const items = useMemo(
    () => (tab === "all" ? gallery : gallery.filter((g) => g.kind === tab)),
    [gallery, tab],
  );

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader title="gallery" />

        <View style={styles.tabs}>
          {(["all", "level", "zen", "community", "today", "studio"] as const).map((t) => (
            <Pressable accessibilityRole="button" key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === "zen" ? "endless" : t}</Text>
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
  safe: { flex: 1 },
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
    maxWidth: "50%",
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardArt: { height: 120, alignItems: "center", justifyContent: "center" },
  cardMissing: { width: 90, height: 120, borderRadius: radius.sm, backgroundColor: palette.surfaceRaised },
  cardLabel: { ...typeScale.small, ...trackedUpper, color: palette.text, marginTop: spacing.sm },
  cardMeta: { ...typeScale.small, color: palette.textFaint },
  empty: { ...typeScale.body, color: palette.textFaint, textAlign: "center", marginTop: spacing.xxl },
});
