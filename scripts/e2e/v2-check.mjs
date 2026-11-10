import { chromium } from "@playwright/test";

const BASE = "http://localhost:8090";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

// Fresh context: onboard past the teach puzzle
await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.locator("text=skip — I know how this works").click();
await page.waitForTimeout(800);

// 1. New corner-field boards at several levels
for (const [n, name] of [[1, "l1"], [17, "l17"], [60, "l60"], [300, "l300"]]) {
  await page.goto(`${BASE}/play?mode=level&n=${n}`, { waitUntil: "load" });
  await page.waitForTimeout(n === 1 ? 5600 : 4200);
  await page.screenshot({ path: `/tmp/gh-v2-${name}.png` });
}

// 2. Corner assist ON by default: locked corner tiles show dots, and after
//    shuffle the corners should already be solved.
await page.goto(`${BASE}/play?mode=level&n=10`, { waitUntil: "load" });
await page.waitForTimeout(5200);
const body = await page.locator("body").innerText();
console.log("HUD shows 'set corners' (should be false with assist on):", /set corners/.test(body));
console.log("move counter hidden by default (should be false):", /1? ?moves?/.test(body) && /\d+ moves/.test(body));

// 3. Turn assist OFF + show moves ON via the store, then check HUD
await page.evaluate(() => {
  const raw = localStorage.getItem("gradhuely-profile");
  const p = JSON.parse(raw);
  p.state.settings.cornerAssist = false;
  p.state.settings.showMoves = true;
  localStorage.setItem("gradhuely-profile", JSON.stringify(p));
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(5800);
const body2 = await page.locator("body").innerText();
console.log("HUD shows 'set corners' with assist off:", /set corners/i.test(body2));
await page.screenshot({ path: "/tmp/gh-v2-assist-off.png" });

// 4. Studio: create from corners, save, play
await page.goto(`${BASE}/studio`, { waitUntil: "load" });
await page.waitForTimeout(2000);
await page.locator(".gh-name").fill("test dawn");
await page.locator(".gh-name").fill("test dawn"); // ensure event lands
await page.waitForTimeout(300);
// change one corner color through the DOM input
await page.locator(".gh-corner input").nth(0).evaluate((el, v) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, "#e0563f");
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/gh-v2-studio.png" });
await page.locator("text=save to library").click();
await page.waitForTimeout(600);
const libCount = await page.locator("[data-testid], #nope").count(); // noop
const savedVisible = await page.locator("text=saved — find it in the library below").isVisible();
console.log("studio save confirmed:", savedVisible);
const playChip = page.locator("text=play 7 × 9").first();
console.log("library play chip visible:", await playChip.isVisible().catch(() => false));
await playChip.click();
await page.waitForTimeout(5200);
const body3 = await page.locator("body").innerText();
console.log("studio board opened:", /TEST DAWN/.test(body3));
await page.screenshot({ path: "/tmp/gh-v2-studio-play.png" });

console.log("--- errors:", errors.length);
for (const e of errors.slice(0, 8)) console.log(e);
await browser.close();
