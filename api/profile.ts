/**
 * GET  /api/profile  → { data, updatedAt } for the signed-in player (or 404)
 * PUT  /api/profile  → store the client's merged snapshot { data }
 *
 * Auth: `Authorization: Bearer <Neon Auth JWT>`. The user id comes only from
 * the verified token, so one player can never read or write another's row.
 */

import { sql } from "./_lib/db";
import { userIdFrom } from "./_lib/auth";
import { cors, json } from "./_lib/http";

const MAX_BYTES = 512 * 1024;

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await userIdFrom(request);
  if (!userId) return json(request, { error: "unauthorized" }, 401);
  try {
    const rows = await sql`select data, updated_at from profiles where user_id = ${userId}`;
    if (rows.length === 0) return json(request, { error: "not_found" }, 404);
    return json(request, { data: rows[0].data, updatedAt: rows[0].updated_at });
  } catch (e) {
    console.error("profile GET failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const userId = await userIdFrom(request);
  if (!userId) return json(request, { error: "unauthorized" }, 401);

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json(request, { error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(request, { error: "bad_json" }, 400);
  }
  const data = (body as { data?: unknown })?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return json(request, { error: "bad_shape" }, 400);
  }

  try {
    const rows = await sql`
      insert into profiles (user_id, data, updated_at)
      values (${userId}, ${JSON.stringify(data)}::jsonb, now())
      on conflict (user_id) do update set data = excluded.data, updated_at = now()
      returning updated_at`;
    return json(request, { ok: true, updatedAt: rows[0].updated_at });
  } catch (e) {
    console.error("profile PUT failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}
