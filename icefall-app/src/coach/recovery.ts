import { CHECK_IN_MAX, CHECK_IN_MIN, MEASURED_SOURCE_LABEL } from "@/coach/types";
import type {
  CheckIn,
  CheckInAnswers,
  MeasuredSource,
  MeasuredVital,
  Score,
  Unavailable,
} from "@/coach/types";

/**
 * Subjective check-in and recovery status.
 *
 * Recovery here is a PLANNING AID, not a measurement of the body. Nothing in
 * this module diagnoses anything: it takes what the athlete reported, adds the
 * health signals that happen to be available, and returns a status that shapes
 * how hard the next session should be. Where a report suggests something beyond
 * ordinary training fatigue, the answer is "have it looked at by someone
 * qualified", never a name for what it might be.
 *
 * Two rules drive the shape of the code:
 *
 *   1. Nothing is defaulted. A missing input is carried as `{ value: null,
 *      reason }` all the way to the UI, and the score is the weighted mean of
 *      what was actually available, renormalised over that subset. An athlete
 *      who reported nothing gets `null`, not 50 — a neutral-looking number is
 *      indistinguishable from a real one once it reaches a screen.
 *   2. No output may make it rational to train harder than the athlete should.
 *      A poor check-in never produces "make it up later" or "push through";
 *      missed work is not a debt.
 *   3. MEASURED AND SELF-REPORTED NEVER MERGE. Sleep arrives here twice — once
 *      as the athlete's 1-to-5 opinion of how they slept, once as minutes an
 *      instrument counted — and they stay two separate inputs with two separate
 *      weights, two labels and two provenances. They are never averaged into a
 *      single "sleep", because a ring that counted five hours and a person who
 *      says they slept well are both telling the truth about different things.
 */

/* -------------------------------------------------------------------------- */
/* Check-in definition                                                         */
/* -------------------------------------------------------------------------- */

/* The five ANSWERED fields, and only those. Derived from `CheckInAnswers`
   rather than from `CheckIn` so that the stamped date, instant and zone — which
   are the app's record of when the report was made, not things the athlete
   rated from one to five — cannot leak into the slider list or into the
   weighted average. */
export type CheckInField = keyof CheckInAnswers;

/** The slider range the UI presents. Every field uses the same scale. */
export const CHECKIN_SCALE = { min: CHECK_IN_MIN, max: CHECK_IN_MAX } as const;

export const CHECKIN_FIELDS: { id: CheckInField; label: string; low: string; high: string }[] = [
  { id: "energy", label: "Energy", low: "Empty", high: "Fresh" },
  { id: "soreness", label: "Muscle soreness", low: "None", high: "Severe" },
  { id: "sleep", label: "Sleep quality", low: "Broken", high: "Deep" },
  { id: "stress", label: "Life stress", low: "Settled", high: "Very high" },
  { id: "motivation", label: "Motivation to train", low: "Flat", high: "Eager" },
];

/**
 * Soreness and stress run the other way: CHECK_IN_MAX is the bad end. Kept out of
 * CHECKIN_FIELDS so that constant stays exactly the shape the UI consumes.
 */
const HIGHER_IS_BETTER: Record<CheckInField, boolean> = {
  energy: true,
  soreness: false,
  sleep: true,
  stress: false,
  motivation: true,
};

/* -------------------------------------------------------------------------- */
/* Result types                                                                */
/* -------------------------------------------------------------------------- */

export type RecoveryStatus = "good" | "moderate" | "poor" | "unknown";

export interface RecoveryAssessment {
  status: RecoveryStatus;
  score: Score;
  /**
   * Which inputs were actually available — the UI shows this.
   *
   * `kind` travels with each row so a caller cannot render a measured figure
   * and a slider identically. Optional on the type because every consumer that
   * existed before measured vitals reached this module ignores it.
   */
  inputs: {
    id: string;
    label: string;
    value: number | null;
    reason?: Unavailable;
    kind?: "self-reported" | "measured" | "derived";
    source?: MeasuredSource;
    measuredOn?: string;
    /**
     * WHETHER THIS ROW ACTUALLY MOVED THE SCORE.
     *
     * Not the same question as "does it have a value", and the difference is
     * new: a measured reading that is four nights old, or that arrived without
     * the day it belongs to, is shown to the athlete and deliberately left out
     * of the arithmetic. A screen splitting its "what went into it" list on
     * `value !== null` would put that reading under the counted heading and
     * tell somebody a night shaped their score when it did not.
     */
    counted: boolean;
  }[];
  summary: string;
  recommendations: string[];
  /**
   * How many inputs the ATHLETE supplied. Derived signals are excluded, so copy
   * that says "from N reported inputs" is telling the truth.
   */
  reportedCount: number;
  /** True when the athlete reported something that warrants professional advice. */
  flagForProfessional: boolean;
  flagReason?: string;
  /**
   * WHAT AN INSTRUMENT MEASURED, kept apart from `inputs` on purpose.
   *
   * `inputs` is a flat list of everything that did or did not move the score,
   * and a screen rendering it cannot tell a slider from a sensor. This is the
   * measured half on its own, each entry carrying the instrument that took it
   * and the day that instrument attributes it to — so a screen can badge it
   * MEASURED and print the date, and the prompt builder can withhold the whole
   * block when it is not permitted to send it. Rule 5 needs a seam, and this
   * is the seam.
   */
  vitals: VitalReport[];
  /**
   * The parts of recovery no instrument could supply, in the athlete's words.
   *
   * Named rather than defaulted, the way readiness names the component it could
   * not compute. An empty list means every vital was available, NOT that vitals
   * were not consulted — `vitals` above says which.
   */
  missingVitals: string[];
}

