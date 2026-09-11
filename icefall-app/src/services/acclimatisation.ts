/**
 * ASCENT PACE — how fast ICEFALL is willing to describe going up, and the one
 * place a declared history of altitude illness changes anything.
 *
 * WHY THIS FILE EXISTS. The questionnaire has asked "have you had altitude
 * sickness?" since the flow was written. Until now the answer reached
 * `coach/context.ts`, became one sentence in the model's system prompt, and
 * stopped. Every acclimatisation string the app showed — on the objective
 * readiness screen, in the demand profile, on a mountain page — came from
 * `assessPeak`, which knows an elevation and a latitude and nothing about the
 * person reading it. So the step's own subtitle promised a constraint that no
 * code applied, and a prompt line invited the model to invent the adjustment
 * the app had not made. Both are the kind of claim this app may not make.
 *
 * WHAT IT IS NOT — AND THIS IS THE IMPORTANT PARAGRAPH.
 *
 * This is NOT `coach/safety.ts` and must never be asked to stand in for it.
 * Those two answer different questions and they are not interchangeable:
 *
 *   - `safety.ts` answers a SYMPTOM, happening NOW. Someone is at 5,200 m with
 *     a headache and ataxia. It runs first, in plain code, offline, before any
 *     model sees the question, and it says "go down". Nothing in this file runs
 *     before it, replaces it, or gives it a reason not to fire.
 *   - this file answers a PLANNING question, weeks or months out, about an
 *     itinerary nobody has walked yet. It is arithmetic on a schedule.
 *
 * A slower schedule is a PLANNING AID. It does not make a mountain safe, it is
 * not a prediction that the athlete will be well, and it is not a substitute
 * for descending. Every string below that narrows a pace carries that caveat,
 * and `ASCENT_PACE_CAVEAT` is exported so no surface can print the narrowed
 * figure without the sentence being to hand.
 *
 * WHAT THE NUMBERS REST ON. The published consensus for ascent above roughly
 * 3,000 m is a ceiling on how much SLEEPING altitude is gained per night, plus
 * an extra night at the same altitude at intervals. That same guidance treats a
 * previous episode of altitude illness as a reason to take the conservative end
 * of the range rather than the middle of it — which is all this file does. It
 * does not diagnose, it does not predict recurrence, and it does not decide
 * anything about medication; a history of HAPE or HACE sends the athlete to a
 * doctor, in words, rather than to a number invented here.
 *
 * ONE-DIRECTIONAL, ON PURPOSE. A history can only make the schedule SLOWER.
 * "Never had any trouble" is recorded and acknowledged, and it buys nothing:
 * having been well once is not evidence about the next trip, and an app that
 * let a self-declared good run raise a ceiling would be doing the exact thing
 * this file exists to avoid. `narrowed` is therefore never true for "never",
 * and the figures for "never" are identical to the figures for silence.
 *
 * LAYERING. This module imports nothing, which is deliberate: `peakAssessment`
 * (services) and `mountainReadiness` (coach) both read it, and the base wording
 * lives here exactly once so the two surfaces cannot drift into describing
 * different schedules for the same mountain.
 */

/** The elevation above which sleeping gain is what the schedule is counted in. */
export const ACCLIMATISATION_FLOOR_M = 3000;

/** Below this, no staged schedule is described at all and this module is silent. */
export const ASCENT_PACE_RELEVANT_M = 3500;

/** Above this, the itinerary IS the trip — weeks of rotations rather than a walk-in. */
export const STAGED_ITINERARY_M = 5500;

/**
 * The four answers the questionnaire offers. `"unknown"` is "never been high
 * enough to know" and is NOT `"never"` — the step says so in those words, and
 * treating the two alike would turn an absence of evidence into a clean record.
 */
export type AltitudeIllnessHistory = "never" | "mild" | "serious" | "unknown";

const HISTORIES: readonly AltitudeIllnessHistory[] = ["never", "mild", "serious", "unknown"];

/**
 * The stored answer is `string | null` all the way from the questionnaire, so
 * every reader narrows here rather than trusting the string. An answer this
 * module does not recognise becomes `null` — "not stated" — because guessing at
 * an unrecognised value is how a stale id silently turns into a fast schedule.
 */
export function asAltitudeIllnessHistory(
  raw: string | null | undefined,
): AltitudeIllnessHistory | null {
  return typeof raw === "string" && (HISTORIES as readonly string[]).includes(raw)
    ? (raw as AltitudeIllnessHistory)
    : null;
}

export interface AscentPace {
  /** Ceiling on sleeping-altitude gain per night above `ACCLIMATISATION_FLOOR_M`. */
  maxSleepGainM: number;
  /** An extra night at the same altitude for roughly every this many metres gained. */
  restNightEveryM: number;
  /** The answer these figures were computed from; null when none was given. */
  history: AltitudeIllnessHistory | null;
  /**
   * True ONLY when a declared history made the two figures above smaller than
   * the elevation-only default. Never true for "never" or "unknown".
   */
  narrowed: boolean;
  /** The schedule, in words. Safe to print on its own. */
  guidance: string;
  /**
   * Non-null exactly when `narrowed` is true. A surface that shows a narrowed
   * schedule shows this too — the whole point of the field is that the caveat
   * travels with the figure rather than being remembered at each call site.
   */
  caveat: string | null;
  /**
   * Non-null only for a reported serious episode. Points at a doctor, which is
   * the only honest destination for HAPE or HACE — ICEFALL has no view on
   * whether it will happen again and will not pretend to one.
   */
  medicalNote: string | null;
}

