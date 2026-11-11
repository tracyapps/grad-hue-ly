/**
 * The account: who's signed in, and keeping progress in sync.
 *
 * Local-first. Play works offline forever; when signed in, every change is
 * pulled → merged → pushed a couple of seconds later (and again whenever the
 * tab comes back into view), so a phone, an iPad and a laptop converge.
 */

import { create } from "zustand";
import { useProfile, type SyncedKey } from "@/state/profile";
import { useStudio, type StudioGradient } from "@/state/studio";
import { accountsAvailable, apiToken, currentUser, sendCode, signOut, verifyCode } from "./auth";
import { mergeSnapshots, type Snapshot } from "./merge";
import { api, apiUrl, explain, ApiError } from "./api";

type Status = "unknown" | "signed-out" | "code-sent" | "signed-in";

interface AccountState {
  status: Status;
  email: string | null;
  /** Public @name (null until chosen). */
  username: string | null;
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
  init: () => Promise<void>;
  requestCode: (email: string) => Promise<boolean>;
  confirmCode: (code: string) => Promise<boolean>;
  startOver: () => void;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  loadUsername: () => Promise<void>;
  /** Returns an error message, or null on success. */
  setUsername: (name: string) => Promise<string | null>;
  /** Erase everything stored for this account on our server, then sign out. */
  deleteData: () => Promise<string | null>;
}

const SYNCED: SyncedKey[] = [
  "worldSeed",
  "level",
  "solvedCount",
  "totalMoves",
  "bestMoves",
  "zenNonce",
  "today",
  "gallery",
  "onboarded",
];

function localSnapshot(): Snapshot {
  const p = useProfile.getState();
  const s = useStudio.getState();
  const profile = Object.fromEntries(SYNCED.map((k) => [k, p[k]])) as unknown as Snapshot["profile"];
  return {
    v: 1,
    profile,
    studio: { gradients: s.gradients as unknown as Snapshot["studio"]["gradients"], deleted: s.deleted },
  };
}

let applying = false;
function applySnapshot(snap: Snapshot) {
  applying = true;
  try {
    useProfile.getState().applySynced(snap.profile as never);
    useStudio
      .getState()
      .replace(snap.studio.gradients as unknown as StudioGradient[], snap.studio.deleted);
  } finally {
    applying = false;
  }
}

let syncInFlight: Promise<void> | null = null;

export const useAccount = create<AccountState>()((set, get) => ({
  status: "unknown",
  email: null,
  username: null,
  syncing: false,
  lastSyncedAt: null,
  error: null,

  init: async () => {
    if (!accountsAvailable()) {
      set({ status: "signed-out" });
      return;
    }
    const user = await currentUser();
    if (user) {
      set({ status: "signed-in", email: user.email, error: null });
      void get().syncNow();
      void get().loadUsername();
    } else {
      set({ status: "signed-out" });
    }
  },

  requestCode: async (email) => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      set({ error: "that doesn't look like an email address" });
      return false;
    }
    set({ error: null });
    const err = await sendCode(clean);
    if (err) {
      set({ error: err });
      return false;
    }
    set({ status: "code-sent", email: clean });
    return true;
  },

  confirmCode: async (code) => {
    const email = get().email;
    if (!email) return false;
    const err = await verifyCode(email, code.replace(/\D/g, ""));
    if (err) {
      set({ error: err });
      return false;
    }
    set({ status: "signed-in", error: null });
    await get().syncNow();
    void get().loadUsername();
    return true;
  },

  startOver: () => set({ status: "signed-out", error: null }),

  signOut: async () => {
    await signOut();
    set({ status: "signed-out", email: null, username: null, lastSyncedAt: null, error: null });
  },

  loadUsername: async () => {
    try {
      const { username } = await api<{ username: string | null }>("/api/me", { auth: true });
      set({ username });
    } catch {
      /* offline: try again next time */
    }
  },

  deleteData: async () => {
    try {
      await api("/api/me", { method: "DELETE", auth: true });
      await get().signOut();
      return null;
    } catch (e) {
      return explain(e instanceof ApiError ? e.code : "");
    }
  },

  setUsername: async (name) => {
    try {
      const { username } = await api<{ username: string }>("/api/me", {
        method: "PUT",
        body: { username: name },
        auth: true,
      });
      set({ username });
      return null;
    } catch (e) {
      return explain(e instanceof ApiError ? e.code : "");
    }
  },

  syncNow: async () => {
    if (get().status !== "signed-in") return;
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      set({ syncing: true });
      try {
        const token = await apiToken();
        if (!token) {
          set({ status: "signed-out", syncing: false });
          return;
        }
        const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
        const res = await fetch(apiUrl("/api/profile"), { headers });
        let remote: Snapshot | null = null;
        if (res.ok) remote = ((await res.json()) as { data: Snapshot | null }).data;
        else throw new Error(`pull failed (${res.status})`);

        const merged = mergeSnapshots(localSnapshot(), remote);
        if (remote) applySnapshot(merged);

        const put = await fetch(apiUrl("/api/profile"), {
          method: "PUT",
          headers,
          body: JSON.stringify({ data: merged }),
        });
        if (!put.ok) throw new Error(`push failed (${put.status})`);
        set({ lastSyncedAt: Date.now(), error: null });
      } catch (e) {
        set({ error: (e as Error).message || "sync failed — will retry" });
      } finally {
        set({ syncing: false });
        syncInFlight = null;
      }
    })();
    return syncInFlight;
  },
}));

// ---- automatic sync -------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (applying || useAccount.getState().status !== "signed-in") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void useAccount.getState().syncNow(), 2500);
}

let started = false;
/** Call once at app start (root layout). */
export function startAccountSync() {
  if (started) return;
  started = true;
  useProfile.subscribe((s, prev) => {
    if (SYNCED.some((k) => s[k] !== prev[k])) schedule();
  });
  useStudio.subscribe((s, prev) => {
    if (s.gradients !== prev.gradients || s.deleted !== prev.deleted) schedule();
  });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void useAccount.getState().syncNow();
    });
  }
  void useAccount.getState().init();
}
