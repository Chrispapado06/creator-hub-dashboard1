/**
 * SIGNAL COMING AND GOING (brief M2, M3). Run with
 * `e2e/playwright.signal.config.ts` — its own port and its own build, so this
 * can run beside the offline suite.
 *
 * The network is cut and restored on a LIVE page rather than at load time:
 * `context.setOffline` flips `navigator.onLine` on the open document and fires
 * the `online` / `offline` events a phone fires, which is the event these four
 * behaviours hang off. That is also why nothing here uses
 * `phoneReportsNoNetwork` — its init script pins `onLine` to false for the life
 * of the document, and half of what is under test is coming back.
 *
 * Every assertion is on what the athlete sees: the pill's own words, the
 * screen they are left on, the sentence the end-trip screen prints. The two
 * places this reads storage directly — the sync queue and the note saying a
 * debrief is owed — are both things with no screen of their own at that
 * moment, and both are the whole point of the case.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { installApp } from "./helpers";

/** Something no stored answer and no safety rule matches, so it has to be queued. */
const QUESTION = "What knots should I practise before this trip?";
const QUEUED_SENTENCE = "I'll answer when you're back online.";
const DEBRIEF_QUEUED_SENTENCE = "Your debrief will start when you're back online.";
const PENDING_DEBRIEF_KEY = "icefall.mountain.debrief.pending.v1";
const TRANSCRIPT_KEY = "icefall.mountain.coach.v1";

/** The shell's signal pill. */
const pill = (page: Page) => page.locator("header").getByRole("status");

/** Local calendar date in the page's time zone, YYYY-MM-DD, `offset` days away. */
const LOCAL_DATE_JS = `(offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }`;

/**
 * The athlete's own trip, running today, optionally filed against an
 * objective — which is what decides whether there is a debrief to owe.
 * Test data in this browser only.
 */
async function seedTrip(context: BrowserContext, goalId: string | null = null): Promise<void> {
  await context.addInitScript(`(() => {
    if (sessionStorage.getItem("e2e.signal.trip")) return;
    sessionStorage.setItem("e2e.signal.trip", "1");
    const day = ${LOCAL_DATE_JS};
    const trip = {
      id: "e2e-signal-trip", name: "Mont Blanc test trip", goalId: ${JSON.stringify(goalId)},
      peakName: "Mont Blanc", peakElevationM: 4806, mountainId: "mont-blanc", countryCode: null,
      startDate: day(-1), endDate: day(1), createdAt: new Date().toISOString(), endedAt: null,
    };
    localStorage.setItem("icefall.trip.v1", JSON.stringify({ trips: [trip], activeTripId: trip.id, nights: [], checks: [], ticks: {} }));
  })()`);
}

/** An onboarded device, so the demo build opens the full app rather than onboarding. */
async function seedAthlete(context: BrowserContext): Promise<void> {
  await context.addInitScript(`(() => {
    if (localStorage.getItem("icefall.state.v1")) return;
    localStorage.setItem("icefall.state.v1", JSON.stringify({ onboarded: true, customGoals: [], sessionOverrides: {}, kudos: [] }));
  })()`);
}

/** How many things are on the sync queue right now, straight out of the phone's database. */
async function queueDepth(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("icefall-device");
        req.onerror = () => resolve(-1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("syncQueue")) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction("syncQueue", "readonly").objectStore("syncQueue").count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => {
            db.close();
            resolve(-1);
          };
        };
      }),
  );
}

/** The coach turns on this phone, so a question answered twice is visible as two. */
async function coachReplies(page: Page): Promise<string[]> {
  return page.evaluate(
    ([key, queued]) => {
      const rows = JSON.parse(localStorage.getItem(key) ?? "[]") as {
        role?: string;
        body?: string;
      }[];
      return rows
        .filter((r) => r.role === "coach" && r.body !== queued)
        .map((r) => (r.body ?? "").slice(0, 60));
    },
    [TRANSCRIPT_KEY, QUEUED_SENTENCE] as const,
  );
}

/** Ask the coach and wait until the question is on the queue rather than in the box. */
async function askOffline(page: Page, question: string): Promise<void> {
  await page.getByLabel("Ask the coach").fill(question);
  await page.getByRole("button", { name: "Ask · no signal" }).click();
  await expect(page.getByText(QUEUED_SENTENCE).last()).toBeVisible();
}

