import { isoDate } from "@/data/mock/clock";
import { activityById } from "@/tracking/activities";
import type { RecordedActivity } from "@/tracking/types";
import type { LoadTrend, Unavailable } from "./types";

/**
 * Training load.
 *
 * One number per session, accumulated into a daily series, then compared as a
 * fast average (about a week) against a slow one (about four weeks). The ratio
 * between them says whether the last few days resemble what the athlete has
 * been doing all along, or whether they are a departure from it.
 *
 * Three things this module refuses to do:
 *
 *   1. Invent a physiological baseline. There is no recorded maximum or resting
 *      heart rate anywhere in the model, so nothing here claims to be a
 *      percentage of anything. Intensity is a relative weighting used to rank
 *      the athlete's own sessions against each other, and that is all it is.
 *   2. Return a ratio off a handful of sessions. Under about a fortnight of
 *      history the acute:chronic comparison is arithmetic on noise, and a
 *      number that looks confident is worse than no number at all — so the
 *      trend is `insufficient-data` and the ratio is null.
 *   3. Diagnose. A high ratio means recent load is above the athlete's own
 *      baseline. It does not mean overtrained, run down, or injured, and no
 *      string in this file is allowed to imply otherwise.
 */

const DAY_MS = 86_400_000;

/** Nothing older contributes. Eight weeks keeps a four-week average well warm. */
const LOOKBACK_DAYS = 56;

/** Standard EWMA smoothing for a 7-day and a 28-day window. */
const ACUTE_ALPHA = 2 / (7 + 1);
const CHRONIC_ALPHA = 2 / (28 + 1);

/** A seven-day average needs seven days. Below that it is one partial week. */
const MIN_DAYS_FOR_ACUTE = 7;
/** Below a fortnight the acute:chronic ratio is noise wearing a decimal point. */
export const MIN_DAYS_FOR_RATIO = 14;
/** A fortnight of calendar with two sessions in it is still not a pattern. */
const MIN_SESSIONS_FOR_RATIO = 4;
/**
 * A baseline this close to zero makes the ratio explode off a single session —
 * one 90-minute walk against a near-empty month reads as a 6× "spike". Below
 * this the comparison is withheld rather than dramatised.
 */
const MIN_CHRONIC_FOR_RATIO = 1;

/**
 * Ratio bands. ICEFALL's own thresholds, set conservatively; they are not a
 * clinical instrument and are not drawn from any published protocol.
 */
export const SPIKE_RATIO = 1.5;
export const RAMPING_RATIO = 1.15;
export const DETRAINING_RATIO = 0.8;

/* -------------------------------------------------------------------------- */
/* Session load                                                                */
/* -------------------------------------------------------------------------- */

/**
 *   load = movingMinutes × intensity  +  (ascentMetres / 100) × VERTICAL_MINUTES
 *
 * Time is the base: everything else scales or extends it, so a load unit is
 * roughly "a minute of steady aerobic work".
 *
 * Intensity is a multiplier around 1.0 at a steady aerobic effort. Heart rate
 * drives it when there is heart rate; otherwise the activity's MET estimate
 * does, which is a far blunter instrument — hence `intensitySource`, so the UI
 * can say which one was used instead of implying a strap was worn.
 *
 * Vertical is added, not multiplied. Multiplying would double-count on any
 * session with heart rate, since climbing already raises the heart rate that
 * set the intensity. It is added because ascent is the specific stimulus this
 * sport is built on: a 700 m climb and a flat walk of the same duration are not
 * the same training day, and a model that scores them alike is useless for
 * mountaineering.
 */
const VERTICAL_MINUTES_PER_100M = 6;

/** Heart rate outside this band is a strap artefact, not an athlete. */
const HR_MIN_PLAUSIBLE = 60;
const HR_MAX_PLAUSIBLE = 220;

/**
 * Reference anchors for the intensity curve. These are population reference
 * points used to rank sessions consistently — NOT this athlete's measured easy
 * and hard efforts, which ICEFALL does not know. The same anchors are applied
 * to every session, so the comparison between sessions holds even though the
 * absolute number means nothing on its own.
 */
const HR_EASY_BPM = 110;
const HR_HARD_BPM = 170;
const HR_EASY_FACTOR = 0.55;
const HR_HARD_FACTOR = 1.55;

