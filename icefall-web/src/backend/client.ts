import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { OFFLINE } from "@/offline/offline";

/**
 * The Supabase client for `icefall-web`.
 *
 * Deliberately the same shape as `icefall-app/src/backend/client.ts`, because
 * the two apps share accounts: a climber who signs up on the phone signs in
 * here with the same credentials, and two clients configured differently is how
 * that stops being true.
 *
 * ── `null` IS A SUPPORTED STATE, NOT A FAILURE ──────────────────────────────
 *
 * With no credentials, or in the offline review build, this is `null` and every
 * call site guards on it. That is the phone app's most valuable line and it is
 * copied on purpose: a client that does not exist cannot hang. Nothing in
 * supabase-js carries a timeout, so with credentials present and the network
 * dead-but-not-absent — plane wifi, a captive portal — a session check would sit
 * on "loading" forever and the whole signed-in shell would never render.
 *
 * ── THE KEY NAME HAS BITTEN THIS PROJECT BEFORE ─────────────────────────────
 *
 * `VITE_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY`. The wrong name resolves
 * to `undefined` and fails silently at request time rather than loudly at
 * startup, which is how a daily digest broke for a week.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  !OFFLINE && url && key
    ? createClient(url, key, {
        auth: {
          /*
            A CACHED SESSION IS ENOUGH TO OPEN THE APP.

            Same rule as the phone app. A returning climber lands in their
            training rather than at a sign-in wall because a token refresh
            failed. `detectSessionInUrl` is what completes an OAuth round trip
            when the provider sends the browser back.
          */
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function isBackendConfigured(): boolean {
  return supabase !== null;
}

/**
 * Shown wherever a surface would otherwise imply an account exists.
 *
 * One sentence in one place, so two screens cannot make different claims about
 * whether signing in is possible at all.
 */
export const BACKEND_NOT_CONNECTED =
  "ICEFALL can't reach the account server from here. Nothing you enter is sent, and no account is created.";
