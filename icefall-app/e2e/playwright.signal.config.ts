/**
 * SIGNAL COMING AND GOING, END TO END (brief M2, M3). One spec:
 * `mountain-signal.spec.ts`.
 *
 * Its own config and its own port so it can run beside the offline suite —
 * `playwright.config.ts` holds 7441/7442 and its own output folder, and two
 * runs sharing either would fight.
 *
 * ONE BUILD, THE DEMO ONE (VITE_ICEFALL_DEMO=1). These cases need the full app
 * as well as Mountain mode — the automatic switch happens on an ordinary
 * screen — and the demo build is the one with no login gate in front of it.
 * Nothing here is faked by that flag: the reachability check, the sync queue
 * and the end-trip flow are the same code on both builds.
 *
 * Build it OUTSIDE the repo, because a build inside it while `npm run dev`
 * runs serves the app unstyled:
 *
 *   cp -Rc icefall-app /tmp/icefall-signal
 *   (cd /tmp/icefall-signal && VITE_ICEFALL_DEMO=1 npx vite build)
 *   ICEFALL_E2E_SIGNAL_DIST=/tmp/icefall-signal/dist \
 *     npx playwright test -c e2e/playwright.signal.config.ts
 *
 * WHAT THIS CANNOT PROVE, same as the offline suite: turning the network off
 * in a browser is not turning a radio off, and there is no GPS here. Time to a
 * first fix in aeroplane mode is still the phone test.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

const PORT = 6312;
const dist = process.env.ICEFALL_E2E_SIGNAL_DIST;
const channel = process.env.ICEFALL_E2E_BROWSER_CHANNEL ?? "chrome";

if (!dist) {
  throw new Error(
    "Set ICEFALL_E2E_SIGNAL_DIST to a VITE_ICEFALL_DEMO=1 build (see the header of e2e/playwright.signal.config.ts).",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: /mountain-signal\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  // Never inside the repo: other agents' runs are writing there at the same time.
  outputDir: process.env.ICEFALL_E2E_SIGNAL_OUT ?? join(tmpdir(), "icefall-e2e-signal"),
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