/* -------------------------------------------------------------------------- */

test.describe("signal coming back", () => {
  test("a question asked with no signal is sent when the signal returns, and the pill says so", async ({
    page,
    context,
  }) => {
    await seedTrip(context);
    await installApp(page, "/mountain/coach");
    await expect(pill(page)).toHaveText(/^Signal/);

    await context.setOffline(true);
    await expect(pill(page)).toHaveText(/^No signal/);

    await askOffline(page, QUESTION);
    expect(await queueDepth(page)).toBe(1);
    await expect(pill(page)).toHaveText("No signal · 1 waiting to sync");

    await context.setOffline(false);
    await expect(pill(page)).toHaveText("Signal · synced 1 item");
    expect(await queueDepth(page)).toBe(0);
    // The answer itself came back and is on the phone, not just the count.
    expect(await coachReplies(page)).toHaveLength(1);
  });

  test("losing the signal and getting it back twice sends the question once", async ({
    page,
    context,
  }) => {
    await seedTrip(context);
    await installApp(page, "/mountain/coach");
    await expect(pill(page)).toHaveText(/^Signal/);

    await context.setOffline(true);
    await expect(pill(page)).toHaveText(/^No signal/);

    // The same question asked twice while it waits is one question, not two.
    await askOffline(page, QUESTION);
    await askOffline(page, QUESTION);
    expect(await queueDepth(page)).toBe(1);

    await context.setOffline(false);
    await expect(pill(page)).toHaveText("Signal · synced 1 item");
    expect(await queueDepth(page)).toBe(0);
    expect(await coachReplies(page)).toHaveLength(1);

    // Second time through: the queue is empty, so nothing is sent again.
    await context.setOffline(true);
    await expect(pill(page)).toHaveText(/^No signal/);
    await context.setOffline(false);
    await expect(pill(page)).toHaveText(/^Signal/);

    expect(await queueDepth(page)).toBe(0);
    expect(await coachReplies(page)).toHaveLength(1);
  });
});

test.describe("signal going, mid-session", () => {
  test("a trip running today switches into Mountain mode — but not while a field is being typed in", async ({
    page,
    context,
  }) => {
    await seedAthlete(context);
    await seedTrip(context);
    await installApp(page, "/explore/mountains");
    await expect(page).toHaveURL(/\/mountains$/);

    const search = page.getByLabel("Search mountains");
    await search.click();
    await search.fill("Eig");

    await context.setOffline(true);

    /* Long enough for the switch to have happened if it were going to: the
       verdict is immediate here, because `navigator.onLine` going false is
       trusted without a request. */
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/mountains$/);
    await expect(search).toHaveValue("Eig");

    // Typing finished. Now it may take the screen.
    await search.blur();
    await expect(page).toHaveURL(/\/mountain\/now$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mont Blanc");
    await expect(pill(page)).toHaveText(/^No signal/);
  });
});

test.describe("going back down", () => {
  test("ending a trip with no signal sends nothing and writes down that a debrief is owed", async ({
    page,
    context,
  }) => {
    await seedTrip(context, "e2e-signal-goal");
    await installApp(page, "/mountain/end");
    await expect(pill(page)).toHaveText(/^Signal/);

    await context.setOffline(true);
    await expect(pill(page)).toHaveText(/^No signal/);
    // What it is about to do, in the words it will use afterwards.
    await expect(page.getByText("No signal, so nothing is sent. It waits on this phone.")).toBeVisible();
    await expect(page.getByText(DEBRIEF_QUEUED_SENTENCE)).toBeVisible();

    await page.getByRole("button", { name: "End trip" }).click();

    const happened = page.locator('section[aria-label="What happened"]');
    await expect(happened.getByText(DEBRIEF_QUEUED_SENTENCE).first()).toBeVisible();
    await expect(
      happened.getByText("No signal, so nothing was sent. It waits on this phone."),
    ).toBeVisible();
    await expect(happened.getByText("Your trip, nights and checks stay on this phone.")).toBeVisible();

    const pending = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "null") as { goalId?: string } | null,
      PENDING_DEBRIEF_KEY,
    );
    expect(pending?.goalId).toBe("e2e-signal-goal");

    // Nothing was queued for a server: a debrief is kept on this phone.
    expect(await queueDepth(page)).toBe(0);
  });
});
