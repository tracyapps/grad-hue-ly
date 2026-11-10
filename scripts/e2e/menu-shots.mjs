import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto("http://localhost:8090/zen", { waitUntil: "load" });
await p.waitForTimeout(3000);
await p.screenshot({ path: "/tmp/gh-zen2.png" });
await p.goto("http://localhost:8090", { waitUntil: "load" });
await p.waitForTimeout(2500);
// onboard first (fresh context), then get real home
await p.evaluate(() => localStorage.setItem("gradhuely-profile", JSON.stringify({ state: { onboarded: true, level: 26, settings: { sound: true, haptics: true, reduceMotion: false } }, version: 1 })));
await p.reload({ waitUntil: "load" });
await p.waitForTimeout(3000);
await p.screenshot({ path: "/tmp/gh-home2.png" });
await b.close();
