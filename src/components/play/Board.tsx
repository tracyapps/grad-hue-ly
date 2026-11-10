/**
 * The board: tiles laid out on a strict grid, three equal ways to play.
 *
 *  • Drag — one shared pan gesture with geometric drop targeting. The dragged
 *    tile rides a floating ghost layer; its home cell dims to a socket.
 *  • Tap — tap a tile to pick it up, tap another to trade places (tap it
 *    again to put it down). Kinder to tired hands, trackpads and switch
 *    users, and it never needs precise dragging.
 *  • Keyboard (web) — arrow keys move a focus ring, Space/Enter picks up and
 *    swaps, Escape puts down. Every action is announced to screen readers.
 *
 * When the last tile lands, a ripple runs out from it and the grout closes:
 * the tiles grow until the seams vanish and the board becomes one seamless
 * gradient — the reward is the picture itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, StyleSheet, Text, View } from "react-native";
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
import { playSound } from "@/lib/sound";

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
  /** Listen for arrow keys / Space / Enter on web (off for embedded boards). */
  keyboard?: boolean;
}

const BOARD_PADDING = 10;

/** Thin grout: enough to read tiles as tiles, never enough to fight color. */
const groutFor = (step: number) => Math.max(1, Math.min(4, Math.round(step * 0.035)));

const cellName = (cell: number, cols: number) =>
  `row ${Math.floor(cell / cols) + 1}, column ${(cell % cols) + 1}`;

