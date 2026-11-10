import { chromium } from "@playwright/test";
const BASE = "http://localhost:8090";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(2000);

// Jump ahead 25 levels
await page.locator("text=+25").first().click();
await page.waitForTimeout(600);
const afterClick = await page.locator("text=EVENTIDE").first().isVisible().catch(() => false);
console.log("after +25 shows EVENTIDE:", afterClick);

// Reload — progress must survive
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);
const body = await page.locator("body").innerText();
console.log("after reload still EVENTIDE · 26:", /EVENTIDE\s*·\s*26/.test(body.replaceAll("\n", " ")));

// Storage contents
const stored = await page.evaluate(() => localStorage.getItem("gradhuely-profile"));
console.log("profile in localStorage:", stored ? stored.slice(0, 140) + "…" : "MISSING");
await browser.close();
