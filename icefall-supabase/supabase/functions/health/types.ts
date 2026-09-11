// ICEFALL ↔ health accounts (Polar, Whoop, Oura, Withings) — the shared
// vocabulary. SERVER COPY.
//
// Written twice on purpose, exactly as `watch/types.ts` is: the other copy is
// `icefall-app/src/health/types.ts` and the two must stay byte-for-byte
// identical below the import line. A typo then becomes a compile error on one
// side rather than a silent fall-through on both.
//
// ── WHY A SECOND FUNCTION AND NOT A FIFTH ENTRY IN `watch` ───────────────────
//
// `watch` reads ACTIVITIES: a start time, a distance, an ascent. Its whole
// return type (`WatchActivity`) is one outing. These four vendors are asked
// for something categorically different — heart-rate variability, sleep
// stages, a recovery score, a body weight — which is Article 9 special
// category data, needs its own consent (`health_consent_events`, migration
// 20260903060000), and carries per-vendor legal obligations that an activity
// import does not have (Whoop: encrypted at rest; Polar: a text credit;
// Oura: an unresolved licence). Widening `WatchActivity` to carry an HRV would
// put health data behind a screen whose consent story is "your watch could
// feed this".
//
// Polar therefore appears in BOTH and that is deliberate, not duplication:
// `watch/polar.ts` holds `training_sessions:read` for the outings, this one
// holds the daily physiology. They are two grants because Polar's scopes are
// two grants.

export type HealthProvider = "polar" | "whoop" | "oura" | "withings";

/** Display and iteration order. Polar first — it is the one with no gate at
 *  all beyond registration. Oura last: it is on a legal hold (see registry). */
export const HEALTH_PROVIDERS: readonly HealthProvider[] = [
  "polar",
  "whoop",
  "withings",
  "oura",
] as const;

export const HEALTH_PROVIDER_NAME: Record<HealthProvider, string> = {
  polar: "Polar",
  whoop: "WHOOP",
  oura: "Oura",
  withings: "Withings",
};

/** Where a finished consent may land. Mirrors the CHECK on
 *  `health_oauth_states.return_to`. */
export type HealthReturnPath = "/settings/connections" | "/connect";

/**
 * What `GET /health/providers` answers, per provider.
 *
 * `legal-hold` is not a configuration state and cannot be resolved by adding
 * a secret. It means a term in the vendor's own agreement has not been
 * cleared, and the only thing that lifts it is a person deciding it is
 * cleared — see `registry.ts`. It is reported separately from
 * `needs-credentials` because the two have completely different answers to
 * "what would make this work".
 */
export type HealthAvailability =
  | "ready" // credentials present, no gate, the flow is implemented
  | "needs-credentials" // implemented; ICEFALL holds no keys for it yet
  | "legal-hold"; // implemented and gated OFF in code; see registry.ts