/** One measured vital, with everything needed to render it honestly. */
export interface VitalReport {
  id: "sleepDuration" | "restingHeartRate";
  label: string;
  /** The figure in `unit`, or null when there is none. */
  value: number | null;
  unit: string;
  /** The instrument. Absent exactly when there is no figure. */
  source?: MeasuredSource;
  /** e.g. "your Oura ring". Absent exactly when there is no figure. */
  sourceLabel?: string;
  /** YYYY-MM-DD, the day the instrument attributes the reading to. */
  measuredOn?: string;
  /** "last night", "the night before last", "4 days ago". Never invented. */
  when?: string;
  /** Whether this reading moved the score, and if not, why not. */
  scored: boolean;
  /** Why there is no figure, or why a figure was not scored. */
  reason?: Unavailable;
  /** One sentence for the athlete. Always present. */
  note: string;
}

/**
 * The measured vitals, exactly as `tracking/sources/vitals.ts` resolves them.
 *
 * REPLACES the two bare `number | null` fields this interface used to carry.
 * They were never passed anything but `undefined` and `null`, and they could
 * not have been passed anything better: a bare number cannot say which
 * instrument took it, which night it belongs to, or whether the source was
 * asked at all. All three of those decide what this module is allowed to do
 * with the figure, so they travel with it now.
 */
export interface RecoveryVitals {
  /** Minutes actually asleep, per the instrument. Not time in bed. */
  sleep: MeasuredVital;
  /** Beats per minute. See `restingHeartRateBaseline` before scoring it. */
  restingHeartRate: MeasuredVital;
  /**
   * THE ATHLETE'S OWN RESTING HEART RATE, over a span of their own nights.
   *
   * Without this, a resting heart rate is a number this module is not entitled
   * to have an opinion about: 52 bpm is a rest day for one person and a red
   * week for another, and scoring it against population figures would be
   * inventing a measurement. With it, the honest question — "is this morning
   * above where you normally sit?" — becomes answerable, and the reading can
   * move the score.
   *
   * NOTHING SUPPLIES THIS TODAY, and the absence is reported rather than
   * papered over. It needs several of the athlete's own recent nights, and
   * there is no client-side store of them: `tracking/sources/oura.ts` refuses
   * to write health measurements to `localStorage` — "health measurements on a
   * shared device outliving a sign-out is a leak the consent does not cover" —
   * and the server's history rows have no range-read endpoint in the app. When
   * one exists, this is where its answer goes, and the scoring below already
   * works. Until then recovery says, in `missingVitals`, that it could not see
   * the baseline.
   */
  restingHeartRateBaseline?: {
    bpm: number;
    /** How many of the athlete's own nights it was built from. */
    fromNights: number;
    source: MeasuredSource;
  };
}

export interface RecoveryInputs {
  checkIn?: CheckIn;
  /**
   * What a ring or a phone store measured. Omit entirely when no source was
   * consulted — that is different from a source that answered with nothing,
   * and the two produce different sentences.
   */
  vitals?: RecoveryVitals;
  /**
   * The clock, for reading a vital's age. Only consulted when a vital carries
   * a `measuredOn`, so a caller that passes no vitals still gets a pure,
   * deterministic result from a function that read no clock. Pass an explicit
   * date wherever determinism matters.
   */
  now?: Date;
  recentLoad?: { acute: number | null; chronic: number | null };
  /**
   * Hours since the last hard session, or null when there has not been one.
   *
   * WHAT COUNTS AS HARD IS THE CALLER'S DECISION, and since the post-activity
   * debrief shipped it can be the ATHLETE'S: `coach/hooks.ts` takes the more
   * recent of its own proxy (600 m of ascent, or three hours moving) and any
   * session the athlete themselves rated at or above `HARD_EFFORT`.
   *
   * That is why this input is badged "estimated" rather than "measured"
   * wherever it renders, and why it is deliberately NOT in
   * `SELF_REPORTED_INPUTS`: the elapsed hours are arithmetic over a real
   * timestamp, so counting it toward `reportedCount` would overstate how many
   * sliders the athlete actually moved today. The classification behind it may
   * be theirs; the number is not a slider.
   */
  hardSessionHoursAgo?: number | null;
}

/* -------------------------------------------------------------------------- */
/* Weights and thresholds                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How much each input moves the score. The subjective report dominates on
 * purpose: it is the only signal that reflects the whole athlete, and the
 * device signals here are thin (one night, one ratio) rather than trends.
 */
