/**
 * Validation for anything players can publish: usernames and boards.
 * Boards are rebuilt from their corners on the server (never trusted from
 * the client) and must pass the same readability check the Studio shows.
 */

import { createHash } from "node:crypto";
import {
  bilinearField,
  fieldQuality,
  isAmbiguous,
  hexToLab,
  labToHex,
  quantizeField,
  resampleField,
  type Lab,
} from "../../src/engine";

export const CANON_COLS = 12;
export const CANON_ROWS = 18;
const HEX = /^#[0-9a-f]{6}$/;

// A deliberately small list — the admin "hide" switch is the real backstop.
const BLOCKED = [
  "fuck", "shit", "cunt", "bitch", "whore", "slut", "dick", "cock", "pussy", "penis", "vagina",
  "nazi", "hitler", "kkk", "rape", "nigg", "fag", "retard", "tranny", "kike", "spic", "chink",
];
const RESERVED = new Set([
  "admin", "administrator", "gradhuely", "grad-hue-ly", "moderator", "mod", "support", "root",
  "system", "staff", "official", "anonymous", "null", "undefined",
]);

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[^a-z]/g, "");

export function isOffensive(text: string): boolean {
  const s = squash(text);
  return BLOCKED.some((w) => s.includes(w));
}

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkUsername(raw: unknown, isSelfAdmin = false): Check<string> {
  if (typeof raw !== "string") return { ok: false, error: "username_required" };
  const u = raw.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{1,18}[a-z0-9]$/.test(u)) return { ok: false, error: "username_format" };
  if (!isSelfAdmin && RESERVED.has(u)) return { ok: false, error: "username_reserved" };
  if (isOffensive(u)) return { ok: false, error: "username_blocked" };
  return { ok: true, value: u };
}

export interface BoardInput {
  name: string;
  kind: "corners" | "image";
  corners: [string, string, string, string] | null;
  canonical: string[];
  fingerprint: string;
}

export function checkBoard(body: unknown): Check<BoardInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name =
    typeof b.name === "string"
      ? b.name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()
      : "";
  if (name.length < 1 || name.length > 40) return { ok: false, error: "name_length" };
  if (isOffensive(name)) return { ok: false, error: "name_blocked" };

  let canonical: string[];
  let corners: BoardInput["corners"] = null;
  if (b.kind === "corners") {
    const c = Array.isArray(b.corners) ? b.corners.map((x) => String(x).toLowerCase()) : [];
    if (c.length !== 4 || !c.every((x) => HEX.test(x))) return { ok: false, error: "bad_colors" };
    corners = c as BoardInput["corners"];
    canonical = bilinearField(c.map(hexToLab) as [Lab, Lab, Lab, Lab], CANON_COLS, CANON_ROWS).map(labToHex);
  } else if (b.kind === "image") {
    const c = Array.isArray(b.canonical) ? b.canonical.map((x) => String(x).toLowerCase()) : [];
    if (c.length !== CANON_COLS * CANON_ROWS || !c.every((x) => HEX.test(x))) {
      return { ok: false, error: "bad_colors" };
    }
    canonical = c;
  } else {
    return { ok: false, error: "bad_kind" };
  }

  // Same promise the Studio makes: readable at a typical 7×9 board.
  const field = resampleField(canonical.map(hexToLab), CANON_COLS, CANON_ROWS, 7, 9);
  const q = fieldQuality(quantizeField(field, 7, 9).map(hexToLab), 7, 9);
  if (isAmbiguous(q)) return { ok: false, error: "ambiguous" };
  if (q.minStep < 0.02) return { ok: false, error: "too_faint" };

  const fingerprint = createHash("sha256").update(canonical.join("")).digest("hex").slice(0, 32);
  return { ok: true, value: { name, kind: b.kind as BoardInput["kind"], corners, canonical, fingerprint } };
}
