/**
 * PlayScreen — the game state machine.
 *
 * revealing (solved board breathes; tap to skip) → playing (drag to swap) →
 * solved (ripple + sheet). No timer anywhere; the move count is a quiet
 * footnote in the corner, exactly as promised.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Board, { BoardPhase } from "./Board";
import MiniBoard from "@/components/MiniBoard";
import {
  applySwap,
  applyCornerLocks,
  cornerCells,
  isSolved,
  type Puzzle,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";
import { useProfile } from "@/state/profile";
import { hapticDrop, hapticSolve } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export type PlayKind = "level" | "today" | "zen" | "studio";

interface PlayScreenProps {
  puzzle: Puzzle;
  kind: PlayKind;
  level?: number;
  size?: ZenSize;
  subtlety?: ZenSubtlety;
  studioId?: string;
  grid?: string;
  zenNonce?: number;
  title: string;
  subtitle: string;
  onNext: () => void;
  onExit: () => void;
}

export default function PlayScreen({
  puzzle,
  kind,
  level,
  size,
  subtlety,
  studioId,
  grid,
  zenNonce,
  title,
  subtitle,
  onNext,
  onExit,
}: PlayScreenProps) {
  const reduceMotion = useProfile((s) => s.settings.reduceMotion);
  const cornerAssist = useProfile((s) => s.settings.cornerAssist);
  const showMoves = useProfile((s) => s.settings.showMoves);
  const recordSolve = useProfile((s) => s.recordSolve);

  const locked = useMemo(
    () => (cornerAssist ? cornerCells(puzzle.cols, puzzle.rows) : []),
    [cornerAssist, puzzle.cols, puzzle.rows],
  );

  const [phase, setPhase] = useState<BoardPhase>("revealing");
  const [placement, setPlacement] = useState<number[]>(() =>
    puzzle.placement.map((_, i) => i),
  );
  const [moves, setMoves] = useState(0);
  const [celebrateOrigin, setCelebrateOrigin] = useState<number | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const recorded = useRef(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shuffledStart = useMemo(
    () =>
      cornerAssist
        ? applyCornerLocks(puzzle.placement, puzzle.cols, puzzle.rows)
        : puzzle.placement,
    [puzzle.placement, puzzle.cols, puzzle.rows, cornerAssist],
  );

  const startShuffle = useCallback(() => {
    if (revealTimer.current) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    setPhase((p) => (p === "revealing" ? "playing" : p));
    setPlacement(shuffledStart);
  }, [shuffledStart]);

  useEffect(() => {
    revealTimer.current = setTimeout(startShuffle, puzzle.params.revealMs);
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, [startShuffle, puzzle.params.revealMs]);

  const handleSolved = useCallback(
    (originCell: number, moveCount: number) => {
      setCelebrateOrigin(originCell);
      setPhase("solved");
      hapticSolve();
      playSound("solve");
      if (!recorded.current) {
        recorded.current = true;
        recordSolve({
          kind,
          level,
          size,
          subtlety,
          studioId,
          grid,
          zenNonce,
          moves: moveCount,
        });
      }
      // Let the seams close and the finished gradient breathe before the sheet.
      setTimeout(() => setSheetVisible(true), reduceMotion ? 700 : 2100);
    },
    [kind, level, size, subtlety, studioId, grid, zenNonce, recordSolve, reduceMotion],
  );

  const onSwap = useCallback(
    (from: number, to: number) => {
      if (phase !== "playing") return;
      const next = applySwap(placement, from, to);
      setPlacement(next);
      setMoves((m) => m + 1);
      setHintVisible(false);
      hapticDrop();
      playSound("drop");
      if (isSolved(next)) handleSolved(to, moves + 1);
    },
    [phase, placement, moves, handleSolved],
  );

  /** Rescue action: place the four corners, free of charge. */
  const setCorners = useCallback(() => {
    if (phase !== "playing") return;
    const next = applyCornerLocks(placement, puzzle.cols, puzzle.rows);
    if (next.every((t, i) => t === placement[i])) return;
    setPlacement(next);
    setHintVisible(false);
    hapticDrop();
    playSound("drop");
    if (isSolved(next)) handleSolved(cornerCells(puzzle.cols, puzzle.rows)[0], moves);
  }, [phase, placement, puzzle.cols, puzzle.rows, handleSolved, moves]);

  const restart = useCallback(() => {
    recorded.current = false;
    setSheetVisible(false);
    setCelebrateOrigin(null);
    setMoves(0);
    setPlacement(puzzle.placement.map((_, i) => i));
    setPhase("revealing");
    revealTimer.current = setTimeout(startShuffle, puzzle.params.revealMs);
  }, [puzzle, startShuffle]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* HUD */}
      <View style={styles.hud}>
        <Pressable accessibilityRole="button"
          hitSlop={12}
          onPress={onExit}
          style={styles.hudButton}
          accessibilityLabel="Leave puzzle"
        >
          <Text style={styles.hudIcon}>‹</Text>
        </Pressable>
        <View style={styles.hudTitle}>
          <Text style={styles.hudTitleText}>{title}</Text>
          <Text style={styles.hudSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.hudMovesWrap}>
          {!cornerAssist && phase === "playing" && (
            <Pressable accessibilityRole="button"
              onPress={setCorners}
              style={styles.cornerButton}
              hitSlop={8}
              accessibilityLabel="Place the four corner tiles"
            >
              <Text style={styles.cornerButtonText}>set corners</Text>
            </Pressable>
          )}
          {showMoves && moves > 0 && (
            <Text style={styles.hudMoves}>
              {moves}
              {moves === 1 ? " move" : " moves"}
            </Text>
          )}
        </View>
      </View>

      {/* Board + reserved hint row */}
      <View style={styles.boardArea}>
        <View style={styles.boardWrap}>
          <Board
            cols={puzzle.cols}
            rows={puzzle.rows}
            placement={placement}
            colors={puzzle.colors}
            locked={locked}
            phase={phase}
            reduceMotion={reduceMotion}
            celebrateOrigin={celebrateOrigin}
            onSwap={onSwap}
            onIntroTapped={startShuffle}
          />
        </View>
        <View style={styles.hintBar} pointerEvents="none">
          {phase === "revealing" ? (
            <Text style={styles.hint}>memorize the gradient — tap to shuffle</Text>
          ) : phase === "playing" && hintVisible && moves === 0 ? (
            <Text style={styles.hint}>
              {Platform.OS === "web"
                ? "drag, or tap two tiles to trade places · arrows + space work too"
                : "drag, or tap two tiles to trade places"}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Solved sheet */}
      {sheetVisible && (
        <View style={styles.sheetBackdrop}>
          <Animated.View entering={FadeInUp.springify().damping(18)} style={styles.sheet}>
            <Text style={styles.sheetKicker}>{kind === "zen" ? "harmony" : "solved"}</Text>
            <Text style={styles.sheetMoves}>
              {moves}
              <Text style={styles.sheetMovesUnit}> {moves === 1 ? "move" : "moves"}</Text>
            </Text>
            <MiniBoard
              colors={puzzle.colors}
              cols={puzzle.cols}
              rows={puzzle.rows}
              height={Math.min(150, 26 * puzzle.rows)}
              radius={8}
            />
            <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={onNext}>
              <Text style={styles.primaryButtonText}>
                {kind === "level" ? "next level" : kind === "today" ? "lovely" : "another"}
              </Text>
            </Pressable>
            <View style={styles.sheetSecondaryRow}>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={restart}>
                <Text style={styles.sheetSecondary}>replay</Text>
              </Pressable>
              <Text style={styles.sheetDot}>·</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onExit}>
                <Text style={styles.sheetSecondary}>home</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bgPlay },
  hud: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  hudButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  hudIcon: { color: palette.textDim, fontSize: 26, lineHeight: 30 },
  hudTitle: { flex: 1, alignItems: "center" },
  hudTitleText: { ...typeScale.label, ...trackedUpper, color: palette.text },
  hudSubtitle: { ...typeScale.small, color: palette.textFaint, marginTop: 1 },
  hudMovesWrap: {
    width: 120,
    alignItems: "flex-end",
    paddingRight: spacing.md,
    gap: 4,
  },
  hudMoves: { ...typeScale.small, color: palette.textFaint, fontVariant: ["tabular-nums"] },
  cornerButton: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  cornerButtonText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  boardArea: { flex: 1 },
  boardWrap: { flex: 1 },
  hintBar: { height: 34, alignItems: "center", justifyContent: "center" },
  hint: { ...typeScale.small, color: palette.textFaint, letterSpacing: 0.5 },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000B8",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderRadius: 22,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.lg,
  },
  sheetKicker: { ...typeScale.label, ...trackedUpper, color: palette.accent },
  sheetMoves: { ...typeScale.display, color: palette.text, fontVariant: ["tabular-nums"] },
  sheetMovesUnit: { fontSize: 16, color: palette.textDim, fontWeight: "400" },
  primaryButton: {
    backgroundColor: palette.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.xxl,
    borderRadius: 999,
    marginTop: spacing.xs,
  },
  primaryButtonText: {
    ...typeScale.label,
    ...trackedUpper,
    color: "#1D1208",
  },
  sheetSecondaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sheetSecondary: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  sheetDot: { color: palette.textFaint },
});
