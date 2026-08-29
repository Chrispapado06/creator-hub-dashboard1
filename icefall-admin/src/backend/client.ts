/**
 * Whether this app can actually read the ICEFALL database. It cannot.
 *
 * WHY THIS MODULE EXISTS AT ALL — a bug that shipped for a few hours on
 * 2026-08-29 and is worth keeping the account of.
 *
 * `Settings.tsx` used to decide it was connected like this:
 *
 *     const configured = Boolean(
 *       import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
 *     );
 *
 * That was true and harmless for as long as no project existed. Then the brain
 * session provisioned Supabase and wrote `.env.local` into all six apps at once.
 * Both variables became defined here — in an app with **no `@supabase/supabase-js`
 * dependency, no client, and not one query**. The screen flipped from an amber
 * "Not connected" to a green "Connected — reading live data from the shared
 * ICEFALL database", and it *hid* the paragraph explaining that every figure in
 * this app is placeholder data.
 *
 * So a change that touched no file in this app turned its most cautious screen
 * into its most dishonest one, on the app whose entire content is invented
 * revenue. Nobody edited a component. Nobody's typecheck failed.
 *
 * CREDENTIALS ARE NOT A CONNECTION. That is the whole lesson, and it is
 * §6c literally — gate on the record, not on an environment flag. An env var
 * describes what somebody *configured*; only an object describes what the app
 * can *do*. The two were the same thing right up until the moment they weren't,
 * which is the only moment that mattered.
 *
 * Session 05 found this class in `icefall-guide` and warned that every app whose
 * gate read the environment was now reporting connected. This app was the other
 * one.
 *
 * WHY THIS RETURNS A CONSTANT AND DOES NOT READ THE ENVIRONMENT. It would be
 * easy to write `supabase !== null` here to match `icefall-app`. There is no
 * client to compare against: this app does not depend on the Supabase library.
 * A false that comes from an absent dependency cannot be faked by a variable,
 * and turning it true requires adding the dependency, building a client and
 * writing a query — which is exactly the work that would make it true.
 *
 * DELETE THIS FILE when the admin app genuinely reads the database, and replace
 * it with the real client the way `icefall-app/src/backend/client.ts` does.
 */

/**
 * FALSE, structurally.
 *
 * Not "false until someone sets a variable" — false because this app has no
 * database client to call. See the header.
 */
export function isBackendConfigured(): boolean {
  return false;
}

/**
 * What Settings shows in place of a connection status.
 *
 * Kept beside the predicate so the sentence and the reason cannot drift apart.
 */
export const BACKEND_NOT_CONNECTED =
  "Every figure in this app is placeholder data. The ICEFALL database is live, but this app does not read it yet — it has no database client. The schema and its security policies are written and tested; see icefall-supabase/.";
