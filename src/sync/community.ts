/**
 * The community gallery on the client: a cached, paged list of shared
 * boards, plus publishing from the Studio.
 */

import { create } from "zustand";
import { api } from "./api";

export interface CommunityBoard {
  id: string;
  name: string;
  kind: "corners" | "image";
  corners?: [string, string, string, string];
  canonical: string[];
  author: string;
  solves: number;
  createdAt: number;
  mine: boolean;
}

export type CommunitySort = "new" | "popular";

interface CommunityState {
  sort: CommunitySort;
  boards: CommunityBoard[];
  next: number | null;
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
  load: (sort?: CommunitySort, reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  get: (id: string) => Promise<CommunityBoard | null>;
  /** The board after `id` in the current list (wraps; fetches more if needed). */
  after: (id: string) => Promise<CommunityBoard | null>;
  random: (exceptId?: string) => CommunityBoard | null;
  publish: (input: {
    name: string;
    kind: "corners" | "image";
    corners?: string[];
    canonical: string[];
  }) => Promise<CommunityBoard>;
  unpublish: (id: string) => Promise<void>;
  countSolve: (id: string) => void;
}

export const useCommunity = create<CommunityState>()((set, get) => ({
  sort: "new",
  boards: [],
  next: 0,
  loading: false,
  error: null,
  loadedAt: null,

  load: async (sort = get().sort, reset = true) => {
    if (get().loading) return;
    set({ loading: true, error: null, sort, ...(reset ? { boards: [], next: 0 } : {}) });
    try {
      const offset = reset ? 0 : (get().next ?? 0);
      const res = await api<{ boards: CommunityBoard[]; next: number | null }>(
        `/api/boards?sort=${sort}&offset=${offset}&limit=24`,
        { auth: "optional" },
      );
      const seen = new Set(get().boards.map((b) => b.id));
      set({
        boards: reset ? res.boards : [...get().boards, ...res.boards.filter((b) => !seen.has(b.id))],
        next: res.next,
        loadedAt: Date.now(),
      });
    } catch {
      set({ error: "couldn't load the community gallery" });
    } finally {
      set({ loading: false });
    }
  },

  loadMore: async () => {
    if (get().next === null) return;
    await get().load(get().sort, false);
  },

  get: async (id) => {
    const hit = get().boards.find((b) => b.id === id);
    if (hit) return hit;
    try {
      const { board } = await api<{ board: CommunityBoard }>(`/api/boards?id=${encodeURIComponent(id)}`, {
        auth: "optional",
      });
      return board;
    } catch {
      return null;
    }
  },

  after: async (id) => {
    let list = get().boards;
    let i = list.findIndex((b) => b.id === id);
    if (i === list.length - 1 && get().next !== null) {
      await get().loadMore();
      list = get().boards;
      i = list.findIndex((b) => b.id === id);
    }
    if (!list.length) return null;
    return list[(i + 1) % list.length] ?? list[0];
  },

  random: (exceptId) => {
    const pool = get().boards.filter((b) => b.id !== exceptId);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  },

  publish: async (input) => {
    const { board } = await api<{ board: CommunityBoard }>("/api/boards", {
      method: "POST",
      body: input,
      auth: true,
    });
    set({ boards: [board, ...get().boards.filter((b) => b.id !== board.id)] });
    return board;
  },

  unpublish: async (id) => {
    await api(`/api/boards?id=${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
    set({ boards: get().boards.filter((b) => b.id !== id) });
  },

  countSolve: (id) => {
    void api("/api/board-solve", { method: "POST", body: { id } }).catch(() => {});
    set({ boards: get().boards.map((b) => (b.id === id ? { ...b, solves: b.solves + 1 } : b)) });
  },
}));
