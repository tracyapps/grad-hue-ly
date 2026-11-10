/**
 * Player profile — the single source of truth for progress, stats, gallery
 * and settings. Local-first: everything lives in AsyncStorage; the sync layer
 * (Phase 4) pushes/pulls a JSON snapshot of exactly this shape.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  levelParams,
  todayParams,
  zenParams,
  generateLevel,
  generateToday,
  generateZen,
  type Puzzle,
  type PuzzleParams,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";

export interface GalleryItem {
  /** Stable id: `${kind}:${level or date or nonce}` */
  key: string;
  kind: "level" | "today" | "zen";
  level?: number;
  dateISO?: string;
  size?: ZenSize;
  subtlety?: ZenSubtlety;
  solvedAt: number;
  moves: number;
}

export interface Settings {
  sound: boolean;
  haptics: boolean;
  reduceMotion: boolean;
}

export interface ProfileState {
  /** Identifies the player's deterministic world; synced with the account. */
  worldSeed: number;
  /** Next unsolved journey level (1 = fresh start). */
  level: number;
  solvedCount: number;
  totalMoves: number;
  /** Best (lowest) move count per journey level. */
  bestMoves: Record<number, number>;
  /** Monotonic counter feeding zen puzzle seeds. */
  zenNonce: number;
  /** Today-puzzle history keyed by ISO date. */
  today: Record<string, { solved: boolean; moves: number }>;
  gallery: GalleryItem[];
  settings: Settings;
  /** False until the first-launch teach puzzle is solved or skipped. */
  onboarded: boolean;

  recordSolve: (input: {
    kind: "level" | "today" | "zen";
    level?: number;
    dateISO?: string;
    size?: ZenSize;
    subtlety?: ZenSubtlety;
    moves: number;
  }) => void;
  /** Zen has no "progress"; every solve just advances the seed stream. */
  nextZenNonce: () => number;
  setLevel: (level: number) => void;
  setOnboarded: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const GALLERY_CAP = 200;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      // A per-device random world keeps journeys personal; sync later unifies
      // it across devices (first-login wins).
      worldSeed: (Math.floor(Math.random() * 0xffffffff) ^ 0x9e3779b9) >>> 0,
      level: 1,
      solvedCount: 0,
      totalMoves: 0,
      bestMoves: {},
      zenNonce: 0,
      today: {},
      gallery: [],
      settings: { sound: true, haptics: true, reduceMotion: false },
      onboarded: false,

      recordSolve: ({ kind, level, size, subtlety, moves }) => {
        const state = get();
        const dateISO = kind === "today" ? todayISO() : undefined;
        const key =
          kind === "level"
            ? `level:${level}`
            : kind === "today"
              ? `today:${dateISO}`
              : `zen:${state.zenNonce}`;

        const patch: Partial<ProfileState> = {
          solvedCount: state.solvedCount + 1,
          totalMoves: state.totalMoves + moves,
        };

        if (kind === "level" && level !== undefined) {
          const best = state.bestMoves[level];
          patch.bestMoves = { ...state.bestMoves, [level]: best ? Math.min(best, moves) : moves };
          if (level >= state.level) patch.level = level + 1;
        }

        if (kind === "today" && dateISO) {
          const prev = state.today[dateISO];
          if (!prev?.solved) {
            patch.today = { ...state.today, [dateISO]: { solved: true, moves } };
          }
        }

        if (kind === "zen") patch.zenNonce = state.zenNonce + 1;

        const item: GalleryItem = {
          key,
          kind,
          level,
          dateISO,
          size,
          subtlety,
          solvedAt: Date.now(),
          moves,
        };
        patch.gallery = [item, ...state.gallery.filter((g) => g.key !== key)].slice(0, GALLERY_CAP);

        set(patch as ProfileState);
      },

      nextZenNonce: () => {
        const n = get().zenNonce;
        set({ zenNonce: n + 1 });
        return n;
      },

      setLevel: (level) => set({ level: Math.max(1, level) }),

      setOnboarded: () => set({ onboarded: true }),

      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
    }),
    {
      name: "gradhuely-profile",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

/** Reconstruct the generator parameters for a gallery entry. */
export function galleryParams(item: GalleryItem): {
  params: PuzzleParams;
  regenerate: (worldSeed: number) => Puzzle;
} {
  if (item.kind === "level" && item.level !== undefined) {
    return {
      params: levelParams(item.level),
      regenerate: (w) => generateLevel(item.level as number, w),
    };
  }
  if (item.kind === "today" && item.dateISO) {
    return {
      params: todayParams(item.dateISO),
      regenerate: (w) => generateToday(item.dateISO as string, w),
    };
  }
  const opts = { size: item.size, subtlety: item.subtlety };
  const nonce = Number(item.key.split(":")[1]) || 0;
  return { params: zenParams(opts), regenerate: (w) => generateZen(nonce, opts, w) };
}
