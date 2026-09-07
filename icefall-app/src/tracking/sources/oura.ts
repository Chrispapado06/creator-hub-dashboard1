import { supabase } from "@/backend/client";
import { DEMO } from "@/offline/offline";
import { readHealthConsent, type HealthConsent } from "@/health/consent";

/**
 * Oura Ring — the app's side of the integration.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT A `HealthBridge`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sources/health.ts` defines `HealthBridge`, and the obvious move would be to
 * write an Oura implementation of it so every screen keeps one interface. That
 * would be wrong, for three reasons, and the third one is the dangerous one.
 *
 * 1. THE SHAPES DO NOT MATCH. `HealthBridge.daySummary()` is a device-local
 *    read: the phone is in your hand, the store is on the phone, the answer is
 *    for today. This is a server-stored dataset behind an OAuth grant, with its
 *    own freshness (Oura's sleep only reaches their cloud when the person opens
 *    the Oura app, so last night can legitimately arrive a day late) and its
 *    own failure modes that no phone bridge has — a lapsed membership, a
 *    revoked grant, a silently expired webhook subscription. Squeezing those
 *    into `{ value, reason }` with the bridge's four reasons would flatten
 *    "your Oura membership lapsed" into "no-data", which is a different
 *    sentence to show a person and a different thing for them to do about it.
 *
 * 2. IT WOULD WIDEN A UNION THAT IS DELIBERATELY NARROW. `HealthMetricId` has
 *    seven members and the file says the smallness is the point — "everything
 *    ICEFALL needs, nothing it doesn't, so permission requests stay minimal".
 *    Oura brings HRV in milliseconds, respiratory rate, SpO2, temperature
 *    deviation and five 0-100 scores. Adding them to that union obliges the
 *    Capacitor HealthKit plugin to satisfy fields Apple Health does not expose
 *    in that form, and widens the iOS permission prompt for data nobody is
 *    asking Apple Health for.
 *
 * 3. AND THE DUPLICATE IS GUARANTEED, NOT HYPOTHETICAL. Oura's own app WRITES
 *    INTO APPLE HEALTH. So a person with both connected has one resting heart
 *    rate arriving twice — once from this API, once from HealthKit having been
 *    handed it by Oura. If Oura implemented `HealthBridge`, the two would be
 *    indistinguishable at the point of use and something downstream would end
 *    up picking whichever answered last, which is not a decision, it is a coin
 *    toss that changes daily.
 *
 * So: TWO SOURCES, SIDE BY SIDE, AND A RESOLVER THAT OWNS PRECEDENCE. Neither
 * this module nor `health.ts` talks to a coach screen directly. Both feed
 * `sources/vitals.ts`, which holds one fixed, written-down order per metric and
 * attaches the winning source's name to the number. See that file for the
 * order and the argument for it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE WILL NOT DO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NO CLIENT SECRET, EVER. The OAuth client secret is used three times — the
 * token exchange, every refresh, and the webhook HMAC — and all three happen in
 * `icefall-web/api/_oura.mjs` on a server. A `VITE_` variable is compiled into
 * this bundle and readable by anyone who opens the app, so there is no version
 * of this file that holds one. The only thing configured here is a PUBLIC base
 * URL. If you find yourself reaching for a secret in this file, the design has
 * gone wrong, not the configuration.
 *
 * NO STORAGE. Nothing here is written to `localStorage`. Health measurements on
 * a shared device outliving a sign-out is a leak the consent does not cover,
 * and a cached HRV surviving a disconnect is precisely what "disconnect deletes
 * it" is supposed to prevent. The cache is a field on an object that dies with
 * the page.
 *
 * NO FETCH BEFORE CONSENT. `refresh()` reads the consent state first and stops
 * there if it is not `granted`. The server also refuses — `handleOuraConnect`
 * checks before issuing the authorize URL and `handleOuraCallback` re-checks
 * before exchanging the code — so this is the second of two gates, not the only
 * one. It exists so the app cannot even ask.
 */

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where the ICEFALL API lives.
 *
 * The phone app is a static bundle; the Oura endpoints are Vercel functions in
 * `icefall-web`, on a different origin. So this is an absolute URL and it has
 * to be configured. It is PUBLIC — the address of a server, not a credential —
 * and there is nothing secret about it, which is why `VITE_` is correct here
 * and would be a catastrophe for the client secret.
 *
 * Unset means unset. The app reports "not configured" rather than guessing at
 * `https://icefall.app`, because a wrong guess sends a bearer token belonging
 * to a real person to a host we did not mean.
 */
const API_BASE = String(import.meta.env.VITE_ICEFALL_API_BASE || "").replace(/\/+$/, "");

