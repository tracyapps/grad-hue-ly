/**
 * End-to-end: sign in → pick a username → share two Studio boards → play a
 * community board at 9×12 and solve it by keyboard → next board → endless at
 * 12×16 → resize mid-game → surprise me → journey at a fixed size.
 * Run against scripts/e2e/integration-server.mts:  node scripts/e2e/community-flow.mjs [outDir]
 */

import { chromium } from "@playwright/test";
const BASE = "http://localhost:8090";
const out = process.argv[2] ?? "/tmp";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
await ctx.addInitScript(() => { if (!localStorage.getItem("gradhuely-profile")) localStorage.setItem("gradhuely-profile", JSON.stringify({ state: { worldSeed: 777, onboarded: true }, version: 3 })); });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
const btn = (name, exact = false) => p.getByRole("button", { name, exact }).first();
const step = (s) => console.log("•", s);
const tileCount = () => p.locator('[data-testid^="tile-"]').count();

// 1. sign in + username
await p.goto(`${BASE}/account`); await p.waitForTimeout(1500);
await p.getByLabel("Email address").fill("tapps@example.com");
await btn("email me a code").click();
await p.getByLabel("6-digit code").fill("123456"); // auto-submits at 6 digits
await p.waitForSelector("text=one more thing", { timeout: 8000 }); step("signed in → name step");
await p.getByLabel("Community name").fill("painter");
await btn("save my name").click();
await p.waitForSelector("text=@painter", { timeout: 8000 }); step("username @painter");
await p.screenshot({ path: `${out}/1-settings.png` });

// 2. studio: make + share two boards
await p.goto(`${BASE}/studio`); await p.waitForTimeout(1500);
for (let i = 0; i < 2; i++) {
  await btn("Suggest four corner colors").click(); await p.waitForTimeout(150);
  await btn("save to library").click(); await p.waitForTimeout(250);
}
for (let i = 0; i < 2; i++) {
  await p.getByRole("button", { name: /^Share .* with the community$/ }).first().click();
  await p.waitForTimeout(1200);
}
const shared = await p.getByText("shared ✓").count(); step(`shared boards: ${shared}`);
await p.mouse.move(600, 500); await p.mouse.wheel(0, 3000); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/2-studio.png` });

// 3. community → sheet → 9×12 → play
await p.goto(`${BASE}/community`); await p.waitForTimeout(2000);
console.log("  cards:", await p.getByText("@painter").count());
await p.screenshot({ path: `${out}/3-community.png` });
await p.getByRole("button", { name: /by painter\. Choose a size and play/ }).first().click();
await p.waitForTimeout(500);
await p.getByRole("radio", { name: "9 by 12, 108 tiles" }).click(); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/4-sheet.png` });
await btn("play · 9×12").click(); await p.waitForTimeout(1500);
step(`community board tiles: ${await tileCount()}`);

// solve with the keyboard using the server-computed solution
const solveBoard = async (query) => {
  await p.keyboard.press("Space"); await p.waitForTimeout(1200);
  const { colors } = await (await fetch(`${BASE}/__solution?${query}`)).json();
  const hex = (rgb) => "#" + rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  const n = colors.length;
  const cols = Number(new URLSearchParams(query).get("cols"));
  const placement = [];
  for (let c = 0; c < n; c++) {
    const bg = await p.locator(`[data-testid="tile-${c}"]`).first().evaluate((el) => getComputedStyle(el).backgroundColor);
    placement.push(colors.indexOf(hex(bg)));
  }
  if (placement.includes(-1)) throw new Error("color mismatch");
  let cursor = 0; let first = true;
  const goTo = async (cell) => {
    if (first) { await p.keyboard.press("ArrowLeft"); first = false; }
    const dx = (cell % cols) - (cursor % cols), dy = Math.floor(cell / cols) - Math.floor(cursor / cols);
    for (let i = 0; i < Math.abs(dx); i++) await p.keyboard.press(dx > 0 ? "ArrowRight" : "ArrowLeft");
    for (let i = 0; i < Math.abs(dy); i++) await p.keyboard.press(dy > 0 ? "ArrowDown" : "ArrowUp");
    cursor = cell;
  };
  for (let i = 0; i < n; i++) {
    if (placement[i] === i) continue;
    const at = placement.indexOf(i);
    await goTo(at); await p.keyboard.press("Space");
    await goTo(i); await p.keyboard.press("Space");
    [placement[i], placement[at]] = [placement[at], placement[i]];
  }
  await p.waitForTimeout(3000);
};
const loc = new URL(p.url());
await solveBoard(`mode=community&id=${loc.searchParams.get("id")}&cols=9&rows=12&world=777`);
await p.screenshot({ path: `${out}/5-solved.png` });
step(`solved sheet: next=${await btn("next board").count()} surprise=${await btn("surprise me").count()}`);
const firstId = loc.searchParams.get("id");
await btn("next board").click(); await p.waitForTimeout(1500);
step(`next board: id changed=${new URL(p.url()).searchParams.get("id") !== firstId}, size kept=${new URL(p.url()).searchParams.get("cols")}x${new URL(p.url()).searchParams.get("rows")}, tiles=${await tileCount()}`);
const solves = await (await fetch(`${BASE}/api/boards?id=${firstId}`)).json();
step(`solve counted: ${solves.board.solves}`);

// 4. endless: 12×16, then resize mid-game to 6×8
await p.goto(`${BASE}/endless`); await p.waitForTimeout(1200);
await p.getByRole("radio", { name: "12 by 16, 192 tiles" }).click(); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/6-endless.png` });
await btn("begin · 12×16").click(); await p.waitForTimeout(1500);
step(`endless tiles: ${await tileCount()}`);
await p.screenshot({ path: `${out}/7-endless-play.png` });
await p.getByRole("button", { name: /Board size 12 by 16/ }).click(); await p.waitForTimeout(400);
await p.getByRole("radio", { name: "6 by 8, 48 tiles" }).click(); await p.waitForTimeout(300);
await btn("restart at · 6×8").click(); await p.waitForTimeout(1500);
step(`after resize tiles: ${await tileCount()}`);
const e = new URL(p.url()).searchParams;
await solveBoard(`mode=endless&v=${e.get("v")}&cols=6&rows=8&sub=${e.get("sub")}&world=777`);
step(`endless solved: another=${await btn("another").count()} surprise=${await btn("surprise me").count()}`);
await btn("surprise me").click(); await p.waitForTimeout(1500);
step(`surprise board: ${new URL(p.url()).searchParams.get("cols")}x${new URL(p.url()).searchParams.get("rows")} tiles=${await tileCount()}`);

// 5. journey size
await p.goto(`${BASE}/`); await p.waitForTimeout(1500);
await p.getByRole("button", { name: /Journey board size/ }).click(); await p.waitForTimeout(400);
await p.getByRole("radio", { name: "9 by 12, 108 tiles" }).click(); await p.waitForTimeout(300);
await btn("use this size · 9×12").click(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/8-home.png` });
await p.getByRole("button", { name: /^Continue:/ }).click(); await p.waitForTimeout(1500);
step(`journey level tiles: ${await tileCount()}`);

// 6. gallery shows the community + endless solves
await p.goto(`${BASE}/gallery`); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/9-gallery.png` });
console.log("errors:", errs.slice(0, 8));
await b.close();
