/** Calls to our own /api routes (same origin on the web build). */

import { apiToken } from "./auth";

const API = process.env.EXPO_PUBLIC_API_URL ?? "";
export const apiUrl = (path: string) => `${API}${path}`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** JSON request; `auth: true` attaches the player's JWT (throws if signed out). */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean | "optional" } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth) {
    const token = await apiToken();
    if (token) headers.authorization = `Bearer ${token}`;
    else if (opts.auth === true) throw new ApiError(401, "unauthorized");
  }
  const res = await fetch(apiUrl(path), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `http_${res.status}`);
  return data;
}

/** Human words for API error codes. */
export function explain(code: string): string {
  const map: Record<string, string> = {
    unauthorized: "sign in first",
    need_username: "pick a username first",
    username_taken: "that username is taken",
    username_format: "3–20 letters, numbers, dots, dashes or underscores",
    username_reserved: "that username is reserved",
    username_blocked: "please pick a different username",
    name_length: "give it a name (up to 40 characters)",
    name_blocked: "please pick a different name",
    ambiguous: "some tiles look alike — make the corners more different before sharing",
    too_faint: "too faint to play — add more contrast before sharing",
    already_shared: "this exact board is already in the community",
    daily_limit: "that's 20 shares today — more tomorrow",
    total_limit: "you've reached the 300-board limit",
    not_found: "that board isn't available any more",
  };
  return map[code] ?? "something went wrong — try again";
}
