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
import { gradientField, useStudio, type StudioGradient } from "@/state/studio";
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

/** One of your Studio creations — shown whether or not you've played it. */
function CreationCard({ g, best }: { g: StudioGradient; best?: number }) {
  const colors = useMemo(() => quantizeField(gradientField(g, 7, 9), 7, 9), [g]);
  const status = [best !== undefined ? `solved · ${best} moves` : "not solved yet", g.sharedId ? "shared" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${g.name}, ${status}. Open the studio`}
      onPress={() => router.push("/studio")}
      style={styles.card}
    >
      <View style={styles.cardArt}>
        <MiniBoard colors={colors} cols={7} rows={9} height={120} />
      </View>
      <Text style={styles.cardName} numberOfLines={1}>{g.name}</Text>
      <Text style={[styles.cardMeta, g.sharedId && styles.cardShared]}>{status}</Text>
    </Pressable>
  );
}

type Tab = "all" | "level" | "today" | "zen" | "studio" | "community";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "all solved" },
  { id: "level", label: "journey" },
  { id: "zen", label: "endless" },
  { id: "community", label: "community" },
  { id: "today", label: "today" },
  { id: "studio", label: "my studio" },
];

const EMPTY: Record<Tab, string> = {
  all: "nothing here yet — every board you solve collects itself here",
  level: "journey boards you solve will collect here",
  zen: "endless boards you solve will collect here",
  community: "community boards you solve will collect here",
  today: "solve today's board and it lands here",
  studio: "nothing crafted yet — make a gradient in the studio",
};

export default function Gallery() {
  const gallery = useProfile((s) => s.gallery);
  const worldSeed = useProfile((s) => s.worldSeed);
  const gradients = useStudio((s) => s.gradients);
  const [tab, setTab] = useState<Tab>("all");

  const items = useMemo(
    () => (tab === "all" ? gallery : gallery.filter((g) => g.kind === tab)),
    [gallery, tab],
  );
  /** Fewest moves per studio gradient, from your solves. */
  const bestByStudio = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gallery) {
      if (g.kind !== "studio" || !g.studioId) continue;
      const prev = m.get(g.studioId);
      if (prev === undefined || g.moves < prev) m.set(g.studioId, g.moves);
    }
    return m;
  }, [gallery]);

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader title="gallery" />

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable
              accessibilityRole="tab"
              aria-selected={tab === t.id}
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tab, tab === t.id && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "studio" ? (
          <FlatList
            key="studio"
            data={gradients}
            keyExtractor={(g) => g.id}
            numColumns={2}
            contentContainerStyle={styles.list}
            columnWrapperStyle={styles.listRow}
            ListHeaderComponent={
              gradients.length ? (
                <Text style={styles.intro}>
                  everything you've saved in the studio. share one from the studio to put it in the community.
                </Text>
              ) : undefined
            }
            ListEmptyComponent={<Text style={styles.empty}>{EMPTY.studio}</Text>}
            renderItem={({ item }) => <CreationCard g={item} best={bestByStudio.get(item.id)} />}
          />
        ) : (
          <FlatList
            key="solved"
            data={items}
            keyExtractor={(g) => g.key}
            numColumns={2}
            contentContainerStyle={styles.list}
            columnWrapperStyle={styles.listRow}
            ListEmptyComponent={<Text style={styles.empty}>{EMPTY[tab]}</Text>}
            renderItem={({ item }) => <GradientCard item={item} worldSeed={worldSeed} />}
          />
        )}
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
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md, flexWrap: "wrap", justifyContent: "center" },
  tab: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
  },
  tabActive: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  tabText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  tabTextActive: { color: palette.accent },
  list: { padding: spacing.lg, gap: spacing.md, maxWidth: 760, width: "100%", alignSelf: "center" },
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
  cardName: { ...typeScale.body, color: palette.text, marginTop: spacing.sm },
  cardShared: { color: "#7FD1A8" },
  intro: { ...typeScale.small, color: palette.textDim, textAlign: "center", marginBottom: spacing.sm },
  empty: { ...typeScale.body, color: palette.textDim, textAlign: "center", marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
});