/**
 * Where the browser comes back to after Oura's consent page.
 *
 * The server will only accept a value already in its `OURA_APP_RETURN_URLS`
 * allowlist — a `redirect_uri`-shaped value a caller can choose is an open
 * redirect, and this one sits at the end of an OAuth flow where one is worth
 * the most. So this must match an entry there exactly, or `connect()` fails
 * with `return_url_not_allowlisted` rather than sending anybody anywhere.
 *
 * A native build replaces this with its universal link or custom scheme, and
 * adds that to the same allowlist. Nothing else in this file changes.
 */
const RETURN_URL = String(import.meta.env.VITE_ICEFALL_OURA_RETURN_URL || "");

/**
 * The return address for a ring connected from the LAST PAGE OF SIGN-UP, so
 * the person comes back to that page rather than being dropped in settings
 * mid-flow. Derived from the configured address rather than from
 * `window.location.origin`: a native shell's origin is not a web address, and
 * the server only honours what is in its allowlist — which means this URL
 * (`<same origin>/connect`) must be added to `OURA_APP_RETURN_URLS` alongside
 * the settings one, or the server refuses the sign-up connection outright.
 */
export function signupReturnUrl(): string {
  if (!RETURN_URL) return "";
  try {
    return new URL("/connect", RETURN_URL).toString();
  } catch {
    return "";
  }
}

/**
 * How old a fetched summary may be before its values stop being shown.
 *
 * NOT the same thing as Oura's own freshness window. The server already refuses
 * to hand back a READING older than `OURA_FRESHNESS_DAYS` and returns
 * `no-recent-data` instead. This is about our own copy of the answer: if the
 * network has been down for a morning, the numbers on screen are the ones we
 * fetched before it went down, and past this age they are withheld rather than
 * shown under a live-looking tile.
 *
 * Below this age they ARE shown — but never silently. `state.lastFetchAt` and
 * `state.refreshError` are both public, and every screen that renders a value
 * from a summary with an error attached is required to say when it was read.
 * A measured value carrying its own measurement date is not a stale value; a
 * value with no date beside it is.
 */
const SUMMARY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Metric vocabulary                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every metric the summary endpoint can return.
 *
 * Read the `kind` field before rendering ANY of these. It is the fix for the
 * single most dangerous thing in the original specification, which asked for
 * "biometrics (HRV, resting heart rate, respiratory rate)" from the
 * `daily_readiness` endpoint. That endpoint has no biometrics in it. Its
 * `resting_heart_rate` contributor is a SCORE OUT OF 100, not a pulse — an
 * athlete with an excellent resting heart rate scores near 100, and printing
 * that on a tile marked "bpm" would show a climber a heart rate of 97 and let
 * them plan a summit day around it.
 *
 * The real measurements come off `/v2/usercollection/sleep`, a different
 * endpoint, and are the ones marked `measurement` below. The two are separated
 * in the column names, separated here, and must stay separated on screen.
 */
export type OuraMetricId =
  /* Measurements — a real physical quantity, with a real unit. */
  | "hrv"
  | "restingHeartRate"
  | "averageHeartRate"
  | "respiratoryRate"
  | "sleepMinutes"
  | "deepSleepMinutes"
  | "remSleepMinutes"
  | "sleepEfficiency"
  | "spo2"
  | "temperatureDeviation"
  | "steps"
  | "activeCalories"
  | "stressHighMinutes"
  | "recoveryHighMinutes"
  /* Scores — Oura's 0-100 opinion. No unit, and never a physical quantity. */
  | "readinessScore"
  | "sleepScore"
  | "activityScore"
  | "hrvBalanceScore"
  | "restingHeartRateScore";

export type OuraMetricKind = "measurement" | "score";

export interface OuraMetricDef {
  label: string;
  /** Empty string for a count; "score" is not a unit and is never printed. */
  unit: string;
  kind: OuraMetricKind;
  /** One line, shown where the person is deciding whether to connect at all. */
  why: string;
  format: (v: number) => string;
}

const minutes = (v: number) =>
  `${Math.floor(v / 60)}h ${String(Math.round(v % 60)).padStart(2, "0")}m`;
const round = (v: number) => String(Math.round(v));
const oneDp = (v: number) => v.toFixed(1);

