/**
 * The community gallery: boards made in the Studio and shared by players.
 * Pick one, choose its size, play — then keep going with "next board" or
 * "surprise me" right from the solved screen.
 */

import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import ScreenHeader from "@/components/ScreenHeader";
import MiniBoard from "@/components/MiniBoard";
import BoardSheet from "@/components/BoardSheet";
import type { BoardChoice } from "@/components/BoardPicker";
import { fieldQuality, hexToLab, isAmbiguous, quantizeField } from "@/engine";
import { gradientField } from "@/state/studio";
import { useCommunity, type CommunityBoard, type CommunitySort } from "@/sync/community";
import { accountsAvailable } from "@/sync/auth";
import { useAccount } from "@/sync/account";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

const THUMB = { cols: 7, rows: 9 };

function Card({ board, onOpen }: { board: CommunityBoard; onOpen: () => void }) {
  const colors = useMemo(
    () => quantizeField(gradientField(board, THUMB.cols, THUMB.rows), THUMB.cols, THUMB.rows),
    [board],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${board.name} by ${board.author}. Choose a size and play`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardArt}>
        <MiniBoard colors={colors} cols={THUMB.cols} rows={THUMB.rows} height={132} radius={radius.sm} />
      </View>
      <Text style={styles.cardName} numberOfLines={1}>
        {board.name}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        @{board.author}
        {board.solves > 0 ? ` · ${board.solves} ${board.solves === 1 ? "solve" : "solves"}` : ""}
      </Text>
    </Pressable>
  );
}

export default function Community() {
  const { boards, loading, error, next, sort } = useCommunity();
  const load = useCommunity((s) => s.load);
  const loadMore = useCommunity((s) => s.loadMore);
  const signedIn = useAccount((s) => s.status === "signed-in");
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<CommunityBoard | null>(null);
  const [choice, setChoice] = useState<BoardChoice>({ cols: 7, rows: 9 });

  useEffect(() => {
    if (!useCommunity.getState().loadedAt) void load("new");
  }, [load]);

  const preview = useMemo(() => {
    if (!open) return null;
    return {
      colors: quantizeField(gradientField(open, choice.cols, choice.rows), choice.cols, choice.rows),
      cols: choice.cols,
      rows: choice.rows,
    };
  }, [open, choice]);

  const note = useMemo(() => {
    if (!preview) return null;
    const q = fieldQuality(preview.colors.map(hexToLab), preview.cols, preview.rows);
    if (isAmbiguous(q)) return { text: "at this size some tiles look alike — try fewer tiles", warn: true };
    if (q.minStep < 0.02) return { text: "very faint at this size — expert territory", warn: true };
    return null;
  }, [preview]);

  const columns = Math.max(2, Math.min(5, Math.floor((Math.min(width, 1100) - 32) / 180)));

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="community" />

        <View style={styles.toolbar}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(["new", "popular"] as CommunitySort[]).map((s) => (
              <Pressable
                key={s}
                accessibilityRole="tab"
                aria-selected={sort === s}
                onPress={() => void load(s)}
                style={[styles.tab, sort === s && styles.tabOn]}
              >
                <Text style={[styles.tabText, sort === s && styles.tabTextOn]}>{s}</Text>
              </Pressable>
            ))}
          </View>
          {boards.length > 1 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const b = useCommunity.getState().random();
                if (b) {
                  setChoice({ cols: 7, rows: 9 });
                  setOpen(b);
                }
              }}
              style={styles.surprise}
            >
              <Text style={styles.surpriseText}>surprise me</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          key={columns}
          data={boards}
          keyExtractor={(b) => b.id}
          numColumns={columns}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.row}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <View style={{ flex: 1 / columns }}>
              <Card
                board={item}
                onOpen={() => {
                  setChoice({ cols: 7, rows: 9 });
                  setOpen(item);
                }}
              />
            </View>
          )}
          ListHeaderComponent={
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(signedIn || !accountsAvailable() ? "/studio" : "/settings")}
              style={styles.share}
            >
              <Text style={styles.shareTitle}>share your own</Text>
              <Text style={styles.shareBody}>
                {signedIn
                  ? "make a board in the studio, then tap “share” on it"
                  : "sign in, then make a board in the studio and share it here"}
              </Text>
            </Pressable>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={palette.textDim} style={{ marginTop: spacing.xxl }} />
            ) : (
              <Text style={styles.empty}>
                {error ?? "no boards yet — be the first to share one from the studio"}
              </Text>
            )
          }
          ListFooterComponent={
            loading && boards.length > 0 ? <ActivityIndicator color={palette.textDim} /> : next === null && boards.length > 0 ? (
              <Text style={styles.empty}>that's everything — for now</Text>
            ) : undefined
          }
        />
      </SafeAreaView>

      <BoardSheet
        visible={open !== null}
        title={open?.name ?? ""}
        byline={open ? `by @${open.author}` : undefined}
        value={choice}
        onChange={setChoice}
        preview={preview}
        note={note}
        onPlay={() => {
          if (!open) return;
          const id = open.id;
          setOpen(null);
          router.push({
            pathname: "/play",
            params: { mode: "community", id, cols: String(choice.cols), rows: String(choice.rows) },
          });
        }}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: palette.textDim, fontSize: 26 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
  },
  tabs: { flexDirection: "row", gap: 4, backgroundColor: palette.surface, borderRadius: radius.pill, padding: 3 },
  tab: { paddingHorizontal: spacing.lg, minHeight: 36, justifyContent: "center", borderRadius: radius.pill },
  tabOn: { backgroundColor: palette.surfaceRaised },
  tabText: { ...typeScale.small, ...trackedUpper, color: palette.textFaint },
  tabTextOn: { color: palette.text },
  surprise: {
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    justifyContent: "center",
  },
  surpriseText: { ...typeScale.small, ...trackedUpper, color: palette.accent },
  list: { padding: spacing.lg, gap: spacing.md, maxWidth: 1100, width: "100%", alignSelf: "center", paddingBottom: 80 },
  row: { gap: spacing.md },
  card: {
    backgroundColor: "#1F1B24EE",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  cardPressed: { opacity: 0.8 },
  cardArt: { height: 132, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  cardName: { ...typeScale.body, color: palette.text },
  cardMeta: { ...typeScale.small, color: palette.textDim },
  share: {
    borderWidth: 1,
    borderColor: palette.line,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
    marginBottom: spacing.sm,
    backgroundColor: "#17141BCC",
  },
  shareTitle: { ...typeScale.small, ...trackedUpper, color: palette.accent },
  shareBody: { ...typeScale.small, color: palette.textDim },
  empty: { ...typeScale.body, color: palette.textFaint, textAlign: "center", marginTop: spacing.xl },
});
