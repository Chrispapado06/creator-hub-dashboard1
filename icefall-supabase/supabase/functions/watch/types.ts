// ICEFALL ↔ watch accounts — the shared vocabulary. SERVER COPY.
//
// This union is written twice on purpose, the same way `StravaReturnPath`
// (icefall-app/src/strava/connection.ts:142-148) mirrors `RETURN_PATHS`
// (strava/index.ts:79-84): a typo becomes a compile error rather than a
// silent fall-through. The other copy is icefall-app/src/watch/types.ts —
// keep the two byte-for-byte identical.

export type WatchProvider = "garmin" | "coros" | "suunto" | "polar";

/**
 * Display and iteration order. COROS first — it is the one whose CONNECTION
 * works self-serve, with no registration and no vendor approval. That is NOT
 * the same as the one that imports: see `WatchActivityReading` below, which
 * COROS answers "not-implemented".
 */
export const WATCH_PROVIDERS: readonly WatchProvider[] = [
  "coros",
  "polar",
  "suunto",
  "garmin",
] as const;

export const WATCH_PROVIDER_NAME: Record<WatchProvider, string> = {
  coros: "COROS",
  polar: "Polar",
  suunto: "Suunto",
  garmin: "Garmin Connect", // Garmin's guidelines: full app name, never abbreviated
};

/** Where a finished consent may land. Mirrors the CHECK on watch_oauth_states.return_to. */
export type WatchReturnPath = "/settings/connections" | "/connect";

/**
 * One activity as the SERVER hands it to the client. Vendor-neutral.
 * Every metric is nullable because a vendor may genuinely not supply it —
 * a Suunto watch with no barometer sends no totalAscent, and that absence is
 * a fact, not an error. `sport` is the vendor's own string, NEVER translated
 * on the server.
 */
export interface WatchActivity {
  providerActivityId: string;
  sport: string;
  name: string | null;
  startedAt: string; // ISO 8601, UTC
  utcOffsetMinutes: number | null;
  durationSec: number;
  movingSec: number | null; // null = the vendor gave one duration only
  distanceM: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  calories: number | null;
  deviceName: string | null; // the watch model as the vendor names it
  vendorEntered: boolean | null; // true = vendor flags it manual/edited; null = vendor did not say
}

/** What GET /watch/providers answers, per provider. */
export type WatchAvailability =
  | "ready" // credentials present and the flow is implemented
  | "needs-registration" // implemented; ICEFALL holds no credentials yet
  | "vendor-approval-required" // the vendor gates access and has not granted it
  | "not-built"; // ICEFALL has no adapter for this yet

/**
 * Whether ICEFALL can read a vendor's ACTIVITY responses yet.
 *
 * A SEPARATE QUESTION FROM `WatchAvailability`, and the two genuinely
 * disagree today. COROS is "ready" — its OAuth is self-serve, the consent
 * screen works, the token is stored, the account shows as connected — and its
 * `listActivities` returns `[]` on purpose, because COROS publishes no
 * response schema for `querySportRecords` and nobody has read a real one yet
 * (coros.ts says so at length). Collapsing the two into one word would have
 * only two ways to be wrong: call COROS unavailable and hide a connection that
 * genuinely works, or call it ready and let an athlete connect a watch, press
 * "check for activities", and be told "nothing new" forever — which blames
 * their watch for ICEFALL's missing mapper.
 */
export type WatchActivityReading =
  | "implemented" // ICEFALL has a mapper for this vendor's activity response
  | "not-implemented"; // the connection works; the response shape is not known yet
