/** Settings-aware haptics; a silent no-op on platforms without them. */

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/state/profile";

export function hapticPickup(): void {
  if (Platform.OS === "web") return;
  if (!useProfile.getState().settings.haptics) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticDrop(): void {
  if (Platform.OS === "web") return;
  if (!useProfile.getState().settings.haptics) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticSolve(): void {
  if (Platform.OS === "web") return;
  if (!useProfile.getState().settings.haptics) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
