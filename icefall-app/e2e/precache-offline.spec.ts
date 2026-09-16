import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, test } from "@playwright/test";

import { installApp, phoneReportsNoNetwork, seedTripRunningToday, watchExternalRequests } from "./helpers";

/**
 * THE SAVED COPY OF THE APP (plan §2.3, §6.1): every built chunk and every
 * self-hosted font is in the service worker's precache after one online visit,
 * and every Mountain mode screen then opens with no signal, in the real
 * typefaces, without asking any outside host for anything.
 */

const MOUNTAIN_ROUTES = ["/mountain", "/mountain/now", "/mountain/map", "/mountain/body", "/mountain/trip", "/mountain/sos"];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

test("every built chunk and font is precached", async ({ page }) => {
  const dist = process.env.ICEFALL_E2E_PROD_DIST!;
  await installApp(page);
  const cached: string[] = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.includes("precache")) continue;
      const cache = await caches.open(name);
      for (const req of await cache.keys()) out.push(new URL(req.url).pathname);
    }
    return out;
  });
  const expected = [...filesUnder(join(dist, "assets")), ...filesUnder(join(dist, "fonts"))]
    .filter((f) => /\.(js|css|woff2)$/.test(f))
    .map((f) => "/" + relative(dist, f).split("\\").join("/"));
  expect(expected.some((p) => p.startsWith("/fonts/"))).toBe(true);
  expect(expected.filter((p) => !cached.includes(p))).toEqual([]);
});

test("every Mountain mode screen opens offline with the real typefaces and no outside request", async ({ page, context }) => {
  await installApp(page);
  await seedTripRunningToday(context);
  await phoneReportsNoNetwork(context);
  const external = watchExternalRequests(page);

  for (const route of MOUNTAIN_ROUTES) {
    await page.goto(route);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("MOUNTAIN MODE", { exact: false }).first()).toBeVisible();
  }

  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('600 48px "Inter Tight"'),
      document.fonts.load('400 24px "Instrument Serif"'),
    ]);
    // `check()` is also true for a family with no faces at all, so read the faces.
    const loaded = (family: string) =>
      [...document.fonts].some((f) => f.family.replace(/"/g, "") === family && f.status === "loaded");
    return {
      inter: loaded("Inter Tight"),
      serif: loaded("Instrument Serif"),
      stylesheets: [...document.styleSheets].map((s) => s.href).filter((h) => h && !h.startsWith(location.origin)),
    };
  });
  expect(fontsLoaded).toEqual({ inter: true, serif: true, stylesheets: [] });
  expect(external()).toEqual([]);
});