export const ASCENT_PACE_CAVEAT =
  "A slower schedule is a planning aid, not protection. It does not make a mountain safe and it is not a prediction that you will be well — altitude illness is a medical matter, and descending at the first sign that something is wrong is the only response that works.";

const MEDICAL_NOTE =
  "You have reported a serious episode. Build the itinerary with a doctor as well as your guide or operator; ICEFALL has no view on whether it will happen again and will not offer one.";

/** How far each answer moves the two figures. Silence and "never" share a row. */
const PACE: Record<"default" | "mild" | "serious", { gain: number; rest: number }> = {
  // The published range for a staged ascent is 300–500 m a night; the default
  // keeps the whole range and the wording the app has always used.
  default: { gain: 500, rest: 1000 },
  mild: { gain: 400, rest: 800 },
  serious: { gain: 300, rest: 600 },
};

const fmt = (m: number) => m.toLocaleString("en-GB");

/**
 * The acclimatisation schedule for a peak, narrowed by a declared history.
 *
 * Returns `null` below `ASCENT_PACE_RELEVANT_M`: on a 2,000 m hill there is no
 * schedule to make conservative, and printing one would imply the mountain asks
 * a question it does not ask. A history changes nothing there, and saying so by
 * returning nothing is better than saying it in a sentence.
 *
 * @param history Pass `null` for "not stated". Pass the athlete's answer only
 *                where the athlete is the person reading the result — this is a
 *                health disclosure and it does not belong on a shared card.
 */
export function ascentPaceFor(
  elevationM: number,
  history: AltitudeIllnessHistory | null,
): AscentPace | null {
  if (!Number.isFinite(elevationM) || elevationM < ASCENT_PACE_RELEVANT_M) return null;

  // "never" and "unknown" take the default row. See the header: a history may
  // only slow this down, so the only two answers that move anything are the two
  // that report an episode.
  const key = history === "mild" ? "mild" : history === "serious" ? "serious" : "default";
  const { gain, rest } = PACE[key];
  const narrowed = key !== "default";
  const staged = elevationM >= STAGED_ITINERARY_M;

  const base = staged
    ? `Plan several weeks of staged acclimatisation, gaining no more than 300–500 m of sleeping altitude per night above ${fmt(ACCLIMATISATION_FLOOR_M)} m.`
    : `Sleep at altitude beforehand if you can. Above ${fmt(ACCLIMATISATION_FLOOR_M)} m, climb high and sleep low.`;

  const why =
    "ICEFALL asks for this because you have reported altitude illness before, and standard ascent guidance treats a previous episode as a reason to go slower.";

  const narrowedText = staged
    ? `Plan several weeks of staged acclimatisation, and take the conservative end of the usual guidance rather than the middle of it: no more than ${fmt(gain)} m of sleeping altitude gained per night above ${fmt(ACCLIMATISATION_FLOOR_M)} m, with an extra night at the same altitude for roughly every ${fmt(rest)} m gained. ${why}`
    : `Sleep at altitude beforehand if you can. Above ${fmt(ACCLIMATISATION_FLOOR_M)} m, climb high and sleep low, and gain no more than ${fmt(gain)} m of sleeping altitude a night rather than taking the hut or the road-head in one jump. ${why}`;

  return {
    maxSleepGainM: gain,
    restNightEveryM: rest,
    history,
    narrowed,
    guidance: narrowed ? narrowedText : base,
    caveat: narrowed ? ASCENT_PACE_CAVEAT : null,
    medicalNote: history === "serious" ? MEDICAL_NOTE : null,
  };
}

/**
 * One line for the coach's system prompt, so the model DESCRIBES the schedule
 * the app computed instead of inventing an adjustment of its own — the whole
 * reason a prompt line is not a wiring.
 *
 * Returns "" when there is nothing to say, so the caller can push it blindly.
 */
export function describeAscentPaceForPrompt(
  elevationM: number | null,
  history: AltitudeIllnessHistory | null,
): string {
  if (history === null) return "";

  if (history === "unknown") {
    return "They have never been high enough to know whether altitude illness affects them. That is not the same as never having had it — do not read it as a clean record, and do not infer tolerance from it.";
  }

  if (history === "never") {
    return "They report having been to altitude without trouble. This changes NOTHING about the ascent rate ICEFALL will describe: having been well once is not evidence about the next trip, and you must not suggest a faster schedule because of it.";
  }

  const pace = elevationM === null ? null : ascentPaceFor(elevationM, history);

  if (pace === null || !pace.narrowed) {
    // Either no objective is set or it sits below the elevation at which a
    // staged schedule exists. The history is still stated, because the model
    // must not talk about going up fast on the strength of silence.
    return `They have reported ${history} altitude illness. ICEFALL has no staged schedule to narrow for the objective on file, so give no ascent rate of your own — say that the itinerary is built with their guide or operator.`;
  }

  return `They have reported ${history} altitude illness, so ICEFALL has narrowed the ascent schedule for their objective to no more than ${fmt(pace.maxSleepGainM)} m of sleeping altitude a night above ${fmt(ACCLIMATISATION_FLOOR_M)} m, with an extra night for roughly every ${fmt(pace.restNightEveryM)} m gained. Quote those figures rather than any of your own, never suggest anything faster, and say plainly that a slower schedule is a planning aid and not protection.`;
}
