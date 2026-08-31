import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Waitlist from "@/screens/Waitlist";
import { useAuth } from "@/lib/auth";

/**
 * ICEFALL on the web.
 *
 * ── THE GATE MOVED FROM `import.meta.env.DEV` TO A REAL SESSION ─────────────
 *
 * Until 2026-08-31 the signed-in app was DEV-only: the `import.meta.env.DEV`
 * test wrapped the `lazy()` call itself, Vite folded it to `false`, and Rollup
 * dropped the whole chunk from a production build. That was right while there
 * were no accounts — a deployed URL is readable by anyone with the link, and
 * "signed in" meant a name in `localStorage` that anybody could type.
 *
 * There are real accounts now, shared with the phone app, so the gate is a real
 * session. **The waitlist remains the public face**: no session gets the launch
 * page exactly as before. Lifting that is a launch decision and not this file's.
 *
 * ── WHY SHIPPING THE CHUNK DOES NOT SHIP THE INVENTED DATA ──────────────────
 *
 * The obvious worry: the /app tree is full of invented guides carrying invented
 * IFMGA licences, and a real company with ICEFALL's placeholder figures on it.
 * An auth gate lets anyone who signs up reach those screens, and signing up is
 * free.
 *
 * It does not, because **the invented data is gated at its definition, not at
 * the route**. `IS_DEMO` is still `import.meta.env.DEV`, and `COMPANIES`,
 * `GUIDES`, `EXPEDITIONS`, `POSTS`, `STORIES`, `GROUPS` and `CONTRIBUTORS` are
 * each `IS_DEMO ? [ … ] : []`. In a production build every one of them is empty
 * before any route is considered. A signed-in visitor to a deployed site sees
 * the real catalogue — 52 mountains, 252 treks — and an empty marketplace.
 *
 * That is the property to protect. **If anybody ever unties `IS_DEMO` from
 * `DEV`, this gate stops being safe on the same day**, and the check that
 * catches it is a production build grepped for `Solukhumbu Expeditions`,
 * `Elite Exped` and `Coach credits`. It must return nothing.
 *
 * ── `ready` IS NOT `signed out` ─────────────────────────────────────────────
 *
 * Restoring a cached session is asynchronous. Treating "not yet known" as
 * "signed out" would show a returning climber the launch page for a frame, or
 * bounce them out of the page they opened. So the gate waits.
 */

/** Always loadable now — the session decides whether it renders. */
const AppShell = lazy(() => import("@/app/Routes"));

/**
 * The OLD search-first marketplace, superseded by `/app`.
 *
 * Still DEV-only, and deliberately not moved to the auth gate: it is legacy kept
 * for reference, not part of the product, so there is nothing to be gained by
 * shipping it to signed-in people and a second half-maintained marketplace to
 * lose by it.
 */
const Marketplace = import.meta.env.DEV ? lazy(() => import("@/screens/Marketplace")) : null;

export default function App() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/app/*"
        element={
          <Suspense fallback={null}>
            <SignedInOnly />
          </Suspense>
        }
      />
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

function SignedInOnly() {
  const { signedIn, ready } = useAuth();

  // Not yet known — render nothing rather than guessing. A blank frame for one
  // tick is invisible; the launch page flashing past a signed-in climber is not.
  if (!ready) return null;

  /*
    DEVELOPMENT STILL OPENS WITHOUT AN ACCOUNT, and production still cannot.

    Moving to a session gate made `/app` unreachable in development too, which
    quietly broke the thing the owner actually uses: they review these ~30
    screens by opening them, and there is no account to sign in with. That is
    the same defect as the offline bundle shipping a production build — a change
    that is correct in itself and removes the reviewer's only way in.

    `import.meta.env.DEV` is a literal at build time, so Vite folds this to
    `signedIn || false` in production: a deployed site is session-only, exactly
    as before. The offline review build is covered separately — it seeds a demo
    session, so it never reaches this branch at all.
  */
  const mayEnter = signedIn || import.meta.env.DEV;

  return mayEnter ? <AppShell /> : <Waitlist />;
}

/**
 * Where a provider sends the browser back to.
 *
 * `detectSessionInUrl` in the client does the actual work — supabase-js reads
 * the fragment, stores the session and fires `onAuthStateChange`, which is the
 * one place a session appears. This screen only waits for that and then gets
 * out of the way.
 *
 * It says nothing about succeeding or failing, because at this moment it does
 * not know: a session either turns up or the person is still signed out, and
 * both are handled by sending them somewhere real rather than by narrating.
 */
function AuthCallback() {
  const { ready, signedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    navigate(signedIn ? "/app" : "/", { replace: true });
  }, [ready, signedIn, navigate]);

  if (ready && !signedIn) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <p className="text-[13px] text-mist">Finishing sign-in…</p>
    </div>
  );
}