/** MET of a solid steady aerobic session; the divisor that centres the scale. */
const MET_REFERENCE = 8;

/** Intensity is bounded at both ends so one bad reading cannot dominate a month. */
const INTENSITY_FLOOR = 0.4;
const INTENSITY_CEILING = 1.8;

/**
 * Data hygiene, not reward capping. Points are capped to avoid incentivising a
 * long day (see src/tracking/points.ts); load must NOT be, because understating
 * a genuinely enormous day would weaken the caution that follows it. These
 * ceilings only reject values no session can produce.
 */
const MAX_PLAUSIBLE_MINUTES = 36 * 60;
const MAX_PLAUSIBLE_ASCENT_M = 8000;

export type IntensitySource = "heart-rate" | "activity-type";

export interface SessionLoadDetail {
  /** Load units, roughly minutes of steady aerobic work. */
  load: number;
  /** Minutes actually used — moving time where recorded, else elapsed. */
  minutes: number;
  /** Multiplier applied to time. Not a percentage of anything physiological. */
  intensity: number;
  intensitySource: IntensitySource;
  /** Set only when heart rate was unusable and the estimate stood in for it. */
  intensityReason?: Unavailable;
  /** The share of `load` contributed by ascent. */
  verticalLoad: number;
  /** One line the UI can show verbatim beside the number. */
  note: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Moving time where it exists, elapsed otherwise. Moving time is the honest
 * measure of work done — an hour of the clock with forty minutes of standing on
 * a belay is not an hour of load — but some imports carry only elapsed, and
 * silently treating a missing moving time as zero would erase the session.
 */
function minutesOf(a: RecordedActivity): number {
  const moving = Number.isFinite(a.movingSec) && a.movingSec > 0 ? a.movingSec : a.durationSec;
  if (!Number.isFinite(moving) || moving <= 0) return 0;
  return Math.min(moving / 60, MAX_PLAUSIBLE_MINUTES);
}

/**
 * The full working of one session's load, including which intensity signal was
 * available. `sessionLoad` is this with the reasoning thrown away — prefer this
 * one anywhere the athlete can see the result.
 */
export function sessionLoadDetail(a: RecordedActivity): SessionLoadDetail {
  const type = activityById(a.activityTypeId);
  const minutes = minutesOf(a);

  const hr =
    typeof a.avgHeartRateBpm === "number" && Number.isFinite(a.avgHeartRateBpm)
      ? a.avgHeartRateBpm
      : null;

  let intensity: number;
  let intensitySource: IntensitySource;
  let intensityReason: Unavailable | undefined;
  let note: string;

  if (hr !== null && hr >= HR_MIN_PLAUSIBLE && hr <= HR_MAX_PLAUSIBLE) {
    const span = (hr - HR_EASY_BPM) / (HR_HARD_BPM - HR_EASY_BPM);
    intensity = clamp(
      HR_EASY_FACTOR + span * (HR_HARD_FACTOR - HR_EASY_FACTOR),
      INTENSITY_FLOOR,
      INTENSITY_CEILING,
    );
    intensitySource = "heart-rate";
    note = `Intensity from an average of ${Math.round(hr)} bpm.`;
  } else {
    intensity = clamp(type.metEstimate / MET_REFERENCE, INTENSITY_FLOOR, INTENSITY_CEILING);
    intensitySource = "activity-type";
    // The fallback is visible on purpose. An estimate presented as a measurement
    // is the exact failure this codebase exists to avoid.
    intensityReason = "no-data";
    note =
      hr === null
        ? `No heart rate recorded — intensity estimated from the activity type (${type.label}).`
        : `Heart rate average was outside a plausible range — intensity estimated from the activity type (${type.label}).`;
  }

  const gain =
    Number.isFinite(a.elevationGainM) && a.elevationGainM > 0
      ? Math.min(a.elevationGainM, MAX_PLAUSIBLE_ASCENT_M)
      : 0;
  const verticalLoad = (gain / 100) * VERTICAL_MINUTES_PER_100M;

  return {
    load: round1(minutes * intensity + verticalLoad),
    minutes: round1(minutes),
    intensity: round2(intensity),
    intensitySource,
    intensityReason,
    verticalLoad: round1(verticalLoad),
    note,
  };
}

/** Load units for a single session. Combines duration, intensity and ascent. */
export function sessionLoad(a: RecordedActivity): number {
  return sessionLoadDetail(a).load;
}

/* -------------------------------------------------------------------------- */
/* Accumulated load                                                            */
/* -------------------------------------------------------------------------- */

export interface LoadPoint {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  load: number;
}

export interface TrainingLoad {
  acute: number | null; // ~7-day exponentially-weighted load
  chronic: number | null; // ~28-day
  ratio: number | null; // acute/chronic, null when chronic is 0 or history too short
  trend: LoadTrend;
  /** Days of history actually observed — drives whether any of this is trustworthy. */
  observedDays: number;
  daily: LoadPoint[];
  /** Plain-language, non-medical. */
  summary: string;
  /** Set when the athlete should be told to ease off. Never diagnostic. */
  caution: string | null;
}

/**
 * Shown wherever training load is displayed. Load is silent about everything it
 * cannot see, and what it cannot see is most of an athlete's life.
 */
export const LOAD_DISCLAIMER =
  "Training load is derived only from sessions recorded in ICEFALL. Sessions you did not record are not in it, and neither is work, travel, illness or sleep. It describes your training, not your body, and it is not a medical assessment.";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole days between two local midnights. Rounded because DST days are 23 or 25 hours. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

interface WindowedSession {
  day: Date;
  detail: SessionLoadDetail;
  simulated: boolean;
}

function empty(summary: string): TrainingLoad {
  return {
    acute: null,
    chronic: null,
    ratio: null,
    trend: "insufficient-data",
    observedDays: 0,
    daily: [],
    summary,
    caution: null,
  };
}

export function computeTrainingLoad(acts: RecordedActivity[], now = new Date()): TrainingLoad {
  const today = startOfDay(now);
  const windowStart = startOfDay(today);
  windowStart.setDate(windowStart.getDate() - (LOOKBACK_DAYS - 1));

  const sessions: WindowedSession[] = [];
  for (const a of acts) {
    const started = new Date(a.startedAt);
    // An unparseable or future-dated timestamp is dropped rather than coerced.
    // Guessing a date here would put load on a day the athlete did not train.
    if (Number.isNaN(started.getTime())) continue;
    const day = startOfDay(started);
    if (day.getTime() > today.getTime()) continue;
    if (day.getTime() < windowStart.getTime()) continue;
    sessions.push({ day, detail: sessionLoadDetail(a), simulated: a.simulated === true });
  }

  if (sessions.length === 0) {
    return empty(
      "No sessions recorded in the last eight weeks, so there is no training load to report. Record a few and this fills in.",
    );
  }

  const firstDay = sessions.reduce(
    (min, s) => (s.day.getTime() < min.getTime() ? s.day : min),
    sessions[0].day,
  );

  // History starts at the first session we can see, not at the start of the
  // lookback window. Padding the front with zeroes would assert that the
  // athlete rested through weeks ICEFALL simply was not present for.
  const observedDays = daysBetween(firstDay, today) + 1;

  const totals = new Map<string, number>();
  for (const s of sessions) {
    const key = isoDate(s.day);
    totals.set(key, (totals.get(key) ?? 0) + s.detail.load);
  }

  const daily: LoadPoint[] = [];
  for (let i = 0; i < observedDays; i++) {
    // setDate rather than millisecond arithmetic: adding 24 h across a DST
    // boundary lands on the same calendar day twice and shifts the series.
    const d = new Date(firstDay);
    d.setDate(d.getDate() + i);
    const key = isoDate(d);
    // A zero here means "no session recorded", which is not the same as "rested".
    daily.push({ date: key, load: round1(totals.get(key) ?? 0) });
  }

  // Both averages are seeded with the mean daily load of the observed span
  // rather than with zero. Seeding at zero lets the fast average respond
  // immediately while the slow one climbs from nothing, which manufactures a
  // "spike" in every athlete's first fortnight that never happened. We cannot
  // know what came before the first recorded session, so the least dishonest
  // assumption is that it resembled what we can see.
  const mean = daily.reduce((sum, p) => sum + p.load, 0) / daily.length;
  let acuteEwma = mean;
  let chronicEwma = mean;
  for (const p of daily) {
    acuteEwma = p.load * ACUTE_ALPHA + acuteEwma * (1 - ACUTE_ALPHA);
    chronicEwma = p.load * CHRONIC_ALPHA + chronicEwma * (1 - CHRONIC_ALPHA);
  }

  const acute = observedDays >= MIN_DAYS_FOR_ACUTE ? round1(acuteEwma) : null;
  const chronic = observedDays >= MIN_DAYS_FOR_RATIO ? round1(chronicEwma) : null;

  const ratioTrustworthy =
    acute !== null &&
    chronic !== null &&
    chronicEwma >= MIN_CHRONIC_FOR_RATIO &&
    sessions.length >= MIN_SESSIONS_FOR_RATIO;

  const ratio = ratioTrustworthy ? round2(acuteEwma / chronicEwma) : null;

  let trend: LoadTrend = "insufficient-data";
  if (ratio !== null) {
    if (ratio >= SPIKE_RATIO) trend = "spike";
    else if (ratio >= RAMPING_RATIO) trend = "ramping";
    else if (ratio <= DETRAINING_RATIO) trend = "detraining";
    else trend = "steady";
  }

  const withHr = sessions.filter((s) => s.detail.intensitySource === "heart-rate").length;
  const simulated = sessions.filter((s) => s.simulated).length;

  const parts: string[] = [describeTrend(trend, ratio, sessions.length, observedDays)];

  // Intensity provenance is part of the result, not a footnote. Without this a
  // load built entirely from activity-type estimates reads as measured.
  if (withHr === 0) {
    parts.push(
      "No session in this window recorded heart rate, so every intensity here is estimated from activity type.",
    );
  } else if (withHr < sessions.length) {
    parts.push(
      `Heart rate was recorded for ${withHr} of ${sessions.length} sessions; the rest are estimated from activity type.`,
    );
  }

  if (simulated > 0) {
    parts.push(
      `${simulated} of these ${simulated === 1 ? "was a simulated recording" : "were simulated recordings"}.`,
    );
  }

  return {
    acute,
    chronic,
    ratio,
    trend,
    observedDays,
    daily,
    summary: parts.join(" "),
    caution: cautionFor(trend, daily),
  };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

function describeTrend(
  trend: LoadTrend,
  ratio: number | null,
  sessionCount: number,
  observedDays: number,
): string {
  const days = `${observedDays} ${observedDays === 1 ? "day" : "days"}`;
  const count = `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`;

  if (trend === "insufficient-data" || ratio === null) {
    if (observedDays < MIN_DAYS_FOR_RATIO) {
      return `${count} recorded across ${days}. Comparing a seven-day average against a twenty-eight-day one needs about a fortnight of history before it means anything, so no ratio is shown yet.`;
    }
    if (sessionCount < MIN_SESSIONS_FOR_RATIO) {
      return `${count} across ${days} is too sparse to compare a seven-day average against a twenty-eight-day one, so no ratio is shown.`;
    }
    return `Your recorded load over ${days} is too light to compare a seven-day average against a twenty-eight-day one, so no ratio is shown.`;
  }

  const r = ratio.toFixed(2);
  switch (trend) {
    case "spike":
      return `Your last seven days are well above your twenty-eight-day average (${r}×).`;
    case "ramping":
      return `Your load is building — the last seven days sit above your twenty-eight-day average (${r}×). That is what a build block should look like.`;
    case "detraining":
      return `Your last seven days are below your twenty-eight-day average (${r}×). Deliberate in a taper or after a big objective; worth noticing otherwise.`;
    case "steady":
      return `Your last seven days are in line with your twenty-eight-day average (${r}×).`;
  }
}

/**
 * Advice to ease off, phrased as an observation about training rather than a
 * claim about the athlete. "Your last seven days are above your average" is a
 * fact about recorded data; "you are overtrained" is a diagnosis, and ICEFALL
 * does not make diagnoses.
 */
function cautionFor(trend: LoadTrend, daily: LoadPoint[]): string | null {
  if (trend === "spike") {
    return "Your last seven days sit well above your twenty-eight-day average. A shorter or lower-intensity session may suit today better, and a full rest day is a legitimate choice. If something hurts, have it assessed rather than trained through.";
  }

  // Seven consecutive loaded days is an observation, not an inference — every
  // one of those days has a recorded session behind it.
  const lastSeven = daily.slice(-7);
  if (lastSeven.length === 7 && lastSeven.every((p) => p.load > 0)) {
    return "You have recorded a session on each of the last seven days. A full rest day is part of the programme, not a gap in it.";
  }

  return null;
}
