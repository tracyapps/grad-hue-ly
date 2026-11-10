import { chromium } from "@playwright/test";

const BASE = "http://localhost:8090";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

const shot = (name) => page.screenshot({ path: `/tmp/gh-${name}.png` });

// 1. Home
await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(3000);
await shot("home");

// 2. Level 1 — reveal phase
await page.goto(`${BASE}/play?mode=level&n=1`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await shot("reveal");

// 3. Wait out the reveal, board should shuffle itself
await page.waitForTimeout(5000);
await shot("shuffled");

// 4. Find tiles (RNW renders testID as id or data-testid — accept either)
const tileSel = (n) => `#tile-${n}, [data-testid="tile-${n}"]`;
const boardCount = await page.locator("#board, [data-testid='board']").count();
console.log("board containers:", boardCount);

const a = page.locator(tileSel(1)).first();
const b = page.locator(tileSel(2)).first();
console.log("tiles found:", await a.count(), await b.count());

const boxA = await a.boundingBox();
const boxB = await b.boundingBox();
console.log("boxA:", JSON.stringify(boxA), "boxB:", JSON.stringify(boxB));

if (boxA && boxB) {
  const colorA = await a.evaluate((el) => getComputedStyle(el).backgroundColor);
  const colorB = await b.evaluate((el) => getComputedStyle(el).backgroundColor);
  console.log("before: A =", colorA, "B =", colorB);

  // Drag A onto B
  await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2);
  await page.mouse.down();
  const midX = boxA.x + (boxB.x - boxA.x) / 2 + boxB.width / 2;
  const midY = boxA.y + (boxB.y - boxA.y) / 2 + boxB.height / 2;
  await page.mouse.move(midX, midY, { steps: 6 });
  await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2, { steps: 6 });
  await page.waitForTimeout(150);
  await shot("mid-drag");
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const colorA2 = await a.evaluate((el) => getComputedStyle(el).backgroundColor);
  const colorB2 = await b.evaluate((el) => getComputedStyle(el).backgroundColor);
  console.log("after:  A =", colorA2, "B =", colorB2);
  console.log("swap happened:", colorA === colorB2 && colorB === colorA2);
  await shot("after-swap");

  // Moves counter should now read "1 move"
  const bodyText = await page.locator("body").innerText();
  console.log("move counter visible:", /1 move/.test(bodyText));
}

console.log("--- console/page errors:", errors.length);
for (const e of errors.slice(0, 10)) console.log(e);
await browser.close();
