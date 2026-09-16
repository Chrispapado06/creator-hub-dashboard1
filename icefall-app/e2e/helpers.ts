import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * NO NAMED EXCEPTION ANY MORE. Until 2026-09-15 a production `index.html`
 * linked the two Google typefaces before any app code ran, and this list
 * carried their hosts so the offline suite could pass around a request it
 * could not yet close (plan §6.1: "self-host the two files instead"). The four
 * woff2 files now ship with the app (`src/index.css`), so nothing legitimately
 * leaves the page with no signal — if a hostname shows up here again, that is
 * a real regression, not a known gap.
 */
export function watchExternalRequests(page: Page): () => string[] {
  const seen: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return;
    seen.push(req.url());
  });
  return () => [...seen];
}

/**
 * The phone reports no network from the first frame. `setOffline` blocks the
 * requests, but Chrome gives a document loaded after it `navigator.onLine ===
 * true` (measured) — so the report a phone in aeroplane mode makes is set too.
 */
export async function phoneReportsNoNetwork(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
  });
}

/**
 * Open the app once with a signal, as the plan requires before any trip
 * (§6.1: "Open it once at home before you go"), and wait until the service
 * worker controls the page, so a later offline load is served from it.
 */
export async function installApp(page: Page, path = "/mountain/sos"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  // A page loaded before the worker activated is not controlled by it yet.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

/** Local calendar date in the page's time zone, YYYY-MM-DD, `offset` days away. */
const LOCAL_DATE_JS = `(offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }`;

/**
 * The athlete's own trip on Mont Blanc, running today (yesterday to tomorrow),
 * written into the phone's storage before the app starts — test data in this
 * browser only.
 */
export async function seedTripRunningToday(context: BrowserContext): Promise<void> {
  await context.addInitScript(`(() => {
    if (sessionStorage.getItem("e2e.trip.seeded")) return;
    sessionStorage.setItem("e2e.trip.seeded", "1");
    const day = ${LOCAL_DATE_JS};
    const trip = {
      id: "e2e-trip", name: "Mont Blanc test trip", goalId: null, peakName: "Mont Blanc",
      peakElevationM: 4806, mountainId: "mont-blanc", countryCode: null,
      startDate: day(-1), endDate: day(1), createdAt: new Date().toISOString(), endedAt: null,
    };
    localStorage.setItem("icefall.trip.v1", JSON.stringify({ trips: [trip], activeTripId: trip.id, nights: [], checks: [], ticks: {} }));
  })()`);
}

/** A last known position `ageMs` old, near Refuge du Goûter (its OpenStreetMap coordinates). */
export async function seedLastPosition(context: BrowserContext, ageMs: number): Promise<void> {
  await context.addInitScript(`(() => {
    if (sessionStorage.getItem("e2e.position.seeded")) return;
    sessionStorage.setItem("e2e.position.seeded", "1");
    localStorage.setItem("icefall.mountain.position.v1", JSON.stringify({
      lat: 45.8510883, lon: 6.8305967, accuracyM: 8, altitudeM: 3815, altitudeAccuracyM: 12, at: Date.now() - ${ageMs},
    }));
  })()`);
}

/** A turnaround for the seeded trip, `inMs` from the moment the page first loads. */
export async function seedTurnaround(context: BrowserContext, inMs: number): Promise<void> {
  await context.addInitScript(`(() => {
    if (sessionStorage.getItem("e2e.turnaround.seeded")) return;
    sessionStorage.setItem("e2e.turnaround.seeded", "1");
    const at = new Date(Date.now() + ${inMs});
    const pad = (n) => String(n).padStart(2, "0");
    localStorage.setItem("icefall.mountain.turnaround.v1", JSON.stringify({ "e2e-trip": {
      tripId: "e2e-trip", at: at.toISOString(),
      date: at.getFullYear() + "-" + pad(at.getMonth() + 1) + "-" + pad(at.getDate()),
      time: pad(at.getHours()) + ":" + pad(at.getMinutes()),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      setAt: new Date().toISOString(), snoozedUntil: null, snoozeCount: 0, turnedAt: null,
      lastObservedAt: new Date().toISOString(), missedAt: null, missedSeenAt: null,
    } }));
  })()`);
}

export const sosLink = (page: Page) => page.locator('a[href="/mountain/sos"]').first();

export async function expectNoDisabledControls(page: Page): Promise<void> {
  await expect(page.locator("main [disabled], main [aria-disabled='true']")).toHaveCount(0);
}
