import { chromium } from "@playwright/test";

const BASE = "http://localhost:8090";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// --- Level 1: hint row must sit fully below the board, both inside viewport
await page.goto(`${BASE}/play?mode=level&n=1`, { waitUntil: "load" });
await page.waitForTimeout(6500);

const board = await page.locator("#board, [data-testid='board']").first().boundingBox();
const hintText = page.locator("text=drag tiles to trade places").first();
const hint = await hintText.boundingBox();
console.log("board:", JSON.stringify(board));
console.log("hint:", JSON.stringify(hint));
console.log(
  "hint below board:",
  hint && board ? hint.y >= board.y + board.height - 1 : false,
);
console.log("hint inside viewport:", hint ? hint.y + hint.height <= 900 : false);

// --- Home: Outfit actually applied?
await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(2500);
const wordmarkFont = await page
  .locator("text=grad")
  .first()
  .evaluate((el) => getComputedStyle(el).fontFamily);
console.log("wordmark font-family:", wordmarkFont);

// Fonts known to the document?
const fontCheck = await page.evaluate(() => document.fonts.check('16px "Outfit"'));
console.log("Outfit loaded in document.fonts:", fontCheck);

console.log("pageerrors:", errors.length, errors.slice(0, 3));
await browser.close();