export const OURA_METRICS: Record<OuraMetricId, OuraMetricDef> = {
  hrv: {
    label: "HRV",
    unit: "ms",
    kind: "measurement",
    why: "Average heart-rate variability across the night",
    format: round,
  },
  restingHeartRate: {
    label: "Resting heart rate",
    unit: "bpm",
    kind: "measurement",
    // Oura's lowest overnight heart rate. Named honestly: it is the lowest
    // reading of the night, not an average of a resting state.
    why: "Your lowest heart rate while asleep",
    format: round,
  },
  averageHeartRate: {
    label: "Average sleeping heart rate",
    unit: "bpm",
    kind: "measurement",
    why: "Mean heart rate across the sleep period",
    format: round,
  },
  respiratoryRate: {
    label: "Respiratory rate",
    unit: "breaths/min",
    kind: "measurement",
    why: "Breaths per minute while asleep",
    format: oneDp,
  },
  sleepMinutes: {
    label: "Sleep",
    unit: "",
    kind: "measurement",
    why: "Total time actually asleep, not time in bed",
    format: minutes,
  },
  deepSleepMinutes: {
    label: "Deep sleep",
    unit: "",
    kind: "measurement",
    why: "Time in slow-wave sleep",
    format: minutes,
  },
  remSleepMinutes: {
    label: "REM sleep",
    unit: "",
    kind: "measurement",
    why: "Time in REM sleep",
    format: minutes,
  },
  sleepEfficiency: {
    label: "Sleep efficiency",
    unit: "%",
    kind: "measurement",
    why: "Share of time in bed spent asleep",
    format: round,
  },
  spo2: {
    label: "Blood oxygen",
    unit: "%",
    kind: "measurement",
    why: "Average overnight oxygen saturation",
    format: oneDp,
  },
  temperatureDeviation: {
    label: "Body temperature",
    unit: "°C",
    kind: "measurement",
    // Stated as a deviation because that is what it is. An absolute body
    // temperature is not measured and must never be implied from this.
    why: "How far last night sat from your own baseline",
    format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
  },
  steps: {
    label: "Steps",
    unit: "",
    kind: "measurement",
    why: "Daily step count from the ring",
    format: (v) => v.toLocaleString("en-GB"),
  },
  activeCalories: {
    label: "Active energy",
    unit: "kcal",
    kind: "measurement",
    why: "Energy above resting across the day",
    format: round,
  },
  stressHighMinutes: {
    label: "High stress",
    unit: "",
    kind: "measurement",
    why: "Time the ring read as physiologically stressed",
    format: minutes,
  },
  recoveryHighMinutes: {
    label: "Recovery",
    unit: "",
    kind: "measurement",
    why: "Time the ring read as restored",
    format: minutes,
  },

  readinessScore: {
    label: "Oura readiness",
    unit: "",
    kind: "score",
    // Named "Oura readiness" everywhere, never "readiness". ICEFALL computes a
    // readiness of its own from recorded ascent, load and the check-in. Two
    // different numbers with one name on one screen is how an athlete ends up
    // acting on the wrong one.
    why: "Oura's own 0-100 opinion — not ICEFALL's readiness",
    format: round,
  },
  sleepScore: {
    label: "Oura sleep score",
    unit: "",
    kind: "score",
    why: "Oura's 0-100 rating of last night",
    format: round,
  },
  activityScore: {
    label: "Oura activity score",
    unit: "",
    kind: "score",
    why: "Oura's 0-100 rating of yesterday's movement",
    format: round,
  },
  hrvBalanceScore: {
    label: "HRV balance",
    unit: "",
    kind: "score",
    why: "How last night's HRV sat against your own recent range",
    format: round,
  },
  restingHeartRateScore: {
    label: "Resting HR balance",
    unit: "",
    kind: "score",
    // The trap, named at the point of use.
    why: "A 0-100 contributor score. NOT a heart rate in bpm.",
    format: round,
  },
};

/** Measurements first, in the order a person would read them. */
export const OURA_MEASUREMENTS: OuraMetricId[] = [
  "hrv",
  "restingHeartRate",
  "respiratoryRate",
  "sleepMinutes",
  "deepSleepMinutes",
  "remSleepMinutes",
  "sleepEfficiency",
  "spo2",
  "temperatureDeviation",
  "averageHeartRate",
  "stressHighMinutes",
  "recoveryHighMinutes",
  "steps",
  "activeCalories",
];

export const OURA_SCORES: OuraMetricId[] = [
  "readinessScore",
  "sleepScore",
  "activityScore",
  "hrvBalanceScore",
  "restingHeartRateScore",
];

/* -------------------------------------------------------------------------- */
/* Absence                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Why there is no number.
 *
 * Richer than the coach's five-member `Unavailable` on purpose. A ring whose
 * owner let their Oura membership lapse, a grant revoked in the Oura app, and a
 * token rotation ICEFALL itself lost are three different things that need three
 * different sentences and three different next steps. `coachReason()` at the
 * bottom of this file narrows them for screens that can only speak the five,
 * and carries the true sentence alongside so nothing is lost on the way.
 */
