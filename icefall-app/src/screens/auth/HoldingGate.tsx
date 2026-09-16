/**
 * Guards `/auth/holding` against the one thing `Holding.tsx`'s own reload
 * timer was supposed to do and did not: re-decide whether this device is
 * STILL held every time this route mounts, instead of unconditionally
 * rendering the dead-end screen regardless of `APP_RELEASED`.
 *
 * FOUND BY ADVERSARIAL REVIEW, 12 September 2026. `Holding.tsx` documents a
 * five-minute reload timer and a `visibilitychange` reload as how a held
 * phone "finds out on its own" once released — but the route it reloads was
 * wired straight to `<Holding />`, which never read `APP_RELEASED` at all.
 * Reloading just re-rendered the same dead end forever, even after the flag
 * flipped and a real redeploy went out: the release mechanism was dead on
 * arrival. Confirmed live: flipped `APP_RELEASED` to `true`, reloaded
 * `/auth/holding`, watched it render the unreleased copy anyway, reverted the
 * flag. This file is the fix — same pattern as `OnboardingGate.tsx`, which
 * already solves the identical problem for `/onboarding` in the other
 * direction (stopping a held account from reaching the questionnaire early;
 * this stops a released one from being stuck behind it).
 *
 * THE CHECK IS LOCAL, DELIBERATELY, NOT A SECOND `nextStepForSession()` CALL —
 * same reasoning as `OnboardingGate.tsx`: every real arrival here already
 * passed through that router a moment ago, and re-querying
 * `profiles.username` / `athlete_profiles.onboarded_at` on every reload this
 * screen's own timer triggers would turn a five-minute interval into a
 * five-minute polling loop against the database. The three flags that decide
 * "still held" — a live session, not yet onboarded, not yet released — are
 * exactly what `OnboardingGate` and `AppShell` already read from the same
 * local state, at zero extra cost, and use the SAME formula so the two gates
 * can never disagree about who is held.
 *
 * WHAT THIS DOES NOT DO. It never sends anyone to `/home` on its own — an
 * onboarded account redirects home because it should never have been sent to
 * this dead end in the first place (a stale link, the back button), not
 * because release happened. Release only ever opens the door to
 * `/onboarding`, the same as it always has; the mandatory-questionnaire
 * invariant this whole feature exists to protect is untouched by this file.
 */
import { Navigate } from "react-router-dom";
import { lazy } from "react";
import { useApp } from "@/state/AppState";
import { useSessionState } from "@/auth/session";
import { APP_RELEASED } from "@/auth/release";
import { DEMO } from "@/offline/offline";

const Holding = lazy(() => import("@/screens/auth/Holding"));

export default function HoldingGate() {
  const { onboarded } = useApp();
  const session = useSessionState();

  // `session === undefined` is "not yet known" — see `useSessionState`'s own
  // header for why collapsing that into "signed out" is the bug this guards
  // against. Hold rendering rather than flash a wrong redirect and correct it
  // a moment later.
  if (!DEMO && session === undefined) return null;

  // SAME FORMULA `OnboardingGate` uses for `held`, so the two gates can never
  // disagree about who is still waiting.
  const stillHeld = !DEMO && !onboarded && !APP_RELEASED && session !== null;

  if (stillHeld) return <Holding />;

  if (!DEMO && session === null) return <Navigate to="/welcome" replace />;
  if (onboarded) return <Navigate to="/home" replace />;
  // Not held: either released, or a DEMO build (which never holds anyone —
  // see `OnboardingGate`'s identical exemption). Either way the door this
  // account was waiting for is now open.
  return <Navigate to="/onboarding" replace />;
}
