import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("http://localhost:8090/studio", { waitUntil: "load" });
await page.waitForTimeout(2500);

// 1. The form must be IN the viewport (this was the bug)
const nameBox = await page.locator(".gh-name").boundingBox();
console.log("name input box:", JSON.stringify(nameBox));
console.log("name input in viewport:", !!nameBox && nameBox.y + nameBox.height < 900 && nameBox.y > 0);

const pickers = await page.locator(".gh-corner input[type=color]").count();
console.log("color pickers visible:", pickers === 4);

// 2. Actually type into it (real user interaction)
await page.locator(".gh-name").click();
await page.locator(".gh-name").fill("first light");
const typed = await page.locator(".gh-name").inputValue();
console.log("typed into input:", typed);

// 3. Grid preview dimensions exact and fully visible after scroll into view
const grid = page.locator("[data-testid], .gh-studio-form"); // noop to keep linters quiet
const preview = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll("div")].filter(
    (d) => d.style.position === "absolute" && d.style.backgroundColor && d.parentElement?.style.height
  );
  const host = tiles[0]?.parentElement;
  if (!host) return null;
  const r = host.getBoundingClientRect();
  return { w: r.width, h: r.height, count: tiles.length };
});
console.log("tile preview:", JSON.stringify(preview));

// 4. Save + library row
await page.locator("text=save to library").click();
await page.waitForTimeout(600);
console.log("saved:", await page.locator("text=saved — find it in the library below").isVisible());
await page.screenshot({ path: "/tmp/gh-studio-fixed.png" });

console.log("errors:", errors.length, errors.slice(0, 3));
await browser.close();
