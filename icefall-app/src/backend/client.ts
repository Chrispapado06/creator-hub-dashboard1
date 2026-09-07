import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { DEMO } from "@/offline/offline";

/**
 * The Supabase client, or null.
 *
 * NULL IS A SUPPORTED STATE, not a failure. ICEFALL ran entirely on localStorage
 * for its whole life, so every surface built on this module must keep working
 * without a backend rather than white-screening on a missing key.
 *
 * A PROJECT NOW EXISTS (2026-08-29) AND THIS APP STILL SENDS NOTHING. Since
 * `.env.local` was written, `isBackendConfigured()` returns **true** — the
 * credentials are real and the client object is real. What does not exist is a
 * single query: there is no `.from(`, no `.rpc(` and no write path anywhere in
 * `src/`. So the predicate is honest about what it measures (a client exists)
 * and would be a lie if read as "messages can be sent".
 *
 * THIS IS WHY THE CHAT SCREENS MUST NOT START BRANCHING ON IT. `Messages.tsx`
 * and `Thread.tsx` render `BACKEND_NOT_CONNECTED` UNCONDITIONALLY, and that is
 * correct and must stay until a send path exists. Wrapping those in
 * `{!isBackendConfigured() && ...}` today would remove the one honest sentence
 * on the screen and leave a climber believing a message reached a guide, on the
 * strength of a variable rather than a delivery. The notice comes off in the
 * same change that makes sending work, not before.
 *
 * The sibling app `icefall-admin` learned this the hard way the same day: its
 * settings screen gated on the env vars directly and flipped itself to
 * "Connected — reading live data" with no client at all. See
 * `icefall-admin/src/backend/client.ts`.
 *
 * That also keeps the honest posture the rest of the app has: with no backend,
 * a "sent" message genuinely has not gone anywhere, and the UI says so instead
 * of pretending a delivery it cannot make.
 *
 * The key is the PUBLISHABLE (anon) key, and it is meant to be in the bundle —
 * it grants nothing on its own. Row-level security is what protects the data,
 * which is why the migration is written the way it is. A service-role key must
 * never appear in this app.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
// `VITE_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY`. The wrong name resolves
// to undefined and fails silently at request time rather than at startup.
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * THE OFFLINE BUILD NEVER CONSTRUCTS A CLIENT, and this is the single most
 * valuable line in the offline mode.
 *
 * `null` is already a supported state here, and all ~24 call sites are null-
 * guarded and return something benign — so switching the client off switches
 * off every backend read in the app at once, with no per-screen surgery. It
 * also closes the worst offline failure: nothing in this codebase puts a
 * timeout on supabase-js, so with credentials present and the network dead but
 * not absent (plane wifi, a captive portal) `useMyProfile` would sit on
 * `loading` forever and the support screen would hang on "Checking your
 * account…". A client that does not exist cannot hang.
 */
/**
 * "REMEMBER ME" IS REAL, AND THIS IS WHERE IT LIVES.
 *
 * The sign-in screen's checkbox (owner's mockup, 2026-09-07) decides which
 * browser store holds the session: `localStorage` survives closing the browser,
 * `sessionStorage` does not. The choice is written under `REMEMBER_KEY` BEFORE
 * sign-in (see `setRememberMe` in auth/account.ts), and this adapter reads it
 * on every access, so the same client serves both answers.
 *
 * Reads consult both stores, preferring the chosen one, so flipping the box
 * never strands a session that was written under the other rule; removes hit
 * both, so sign-out is sign-out whichever way you came in. Default is to
 * remember — the behaviour every existing session was created under.
 */
export const REMEMBER_KEY = "icefall.auth.remember";

function stores(): [Storage, Storage] {
  let remember = true;
  try {
    remember = localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    /* storage unavailable: fall through to localStorage-first */
  }
  return remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
}

const authStorage = {
  getItem(k: string): string | null {
    try {
      const [first, second] = stores();
      return first.getItem(k) ?? second.getItem(k);
    } catch {
      return null;
    }
  },
  setItem(k: string, v: string): void {
    try {
      const [first, second] = stores();
      first.setItem(k, v);
      second.removeItem(k);
    } catch {
      /* private mode */
    }
  },
  removeItem(k: string): void {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  },
};

export const supabase: SupabaseClient<Database> | null =
  !DEMO && url && key
    ? createClient<Database>(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: authStorage,
        },
      })
    : null;

export function isBackendConfigured(): boolean {
  return supabase !== null;
}

/**
 * Shown wherever a surface would otherwise imply something was delivered.
 *
 * One sentence, in one place, so two screens cannot make different promises
 * about whether a message actually reached anybody.
 */
export const BACKEND_NOT_CONNECTED =
  "ICEFALL is not connected to a server yet. Nothing here is sent, nobody is notified, and no reply can arrive — what you write is saved on this device only.";

/** Narrows to a live client, for code paths that already checked. */
export function requireBackend(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Guard with isBackendConfigured() before calling this.",
    );
  }
  return supabase;
}
