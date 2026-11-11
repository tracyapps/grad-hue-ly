/**
 * GET /api/me → { username } (null until chosen)
 * PUT /api/me { username } → claim or change your public @name
 * DELETE /api/me → erase everything we store for you (progress, @name,
 *                  shared boards). Your sign-in record lives in Neon Auth.
 */

import { userIdFrom } from "./_lib/auth";
import { sql } from "./_lib/db";
import { cors, json } from "./_lib/http";
import { checkUsername } from "./_lib/validate";

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await userIdFrom(request);
  if (!userId) return json(request, { error: "unauthorized" }, 401);
  try {
    const rows = await sql`select username from players where user_id = ${userId}`;
    return json(request, { username: (rows[0]?.username as string | undefined) ?? null });
  } catch (e) {
    console.error("me GET failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const userId = await userIdFrom(request);
  if (!userId) return json(request, { error: "unauthorized" }, 401);
  const body = (await request.json().catch(() => null)) as { username?: unknown } | null;
  const check = checkUsername(body?.username);
  if (!check.ok) return json(request, { error: check.error }, 400);
  try {
    const taken = await sql`select user_id from players where username = ${check.value}`;
    if (taken.length && taken[0].user_id !== userId) return json(request, { error: "username_taken" }, 409);
    await sql`
      insert into players (user_id, username) values (${userId}, ${check.value})
      on conflict (user_id) do update set username = excluded.username`;
    return json(request, { username: check.value });
  } catch (e) {
    // a race on the unique index lands here
    if (String((e as { code?: string }).code) === "23505") return json(request, { error: "username_taken" }, 409);
    console.error("me PUT failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await userIdFrom(request);
  if (!userId) return json(request, { error: "unauthorized" }, 401);
  try {
    await sql`delete from boards where author_id = ${userId}`;
    await sql`delete from players where user_id = ${userId}`;
    await sql`delete from profiles where user_id = ${userId}`;
    return json(request, { ok: true });
  } catch (e) {
    console.error("me DELETE failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}
