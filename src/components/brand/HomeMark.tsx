/** The logomark on its own, as the way home from any screen. */

import { Pressable } from "react-native";
import { router } from "expo-router";
import Logomark from "./Logomark";

export default function HomeMark({ size = 32 }: { size?: number }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="grad[hue]ly home"
      hitSlop={8}
      onPress={() => (router.canDismiss() ? router.dismissAll() : router.replace("/"))}
      style={{ padding: 6, borderRadius: 10 }}
    >
      <Logomark size={size} label="" />
    </Pressable>
  );
}
