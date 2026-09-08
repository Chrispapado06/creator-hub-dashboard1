/**
 * The signed-in athlete's SERVER profile — the handle and location they actually
 * hold, as opposed to whatever this device happens to remember.
 *
 * WHY THIS EXISTS RATHER THAN READING LOCAL SETTINGS. `settings.username` is a
 * local field somebody can type anything into. The handle on `public.profiles`
 * is unique across the platform, claimed atomically, and is what another climber
 * sees. Rendering the local one as `@name` would show a person a handle nobody
 * else can reach them at.
 *
 * THREE STATES, NOT TWO. "Loading", "signed out or offline", and "here it is"
 * are different, and a screen that collapses the first two shows a returning
 * user an empty handle for a moment and then fills it in — which reads as their
 * handle having been lost. `status` keeps them apart.
 *
 * OFFLINE IS NOT AN ERROR. The app opens on a mountain with no signal. A failed
 * read returns `unavailable` and the caller renders what it can; it never routes
 * anybody back to sign-in over a dropped request.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/backend/client";

export type MyProfile = {
  /**
   * `public.profiles.id` — THE ACCOUNT.
   *
   * Carried because a handle is not a person: `profiles_update_self` lets
   * somebody change theirs, and a given-up handle can later be claimed by a
   * different account. Anything that must still point at THIS climber a month
   * from now — a shared card's link, a messaging call — takes this and never
   * the handle.
   */
  id: string;
  username: string | null;
  displayName: string;
  locationLabel: string | null;
  countryCode: string | null;
};

export type MyProfileState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; profile: MyProfile };

export function useMyProfile(): MyProfileState {
  const [state, setState] = useState<MyProfileState>({ status: "loading" });

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!supabase) {
        if (alive) setState({ status: "unavailable" });
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        if (alive) setState({ status: "unavailable" });
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, location_label, country_code")
        .eq("id", sess.session.user.id)
        .maybeSingle();

      if (!alive) return;
      if (error || !data) {
        setState({ status: "unavailable" });
        return;
      }
      setState({
        status: "ready",
        profile: {
          id: data.id,
          username: data.username,
          displayName: data.display_name,
          locationLabel: data.location_label,
          countryCode: data.country_code,
        },
      });
    }

    void load();

    // Signing in or out changes whose profile this is. Without this, signing out
    // on one tab leaves the other showing the previous person's handle.
    //
    // INITIAL_SESSION IS SKIPPED DELIBERATELY. Supabase fires it the moment you
    // subscribe, describing the session that already existed — so handling it
    // repeats the `load()` directly above for no new information. Measured on a
    // profile view: three identical round trips per page, two of them redundant
    // (the third is React's dev-only double-invoke). At ten thousand users that
    // is three times the read load for one screen.
    //
    // TOKEN_REFRESHED is skipped for the same reason: the token changed, the
    // person did not.
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      void load();
    });
    return () => {
      alive = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** ISO 3166-1 alpha-2 → a name worth printing. Falls back to the code itself. */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    const dn = new Intl.DisplayNames(undefined, { type: "region" });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}
