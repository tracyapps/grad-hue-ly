/**
 * Local integration server for end-to-end tests: serves a web build, runs the
 * REAL api/ handlers against an in-memory Postgres, and fakes Neon Auth
 * (any email; the code is always 123456). Never deploy this.
 *   EXPO_PUBLIC_NEON_AUTH_URL=http://localhost:8090/auth npx expo export -p web -o dist-e2e
 *   npx tsx scripts/e2e/integration-server.mts dist-e2e
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { setTestSql, type Sql } from "../../api/_lib/db";
import { setTestKeys } from "../../api/_lib/auth";
import * as me from "../../api/me";
import * as boards from "../../api/boards";
import * as profile from "../../api/profile";
import * as solve from "../../api/board-solve";
import { hashSeed, puzzleFromField, generateEndless, generateLevel } from "../../src/engine";
import { gradientField } from "../../src/state/studio";

const ROOT = process.argv[2];
const PORT = 8090;
const ISSUER = "http://localhost:8090";
const db = new PGlite();
const toSql: Sql = async (strings, ...values) => {
  const text = strings.reduce((a, s, i) => a + s + (i < values.length ? `$${i + 1}` : ""), "");
  return (await db.query(text, values as unknown[])).rows as Record<string, unknown>[];
};
setTestSql(toSql);
for (const f of ["001_profiles.sql", "002_community.sql"]) await db.exec(fs.readFileSync(new URL(`../../db/migrations/${f}`, import.meta.url), "utf8"));
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
setTestKeys([{ ...(await exportJWK(publicKey)), alg: "EdDSA" }] as never, ISSUER);

const sessions = new Map<string, { id: string; email: string }>();
const routes: Record<string, Record<string, (r: Request) => Promise<Response> | Response>> = {
  "/api/me": me as never, "/api/boards": boards as never, "/api/profile": profile as never, "/api/board-solve": solve as never,
};
const types: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf", ".wav": "audio/wav", ".json": "application/json" };

async function body(req: http.IncomingMessage) { const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer); return Buffer.concat(c).toString(); }
const cookieSid = (req: http.IncomingMessage) => /sid=([a-z0-9]+)/.exec(req.headers.cookie ?? "")?.[1];

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", ISSUER);
  const send = (status: number, data: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data));
  };
  try {
    if (url.pathname.startsWith("/auth/")) {
      const p = url.pathname.slice(5);
      const b = req.method === "POST" ? JSON.parse((await body(req)) || "{}") : {};
      if (p === "/email-otp/send-verification-otp") return send(200, { success: true });
      if (p === "/sign-in/email-otp") {
        if (b.otp !== "123456") return send(400, { message: "Invalid OTP", code: "INVALID_OTP" });
        const sid = Math.random().toString(36).slice(2);
        sessions.set(sid, { id: "user-" + b.email, email: b.email });
        return send(200, { ok: true }, { "set-cookie": `sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
      }
      const s = sessions.get(cookieSid(req) ?? "");
      if (p === "/get-session") return send(200, s ? { user: s, session: {} } : null);
      if (p === "/token") {
        if (!s) return send(401, { message: "unauthorized" });
        const token = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA" }).setSubject(s.id).setIssuer(ISSUER).setIssuedAt().setExpirationTime("15m").sign(privateKey);
        return send(200, { token });
      }
      if (p === "/sign-out") { sessions.delete(cookieSid(req) ?? ""); return send(200, { success: true }); }
      return send(404, { message: "nope" });
    }
    if (url.pathname === "/__solution") {
      const q = Object.fromEntries(url.searchParams);
      const ws = Number(q.world), c = Number(q.cols), r = Number(q.rows);
      let colors: string[];
      if (q.mode === "community") {
        const row = (await toSql`select * from boards where id = ${q.id}`)[0];
        colors = puzzleFromField(gradientField({ kind: row.kind as never, corners: row.corners as never, canonical: row.canonical as string[] }, c, r), c, r, hashSeed("community", q.id, c, r, ws)).colors;
      } else if (q.mode === "endless") colors = generateEndless(Number(q.v), c, r, q.sub as never, ws).colors;
      else colors = generateLevel(Number(q.n), ws, q.cols ? { cols: c, rows: r } : undefined).colors;
      return send(200, { colors });
    }
    const handlerMod = routes[url.pathname];
    if (handlerMod) {
      const method = req.method ?? "GET";
      const fn = handlerMod[method];
      if (!fn) return send(405, { error: "method" });
      const raw = method === "GET" || method === "DELETE" ? undefined : await body(req);
      const r = await fn(new Request(url, { method, headers: req.headers as never, body: raw }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text()); return;
    }
    let f = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); send(500, { error: String(e) }); }
}).listen(PORT, () => console.log("ready"));
