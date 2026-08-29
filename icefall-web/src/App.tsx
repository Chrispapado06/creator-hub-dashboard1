import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import Waitlist from "@/screens/Waitlist";

/**
 * ICEFALL on the web.
 *
 * ── BEFORE LAUNCH (now) ─────────────────────────────────────────────────────
 * The public site is the waitlist, and only the waitlist. Every path renders
 * it, including ones that used to be something else, because a stray link into
 * a half-open marketplace is a worse first impression than no marketplace at
 * all.
 *
 * ── THE MARKETPLACE ─────────────────────────────────────────────────────────
 * The search-first booking site — guides, expeditions, flights, stays — is not
 * deleted. It is mounted at /preview/* IN DEVELOPMENT ONLY, so it can keep
 * being built while the public sees a launch page.
 *
 * The `import.meta.env.DEV` test wraps the `lazy()` call itself, not just the
 * route that renders it. Vite substitutes `false` there at build time, the
 * ternary folds to `null`, and the dynamic `import()` becomes unreachable — so
 * Rollup drops the chunk entirely. Guarding only the <Route> still left a 74 kB
 * Marketplace chunk sitting in `dist/`: never fetched, but shipped.
 *
 * To put it back on the public site: drop the guard, and give the routes their
 * original paths.
 */

const Marketplace = import.meta.env.DEV ? lazy(() => import("@/screens/Marketplace")) : null;

/**
 * The signed-in web app — the desktop half of ICEFALL, behind the waitlist.
 *
 * Everything the phone app does EXCEPT recording an activity, which needs the
 * sensors in your pocket. Gated the same way as the marketplace above: the
 * `lazy()` call is inside the DEV test, so Rollup drops the whole thing from a
 * production build rather than shipping a signed-in dashboard to a site whose
 * only public page is a waitlist.
 *
 * When there is real authentication, this moves out of the DEV guard and behind
 * that instead — the route stays /app either way.
 */
const AppShell = import.meta.env.DEV ? lazy(() => import("@/app/Routes")) : null;

export default function App() {
  return (
    <Routes>
      {AppShell && (
        <Route
          path="/app/*"
          element={
            <Suspense fallback={null}>
              <AppShell />
            </Suspense>
          }
        />
      )}
      {Marketplace && (
        <Route
          path="/preview/*"
          element={
            <Suspense fallback={null}>
              <Marketplace />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<Waitlist />} />
    </Routes>
  );
}
