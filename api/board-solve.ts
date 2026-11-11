/** POST /api/board-solve { id } → count one solve of a community board. */

import { sql } from "./_lib/db";
import { cors, json } from "./_lib/http";

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.slice(0, 40) : "";
  if (!id) return json(request, { error: "bad_id" }, 400);
  try {
    await sql`update boards set solves = solves + 1 where id = ${id} and not hidden`;
    return json(request, { ok: true });
  } catch (e) {
    console.error("board-solve failed", e);
    return json(request, { error: "server_error" }, 500);
  }
}
