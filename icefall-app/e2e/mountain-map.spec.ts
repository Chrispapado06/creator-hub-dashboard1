/**
 * THE MAP TAB AND RETRACE, OFFLINE (brief M5, plan §3.3, §4.6).
 *
 * Run with e2e/playwright.map.config.ts — its own port and its own build, so
 * it can run beside the other offline suites. See that file's header.
 *
 * The three things being proved:
 *   · the plot draws this phone's own GPS dot, asks no tile service for
 *     anything (Mapbox included), and says there is no map behind it;
 *   · Retrace gives distance and bearing back to the last camp the track was
 *     actually at, and to where this walk started;
 *   · with no compass the screen says so, and the bearing stands on its own.
 *
 * The positions are mocked by the browser. Every coordinate that stands for a
 * real place — Refuge du Goûter, Refuge de Tête Rousse — is the one in
 * `src/data/mountainCamps.ts`, from OpenStreetMap. Nothing here is invented.
 */

import { expect, test, type Page } from "@playwright/test";

import { installApp, phoneReportsNoNetwork, sosLink, watchExternalRequests } from "./helpers";

/** Both from `src/data/mountainCamps.ts` (OpenStreetMap), unchanged. */
const GOUTER = { lat: 45.8510883, lon: 6.8305967 };
const TETE_ROUSSE = { lat: 45.8549387, lon: 6.8175254 };
/** Where the walker is standing in these tests: above both huts, on no recorded place. */
const HERE = { lat: 45.845, lon: 6.842 };

const TRACK_ID = "e2e-map-track";
const NO_BASEMAP_START = "There is no map behind this.";
const NO_ROUTE_LINE = "No route line. ICEFALL holds no geometry for this route, so it draws none.";
const ROUTE_LINE_LABEL = "Illustrative — not for navigation";
/* No \b in front: the compass point follows the distance with no space between
   them in the section's flattened text ("1.1 kmNW · 307°"). */
const BEARING = /[NSEW]{1,3} · \d{1,3}°/;
const DISTANCE = /\d+(\.\d)? (m|km)/;

/**
 * A walk from Tête Rousse, past the Goûter hut, up towards the summit, written
 * into this phone's database — four minutes apart, so it is one unbroken run.
 *
 * Written AFTER the app has opened the database, never before: opening
 * `icefall-device` from a test with no version would create an empty one and
 * the app would then find none of its stores.
 */
async function seedTrack(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === "icefall-device");
  });
  await page.evaluate(
    async ([trackId, gouter, teteRousse]) => {
      const step = 4 * 60_000;
      const t0 = Date.now() - 40 * 60_000;
      const along = [
        { ...(teteRousse as { lat: number; lon: number }), altitudeM: 3165 },
        { lat: 45.853, lon: 6.824, altitudeM: 3400 },
        { ...(gouter as { lat: number; lon: number }), altitudeM: 3815 },
        { lat: 45.849, lon: 6.834, altitudeM: 3950 },
        { lat: 45.847, lon: 6.838, altitudeM: 4050 },
      ];
      const crumbs = along.map((p, i) => ({
        trackId,
        t: t0 + i * step,
        lat: p.lat,
        lon: p.lon,
        altitudeM: p.altitudeM,
        accuracyM: 8,
        altitudeAccuracyM: 12,
      }));
      localStorage.setItem(
        "icefall.mountain.track.v1",
        JSON.stringify({ id: trackId, startedAt: crumbs[0].t, lastAt: crumbs[crumbs.length - 1].t }),
      );
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("icefall-device");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains("breadcrumbs")) throw new Error("no breadcrumbs store");
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("breadcrumbs", "readwrite");
        for (const c of crumbs) tx.objectStore("breadcrumbs").put(c);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    [TRACK_ID, GOUTER, TETE_ROUSSE] as const,
  );
}

