/**
 * Neon Auth (managed Better Auth) — passwordless email codes.
 *
 * A tiny fetch client for the handful of Better Auth endpoints we use,
 * instead of the full SDK (which added ~900 KB to the web bundle).
 *
 * On the live site the auth API is served through our own domain
 * (gradhuely.com/auth → Neon, a Vercel rewrite), so the session cookie is
 * first-party. That matters on iPhone and iPad: Safari blocks third-party
 * cookies, which would otherwise sign players out constantly. Local dev
 * talks to Neon directly (localhost is pre-trusted).
 */

import { Platform } from "react-native";

const DIRECT_URL = (process.env.EXPO_PUBLIC_NEON_AUTH_URL ?? "").replace(/\/$/, "");

function isLocalHost(): boolean {
  if (typeof location === "undefined") return true;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

export function authBaseURL(): string {
  if (Platform.OS === "web" && !isLocalHost()) return `${location.origin}/auth`;
  return DIRECT_URL;
}

/**
 * Account sync ships on the web build, and only once the build knows its
 * Neon Auth URL (EXPO_PUBLIC_NEON_AUTH_URL) — until then the UI stays hidden.
 */
export const accountsAvailable = (): boolean => Platform.OS === "web" && DIRECT_URL.length > 0;

export interface AuthUser {
  id: string;
  email: string;
}

interface Result<T> {
  data: T | null;
  error: string | null;
  headers?: Headers;
}

async function call<T>(path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${authBaseURL()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    if (!res.ok) {
      const msg = (json?.message as string) || (json?.code as string) || `error ${res.status}`;
      return { data: null, error: friendly(msg), headers: res.headers };
    }
    return { data: json as T, error: null, headers: res.headers };
  } catch {
    return { data: null, error: "couldn't reach the sign-in service — check your connection" };
  }
}

function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("too_many") || m.includes("too many")) return "too many tries — wait a minute and try again";
  if (m.includes("invalid") && m.includes("otp")) return "that code didn't match — check the latest email";
  if (m.includes("expired")) return "that code expired — ask for a new one";
  return msg;
}

export async function sendCode(email: string): Promise<string | null> {
  return (await call("/email-otp/send-verification-otp", { email, type: "sign-in" })).error;
}

export async function verifyCode(email: string, otp: string): Promise<string | null> {
  return (await call("/sign-in/email-otp", { email, otp })).error;
}

type SessionPayload = { user?: { id?: string; email?: string }; session?: { token?: string } } | null;

export async function currentUser(): Promise<AuthUser | null> {
  const { data } = await call<SessionPayload>("/get-session");
  const u = data?.user;
  return u?.id ? { id: String(u.id), email: String(u.email ?? "") } : null;
}

const isJwt = (t: unknown): t is string => typeof t === "string" && t.split(".").length === 3;

/** A short-lived JWT for our own API (Authorization: Bearer …). */
export async function apiToken(): Promise<string | null> {
  const tok = await call<{ token?: string }>("/token");
  if (isJwt(tok.data?.token)) return tok.data.token;
  const s = await call<SessionPayload>("/get-session");
  const header = s.headers?.get("set-auth-jwt");
  if (isJwt(header)) return header;
  const t = s.data?.session?.token;
  return isJwt(t) ? t : null;
}

export async function signOut(): Promise<void> {
  await call("/sign-out", {});
}
