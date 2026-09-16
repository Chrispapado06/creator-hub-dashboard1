/*
 * `@/offline/seed` MUST STAY THE FIRST LOCAL IMPORT.
 *
 * It is a no-op unless the build was made with VITE_ICEFALL_OFFLINE=1. When it
 * is not a no-op it writes the sample athlete into localStorage, and it has to
 * do that BEFORE `settings/store.ts`, `social/posts.ts` and `social/summitLog.ts`
 * are evaluated, because each of those reads localStorage once at module load
 * and caches the result. Import order is execution order; moving this line down
 * would leave the offline profile blank with nothing to explain why.
 */
import "@/offline/seed";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AppStateProvider } from "@/state/AppState";
import { captureAmbassadorCodeFromLocation } from "@/ambassador/capture";
import { eraseDeviceData } from "@/device/db";
import { onActivitiesChange, startActivitiesStorage } from "@/device/migrateActivities";
import { DEMO } from "@/offline/offline";
import { startAppUpdates } from "@/offline/appUpdate";
import { invalidateFeed } from "@/tracking/feed";
import "./index.css";

/*
 * Capture `?amb=CODE` off the URL BEFORE the router mounts and rewrites the
 * address bar. Storing it here rather than in a route component means it is
 * caught no matter which screen the link actually pointed at — a marketing
 * page, a deep link straight to /auth/signup — and it is a plain localStorage
 * write, not a network call, so it cannot fail in a way that blocks the app
 * from opening. See `@/ambassador/capture` for where it is consumed.
 */
captureAmbassadorCodeFromLocation();

/*
 * A NEW VERSION WAITS INSTEAD OF TAKING OVER MID-SESSION (service worker
 * `registerType: "prompt"`). This also replaces the injected `registerSW.js`,
 * so it must run before the app paints or nothing registers at all.
 */
startAppUpdates();

/*
 * `?fresh=1` HAS TO REACH THE DATABASE TOO.
 *
 * `@/offline/seed` clears the `icefall.` keys for the fresh-athlete tour, but
 * activities now live in IndexedDB, and the migration's own "already switched"
 * record lives there with them — so without this the wipe hands the brand-new
 * athlete the demo's activity history back on the next read. Demo builds only;
 * a production bundle cannot be talked into erasing a device with a query
 * string (`DEMO` is false there and the whole block is skipped).
 */
if (DEMO) {
  try {
    if (new URLSearchParams(window.location.search).get("fresh") === "1") {
      await eraseDeviceData();
    }
  } catch {
    /* No location, or no database to erase. The localStorage wipe still ran. */
  }
}

/*
 * ACTIVITIES MOVE TO THE ON-DEVICE DATABASE, verified before anything is
 * deleted, resumable, and never blocking the app: the race gives it 1.5 s to
 * finish before the first paint and lets it carry on afterwards either way.
 *
 * `feed.ts` caches the list at module load, so without `onActivitiesChange` a
 * screen painted before the database answered would keep the empty answer.
 */
await Promise.race([startActivitiesStorage(), new Promise((r) => setTimeout(r, 1500))]);
onActivitiesChange(invalidateFeed);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
