/**
 * THE MAP AND RETRACE SUITE, ON ITS OWN PORT (brief M5, plan §3.3, §4.6).
 *
 * A second config so this spec can run at the same time as the other offline
 * suites: its own port, its own build and its own output directory, so nothing
 * here collides with `playwright.config.ts` (ports 7441/7442).
 *
 * The build is a REVIEW build — VITE_ICEFALL_FORCE_MOUNTAIN=1 — because the
 * Map tab needs a trip with recorded coordinates to plot, and the only trip
 * whose places are all real and all checkable is the Goûter example
 * (`src/mountain/exampleTrip.ts`, itself gated to review builds). Never build
 * inside the repo while the dev server runs — copy it first:
 *
 *   cp -Rc icefall-app /tmp/icefall-map
 *   (cd /tmp/icefall-map && VITE_ICEFALL_FORCE_MOUNTAIN=1 npx vite build)
 *   ICEFALL_E2E_MAP_DIST=/tmp/icefall-map/dist \
 *     npx playwright test -c e2e/playwright.map.config.ts
 *
 * WHAT THIS CANNOT PROVE (plan §8.3): a mocked geolocation is not a receiver.
 * Time to a first fix with no signal, and whether a phone has a magnetometer
 * at all, are the phone test.
 */

import { defineConfig } from "@playwright/test";

const PORT = 6313;
const dist = process.env.ICEFALL_E2E_MAP_DIST;
const channel = process.env.ICEFALL_E2E_BROWSER_CHANNEL ?? "chrome";
const outputDir =
  process.env.ICEFALL_E2E_MAP_OUTPUT ??
  "/private/tmp/claude-501/-Users-christofispapadopoulos-Downloads-creator-hub-dashboard-main/979cdb66-3151-44b0-addc-57d69587d8bb/scratchpad/mountain-final/e2e-6313";

if (!dist) {
  throw new Error(
    "Set ICEFALL_E2E_MAP_DIST to a built dist folder (see the header of e2e/playwright.map.config.ts).",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: /mountain-map\.spec\.ts/,
  outputDir,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    ...(channel ? { channel } : {}),
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/Paris",
    serviceWorkers: "allow",
  },
  webServer: [
    {
      command: `node e2e/serve.mjs "${dist}" ${PORT}`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: false,
      cwd: "..",
    },
  ],
});
