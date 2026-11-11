import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import ScreenHeader from "@/components/ScreenHeader";
import { useAccount } from "@/sync/account";
import { useProfile } from "@/state/profile";
import { face, palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  // The whole row is the switch: a big, forgiving target with one name.
  return (
    <Pressable
      accessibilityRole="switch"
      aria-checked={value}
      accessibilityLabel={`${label}. ${hint}`}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      {/* drawn switch (decorative — the row carries the role and state) */}
      <View pointerEvents="none" style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

export default function Settings() {
  const settings = useProfile((s) => s.settings);
  const updateSettings = useProfile((s) => s.updateSettings);
  const signedIn = useAccount((s) => s.status === "signed-in");
  const username = useAccount((s) => s.username);

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="settings" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <Toggle
            label="sound"
            hint="soft tones on pickup and solve"
            value={settings.sound}
            onChange={(v) => updateSettings({ sound: v })}
          />
          <Toggle
            label="haptics"
            hint="gentle taps as tiles move"
            value={settings.haptics}
            onChange={(v) => updateSettings({ haptics: v })}
          />
          <Toggle
            label="reduce motion"
            hint="calmer transitions throughout"
            value={settings.reduceMotion}
            onChange={(v) => updateSettings({ reduceMotion: v })}
          />
          <Toggle
            label="corner anchors"
            hint="the four corners start placed for you"
            value={settings.cornerAssist}
            onChange={(v) => updateSettings({ cornerAssist: v })}
          />
          <Toggle
            label="show move count"
            hint="always recorded, only shown if you want it"
            value={settings.showMoves}
            onChange={(v) => updateSettings({ showMoves: v })}
          />
        </View>

        <Text style={styles.sectionLabel}>account</Text>
        <View style={styles.group}>
          <Pressable
            accessibilityRole="link"
            style={styles.studioRow}
            onPress={() => router.push("/account")}
            accessibilityLabel={signedIn ? `Account: signed in${username ? ` as ${username}` : ""}` : "Sign in or create an account"}
          >
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>{signedIn ? (username ? `@${username}` : "your account") : "sign in or join"}</Text>
              <Text style={styles.toggleHint}>
                {signedIn ? "profile, sync, your shared boards" : "sync progress across your devices · share boards"}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable accessibilityRole="link" style={styles.studioRow} onPress={() => router.push("/about")}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>about grad[hue]ly</Text>
              <Text style={styles.toggleHint}>how to play, accessibility, your data</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {Platform.OS === "web" && (
          <>
            <Text style={styles.sectionLabel}>studio</Text>
            <View style={styles.group}>
              <Pressable accessibilityRole="button"
                style={styles.studioRow}
                onPress={() => router.push("/studio")}
                accessibilityLabel="Open the gradient studio"
              >
                <View style={styles.toggleText}>
                  <Text style={styles.toggleLabel}>gradient studio</Text>
                  <Text style={styles.toggleHint}>
                    craft boards from images or corner colors
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.footer}>grad[hue]ly · v0.1</Text>
      </ScrollView>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: palette.textDim, fontSize: 26 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  group: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  track: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: "#FFFFFF22",
    justifyContent: "center",
  },
  trackOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#ECE7E1" },
  thumbOn: { transform: [{ translateX: 18 }], backgroundColor: palette.onAccent },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48, borderRadius: radius.md },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { ...typeScale.body, color: palette.text, ...face(560, 10) },
  toggleHint: { ...typeScale.small, color: palette.textFaint },
  soon: { ...typeScale.small, ...trackedUpper, color: palette.textFaint },
  studioRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  chevron: { color: palette.textDim, fontSize: 22 },
  sectionLabel: { ...typeScale.small, ...trackedUpper, color: palette.accent, marginTop: spacing.lg },
  footer: {
    ...typeScale.small,
    color: palette.textFaint,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
