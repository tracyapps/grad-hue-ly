/**
 * PlayScreen — the game state machine.
 *
 * revealing (solved board breathes; tap to skip) → playing (drag to swap) →
 * solved (ripple + sheet). No timer anywhere; the move count is a quiet
 * footnote in the corner, exactly as promised.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Board, { BoardPhase } from "./Board";
import {
  applySwap,
  isSolved,
  type Puzzle,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";
import { useProfile } from "@/state/profile";
import { hapticDrop, hapticSolve } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { palette, spacing, type as typeScale, trackedUpper } from "@/theme";

export type PlayKind = "level" | "today" | "zen";

interface PlayScreenProps {
  puzzle: Puzzle;
  kind: PlayKind;
  level?: number;
  size?: ZenSize;
  subtlety?: ZenSubtlety;
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
  title,
  subtitle,
  onNext,
  onExit,
}: PlayScreenProps) {
  const reduceMotion = useProfile((s) => s.settings.reduceMotion);
  const recordSolve = useProfile((s) => s.recordSolve);

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

  const startShuffle = useCallback(() => {
    if (revealTimer.current) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    setPhase((p) => (p === "revealing" ? "playing" : p));
    setPlacement(puzzle.placement);
  }, [puzzle.placement]);

  useEffect(() => {
    revealTimer.current = setTimeout(startShuffle, puzzle.params.revealMs);
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, [startShuffle, puzzle.params.revealMs]);

  const onSwap = useCallback(
    (from: number, to: number) => {
      if (phase !== "playing") return;
      const next = applySwap(placement, from, to);
      setPlacement(next);
      setMoves((m) => m + 1);
      setHintVisible(false);
      hapticDrop();
      playSound("drop");
      if (isSolved(next)) {
        setCelebrateOrigin(to);
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
            moves: moves + 1,
          });
        }
        setTimeout(() => setSheetVisible(true), reduceMotion ? 250 : 1050);
      }
    },
    [phase, placement, moves, kind, level, size, subtlety, recordSolve, reduceMotion],
  );

  const restart = useCallback(() => {
    recorded.current = false;
    setSheetVisible(false);
    setCelebrateOrigin(null);
    setMoves(0);
    setPlacement(puzzle.placement.map((_, i) => i));
    setPhase("revealing");
    revealTimer.current = setTimeout(startShuffle, puzzle.params.revealMs);
  }, [puzzle, startShuffle]);

  const solvedColors = useMemo(
    () =>
      Array.from({ length: Math.min(puzzle.colors.length, 24) }, (_, i) =>
        puzzle.colors[Math.round((i * (puzzle.colors.length - 1)) / 23)],
      ) as [string, string, ...string[]],
    [puzzle.colors],
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* HUD */}
      <View style={styles.hud}>
        <Pressable
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
          {moves > 0 && (
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
            locked={puzzle.locked}
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
            <Text style={styles.hint}>drag tiles to trade places</Text>
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
            <LinearGradient
              colors={solvedColors}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.sheetStrip}
            />
            <Pressable style={styles.primaryButton} onPress={onNext}>
              <Text style={styles.primaryButtonText}>
                {kind === "level" ? "next level" : kind === "today" ? "lovely" : "another"}
              </Text>
            </Pressable>
            <View style={styles.sheetSecondaryRow}>
              <Pressable hitSlop={8} onPress={restart}>
                <Text style={styles.sheetSecondary}>replay</Text>
              </Pressable>
              <Text style={styles.sheetDot}>·</Text>
              <Pressable hitSlop={8} onPress={onExit}>
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
  hudMovesWrap: { width: 80, alignItems: "flex-end", paddingRight: spacing.md },
  hudMoves: { ...typeScale.small, color: palette.textFaint, fontVariant: ["tabular-nums"] },
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
  sheetStrip: { width: "100%", height: 10, borderRadius: 5 },
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
