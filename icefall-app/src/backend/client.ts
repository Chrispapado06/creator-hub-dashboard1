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
 * A PROJECT NOW EXISTS (2026-08-29). Since `.env.local` was written,
 * `isBackendConfigured()` returns **true** — the credentials are real and the
 * client object is real. The predicate is honest about what it measures (a
 * client exists) and would still be a lie if read as "messages can be sent":
 * a configured client says nothing about whether a given feature has a write
 * path, and most of this app still has none.
 *
 * MESSAGING NOW DOES, AND THIS PARAGRAPH USED TO FORBID WHAT FOLLOWED. It said
 * `Messages.tsx` and `Thread.tsx` must render `BACKEND_NOT_CONNECTED`
 * UNCONDITIONALLY, and set the condition for changing its mind: "the notice
 * comes off in the same change that makes sending work, not before." That
 * change is `src/messaging/` (2026-09-08), which reads `threads`,
 * `thread_participants` and `messages` and sends through `send_message`. So on
 * a REAL SERVER THREAD those screens now say `MESSAGING_IS_A_SNAPSHOT`
 * instead — messages genuinely arrive; what does not happen is a push.
 *
 * THE OLD SENTENCE HAS NOT GONE ANYWHERE, and the rule behind it still stands
 * for every other surface. `Thread.tsx` still renders it, unchanged, for an
 * on-device operator enquiry — a thread with nothing behind it — and the
 * branch that draws that kind of thread is the branch that draws the notice.
 * Nothing anywhere may swap it for a claim of delivery on the strength of
 * `isBackendConfigured()` alone: a client existing is not a message arriving,
 * which is the whole lesson this paragraph was written to record.
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
 * browser store holds the session: `localStorage` is shared by every tab and
 * survives restarts; `sessionStorage` belongs to this one tab and is gone when
 * the tab is closed or the browser starts fresh — browsers that restore tabs
 * (Chrome/Edge "continue where you left off", Firefox session restore, Safari)
 * restore it too, and no client-side store can promise more than that. The
 * choice is written under `REMEMBER_KEY` BEFORE
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

/**
 * HOW THE BROWSER ARRIVED, read once before the client can rewrite the URL.
 *
 * auth-js consumes `#access_token=…&type=recovery` and then clears the hash —
 * after a network round-trip to Supabase. The lazily loaded Callback screen
 * can mount after that, see no `type`, and route a password-reset arrival
 * into the app with the forgotten password still in place. Capturing here,
 * above `createClient`, is the one place guaranteed to run first: imports are
 * hoisted, so this module runs before any statement in main.tsx.
 */
export const ARRIVED_AS: string | null = (() => {
  try {
    return (
      new URLSearchParams(window.location.hash.slice(1)).get("type") ??
      new URLSearchParams(window.location.search).get("type")
    );
  } catch {
    return null;
  }
})();

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
