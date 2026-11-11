/**
 * Support her work: a low-key, always-optional tip page. Mirrors the one on
 * plugins.tapps.design — same three apps, same "any amount" spirit.
 */

import type { ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import ScreenHeader from "@/components/ScreenHeader";
import { brand, palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

const WAYS: Array<{ app: string; handle: string; url: string; color: string }> = [
  { app: "Cash App", handle: "$therealtapps", url: "https://cash.app/$therealtapps", color: brand.hue[0] },
  { app: "Venmo", handle: "@tracyapps", url: "https://venmo.com/u/tracyapps", color: brand.hue[1] },
  { app: "PayPal", handle: "@tapps", url: "https://www.paypal.com/paypalme/tapps", color: brand.hue[2] },
];

const WEB = Platform.OS === "web";

/** An external link: a real new-tab anchor on web, Linking on native. */
function Out({ url, label, children, style }: { url: string; label: string; children: ReactNode; style?: object }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label} (opens in a new tab)`}
      style={style}
      {...(WEB
        ? ({ href: url, hrefAttrs: { target: "_blank", rel: "noopener" } } as object)
        : { onPress: () => void Linking.openURL(url) })}
    >
      {children}
    </Pressable>
  );
}

export default function Support() {
  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="support" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>a little support goes a long way</Text>
            <Text style={styles.h1} accessibilityRole="header" aria-level={2}>
              a free game.{"\n"}a human behind it.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.p}>
              grad[hue]ly is made by one person. it's free to play — no ads, no trackers, no paywalls, no “pro”
              version — and i'd like to keep it that way.
            </Text>
            <Text style={styles.p}>
              if it's given you a calm minute or two and you have a little extra, a tip helps with the hosting and
              the household: rent, food for the cat, the occasional desk snack.
            </Text>
            <Text style={[styles.p, styles.strong]}>pick any amount in the app. always optional, always appreciated.</Text>

            <View style={styles.ways}>
              {WAYS.map((w) => (
                <Out key={w.app} url={w.url} label={`Tip with ${w.app}, ${w.handle}`} style={styles.way}>
                  <View style={[styles.swatch, { backgroundColor: w.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.wayApp}>{w.app}</Text>
                    <Text style={styles.wayHandle}>{w.handle}</Text>
                  </View>
                  <Text style={styles.wayArrow}>↗</Text>
                </Out>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.h2} accessibilityRole="header" aria-level={3}>
              other ways to help
            </Text>
            <Text style={styles.p}>
              share a board you made in the studio, send the game to a friend who'd like it, or write in with an idea
              or a bug — it all helps.
            </Text>
            <Out url="mailto:hue@gradhuely.com" label="Email hue@gradhuely.com">
              <Text style={styles.link}>hue@gradhuely.com</Text>
            </Out>
          </View>

          <Pressable accessibilityRole="link" onPress={() => router.replace("/")} style={styles.back}>
            <Text style={styles.backText}>play a board →</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 80 },
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  eyebrow: { ...typeScale.small, ...trackedUpper, color: palette.accent, textAlign: "center" },
  h1: { ...typeScale.display, color: palette.text, textAlign: "center" },
  card: { backgroundColor: "#1F1B24F2", borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  h2: { ...typeScale.heading, color: palette.text },
  p: { ...typeScale.body, color: palette.textDim },
  strong: { color: palette.text },
  ways: { gap: spacing.sm, marginTop: spacing.xs },
  way: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceRaised,
    textDecorationLine: "none",
  },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  wayApp: { ...typeScale.label, color: palette.text },
  wayHandle: { ...typeScale.small, color: palette.textDim },
  wayArrow: { color: palette.textDim, fontSize: 18 },
  link: { ...typeScale.small, ...trackedUpper, color: palette.accent },
  back: { alignSelf: "center", paddingVertical: 12, marginTop: spacing.sm },
  backText: { ...typeScale.small, ...trackedUpper, color: palette.accent },
});
