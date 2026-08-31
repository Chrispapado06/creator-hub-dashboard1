import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DEMO } from "./offline";

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
 * Renders nothing, and does nothing at all when the flag is unset.
 */
const BYPASSED = /^\/(welcome|auth(\/|$)|onboarding(\/|$))/;

export function OfflineRouteGuard() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!DEMO) return;
    if (BYPASSED.test(pathname)) navigate("/home", { replace: true });
  }, [pathname, navigate]);

  return null;
}
