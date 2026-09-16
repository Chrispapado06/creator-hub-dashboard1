/**
 * READINESS, COACH, COMFORT AND SOS DATA — its own config, on its own port.
 *
 * Why not `playwright.config.ts`: that one pins 7441/7442 and one output
 * folder, and several people run the offline suites in this repo at the same
 * time. A second run on the same ports kills the first one's servers. This
 * file is the same shape on 6314, with its own output directory outside the
 * repo, so the two runs cannot touch each other.
 *
 * ONE BUILD, AND IT IS THE DEMO ONE. `VITE_ICEFALL_DEMO=1` is the only build
 * where `/trip/ready` can be reached without a Supabase session — the
 * checklist lives inside `AppShell`, because it is a before-you-go screen. It
 * does NOT set `VITE_SHOW_DEMO`, so `buildExampleTrip` still returns null and
 * no fixture trip appears on the Mountain screens; everything those tests read
 * is seeded by the test itself.
 *
 *   cp -Rc icefall-app <scratch>/ready-demo
 *   (cd <scratch>/ready-demo && VITE_ICEFALL_DEMO=1 npx vite build)
 *   ICEFALL_E2E_READY_DIST=<scratch>/ready-demo/dist \
 *     npx playwright test -c e2e/playwright.ready.config.ts
 *
 * Never build inside the repo: the dev server serves that `dist` unstyled.
 */

import { defineConfig } from "@playwright/test";

const PORT = 6314;
const dist = process.env.ICEFALL_E2E_READY_DIST;
const channel = process.env.ICEFALL_E2E_BROWSER_CHANNEL ?? "chrome";

if (!dist) {
  throw new Error(
    "Set ICEFALL_E2E_READY_DIST to a VITE_ICEFALL_DEMO=1 build's dist folder (see the header of e2e/playwright.ready.config.ts).",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: /mountain-ready\.spec\.ts/,
  outputDir:
    "/private/tmp/claude-501/-Users-christofispapadopoulos-Downloads-creator-hub-dashboard-main/979cdb66-3151-44b0-addc-57d69587d8bb/scratchpad/mountain-final/e2e-6314",
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
  webServer: {
    command: `node e2e/serve.mjs "${dist}" ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    cwd: "..",
  },
});
