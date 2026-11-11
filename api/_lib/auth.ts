/**
 * Verify a Neon Auth JWT (EdDSA / Ed25519, 15-minute lifetime) against the
 * project's JWKS, using only node:crypto — no ESM-only dependencies, so the
 * functions load on any Node version Vercel runs. Returns the user id
 * (`sub`) or null. Never trusts anything the client says about who it is.
 */

import { createPublicKey, verify, type KeyObject } from "node:crypto";

const AUTH_URL = process.env.NEON_AUTH_BASE_URL ?? process.env.NEON_AUTH_URL ?? "";
const CLOCK_SKEW_S = 30;
const JWKS_TTL_MS = 10 * 60 * 1000;

type Jwk = { kty?: string; crv?: string; x?: string; kid?: string; alg?: string };

let cache: { keys: Jwk[]; at: number } | null = null;
let testKeys: Jwk[] | null = null;
let testIssuer: string | null = null;

/** Tests only: verify against local public keys and issuer. */
export function setTestKeys(keys: Jwk[] | null, issuer: string | null) {
  testKeys = keys;
  testIssuer = issuer;
}

async function keySet(force = false): Promise<Jwk[]> {
  if (testKeys) return testKeys;
  if (!AUTH_URL) throw new Error("NEON_AUTH_BASE_URL is not configured");
  if (!force && cache && Date.now() - cache.at < JWKS_TTL_MS) return cache.keys;
  const url = process.env.NEON_AUTH_JWKS_URL ?? `${AUTH_URL.replace(/\/$/, "")}/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`jwks fetch failed (${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  cache = { keys, at: Date.now() };
  return keys;
}

const b64json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export async function verifyToken(token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header: { alg?: string; kid?: string };
  let payload: { sub?: unknown; iss?: unknown; exp?: unknown; nbf?: unknown };
  try {
    header = b64json(h);
    payload = b64json(p);
  } catch {
    return null;
  }
  if (header.alg !== "EdDSA") return null;

  const pick = (keys: Jwk[]) =>
    keys.find((k) => k.kty === "OKP" && k.crv === "Ed25519" && (!header.kid || k.kid === header.kid));
  let jwk = pick(await keySet());
  if (!jwk && header.kid) jwk = pick(await keySet(true)); // key rotated? refresh once
  if (!jwk) return null;

  let key: KeyObject;
  try {
    key = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    return null;
  }
  const ok = verify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now - CLOCK_SKEW_S) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + CLOCK_SKEW_S) return null;
  // Neon Auth issues tokens whose issuer is the auth URL's origin.
  const issuer = testIssuer ?? new URL(AUTH_URL).origin;
  if (payload.iss !== issuer) return null;
  return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
}

export async function userIdFrom(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  try {
    return await verifyToken(match[1].trim());
  } catch (e) {
    console.error("token verification failed", e);
    return null;
  }
}
