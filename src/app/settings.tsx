import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useProfile } from "@/state/profile";
import { font, palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

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
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.accent, false: palette.surfaceRaised }}
        thumbColor="#ECE7E1"
      />
    </View>
  );
}

export default function Settings() {
  const settings = useProfile((s) => s.settings);
  const updateSettings = useProfile((s) => s.updateSettings);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>settings</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.content}>
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
        </View>

        <Text style={styles.sectionLabel}>account</Text>
        <View style={styles.group}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>sign in</Text>
              <Text style={styles.toggleHint}>sync progress across your devices</Text>
            </View>
            <Text style={styles.soon}>soon</Text>
          </View>
        </View>

        <Text style={styles.footer}>grad[hue]ly · v0.1</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bgMenu },
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
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { ...typeScale.body, color: palette.text, fontFamily: font.semiBold },
  toggleHint: { ...typeScale.small, color: palette.textFaint },
  soon: { ...typeScale.small, ...trackedUpper, color: palette.textFaint },
  sectionLabel: { ...typeScale.small, ...trackedUpper, color: palette.accent, marginTop: spacing.lg },
  footer: {
    ...typeScale.small,
    color: palette.textFaint,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
