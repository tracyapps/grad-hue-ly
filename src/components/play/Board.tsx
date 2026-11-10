/**
 * The board: tiles laid out on a strict grid, one shared pan gesture,
 * geometric drop targeting. The dragged tile rides a floating ghost layer
 * above the grid (no z-index fights), while its home cell dims to a socket.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { palette, tileSpring } from "@/theme";
import { hapticPickup } from "@/lib/haptics";

export type BoardPhase = "revealing" | "playing" | "solved";

interface BoardProps {
  cols: number;
  rows: number;
  /** cell → tile. Tile i's color is colors[i]. */
  placement: number[];
  colors: string[];
  locked: number[];
  phase: BoardPhase;
  reduceMotion: boolean;
  /** Cell the solve-ripple radiates from. */
  celebrateOrigin: number | null;
  onSwap: (fromCell: number, toCell: number) => void;
  onIntroTapped: () => void;
}

const GROUT_RATIO = 0.045;
const BOARD_PADDING = 10;

function Tile({
  cell,
  cols,
  rows,
  step,
  tileSize,
  color,
  locked,
  dimmed,
  celebrateOrigin,
  reduceMotion,
}: {
  cell: number;
  cols: number;
  rows: number;
  step: number;
  tileSize: number;
  color: string;
  locked: boolean;
  dimmed: boolean;
  celebrateOrigin: number | null;
  reduceMotion: boolean;
}) {
  const x = useSharedValue((cell % cols) * step);
  const y = useSharedValue(Math.floor(cell / cols) * step);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(dimmed ? 0.25 : 1);

  useEffect(() => {
    const tx = (cell % cols) * step;
    const ty = Math.floor(cell / cols) * step;
    const moved = x.value !== tx || y.value !== ty;
    if (!moved) return;
    if (reduceMotion) {
      x.value = withTiming(tx, { duration: 110 });
      y.value = withTiming(ty, { duration: 110 });
    } else {
      x.value = withSpring(tx, tileSpring);
      y.value = withSpring(ty, tileSpring);
    }
  }, [cell, cols, step, reduceMotion, x, y]);

  useEffect(() => {
    opacity.value = withTiming(dimmed ? 0.25 : 1, { duration: 90 });
  }, [dimmed, opacity]);

  // Solved ripple: a scale pulse with delay by grid-distance from the origin.
  useEffect(() => {
    if (celebrateOrigin === null) return;
    const cx = cell % cols;
    const cy = Math.floor(cell / cols);
    const ox = celebrateOrigin % cols;
    const oy = Math.floor(celebrateOrigin / cols);
    const dist = Math.abs(cx - ox) + Math.abs(cy - oy);
    const delay = reduceMotion ? 0 : Math.min(dist * 42, 700);
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.09, { duration: 130 }),
        withTiming(1, { duration: 260 }),
      ),
    );
  }, [celebrateOrigin, cell, cols, scale, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      testID={`tile-${cell}`}
      style={[
        styles.tile,
        { width: tileSize, height: tileSize, backgroundColor: color },
        style,
      ]}
    >
      {locked && <View style={styles.lockDot} />}
    </Animated.View>
  );
}