test.describe("the Map tab with no signal", () => {
  test("plots this phone's GPS dot, and asks no tile service — Mapbox included — for anything", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: HERE.lat, longitude: HERE.lon, accuracy: 10 });
    await installApp(page, "/mountain/map");
    const external = watchExternalRequests(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/mountain/map");
    await expect(sosLink(page)).toBeVisible();
    await expect(page.getByText(NO_BASEMAP_START, { exact: false })).toBeVisible();
    const plot = page.getByRole("img", { name: /Plot of your position/ });
    await expect(plot).toBeVisible();

    await page.getByRole("button", { name: "Find my position" }).click();
    // "Centre on me" only exists once there is a fix fresh enough to draw.
    const centre = page.getByRole("button", { name: "Centre on me" });
    await expect(centre).toBeVisible();
    await centre.click();
    await expect(plot.locator('circle[r="8"][fill="var(--ice-azure)"]')).toHaveCount(1);
    await expect(page.getByText("45.84500° N")).toBeVisible();

    // Not a Mapbox tab, and no library of theirs was loaded (plan §4.5).
    expect(external()).toEqual([]);
    expect(await page.evaluate(() => "mapboxgl" in window)).toBe(false);
    await expect(page.locator('script[src*="mapbox"], link[href*="mapbox"]')).toHaveCount(0);
  });

  test("draws no route line, and says why — so there is nothing to label illustrative", async ({
    page,
    context,
  }) => {
    await installApp(page, "/mountain/map");
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/map");

    await expect(page.getByText(NO_ROUTE_LINE)).toBeVisible();
    const plot = page.getByRole("img", { name: /Plot of your position/ });
    await expect(plot.locator("path[stroke-dasharray='10 6']")).toHaveCount(0);
    /* The label belongs to a drawn line. ICEFALL holds no route geometry, so no
       line is drawn and none is labelled; `mapTrip.test.ts` holds the wording. */
    await expect(page.getByText(ROUTE_LINE_LABEL)).toHaveCount(0);
  });
});

test.describe("Retrace my route with no signal", () => {
  test("gives distance and bearing back to the last camp the track was at, and to the start", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: HERE.lat, longitude: HERE.lon, accuracy: 10 });
    await installApp(page, "/mountain/map");
    await seedTrack(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/mountain/map/retrace");
    await expect(sosLink(page)).toBeVisible();

    const back = page.locator('section[aria-labelledby="back-heading"]');
    const heading = page.locator("#back-heading");

    // The camp is DERIVED: the track went inside 150 m of the Goûter hut, later
    // than it was at Tête Rousse, so that is the one offered.
    await expect(heading).toContainText("Refuge du Goûter");
    await expect(back).toContainText(DISTANCE);
    await expect(back).toContainText(BEARING);
    await expect(back.getByRole("img", { name: /Bearing \d{1,3} degrees, north at the top/ })).toBeVisible();
    await expect(back).toContainText("45.85109° N");
    const toCamp = await back.innerText();

    await page.getByRole("button", { name: "Start of this walk" }).click();
    await expect(heading).toContainText("Start of this walk");
    await expect(back).toContainText(DISTANCE);
    await expect(back).toContainText(BEARING);
    await expect(back).toContainText("45.85494° N");
    expect(await back.innerText()).not.toEqual(toCamp);

    await expect(page.getByText("Straight-line, not along a path.").first()).toBeVisible();
  });
});

test.describe("the compass", () => {
  test("a browser with no compass at all: the screen says so and the bearing stands alone", async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, "DeviceOrientationEvent", { value: undefined, configurable: true });
    });
    await installApp(page, "/mountain/map");
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/map/retrace");

    const compass = page.locator('section[aria-labelledby="compass-heading"]');
    await expect(compass).toContainText("This phone's browser has no compass.");
    await expect(compass.getByRole("button", { name: /Use my phone/ })).toHaveCount(0);
  });

  test("a phone with the API but no reading: the fallback line, not a silent wait", async ({ page, context }) => {
    // A phone whose browser has the orientation API and no magnetometer behind it.
    await context.addInitScript(() => {
      if (typeof (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent === "undefined") {
        Object.defineProperty(window, "DeviceOrientationEvent", { value: class extends Event {}, configurable: true });
      }
    });
    await installApp(page, "/mountain/map");
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/map/retrace");

    const compass = page.locator('section[aria-labelledby="compass-heading"]');
    await compass.getByRole("button", { name: /Use my phone/ }).click();
    await expect(compass).toContainText(
      "This phone did not give a compass reading. The bearing above is from the map.",
    );
  });
});
