/**
 * /auth/* → Neon Auth, served from our own domain.
 *
 * Why a function instead of a plain Vercel rewrite: Neon Auth rejects any
 * request whose X-Forwarded-Host isn't its own hostname (INVALID_HOSTNAME),
 * and Vercel's external rewrites always add X-Forwarded-Host. Proxying here
 * lets us forward only the headers Neon needs, and strip the Domain from
 * Set-Cookie so the session cookie lands on gradhuely.com — first-party,
 * which is what keeps Safari (iPhone, iPad) signed in.
 */

const AUTH_URL = (process.env.NEON_AUTH_BASE_URL ?? process.env.NEON_AUTH_URL ?? "").replace(/\/$/, "");

const FORWARD_REQUEST = ["accept", "accept-language", "authorization", "content-type", "cookie", "origin", "referer", "user-agent"];
const DROP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"]);

/** Remove any Domain attribute so the browser scopes the cookie to our host. */
export function firstPartyCookie(cookie: string): string {
  return cookie
    .split(";")
    .filter((part) => !/^\s*domain\s*=/i.test(part))
    .join(";");
}

export function targetUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  const path = (url.searchParams.get("path") ?? "").replace(/^\/+/, "");
  url.searchParams.delete("path");
  const qs = url.searchParams.toString();
  return `${AUTH_URL}/${path}${qs ? `?${qs}` : ""}`;
}

async function proxy(request: Request): Promise<Response> {
  if (!AUTH_URL) return new Response(JSON.stringify({ error: "auth_not_configured" }), { status: 500 });
  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const upstream = await fetch(targetUrl(request.url), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });

  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE.has(name.toLowerCase())) out.set(name, value);
  });
  for (const c of upstream.headers.getSetCookie()) out.append("set-cookie", firstPartyCookie(c));
  out.set("cache-control", "no-store");
  return new Response(hasBody || upstream.status !== 204 ? await upstream.arrayBuffer() : null, {
    status: upstream.status,
    headers: out,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
