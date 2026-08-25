import { CHECK_IN_MAX, CHECK_IN_MIN } from "@/coach/types";
import type { CheckIn, Score, Unavailable } from "@/coach/types";

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
 */

/* -------------------------------------------------------------------------- */
/* Check-in definition                                                         */
/* -------------------------------------------------------------------------- */

export type CheckInField = keyof Omit<CheckIn, "date">;

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
  /** Which inputs were actually available — the UI shows this. */
  inputs: { id: string; label: string; value: number | null; reason?: Unavailable }[];
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
}

export interface RecoveryInputs {
  checkIn?: CheckIn;
  restingHeartRateBpm?: number | null;
  sleepMinutes?: number | null;
  recentLoad?: { acute: number | null; chronic: number | null };
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
  const { checkIn, restingHeartRateBpm, sleepMinutes, recentLoad, hardSessionHoursAgo } = args;

  const inputs: ScoredInput[] = [];

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

  /* ---- Recorded sleep ----------------------------------------------------- */

  // `undefined` means no health source is wired up at all; an explicit `null`
  // means the source was asked and had nothing for last night. The UI says
  // something different in each case, so the distinction is preserved.
  const sleepReason: Unavailable | undefined =
    sleepMinutes === undefined
      ? "not-connected"
      : sleepMinutes === null || !Number.isFinite(sleepMinutes)
        ? "no-data"
        : undefined;
  const sleepHours = sleepReason === undefined ? (sleepMinutes as number) / 60 : null;
  inputs.push({
    id: "sleepDuration",
    label: "Sleep recorded (h)",
    value: sleepHours === null ? null : round1(sleepHours),
    reason: sleepReason,
    // Long sleep is not scored as better than enough sleep — there is no honest
    // reading of a ten-hour night from duration alone.
    unit:
      sleepHours === null
        ? null
        : clamp01((sleepHours - SLEEP_FLOOR_H) / (SLEEP_CEILING_H - SLEEP_FLOOR_H)),
    weight: WEIGHTS.sleepDuration,
  });

  /* ---- Resting heart rate ------------------------------------------------- */

  // Shown, never scored. A single resting heart rate means nothing without the
  // athlete's own baseline — 52 bpm is a rest day for one person and a red week
  // for another — and this function is not given one. Folding it into the score
  // against population figures would be inventing a measurement.
  const rhrReason: Unavailable | undefined =
    restingHeartRateBpm === undefined
      ? "not-connected"
      : restingHeartRateBpm === null || !Number.isFinite(restingHeartRateBpm)
        ? "no-data"
        : undefined;
  const rhrValue = rhrReason === undefined ? Math.round(restingHeartRateBpm as number) : null;
  inputs.push({
    id: "restingHeartRate",
    label: "Resting heart rate (bpm)",
    value: rhrValue,
    reason: rhrReason,
    unit: null,
    weight: 0,
  });

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

  const missing = inputs.flatMap((i) =>
    i.value === null && i.reason
      ? [`${i.label.replace(/ \(.*\)$/, "").toLowerCase()} (${REASON_TEXT[i.reason]})`]
      : [],
  );

  const summary = buildSummary({
    status,
    score,
    countedInputs: scored.length,
    missing,
    ratio,
    rhrValue,
  });

  const recommendations = buildRecommendations({
    status,
    checkIn,
    sleepHours,
    ratio,
    hardHours,
    flagForProfessional,
  });

  return {
    reportedCount,
    status,
    score,
    inputs: inputs.map(({ id, label, value, reason }) => ({ id, label, value, reason })),
    summary,
    recommendations,
    flagForProfessional,
    flagReason,
  };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

function buildSummary(args: {
  status: RecoveryStatus;
  score: Score;
  countedInputs: number;
  missing: string[];
  ratio: number | null;
  rhrValue: number | null;
}): string {
  const { status, score, countedInputs, missing, ratio, rhrValue } = args;

  if (status === "unknown" || score.value === null) {
    return "Nothing has been reported today and no health signals are available, so recovery cannot be assessed. Complete the check-in and the coach will have something to work with.";
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

  if (rhrValue !== null) {
    parts.push(
      `Resting heart rate today is ${rhrValue} bpm, shown for context only — without your own baseline a single reading is not scored.`,
    );
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
}): string[] {
  const { status, checkIn, sleepHours, ratio, hardHours, flagForProfessional } = args;
  const out: string[] = [];

  if (status === "unknown") {
    out.push("Complete today's check-in — five sliders, and the coach can shape the session.");
    out.push(
      "Connect Apple Health or Health Connect if you would rather sleep and resting heart rate filled themselves in.",
    );
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
    out.push(
      `Sleep came to ${round1(sleepHours)} h. Prioritise it tonight ahead of any other intervention, and keep today's intensity down.`,
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
