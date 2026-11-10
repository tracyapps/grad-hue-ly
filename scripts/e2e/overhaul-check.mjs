/**
 * Overhaul check: plays a level start-to-finish with the KEYBOARD only,
 * taps a swap, and screenshots every screen. Needs a web build served on
 * :8090 and a solution file from scripts/audit (see README notes).
 *   node scripts/e2e/overhaul-check.mjs <solution.json> <level> <outDir>
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [solPath, levelArg, out = "/tmp"] = process.argv.slice(2);
const sol = JSON.parse(fs.readFileSync(solPath, "utf8"));
const level = Number(levelArg);
const BASE = "http://localhost:8090";
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem("gradhuely-profile")) return;
  localStorage.setItem(
    "gradhuely-profile",
    JSON.stringify({ state: { worldSeed: 20251109, onboarded: true, level: 2 }, version: 2 }),
  );
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`CONSOLE: ${m.text()}`));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(2500);
await shot("home");

await page.goto(`${BASE}/play?mode=level&n=${level}`, { waitUntil: "load" });
await page.waitForTimeout(1200);
await shot("reveal");
await page.keyboard.press("Space"); // skip the reveal
await page.waitForTimeout(1200);
await shot("shuffled");

// Solve with the keyboard: bring tile i home, cell by cell.
const { cols, rows } = sol;
const placement = sol.placement.slice();
let cursor = 0;
let first = true;
const go = async (cell) => {
  if (first) {
    // First arrow press creates the cursor at cell 0 then moves; start there.
    await page.keyboard.press("ArrowLeft");
    first = false;
  }
  const cx = cursor % cols, cy = Math.floor(cursor / cols);
  const tx = cell % cols, ty = Math.floor(cell / cols);
  for (let i = 0; i < Math.abs(tx - cx); i++) await page.keyboard.press(tx > cx ? "ArrowRight" : "ArrowLeft");
  for (let i = 0; i < Math.abs(ty - cy); i++) await page.keyboard.press(ty > cy ? "ArrowDown" : "ArrowUp");
  cursor = cell;
};
let swaps = 0;
for (let i = 0; i < cols * rows; i++) {
  if (placement[i] === i) continue;
  const at = placement.indexOf(i);
  await go(at);
  await page.keyboard.press("Space");
  if (swaps === 0) await shot("selected");
  await go(i);
  await page.keyboard.press("Space");
  [placement[i], placement[at]] = [placement[at], placement[i]];
  swaps++;
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1400);
await shot("solved-seamless");
await page.waitForTimeout(1500);
await shot("solved-sheet");
console.log("keyboard swaps:", swaps);

for (const [name, url] of [
  ["gallery", `${BASE}/gallery`],
  ["studio", `${BASE}/studio`],
  ["zen-grand", `${BASE}/play?mode=zen&v=3&size=grand&subtlety=ethereal`],
  ["level300", `${BASE}/play?mode=level&n=300`],
]) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1800);
  await shot(name);
}
// A phone-sized board
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/play?mode=level&n=120`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await shot("phone-level120");

console.log("errors:", errors.length);
for (const e of errors.slice(0, 10)) console.log(e);
await browser.close();

// ---- pointer checks: drag-swap and tap-swap on a fresh board -----------
{
  const b2 = await chromium.launch();
  const c2 = await b2.newContext({ viewport: { width: 1280, height: 900 } });
  await c2.addInitScript(() => {
    if (localStorage.getItem("gradhuely-profile")) return;
    localStorage.setItem(
      "gradhuely-profile",
      JSON.stringify({ state: { worldSeed: 20251109, onboarded: true }, version: 2 }),
    );
  });
  const p = await c2.newPage();
  await p.goto(`${BASE}/play?mode=level&n=40`, { waitUntil: "load" });
  await p.waitForTimeout(800);
  await p.keyboard.press("Space");
  await p.waitForTimeout(1200);
  const sel = (n) => `[data-testid="tile-${n}"], #tile-${n}`;
  const color = (n) => p.locator(sel(n)).first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const center = async (n) => {
    const b = await p.locator(sel(n)).first().boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  // drag 1 → 2
  let [a1, a2] = [await color(1), await color(2)];
  let [x1, y1] = await center(1);
  let [x2, y2] = await center(2);
  await p.mouse.move(x1, y1);
  await p.mouse.down();
  await p.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 6 });
  await p.mouse.move(x2, y2, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(800);
  console.log("drag swap:", (await color(1)) === a2 && (await color(2)) === a1);
  // tap 5 then 6
  [a1, a2] = [await color(5), await color(6)];
  [x1, y1] = await center(5);
  [x2, y2] = await center(6);
  await p.mouse.click(x1, y1);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/tap-selected.png` });
  await p.mouse.click(x2, y2);
  await p.waitForTimeout(800);
  console.log("tap swap:", (await color(5)) === a2 && (await color(6)) === a1);
  await b2.close();
}
