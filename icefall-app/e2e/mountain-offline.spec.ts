/**
 * Mountain mode on a production build, with the network cut at the browser
 * (plan §8.2: E1–E10, E14, E17, E18). Project "prod" in playwright.config.ts.
 */

import { expect, test } from "@playwright/test";

import {
  expectNoDisabledControls,
  installApp,
  phoneReportsNoNetwork,
  seedLastPosition,
  seedTripRunningToday,
  seedTurnaround,
  sosLink,
  watchExternalRequests,
} from "./helpers";

const NO_NUMBER_HEADING = "ICEFALL holds no emergency number for this country.";
const NOTE_112 = [
  "112 is the emergency number across the European Union. Outside it, most mobile phones recognise 112 and try to route it to whatever local service exists — that is a convention built into handsets and networks, not a promise about what is at the other end.",
  "It may not be answered here. It may not reach mountain rescue. Whoever answers may not speak English. And none of it works without a signal.",
  "Ask your guide or your operator for the local number, and ask before you are on the mountain.",
];

test.describe("launching", () => {
  test("E1 offline with a trip running today: Now draws, SOS is there, nothing leaves the page", async ({ page, context }) => {
    await seedTripRunningToday(context);
    await installApp(page);
    const external = watchExternalRequests(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/");
    await expect(page).toHaveURL(/\/mountain\/now$/);
    await expect(sosLink(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mont Blanc");
    await expect(page.getByText("No turnaround time set.")).toBeVisible();
    // The pill is now the M2 one: "No signal", plus a count only when something waits.
    await expect(page.getByText("No signal", { exact: true })).toBeVisible();
    expect(external()).toEqual([]);
  });

  test("E2 offline with nothing running: the 'No signal — nothing is running' screen, with SOS", async ({ page, context }) => {
    await installApp(page);
    const external = watchExternalRequests(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/");
    await expect(page).toHaveURL(/\/mountain$/);
    await expect(page.getByRole("heading", { name: "No signal" })).toBeVisible();
    await expect(page.getByText("Nothing is running.")).toBeVisible();
    await expect(page.getByText("Open the full app · needs a signal")).toBeVisible();
    await expect(sosLink(page)).toBeVisible();
    expect(external()).toEqual([]);
  });

  test("E3 the phone says online but nothing is reachable, with a trip running: still Mountain mode", async ({ page, context }) => {
    await seedTripRunningToday(context);
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
    await page.goto("/");
    await expect(page).toHaveURL(/\/mountain\/now$/);
    await expect(sosLink(page)).toBeVisible();
  });

  test("E17 cold open offline with nothing stored: every tab draws", async ({ page, context }) => {
    await installApp(page);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await phoneReportsNoNetwork(context);
    for (const [path, text] of [
      ["/mountain/now", "No trip open."],
      ["/mountain/map", "It has not saved this area."],
      ["/mountain/body", "Headache, nausea or confusion?"],
      ["/mountain/trip", "No trip open"],
      ["/mountain/sos", NO_NUMBER_HEADING],
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(text).first()).toBeVisible();
      await expect(page.getByText("This screen did not open.")).toHaveCount(0);
      await expect(sosLink(page)).toBeVisible();
    }
  });
});

test.describe("SOS with no signal", () => {
  test("E4 on Mont Blanc: the right numbers, the phone link exactly right, nothing sent", async ({ page, context }) => {
    await seedTripRunningToday(context);
    await installApp(page);
    const external = watchExternalRequests(page);
    await phoneReportsNoNetwork(context);

    await page.goto("/mountain/sos");
    await expect(page.getByText("For Mont Blanc (France / Italy), from your trip.")).toBeVisible();
    await expect(page.locator('a[href="tel:112"]').first()).toBeVisible();
    await expect(page.locator('a[href="tel:+33450531689"]')).toBeVisible();
    await expect(page.getByText(/Read off “PGHM Chamonix — official site” on 11 September 2026\./)).toBeVisible();
    expect(external()).toEqual([]);
  });

  test("E5 no trip and no country: 112 with its full note, word for word", async ({ page, context }) => {
    await installApp(page);
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/sos");
    await expect(page.getByText("Call 112")).toBeVisible();
    await expect(page.getByText(NO_NUMBER_HEADING)).toBeVisible();
    for (const paragraph of NOTE_112) await expect(page.getByText(paragraph, { exact: true })).toBeVisible();
  });

  test("E6 a stored position three hours old: LAST KNOWN POSITION with its age, both formats", async ({ page, context }) => {
    await seedLastPosition(context, 3 * 3_600_000);
    await installApp(page);
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/sos");
    const heading = page.locator("#pos-heading");
    await expect(heading).toContainText(/last known position · 3 h ago/i);
    await expect(page.getByText("45.85109° N")).toBeVisible();
    await expect(page.getByText("6.83060° E")).toBeVisible();
    await expect(page.getByText("45° 51′ 03.9″ N")).toBeVisible();
    await expect(page.getByText("6° 49′ 50.1″ E")).toBeVisible();
    await expect(page.getByText("45° 51.065′ N")).toBeVisible();
    await expect(page.getByText(/GPS fix at \d{1,2} \w+ \d{4}, \d{2}:\d{2}/).first()).toBeVisible();
  });

  test("E7 location permission denied: the denied wording, and no disabled control anywhere", async ({ page, context }) => {
    await installApp(page);
    await context.clearPermissions();
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/sos");
    await expect(page.getByText(/Location is off for ICEFALL|Your phone has not given a GPS position/)).toBeVisible();
    await expectNoDisabledControls(page);
  });

  test("E8 permission granted and no position ever: 'No position yet' and how to say it in words", async ({ page, context }) => {
    await installApp(page);
    await context.grantPermissions(["geolocation"]);
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/sos");
    await expect(page.getByText("No position yet")).toBeVisible();
    await expect(page.getByText(/say where you are in words/)).toBeVisible();
  });

  test("a live fix in aeroplane mode reaches the screen in both formats", async ({ page, context }) => {
    await installApp(page);
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 45.8326, longitude: 6.8652, accuracy: 9 });
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/sos");
    await expect(page.locator("#pos-heading")).toContainText(/your position/i);
    await expect(page.getByText("45.83260° N")).toBeVisible();
    await expect(page.getByText("45° 49′ 57.4″ N")).toBeVisible();
    await expect(page.getByText(/Accuracy ± 9 m/)).toBeVisible();
  });

  test("E10 an emergency number read over a year ago: the age line is loud, the call button still works", async ({ page, context }) => {
    await seedTripRunningToday(context);
    await page.clock.install({ time: new Date("2027-10-01T10:00:00") });
    await installApp(page);
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/sos");
    await expect(page.getByText(/That was over a year ago\./).first()).toBeVisible();
    const call = page.locator('a[href="tel:112"]').first();
    await expect(call).toBeVisible();
    await expect(call).not.toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("E9 the text-message row", () => {
  test.describe("Android", () => {
    test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36" });
    test("uses ?body=", async ({ page }) => {
      await page.goto("/mountain/sos");
      await expect(page.locator('a[href^="sms:?body="]')).toBeVisible();
    });
  });
  test.describe("iPhone", () => {
    test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    test("uses &body=", async ({ page }) => {
      await page.goto("/mountain/sos");
      await expect(page.locator('a[href^="sms:&body="]')).toBeVisible();
    });
  });
});

test.describe("the turnaround alarm", () => {
  test("fires full-screen amber in Mountain mode with no signal, and Snooze works", async ({ page, context }) => {
    await seedTripRunningToday(context);
    await seedTurnaround(context, 25_000);
    await installApp(page, "/mountain/body");
    await phoneReportsNoNetwork(context);
    await page.goto("/mountain/body");

    const alarm = page.getByRole("alertdialog");
    await expect(alarm).toBeVisible({ timeout: 60_000 });
    await expect(alarm.getByText("Time to turn around.")).toBeVisible();
    await expect(alarm.getByText("Your guide's call comes first.")).toBeVisible();
    await expect(alarm.locator('a[href="/mountain/sos"]')).toBeVisible();
    await alarm.getByRole("button", { name: /Snooze 15 min/ }).click();
    await expect(alarm).toHaveCount(0);
    await expect(page.getByText(/^Snoozed · again in/)).toBeVisible();
  });

  test("E14 fires while the live tracker is on screen", async ({ page, context }) => {
    await seedTripRunningToday(context);
    await seedTurnaround(context, 25_000);
    await installApp(page, "/activity/live/hiking");
    await phoneReportsNoNetwork(context);
    await page.goto("/activity/live/hiking");
    await expect(sosLink(page)).toBeVisible();
    await expect(page.getByRole("alertdialog").getByText("Time to turn around.")).toBeVisible({ timeout: 60_000 });
  });
});

test("E18 emergency info survives a reload, then Delete removes it from storage", async ({ page, context }) => {
  await installApp(page);
  await phoneReportsNoNetwork(context);
  await page.goto("/mountain/sos");
  await page.getByRole("button", { name: "Add contacts and insurance" }).click();
  await page.getByLabel("Contact 1 name").fill("Test Contact");
  await page.getByLabel("Contact 1 phone number").fill("+44 20 7946 0000");
  await page.getByRole("button", { name: "Save on this phone" }).click();
  await page.reload();
  await expect(page.getByText("Test Contact", { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="sms:+442079460000"]')).toBeVisible();

  await page.getByRole("button", { name: "Delete all" }).click();
  await page.getByRole("button", { name: "Yes, delete all" }).click();
  await expect(page.getByText("Test Contact", { exact: true })).toHaveCount(0);
  const leftovers = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => (localStorage.getItem(k) ?? "").includes("Test Contact")),
  );
  expect(leftovers).toEqual([]);
});