export type OuraUnavailable =
  /* Nothing has been set up. */
  | "not-configured"
  | "signed-out"
  | "consent-not-given"
  | "not-connected"
  /* Set up once, and no longer working. */
  | "reauthorise"
  | "membership-lapsed"
  | "rotation-lost"
  | "token-unreadable"
  | "consent-withdrawn"
  /* Working, but this particular number is not there. */
  | "no-data"
  | "no-recent-data"
  /* We could not ask. */
  | "unreachable";

/**
 * One sentence per reason, second person, no blame and no nudge.
 *
 * `rotation-lost` says whose fault it was. Oura's refresh tokens are single
 * use, so a request that succeeds at Oura and fails to land in our database
 * leaves a connection that cannot be refreshed — through no act of the
 * person's. Telling them to "allow access" would send them to fix something
 * that is not broken at their end, which is the exact failure `DataState.tsx`
 * calls out for `needs-permission`.
 */
export const OURA_UNAVAILABLE_COPY: Record<OuraUnavailable, string> = {
  "not-configured": "This build is not set up to connect a ring.",
  "signed-out": "Sign in to see your ring measurements.",
  "consent-not-given": "Storing health measurements needs your permission first.",
  "not-connected": "No Oura ring is connected.",
  reauthorise:
    "ICEFALL's access to your Oura account has ended. Connect again to start reading it.",
  "membership-lapsed":
    "Oura has stopped sharing your data, which usually means the Oura membership has lapsed.",
  "rotation-lost":
    "ICEFALL lost the link to your ring and needs you to connect again. That was our end, not yours.",
  "token-unreadable":
    "ICEFALL can no longer read its own record of the connection. Connect again to replace it.",
  "consent-withdrawn": "You withdrew permission for health measurements, and they were deleted.",
  "no-data": "Your ring did not record this.",
  "no-recent-data":
    "Nothing recent enough to show. The most recent reading is too old to be today's.",
  unreachable: "ICEFALL could not reach the server, so there is nothing to show.",
};

/* -------------------------------------------------------------------------- */
/* Readings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One number, or the reason there isn't one.
 *
 * `source` is on every reading, present or absent, and it is not decoration.
 * Apple Health can report the same resting heart rate — often literally the
 * same reading, because Oura writes into it — so a number that has lost track
 * of where it came from cannot be reconciled with anything.
 *
 * `measuredOn` is the DAY OURA MEASURED IT, not the day we fetched it. A screen
 * showing a value must show this date. That is the whole difference between a
 * reading and a stale reading.
 */
export interface OuraReading {
  value: number | null;
  unit: string;
  kind: OuraMetricKind;
  source: "oura";
  /** YYYY-MM-DD, the day Oura attributes the measurement to. */
  measuredOn?: string;
  reason?: OuraUnavailable;
}

export type OuraMetrics = Record<OuraMetricId, OuraReading>;

/** Oura's own account of why a night is thin. Only Oura knows these. */
export interface OuraContext {
  /** The ring ran out of battery during the night. */
  lowBatteryLastNight: boolean | null;
  /** "long_sleep", "late_nap"… A nap is not a night and should not read as one. */
  lastSleepPeriodType: string | null;
  /** Minutes the ring was off the finger. */
  nonWearMinutes: number | null;
}

export interface OuraSummary {
  metrics: OuraMetrics;
  context: OuraContext;
  /** Days after which the server itself calls a reading too old. */
  freshnessDays: number;
  /** "pending" | "running" | "done" — history is still arriving while not done. */
  backfill: string;
  /** When THIS APP read it. Not when Oura measured anything. */
  fetchedAt: number;
}

/** Builds a full metric map where every entry is the same absence. */
function allAbsent(reason: OuraUnavailable): OuraMetrics {
  const out = {} as OuraMetrics;
  for (const id of Object.keys(OURA_METRICS) as OuraMetricId[]) {
    out[id] = {
      value: null,
      unit: OURA_METRICS[id].unit,
      kind: OURA_METRICS[id].kind,
      source: "oura",
      reason,
    };
  }
  return out;
}

const EMPTY_CONTEXT: OuraContext = {
  lowBatteryLastNight: null,
  lastSleepPeriodType: null,
  nonWearMinutes: null,
};

/* -------------------------------------------------------------------------- */
/* Connection state                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Where the connection stands.
 *
 *   not-configured   this build has no API base URL
 *   signed-out       nobody is signed in, so there is no account to attach to
 *   consent-required they have not been asked, or they said no
 *   disconnected     permission given, no ring linked
 *   connected        linked and working
 *   attention        linked and NOT working — `reason` says which of the four
 *   unreachable      we could not ask the server
 *   checking         the first read has not returned
 *
 * `checking` is distinct from `disconnected` for the reason `useSessionState`
 * gives about sessions: treating "not known yet" as "not connected" flashes a
 * Connect button at somebody who is already connected on every cold start.
 */
