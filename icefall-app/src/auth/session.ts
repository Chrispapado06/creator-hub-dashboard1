import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";

/**
 * The signed-in session, in THREE states — and the third is the one that matters.
 *
 *   undefined  not known yet: the first async check has not returned
 *   null       known, and there is nobody signed in
 *   Session    known, and this is who
 *
 * Collapsing `undefined` into `null` is the bug this shape exists to prevent.
 * A route gate that treats "not yet known" as "signed out" bounces a signed-in
 * climber to the splash on every cold start, because Supabase restores the
 * session from storage asynchronously — the app would flash the sign-in screen
 * at somebody who has an account and then quietly correct itself.
 *
 * When Supabase is not configured at all the answer is `null`, not a hang: the
 * app has no way to sign anybody in, so "nobody is signed in" is the truth.
 * Builds that must run without a backend are DEMO builds, and the gate in
 * App.tsx exempts them before it ever reads this.
 */
export function useSessionState(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    let live = true;

    supabase.auth.getSession().then(({ data }) => {
      if (live) setSession(data.session ?? null);
    });

    /* Sign-out in another tab, a token refresh failing, an expiry mid-session:
       all of them arrive here, so the gate closes on its own rather than
       waiting for the next full page load.

       The event is a WAKE-UP, not a source of truth. auth-js relays SIGNED_IN
       across tabs over BroadcastChannel whatever store holds the session, and
       with Remember me off that store is another tab's sessionStorage, which
       this tab cannot read — storing the payload would open the gate on a
       session every query then runs without. `getSession()` goes through the
       storage adapter, so it answers for this tab only. Deferred, because
       auth-js fires the callback inside its own lock and a synchronous
       getSession() there can deadlock. */
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (!live) return;
        supabase!.auth.getSession().then(({ data }) => {
          if (live) setSession(data.session ?? null);
        });
      }, 0);
    });

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return session;
}
