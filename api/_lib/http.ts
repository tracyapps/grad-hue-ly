/** Small JSON + CORS helpers shared by the API routes. */

const ALLOWED = new Set(
  [
    "https://gradhuely.com",
    "https://www.gradhuely.com",
    ...(process.env.EXTRA_ORIGINS ?? "").split(",").map((s) => s.trim()),
  ].filter(Boolean),
);

/** Same-origin calls need no CORS; local dev servers (localhost) are allowed. */
function allowOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ALLOWED.has(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function cors(request: Request): Record<string, string> {
  const origin = allowOrigin(request.headers.get("origin"));
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
        "access-control-max-age": "600",
        vary: "origin",
      }
    : {};
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors(request) },
  });
}
