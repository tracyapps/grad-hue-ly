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
  generateEndless,
  endlessParams,
  type Puzzle,
  type PuzzleParams,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";

export type PlayKind = "level" | "today" | "zen" | "studio" | "community";

export interface GalleryItem {
  /** Stable id: `${kind}:${level or date or nonce}` */
  key: string;
  kind: PlayKind;
  level?: number;
  dateISO?: string;
  size?: ZenSize;
  subtlety?: ZenSubtlety;
  /** For studio solves: the gradient id and played grid. */
  studioId?: string;
  /** Played board size as "COLSxROWS" (studio, community, endless, sized journey). */
  grid?: string;
  /** Endless boards: the nonce they were generated from. */
  nonce?: number;
  /** Community boards: id + name (so the gallery can label them). */
  boardId?: string;
  boardName?: string;
  solvedAt: number;
  moves: number;
}

export interface Settings {
  sound: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  /** Pre-place the four corner tiles as reference anchors. */
  cornerAssist: boolean;
  /** Show the move counter during play (always recorded either way). */
  showMoves: boolean;
  /** Endless boards: the size and subtlety you like to play. */
  endless: { cols: number; rows: number; subtlety: ZenSubtlety };
  /** Journey board size: grow with the levels, or always this size. */
  journeySize: { mode: "grow" | "fixed"; cols: number; rows: number };
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: true,
  reduceMotion: false,
  cornerAssist: true,
  showMoves: false,
  endless: { cols: 7, rows: 9, subtlety: "subtle" },
  journeySize: { mode: "grow", cols: 9, rows: 12 },
};

/** "7x9" ⇄ {cols, rows} */
export const gridKey = (cols: number, rows: number) => `${cols}x${rows}`;
export function parseGrid(grid: string | undefined): { cols: number; rows: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(grid ?? "");
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : null;
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
    kind: PlayKind;
    level?: number;
    dateISO?: string;
    size?: ZenSize;
    subtlety?: ZenSubtlety;
    studioId?: string;
    grid?: string;
    /** Zen: the nonce the board was generated from (keys the gallery entry). */
    zenNonce?: number;
    boardId?: string;
    boardName?: string;
    moves: number;
  }) => void;
  /** Zen has no "progress"; every solve just advances the seed stream. */
  nextZenNonce: () => number;
  setLevel: (level: number) => void;
  setOnboarded: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Apply a merged copy from account sync (settings stay per-device). */
  applySynced: (synced: Pick<ProfileState, SyncedKey>) => void;
}

/** The parts of the profile that follow the player across devices. */
export type SyncedKey =
  | "worldSeed"
  | "level"
  | "solvedCount"
  | "totalMoves"
  | "bestMoves"
  | "zenNonce"
  | "today"
  | "gallery"
  | "onboarded";

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
      settings: DEFAULT_SETTINGS,
      onboarded: false,

      recordSolve: ({ kind, level, size, subtlety, studioId, grid, zenNonce, boardId, boardName, moves }) => {
        const state = get();
        const dateISO = kind === "today" ? todayISO() : undefined;
        const key =
          kind === "level"
            ? `level:${level}${grid ? `:${grid}` : ""}`
            : kind === "today"
              ? `today:${dateISO}`
              : kind === "studio"
                ? `studio:${studioId}:${grid}`
                : kind === "community"
                  ? `community:${boardId}:${grid}`
                  : `zen:${zenNonce ?? state.zenNonce}${grid ? `:${grid}:${subtlety}` : ""}`;

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

        // Zen nonces advance when a board is STARTED (nextZenNonce); a solve
        // only makes sure the counter has moved past this board's nonce.
        if (kind === "zen" && zenNonce !== undefined && zenNonce >= state.zenNonce) {
          patch.zenNonce = zenNonce + 1;
        }

        const item: GalleryItem = {
          key,
          kind,
          level,
          dateISO,
          size,
          subtlety,
          studioId,
          grid,
          nonce: kind === "zen" ? zenNonce : undefined,
          boardId,
          boardName,
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

      applySynced: (synced) => set(synced),
    }),
    {
      name: "gradhuely-profile",
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      // Older saves lack newer settings keys; deep-merge so every key exists.
      migrate: (persisted) => persisted as ProfileState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProfileState>;
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings ?? {}),
            endless: { ...DEFAULT_SETTINGS.endless, ...(p.settings?.endless ?? {}) },
            journeySize: { ...DEFAULT_SETTINGS.journeySize, ...(p.settings?.journeySize ?? {}) },
          },
        };
      },
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
  const g = parseGrid(item.grid);
  if (item.kind === "zen" && g && item.nonce !== undefined) {
    const sub = item.subtlety ?? "subtle";
    return {
      params: endlessParams(g.cols, g.rows, sub, 0),
      regenerate: (w) => generateEndless(item.nonce as number, g.cols, g.rows, sub, w),
    };
  }
  const opts = { size: item.size, subtlety: item.subtlety };
  const nonce = Number(item.key.split(":")[1]) || 0;
  return { params: zenParams(opts), regenerate: (w) => generateZen(nonce, opts, w) };
}
