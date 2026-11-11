/** Pick your public @name — shown on every board you share. */

import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAccount } from "@/sync/account";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export default function UsernamePrompt({
  visible,
  onDone,
}: {
  visible: boolean;
  onDone: (saved: boolean) => void;
}) {
  const current = useAccount((s) => s.username);
  const setUsername = useAccount((s) => s.setUsername);
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(current ?? "");
      setError(null);
    }
  }, [visible, current]);

  const save = async () => {
    setBusy(true);
    const err = await setUsername(value);
    setBusy(false);
    if (err) setError(err);
    else onDone(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onDone(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} aria-modal>
          <Text style={styles.title} accessibilityRole="header">
            {current ? "change your username" : "pick a username"}
          </Text>
          <Text style={styles.body}>
            it's shown as @name on boards you share. letters, numbers, dots, dashes and underscores.
          </Text>
          <View style={styles.inputRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={(t) => setValue(t.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20))}
              placeholder="yourname"
              placeholderTextColor={palette.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              accessibilityLabel="Username"
              autoFocus
              onSubmitEditing={() => void save()}
            />
          </View>
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              disabled={busy || value.length < 3}
              style={[styles.primary, (busy || value.length < 3) && styles.dim]}
              onPress={() => void save()}
            >
              {busy ? <ActivityIndicator color={palette.onAccent} /> : <Text style={styles.primaryText}>save</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.ghost} onPress={() => onDone(false)}>
              <Text style={styles.ghostText}>cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000B0", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  sheet: { width: "100%", maxWidth: 420, backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  title: { ...typeScale.heading, color: palette.text },
  body: { ...typeScale.small, color: palette.textDim, lineHeight: 17 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.bgPlay,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FFFFFF24",
    paddingHorizontal: spacing.md,
  },
  at: { ...typeScale.body, color: palette.textDim },
  input: { flex: 1, color: palette.text, fontSize: 16, paddingVertical: 12, paddingHorizontal: 4 },
  error: { ...typeScale.small, color: palette.accent },
  row: { flexDirection: "row", gap: spacing.sm },
  primary: { backgroundColor: palette.accent, borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 44, justifyContent: "center" },
  primaryText: { ...typeScale.label, ...trackedUpper, color: palette.onAccent },
  dim: { opacity: 0.5 },
  ghost: { borderWidth: 1, borderColor: palette.line, borderRadius: radius.pill, paddingHorizontal: spacing.lg, minHeight: 44, justifyContent: "center" },
  ghostText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
});
