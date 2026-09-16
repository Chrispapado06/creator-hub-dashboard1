/**
 * The full app on a VITE_ICEFALL_DEMO=1 build — no login gate, real network
 * code, no fixtures (plan §8.2: E11, E12, E16). Project "demo".
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { installApp, watchExternalRequests } from "./helpers";

/** An onboarded device — test data in this browser only. The demo build fills in its sample objectives. */
async function seedAthlete(context: BrowserContext) {
  await context.addInitScript(`(() => {
    if (localStorage.getItem("icefall.state.v1")) return;
    localStorage.setItem("icefall.state.v1", JSON.stringify({ onboarded: true, customGoals: [], sessionOverrides: {}, kudos: [] }));
  })()`);
}

/** The first objective the demo build gave the athlete, read back from the phone's storage. */
async function firstGoalId(page: Page): Promise<string> {
  await page.goto("/goals");
  const id = await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("icefall.state.v1") ?? "{}") as { customGoals?: { id: string }[] };
    return s.customGoals?.[0]?.id ?? null;
  });
  return (await id.jsonValue()) as string;
}

const HOUR = 3_600_000;
const CHAMONIX_OFFSET_S = 7200;

/** An Open-Meteo answer whose `current` block was modelled `ageMs` ago, in the peak's own clock. */
function forecastPayload(ageMs: number) {
  const readAt = Date.now() - ageMs;
  const local = (ms: number) => new Date(ms + CHAMONIX_OFFSET_S * 1000).toISOString().slice(0, 16);
  const dayStart = Date.parse(`${local(readAt).slice(0, 10)}T00:00:00Z`) - CHAMONIX_OFFSET_S * 1000;
  const hours = Array.from({ length: 24 * 7 }, (_, i) => dayStart + i * HOUR);
  return {
    utc_offset_seconds: CHAMONIX_OFFSET_S,
    current: {
      time: local(readAt),
      temperature_2m: -7,
      apparent_temperature: -14,
      wind_speed_10m: 41,
      wind_direction_10m: 300,
      precipitation: 0,
      weather_code: 3,
      is_day: 1,
    },
    hourly: {
      time: hours.map(local),
      temperature_2m: hours.map(() => -6),
      weather_code: hours.map(() => 3),
      is_day: hours.map(() => 1),
      freezing_level_height: hours.map(() => 3100),
      visibility: hours.map(() => 9000),
    },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => local(dayStart + i * 24 * HOUR).slice(0, 10)),
      temperature_2m_max: Array(7).fill(-3),
      temperature_2m_min: Array(7).fill(-11),
      wind_speed_10m_max: Array(7).fill(45),
      precipitation_sum: Array(7).fill(0),
      snowfall_sum: Array(7).fill(0),
    },
  };
}

test("E11 + E12 losing signal mid-session offers Mountain mode without moving the screen; 'Not now' is not 'never'", async ({ page, context }) => {
  await seedAthlete(context);
  await installApp(page, "/goals");
  await expect(page).toHaveURL(/\/goals$/);
  const offer = page.getByRole("status").filter({ hasText: "No signal" });

  await context.setOffline(true);
  await expect(offer.getByText("No signal — switch to Mountain mode?")).toBeVisible();
  await expect(page).toHaveURL(/\/goals$/);

  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(offer.getByText("No signal — pages you have already opened are saved on this phone.")).toBeVisible();

  await page.evaluate(() => {
    history.pushState({}, "", "/explore");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(offer.getByText("No signal — switch to Mountain mode?")).toBeVisible();

  await offer.getByRole("link", { name: "Switch" }).click();
  await expect(page).toHaveURL(/\/mountain$/);
  await expect(page.getByRole("heading", { name: "No signal" })).toBeVisible();
});

test("E16 a forecast the phone kept for 30 hours is labelled and greyed; the weather now is withheld", async ({ page, context }) => {
  await seedAthlete(context);
  await context.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastPayload(30 * HOUR)) }),
  );
  await page.goto(`/mountain/${await firstGoalId(page)}/conditions`);
  await expect(page.getByText("The weather now is not shown: the last reading on this phone is 30 h old.")).toBeVisible();
  await expect(page.getByText("Old forecast, read 30 h ago. Nothing newer has reached this phone.")).toBeVisible();
  // The forecast ahead is drawn greyed, not at full strength.
  const forecastBlock = page.getByText("Old forecast, read 30 h ago.").locator("xpath=following-sibling::div[1]");
  await expect(forecastBlock).toHaveCSS("opacity", "0.6");
  await expect(page.getByText("−7", { exact: false })).toHaveCount(0);
});

test("a fresh forecast carries no age line: the online app is unchanged", async ({ page, context }) => {
  await seedAthlete(context);
  const external = watchExternalRequests(page);
  await context.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastPayload(10 * 60_000)) }),
  );
  await page.goto(`/mountain/${await firstGoalId(page)}/conditions`);
  await expect(page.getByText(/^Modelled for \d{2}:\d{2} local time/)).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: /read .* ago|not shown/ })).toHaveCount(0);
  expect(external().every((u) => u.startsWith("https://api.open-meteo.com/"))).toBe(true);
});
