/**
 * Guards `/onboarding` against the one thing `Holding.tsx` cannot stop: a held
 * account reaching this route WITHOUT going through `nextStepForSession()`
 * again — a direct URL, a bookmark, the back button, a stale link. Under
 * normal routing a held account never gets sent here at all any more (see the
 * "holding" branch in `auth/account.ts`), so this is defence in depth for the
 * one path that skips that router entirely.
 *
 * THE CHECK IS LOCAL, DELIBERATELY, NOT A SECOND `nextStepForSession()` CALL.
 * Every real arrival at this route already passed through that router a
 * moment ago — from Callback, from sign-in, from the reset-password screen —
 * so re-querying `profiles.username` and `athlete_profiles.onboarded_at` here
 * would be a second network round trip for every single onboarding, on a
 * screen this app deliberately keeps reachable with no session at all (the
 * free readiness-test funnel, the offline DEMO build — see `AppShell`'s own
 * gate in `App.tsx` for the identical reasoning). The three flags that
 * decide "hold this person back" — is there a live session, has this device
 * already onboarded, is ICEFALL released — are exactly the three `AppShell`
 * itself reads, from the same local state, at zero extra cost.
 *
 * WHAT THIS DOES NOT DO. It does not gate `/auth/handle`, and does not need
 * to: picking a username sets nothing that unlocks Home, so there is nothing
 * for a held account to gain by reaching it early. And it never touches
 * `onboarded` itself — the ONLY place that ever becomes `true` stays
 * `completeOnboarding()` in `state/AppState.tsx`, called only from
 * `Onboarding.tsx`'s own finish handler. This file only decides whether that
 * screen is allowed to load.
 */
import { Navigate } from "react-router-dom";
import { lazy } from "react";
import { useApp } from "@/state/AppState";
import { useSessionState } from "@/auth/session";
import { APP_RELEASED } from "@/auth/release";
import { DEMO } from "@/offline/offline";

const Onboarding = lazy(() => import("@/screens/Onboarding"));

export default function OnboardingGate() {
  const { onboarded } = useApp();
  const session = useSessionState();

  /*
   * `session === undefined` IS "NOT YET KNOWN", NOT "SIGNED OUT" — the same
   * distinction `AppShell` draws, and this holds rendering the same way
   * `AppShell` does rather than letting the questionnaire paint for one frame
   * and then snatching it away once the cached session resolves.
   */
  if (!DEMO && session === undefined) return null;

  const held = !DEMO && !onboarded && !APP_RELEASED && session !== null;

  if (held) return <Navigate to="/auth/holding" replace />;

  return <Onboarding />;
}
