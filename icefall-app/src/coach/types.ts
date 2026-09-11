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
  /** Local calendar date, YYYY-MM-DD. The key: one report per day. */
  date: string;
  /**
   * WHEN THEY ACTUALLY FILLED IT IN — the full instant, plus the zone.
   *
   * The date alone made a check-in a fact about a day, and a check-in is not a
   * fact about a day: "slept badly, legs heavy" at half past five in the
   * morning is a report on the night, and the same five answers at nine in the
   * evening are a report on the day's training. A coach that cannot tell those
   * apart is reading the wrong thing, and one that reads a morning check-in as
   * an assessment of a session the athlete has not yet done is reading
   * something that has not happened.
   *
   * Optional because reports stored before this existed have only a date, and
   * nothing invents a time for them. `at` is an ISO instant; `timeZone` is the
   * IANA name of where they were, so a check-in filled in at base camp is not
   * re-read later in the zone the phone came home to. See
   * `tracking/timeOfDay.ts` — the same argument, the same fields.
   */
  at?: string;
  timeZone?: string | null;
  utcOffsetMin?: number | null;
  energy: number;
  soreness: number;
  sleep: number;
  stress: number;
  motivation: number;
}

/**
 * The five answers alone — what a screen collects, before the app stamps it.
 *
 * The clock is `AppState`'s to write, not a screen's: `saveCheckIn` is the one
 * write boundary for a report and it stamps the date, the instant and the zone
 * together so the three can never disagree.
 */
export type CheckInAnswers = Omit<CheckIn, "date" | "at" | "timeZone" | "utcOffsetMin">;

/* -------------------------------------------------------------------------- */
/* Framing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shown wherever the coach makes a recommendation. The coach reasons about
 * training, never about the body, and never in place of a professional.
 */
export const COACH_DISCLAIMER =
  "The coach works from the sessions you record and from what you report. It is a planning aid, not a measurement of your body: it cannot tell you whether you are recovered, whether you are injured, or how you will respond to altitude. If something hurts, have it assessed by a doctor or a physiotherapist. For anything glaciated or technical, take instruction from an IFMGA-certified guide.";

/* -------------------------------------------------------------------------- */
/* Measured vitals                                                             */
/* -------------------------------------------------------------------------- */

/**
 * An instrument that can measure a vital.
 *
 * Lives here rather than in the tracking layer because both sides need it and
 * only one of them may own it: `tracking/sources/vitals.ts` aliases its
 * `VitalSource` to this, so there is exactly one list and it cannot drift.
 * A coach module may then name the instrument behind a number without
 * importing anything that talks to a network.
 */
export type MeasuredSource = "oura" | "apple-health" | "health-connect";

/** What to call each instrument on screen and in a sentence. */
export const MEASURED_SOURCE_LABEL: Record<MeasuredSource, string> = {
  oura: "your Oura ring",
  "apple-health": "Apple Health",
  "health-connect": "Health Connect",
};

/**
 * ONE READING FROM ONE INSTRUMENT, OR THE REASON THERE ISN'T ONE.
 *
 * This is rule 5 made into a type. A figure a device measured and a figure a
 * person typed are different evidence, and the difference has to survive the
 * journey from the sensor to the screen — so a measured vital travels as this
 * shape, never as a bare number that could be mistaken for a slider.
 *
 * `value` IS THREE-STATE, and the distinction is load-bearing:
 *
 *   undefined  no instrument is connected that could have measured this
 *   null       an instrument was connected, was asked, and had nothing
 *   number     a measurement, taken by the instrument named in `source`
 *
 * Collapsing the first two would tell an athlete who has connected nothing
 * that they failed to record something, and tell an athlete whose ring sat on
 * a charger that they have no ring.
 *
 * `measuredOn` IS THE DAY THE INSTRUMENT ATTRIBUTES THE READING TO, never the
 * day ICEFALL fetched it. It is not decoration and it is not optional in
 * practice: Oura's sleep only reaches Oura's cloud when the person opens the
 * Oura app, so last night can legitimately arrive a day late and a figure
 * shown without its date is a figure that will eventually be wrong. A reading
 * that arrives with no date is treated as unscoreable rather than as today's.
 */
export interface MeasuredVital {
  value: number | null | undefined;
  /** The instrument. Absent exactly when there is no number. */
  source?: MeasuredSource;
  /** YYYY-MM-DD, the day the instrument says it measured. */
  measuredOn?: string;
  /** Which absence, in the coach's five-word vocabulary. */
  reason?: Unavailable;
  /**
   * The source's own, truer sentence for the absence — "your Oura membership
   * has lapsed" rather than "no source connected". Carried because narrowing
   * twelve reasons to five loses the one thing that tells a person what to do.
   */
  note?: string;
}

/** No instrument at all, with the coach-side reason for saying so. */
export const noSource = (reason: Unavailable = "not-connected", note?: string): MeasuredVital => ({
  value: undefined,
  reason,
  note,
});