export default function Board({
  cols,
  rows,
  placement,
  colors,
  locked,
  phase,
  reduceMotion,
  celebrateOrigin,
  onSwap,
  onIntroTapped,
}: BoardProps) {
  const [boardSize, setBoardSize] = useState<{ w: number; h: number } | null>(null);

  const step = useMemo(() => {
    if (!boardSize) return 0;
    return Math.floor(Math.min(boardSize.w / cols, boardSize.h / rows));
  }, [boardSize, cols, rows]);
  const tileSize = step > 0 ? Math.max(1, Math.round(step * (1 - GROUT_RATIO))) : 0;

  // Plain arrays so gesture worklets can capture them cheaply.
  const lockedFlags = useMemo(() => {
    const flags = new Array<boolean>(cols * rows).fill(false);
    for (const c of locked) flags[c] = true;
    return flags;
  }, [locked, cols, rows]);

  const dragCell = useSharedValue(-1);
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const hoverCell = useSharedValue(-1);
  const [ghost, setGhost] = useState<{ cell: number; tile: number } | null>(null);

  const cellFromPoint = useCallback(
    (px: number, py: number) => {
      "worklet";
      if (step <= 0) return -1;
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(px / step)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(py / step)));
      return cy * cols + cx;
    },
    [cols, rows, step],
  );

  const beginGhost = useCallback((cell: number, tile: number) => {
    setGhost({ cell, tile });
    hapticPickup();
  }, []);
  const endGhost = useCallback(() => setGhost(null), []);

  const canPlay = phase === "playing";

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onBegin((e) => {
          "worklet";
          if (!canPlay) return;
          const cell = cellFromPoint(e.x, e.y);
          if (cell < 0 || lockedFlags[cell]) return;
          dragCell.value = cell;
          ghostX.value = e.x;
          ghostY.value = e.y;
          hoverCell.value = cell;
          runOnJS(beginGhost)(cell, placement[cell]);
        })
        .onUpdate((e) => {
          "worklet";
          if (dragCell.value < 0) return;
          ghostX.value = e.x;
          ghostY.value = e.y;
          hoverCell.value = cellFromPoint(e.x, e.y);
        })
        .onEnd((e) => {
          "worklet";
          const from = dragCell.value;
          if (from < 0) return;
          const target = cellFromPoint(e.x, e.y);
          dragCell.value = -1;
          hoverCell.value = -1;
          runOnJS(endGhost)();
          if (target >= 0 && target !== from && !lockedFlags[target]) {
            runOnJS(onSwap)(from, target);
          }
        })
        .onFinalize(() => {
          "worklet";
          if (dragCell.value >= 0) {
            dragCell.value = -1;
            hoverCell.value = -1;
            runOnJS(endGhost)();
          }
        }),
    [
      canPlay,
      cellFromPoint,
      lockedFlags,
      placement,
      dragCell,
      ghostX,
      ghostY,
      hoverCell,
      beginGhost,
      endGhost,
      onSwap,
    ],
  );

  const skipTap = useMemo(
    () =>
      Gesture.Tap().onStart(() => {
        "worklet";
        if (phase === "revealing") runOnJS(onIntroTapped)();
      }),
    [phase, onIntroTapped],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Leave breathing room so no tile ever kisses the viewport edge.
    const w = Math.max(0, width - BOARD_PADDING * 2);
    const h = Math.max(0, height - BOARD_PADDING * 2);
    setBoardSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ghostX.value - step / 2 },
      { translateY: ghostY.value - step / 2 },
      { scale: 1.07 },
    ],
  }));

  const hoverStyle = useAnimatedStyle(() => {
    const cell = hoverCell.value;
    const visible = cell >= 0 && cell !== dragCell.value;
    const cx = cell >= 0 ? (cell % cols) * step : 0;
    const cy = cell >= 0 ? Math.floor(cell / cols) * step : 0;
    return {
      transform: [{ translateX: cx }, { translateY: cy }],
      width: step,
      height: step,
      opacity: visible ? 1 : 0,
    };
  });

  if (step <= 0 || tileSize <= 0) {
    return <View style={styles.measure} onLayout={onLayout} />;
  }

  const cells = cols * rows;
  const celebrate =
    phase === "solved" && celebrateOrigin !== null ? celebrateOrigin : null;

  return (
    <View style={styles.measure} onLayout={onLayout}>
      <View style={{ width: cols * step, height: rows * step }}>
        <GestureDetector gesture={phase === "revealing" ? skipTap : pan}>
          <View testID="board" style={{ width: "100%", height: "100%" }}>
            {/* Socket hint under the lifted tile. */}
            {ghost && (
              <View
                style={[
                  styles.socket,
                  {
                    width: tileSize,
                    height: tileSize,
                    transform: [
                      { translateX: (ghost.cell % cols) * step },
                      { translateY: Math.floor(ghost.cell / cols) * step },
                    ],
                  },
                ]}
              />
            )}
            {/* Drop-target outline. */}
            <Animated.View pointerEvents="none" style={[styles.hover, hoverStyle]} />
            {Array.from({ length: cells }, (_, cell) => {
              const tile = placement[cell];
              return (
                <Tile
                  key={tile}
                  cell={cell}
                  cols={cols}
                  rows={rows}
                  step={step}
                  tileSize={tileSize}
                  color={colors[tile]}
                  locked={lockedFlags[cell]}
                  dimmed={ghost?.cell === cell}
                  celebrateOrigin={celebrate}
                  reduceMotion={reduceMotion}
                />
              );
            })}
            {/* Floating dragged tile. */}
            {ghost && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.ghost,
                  { width: tileSize, height: tileSize, backgroundColor: colors[ghost.tile] },
                  ghostStyle,
                ]}
              />
            )}
          </View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  measure: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: BOARD_PADDING,
  },
  tile: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: Platform.select({ web: 2, default: 1 }),
    alignItems: "center",
    justifyContent: "center",
  },
  lockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.lockDot,
  },
  socket: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: palette.line,
  },
  hover: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: "#FFFFFF66",
  },
  ghost: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
});
