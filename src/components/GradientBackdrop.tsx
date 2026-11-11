/**
 * The living menu backdrop.
 *
 * Web: an interactive gradient terrain (see backdrop/terrain.ts) colored by
 * a real board — on the home screen, the very level you're about to play.
 * Native: oversized soft color blobs drifting slowly (a Skia port of the
 * terrain is the natural next step there). Both honor reduce-motion.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Terrain, type PaletteGrid } from "./backdrop/terrain";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { palette } from "@/theme";
import { useProfile } from "@/state/profile";

interface Blob {
  color: string;
  /** Diameter relative to the screen diagonal. */
  size: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs: number;
  delayMs: number;
  opacity: number;
}

const BLOBS: Blob[] = [
  { color: "#276B76", size: 0.95, from: { x: -0.28, y: -0.18 }, to: { x: 0.1, y: 0.12 }, durationMs: 36000, delayMs: 0, opacity: 0.5 },
  { color: "#5A3168", size: 0.8, from: { x: 0.3, y: -0.12 }, to: { x: -0.12, y: 0.22 }, durationMs: 44000, delayMs: 3000, opacity: 0.45 },
  { color: "#6B4023", size: 0.7, from: { x: -0.12, y: 0.32 }, to: { x: 0.18, y: -0.08 }, durationMs: 51000, delayMs: 6000, opacity: 0.4 },
  { color: "#35407F", size: 0.75, from: { x: 0.14, y: 0.18 }, to: { x: -0.22, y: 0.3 }, durationMs: 39000, delayMs: 1500, opacity: 0.45 },
];

function DriftBlob({ blob, reduceMotion }: { blob: Blob; reduceMotion: boolean }) {
  const { width, height } = useWindowDimensions();
  const diameter = Math.hypot(width, height) * blob.size;

  const tx = useSharedValue(blob.from.x * width);
  const ty = useSharedValue(blob.from.y * height);

  useEffect(() => {
    if (reduceMotion) {
      tx.value = ((blob.from.x + blob.to.x) / 2) * width;
      ty.value = ((blob.from.y + blob.to.y) / 2) * height;
      return;
    }
    tx.value = blob.from.x * width;
    ty.value = blob.from.y * height;
    tx.value = withDelay(
      blob.delayMs,
      withRepeat(
        withSequence(
          withTiming(blob.to.x * width, { duration: blob.durationMs }),
          withTiming(blob.from.x * width, { duration: blob.durationMs }),
        ),
        -1,
        false,
      ),
    );
    ty.value = withDelay(
      blob.delayMs,
      withRepeat(
        withSequence(
          withTiming(blob.to.y * height, { duration: blob.durationMs * 1.13 }),
          withTiming(blob.from.y * height, { duration: blob.durationMs * 1.13 }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
    };
  }, [reduceMotion, width, height, blob, tx, ty]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: blob.color,
          opacity: blob.opacity,
          marginLeft: -diameter / 2,
          marginTop: -diameter / 2,
        },
        style,
      ]}
    />
  );
}

interface BackdropProps {
  reduceMotion?: boolean;
  /** A board to color the terrain with (web). */
  palette?: PaletteGrid;
  /** "hero" = the full show; "ambient" = quieter (default). */
  variant?: "hero" | "ambient";
}

export default function GradientBackdrop({ reduceMotion, palette, variant = "ambient" }: BackdropProps) {
  const settingReduceMotion = useProfile((s) => s.settings.reduceMotion);
  const calm = reduceMotion ?? settingReduceMotion;
  if (Platform.OS === "web") {
    return <TerrainBackdrop calm={calm} palette={palette} variant={variant} />;
  }
  return (
    <Animated.View style={styles.fill} pointerEvents="none">
      {BLOBS.map((b, i) => (
        <DriftBlob key={i} blob={b} reduceMotion={calm} />
      ))}
    </Animated.View>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function TerrainBackdrop({
  calm,
  palette,
  variant,
}: {
  calm: boolean;
  palette?: PaletteGrid;
  variant: "hero" | "ambient";
}) {
  // Web-only: the RN View's ref is the underlying DOM node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hostRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<Terrain | null>(null);
  const [focused, setFocused] = useState(true);
  const still = calm || prefersReducedMotion();

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Create once; size to the host.
  useEffect(() => {
    const host = hostRef.current as HTMLElement | null;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let terrain: Terrain;
    try {
      terrain = new Terrain(canvas, { variant, background: palette_bg }, palette);
    } catch {
      return; // no canvas: the solid background is a fine fallback
    }
    terrainRef.current = terrain;
    const fit = () => {
      const r = host.getBoundingClientRect();
      terrain.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    const local = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onMove = (e: PointerEvent) => terrain.pointer(...local(e));
    const onDown = (e: PointerEvent) => terrain.ripple(...local(e));
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      terrain.pause();
      terrainRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  useEffect(() => {
    if (palette) terrainRef.current?.setPalette(palette);
  }, [palette]);

  // Run only while this screen is focused and the tab is visible.
  useEffect(() => {
    const terrain = terrainRef.current;
    if (!terrain) return;
    const sync = () => {
      if (still) terrain.still();
      else if (focused && document.visibilityState === "visible") terrain.play();
      else terrain.pause();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [focused, still]);

  return (
    <View ref={hostRef} style={styles.fill} pointerEvents="none" aria-hidden>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </View>
  );
}

const palette_bg = palette.bgMenu;

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bgMenu,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    top: "50%",
    left: "50%",
  },
});
