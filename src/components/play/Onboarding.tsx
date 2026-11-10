/**
 * First-launch welcome: a tiny 3×3 puzzle with generous contrast teaches
 * the one interaction (drag to trade places). Solving it — or skipping —
 * unlocks the whole game.
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Board, { BoardPhase } from "./Board";
import { applySwap, cornerCells, generatePuzzle, isSolved, OPEN_MOOD } from "@/engine";
import { playSound } from "@/lib/sound";
import { hapticSolve } from "@/lib/haptics";
import { useProfile } from "@/state/profile";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

const TEACH_SEED = 1337;

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const side = Math.min(340, width - 64);
  const cornerAssist = useProfile((s) => s.settings.cornerAssist);

  const puzzle = useMemo(
    () =>
      generatePuzzle(
        {
          cols: 3,
          rows: 3,
          step: 0.15,
          twist: [0, 0.2],
          mood: OPEN_MOOD,
          revealMs: 2600,
        },
        TEACH_SEED,
      ),
    [],
  );

  const locked = cornerAssist ? cornerCells(3, 3) : [];

  const [placement, setPlacement] = useState<number[]>(() =>
    puzzle.placement.map((_, i) => i),
  );
  const [phase, setPhase] = useState<BoardPhase>("revealing");
  const [solved, setSolved] = useState(false);

  const startShuffle = useCallback(() => {
    setPhase((p) => (p === "revealing" ? "playing" : p));
    setPlacement(puzzle.placement);
  }, [puzzle.placement]);

  const onSwap = useCallback(
    (from: number, to: number) => {
      if (phase !== "playing") return;
      const next = applySwap(placement, from, to);
      setPlacement(next);
      playSound("drop");
      if (isSolved(next)) {
        setPhase("solved");
        setSolved(true);
        playSound("solve");
        hapticSolve();
      }
    },
    [phase, placement],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.kicker}>welcome to grad[hue]ly</Text>
        <Text style={styles.title}>
          {solved ? "you're ready" : "put the rainbow back in order"}
        </Text>
        <Text style={styles.sub}>
          {solved
            ? "endless gradients await — no timers, ever"
            : "watch the pattern, then drag — or tap two tiles — to trade places"}
        </Text>
      </View>

      <View style={[styles.boardWrap, { width: side, height: side }]}>
        <Board
          cols={3}
          rows={3}
          placement={placement}
          colors={puzzle.colors}
          locked={locked}
          phase={phase}
          reduceMotion={false}
          celebrateOrigin={solved ? 4 : null}
          onSwap={onSwap}
          onIntroTapped={startShuffle}
        />
      </View>

      <View style={styles.footer}>
        {solved ? (
          <Pressable accessibilityRole="button" style={styles.begin} onPress={onDone}>
            <Text style={styles.beginText}>begin the journey</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" hitSlop={12} onPress={onDone}>
            <Text style={styles.skip}>skip — I know how this works</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bgPlay,
    justifyContent: "center",
    gap: spacing.xl,
  },
  header: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  kicker: { ...typeScale.small, ...trackedUpper, color: palette.accent, textAlign: "center" },
  title: { ...typeScale.title, color: palette.text, textAlign: "center" },
  sub: { ...typeScale.body, color: palette.textDim, textAlign: "center" },
  boardWrap: { alignSelf: "center" },
  footer: { alignItems: "center", gap: spacing.md },
  begin: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: spacing.xxl,
  },
  beginText: { ...typeScale.label, ...trackedUpper, color: "#1D1208" },
  skip: { ...typeScale.small, color: palette.textDim },
});
