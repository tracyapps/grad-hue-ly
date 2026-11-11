/**
 * Your account, in one place.
 *
 * Signed out: one short flow — email → 6-digit code → (first time) pick
 * your community name → done. No passwords anywhere.
 * Signed in: your profile (@name + a gradient avatar made from it), sync,
 * your progress, the boards you've shared, and the exits (sign out, erase).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import ScreenHeader from "@/components/ScreenHeader";
import MiniBoard from "@/components/MiniBoard";
import Logomark from "@/components/brand/Logomark";
import { generateEndless, hashSeed, quantizeField } from "@/engine";
import { useProfile } from "@/state/profile";
import { gradientField, useStudio } from "@/state/studio";
import { useAccount } from "@/sync/account";
import { accountsAvailable } from "@/sync/auth";
import { api } from "@/sync/api";
import { useCommunity, type CommunityBoard } from "@/sync/community";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

const USERNAME = /^[a-z0-9][a-z0-9_.-]{1,18}[a-z0-9]$/;

function ago(ts: number | null): string {
  if (!ts) return "not yet";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : new Date(ts).toLocaleString();
}

/** A tiny board seeded by your name — everyone gets their own gradient. */
function Avatar({ seed, size = 64 }: { seed: string; size?: number }) {
  const colors = useMemo(() => generateEndless(hashSeed("avatar", seed), 4, 4, "gentle").colors, [seed]);
  return <MiniBoard colors={colors} cols={4} rows={4} height={size} radius={size * 0.22} />;
}

