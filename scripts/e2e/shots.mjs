import { chromium } from "@playwright/test";

const BASE = "http://localhost:8090";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

const stops = [
  { url: BASE, name: "home", wait: 3000 },
  { url: `${BASE}/play?mode=level&n=1`, name: "level1", wait: 6500 },
  { url: `${BASE}/play?mode=level&n=60`, name: "level60", wait: 4500 },
  { url: `${BASE}/play?mode=level&n=300`, name: "level300", wait: 4500 },
  { url: `${BASE}/play?mode=zen&v=1&size=grand&subtlety=ethereal`, name: "zen-grand", wait: 5000 },
  { url: `${BASE}/zen`, name: "zen-menu", wait: 2000 },
  { url: `${BASE}/gallery`, name: "gallery", wait: 2000 },
  { url: `${BASE}/stats`, name: "stats", wait: 2000 },
  { url: `${BASE}/settings`, name: "settings", wait: 2000 },
];

for (const s of stops) {
  await page.goto(s.url, { waitUntil: "load" });
  await page.waitForTimeout(s.wait);
  await page.screenshot({ path: `/tmp/gh-${s.name}.png` });
  console.log("shot:", s.name);
}

console.log("--- errors:", errors.length);
for (const e of errors.slice(0, 10)) console.log(e);
await browser.close();
