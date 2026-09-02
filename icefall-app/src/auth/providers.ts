import { useEffect, useState } from "react";

import { supabase } from "@/backend/client";
import { PROVIDERS, type ProviderKey } from "./account";

/**
 * WHICH SIGN-IN BUTTONS ARE REAL DOORS.
 *
 * The create-account screen offered Apple, Google and Microsoft. On this project
 * NONE of them is configured — `/auth/v1/settings` reports `email` enabled and
 * every other provider false — so all three were controls that could only ever
 * produce an error. A dead door on the FIRST screen of the app is the worst
 * place to have one: somebody who taps Google and gets "Unsupported provider"
 * does not conclude the button is broken, they conclude the app is.
 *
 * Rather than hard-code the list, this ASKS. `/auth/v1/settings` is a public,
 * unauthenticated endpoint that reports exactly which providers the project has
 * turned on, so the moment somebody enables Google in the dashboard the button
 * appears on its own and nobody has to remember to ship a change. The inverse
 * matters more: turning a provider OFF cannot leave a door behind.
 *
 * While the answer is unknown the buttons are NOT rendered. An optimistic list
 * that later disappears is worse than one that arrives a moment late — the first
 * invites a tap that fails.
 */
export function useEnabledProviders(): { keys: ProviderKey[]; known: boolean } {
  const [state, setState] = useState<{ keys: ProviderKey[]; known: boolean }>({
    keys: [],
    known: false,
  });

  useEffect(() => {
    if (!supabase) {
      // No client at all — a demo or offline build. Nothing can sign in, and
      // saying so is the honest answer rather than showing three buttons.
      setState({ keys: [], known: true });
      return;
    }
    let live = true;
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!url || !key) {
      setState({ keys: [], known: true });
      return;
    }

    const timer = setTimeout(() => {
      // A settings call that never returns must not hold the screen for ever.
      // Unknown stays unknown, and no dead buttons are drawn.
      if (live) setState((s) => (s.known ? s : { keys: [], known: true }));
    }, 4000);

    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!live) return;
        const ext = (body?.external ?? {}) as Record<string, boolean>;
        const keys = (Object.keys(PROVIDERS) as ProviderKey[]).filter(
          (k) => ext[PROVIDERS[k].id] === true,
        );
        setState({ keys, known: true });
      })
      .catch(() => {
        if (live) setState({ keys: [], known: true });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  return state;
}
