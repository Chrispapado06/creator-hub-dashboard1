/**
 * Shared vocabulary for the ICEFALL coach.
 *
 * Every coach module — load, readiness, check-ins, the briefing itself — speaks
 * these types, so a number produced in one place cannot quietly change meaning
 * in another.
 *
 * The organising rule is the same one the tracking layer already follows: a
 * metric either resolves to a value or it resolves to a reason it is missing.
 * There is no third option. A zero that stands in for "we never measured this"
 * is a lie the athlete cannot see, and on a mountain the athlete is the one who
 * pays for it.
 */

/* -------------------------------------------------------------------------- */
/* Missing data                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Why a coach value could not be computed.
 *
 * Distinct from `UnavailableReason` in the tracking layer on purpose: that one
 * describes a sensor during a recording ("no-gps", "awaiting-signal"), this one
 * describes an athlete's history after the fact.
 *
 *  - `no-data`            nothing recorded that could feed this
 *  - `not-connected`      a source exists but is not linked (sleep, HR strap)
 *  - `needs-permission`   linked, but the athlete has not granted access
 *  - `too-little-history` recorded, but too short a span to mean anything yet
 *  - `not-reported`       relies on a self-report the athlete has not made
 */
export type Unavailable =
  | "no-data"
  | "not-connected"
  | "needs-permission"
  | "too-little-history"
  | "not-reported";

/** Short copy for each reason. One phrasing across the whole app. */
export const UNAVAILABLE_COPY: Record<Unavailable, string> = {
  "no-data": "Not recorded",
  "not-connected": "No source connected",
  "needs-permission": "Permission needed",
  "too-little-history": "Not enough history yet",
  "not-reported": "Not reported",
};

/* -------------------------------------------------------------------------- */
/* Scores                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A 0–100 score, or nothing plus the reason there is nothing.
 *
 * `value === null` is not "zero out of a hundred". Consumers must render the
 * reason rather than substituting a number, and a composite score built from
 * these must name the component it could not compute rather than defaulting it.
 */
export interface Score {
  value: number | null;
  reason?: Unavailable;
}

/** One named input to a composite score, carried with its own availability. */
export interface Component {
  id: string;
  label: string;
  score: Score;
  /** Plain-language explanation of what this component saw. Never diagnostic. */
  note: string;
}

/** A score we could compute. Clamped, because 0–100 is the whole contract. */
export const known = (value: number): Score => ({
  value: Math.max(0, Math.min(100, Math.round(value))),
});

/** A score we could not compute, with the reason attached rather than a zero. */
export const unavailable = (reason: Unavailable): Score => ({ value: null, reason });

/** Narrowing guard so callers stop reaching for `?? 0`. */
export const isKnown = (s: Score): s is Score & { value: number } => s.value !== null;

/* -------------------------------------------------------------------------- */
/* Training load                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The direction of an athlete's training load.
 *
 * `insufficient-data` is a first-class member and not a failure state: for the
 * first fortnight of recorded history it is the only honest answer, and it must
 * be preferred to a confident-looking ratio derived from three sessions.
 */
export type LoadTrend = "ramping" | "steady" | "detraining" | "spike" | "insufficient-data";

/* -------------------------------------------------------------------------- */
/* Self-report                                                                 */
/* -------------------------------------------------------------------------- */

export const CHECK_IN_MIN = 1;
export const CHECK_IN_MAX = 5;

/**
 * A daily self-report. Every field is 1–5 and every field is the athlete's own
 * opinion, not a measurement — treat it as such in any copy derived from it.
 *
 * DIRECTION MATTERS, and it is not uniform:
 *   energy, sleep, motivation — higher is better
 *   soreness, stress          — higher is worse
 *
 * Getting a sign wrong here would invert a recommendation, so read this comment
 * before writing the arithmetic.
 */
export interface CheckIn {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  energy: number;
  soreness: number;
  sleep: number;
  stress: number;
  motivation: number;
}

/* -------------------------------------------------------------------------- */
/* Framing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shown wherever the coach makes a recommendation. The coach reasons about
 * training, never about the body, and never in place of a professional.
 */
export const COACH_DISCLAIMER =
  "The coach works from the sessions you record and from what you report. It is a planning aid, not a measurement of your body: it cannot tell you whether you are recovered, whether you are injured, or how you will respond to altitude. If something hurts, have it assessed by a doctor or a physiotherapist. For anything glaciated or technical, take instruction from an IFMGA-certified guide.";
