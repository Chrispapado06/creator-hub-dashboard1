import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { OFFLINE } from "./offline";

/**
 * Offline, there is no door.
 *
 * The demo identity is already signed in — as far as the app is concerned it is
 * simply an athlete who finished onboarding on this device, which is the state
 * `offline/seed.ts` writes. So the four surfaces that exist to get an account
 * onto the device have nothing to do offline, and every one of them needs a
 * backend to finish: `/welcome` and `/auth/*` end in a Supabase call, and
 * `/onboarding`'s objective picker searches peaks over Overpass.
 *
 * Landing on any of them — by deep link, by an old bookmark, by the back
 * button — sends you to `/home` instead. Nothing in the app routes here on its
 * own offline; this exists so that a URL cannot dead-end a demo on a plane.
 *
 * `/trial`, `/subscribe`, `/pricing` and the readiness test are deliberately
 * NOT listed: they are ordinary product screens that work offline, and the
 * paywall is part of what there is to look at.
 *
 * ── WHY THIS GATES ON `OFFLINE` AND NOT `DEMO` ─────────────────────────────
 *
 * It used to read `DEMO`, which is `OFFLINE || VITE_ICEFALL_DEMO`. Every reason
 * written above is a reason about being OFFLINE — no backend, no Overpass, a
 * plane. None of them is true of the ONLINE demo build, which has a network and
 * can complete onboarding perfectly well.
 *
 * The cost of the wider gate was that the owner could not reach `/onboarding`
 * at all in the demo build to see the signup questions — gender, sex at birth,
 * the body numbers and "how did you hear about us" — which are asked there and
 * nowhere else. Typing the URL bounced to `/home`, which looked exactly like
 * the questions not existing. They exist; this guard was hiding them.
 *
 * Renders nothing, and does nothing at all when the flag is unset.
 */
const BYPASSED = /^\/(welcome|auth(\/|$)|onboarding(\/|$))/;

export function OfflineRouteGuard() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!OFFLINE) return;
    if (BYPASSED.test(pathname)) navigate("/home", { replace: true });
  }, [pathname, navigate]);

  return null;
}
