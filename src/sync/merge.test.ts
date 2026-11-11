import { describe, expect, it } from "vitest";
import { mergeProfile, mergeSnapshots, mergeStudio, type Snapshot, type SyncedProfile } from "./merge";

const base = (over: Partial<SyncedProfile> = {}): SyncedProfile => ({
  worldSeed: 1,
  level: 1,
  solvedCount: 0,
  totalMoves: 0,
  bestMoves: {},
  zenNonce: 0,
  today: {},
  gallery: [],
  onboarded: false,
  ...over,
});

describe("profile merge", () => {
  it("keeps the furthest progress and the best scores", () => {
    const a = base({ level: 12, bestMoves: { 3: 9, 5: 20 }, zenNonce: 4, onboarded: true });
    const b = base({ worldSeed: 99, level: 30, bestMoves: { 3: 7, 8: 11 }, zenNonce: 2 });
    const m = mergeProfile(a, b);
    expect(m.level).toBe(30);
    expect(m.worldSeed).toBe(99); // the account's world wins
    expect(m.bestMoves).toEqual({ 3: 7, 5: 20, 8: 11 });
    expect(m.zenNonce).toBe(4);
    expect(m.onboarded).toBe(true);
  });

  it("unions the gallery without duplicates, newest first", () => {
    const a = base({ gallery: [{ key: "level:1", solvedAt: 10 }, { key: "level:2", solvedAt: 30 }] });
    const b = base({ gallery: [{ key: "level:1", solvedAt: 20 }, { key: "zen:3", solvedAt: 5 }] });
    const m = mergeProfile(a, b);
    expect(m.gallery.map((g) => [g.key, g.solvedAt])).toEqual([
      ["level:2", 30],
      ["level:1", 20],
      ["zen:3", 5],
    ]);
  });

  it("a solved Today beats an unsolved one", () => {
    const a = base({ today: { "2026-11-10": { solved: true, moves: 30 } } });
    const b = base({ today: { "2026-11-10": { solved: true, moves: 22 }, "2026-11-09": { solved: true, moves: 9 } } });
    expect(mergeProfile(a, b).today).toEqual({
      "2026-11-10": { solved: true, moves: 22 },
      "2026-11-09": { solved: true, moves: 9 },
    });
  });

  it("is idempotent", () => {
    const a = base({ level: 4, gallery: [{ key: "level:3", solvedAt: 1 }] });
    const b = base({ level: 9, bestMoves: { 1: 3 } });
    const once = mergeProfile(a, b);
    expect(mergeProfile(once, b)).toEqual(once);
    expect(mergeProfile(once, once)).toEqual(once);
  });
});

describe("studio merge", () => {
  it("newest edit wins and deletions stick", () => {
    const local = {
      gradients: [
        { id: "a", createdAt: 1, updatedAt: 50, name: "renamed here" },
        { id: "b", createdAt: 2, name: "b" },
      ],
      deleted: { c: 40 },
    };
    const remote = {
      gradients: [
        { id: "a", createdAt: 1, updatedAt: 20, name: "old name" },
        { id: "c", createdAt: 3, name: "deleted elsewhere" },
        { id: "d", createdAt: 4, name: "made on the phone" },
      ],
      deleted: {},
    };
    const m = mergeStudio(local, remote);
    expect(m.gradients.map((g) => g.id).sort()).toEqual(["a", "b", "d"]);
    expect(m.gradients.find((g) => g.id === "a")?.name).toBe("renamed here");
    expect(m.deleted).toEqual({ c: 40 });
  });
});

describe("snapshot merge", () => {
  it("with no remote copy, local is uploaded as-is", () => {
    const s: Snapshot = { v: 1, profile: base({ level: 3 }), studio: { gradients: [], deleted: {} } };
    expect(mergeSnapshots(s, null)).toBe(s);
  });
});
