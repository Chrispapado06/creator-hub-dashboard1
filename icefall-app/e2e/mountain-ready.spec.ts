/**
 * READINESS, THE COACH, COMFORT AND THE SOS DATA — end to end, on a built app
 * (brief M8, M9, M10, M6; plan §7, §9, §6.2, §5).
 *
 * Run with `e2e/playwright.ready.config.ts`, which serves ONE
 * `VITE_ICEFALL_DEMO=1` build on port 6314. See that file's header for why.
 *
 * The four things proved here, and they are the four that would be expensive
 * to get wrong on a mountain:
 *
 *   1. "Ready for no signal" draws real ticks from what is actually stored,
 *      states the lines that can never go green instead of drawing them as
 *      unfinished, and every unfinished line carries the button that finishes
 *      it — one tap, and it arrives.
 *   2. Asked with no signal, the coach answers a red flag from the SAFETY
 *      layer and does not queue it; an ordinary question gets the queued line
 *      and waits. Nothing leaves the page either way.
 *   3. The glare theme and the battery saver change the screen WITHOUT a
 *      reload — asserted as zero navigations and a window sentinel that
 *      survives, not as a colour reading.
 *   4. Every emergency number carries its source and the day it was read, and
 *      says nobody local has confirmed it; where ICEFALL holds nothing, 112
 *      with the note about what it is and is not.
 *
 * WHAT THIS CANNOT PROVE: the same as the other offline specs (plan §8.3).
 * Cutting the network in a browser does not turn a radio off, and there is no
 * GPS receiver here.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { installApp, phoneReportsNoNetwork, seedTripRunningToday, watchExternalRequests } from "./helpers";

/* -------------------------------------------------------------------------- */
/* Seeds — test data in this browser only                                      */
/* -------------------------------------------------------------------------- */

/** An onboarded device, which is what `AppShell` gates on. */
async function seedOnboarded(context: BrowserContext): Promise<void> {
  await context.addInitScript(`(() => {
    if (localStorage.getItem("icefall.state.v1")) return;
    localStorage.setItem("icefall.state.v1", JSON.stringify({ onboarded: true, customGoals: [], sessionOverrides: {}, kudos: [] }));
  })()`);
}

/** One emergency contact saved, so at least one checklist line is honestly green. */
async function seedOneEmergencyContact(context: BrowserContext): Promise<void> {
  await context.addInitScript(`(() => {
    if (localStorage.getItem("icefall.mountain.emergency-info.v1")) return;
    localStorage.setItem("icefall.mountain.emergency-info.v1", JSON.stringify({
      name: "", destinationCountry: "", insurer: "", policyRef: "", rescueHotline: "", coverNote: "",
      contacts: [{ name: "Test Contact", number: "+442079460000" }],
      savedAt: Date.now(),
    }));
  })()`);
}

/**
 * Nothing outside the test server answers. Used where the screen is a
 * before-you-go one — it is not offline, it simply must not sit waiting on a
 * host this test does not control.
 */
async function nothingOutsideAnswers(context: BrowserContext): Promise<void> {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
}

/** Everything the page would have to reload to change, in one sentinel. */
async function markPage(page: Page): Promise<string[]> {
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.evaluate(() => {
    (window as unknown as { __icefallSameDocument?: number }).__icefallSameDocument = Date.now();
  });
  return navigations;
}

