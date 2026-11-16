/**
 * Run with the path to an Expo web export built with
 * EXPO_PUBLIC_NEON_AUTH_URL=http://localhost:8090/auth and same-origin API calls.
 * Account API responses are controlled here to time sync relative to moves.
 */
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";

const base = "http://localhost:8090";
const exportDir = resolve(process.argv[2] ?? "dist-e2e");
const contentTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
};
const args = process.env.PLAY_SYNC_CHROMIUM_ARGS?.split(" ") ?? [];

async function checkSyncDuringPlay(trigger) {
  const browser = await chromium.launch({ args });
  let worldSeed = 777;
  let releaseInitialSync;
  const initialSync = new Promise((resolve) => { releaseInitialSync = resolve; });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => {
      localStorage.setItem("gradhuely-profile", JSON.stringify({
        state: { worldSeed: 777, onboarded: true, settings: { showMoves: true, sound: false } },
        version: 3,
      }));
      // Exercise the app's visibility listener without relying on window focus
      // behavior in headless Chromium.
      let visibility = "visible";
      Object.defineProperty(document, "visibilityState", { get: () => visibility });
      window.setTestVisibility = (value) => {
        visibility = value;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await page.route(`${base}/**`, async (route) => {
      const asset = join(exportDir, new URL(route.request().url()).pathname);
      const path = extname(asset) ? asset : join(exportDir, "index.html");
      if (!existsSync(path)) {
        await route.fulfill({ status: 404 });
        return;
      }
      await route.fulfill({ path, contentType: contentTypes[extname(path)] });
    });
    await page.route("**/auth/get-session", (route) =>
      route.fulfill({ json: { user: { id: "player", email: "player@example.com" } } }));
    await page.route("**/auth/token", (route) => route.fulfill({ json: { token: "test.jwt.token" } }));
    await page.route("**/api/me", (route) => route.fulfill({ json: { username: "player" } }));
    await page.route("**/api/profile", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({ json: {} });
        return;
      }
      if (trigger === "startup") await initialSync;
      await route.fulfill({ json: { data: {
        v: 1,
        profile: {
          worldSeed, level: 1, solvedCount: 0, totalMoves: 0, bestMoves: {},
          zenNonce: 5, today: {}, gallery: [], onboarded: true,
        },
        studio: { gradients: [], deleted: {} },
      } } });
    });

    const waitForUpload = () => page.waitForResponse(
      (response) => response.url() === `${base}/api/profile` && response.request().method() === "PUT",
    );
    const firstUpload = trigger === "visibility" ? waitForUpload() : undefined;
    await page.goto(`${base}/play?mode=endless&v=5&cols=9&rows=12&sub=subtle`);
    await firstUpload;
    const tiles = page.getByTestId("board").getByTestId(/^tile-/);
    const colors = () => tiles.evaluateAll((cells) =>
      cells.map((cell) => getComputedStyle(cell).backgroundColor));
    await expect(page.getByText(/memorize the gradient/)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByText(/drag, or tap two tiles/)).toBeVisible();
    const startingColors = await colors();

    const move = async () => {
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
    };
    const beforeSyncMoves = trigger === "startup" ? 1 : 3;
    for (let i = 0; i < beforeSyncMoves; i++) {
      await move();
      await expect(page.getByText(`${i + 1} move${i === 0 ? "" : "s"}`, { exact: true })).toBeVisible();
    }
    const playedColors = await colors();
    expect(playedColors).not.toEqual(startingColors);

    const upload = waitForUpload();
    if (trigger === "startup") {
      releaseInitialSync();
    } else {
      await page.evaluate(() => window.setTestVisibility("hidden"));
      worldSeed = 888;
      await page.evaluate(() => window.setTestVisibility("visible"));
    }
    await upload;
    expect(await colors(), `${trigger} sync should preserve the board's colors and placement`).toEqual(playedColors);

    // Wait past the original reveal delay to catch a second shuffle.
    await page.waitForTimeout(4000);
    expect(await colors(), `${trigger} sync should preserve tile placement after the reveal delay`).toEqual(playedColors);
    await move();
    await expect(page.getByText(`${beforeSyncMoves + 1} moves`, { exact: true })).toBeVisible();
    if (trigger === "visibility") {
      await page.getByRole("button", { name: "Board size 9 by 12. Change size" }).click();
      await page.getByRole("radio", { name: "6 by 8, 48 tiles" }).click();
      await page.getByRole("button", { name: "restart at · 6×8" }).click();
      await expect(tiles).toHaveCount(48);
      await expect(page.getByText("4 moves", { exact: true })).toHaveCount(0);
      await expect(page.getByText(/drag, or tap two tiles/)).toBeVisible();
    }
  } finally {
    releaseInitialSync();
    await browser.close();
  }
}

test("a delayed startup sync preserves the first move", () => checkSyncDuringPlay("startup"));
test("returning to the tab preserves play, and resizing starts a new round", () => checkSyncDuringPlay("visibility"));
