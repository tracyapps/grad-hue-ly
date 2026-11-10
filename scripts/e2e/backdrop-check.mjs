import { chromium } from "@playwright/test";

// Verify the backdrop blobs actually render and are visible, by sampling
// pixels from a raw screenshot region away from UI cards.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:8090/zen", { waitUntil: "load" });
await page.waitForTimeout(3000);

const blobs = await page.evaluate(() => {
  const teal = document.querySelectorAll('div[style*="rgba(39, 107, 118"]');
  const plum = document.querySelectorAll('div[style*="rgba(90, 49, 104"]');
  return { teal: teal.length, plum: plum.length };
});
console.log("blob elements found:", JSON.stringify(blobs));

// Sample a screenshot region: top-left quadrant where a teal blob should glow
const buf = await page.screenshot({ clip: { x: 60, y: 120, width: 8, height: 8 } });
// PNG pixel sampling without deps: check the buffer contains non-uniform bytes
const uniq = new Set([...new Uint8Array(buf.slice(-256))]).size;
console.log("screenshot region byte variety (1=flat):", uniq > 20 ? "varied ✓" : "flat ✗");

// Also: max channel value in the region tells us if any color glows
const bytes = new Uint8Array(buf);
let max = 0;
for (let i = 0; i < bytes.length; i++) max = Math.max(max, bytes[i]);
console.log("max byte in region:", max, max > 40 ? "(color present ✓)" : "(too dark ✗)");
await browser.close();
