/**
 * THE BACKEND SEAM — and read the second paragraph before you use it.
 *
 * A Supabase project now EXISTS and this app's `.env.local` holds both keys. So
 * the tempting one-liner — "if the env vars are set, we are connected" — is true
 * about the environment and false about this app, and wiring a screen to it
 * would ship the exact bug the honesty doctrine exists to prevent.
 *
 * **THIS APP CANNOT TALK TO THE SERVER.** `@supabase/supabase-js` is in neither
 * `package.json` nor `node_modules`; there is no `createClient` call, no query
 * and no write path anywhere in `src/`. Credentials are not a connection.
 *
 * THAT GAP IS WHY `isBackendConfigured()` DOES NOT READ THE ENVIRONMENT.
 *
 * It asks whether a CLIENT OBJECT exists. It is false today, and it stays false
 * until somebody lands the client — a CODE change, which no amount of setting
 * variables can fake. This module does not read `VITE_SUPABASE_URL` or
 * `VITE_SUPABASE_PUBLISHABLE_KEY` at all, and that absence is the honest
 * statement: nothing in this app can use them yet.
 *
 * Constitution §6c, applied literally: *gate on the record, not on an
 * environment flag — an env flag is only a promise that someone set it
 * correctly.* Had this predicate read the two variables, the next person to set
 * one would have enabled the reply box on an app with no send path, and a guide
 * would type an answer to a waiting client and watch it vanish.
 *
 * A `hasBackendCredentials()` helper was written here and then deleted before it
 * shipped: it had no caller, and an export whose only property is that it never
 * runs is the defect this file was being repaired for in the first place. The
 * distinction it was meant to document lives in this header, where documentation
 * belongs.
 *
 * WHAT THE SCREENS ACTUALLY DO TODAY, stated because an earlier version of this
 * header claimed otherwise and was wrong (§6b — a header comment is not a
 * description of its file):
 *
 *   · `isBackendConfigured()` HAS NO CALLERS. Nothing branches on it yet.
 *   · `Enquiries.tsx` hard-codes `disabled` on the reply box and renders
 *     `BACKEND_NOT_CONNECTED` unconditionally. **That is correct and must stay**
 *     until a real send path exists. Replacing it with
 *     `disabled={!isBackendConfigured()}` today would change nothing, and doing
 *     it with the OLD single-predicate version would have enabled Send on an app
 *     that discards replies.
 *
 * THE CHANGE THAT MAKES THIS LIVE, in one place so nobody has to reconstruct it:
 * `npm i @supabase/supabase-js`, generate `./types`, and give `supabase` below a
 * real `createClient(url, key)` when the credentials are present. Every consumer
 * keeps the same contract, because the contract was always "is there a client",
 * and the disabled controls come off in that same change — not before it.
 *
 * THE KEY NAME IS `VITE_SUPABASE_PUBLISHABLE_KEY`, NEVER `..._ANON_KEY`. The
 * wrong name resolves to `undefined` and fails silently at request time rather
 * than at startup; it has already broken one system in this repo that way. The
 * publishable key belongs in the bundle — it grants nothing on its own, and
 * row-level security is what protects the data. A service-role key must never
 * appear in this app.
 */

/**
 * The live client, or null.
 *
 * NULL IS A SUPPORTED STATE, not a failure — this app has run entirely on local
 * data from the start and every surface must keep working without a server. It
 * is `null` today for a reason no environment variable can change: there is no
 * client library in this app to construct one with.
 *
 * Typed as `unknown` deliberately. A `SupabaseClient` type would require the
 * package this app does not have, and inventing a hand-written stand-in type
 * would be a second declaration of somebody else's interface — the shape of
 * every drift this family has had. When the package lands, this becomes
 * `SupabaseClient<Database> | null` and nothing above it changes.
 */
export const supabase: unknown = null;

/**
 * Whether this app can actually reach the server.
 *
 * FALSE TODAY, and false for a structural reason rather than a configuration
 * one: there is no client to be had, whatever the environment says. Guard any
 * path that would imply a delivery, a save or a fetch with this — and never with
 * a check on the env variables, which are set and buy this app nothing.
 */
export function isBackendConfigured(): boolean {
  return supabase !== null;
}

/**
 * Shown wherever a surface would otherwise imply something reached somebody.
 *
 * One sentence, in one place, so two screens cannot make different promises
 * about whether a client heard from this guide. The wording differs from the
 * athlete app's on the point that matters here: the consequence of a message not
 * being sent is that **a client is still waiting**, and that is what costs a
 * guide the work.
 */
export const BACKEND_NOT_CONNECTED =
  "ICEFALL is not connected to a server yet. Nothing here is sent, no client is notified, and no reply can reach you — what you write stays on this device.";