function Button({
  label,
  onPress,
  kind = "primary",
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger";
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      aria-disabled={off}
      aria-busy={busy}
      disabled={off}
      onPress={onPress}
      style={[styles.btn, kind === "primary" ? styles.btnPrimary : styles.btnGhost, kind === "danger" && styles.btnDanger, off && styles.dim]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? palette.onAccent : palette.text} />
      ) : (
        <Text style={[styles.btnText, kind === "primary" ? styles.btnTextPrimary : styles.btnTextGhost, kind === "danger" && styles.btnTextDanger]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// --------------------------------------------------------------- signed out

function SignIn() {
  const { status, email, error } = useAccount();
  const requestCode = useAccount((s) => s.requestCode);
  const confirmCode = useAccount((s) => s.confirmCode);
  const startOver = useAccount((s) => s.startOver);
  const [emailInput, setEmailInput] = useState(email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async (addr: string) => {
    setBusy(true);
    const ok = await requestCode(addr);
    setBusy(false);
    if (ok) {
      setCode("");
      setResendIn(30);
    }
  };

  const confirm = async (c: string) => {
    if (c.length !== 6) return;
    setBusy(true);
    await confirmCode(c);
    setBusy(false);
  };

  const sent = status === "code-sent";
  return (
    <View style={styles.card}>
      <View style={styles.center}>
        <Logomark size={56} label="" />
      </View>
      <Text style={styles.h1} accessibilityRole="header" aria-level={2}>
        {sent ? "check your email" : "sign in or join"}
      </Text>
      <Text style={styles.lead}>
        {sent ? (
          <>
            we sent a 6-digit code to <Text style={styles.strong}>{email}</Text>. it works for 10 minutes.
          </>
        ) : (
          "play on your phone, tablet and computer — your levels, gallery and studio follow you. no passwords: we email you a code."
        )}
      </Text>

      {!sent ? (
        <>
          <Text style={styles.fieldLabel} nativeID="email-label">
            email
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
            onSubmitEditing={() => void send(emailInput)}
            autoFocus
          />
          {error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
          <Button label="email me a code" onPress={() => void send(emailInput)} busy={busy} disabled={!emailInput.includes("@")} />
          <Text style={styles.fine}>
            new here? the same code creates your account. we only use your email to sign you in.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>6-digit code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) void confirm(v); // pasted or autofilled: go
            }}
            placeholder="••••••"
            placeholderTextColor={palette.textFaint}
            inputMode="numeric"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            accessibilityLabel="6-digit code"
            autoFocus
            maxLength={6}
          />
          {error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
          <Button label="sign in" onPress={() => void confirm(code)} busy={busy} disabled={code.length !== 6} />
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              disabled={resendIn > 0 || busy}
              aria-disabled={resendIn > 0 || busy}
              onPress={() => void send(email ?? "")}
              hitSlop={8}
            >
              <Text style={[styles.link, resendIn > 0 && styles.dimText]}>
                {resendIn > 0 ? `resend in ${resendIn}s` : "send a new code"}
              </Text>
            </Pressable>
            <Text style={styles.dot}>·</Text>
            <Pressable accessibilityRole="button" onPress={startOver} hitSlop={8}>
              <Text style={styles.link}>use a different email</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// ------------------------------------------------------- first-time name

function PickName({ onDone }: { onDone: () => void }) {
  const setUsername = useAccount((s) => s.setUsername);
  const email = useAccount((s) => s.email);
  const suggestion = (email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20);
  const [value, setValue] = useState(USERNAME.test(suggestion) ? suggestion : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = USERNAME.test(value);

  const save = async () => {
    setBusy(true);
    const err = await setUsername(value);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <View style={styles.card}>
      <View style={{ alignSelf: "flex-start" }}>
        <Avatar seed={value || "you"} size={64} />
      </View>
      <Text style={styles.h1} accessibilityRole="header" aria-level={2}>
        you're in. one more thing
      </Text>
      <Text style={styles.lead}>
        pick a community name. it's shown as @name on boards you share — your email never is.
      </Text>
      <Text style={styles.fieldLabel}>community name</Text>
      <View style={styles.inputRow}>
        <Text style={styles.at}>@</Text>
        <TextInput
          style={styles.inputBare}
          value={value}
          onChangeText={(t) => {
            setValue(t.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20));
            setError(null);
          }}
          placeholder="yourname"
          placeholderTextColor={palette.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          accessibilityLabel="Community name"
          autoFocus
          onSubmitEditing={() => valid && void save()}
        />
      </View>
      <Text style={[styles.fine, !valid && value.length > 0 && styles.errorText]}>
        3–20 characters: letters, numbers, dots, dashes, underscores
      </Text>
      {error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
      <Button label="save my name" onPress={() => void save()} busy={busy} disabled={!valid} />
      <Pressable accessibilityRole="button" onPress={onDone} hitSlop={8} style={styles.center}>
        <Text style={styles.link}>skip for now</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- signed in

function Profile() {
  const { email, username, syncing, lastSyncedAt, error } = useAccount();
  const syncNow = useAccount((s) => s.syncNow);
  const signOut = useAccount((s) => s.signOut);
  const deleteData = useAccount((s) => s.deleteData);
  const setUsername = useAccount((s) => s.setUsername);
  const level = useProfile((s) => s.level);
  const solved = useProfile((s) => s.solvedCount);
  const galleryCount = useProfile((s) => s.gallery.length);
  const studio = useStudio((s) => s.gradients);
  const updateGradient = useStudio((s) => s.update);
  const unpublish = useCommunity((s) => s.unpublish);

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(username ?? "");
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [mine, setMine] = useState<CommunityBoard[] | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadMine = useCallback(() => {
    api<{ boards: CommunityBoard[] }>("/api/boards?mine=1", { auth: true })
      .then((r) => setMine(r.boards))
      .catch(() => setMine([]));
  }, []);
  useFocusEffect(loadMine);

  const saveName = async () => {
    setBusy("name");
    const err = await setUsername(nameInput);
    setBusy(null);
    if (err) setNameErr(err);
    else {
      setEditing(false);
      setNameErr(null);
    }
  };

  const remove = async (b: CommunityBoard) => {
    setBusy(b.id);
    try {
      await unpublish(b.id);
      const local = studio.find((g) => g.sharedId === b.id);
      if (local) updateGradient(local.id, { sharedId: undefined });
      setMine((m) => (m ?? []).filter((x) => x.id !== b.id));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <Avatar seed={username ?? email ?? "you"} size={72} />
          <View style={{ flex: 1, gap: 2 }}>
            {editing ? (
              <>
                <View style={styles.inputRow}>
                  <Text style={styles.at}>@</Text>
                  <TextInput
                    style={styles.inputBare}
                    value={nameInput}
                    onChangeText={(t) => setNameInput(t.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Community name"
                    autoFocus
                    onSubmitEditing={() => void saveName()}
                  />
                </View>
                {nameErr && <Text style={styles.error}>{nameErr}</Text>}
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" onPress={() => void saveName()} hitSlop={8} disabled={!USERNAME.test(nameInput)}>
                    <Text style={[styles.link, !USERNAME.test(nameInput) && styles.dimText]}>{busy === "name" ? "saving…" : "save"}</Text>
                  </Pressable>
                  <Text style={styles.dot}>·</Text>
                  <Pressable accessibilityRole="button" onPress={() => setEditing(false)} hitSlop={8}>
                    <Text style={styles.link}>cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.name}>{username ? `@${username}` : "no community name yet"}</Text>
                <Text style={styles.meta}>{email}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={username ? "Change community name" : "Pick a community name"}
                  onPress={() => {
                    setNameInput(username ?? "");
                    setEditing(true);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.link}>{username ? "change name" : "pick a name"}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <View style={styles.stats}>
          {[
            [String(Math.max(0, level - 1)), "journey levels"],
            [String(solved), "boards solved"],
            [String(galleryCount), "in your gallery"],
          ].map(([v, l]) => (
            <View key={l} style={styles.stat}>
              <Text style={styles.statValue}>{v}</Text>
              <Text style={styles.statLabel}>{l}</Text>
            </View>
          ))}
        </View>

        <View style={styles.syncRow}>
          <View style={[styles.syncDot, error ? styles.syncDotErr : styles.syncDotOk]} />
          <Text style={styles.meta} accessibilityLiveRegion="polite">
            {syncing ? "syncing…" : error ? `sync problem: ${error}` : `synced ${ago(lastSyncedAt)}`}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void syncNow()} hitSlop={8}>
            <Text style={styles.link}>sync now</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.section}>your shared boards</Text>
      <View style={styles.card}>
        {mine === null ? (
          <ActivityIndicator color={palette.textDim} />
        ) : mine.length === 0 ? (
          <Text style={styles.lead}>
            nothing shared yet — make a board in the studio and tap “share”.
          </Text>
        ) : (
          mine.map((b) => (
            <View key={b.id} style={styles.boardRow}>
              <MiniBoard
                colors={quantizeField(gradientField(b, 5, 6), 5, 6)}
                cols={5}
                rows={6}
                height={48}
                radius={8}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.boardName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.meta}>
                  {b.solves} {b.solves === 1 ? "solve" : "solves"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${b.name} from the community`}
                onPress={() => void remove(b)}
                hitSlop={8}
              >
                <Text style={styles.link}>{busy === b.id ? "removing…" : "remove"}</Text>
              </Pressable>
            </View>
          ))
        )}
        <Pressable accessibilityRole="button" onPress={() => router.push("/studio")} hitSlop={8}>
          <Text style={styles.link}>open the studio →</Text>
        </Pressable>
      </View>

      <View style={[styles.row, styles.exits]}>
        <Button label="sign out" kind="ghost" onPress={() => void signOut()} />
        {!confirmErase ? (
          <Button label="erase my data" kind="danger" onPress={() => setConfirmErase(true)} />
        ) : null}
      </View>
      {confirmErase && (
        <View style={[styles.card, styles.dangerCard]} accessibilityLiveRegion="polite">
          <Text style={styles.lead}>
            this permanently deletes your synced progress, your community name and every board you've shared.
            progress on this device stays. it can't be undone.
          </Text>
          <View style={styles.row}>
            <Button
              label="yes, erase it"
              kind="danger"
              busy={busy === "erase"}
              onPress={async () => {
                setBusy("erase");
                await deleteData();
                setBusy(null);
                setConfirmErase(false);
              }}
            />
            <Button label="keep it" kind="ghost" onPress={() => setConfirmErase(false)} />
          </View>
        </View>
      )}
    </>
  );
}

// ------------------------------------------------------------------- screen

export default function Account() {
  const status = useAccount((s) => s.status);
  const username = useAccount((s) => s.username);
  const [named, setNamed] = useState(false);
  const wasSignedIn = useRef(status === "signed-in");
  const [justJoined, setJustJoined] = useState(false);

  // Offer the name step right after signing in (not on every visit).
  useEffect(() => {
    if (status === "signed-in" && !wasSignedIn.current) setJustJoined(true);
    wasSignedIn.current = status === "signed-in";
  }, [status]);

  let body: React.ReactNode;
  if (!accountsAvailable()) {
    body = (
      <View style={styles.card}>
        <Text style={styles.lead}>accounts are on the web version for now — sign in at gradhuely.com.</Text>
      </View>
    );
  } else if (status === "unknown") {
    body = <ActivityIndicator color={palette.textDim} style={{ marginTop: spacing.xxl }} />;
  } else if (status !== "signed-in") {
    body = <SignIn />;
  } else if (justJoined && !username && !named) {
    body = <PickName onDone={() => setNamed(true)} />;
  } else {
    body = <Profile />;
  }

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="account" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center", paddingBottom: 80 },
  card: { backgroundColor: "#1F1B24F2", borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  center: { alignItems: "center" },
  h1: { ...typeScale.title, color: palette.text },
  lead: { ...typeScale.body, color: palette.textDim },
  strong: { color: palette.text },
  fine: { ...typeScale.small, color: palette.textFaint },
  fieldLabel: { ...typeScale.small, ...trackedUpper, color: palette.textDim, marginBottom: -6 },
  input: {
    backgroundColor: palette.bgPlay,
    color: palette.text,
    borderWidth: 1,
    borderColor: "#FFFFFF24",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontSize: 17, // ≥16px: iOS Safari won't zoom the page
  },
  codeInput: { letterSpacing: 12, fontSize: 26, textAlign: "center" },
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
  inputBare: { flex: 1, color: palette.text, fontSize: 17, paddingVertical: 12, paddingHorizontal: 4 },
  error: { ...typeScale.small, color: palette.accent },
  errorText: { color: palette.accent },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  dot: { color: palette.textFaint },
  link: { ...typeScale.small, ...trackedUpper, color: palette.accent },
  dimText: { color: palette.textFaint },
  btn: { minHeight: 48, borderRadius: radius.pill, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: palette.accent },
  btnGhost: { borderWidth: 1, borderColor: palette.line },
  btnDanger: { borderColor: "#FF7A8C66" },
  btnText: { ...typeScale.label, ...trackedUpper },
  btnTextPrimary: { color: palette.onAccent },
  btnTextGhost: { color: palette.textDim },
  btnTextDanger: { color: palette.accent },
  dim: { opacity: 0.5 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  name: { ...typeScale.heading, color: palette.text },
  meta: { ...typeScale.small, color: palette.textDim, flexShrink: 1 },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, backgroundColor: palette.bgPlay, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  statValue: { ...typeScale.title, color: palette.text },
  statLabel: { ...typeScale.small, color: palette.textFaint, textAlign: "center" },
  syncRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncDotOk: { backgroundColor: "#7FD1A8" },
  syncDotErr: { backgroundColor: palette.accent },
  section: { ...typeScale.small, ...trackedUpper, color: palette.accent, marginTop: spacing.md },
  boardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  boardName: { ...typeScale.body, color: palette.text },
  exits: { justifyContent: "center", marginTop: spacing.md },
  dangerCard: { borderWidth: 1, borderColor: "#FF7A8C66" },
});
