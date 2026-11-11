/**
 * Merging two copies of a player's progress — pure, so it's easy to test.
 *
 * Every rule is chosen so merging is safe to repeat (merging A into B twice
 * changes nothing the second time) and nothing a player earned is lost:
 *   level, counters, zen nonce → the larger
 *   best moves                 → the smaller per level
 *   today                      → solved wins, fewest moves kept
 *   gallery                    → union by key, newest solve kept
 *   studio gradients           → union by id, newest edit kept, deletions
 *                                remembered so they don't come back
 *   world seed                 → the account's (first device to sign in)
 *   settings                   → stay per-device (motion, sound, haptics are
 *                                about the device you're holding)
 */

export interface SyncedProfile {
  worldSeed: number;
  level: number;
  solvedCount: number;
  totalMoves: number;
  bestMoves: Record<number, number>;
  zenNonce: number;
  today: Record<string, { solved: boolean; moves: number }>;
  gallery: Array<{ key: string; solvedAt: number; [k: string]: unknown }>;
  onboarded: boolean;
}

export interface SyncedGradient {
  id: string;
  createdAt: number;
  updatedAt?: number;
  [k: string]: unknown;
}

export interface SyncedStudio {
  gradients: SyncedGradient[];
  /** id → when it was deleted. */
  deleted: Record<string, number>;
}

export interface Snapshot {
  v: 1;
  profile: SyncedProfile;
  studio: SyncedStudio;
}

const GALLERY_CAP = 200;
const STUDIO_CAP = 100;

export function mergeProfile(local: SyncedProfile, remote: SyncedProfile): SyncedProfile {
  const bestMoves: Record<number, number> = { ...remote.bestMoves };
  for (const [k, v] of Object.entries(local.bestMoves)) {
    const key = Number(k);
    bestMoves[key] = bestMoves[key] === undefined ? v : Math.min(bestMoves[key], v);
  }

  const today: SyncedProfile["today"] = { ...remote.today };
  for (const [date, l] of Object.entries(local.today)) {
    const r = today[date];
    if (!r) today[date] = l;
    else if (l.solved && r.solved) today[date] = { solved: true, moves: Math.min(l.moves, r.moves) };
    else if (l.solved) today[date] = l;
  }

  const byKey = new Map<string, SyncedProfile["gallery"][number]>();
  for (const item of [...remote.gallery, ...local.gallery]) {
    const prev = byKey.get(item.key);
    if (!prev || item.solvedAt > prev.solvedAt) byKey.set(item.key, item);
  }
  const gallery = [...byKey.values()]
    .sort((a, b) => b.solvedAt - a.solvedAt)
    .slice(0, GALLERY_CAP);

  return {
    worldSeed: remote.worldSeed,
    level: Math.max(local.level, remote.level),
    solvedCount: Math.max(local.solvedCount, remote.solvedCount),
    totalMoves: Math.max(local.totalMoves, remote.totalMoves),
    bestMoves,
    zenNonce: Math.max(local.zenNonce, remote.zenNonce),
    today,
    gallery,
    onboarded: local.onboarded || remote.onboarded,
  };
}

const stamp = (g: SyncedGradient) => g.updatedAt ?? g.createdAt;

export function mergeStudio(local: SyncedStudio, remote: SyncedStudio): SyncedStudio {
  const deleted: Record<string, number> = { ...remote.deleted };
  for (const [id, at] of Object.entries(local.deleted)) {
    deleted[id] = Math.max(deleted[id] ?? 0, at);
  }
  const byId = new Map<string, SyncedGradient>();
  for (const g of [...remote.gradients, ...local.gradients]) {
    const prev = byId.get(g.id);
    if (!prev || stamp(g) > stamp(prev)) byId.set(g.id, g);
  }
  const gradients = [...byId.values()]
    // a deletion wins unless the gradient was edited after it
    .filter((g) => !(g.id in deleted) || stamp(g) > deleted[g.id])
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, STUDIO_CAP);
  return { gradients, deleted };
}

export function mergeSnapshots(local: Snapshot, remote: Snapshot | null): Snapshot {
  if (!remote) return local;
  return {
    v: 1,
    profile: mergeProfile(local.profile, remote.profile),
    studio: mergeStudio(local.studio, remote.studio ?? { gradients: [], deleted: {} }),
  };
}