async function sentinelSurvived(page: Page): Promise<boolean> {
  return page.evaluate(
    () => typeof (window as unknown as { __icefallSameDocument?: number }).__icefallSameDocument === "number",
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Ready for no signal (M8)                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Ready for no signal", () => {
  test("draws ticks from what is stored, states what cannot go green, and every unfinished line has its fix", async ({
    page,
    context,
  }) => {
    await seedOnboarded(context);
    await seedOneEmergencyContact(context);
    await nothingOutsideAnswers(context);

    await page.goto("/trip/ready");
    await expect(page.getByRole("heading", { level: 1, name: "Ready for no signal" })).toBeVisible();

    // The count, and it counts checks only.
    await expect(page.getByText(/^\d+ of \d+ done$/)).toBeVisible();

    // A TICK, and it came from the contact actually saved on this phone.
    await expect(page.getByText("Emergency contacts")).toBeVisible();
    await expect(page.getByText("1 saved")).toBeVisible();
    expect(await page.locator('[aria-label="Done"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[aria-label="Still to do"]').count()).toBeGreaterThan(0);

    // AN INFO LINE, STATED RATHER THAN TICKED: no map service lets an area be
    // downloaded, so the row says so and carries the licence position (rule 4).
    await expect(page.getByText("Map for offline use")).toBeVisible();
    await expect(page.getByText(/It has not saved this area\./)).toBeVisible();
    await expect(page.getByText(/OpenStreetMap's tile policy forbids offline use by name/)).toBeVisible();
    // And it offers no fix, because there is none to offer.
    await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);

    // No trip open is said, not drawn as a failure.
    await expect(page.getByText("No trip is open, so there is nothing to download yet.")).toBeVisible();

    // A ONE-TAP FIX THAT IS AN ACTION: the location line's own button.
    await expect(page.getByRole("button", { name: /^(Allow|Check)$/ })).toBeVisible();

    // A ONE-TAP FIX THAT IS A LINK, and it arrives where it says it does.
    const add = page.getByRole("link", { name: "Add" }).first();
    await expect(add).toHaveAttribute("href", "/mountain/sos");
    await add.click();
    await expect(page).toHaveURL(/\/mountain\/sos$/);
    await expect(page.getByRole("heading", { level: 2, name: "Emergency numbers" })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The coach with no signal (M9)                                            */
/* -------------------------------------------------------------------------- */

test.describe("the coach with no signal", () => {
  test("a red flag is answered by the safety layer and never queued; an ordinary question queues and says so", async ({
    page,
    context,
  }) => {
    await seedTripRunningToday(context);
    await installApp(page, "/mountain/coach");
    const external = watchExternalRequests(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/mountain/coach");
    await expect(page.getByRole("heading", { level: 1, name: "Coach" })).toBeVisible();
    await expect(
      page.getByText("No signal. I answer from what is on this phone, and I never guess."),
    ).toBeVisible();

    const box = page.getByLabel("Ask the coach");
    const send = page.getByRole("button", { name: "Ask · no signal" });

    // THE SAFETY LAYER FIRST. Not the rules, not the queue.
    await box.fill("My partner has crushing chest pain and is sweating.");
    await send.click();
    await expect(page.getByText("Safety", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Stop now and call emergency services\./)).toBeVisible();
    await expect(page.getByText(/ICEFALL is not a medical service and cannot assess you\./)).toBeVisible();
    // An emergency does not wait in an outbox.
    await expect(page.getByText("I'll answer when you're back online.")).toHaveCount(0);

    // AN ORDINARY QUESTION. Nothing on this phone answers it, so it waits.
    await box.fill("Which knot should I use for the abseil?");
    await send.click();
    await expect(page.getByText("I'll answer when you're back online.")).toBeVisible();
    await expect(
      page.getByText(
        "It is waiting on this phone. ICEFALL sends it next time you open the app with a signal.",
      ),
    ).toBeVisible();

    // The safety answer is still on screen above it: two turns, in order.
    await expect(page.getByText(/^Stop now and call emergency services\./)).toBeVisible();

    // It survives a reload with no signal — a conversation that empties on a
    // mountain is a conversation nobody trusts.
    await page.reload();
    await expect(page.getByText("I'll answer when you're back online.")).toBeVisible();
    await expect(page.getByText(/^Stop now and call emergency services\./)).toBeVisible();

    expect(external()).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Comfort: glare and battery saver, with no reload (M10)                   */
/* -------------------------------------------------------------------------- */

test.describe("battery saver and the glare theme", () => {
  test("both change the screen in place — no navigation, no reload", async ({ page, context }) => {
    await installApp(page, "/mountain/settings");
    await phoneReportsNoNetwork(context);

    await page.goto("/mountain/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    const navigations = await markPage(page);
    const themeAttr = () => page.evaluate(() => document.documentElement.getAttribute("data-mountain-theme"));
    const motionAttr = () => page.evaluate(() => document.documentElement.getAttribute("data-mountain-motion"));
    const textAttr = () => page.evaluate(() => document.documentElement.getAttribute("data-mountain-text"));

    expect(await themeAttr()).toBe("dark");

    // GLARE: high contrast for snow, repainted in place.
    await page.getByRole("radio", { name: /Glare/ }).click();
    await expect.poll(themeAttr).toBe("glare");
    await expect(page.getByRole("radio", { name: /Glare/ })).toHaveAttribute("aria-checked", "true");

    // BATTERY SAVER: on by default outside a recording; turning it off is
    // immediate, and the row says what is true now rather than what the switch
    // says.
    const saver = page.getByRole("switch", { name: /Battery saver/ });
    await expect(saver).toHaveAttribute("aria-checked", "true");
    expect(await motionAttr()).toBe("reduced");
    // With no signal it is never allowed near GPS, and the row says so.
    await expect(page.getByText(/Battery saver never applies to GPS when you have no signal\./)).toBeVisible();

    await saver.click();
    await expect(saver).toHaveAttribute("aria-checked", "false");
    await expect.poll(motionAttr).toBe("full");
    await expect(page.getByText("Off.", { exact: true })).toBeVisible();

    await saver.click();
    await expect(saver).toHaveAttribute("aria-checked", "true");
    await expect.poll(motionAttr).toBe("reduced");

    // Large text, same rule.
    await page.getByRole("switch", { name: /Large text/ }).click();
    await expect.poll(textAttr).toBe("large");

    // THE POINT OF THE TEST: nothing above reloaded or navigated. Losing a GPS
    // lock to a colour change would be absurd on a mountain.
    expect(navigations).toEqual([]);
    expect(await sentinelSurvived(page)).toBe(true);

    // And the glare choice is still the one in force after all of that.
    expect(await themeAttr()).toBe("glare");
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The SOS dataset (M6)                                                     */
/* -------------------------------------------------------------------------- */

test.describe("SOS numbers carry their source and their dates", () => {
  test("on Mont Blanc: the source, the day it was read, and that nobody local has confirmed it", async ({
    page,
    context,
  }) => {
    await seedTripRunningToday(context);
    await installApp(page);
    const external = watchExternalRequests(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/mountain/sos");
    await expect(page.getByText("For Mont Blanc (France / Italy), from your trip.")).toBeVisible();

    // The number, and beside it the whole provenance sentence — never a bare date.
    await expect(page.locator('a[href="tel:+33450531689"]')).toBeVisible();
    await expect(
      page.getByText(
        /Read off “PGHM Chamonix — official site” on \d{1,2} \w+ \d{4}\. Nobody who works in France has confirmed it since\./,
      ),
    ).toBeVisible();

    // AND THE HOLE IN THE DATA, NAMED. A hole nobody is told about is a lie.
    await expect(
      page.getByText(/France's text-message emergency line, 114, is not in ICEFALL's data/),
    ).toBeVisible();

    expect(external()).toEqual([]);
  });

  test("where ICEFALL holds nothing: 112, with what it is and is not", async ({ page, context }) => {
    await installApp(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/mountain/sos");
    await expect(page.getByText("ICEFALL holds no emergency number for this country.")).toBeVisible();
    await expect(page.getByText("Call 112")).toBeVisible();
    await expect(page.locator('a[href="tel:112"]').first()).toBeVisible();
    await expect(page.getByText(/that is a convention built into handsets and networks, not a promise/)).toBeVisible();
    await expect(page.getByText(/It may not be answered here\./)).toBeVisible();
    // No guessed local number anywhere on the screen.
    await expect(page.locator('a[href^="tel:+"]')).toHaveCount(0);
  });
});
