/**
 * Sign in with an emailed 6-digit code — no passwords anywhere. Once signed
 * in, progress and the Studio library sync across devices automatically.
 */

import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAccount } from "@/sync/account";
import { accountsAvailable } from "@/sync/auth";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

function ago(ts: number | null): string {
  if (!ts) return "not yet";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : new Date(ts).toLocaleString();
}

export default function AccountPanel() {
  const { status, email, syncing, lastSyncedAt, error } = useAccount();
  const requestCode = useAccount((s) => s.requestCode);
  const confirmCode = useAccount((s) => s.confirmCode);
  const startOver = useAccount((s) => s.startOver);
  const signOut = useAccount((s) => s.signOut);
  const syncNow = useAccount((s) => s.syncNow);
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (!accountsAvailable()) {
    return (
      <View style={styles.box}>
        <Text style={styles.label}>sign in</Text>
        <Text style={styles.hint}>sync is on the web version for now — sign in at gradhuely.com</Text>
      </View>
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (status === "signed-in") {
    return (
      <View style={styles.box}>
        <Text style={styles.label}>signed in</Text>
        <Text style={styles.value}>{email}</Text>
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {syncing ? "syncing…" : `progress synced ${ago(lastSyncedAt)}`}
        </Text>
        {error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" style={styles.ghost} onPress={() => run(syncNow)}>
            <Text style={styles.ghostText}>sync now</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.ghost} onPress={() => run(signOut)}>
            <Text style={styles.ghostText}>sign out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (status === "code-sent") {
    return (
      <View style={styles.box}>
        <Text style={styles.label}>check your email</Text>
        <Text style={styles.hint}>
          we sent a 6-digit code to <Text style={styles.value}>{email}</Text>
        </Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••••"
          placeholderTextColor={palette.textFaint}
          inputMode="numeric"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          accessibilityLabel="6-digit code"
          autoFocus
          maxLength={6}
          onSubmitEditing={() => code.length === 6 && run(() => confirmCode(code))}
        />
        {error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: code.length !== 6 || busy }}
            disabled={code.length !== 6 || busy}
            style={[styles.primary, (code.length !== 6 || busy) && styles.disabled]}
            onPress={() => run(() => confirmCode(code))}
          >
            {busy ? <ActivityIndicator color="#1D1208" /> : <Text style={styles.primaryText}>sign in</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.ghost} onPress={() => { setCode(""); startOver(); }}>
            <Text style={styles.ghostText}>use another email</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>sign in</Text>
      <Text style={styles.hint}>
        play anywhere — your levels, gallery and studio follow you between phone, iPad and computer.
        no password: we email you a code.
      </Text>
      <TextInput
        style={styles.input}
        value={emailInput}
        onChangeText={setEmailInput}
        placeholder="you@example.com"
        placeholderTextColor={palette.textFaint}
        inputMode="email"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Email address"
        onSubmitEditing={() => run(() => requestCode(emailInput))}
      />
      {error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy || status === "unknown"}
        style={[styles.primary, busy && styles.disabled]}
        onPress={() => run(() => requestCode(emailInput))}
      >
        {busy ? <ActivityIndicator color="#1D1208" /> : <Text style={styles.primaryText}>email me a code</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: { ...typeScale.body, color: palette.text },
  value: { ...typeScale.body, color: palette.text },
  hint: { ...typeScale.small, color: palette.textDim, lineHeight: 17 },
  error: { ...typeScale.small, color: palette.accent },
  input: {
    backgroundColor: palette.bgPlay,
    color: palette.text,
    borderWidth: 1,
    borderColor: "#FFFFFF24",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16, // ≥16px stops iOS Safari from zooming the page
    marginTop: spacing.xs,
  },
  codeInput: { letterSpacing: 10, fontSize: 22, textAlign: "center" },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.xs },
  primary: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: spacing.xs,
  },
  primaryText: { ...typeScale.label, ...trackedUpper, color: "#1D1208" },
  disabled: { opacity: 0.5 },
  ghost: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: "center",
  },
  ghostText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
});