function Tile({
  cell,
  cols,
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
  const radius = useSharedValue(2);
  const opacity = useSharedValue(dimmed ? 0.25 : 1);

  useEffect(() => {
    const tx = (cell % cols) * step;
    const ty = Math.floor(cell / cols) * step;
    if (x.value === tx && y.value === ty) return;
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

  // Solved: a ripple pulse by grid distance from the last move, then the
  // seams close — every tile grows to fill its whole cell.
  useEffect(() => {
    if (celebrateOrigin === null) {
      scale.value = withTiming(1, { duration: 200 });
      radius.value = withTiming(2, { duration: 200 });
      return;
    }
    const fill = (step + 0.6) / tileSize;
    const cx = cell % cols;
    const cy = Math.floor(cell / cols);
    const ox = celebrateOrigin % cols;
    const oy = Math.floor(celebrateOrigin / cols);
    const dist = Math.abs(cx - ox) + Math.abs(cy - oy);
    if (reduceMotion) {
      scale.value = withTiming(fill, { duration: 300 });
    } else {
      const delay = Math.min(dist * 42, 700);
      scale.value = withDelay(
        delay,
        withSequence(
          withTiming(1.09, { duration: 130 }),
          withTiming(1, { duration: 220 }),
          withDelay(260, withTiming(fill, { duration: 520 })),
        ),
      );
    }
    radius.value = withDelay(reduceMotion ? 0 : 600, withTiming(0, { duration: 400 }));
  }, [celebrateOrigin, cell, cols, scale, radius, reduceMotion, step, tileSize]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
    opacity: opacity.value,
    borderRadius: radius.value,
  }));

  return (
    <Animated.View
      testID={`tile-${cell}`}
      style={[styles.tile, { width: tileSize, height: tileSize, backgroundColor: color }, style]}
    >
      {locked && <View style={styles.lockDot} />}
    </Animated.View>
  );
}

/** A two-tone ring that reads on pale and deep tiles alike. */
function Ring({
  cell,
  cols,
  step,
  kind,
}: {
  cell: number;
  cols: number;
  step: number;
  kind: "selected" | "cursor";
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.ringOuter,
        {
          width: step,
          height: step,
          transform: [
            { translateX: (cell % cols) * step },
            { translateY: Math.floor(cell / cols) * step },
          ],
        },
      ]}
    >
      <View style={[styles.ringInner, kind === "cursor" && styles.ringInnerCursor]} />
    </View>
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
  keyboard = true,
}: BoardProps) {
  const [boardSize, setBoardSize] = useState<{ w: number; h: number } | null>(null);

  const step = useMemo(() => {
    if (!boardSize) return 0;
    return Math.floor(Math.min(boardSize.w / cols, boardSize.h / rows));
  }, [boardSize, cols, rows]);
  const tileSize = step > 0 ? Math.max(1, step - groutFor(step)) : 0;
  const groutOffset = step > 0 ? (step - tileSize) / 2 : 0;

  const lockedFlags = useMemo(() => {
    const flags = new Array<boolean>(cols * rows).fill(false);
    for (const c of locked) flags[c] = true;
    return flags;
  }, [locked, cols, rows]);

  const canPlay = phase === "playing";

  // ---- tap & keyboard selection --------------------------------------
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null); // keyboard only
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!canPlay) setSelected(null);
  }, [canPlay]);

  const activate = useCallback(
    (cell: number) => {
      if (!canPlay || cell < 0) return;
      if (lockedFlags[cell]) {
        setAnnouncement(`${cellName(cell, cols)} is a fixed anchor tile`);
        return;
      }
      if (selected === null) {
        setSelected(cell);
        hapticPickup();
        playSound("tick");
        setAnnouncement(`picked up the tile at ${cellName(cell, cols)}`);
      } else if (selected === cell) {
        setSelected(null);
        setAnnouncement("put it back down");
      } else {
        const from = selected;
        setSelected(null);
        setAnnouncement(`swapped ${cellName(from, cols)} with ${cellName(cell, cols)}`);
        onSwap(from, cell);
      }
    },
    [canPlay, lockedFlags, selected, cols, onSwap],
  );

  // Latest handlers for the window key listener without re-subscribing.
  const keyState = useRef({ activate, phase, onIntroTapped, cursor, selected });
  keyState.current = { activate, phase, onIntroTapped, cursor, selected };

  useEffect(() => {
    if (!keyboard || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const st = keyState.current;
      if (st.phase === "revealing" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        st.onIntroTapped();
        return;
      }
      if (st.phase !== "playing") return;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (move[e.key]) {
        e.preventDefault();
        const cur = st.cursor ?? st.selected ?? 0;
        const [dx, dy] = move[e.key];
        const x = Math.min(cols - 1, Math.max(0, (cur % cols) + dx));
        const y = Math.min(rows - 1, Math.max(0, Math.floor(cur / cols) + dy));
        const next = y * cols + x;
        setCursor(next);
        setAnnouncement(cellName(next, cols));
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const cur = st.cursor ?? 0;
        if (st.cursor === null) setCursor(0);
        st.activate(cur);
      } else if (e.key === "Escape" && st.selected !== null) {
        e.preventDefault();
        setSelected(null);
        setAnnouncement("put it back down");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, cols, rows]);

  // ---- drag -------------------------------------------------------------
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
    setSelected(null);
    setGhost({ cell, tile });
    hapticPickup();
    playSound("tick");
  }, []);
  const endGhost = useCallback(() => setGhost(null), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onStart((e) => {
          "worklet";
          if (!canPlay) return;
          // Start from where the finger went DOWN, not where the pan
          // activated, so a quick flick still grabs the intended tile.
          const sx = e.x - e.translationX;
          const sy = e.y - e.translationY;
          const cell = cellFromPoint(sx, sy);
          if (cell < 0 || lockedFlags[cell]) return;
          dragCell.value = cell;
          ghostX.value = e.x;
          ghostY.value = e.y;
          hoverCell.value = cellFromPoint(e.x, e.y);
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

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(8)
        .onEnd((e, success) => {
          "worklet";
          if (!success) return;
          if (phase === "revealing") {
            runOnJS(onIntroTapped)();
            return;
          }
          runOnJS(activate)(cellFromPoint(e.x, e.y));
        }),
    [phase, onIntroTapped, activate, cellFromPoint],
  );

  const gesture = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.max(0, width - BOARD_PADDING * 2);
    const h = Math.max(0, height - BOARD_PADDING * 2);
    setBoardSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ghostX.value - tileSize / 2 },
      { translateY: ghostY.value - tileSize / 2 },
      { scale: 1.08 },
    ],
  }));

  const hoverStyle = useAnimatedStyle(() => {
    const cell = hoverCell.value;
    const visible = cell >= 0 && cell !== dragCell.value;
    return {
      transform: [
        { translateX: cell >= 0 ? (cell % cols) * step : 0 },
        { translateY: cell >= 0 ? Math.floor(cell / cols) * step : 0 },
      ],
      width: step,
      height: step,
      opacity: visible ? 1 : 0,
    };
  });

  if (step <= 0 || tileSize <= 0) {
    return <View style={styles.measure} onLayout={onLayout} />;
  }

  const cells = cols * rows;
  const celebrate = phase === "solved" && celebrateOrigin !== null ? celebrateOrigin : null;

  return (
    <View style={styles.measure} onLayout={onLayout}>
      <View
        style={{ width: cols * step, height: rows * step }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Gradient board, ${cols} columns by ${rows} rows`}
        accessibilityHint={
          phase === "revealing"
            ? "Memorize the gradient. Press Space to shuffle."
            : "Use arrow keys to move, Space to pick up a tile and Space again to swap."
        }
      >
        <GestureDetector gesture={gesture}>
          <View testID="board" style={{ width: "100%", height: "100%" }}>
            {ghost && (
              <View
                style={[
                  styles.socket,
                  {
                    width: tileSize,
                    height: tileSize,
                    transform: [
                      { translateX: (ghost.cell % cols) * step + groutOffset },
                      { translateY: Math.floor(ghost.cell / cols) * step + groutOffset },
                    ],
                  },
                ]}
              />
            )}
            <Animated.View pointerEvents="none" style={[styles.hover, hoverStyle]} />
            <View style={{ position: "absolute", left: groutOffset, top: groutOffset }}>
              {Array.from({ length: cells }, (_, cell) => {
                const tile = placement[cell];
                return (
                  <Tile
                    key={tile}
                    cell={cell}
                    cols={cols}
                    step={step}
                    tileSize={tileSize}
                    color={colors[tile]}
                    locked={lockedFlags[cell] && phase !== "solved"}
                    dimmed={ghost?.cell === cell}
                    celebrateOrigin={celebrate}
                    reduceMotion={reduceMotion}
                  />
                );
              })}
            </View>
            {canPlay && cursor !== null && cursor !== selected && (
              <Ring cell={cursor} cols={cols} step={step} kind="cursor" />
            )}
            {canPlay && selected !== null && (
              <Ring cell={selected} cols={cols} step={step} kind="selected" />
            )}
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
      {/* Screen-reader narration (visually hidden). */}
      <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
        {announcement}
      </Text>
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
    borderColor: "#FFFFFF88",
  },
  ringOuter: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#0E0C11",
    padding: 0,
  },
  ringInner: {
    flex: 1,
    borderRadius: 3,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  ringInnerCursor: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#FFFFFFDD",
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
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
});