export type OuraStatus =
  | "checking"
  | "not-configured"
  | "signed-out"
  | "consent-required"
  | "disconnected"
  | "connected"
  | "attention"
  | "unreachable";

export interface OuraState {
  status: OuraStatus;
  /** For `attention`, which fault. For the rest, undefined. */
  reason?: OuraUnavailable;
  /** One sentence for the person. Always present when it is not `connected`. */
  detail?: string;
  consent: HealthConsent | null;
  /** When the last successful summary read landed. */
  lastFetchAt: number | null;
  /**
   * Set when the most recent refresh FAILED while an older summary is still
   * held. Any screen showing values while this is set must say the values are
   * from `lastFetchAt` and that the latest attempt did not get through.
   */
  refreshError?: string;
  /** True while a network call is in flight. */
  busy: boolean;
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
  /** Set when the call never completed — offline, DNS, CORS, timeout. */
  networkError?: string;
}

/**
 * One fetch helper for all five endpoints.
 *
 * THE BEARER IS THE PERSON'S OWN SUPABASE SESSION. The server's `/summary` runs
 * the read on that token, so the database filters on `auth.uid()` and the worst
 * a bug on either side can do is ask for the wrong shape — it cannot ask for
 * somebody else's sleep. No elevated credential exists in this app to leak.
 *
 * A ten-second timeout, because nothing in supabase-js or `fetch` has one by
 * default and this app is expected to run on a mountain with a captive portal.
 * A request that hangs forever leaves a spinner where a sentence should be.
 */
