/**
 * The Studio library — gradients you craft yourself (from images or corner
 * colors), stored as a canonical 12×18 color grid so any play size can be
 * sampled from it without keeping the original image around.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { bilinearField, hexToLab, resampleField, type Lab } from "@/engine";

export const CANONICAL_COLS = 12;
export const CANONICAL_ROWS = 18;

export interface StudioGradient {
  id: string;
  name: string;
  kind: "image" | "corners";
  createdAt: number;
  updatedAt?: number;
  /** Row-major hex colors, CANONICAL_COLS × CANONICAL_ROWS. */
  canonical: string[];
  /** For 'corners' sources: TL, TR, BL, BR. */
  corners?: [string, string, string, string];
}

interface StudioState {
  gradients: StudioGradient[];
  add: (g: Omit<StudioGradient, "id" | "createdAt">) => string;
  /** Edit a saved gradient in place (name, colors, source). */
  update: (id: string, patch: Partial<Omit<StudioGradient, "id" | "createdAt">>) => void;
  remove: (id: string) => void;
}

const GRADIENT_CAP = 100;

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      gradients: [],
      add: (g) => {
        const id = `g${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
        set({
          gradients: [{ ...g, id, createdAt: Date.now() }, ...get().gradients].slice(
            0,
            GRADIENT_CAP,
          ),
        });
        return id;
      },
      update: (id, patch) =>
        set({
          gradients: get().gradients.map((g) =>
            g.id === id ? { ...g, ...patch, updatedAt: Date.now() } : g,
          ),
        }),
      remove: (id) => set({ gradients: get().gradients.filter((g) => g.id !== id) }),
    }),
    {
      name: "gradhuely-studio",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

/**
 * The solved field for a library gradient at any board size. Corner
 * gradients are re-blended exactly at the requested size; image gradients
 * are resampled smoothly (bicubic in OKLab) from the stored grid — never
 * nearest-neighbor, which skipped source columns and caused visible jumps.
 */
export function gradientField(g: StudioGradient, cols: number, rows: number): Lab[] {
  if (g.kind === "corners" && g.corners) {
    return bilinearField(g.corners.map(hexToLab) as [Lab, Lab, Lab, Lab], cols, rows);
  }
  return resampleField(g.canonical.map(hexToLab), CANONICAL_COLS, CANONICAL_ROWS, cols, rows);
}
