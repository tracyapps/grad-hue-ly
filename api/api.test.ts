/**
 * The API routes against a real (in-memory) Postgres and real signed JWTs.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { setTestSql, type Sql } from "./_lib/db";
import { setTestKeys } from "./_lib/auth";
import * as me from "./me";
import * as boards from "./boards";
import * as profile from "./profile";
import * as solve from "./board-solve";

const ISSUER = "https://auth.test";
let db: PGlite;
let sign: (sub: string) => Promise<string>;
let privKey: CryptoKey;

beforeAll(async () => {
  db = new PGlite();
  const toSql: Sql = async (strings, ...values) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    const res = await db.query(text, values as unknown[]);
    return res.rows as Record<string, unknown>[];
  };
  setTestSql(toSql);
  for (const f of ["001_profiles.sql", "002_community.sql"]) {
    await db.exec(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url), "utf8"));
  }
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  privKey = privateKey as CryptoKey;
  const jwk = await exportJWK(publicKey);
  setTestKeys([{ ...jwk, alg: "EdDSA" }], ISSUER);
  sign = (sub) =>
    new SignJWT({}).setProtectedHeader({ alg: "EdDSA" }).setSubject(sub).setIssuer(ISSUER)
      .setIssuedAt().setExpirationTime("15m").sign(privateKey);
});

beforeEach(async () => {
  await db.exec("delete from boards; delete from players; delete from profiles;");
});

const req = async (
  method: string,
  path: string,
  opts: { user?: string; body?: unknown } = {},
): Promise<Request> =>
  new Request(`https://gradhuely.com${path}`, {
    method,
    headers: {
      ...(opts.user ? { authorization: `Bearer ${await sign(opts.user)}` } : {}),
      "content-type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

const CORNERS = ["#e5b95c", "#b48cd9", "#7fb99b", "#4e6fb8"];

describe("auth", () => {
  it("rejects missing and forged tokens", async () => {
    expect((await me.GET(await req("GET", "/api/me"))).status).toBe(401);
    const forged = new Request("https://gradhuely.com/api/me", { headers: { authorization: "Bearer a.b.c" } });
    expect((await me.GET(forged)).status).toBe(401);
    // a real token with one byte of the payload changed
    const good = await sign("u1");
    const [h, p, s] = good.split(".");
    const tampered = Buffer.from(Buffer.from(p, "base64url").toString().replace("u1", "u2")).toString("base64url");
    const bad = new Request("https://gradhuely.com/api/me", { headers: { authorization: `Bearer ${h}.${tampered}.${s}` } });
    expect((await me.GET(bad)).status).toBe(401);
    // expired
    const old = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA" }).setSubject("u1").setIssuer(ISSUER)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600).setExpirationTime(Math.floor(Date.now() / 1000) - 1800).sign(privKey);
    const expired = new Request("https://gradhuely.com/api/me", { headers: { authorization: `Bearer ${old}` } });
    expect((await me.GET(expired)).status).toBe(401);
    // wrong issuer
    const other = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA" }).setSubject("u1").setIssuer("https://evil.test")
      .setIssuedAt().setExpirationTime("15m").sign(privKey);
    const wrongIss = new Request("https://gradhuely.com/api/me", { headers: { authorization: `Bearer ${other}` } });
    expect((await me.GET(wrongIss)).status).toBe(401);
  });
});

describe("usernames", () => {
  it("claims, rejects bad or taken names", async () => {
    let r = await me.PUT(await req("PUT", "/api/me", { user: "u1", body: { username: "@Tapps_Fan" } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ username: "tapps_fan" });
    r = await me.PUT(await req("PUT", "/api/me", { user: "u2", body: { username: "tapps_fan" } }));
    expect(r.status).toBe(409);
    r = await me.PUT(await req("PUT", "/api/me", { user: "u2", body: { username: "x" } }));
    expect(r.status).toBe(400);
    r = await me.PUT(await req("PUT", "/api/me", { user: "u2", body: { username: "admin" } }));
    expect(r.status).toBe(400);
    r = await me.GET(await req("GET", "/api/me", { user: "u1" }));
    expect(await r.json()).toEqual({ username: "tapps_fan" });
  });
});

describe("community boards", () => {
  it("needs a username before publishing", async () => {
    const r = await boards.POST(await req("POST", "/api/boards", { user: "u1", body: { name: "dusk", kind: "corners", corners: CORNERS } }));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("need_username");
  });

  it("publishes, lists with the author, blocks duplicates, deletes", async () => {
    await me.PUT(await req("PUT", "/api/me", { user: "u1", body: { username: "painter" } }));
    let r = await boards.POST(await req("POST", "/api/boards", { user: "u1", body: { name: "  gold   dusk ", kind: "corners", corners: CORNERS } }));
    expect(r.status).toBe(201);
    const { board } = await r.json();
    expect(board.name).toBe("gold dusk");
    expect(board.author).toBe("painter");
    expect(board.canonical).toHaveLength(216);

    r = await boards.POST(await req("POST", "/api/boards", { user: "u1", body: { name: "again", kind: "corners", corners: CORNERS } }));
    expect(r.status).toBe(409);

    r = await boards.GET(await req("GET", "/api/boards?sort=new"));
    const list = await r.json();
    expect(list.boards).toHaveLength(1);
    expect(list.boards[0].mine).toBe(false); // anonymous viewer

    await solve.POST(await req("POST", "/api/board-solve", { body: { id: board.id } }));
    r = await boards.GET(await req("GET", `/api/boards?id=${board.id}`, { user: "u1" }));
    const one = await r.json();
    expect(one.board.solves).toBe(1);
    expect(one.board.mine).toBe(true);

    await me.PUT(await req("PUT", "/api/me", { user: "u2", body: { username: "someone" } }));
    r = await boards.DELETE(await req("DELETE", `/api/boards?id=${board.id}`, { user: "u2" }));
    expect(r.status).toBe(403);
    r = await boards.DELETE(await req("DELETE", `/api/boards?id=${board.id}`, { user: "u1" }));
    expect(r.status).toBe(200);
    expect((await (await boards.GET(await req("GET", "/api/boards"))).json()).boards).toHaveLength(0);
  });

  it("refuses unreadable designs and bad input", async () => {
    await me.PUT(await req("PUT", "/api/me", { user: "u1", body: { username: "painter" } }));
    // mirrored corners: TR == BL → ambiguous
    let r = await boards.POST(await req("POST", "/api/boards", { user: "u1", body: { name: "mirror", kind: "corners", corners: ["#3fb8b0", "#5a6a90", "#5a6a90", "#c86fcf"] } }));
    expect((await r.json()).error).toBe("ambiguous");
    r = await boards.POST(await req("POST", "/api/boards", { user: "u1", body: { name: "", kind: "corners", corners: CORNERS } }));
    expect(r.status).toBe(400);
    r = await boards.POST(await req("POST", "/api/boards", { user: "u1", body: { name: "x", kind: "corners", corners: ["red", "#000", 1, null] } }));
    expect((await r.json()).error).toBe("bad_colors");
  });

  it("orders popular by solves and pages", async () => {
    await me.PUT(await req("PUT", "/api/me", { user: "u1", body: { username: "painter" } }));
    const ids: string[] = [];
    const sets = [
      ["#e5b95c", "#b48cd9", "#7fb99b", "#4e6fb8"],
      ["#f2a07b", "#c08bd6", "#6fb5a6", "#3f5fa8"],
      ["#f6d36b", "#d16ba5", "#5fc0b0", "#2f3f8f"],
    ];
    for (const [i, c] of sets.entries()) {
      const r = await boards.POST(await req("POST", "/api/boards", { user: "u1", body: { name: `b${i}`, kind: "corners", corners: c } }));
      const j = await r.json();
      if (!j.board) throw new Error(`set ${i}: ${JSON.stringify(j)}`);
      ids.push(j.board.id);
    }
    for (let k = 0; k < 3; k++) await solve.POST(await req("POST", "/api/board-solve", { body: { id: ids[1] } }));
    const pop = await (await boards.GET(await req("GET", "/api/boards?sort=popular&limit=2"))).json();
    expect(pop.boards[0].id).toBe(ids[1]);
    expect(pop.next).toBe(2);
    const page2 = await (await boards.GET(await req("GET", "/api/boards?sort=popular&limit=2&offset=2"))).json();
    expect(page2.boards).toHaveLength(1);
    expect(page2.next).toBe(null);
  });
});

describe("profile sync", () => {
  it("stores one snapshot per user, isolated", async () => {
    let r = await profile.GET(await req("GET", "/api/profile", { user: "u1" }));
    expect((await r.json()).data).toBe(null);
    r = await profile.PUT(await req("PUT", "/api/profile", { user: "u1", body: { data: { v: 1, level: 7 } } }));
    expect(r.status).toBe(200);
    r = await profile.GET(await req("GET", "/api/profile", { user: "u1" }));
    expect((await r.json()).data).toEqual({ v: 1, level: 7 });
    r = await profile.GET(await req("GET", "/api/profile", { user: "u2" }));
    expect((await r.json()).data).toBe(null);
  });
});

describe("auth proxy helpers", () => {
  it("scopes cookies to our domain and maps paths", async () => {
    process.env.NEON_AUTH_BASE_URL = "https://auth.example/neondb/auth";
    const { firstPartyCookie } = await import("./auth-proxy");
    expect(firstPartyCookie("s=1; Path=/; Domain=auth.example; HttpOnly; Secure")).toBe("s=1; Path=/; HttpOnly; Secure");
    expect(firstPartyCookie("s=1; Path=/")).toBe("s=1; Path=/");
  });
});
