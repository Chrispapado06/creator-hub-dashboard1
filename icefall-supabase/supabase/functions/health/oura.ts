// Oura — present in this registry, and switched OFF in code.
//
// ════════════════════════════════════════════════════════════════════════════
// THERE IS NO OAUTH CODE IN THIS FILE, AND THAT IS DELIBERATE
// ════════════════════════════════════════════════════════════════════════════
//
// Oura's connection was built on 3 September 2026 and it already exists in
// full, in a different place: `icefall-web/api/_oura.mjs` (authorize, callback,
// token exchange, refresh, webhook HMAC), `icefall-web/api/_oura-store.mjs`
// (the writes), migrations 20260903060000 and 20260903070000 (the tables), and
// `icefall-app/src/tracking/sources/oura.ts` (the app's half). Rewriting the
// same flow here to make the registry look symmetrical would leave TWO Oura
// implementations, two sets of tokens and two places to fix a bug — which is
// precisely what a shared path is supposed to prevent.
//
// So this entry is a DESCRIPTOR, not an implementation. It exists so that:
//   • `HEALTH_PROVIDERS` is total and the settings screen can draw an Oura
//     card beside the other three rather than hiding it;
//   • `GET /health/providers` can report Oura's real state — `legal-hold` —
//     in one place, from the server, in the server's own words;
//   • the two unresolved clauses are written down somewhere a person editing
//     the connection flow will actually read them.
//
// Every method throws. None can be reached: `index.ts` refuses `begin` for any
// provider whose availability is not `ready`, and a gated provider is never
// `ready`. The throws are the second lock, not the first.
//
// ════════════════════════════════════════════════════════════════════════════
// THE HOLD
// ════════════════════════════════════════════════════════════════════════════
//
// Two clauses in Oura's Developer API Agreement (cloud.ouraring.com/legal/
// api-agreement) have not been read by a lawyer, and neither is a detail:
//
//   CLAUSE 1 — CHARGING. The agreement forbids "charging Users in any manner
//   for access to" Oura functionality. ICEFALL is a paid subscription
//   (~EUR 9.99–15/month). Whether a general subscription that happens to
//   display a member's own Oura data is "charging for access to Oura
//   functionality" is a legal reading, not an engineering one. If the answer
//   is yes, the integration cannot ship at all in a paid product.
//
//   CLAUSE 2 — AI TRAINING. Oura data may NEVER be used to train or improve
//   any AI model. ICEFALL has a Coach. Today the Coach is scripted, and
//   `VITE_COACH_ENDPOINT` is unset — but the moment a model is put behind it,
//   passing an Oura-sourced HRV into a prompt is arguably "ingestion into a
//   context window", which is the reading Strava published for its own
//   equivalent clause. Nothing in the code stops that today except the Coach
//   having no model, which is not a control.
//
// UNTIL BOTH ARE CLEARED IN WRITING, OURA STAYS OFF.

import { type TokenSet, type HealthAdapter } from "./registry.ts";

/**
 * THE FLAG. One boolean, hard-coded, in the server.
 *
 * IT IS NOT AN ENVIRONMENT VARIABLE ON PURPOSE. A secret can be set by anyone
 * with dashboard access, in a hurry, to unblock a demo, and nothing about that
 * act records that a lawyer looked at the two clauses above. Lifting a hold
 * that is a legal judgement should require editing a file, in a commit, with a
 * reviewer — so this is a `const` and the only way past it is a diff.
 *
 * TO LIFT IT, when and only when both clauses have been cleared in writing:
 *   1. flip this to `true`;
 *   2. replace this file's throwing methods with a real adapter, or route the
 *      card at the existing `icefall-web/api/oura/*` endpoints;
 *   3. lift the matching hold in `icefall-web/api/_oura.mjs` (`ouraReady`) and
 *      in `icefall-app/src/tracking/sources/oura.ts` (`OURA_LEGAL_HOLD`).
 *      All three are separate on purpose: no single edit can switch Oura on.
 */
const OURA_LEGAL_HOLD_CLEARED = false;

const HOLD_SENTENCE =
  "ICEFALL has not switched Oura on. Two terms in Oura's developer agreement " +
  "are unresolved — whether a paid subscription counts as charging for access " +
  "to Oura functionality, and a ban on Oura data ever being used to train or " +
  "improve an AI model. Until both are settled in writing, there is nothing " +
  "here to connect to. This is ICEFALL's decision, not Oura's.";

const notBuiltHere = (): never => {
  /* Reached only if the hold above is lifted without step 2. Failing loudly
     beats a half-built flow that appears to work and stores nothing. */
  throw new Error(
    "oura: no adapter in this function — the implementation is icefall-web/api/_oura.mjs",
  );
};

export const oura: HealthAdapter = {
  provider: "oura",
  gate: OURA_LEGAL_HOLD_CLEARED ? "none" : "legal-hold",
  gateReason: OURA_LEGAL_HOLD_CLEARED ? "" : HOLD_SENTENCE,
  /* Empty, and it changes nothing. Availability checks the gate BEFORE the
     secrets, so a full set of Oura keys in the environment still reports
     `legal-hold`. Registering the app is not what is missing. */
  requiredSecrets: [],
  /* The scopes the existing Vercel implementation requests, copied so the
     screen's "what would be read" list has one source. See
     `icefall-web/api/_oura-client.mjs` — DEFAULT_SCOPES. */
  scopes: ["personal", "daily", "heartrate", "workout", "session", "spo2"],

  authorizeUrl(): string {
    return notBuiltHere();
  },
  exchange(): Promise<TokenSet> {
    return notBuiltHere();
  },
  refresh(): Promise<TokenSet> {
    return notBuiltHere();
  },
  identify(): Promise<{ providerUserId: string | null; accountLabel: string | null }> {
    return notBuiltHere();
  },
  revoke(): Promise<boolean> {
    /*
     * OURA PUBLISHES NO TOKEN-REVOCATION ENDPOINT — established by the 3
     * September work and unchanged since (`src/tracking/sources/oura.ts`,
     * `disconnect()`). A disconnect deletes ICEFALL's rows and forgets the
     * tokens; it cannot cancel the permission at Oura's end, which the person
     * does in the Oura app. False is the true answer, not a placeholder.
     */
    return Promise.resolve(false);
  },
};
