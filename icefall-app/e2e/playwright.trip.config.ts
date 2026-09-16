/**
 * THE TRIP TAB, OFFLINE (brief M5). A second config beside
 * `playwright.config.ts` for one reason only: several agents run the offline
 * suites at the same time, and the main config binds fixed ports 7441/7442.
 * This one takes 6311 and its own output directory, and runs a single spec.
 *
 * Same rules as the main config: a BUILT copy of the app, never the dev server
 * (the service worker is production-only), and never built inside the repo:
 *
 *   cp -Rc icefall-app <scratch>/icefall-prod && (cd <scratch>/icefall-prod && npx vite build)
 *   ICEFALL_E2E_PROD_DIST=<scratch>/icefall-prod/dist \
 *     npx playwright test -c e2e/playwright.trip.config.ts
 */

import { defineConfig } from "@playwright/test";

const PORT = 6311;
const prodDist = process.env.ICEFALL_E2E_PROD_DIST;
const channel = process.env.ICEFALL_E2E_BROWSER_CHANNEL ?? "chrome";
const outputDir =
  process.env.ICEFALL_E2E_TRIP_OUTPUT_DIR ??
  "/private/tmp/claude-501/-Users-christofispapadopoulos-Downloads-creator-hub-dashboard-main/979cdb66-3151-44b0-addc-57d69587d8bb/scratchpad/mountain-final/e2e-6311";

if (!prodDist) {
  throw new Error("Set ICEFALL_E2E_PROD_DIST to a built dist folder (see the header of e2e/playwright.trip.config.ts).");
}

export default defineConfig({
  testDir: ".",
  testMatch: /mountain-trip\.spec\.ts/,
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
      command: `node e2e/serve.mjs "${prodDist}" ${PORT}`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: false,
      cwd: "..",
    },
  ],
});