const WEIGHTS = {
  energy: 0.24,
  soreness: 0.22,
  sleep: 0.14,
  stress: 0.1,
  motivation: 0.08,
  sleepDuration: 0.1,
  loadRatio: 0.07,
  hardSession: 0.05,
  /*
    Resting heart rate, and it is deliberately the smallest weight in the table.

    It applies ONLY against the athlete's own baseline (see
    `RecoveryVitals.restingHeartRateBaseline`); with no baseline the reading is
    carried, shown and not scored, and `missingVitals` says so. Even with one,
    a single morning's reading is a thin, noisy signal — a late meal, a warm
    room and a glass of wine all move it — so it nudges the number rather than
    deciding it. The check-in still dominates, which is the same argument the
    rest of this table rests on.
  */
  restingHeartRate: 0.06,
} as const;

/**
 * The inputs the athlete supplies themselves. Everything else in the model is
 * derived from recorded activity and must never stand in for a self-report.
 */
const SELF_REPORTED_INPUTS = new Set(["energy", "soreness", "sleep", "stress", "motivation"]);

const GOOD_AT = 70;
const MODERATE_AT = 45;

/** Reported values at or beyond these ends prompt a suggestion to get assessed. */
const SEVERE_ENERGY = CHECK_IN_MIN; // bottom of the scale
const SEVERE_SORENESS = CHECK_IN_MAX; // top of the scale

/** Sleep scoring ramp, in hours. Below the floor scores 0, at the ceiling 1. */
const SLEEP_FLOOR_H = 4;
const SLEEP_CEILING_H = 8;

/**
 * Acute:chronic load ratio. Up to this the week looks like a normal
 * progression; beyond it the recent week is well above the established
 * pattern and the score starts to fall.
 */
const LOAD_RATIO_NORMAL = 1.3;
const LOAD_RATIO_FLOOR = 2;

/** Hours after which a hard session no longer counts against readiness. */
const HARD_SESSION_CLEARED_H = 48;

/**
 * How old a measured vital may be and still move today's score.
 *
 * 1 means today or yesterday. Oura attributes a night to the day the person
 * woke up, so a reading dated today IS last night — and a reading dated
 * yesterday is what somebody gets when they have not opened the Oura app,
 * which is Oura's own documented freshness problem rather than a stale night.
 * Anything older is carried and shown with its date, and not scored: a
 * four-day-old resting heart rate presented as this morning's is exactly the
 * failure the `measuredOn` field exists to prevent.
 */
const VITAL_MAX_AGE_DAYS = 1;

/**
 * How far above their own baseline a resting heart rate has to sit before this
 * module scores the morning as zero.
 *
 * A JUDGEMENT, NOT A CLINICAL THRESHOLD, and it is written shallow on purpose:
 * the ramp starts at the baseline and reaches the floor 8 bpm above it, so the
 * whole of a plausible day-to-day wobble moves the figure a little and nothing
 * moves it a lot. ICEFALL is not entitled to tell anybody what an elevated
 * resting heart rate means about them, and the copy below never tries to —
 * it states the comparison and stops.
 *
 * A reading BELOW the baseline scores 1 and is not read as "better than
 * recovered". There is no honest reading of an unusually low morning from one
 * number, which is the same argument that stops long sleep scoring above
 * enough sleep.
 */
const RHR_ELEVATED_BPM = 8;

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

