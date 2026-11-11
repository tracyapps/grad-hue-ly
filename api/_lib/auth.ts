/**
 * Verify a Neon Auth JWT (EdDSA, 15-minute lifetime) against the project's
 * JWKS. Returns the user id (`sub`) or null. Never trusts anything the
 * client says about who it is — only the signed token.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_URL = process.env.NEON_AUTH_BASE_URL ?? process.env.NEON_AUTH_URL ?? "";

type KeySet = Parameters<typeof jwtVerify>[1];
let jwks: KeySet | null = null;
let testIssuer: string | null = null;

/** Tests only: verify against a local key set and issuer. */
export function setTestKeys(keys: KeySet | null, issuer: string | null) {
  jwks = keys;
  testIssuer = issuer;
}

function keySet(): KeySet {
  if (jwks) return jwks;
  if (!AUTH_URL) throw new Error("NEON_AUTH_BASE_URL is not configured");
  if (!jwks) {
    const url = process.env.NEON_AUTH_JWKS_URL ?? `${AUTH_URL.replace(/\/$/, "")}/.well-known/jwks.json`;
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

export async function userIdFrom(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], keySet(), {
      // Neon Auth issues tokens whose issuer is the auth URL's origin.
      issuer: testIssuer ?? new URL(AUTH_URL).origin,
      algorithms: ["EdDSA"],
    });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
