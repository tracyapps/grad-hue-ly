/**
 * The living menu backdrop: oversized soft color blobs drifting very slowly
 * on the dark base — an aurora made of the game's own gradients. Honors
 * reduce-motion by rendering a static, equally lovely composition.
 */

import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
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

export default function GradientBackdrop({ reduceMotion }: { reduceMotion?: boolean }) {
  const settingReduceMotion = useProfile((s) => s.settings.reduceMotion);
  const calm = reduceMotion ?? settingReduceMotion;
  return (
    <Animated.View style={styles.fill} pointerEvents="none">
      {BLOBS.map((b, i) => (
        <DriftBlob key={i} blob={b} reduceMotion={calm} />
      ))}
    </Animated.View>
  );
}

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
