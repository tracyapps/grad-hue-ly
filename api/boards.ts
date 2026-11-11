/**
 * The community gallery.
 *   GET    /api/boards?sort=new|popular&offset=0&limit=24  → { boards, next }
 *   GET    /api/boards?id=…                               → { board }
 *   GET    /api/boards?mine=1                (auth)       → { boards }
 *   POST   /api/boards { name, kind, corners|canonical }   (auth) → { board }
 *   DELETE /api/boards?id=…                  (auth)       → author deletes;
 *                                                           an admin hides
 */

import { randomUUID } from "node:crypto";
import { userIdFrom } from "./_lib/auth";
import { sql, type Row } from "./_lib/db";
import { cors, json } from "./_lib/http";
import { checkBoard } from "./_lib/validate";

const DAILY_LIMIT = 20;
const TOTAL_LIMIT = 300;

const isAdmin = (userId: string) =>
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);

function shape(r: Row, viewer: string | null) {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as "corners" | "image",
    corners: (r.corners as string[] | null) ?? undefined,
    canonical: r.canonical as string[],
    author: r.username as string,
    solves: Number(r.solves),
    createdAt: new Date(r.created_at as string).getTime(),
    mine: viewer !== null && r.author_id === viewer,
  };
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const viewer = await userIdFrom(request);
  try {
    const id = url.searchParams.get("id");
    if (id) {
      const rows = await sql`
        select b.*, p.username from boards b join players p on p.user_id = b.author_id
        where b.id = ${id} and (not b.hidden or b.author_id = ${viewer ?? ""})`;
      if (!rows.length) return json(request, { error: "not_found" }, 404);
      return json(request, { board: shape(rows[0], viewer) });
    }
    if (url.searchParams.get("mine")) {
      if (!viewer) return json(request, { error: "unauthorized" }, 401);
      const rows = await sql`
        select b.*, p.username from boards b join players p on p.user_id = b.author_id
        where b.author_id = ${viewer} order by b.created_at desc limit 300`;
      return json(request, { boards: rows.map((r) => shape(r, viewer)), next: null });
    }
    const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit")) || 24));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const popular = url.searchParams.get("sort") === "popular";
    const rows = popular
      ? await sql`
          select b.*, p.username from boards b join players p on p.user_id = b.author_id
          where not b.hidden order by b.solves desc, b.created_at desc
          limit ${limit + 1} offset ${offset}`
      : await sql`
          select b.*, p.username from boards b join players p on p.user_id = b.author_id
          where not b.hidden order by b.created_at desc
          limit ${limit + 1} offset ${offset}`;
    const more = rows.length > limit;
    return json(request, {
      boards: rows.slice(0, limit).map((r) => shape(r, viewer)),
      next: more ? offset + limit : null,
    });
  } catch (e) {
    console.error("boards GET failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await userIdFrom(request);
  if (!userId) return json(request, { error: "unauthorized" }, 401);
  const check = checkBoard(await request.json().catch(() => null));
  if (!check.ok) return json(request, { error: check.error }, 400);
  const b = check.value;
  try {
    const me = await sql`select username from players where user_id = ${userId}`;
    if (!me.length) return json(request, { error: "need_username" }, 409);
    const counts = await sql`
      select count(*)::int as total,
             count(*) filter (where created_at > now() - interval '1 day')::int as today
      from boards where author_id = ${userId}`;
    if (Number(counts[0].today) >= DAILY_LIMIT) return json(request, { error: "daily_limit" }, 429);
    if (Number(counts[0].total) >= TOTAL_LIMIT) return json(request, { error: "total_limit" }, 429);
    const dupe = await sql`select id from boards where fingerprint = ${b.fingerprint}`;
    if (dupe.length) return json(request, { error: "already_shared", id: dupe[0].id }, 409);

    const id = randomUUID().replace(/-/g, "").slice(0, 12);
    const rows = await sql`
      insert into boards (id, author_id, name, kind, corners, canonical, fingerprint)
      values (${id}, ${userId}, ${b.name}, ${b.kind},
              ${b.corners ? JSON.stringify(b.corners) : null}::jsonb,
              ${JSON.stringify(b.canonical)}::jsonb, ${b.fingerprint})
      returning *, ${me[0].username as string}::text as username`;
    return json(request, { board: shape(rows[0], userId) }, 201);
  } catch (e) {
    if (String((e as { code?: string }).code) === "23505") return json(request, { error: "already_shared" }, 409);
    console.error("boards POST failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await userIdFrom(request);
  if (!userId) return json(request, { error: "unauthorized" }, 401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    const rows = await sql`select author_id from boards where id = ${id}`;
    if (!rows.length) return json(request, { error: "not_found" }, 404);
    if (rows[0].author_id === userId) {
      await sql`delete from boards where id = ${id}`;
      return json(request, { ok: true, deleted: true });
    }
    if (isAdmin(userId)) {
      await sql`update boards set hidden = true where id = ${id}`;
      return json(request, { ok: true, hidden: true });
    }
    return json(request, { error: "forbidden" }, 403);
  } catch (e) {
    console.error("boards DELETE failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}
