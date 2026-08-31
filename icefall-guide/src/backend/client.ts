import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { OFFLINE } from "@/offline/offline";

/**
 * THE BACKEND SEAM — now a real client.
 *
 * The owner ruled on 2026-08-30 that a guide signs in with THE SAME ICEFALL
 * ACCOUNT as the athlete app. There was never a second identity system to build:
 * `open_support_ticket` never asks which app you are in, it looks you up —
 * `exists (select 1 from guide_profiles g where g.id = auth.uid())` — and stamps
 * `guide` on the ticket itself. What was missing was a client and a session.
 *
 * `isBackendConfigured()` ASKS WHETHER A CLIENT EXISTS, NEVER WHETHER THE ENV
 * VARS ARE SET, and that distinction is not pedantry. Both variables were
 * already present in `.env.local` while this app had no client and could send
 * nothing; a predicate reading them would have answered "connected" throughout.
 * That exact bug shipped in `icefall-admin` and turned its most cautious screen
 * — "every figure here is placeholder data" — into a green "reading live data".
 * Constitution §6l: gate on the record, not on an environment flag.
 *
 * NULL IS STILL A SUPPORTED STATE. Without the two variables there is no client
 * and every surface must keep working — this app runs on local data and always
 * has. What changes is that the disabled controls come off in the same change
 * that makes sending work, never before.
 *
 * THE KEY IS `VITE_SUPABASE_PUBLISHABLE_KEY`, NEVER `..._ANON_KEY`. The wrong
 * name resolves to `undefined` and fails silently at request time rather than at
 * startup; it has already broken one system in this repo that way. The
 * publishable key belongs in the bundle — it grants nothing on its own and
 * row-level security is what protects the data. A service-role key must never
 * appear in this app.
 *
 * DELIBERATELY UNTYPED. The athlete app generates a `Database` type; copying it
 * here would be a second copy of a generated file, which is this family's
 * recurring disease — and a `Database` declared as an `interface` rather than a
 * `type` silently breaks every `rpc()` call. One less thing to drift.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * OFFLINE BUILDS NEVER CONSTRUCT A CLIENT, and that is stronger than "the
 * requests fail". `createClient` starts a background token-refresh timer
 * (`autoRefreshToken` below), so a client built against an unreachable server
 * keeps trying for the whole session and a stored-but-expired session can hang
 * a screen on "Checking…" until fetch gives up. Not building one means no
 * request of any kind leaves this app.
 *
 * Null is a state every consumer in this app already handles — it always has
 * been — so this adds a reason to be null rather than a new code path.
 */
export const supabase: SupabaseClient | null =
  !OFFLINE && url && key
    ? createClient(url, key, {
        auth: {
          /**
           * A CACHED SESSION IS ENOUGH TO OPEN THE APP. A guide reads this in a
           * car park before a route, often on one bar. Only signing in and
           * sending need the network; never send somebody back to the sign-in
           * screen because a token refresh failed.
           */
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

/**
 * Whether this app can actually reach the server.
 *
 * Asks the CLIENT, not the environment. False without credentials, and false in
 * a way no variable can fake.
 */
export function isBackendConfigured(): boolean {
  return supabase !== null;
}

/** Narrows to a live client for paths that already checked. */
export function requireBackend(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured. Guard with isBackendConfigured() first.");
  }
  return supabase;
}

/**
 * Shown wherever a surface would otherwise imply a message reached somebody.
 *
 * REWORDED 2026-08-30, AND THE OLD WORDING IS THE LESSON. It read *"ICEFALL is
 * not connected to a server yet"* — true when this app had no client, and FALSE
 * from the moment one was installed for support. Nothing edited that sentence;
 * its meaning changed underneath it because a different capability landed.
 *
 * That is §6l pointed inward: a statement whose truth depends on something it
 * does not name. The fix is to say what is actually absent — a message path —
 * rather than something broad enough to go stale when any neighbouring part
 * changes. Support now sends; chat does not, and this sentence is about chat.
 *
 * The wording differs from the athlete app's on the point that matters here: the
 * consequence of a message not being sent is that **a client is still waiting**,
 * and that is what costs a guide the work.
 */
export const BACKEND_NOT_CONNECTED =
  "ICEFALL cannot carry messages between you and a client yet. Nothing here is sent, nobody is notified, and no reply can reach you — what you write stays on this device.";
