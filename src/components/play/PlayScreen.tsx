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
import BoardSheet from "@/components/BoardSheet";
import type { BoardChoice, BoardPreview } from "@/components/BoardPicker";
import {
  applySwap,
  applyCornerLocks,
  cornerCells,
  hexToLab,
  isSolvedBy,
  type Puzzle,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";
import { useProfile } from "@/state/profile";
import { hapticDrop, hapticSolve } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { face, palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export type PlayKind = "level" | "today" | "zen" | "studio" | "community";

export interface PlayAction {
  label: string;
  onPress: () => void;
}

export interface ResizeOption {
  value: BoardChoice;
  showSubtlety: boolean;
  preview: (choice: BoardChoice) => BoardPreview | null;
  apply: (choice: BoardChoice) => void;
}

interface PlayScreenProps {
  puzzle: Puzzle;
  kind: PlayKind;
  level?: number;
  dateISO?: string;
  size?: ZenSize;
  subtlety?: ZenSubtlety;
  studioId?: string;
  grid?: string;
  zenNonce?: number;
  boardId?: string;
  boardName?: string;
  title: string;
  subtitle: string;
  /** The main "keep going" action on the solved sheet. */
  next: PlayAction;
  /** Optional second way to keep going ("surprise me"). */
  surprise?: PlayAction;
  /** Lets the player change the board size (HUD + solved sheet). */
  resize?: ResizeOption;
  /** Fired once when the board is solved (after it's recorded). */
  onSolved?: () => void;
  onExit: () => void;
}

interface Round {
  phase: BoardPhase;
  board: { puzzle: Puzzle; cornerAssist: boolean; dateISO?: string } | null;
  placement: number[] | null;
}

export default function PlayScreen({
  puzzle: previewPuzzle,
  kind,
  level,
  dateISO: previewDate,
  size,
  subtlety,
  studioId,
  grid,
  zenNonce,
  boardId,
  boardName,
  title,
  subtitle,
  next,
  surprise,
  resize,
  onSolved,
  onExit,
}: PlayScreenProps) {
  const [sizing, setSizing] = useState<BoardChoice | null>(null);
  const sizingPreview = useMemo(
    () => (sizing && resize ? resize.preview(sizing) : null),
    [sizing, resize],
  );
  const reduceMotion = useProfile((s) => s.settings.reduceMotion);
  const previewCornerAssist = useProfile((s) => s.settings.cornerAssist);
  const showMoves = useProfile((s) => s.settings.showMoves);
  const recordSolve = useProfile((s) => s.recordSolve);

  const [round, setRound] = useState<Round>({ phase: "revealing", board: null, placement: null });
  // Profile sync can regenerate the route's puzzle. Keep the board the
  // player started with until they navigate to a different one.
  const { puzzle, cornerAssist, dateISO } =
    round.board ?? { puzzle: previewPuzzle, cornerAssist: previewCornerAssist, dateISO: previewDate };
  const { phase } = round;
  const solvedPlacement = useMemo(() => puzzle.placement.map((_, i) => i), [puzzle.placement]);
  const placement = round.placement ?? solvedPlacement;
  const locked = useMemo(
    () => (cornerAssist ? cornerCells(puzzle.cols, puzzle.rows) : []),
    [cornerAssist, puzzle.cols, puzzle.rows],
  );

  const [moves, setMoves] = useState(0);
  const [celebrateOrigin, setCelebrateOrigin] = useState<number | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const recorded = useRef(false);

  const startShuffle = useCallback(() => {
    setRound((current) => {
      if (current.phase !== "revealing") return current;
      return {
        phase: "playing",
        board: { puzzle, cornerAssist, dateISO },
        placement: cornerAssist
          ? applyCornerLocks(puzzle.placement, puzzle.cols, puzzle.rows)
          : puzzle.placement,
      };
    });
  }, [puzzle, cornerAssist, dateISO]);

  useEffect(() => {
    if (phase !== "revealing") return;
    const timer = setTimeout(startShuffle, puzzle.params.revealMs);
    return () => clearTimeout(timer);
  }, [phase, startShuffle, puzzle.params.revealMs]);

  const labs = useMemo(() => puzzle.colors.map(hexToLab), [puzzle.colors]);

  const handleSolved = useCallback(
    (originCell: number, moveCount: number) => {
      setCelebrateOrigin(originCell);
      setRound((current) => ({ ...current, phase: "solved", placement: null }));
      hapticSolve();
      playSound("solve");
      if (!recorded.current) {
        recorded.current = true;
        recordSolve({
          kind,
          level,
          dateISO,
          size,
          subtlety,
          studioId,
          grid,
          zenNonce,
          boardId,
          boardName,
          moves: moveCount,
        });
        onSolved?.();
      }
      // Let the seams close and the finished gradient breathe before the sheet.
      setTimeout(() => setSheetVisible(true), reduceMotion ? 700 : 2100);
    },
    [kind, level, dateISO, size, subtlety, studioId, grid, zenNonce, boardId, boardName, onSolved, recordSolve, reduceMotion],
  );

  const onSwap = useCallback(
    (from: number, to: number) => {
      if (phase !== "playing") return;
      const next = applySwap(placement, from, to);
      setMoves((m) => m + 1);
      setHintVisible(false);
      hapticDrop();
      playSound("drop");
      if (isSolvedBy(next, labs)) {
        // Look-alike tiles count; settle them home so the finished board is exact.
        handleSolved(to, moves + 1);
      } else {
        setRound((current) => ({ ...current, placement: next }));
      }
    },
    [phase, placement, moves, handleSolved, labs],
  );

  /** Rescue action: place the four corners, free of charge. */
  const setCorners = useCallback(() => {
    if (phase !== "playing") return;
    const next = applyCornerLocks(placement, puzzle.cols, puzzle.rows);
    if (next.every((t, i) => t === placement[i])) return;
    setHintVisible(false);
    hapticDrop();
    playSound("drop");
    if (isSolvedBy(next, labs)) {
      handleSolved(cornerCells(puzzle.cols, puzzle.rows)[0], moves);
    } else {
      setRound((current) => ({ ...current, placement: next }));
    }
  }, [phase, placement, puzzle.cols, puzzle.rows, handleSolved, moves, labs]);

  const restart = useCallback(() => {
    recorded.current = false;
    setSheetVisible(false);
    setCelebrateOrigin(null);
    setMoves(0);
    setHintVisible(true);
    setRound((current) => ({ ...current, phase: "revealing", placement: null }));
  }, []);

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
          {resize && phase !== "solved" && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSizing(resize.value)}
              style={styles.cornerButton}
              hitSlop={8}
              accessibilityLabel={`Board size ${puzzle.cols} by ${puzzle.rows}. Change size`}
            >
              <Text style={styles.cornerButtonText}>
                {puzzle.cols}×{puzzle.rows}
              </Text>
            </Pressable>
          )}
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
            {boardName && kind !== "level" ? <Text style={styles.sheetBoardName}>{boardName}</Text> : null}
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
            <View style={styles.sheetButtons}>
              <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={next.onPress}>
                <Text style={styles.primaryButtonText}>{next.label}</Text>
              </Pressable>
              {surprise && (
                <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={surprise.onPress}>
                  <Text style={styles.secondaryButtonText}>{surprise.label}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.sheetSecondaryRow}>
              {resize && (
                <>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSizing(resize.value)}>
                    <Text style={styles.sheetSecondary}>board size</Text>
                  </Pressable>
                  <Text style={styles.sheetDot}>·</Text>
                </>
              )}
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

      {resize && (
        <BoardSheet
          visible={sizing !== null}
          title="board size"
          byline={title.toLowerCase()}
          value={sizing ?? resize.value}
          onChange={setSizing}
          preview={sizingPreview}
          showSubtlety={resize.showSubtlety}
          playLabel={phase === "solved" ? "play" : "restart at"}
          onPlay={() => {
            const choice = sizing ?? resize.value;
            setSizing(null);
            resize.apply(choice);
          }}
          onClose={() => setSizing(null)}
        />
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
  sheetBoardName: { ...typeScale.body, color: palette.textDim, marginTop: -8, textAlign: "center" },
  sheetKicker: { ...typeScale.label, ...trackedUpper, color: palette.accent },
  sheetMoves: { ...typeScale.display, color: palette.text, fontVariant: ["tabular-nums"] },
  sheetMovesUnit: { fontSize: 16, color: palette.textDim, ...face(340) },
  primaryButton: {
    backgroundColor: palette.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.xxl,
    borderRadius: 999,
  },
  primaryButtonText: {
    ...typeScale.label,
    ...trackedUpper,
    color: palette.onAccent,
  },
  sheetButtons: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", justifyContent: "center", marginTop: spacing.xs },
  secondaryButton: {
    borderWidth: 1,
    borderColor: palette.accent,
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    borderRadius: 999,
  },
  secondaryButtonText: { ...typeScale.label, ...trackedUpper, color: palette.accent },
  sheetSecondaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sheetSecondary: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  sheetDot: { color: palette.textFaint },
});