async function api<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<ApiResult<T>> {
  if (!API_BASE) {
    return { ok: false, status: 0, body: null, networkError: "not-configured" };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (init?.auth !== false) {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) return { ok: false, status: 401, body: null };
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: null,
      networkError: e instanceof Error ? e.message : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

/* The wire shapes, exactly as `_oura.mjs` sends them. */

interface WireReading {
  value: number | null;
  unit?: string;
  source?: string;
  measuredOn?: string;
  reason?: string;
}

interface WireSummary {
  ok: boolean;
  connected: boolean;
  reason?: string;
  freshnessDays?: number;
  backfill?: string;
  metrics: Partial<Record<OuraMetricId, WireReading>>;
  context?: Partial<OuraContext>;
}

interface WireConnect {
  ok: boolean;
  url?: string;
  scopes?: string;
  code?: string;
  reason?: string;
  error?: string;
}

interface WireDisconnect {
  ok: boolean;
  deleted?: Record<string, number>;
  revocation?: {
    performed: boolean;
    reason: string;
    message: string;
    where: string;
  };
  error?: string;
}

/**
 * Narrows a reason the server sent into one this app knows.
 *
 * An UNKNOWN reason becomes `unreachable`, not `no-data`. A newer server saying
 * something this build has never heard of is a case where we do not know what
 * happened, and "your ring did not record this" would be a confident answer to
 * a question we cannot answer.
 */
function asUnavailable(raw: unknown): OuraUnavailable {
  const s = String(raw || "");
  return s in OURA_UNAVAILABLE_COPY ? (s as OuraUnavailable) : "unreachable";
}

/* -------------------------------------------------------------------------- */
/* The service                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The live connection, with a subscribe/notify shape matching `HealthService`
 * so a screen consuming both reads the same way twice.
 */
export class OuraService {
  private stateValue: OuraState = {
    status: DEMO || !API_BASE ? "not-configured" : "checking",
    detail:
      DEMO || !API_BASE
        ? "This build cannot connect to a ring — it has no server to do the token exchange, and that exchange can never happen in the app."
        : undefined,
    consent: null,
    lastFetchAt: null,
    busy: false,
  };

  /** In memory only. See the header: nothing here reaches localStorage. */
  private summaryValue: OuraSummary | null = null;

  private listeners = new Set<(s: OuraState) => void>();

  get state(): OuraState {
    return this.stateValue;
  }

  subscribe(fn: (s: OuraState) => void) {
    this.listeners.add(fn);
    fn(this.stateValue);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(next: Partial<OuraState>) {
    this.stateValue = { ...this.stateValue, ...next };
    this.listeners.forEach((f) => f(this.stateValue));
  }

  /**
   * The summary, or a fully-absent one with the reason.
   *
   * NEVER RETURNS A NUMBER WITHOUT A REASON TO BELIEVE IT. Three gates:
   *
   *  1. No summary held → every metric absent, carrying the connection's reason.
   *  2. Held but older than `SUMMARY_MAX_AGE_MS` → every metric `unreachable`.
   *     The values are still in memory and are deliberately not returned; an
   *     hours-old HRV with today's date on the tile is the stale-as-current
   *     failure, and the age is invisible to whoever wrote the tile.
   *  3. Held and fresh enough → returned as-is, with `state.refreshError` set
   *     if the last attempt to update them failed. Screens must render that.
   */
  summary(): OuraSummary {
    const held = this.summaryValue;

    if (!held) {
      return {
        metrics: allAbsent(this.absenceReason()),
        context: EMPTY_CONTEXT,
        freshnessDays: 0,
        backfill: "unknown",
        fetchedAt: 0,
      };
    }

    if (Date.now() - held.fetchedAt > SUMMARY_MAX_AGE_MS) {
      return { ...held, metrics: allAbsent("unreachable") };
    }

    return held;
  }

  /** The reason to attach to every metric when there is no summary at all. */
  private absenceReason(): OuraUnavailable {
    const s = this.stateValue;
    switch (s.status) {
      case "not-configured":
        return "not-configured";
      case "signed-out":
        return "signed-out";
      case "consent-required":
        return "consent-not-given";
      case "disconnected":
        return "not-connected";
      case "attention":
        return s.reason ?? "reauthorise";
      case "unreachable":
        return "unreachable";
      // `checking` and `connected` with no summary held are both "we have not
      // got an answer yet", which is not knowledge about the ring.
      default:
        return "unreachable";
    }
  }

  /**
   * Read consent, then — only if it was granted — read the summary.
   *
   * THE ORDER IS THE POINT. Consent is checked before a single health value is
   * requested, not after. A build that fetched first and asked later would have
   * the data in memory before the person had agreed to anything.
   */
  async refresh(): Promise<void> {
    if (DEMO || !API_BASE) {
      this.set({ status: "not-configured", busy: false });
      return;
    }

    this.set({ busy: true });

    const consent = await readHealthConsent();

    if (consent.status === "unknown") {
      if (consent.reason === "signed-out") {
        this.summaryValue = null;
        this.set({
          status: "signed-out",
          consent,
          detail: consent.detail,
          busy: false,
          refreshError: undefined,
        });
        return;
      }
      // Store unreachable. We do NOT fall through to a fetch: an unknown
      // permission is not a granted one.
      this.set({
        status: "unreachable",
        consent,
        detail: consent.detail,
        busy: false,
        refreshError: consent.detail,
      });
      return;
    }

    if (consent.status !== "granted") {
      // Withdrawn or declined means the server has already deleted the rows.
      // Dropping our copy here keeps the screen honest in the same instant.
      this.summaryValue = null;
      this.set({
        status: "consent-required",
        consent,
        detail:
          consent.status === "withdrawn"
            ? OURA_UNAVAILABLE_COPY["consent-withdrawn"]
            : OURA_UNAVAILABLE_COPY["consent-not-given"],
        busy: false,
        refreshError: undefined,
      });
      return;
    }

    const res = await api<WireSummary>("/api/oura/summary");

    if (res.status === 401) {
      this.summaryValue = null;
      this.set({
        status: "signed-out",
        consent,
        detail: OURA_UNAVAILABLE_COPY["signed-out"],
        busy: false,
      });
      return;
    }

    if (!res.ok || !res.body?.ok) {
      /*
        The held summary is kept, and the failure is announced. It is not
        silently swallowed and it is not silently displayed: `refreshError` is
        public, `lastFetchAt` is public, and `summary()` withholds the values
        entirely once they pass SUMMARY_MAX_AGE_MS.
      */
      this.set({
        status: this.summaryValue ? this.stateValue.status : "unreachable",
        consent,
        busy: false,
        refreshError:
          res.networkError === "not-configured"
            ? OURA_UNAVAILABLE_COPY["not-configured"]
            : "ICEFALL could not reach the server, so this may not be the latest reading.",
        detail: this.summaryValue ? this.stateValue.detail : OURA_UNAVAILABLE_COPY.unreachable,
      });
      return;
    }

    const body = res.body;

    if (!body.connected) {
      this.summaryValue = null;
      const reason = asUnavailable(body.reason);
      const disconnected = reason === "not-connected";
      this.set({
        status: disconnected ? "disconnected" : "attention",
        reason: disconnected ? undefined : reason,
        consent,
        detail: OURA_UNAVAILABLE_COPY[reason],
        busy: false,
        refreshError: undefined,
      });
      return;
    }

    this.summaryValue = {
      metrics: readMetrics(body.metrics),
      context: {
        lowBatteryLastNight: body.context?.lowBatteryLastNight ?? null,
        lastSleepPeriodType: body.context?.lastSleepPeriodType ?? null,
        nonWearMinutes: body.context?.nonWearMinutes ?? null,
      },
      freshnessDays: Number(body.freshnessDays) || 0,
      backfill: String(body.backfill || "unknown"),
      fetchedAt: Date.now(),
    };

    this.set({
      status: "connected",
      reason: undefined,
      consent,
      detail: undefined,
      lastFetchAt: this.summaryValue.fetchedAt,
      refreshError: undefined,
      busy: false,
    });
  }

  /**
   * Asks the server for the URL to send the person to.
   *
   * It returns a URL rather than performing the redirect because the caller
   * decides where a browser can be opened. On the web that is
   * `window.location.assign`; in a Capacitor build it is a system browser or an
   * in-app auth session, and the shell then has to hear about the result
   * through its own universal link. That seam is not solved here, and pretending
   * otherwise in a comment would be a guarantee this code does not keep.
   */
  /**
   * Whether `connect()` could possibly succeed in this build — the two
   * preconditions that are known BEFORE any request, hoisted so a screen can
   * decline to draw a button rather than draw one that fails after the tap.
   * No `OuraStatus` reflects a missing return address, which is why this is
   * a separate question from `state.status`.
   */
  canConnect(): { ok: true } | { ok: false; error: string } {
    if (DEMO || !API_BASE) {
      return {
        ok: false,
        error: this.stateValue.detail ?? OURA_UNAVAILABLE_COPY["not-configured"],
      };
    }
    if (!RETURN_URL) {
      return {
        ok: false,
        error:
          "This build has no allowlisted return address, so the connection could not be completed safely.",
      };
    }
    return { ok: true };
  }

  /**
   * `returnTo` is where Oura's consent sends the browser back to — an ABSOLUTE
   * URL the server matches verbatim against its `OURA_APP_RETURN_URLS`
   * allowlist. The default is the settings screen; the sign-up page passes
   * `signupReturnUrl()`. A value the server has not allowlisted is refused
   * there, in the server's own words, and nobody is sent anywhere.
   */
  async connect(
    returnTo: string = RETURN_URL,
  ): Promise<{ ok: boolean; url?: string; error?: string }> {
    const can = this.canConnect();
    if (!can.ok) return { ok: false, error: can.error };

    this.set({ busy: true });
    const res = await api<WireConnect>("/api/oura/connect", {
      method: "POST",
      body: JSON.stringify({ returnTo }),
    });
    this.set({ busy: false });

    if (res.status === 401) return { ok: false, error: OURA_UNAVAILABLE_COPY["signed-out"] };

    if (res.status === 403 && res.body?.code === "consent_required") {
      await this.refresh();
      return { ok: false, error: res.body.error || OURA_UNAVAILABLE_COPY["consent-not-given"] };
    }

    if (!res.ok || !res.body?.ok || !res.body.url) {
      return {
        ok: false,
        // The server's own sentence, passed through. A refusal is not reworded.
        error:
          res.body?.error || "ICEFALL could not start the connection just now. Please try again.",
      };
    }

    return { ok: true, url: res.body.url };
  }

  /**
   * Deletes everything, and reports honestly what could not be done.
   *
   * OURA PUBLISHES NO TOKEN-REVOCATION ENDPOINT. The server deletes our rows and
   * forgets the tokens; it cannot cancel the permission at Oura's end. The
   * server's `revocation.message` says exactly that and this method hands it
   * back untouched so the screen can print it verbatim. Claiming a revocation
   * we did not perform is the same class of failure as printing a number we did
   * not measure.
   */
  async disconnect(): Promise<{
    ok: boolean;
    error?: string;
    revocation?: WireDisconnect["revocation"];
  }> {
    if (DEMO || !API_BASE) return { ok: false, error: this.stateValue.detail };

    this.set({ busy: true });
    const res = await api<WireDisconnect>("/api/oura/disconnect", {
      method: "POST",
      body: JSON.stringify({ reason: "user-disconnect" }),
    });

    if (!res.ok || !res.body?.ok) {
      this.set({ busy: false });
      return {
        ok: false,
        error:
          res.body?.error ||
          "We couldn't remove your ring data just now. Nothing was deleted — please try again.",
      };
    }

    this.summaryValue = null;
    this.set({ busy: false, lastFetchAt: null, refreshError: undefined });
    await this.refresh();
    return { ok: true, revocation: res.body.revocation };
  }

  /**
   * Pulls history. Paginates until the server says it is done.
   *
   * Bounded, because a runaway loop against a rate-limited third party is how an
   * application-wide cap gets hit for every ICEFALL user at once, not just this
   * one.
   */
  async backfill(days?: number): Promise<{ ok: boolean; written: number; error?: string }> {
    if (DEMO || !API_BASE) return { ok: false, written: 0, error: this.stateValue.detail };

    this.set({ busy: true });
    let written = 0;
    let next: { collection: string; cursor: string } | null = null;

    for (let page = 0; page < 40; page++) {
      const res: ApiResult<{
        ok: boolean;
        error?: string;
        backfill?: {
          written: number;
          done: boolean;
          next: { collection: string; cursor: string } | null;
        };
      }> = await api("/api/oura/backfill", {
        method: "POST",
        body: JSON.stringify({ days, ...(next ?? {}) }),
      });

      if (!res.ok || !res.body?.ok || !res.body.backfill) {
        this.set({ busy: false });
        return {
          ok: false,
          written,
          error: res.body?.error || "History could not be fetched just now.",
        };
      }

      written += res.body.backfill.written || 0;
      if (res.body.backfill.done || !res.body.backfill.next) break;
      next = res.body.backfill.next;
    }

    await this.refresh();
    return { ok: true, written };
  }
}

/**
 * Maps the wire payload onto our metric map.
 *
 * A metric the server did not mention at all is `no-data` — an older server, a
 * collection that has never returned anything — and NOT a zero. The unit and
 * kind are taken from `OURA_METRICS` rather than from the wire, so a server
 * sending `unit: "bpm"` for a score cannot make a score render as a pulse.
 */
function readMetrics(wire: Partial<Record<OuraMetricId, WireReading>>): OuraMetrics {
  const out = {} as OuraMetrics;

  for (const id of Object.keys(OURA_METRICS) as OuraMetricId[]) {
    const def = OURA_METRICS[id];
    const w = wire[id];

    if (!w || w.value === null || w.value === undefined || !Number.isFinite(Number(w.value))) {
      out[id] = {
        value: null,
        unit: def.unit,
        kind: def.kind,
        source: "oura",
        reason: asUnavailable(w?.reason || "no-data"),
        measuredOn: w?.measuredOn,
      };
      continue;
    }

    // Number(w.value) rather than `w.value || null`: 0 is a MEASURED ZERO here
    // — zero minutes of deep sleep is a fact about the night — and `||` would
    // turn it into an absence.
    out[id] = {
      value: Number(w.value),
      unit: def.unit,
      kind: def.kind,
      source: "oura",
      measuredOn: w.measuredOn,
    };
  }

  return out;
}

export const ouraService = new OuraService();

/* -------------------------------------------------------------------------- */
/* The bridge to the coach's vocabulary                                       */
/* -------------------------------------------------------------------------- */

/**
 * The coach speaks five reasons; this module speaks twelve.
 *
 * `@/coach/types` defines `Unavailable` as exactly `no-data | not-connected |
 * needs-permission | too-little-history | not-reported`, and `DataState.tsx`
 * has one icon and one sentence for each. Rather than widen that union from a
 * source module — which would break every exhaustive `Record<Unavailable, …>`
 * in the coach and is a decision belonging to whoever owns those screens — this
 * returns BOTH: the closest family member, and the true sentence to put in the
 * `note` field the coach factors already carry.
 *
 * Two mappings deserve their reasoning written down:
 *
 *  - `no-recent-data` → `no-data`, not `not-connected`. `DataState.tsx` makes
 *    the point itself about `needs-permission`: telling somebody to connect a
 *    device they have already connected sends them to fix hardware that is not
 *    broken. A ring that is connected but has not synced recently is not a
 *    missing sensor. NOT ENOUGH DATA is the honest family, and the note carries
 *    the rest.
 *
 *  - every broken-connection state → `not-connected`, never `needs-permission`.
 *    "Allow ICEFALL access to this source" is a true instruction when a person
 *    revoked the grant and a false accusation when ICEFALL lost a token
 *    rotation. The family that says "no sensor is feeding this" is true in
 *    every case; the note says which case it is.
 *
 * IF A `stale` MEMBER IS EVER ADDED to `Unavailable`, this function is the one
 * place to change, and `no-recent-data` should map to it.
 */
export function coachReason(reason: OuraUnavailable): {
  reason: "no-data" | "not-connected" | "needs-permission";
  note: string;
} {
  const note = OURA_UNAVAILABLE_COPY[reason];

  switch (reason) {
    case "no-data":
    case "no-recent-data":
      return { reason: "no-data", note };
    case "consent-not-given":
    case "consent-withdrawn":
      return { reason: "needs-permission", note };
    default:
      return { reason: "not-connected", note };
  }
}
