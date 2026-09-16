/**
 * MOUNTAIN MODE, OFFLINE, END TO END (plan §8.2; brief rule 8).
 *
 * These run against BUILT copies of the app, never the dev server: the service
 * worker is production-only, so the dev server proves nothing about offline.
 * And never build inside the repo while `npm run dev` runs — copy it first:
 *
 *   cp -Rc icefall-app /tmp/icefall-prod  && (cd /tmp/icefall-prod && npx vite build)
 *   cp -Rc icefall-app /tmp/icefall-demo  && (cd /tmp/icefall-demo && VITE_ICEFALL_DEMO=1 npx vite build)
 *   ICEFALL_E2E_PROD_DIST=/tmp/icefall-prod/dist ICEFALL_E2E_DEMO_DIST=/tmp/icefall-demo/dist \
 *     npx playwright test -c e2e/playwright.config.ts
 *
 *   prod  a normal production build: Mountain mode, SOS and the alarm, with the
 *         athlete's own trip seeded into the phone's storage where a case needs one.
 *   demo  VITE_ICEFALL_DEMO=1 (no login gate, real network code, no fixtures):
 *         losing signal inside the full app, and a stale forecast.
 *
 * Uses the installed Google Chrome (`channel: "chrome"`), so nothing is
 * downloaded; set ICEFALL_E2E_BROWSER_CHANNEL= (empty) to use Playwright's own.
 *
 * WHAT THIS CANNOT PROVE (plan §8.3): cutting the network in a browser does not
 * turn off a radio, and there is no GPS receiver here. Time to a first fix in
 * aeroplane mode, the dialler and the messaging app are the phone test.
 */

import { defineConfig } from "@playwright/test";

const PROD_PORT = 7441;
const DEMO_PORT = 7442;
const prodDist = process.env.ICEFALL_E2E_PROD_DIST;
const demoDist = process.env.ICEFALL_E2E_DEMO_DIST;
const channel = process.env.ICEFALL_E2E_BROWSER_CHANNEL ?? "chrome";

if (!prodDist || !demoDist) {
  throw new Error(
    "Set ICEFALL_E2E_PROD_DIST and ICEFALL_E2E_DEMO_DIST to built dist folders (see the header of e2e/playwright.config.ts).",
  );
}

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    ...(channel ? { channel } : {}),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/Paris",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "prod", testMatch: /(mountain|precache)-offline\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${PROD_PORT}` } },
    { name: "demo", testMatch: /full-app-offline\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${DEMO_PORT}` } },
  ],
  webServer: [
    {
      command: `node e2e/serve.mjs "${prodDist}" ${PROD_PORT}`,
      url: `http://127.0.0.1:${PROD_PORT}/`,
      reuseExistingServer: false,
      cwd: "..",
    },
    {
      command: `node e2e/serve.mjs "${demoDist}" ${DEMO_PORT}`,
      url: `http://127.0.0.1:${DEMO_PORT}/`,
      reuseExistingServer: false,
      cwd: "..",
    },
  ],
});
