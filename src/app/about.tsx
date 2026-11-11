/**
 * About grad[hue]ly: what it is, how to play, the modes, accessibility,
 * the community, and what we do (and don't do) with your data.
 */

import type { ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import ScreenHeader from "@/components/ScreenHeader";
import Logomark from "@/components/brand/Logomark";
import Wordmark from "@/components/brand/Wordmark";
import MadeBy from "@/components/MadeBy";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2} accessibilityRole="header" aria-level={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const P = ({ children }: { children: ReactNode }) => <Text style={styles.p}>{children}</Text>;

function Keys({ rows }: { rows: Array<[string, string]> }) {
  return (
    <View style={styles.keys}>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.keyRow}>
          <Text style={styles.kbd}>{k}</Text>
          <Text style={styles.keyText}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function Go({ label, to }: { label: string; to: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(to as never)} hitSlop={6}>
      <Text style={styles.link}>{label} →</Text>
    </Pressable>
  );
}

export default function About() {
  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="about" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Logomark size={72} label="" />
            <Wordmark size={40} />
            <Text style={styles.tagline}>put the rainbow back in order</Text>
          </View>

          <Section title="what it is">
            <P>
              every board is a smooth gradient of colored tiles. you get a moment to take it in, then the tiles
              shuffle — your job is to put each one back where it belongs. no timers, no lives, no ads. just
              color, and as much time as you want.
            </P>
          </Section>

          <Section title="how to play">
            <P>trade any two tiles by dragging one onto the other, or by tapping one and then the other.</P>
            <P>tiles with a small dot are anchors — already in the right place, to give you a foothold. turn them off in settings if you like a challenge.</P>
            {Platform.OS === "web" && (
              <Keys
                rows={[
                  ["arrows", "move around the board"],
                  ["space / enter", "pick up a tile, then swap it"],
                  ["esc", "put it back down"],
                  ["space", "skip the preview and shuffle"],
                ]}
              />
            )}
          </Section>

          <Section title="ways to play">
            <P>
              <Text style={styles.strong}>journey</Text> — numbered levels through 24 color chapters. boards grow with you, or
              pick your own size from the home screen.
            </P>
            <Go label="continue the journey" to="/" />
            <P>
              <Text style={styles.strong}>endless</Text> — choose any size (up to 14 × 20) and how strong the color steps are,
              then play new gradients forever.
            </P>
            <Go label="play endless" to="/endless" />
            <P>
              <Text style={styles.strong}>community</Text> — boards made by players in the studio, shared under their @name.
            </P>
            <Go label="browse the community" to="/community" />
            <P>
              <Text style={styles.strong}>today</Text> — one board a day, the same for everyone.
            </P>
          </Section>

          <Section title="fair boards">
            <P>
              every board is built so neighboring steps are even, no two tiles in different places look alike, and
              every color fits on an ordinary screen. bigger boards take smaller steps — there's only so much color
              to go around — but never so small that a typical screen can't show the difference.
            </P>
          </Section>

          <Section title="made for everyone">
            <P>
              drag, tap or keyboard — every way works the same. moves are announced to screen readers. “reduce
              motion” (in settings, or your device's setting) calms every animation. text meets WCAG AA contrast.
            </P>
            <P>
              if something gets in your way, please tell us — that's a bug, and we'll fix it.
            </P>
          </Section>

          <Section title="the community">
            <P>
              anyone signed in can share boards from the studio. be kind with names; boards that aren't can be hidden.
              boards have to pass the same readability check as the studio before they're shared.
            </P>
          </Section>

          <Section title="your data">
            <P>
              signing in is optional — everything works without an account. if you sign in, we keep your email (to
              send sign-in codes), your progress and studio library (so they follow you), your community name, and
              any boards you share. no ads, no trackers, nothing sold. you can erase all of it from your account page.
            </P>
            <Go label="your account" to="/account" />
          </Section>

          <Section title="keep it free">
            <P>grad[hue]ly has no ads and no paywalls. if you'd like to chip in, any amount helps.</P>
            <Go label="support her work" to="/support" />
          </Section>

          <Section title="say hi">
            <P>questions, ideas, a board you love? write to us.</P>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL("mailto:hue@gradhuely.com")} hitSlop={6}>
              <Text style={styles.link}>hue@gradhuely.com</Text>
            </Pressable>
          </Section>

          <View style={styles.footerWrap}>
            <MadeBy />
            <Text style={styles.footer}>set in Google Sans Flex</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, maxWidth: 620, width: "100%", alignSelf: "center", paddingBottom: 80 },
  hero: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  tagline: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  card: { backgroundColor: "#1F1B24F2", borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  h2: { ...typeScale.heading, color: palette.text },
  p: { ...typeScale.body, color: palette.textDim },
  strong: { color: palette.text },
  link: { ...typeScale.small, ...trackedUpper, color: palette.accent },
  keys: { gap: spacing.sm },
  keyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  kbd: {
    ...typeScale.small,
    color: palette.text,
    backgroundColor: palette.surfaceRaised,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 110,
    textAlign: "center",
    overflow: "hidden",
  },
  keyText: { ...typeScale.body, color: palette.textDim, flexShrink: 1 },
  footerWrap: { alignItems: "center", gap: spacing.xs, marginTop: spacing.lg },
  footer: { ...typeScale.small, color: palette.textFaint, textAlign: "center" },
});