interface ScoredInput {
  id: string;
  label: string;
  /** The raw reported figure, in the unit named by the label. */
  value: number | null;
  reason?: Unavailable;
  /** 0..1 contribution. Null when this input could not be scored. */
  unit: number | null;
  weight: number;
  /**
   * WHERE THIS FIGURE CAME FROM, carried so a screen rendering the flat list
   * cannot draw a slider and a sensor the same way.
   *
   * `self-reported` the athlete's own opinion
   * `measured`      an instrument took it
   * `derived`       arithmetic over recorded sessions
   *
   * Defaulted rather than required only because the five check-in rows are
   * built in a loop above and are self-reported by construction.
   */
  kind?: "self-reported" | "measured" | "derived";
  source?: MeasuredSource;
  measuredOn?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Maps a reported CHECK_IN_MIN..CHECK_IN_MAX figure onto 0..1, better end = 1. */
function unitFor(raw: number, field: CheckInField): number | null {
  // A non-finite value means the slider never produced a reading. That is a
  // missing input, not a zero.
  if (!Number.isFinite(raw)) return null;
  // Out-of-range values are clamped rather than discarded: a slider that emits
  // 0 or 11 through rounding still tells us which end the athlete chose.
  const bounded = Math.min(CHECKIN_SCALE.max, Math.max(CHECKIN_SCALE.min, raw));
  const unit = (bounded - CHECKIN_SCALE.min) / (CHECKIN_SCALE.max - CHECKIN_SCALE.min);
  return HIGHER_IS_BETTER[field] ? unit : 1 - unit;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** British-English list joiner for the missing-input sentence. */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* -------------------------------------------------------------------------- */
/* Reading a vital's own time                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Local calendar key. Never `toISOString` — that shifts the day west of GMT,
 * and a sleep reading landing on the wrong calendar day is exactly the class of
 * bug this file is trying to prevent.
 */
function dayKey(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Whole days between two YYYY-MM-DD keys, or null if either is not one.
 *
 * Both are read at UTC noon so that neither a daylight-saving change nor a
 * timezone offset can round the difference to the wrong integer. Null for an
 * unparseable key, and null means "we do not know how old this is", which the
 * caller treats as unscoreable rather than as fresh.
 */
function ageInDays(measuredOn: string, today: string): number | null {
  const parse = (k: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    if (!m) return null;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    return Number.isNaN(t) ? null : t;
  };
  const a = parse(measuredOn);
  const b = parse(today);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How to say an age out loud, for a reading taken overnight.
 *
 * "Last night" is only ever said about a reading dated TODAY, because that is
 * what an overnight reading dated today is. Nothing here rounds a two-day-old
 * night up into last night, and a negative age — a reading dated in the future,
 * which a badly-set device clock can produce — is described as such rather than
 * silently accepted.
 */
function nightLabel(age: number): string {
  if (age < 0) return "dated in the future";
  if (age === 0) return "last night";
  if (age === 1) return "the night before last";
  return `${age} nights ago`;
}

/** A date an athlete can read, pinned to en-GB so it cannot follow the device. */
function readableDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

const REASON_TEXT: Record<Unavailable, string> = {
  "no-data": "no data",
  "not-connected": "not connected",
  "needs-permission": "permission not granted",
  "too-little-history": "too little history",
  "not-reported": "not reported",
};

/* -------------------------------------------------------------------------- */
/* Assessment                                                                  */
/* -------------------------------------------------------------------------- */

export function assessRecovery(args: RecoveryInputs): RecoveryAssessment {
  const { checkIn, vitals, recentLoad, hardSessionHoursAgo } = args;

  const inputs: ScoredInput[] = [];
  const vitalReports: VitalReport[] = [];
  const missingVitals: string[] = [];

  /* ---- Subjective check-in ------------------------------------------------ */

  for (const field of CHECKIN_FIELDS) {
    const raw = checkIn?.[field.id];
    const unit = typeof raw === "number" ? unitFor(raw, field.id) : null;
    inputs.push({
      id: field.id,
      label: field.label,
      value: unit === null ? null : Math.round(raw as number),
      reason: unit === null ? "not-reported" : undefined,
      unit,
      weight: WEIGHTS[field.id],
    });
  }

  /* ---- What an instrument measured ---------------------------------------- */

  /*
    READ THE VITAL'S OWN TIME BEFORE READING ITS VALUE.

    `freshness` returns three things and the order they are checked in is the
    design: is there a number at all, does it say which day it belongs to, and
    is that day recent enough to be about today. A reading that fails any of
    the three is carried forward with its date and its reason and is NOT
    scored. Nothing here falls back to "the most recent number we have".

    The clock is only read when a reading actually carries a date, so a caller
    that passes no vitals still gets the deterministic, clock-free function
    this module has always been.
  */
  const freshness = (v: MeasuredVital | undefined) => {
    if (!v || typeof v.value !== "number" || !Number.isFinite(v.value)) {
      return {
        value: null as number | null,
        // undefined means no instrument exists; null means one answered with
        // nothing. The caller decides which, from the source's own reason.
        reason: (v?.reason ?? (v?.value === null ? "no-data" : "not-connected")) as Unavailable,
        note: v?.note,
        measuredOn: v?.measuredOn,
        age: null as number | null,
        fresh: false,
      };
    }

    const today = dayKey(args.now ?? new Date());
    const age = v.measuredOn ? ageInDays(v.measuredOn, today) : null;

    return {
      value: v.value,
      reason: undefined as Unavailable | undefined,
      note: v.note,
      measuredOn: v.measuredOn,
      age,
      // No date is not "today". A reading whose own source could not say which
      // night it came from cannot be scored as this morning's.
      fresh: age !== null && age >= 0 && age <= VITAL_MAX_AGE_DAYS,
    };
  };

  const sourceOf = (v: MeasuredVital | undefined) => v?.source;
  const labelOf = (v: MeasuredVital | undefined) =>
    v?.source ? MEASURED_SOURCE_LABEL[v.source] : undefined;

  /* ---- Measured sleep ------------------------------------------------------ */

  /*
    THE SECOND SLEEP INPUT, AND IT IS NOT THE FIRST ONE.

    The check-in above already has a `sleep` field: the athlete's 1-to-5 opinion
    of how they slept. This is minutes an instrument counted. They are scored
    separately, weighted separately and labelled separately, and they are never
    reconciled — somebody can sleep seven measured hours and still have slept
    badly, and both facts belong in the answer.
  */
  const sleepV = vitals?.sleep;
  const sleep = freshness(sleepV);
  const sleepHours = sleep.value !== null && sleep.fresh ? sleep.value / 60 : null;

  inputs.push({
    id: "sleepDuration",
    label: "Sleep recorded (h)",
    value: sleep.value === null ? null : round1(sleep.value / 60),
    reason: sleep.reason ?? (sleep.fresh ? undefined : "no-data"),
    // Long sleep is not scored as better than enough sleep — there is no honest
    // reading of a ten-hour night from duration alone.
    unit:
      sleepHours === null
        ? null
        : clamp01((sleepHours - SLEEP_FLOOR_H) / (SLEEP_CEILING_H - SLEEP_FLOOR_H)),
    weight: WEIGHTS.sleepDuration,
    kind: "measured",
    source: sourceOf(sleepV),
    measuredOn: sleep.measuredOn,
  });

  vitalReports.push({
    id: "sleepDuration",
    label: "Sleep",
    value: sleep.value === null ? null : round1(sleep.value / 60),
    unit: "h",
    source: sleep.value === null ? undefined : sourceOf(sleepV),
    sourceLabel: sleep.value === null ? undefined : labelOf(sleepV),
    measuredOn: sleep.measuredOn,
    when: sleep.age === null ? undefined : nightLabel(sleep.age),
    scored: sleepHours !== null,
    reason: sleep.reason ?? (sleep.fresh ? undefined : "no-data"),
    note: vitalNote({
      what: "sleep",
      reading: sleep.value === null ? null : `${round1(sleep.value / 60)} h asleep`,
      fresh: sleep.fresh,
      age: sleep.age,
      measuredOn: sleep.measuredOn,
      source: sourceOf(sleepV),
      sourceLabel: labelOf(sleepV),
      sourceNote: sleep.note,
      scoredSentence:
        "Counted toward today's recovery. The sleep quality in your check-in is a separate figure and is counted separately — a measured night and how you felt about it are two different things, and ICEFALL does not average them.",
    }),
  });

  if (sleepHours === null) {
    missingVitals.push(
      sleep.value === null
        ? "how long you actually slept"
        : "a recent enough night to read — the sleep on record is older than last night",
    );
  }

  /* ---- Measured resting heart rate ----------------------------------------- */

  /*
    SCORED ONLY AGAINST THE ATHLETE'S OWN BASELINE.

    52 bpm is a rest day for one person and a red week for another. Without a
    baseline of their own nights this module has no question it can honestly
    ask of the number, so the number is carried, shown with its date, and left
    out of the arithmetic — and `missingVitals` says that the baseline, not the
    reading, is the part that is missing. That distinction matters: telling
    somebody wearing a ring that ICEFALL "has no resting heart rate" when it is
    looking straight at one would be false.
  */
  const rhrV = vitals?.restingHeartRate;
  const rhr = freshness(rhrV);
  const baseline = vitals?.restingHeartRateBaseline;
  const rhrValue = rhr.value === null ? null : Math.round(rhr.value);

  const rhrScoreable = rhr.value !== null && rhr.fresh && baseline !== undefined;
  const rhrUnit = rhrScoreable
    ? clamp01(1 - Math.max(0, (rhr.value as number) - baseline.bpm) / RHR_ELEVATED_BPM)
    : null;

  inputs.push({
    id: "restingHeartRate",
    label: "Resting heart rate (bpm)",
    value: rhrValue,
    reason: rhr.reason ?? (rhrScoreable ? undefined : "no-data"),
    unit: rhrUnit,
    // Weight follows the baseline. No baseline, no weight — and because
    // `scored` filters on `unit !== null` as well, a zero here can never leak
    // into the renormalised divisor.
    weight: rhrScoreable ? WEIGHTS.restingHeartRate : 0,
    kind: "measured",
    source: sourceOf(rhrV),
    measuredOn: rhr.measuredOn,
  });

  vitalReports.push({
    id: "restingHeartRate",
    label: "Resting heart rate",
    value: rhrValue,
    unit: "bpm",
    source: rhr.value === null ? undefined : sourceOf(rhrV),
    sourceLabel: rhr.value === null ? undefined : labelOf(rhrV),
    measuredOn: rhr.measuredOn,
    when: rhr.age === null ? undefined : nightLabel(rhr.age),
    scored: rhrScoreable,
    reason: rhr.reason ?? (rhrScoreable ? undefined : "no-data"),
    note: vitalNote({
      what: "resting heart rate",
      reading: rhrValue === null ? null : `${rhrValue} bpm`,
      fresh: rhr.fresh,
      age: rhr.age,
      measuredOn: rhr.measuredOn,
      source: sourceOf(rhrV),
      sourceLabel: labelOf(rhrV),
      sourceNote: rhr.note,
      noBaseline: rhr.value !== null && rhr.fresh && baseline === undefined,
      scoredSentence: baseline
        ? `Read against your own baseline of ${Math.round(baseline.bpm)} bpm, built from ${baseline.fromNights} of your own nights. ICEFALL states the comparison and stops there — what an elevated resting heart rate means about you is a question for a doctor.`
        : "",
    }),
  });

  if (rhr.value !== null && rhr.fresh && baseline === undefined) {
    missingVitals.push(
      "how today's resting heart rate compares with your own — ICEFALL holds no baseline of your nights to read it against",
    );
  } else if (rhr.value === null) {
    missingVitals.push("your resting heart rate");
  }

  /* ---- Training load ------------------------------------------------------ */

  const acute = recentLoad?.acute ?? null;
  const chronic = recentLoad?.chronic ?? null;
  // A ratio needs a chronic baseline. Without four weeks behind it the divisor
  // is either absent or so small that the ratio is noise, so it is reported as
  // insufficient history rather than computed.
  const haveRatio =
    acute !== null &&
    chronic !== null &&
    Number.isFinite(acute) &&
    Number.isFinite(chronic) &&
    chronic > 0;
  const ratio = haveRatio ? acute / chronic : null;
  inputs.push({
    id: "loadRatio",
    label: "Recent load vs normal",
    value: ratio === null ? null : round2(ratio),
    reason:
      ratio !== null ? undefined : recentLoad === undefined ? "no-data" : "too-little-history",
    unit:
      ratio === null
        ? null
        : ratio <= LOAD_RATIO_NORMAL
          ? 1
          : clamp01(1 - (ratio - LOAD_RATIO_NORMAL) / (LOAD_RATIO_FLOOR - LOAD_RATIO_NORMAL)),
    weight: WEIGHTS.loadRatio,
    kind: "derived",
  });

  /* ---- Time since the last hard session ----------------------------------- */

  // No recorded hard session is ambiguous — it can mean a genuinely easy
  // fortnight or simply that nothing was tracked — so it stays unavailable
  // rather than being read as "fully rested".
  const hardOk = typeof hardSessionHoursAgo === "number" && Number.isFinite(hardSessionHoursAgo);
  const hardHours = hardOk ? Math.max(0, hardSessionHoursAgo) : null;
  inputs.push({
    id: "hardSession",
    label: "Since last hard session (h)",
    value: hardHours === null ? null : Math.round(hardHours),
    reason: hardHours === null ? "no-data" : undefined,
    unit: hardHours === null ? null : clamp01(hardHours / HARD_SESSION_CLEARED_H),
    weight: WEIGHTS.hardSession,
    kind: "derived",
  });

  /* ---- Score -------------------------------------------------------------- */

  const scored = inputs.filter((i) => i.unit !== null && i.weight > 0);
  const totalWeight = scored.reduce((sum, i) => sum + i.weight, 0);

  // Recovery is a claim about how the athlete is, and only the athlete can
  // supply that. `loadRatio` and `hardSession` are derived from recorded
  // sessions and can modulate the number, but they cannot BE the number: with
  // no check-in they carry just 0.12 of weight, renormalise to 1, and emit a
  // confident "100 / Good" from silence.
  const selfReportedScored = scored.some((i) => SELF_REPORTED_INPUTS.has(i.id));
  const score: Score =
    totalWeight > 0 && selfReportedScored
      ? {
          value: Math.round(
            clamp01(
              scored.reduce((sum, i) => sum + (i.unit as number) * i.weight, 0) / totalWeight,
            ) * 100,
          ),
        }
      : { value: null, reason: "not-reported" };

  /** Which inputs actually came from the athlete, for honest downstream copy. */
  const reportedCount = scored.filter((i) => SELF_REPORTED_INPUTS.has(i.id)).length;

  /* ---- Professional referral --------------------------------------------- */

  // A suggestion to get something looked at, never an opinion on what it is.
  const energy = checkIn && Number.isFinite(checkIn.energy) ? checkIn.energy : null;
  const soreness = checkIn && Number.isFinite(checkIn.soreness) ? checkIn.soreness : null;

  let flagForProfessional = false;
  let flagReason: string | undefined;

  if (soreness !== null && soreness >= SEVERE_SORENESS) {
    flagForProfessional = true;
    flagReason =
      "You have reported soreness at the top of the scale. If it lasts beyond a few days, is sharp, or sits in one joint or tendon rather than across a muscle, arrange an assessment with a physiotherapist or doctor. ICEFALL cannot evaluate it.";
  } else if (energy !== null && energy <= SEVERE_ENERGY) {
    flagForProfessional = true;
    flagReason =
      "You have reported very low energy. If that continues for more than a few days, or comes with anything beyond ordinary training fatigue, speak to a doctor. ICEFALL cannot evaluate it.";
  } else if (
    energy !== null &&
    soreness !== null &&
    energy <= CHECK_IN_MIN + 1 &&
    soreness >= CHECK_IN_MAX - 1
  ) {
    flagForProfessional = true;
    flagReason =
      "Low energy and high soreness reported together. If both persist through a week of easy training, have it assessed by a doctor or physiotherapist.";
  }

  /* ---- Status ------------------------------------------------------------- */

  let status: RecoveryStatus;
  if (score.value === null) status = "unknown";
  else if (score.value >= GOOD_AT) status = "good";
  else if (score.value >= MODERATE_AT) status = "moderate";
  else status = "poor";

  // A single severe report can be outvoted by four good ones — the weighted
  // mean is still the honest number, so the score is left alone and the
  // guidance is capped instead. Nothing above "moderate" is offered while the
  // athlete is reporting something that warrants attention.
  if (flagForProfessional && status === "good") status = "moderate";

  /* ---- Copy --------------------------------------------------------------- */

  /* The terse "not counted" list, MINUS the two measured vitals. They are
     described properly in `missingVitals` — "how long you actually slept" says
     more than "sleep recorded (not connected)" — and a summary that stated the
     same absence twice in two registers read as a bug. */
  const missing = inputs.flatMap((i) =>
    i.value === null && i.reason && i.kind !== "measured"
      ? [`${i.label.replace(/ \(.*\)$/, "").toLowerCase()} (${REASON_TEXT[i.reason]})`]
      : [],
  );

  const summary = buildSummary({
    status,
    score,
    countedInputs: scored.length,
    missing,
    ratio,
    missingVitals,
    measuredAnything: vitalReports.some((v) => v.value !== null),
  });

  const recommendations = buildRecommendations({
    status,
    checkIn,
    sleepHours,
    ratio,
    hardHours,
    flagForProfessional,
    sleepWhen: sleep.age === null ? undefined : nightLabel(sleep.age),
    measuredAnything: vitalReports.some((v) => v.value !== null),
  });

  return {
    reportedCount,
    status,
    score,
    inputs: inputs.map(({ id, label, value, reason, kind, source, measuredOn, unit, weight }) => ({
      id,
      label,
      value,
      reason,
      kind: kind ?? "self-reported",
      source,
      measuredOn,
      // The same predicate `scored` above filters on, so the list a screen
      // renders and the set the score was computed from cannot disagree.
      counted: unit !== null && weight > 0,
    })),
    summary,
    recommendations,
    flagForProfessional,
    flagReason,
    vitals: vitalReports,
    missingVitals,
  };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One sentence about a measured vital, covering all four of its states.
 *
 * THE SENTENCE ALWAYS CARRIES THE DATE when there is a figure. That is the
 * whole point of the field: Oura's sleep reaches Oura's cloud only when the
 * person opens the Oura app, so "last night" can arrive a day late, and a
 * figure presented without the night it belongs to is a figure that will
 * eventually be read as this morning's when it is not.
 *
 * The absence sentence prefers the SOURCE'S OWN words. "Your Oura membership
 * has lapsed" and "no source connected" are both true, but only one of them
 * tells the person what to do, and narrowing twelve reasons into five is what
 * loses it — so `sourceNote` is carried all the way here and used first.
 */
function vitalNote(args: {
  what: string;
  /** The figure as it should be read aloud, unit included. Null when absent. */
  reading: string | null;
  fresh: boolean;
  age: number | null;
  measuredOn?: string;
  source?: MeasuredSource;
  sourceLabel?: string;
  sourceNote?: string;
  noBaseline?: boolean;
  scoredSentence: string;
}): string {
  const { what, reading, fresh, age, measuredOn, source, sourceLabel, sourceNote } = args;

  if (reading === null) {
    return sourceNote ?? `No ${what} measurement is available, and nothing has been assumed about it.`;
  }

  const by = sourceLabel ? `measured by ${sourceLabel}` : "measured";

  if (age === null || !measuredOn) {
    /* A reading whose source could not say which day it belongs to. Shown,
       never scored: the alternative is to assume it is today's, which is the
       one assumption this whole field exists to prevent. */
    return `${reading}, ${by}, but the source did not say which day it measured. Shown and not counted — a reading without its own date cannot be read as today's.`;
  }

  const stamp = `${nightLabel(age)} (${readableDate(measuredOn)})`;

  if (!fresh) {
    const ouraHint =
      source === "oura"
        ? " Oura's sleep only reaches Oura's cloud when you open the Oura app, so opening it usually brings the latest night across."
        : "";
    return `${reading}, ${by} ${stamp}. Shown and not counted: that is not last night.${ouraHint}`;
  }

  if (args.noBaseline) {
    return `${reading}, ${by} ${stamp}. Shown for context and not counted — without a baseline of your own nights there is no honest question to ask of a single reading. ${MEASURED_BASELINE_NOTE}`;
  }

  return `${reading}, ${by} ${stamp}. ${args.scoredSentence}`;
}

/** Said once, wherever a resting heart rate is shown without a baseline. */
const MEASURED_BASELINE_NOTE =
  "ICEFALL does not keep a history of your nights on this device, so it has none to compare against.";


/**
 * The summary sentence.
 *
 * NO MEASURED VITAL VALUE APPEARS IN THIS STRING, and that is deliberate rather
 * than an oversight. This is the one piece of recovery prose that leaves the
 * device: `coach/context.ts` writes it into the model's system prompt verbatim.
 * A figure a ring measured is subject to that instrument's own terms about what
 * may be sent to a model, so the figures live in the structured `vitals` list
 * where the prompt builder can withhold them as a block and a screen can render
 * them with their instrument and their date. See `coach/vitalsPolicy.ts`.
 *
 * What DOES appear here is the shape of the evidence — how many inputs were
 * counted, and what recovery could not see. Those are facts about ICEFALL's own
 * assessment, not readings.
 */
function buildSummary(args: {
  status: RecoveryStatus;
  score: Score;
  countedInputs: number;
  missing: string[];
  ratio: number | null;
  missingVitals: string[];
  /** True when at least one instrument gave a figure, scored or not. */
  measuredAnything: boolean;
}): string {
  const { status, score, countedInputs, missing, ratio, missingVitals, measuredAnything } = args;

  if (status === "unknown" || score.value === null) {
    /*
      Two different silences, and they must not share a sentence. With a ring
      connected there ARE health signals and the old copy — "no health signals
      are available" — would be a plain falsehood said to somebody looking at
      their own measured sleep on the same screen. What is still missing in
      that case is the athlete: recovery is a claim about how a person is, and
      only the person can supply that, which is why measured vitals alone never
      produce a score.
    */
    return measuredAnything
      ? "Nothing has been reported today, so recovery cannot be assessed. What a device measured is on this screen and is counted the moment you check in — but a night's sleep is a fact about the night, not an answer to how you are today, and only you can give that."
      : "Nothing has been reported today and no health signals are available, so recovery cannot be assessed. Complete the check-in and the coach will have something to work with.";
  }

  const opening =
    status === "good"
      ? "Recovery looks good."
      : status === "moderate"
        ? "Recovery is partial."
        : "Recovery is poor.";

  const body =
    status === "good"
      ? "Training as prescribed is reasonable today."
      : status === "moderate"
        ? "The session can go ahead, but hold it at the easier end of the prescription and reassess as you warm up."
        : "Today should be easy movement or full rest. Hard work on this reading costs more than it returns.";

  const parts = [
    `${opening} ${body}`,
    `Scored ${score.value} from ${countedInputs} ${countedInputs === 1 ? "input" : "inputs"}.`,
  ];

  if (missing.length) parts.push(`Not counted: ${joinList(missing)}.`);

  // Load is described, never diagnosed. "Higher than your normal pattern" is a
  // statement about the numbers; "overtrained" would be a statement about the
  // athlete, which this module is not entitled to make.
  if (ratio !== null && ratio > LOAD_RATIO_NORMAL) {
    parts.push(
      `Your recent training load is significantly higher than your normal pattern (${round2(ratio)}× your four-week average).`,
    );
  }

  /*
    NAME THE PART THAT IS MISSING, the way readiness names the component it
    could not compute. "Recovery could not see X" is a different and more
    useful sentence than a score that quietly renormalised over what was left,
    and it is the only way an athlete can tell a thin assessment from a full one.
  */
  if (missingVitals.length) {
    parts.push(`Recovery could not see ${joinList(missingVitals)}.`);
  }

  return parts.join(" ");
}

function buildRecommendations(args: {
  status: RecoveryStatus;
  checkIn?: CheckIn;
  sleepHours: number | null;
  ratio: number | null;
  hardHours: number | null;
  flagForProfessional: boolean;
  /** "last night" / "the night before last" — the night the figure belongs to. */
  sleepWhen?: string;
  /** True when some instrument gave a figure, so the copy stops asking for one. */
  measuredAnything: boolean;
}): string[] {
  const { status, checkIn, sleepHours, ratio, hardHours, flagForProfessional, sleepWhen } = args;
  const out: string[] = [];

  if (status === "unknown") {
    out.push("Complete today's check-in — five sliders, and the coach can shape the session.");
    if (!args.measuredAnything) {
      // Only said when nothing is connected. Telling somebody wearing a ring to
      // connect a device is the same failure `DataState.tsx` calls out for
      // `needs-permission`: it sends them to fix something that is not broken.
      out.push(
        "Connect a ring, Apple Health or Health Connect if you would rather sleep and resting heart rate filled themselves in.",
      );
    }
    return out;
  }

  if (status === "poor") {
    out.push("Make today easy movement or full rest. Nothing that leaves you breathing hard.");
    out.push(
      "Move the next hard session later in the week rather than compressing it. A missed session is not a debt to repay.",
    );
    out.push(
      "Leave committing objectives alone on a reading like this — glaciated ground, a remote approach, or anything with a fixed turnaround deserves a better day.",
    );
  } else if (status === "moderate") {
    out.push("Train as planned, but keep the intensity at the lower end of the prescription.");
    out.push(
      "Reassess before any long mountain day. If energy has not returned by the start, take the shorter option.",
    );
  } else {
    out.push("Proceed with the session as prescribed.");
    out.push("Start the first climb conservatively and let the pace come to you.");
  }

  if (sleepHours !== null && sleepHours < 6) {
    /* The night is named. "Sleep came to 4 h" beside a reading that belongs to
       the night before last is a true figure attached to the wrong night, which
       is the failure `measuredOn` exists to stop. */
    out.push(
      `Measured sleep came to ${round1(sleepHours)} h${sleepWhen ? ` ${sleepWhen}` : ""}. Prioritise it tonight ahead of any other intervention, and keep today's intensity down.`,
    );
  } else if (checkIn && Number.isFinite(checkIn.sleep) && checkIn.sleep <= CHECK_IN_MIN + 1) {
    out.push(
      "Sleep quality was reported as poor. Prioritise it tonight ahead of any other intervention.",
    );
  }

  if (ratio !== null && ratio > LOAD_RATIO_NORMAL) {
    out.push("Hold volume flat this week rather than adding to it, and keep one full rest day.");
  }

  if (hardHours !== null && hardHours < 24) {
    out.push(
      `Your last hard session was ${Math.round(hardHours)} h ago. Leave a full day between high-intensity efforts.`,
    );
  }

  if (checkIn && Number.isFinite(checkIn.stress) && checkIn.stress >= CHECK_IN_MAX - 1) {
    out.push(
      "Stress is high. Choose a session that asks nothing of your judgement: known route, known distance, no decisions on the hill.",
    );
  }

  if (flagForProfessional) {
    out.push(
      "Have this looked at by a physiotherapist or doctor rather than training through it. ICEFALL is not a medical service.",
    );
  }

  return out;
}
