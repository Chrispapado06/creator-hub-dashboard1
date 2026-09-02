import { kcalFor, metFor, type EnergyModel } from "@/tracking/energy";
import { ENERGY_TOLERANCE_MET } from "@/tracking/energy.fixture";
import type { TrainingDay, TrainingFocus } from "@/types";

/**
 * What today costs — a floor with a stated width.
 *
 * WHAT THIS MODULE RETURNS, IN ORDER OF WHAT MATTERS
 *
 *   1. A FLOOR, NOT A BUDGET. `total` is a range with a low and a high, and the
 *      low end is the figure the athlete is meant to clear. There is no maximum
 *      anywhere in this API. Nothing here can be spent down, nothing can be
 *      exceeded, and `stillToCover` is typed so that "over" has no
 *      representation — see the type, which is the enforcement.
 *
 *   2. NO BODY COMPOSITION. This module takes no body-fat input, no target
 *      weight, no goal weight, and it never will. It is not a weight-management
 *      calculation with the labels changed. `coach/nutrition.ts` states the
 *      boundary in prose; this file states it in the function signature, which
 *      is the harder place to erode.
 *
 *   3. WHY MIFFLIN-ST JEOR AND NOT HARRIS-BENEDICT. ICEFALL holds no sex for
 *      anyone, and the athlete may decline to give one. In Mifflin-St Jeor sex
 *      enters as a CONSTANT INTERCEPT — +5 kcal for men, −161 for women — so
 *      not knowing it costs exactly 166 kcal of width, the same 166 for every
 *      athlete, and that is a gap this module can state out loud and widen the
 *      band by. Harris-Benedict's sex difference is spread across the weight,
 *      height and age coefficients, so it varies with the individual and cannot
 *      be bounded by one stated constant. An unknown that can be named is worth
 *      more than a slightly better fit that cannot.
 *
 *   4. MEASURED ZERO IS NOT MISSING. Every figure that could be absent is
 *      `null`, never `0`, and nothing here uses `?? 0` to make arithmetic
 *      convenient. A rest day's session term is `none-prescribed` — a real,
 *      measured nothing — and it is a different value from `unavailable`, which
 *      is a session this module could not cost. The UI is expected to print
 *      four different words for those four different facts.
 *
 *   5. NO MIDPOINTS. Where the answer is a range this returns both bounds and
 *      never their average. A midpoint rendered as a point is how a range
 *      becomes a target.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 *   - No macronutrient targets. Grams belong to `coach/nutrition.ts`, which
 *     derives them from the session rather than from a daily total.
 *   - No focus→MET lookup table. The session cost comes from the plan's own
 *     distance, ascent and duration through the ACSM equations in
 *     `tracking/energy.ts`. A table of "long-mountain = 7 MET" would be a
 *     fabricated coefficient set wearing the costume of the published one that
 *     `tracking/energy.ts` was written to abolish.
 *   - No network, no clock beyond the current year, no persistence. Pure
 *     functions, so the screen can call this at 4 a.m. in a hut with no signal.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Used ONLY as the intercept term of a published resting-energy equation.
 *
 * It is not a profile field, it is not shown to anyone, and nothing else in the
 * app branches on it. `undefined` means unknown or declined, and both are
 * handled by spanning the two answers rather than by picking one.
 */
export type Sex = "female" | "male";

/**
 * How much of the day, outside training, is spent on the feet.
 *
 * This is the single largest thing ICEFALL does not measure. A phone in a pocket
 * is not a pedometer this app reads, so the only honest sources are the
 * athlete's own answer or a wide band that covers every answer.
 */
export type DailyMovement = "seated" | "on-feet" | "physical";

/** A range. Both bounds, always. There is deliberately no `mid`. */
export interface Band {
  low: number;
  high: number;
}

export type RestingEnergy =
  | {
      kind: "band";
      band: Band;
      /** Which published equation produced it, so the drawer can cite it. */
      equation: "mifflin" | "schofield" | "owen";
      /** False when the band spans both sexes because none was given. */
      sexKnown: boolean;
      /** Printable as-is. Names the equation and the inputs it actually used. */
      sentence: string;
    }
  | {
      kind: "unavailable";
      reason: "no-body-mass" | "implausible-body-mass";
      /** Printable as-is. The UI must never translate `reason` itself. */
      sentence: string;
    };

export type EverydayEnergy =
  | {
      kind: "band";
      band: Band;
      /** True when the athlete answered. False when the band covers every answer. */
      answered: boolean;
      sentence: string;
    }
  | { kind: "unavailable"; reason: "no-resting-energy"; sentence: string };

export type SessionCost =
  | {
      kind: "band";
      band: Band;
      model: "running" | "walking";
      distanceM: number;
      gainM: number;
      durationMin: number;
      bodyMassKg: number;
      packKg: number;
      source: "planned";
      sentence: string;
    }
  | {
      kind: "recorded";
      /** Net of resting energy over the same span. Rounded for display only. */
      kcal: number;
      movingSec: number;
      /** The mass the recorder used, when every entry agreed on one. */
      forKg: number | null;
      /** True when a figure recorded for a different mass was rescaled. */
      rescaled: boolean;
      /** Recordings today whose calorie figure was null, so this total is low. */
      unestimated: number;
      sentence: string;
    }
  /** A real, prescribed nothing. Not the same value as `unavailable`. */
  | { kind: "none-prescribed"; rowLabel: "None"; sentence: string }
  /** Duration-only session: the plan gives no distance, so ACSM cannot cost it. */
  | {
      kind: "not-costable";
      rowLabel: "Not counted";
      title: string;
      durationMin: number | null;
      sentence: string;
    }
  /** The briefing replaced today's session; what replaced it carries no numbers. */
  | { kind: "eased"; rowLabel: "Withdrawn"; sentence: string }
  | {
      kind: "unavailable";
      rowLabel: "—";
      reason: "no-plan-day" | "no-body-mass" | "implausible-body-mass";
      sentence: string;
    };

export interface DailyEnergy {
  resting: RestingEnergy;
  everyday: EverydayEnergy;
  session: SessionCost;
  /**
   * The day's range, rounded outward to 50 kcal.
   *
   * Null whenever any contributor is unavailable — never partial. Half a range
   * is not a smaller range, it is a wrong one, and an athlete cannot tell the
   * difference by looking at it.
   */
  total: Band | null;
  /**
   * The same range, unrounded. For arithmetic that compares two scenarios —
   * `narrowingWorth` uses it so a 50 kcal rounding step cannot masquerade as a
   * real change. NEVER RENDER THIS. The figure on screen is `total`.
   */
  totalRaw: Band | null;
  /**
   * What the range does not contain, as sentences. Named rather than folded
   * into a multiplier: an athlete can argue with a sentence and cannot argue
   * with a coefficient they never saw.
   */
  excluded: string[];
  /** How the figure was arrived at, as sentences, for the provenance drawer. */
  provenance: string[];
  /** The inputs as this module resolved them. Kept so scenarios can be re-run. */
  source: DailyEnergyInput;
}

/**
 * One recorded activity from today.
 *
 * Map from `useRecordedActivities()` — NOT from `useActivityFeed()`, which drops
 * `caloriesForKg` on the way through `adapt.ts` and would leave this module
 * unable to tell whether a figure was computed for this athlete or for the 72 kg
 * stranger the recorder used to default to. Filter out `simulated` entries
 * before passing them: a demo activity must never move a real figure.
 */
export interface RecordedSessionInput {
  /** Null when the recorder could not estimate it. Null is not zero. */
  kcal: number | null;
  movingSec: number;
  /** `caloriesForKg` — the mass the figure was computed with, if it is known. */
  forKg?: number | null;
}

export interface DailyEnergyInput {
  /**
   * `settings.bodyMassKgSet` — the answer the athlete actually gave.
   *
   * NEVER pass `bodyMassKg`. That field defaults to 72 for everyone and is
   * indistinguishable from a real answer once it is read, which is precisely how
   * the app came to show every athlete a stranger's numbers.
   */
  bodyMassKgSet: number | null;
  heightCm?: number | null;
  birthYear?: number | null;
  /** Undefined when unknown or declined. Both widen the band; neither guesses. */
  sex?: Sex | null;
  movement?: DailyMovement | null;
  /** The PLANNED day. */
  day?: TrainingDay | null;
  /** `briefing.training.focus` when the briefing replaced the planned session. */
  easedFocus?: TrainingFocus | null;
  /** Carried load. Moves the work term only — a pack has no resting metabolism. */
  packKg?: number | null;
  /** Today's real recordings. Empty or omitted means nothing recorded yet. */
  recorded?: RecordedSessionInput[];
  /** Injectable for tests. Only the calendar year is read, for age. */
  now?: Date;
}

/**
 * How far below the floor the athlete is, or that they are inside the range.
 *
 * THIS TYPE IS THE ENFORCEMENT. There is no variant for "over", no second
 * remainder measured against the top of the range, and no numeric field that can
 * hold a negative. A later screen cannot render a surplus because this module
 * cannot express one, and a later engineer cannot add one without deleting this
 * comment first.
 */
export type StillToCover = { kcal: number } | "inside-range";

/* -------------------------------------------------------------------------- */
/* Thresholds — every one of them says what it is NOT claiming                 */
/* -------------------------------------------------------------------------- */

/**
 * Masses outside this are treated as unknown rather than used.
 *
 * The same bounds `coach/nutrition.ts` uses, deliberately: a profile typo must
 * not become a calorie figure on one screen and a refusal on the other.
 */
const MIN_PLAUSIBLE_MASS_KG = 30;
const MAX_PLAUSIBLE_MASS_KG = 250;

/**
 * Heights outside this are treated as absent, dropping to the weight-only
 * equation rather than multiplying a typo by 6.25. Not a claim about who can
 * use the app — a 100 cm floor excludes nobody who can carry a pack uphill.
 */
const MIN_PLAUSIBLE_HEIGHT_CM = 100;
const MAX_PLAUSIBLE_HEIGHT_CM = 250;

/**
 * Ages outside this are treated as absent. The equations below are fitted to
 * adults and adolescents; outside the range they are extrapolation, and an
 * extrapolated resting figure presented in the same typeface as a fitted one is
 * the fabrication this app exists to avoid.
 */
const MIN_AGE_YEARS = 10;
const MAX_AGE_YEARS = 100;

/**
 * Packs above this are ignored as a typo. Not a limit on what anyone carries —
 * expedition loads do go past it — but 60 kg is where a mis-keyed field becomes
 * more likely than a real load, and the cost of believing it is a session term
 * inflated by most of its own size.
 */
const MAX_PLAUSIBLE_PACK_KG = 60;

/**
 * How far the individual sits from the equation.
 *
 * Predictive resting-energy equations land within ±10% of measured resting
 * energy for roughly two people in three (Frankenfield D, Roth-Yousey L,
 * Compher C. J Am Diet Assoc 2005;105:775-89, reviewing Mifflin-St Jeor against
 * indirect calorimetry). So this is NOT a guarantee that the athlete is inside
 * the band. It is the width at which the band stops being a single number
 * pretending to have been measured on this person. One athlete in three sits
 * outside it, and the copy on the screen should not imply otherwise.
 */
const RMR_INDIVIDUAL_SPREAD = 0.1;

/**
 * Resting and everyday rows round outward to 25 kcal; the day's range rounds
 * outward to 50.
 *
 * Outward in both directions, always — rounding a low bound up would raise a
 * floor the athlete is being asked to clear, on nothing but arithmetic
 * convenience. The rows and the range are rounded independently, so the rows do
 * not always add to the range; the provenance says so rather than quietly
 * fudging one to match. The alternative — rounding each row outward and then
 * summing — would add up to 150 kcal of pure rounding to the width and present
 * it as uncertainty about the athlete.
 */
const ROW_STEP_KCAL = 25;
const RANGE_STEP_KCAL = 50;

/**
 * The floor under a moving session's MET.
 *
 * 1 MET is rest by definition, so a session cannot cost less than lying still.
 * After the resting share is subtracted this floor becomes zero added energy —
 * which is the correct answer for a session so slow it is indistinguishable from
 * not having gone, not a claim that the session did not happen.
 */
const MIN_MOVING_MET = 1;

/**
 * Which ACSM equation an ICEFALL training focus maps to.
 *
 * This is NOT a MET table. It selects a published equation and nothing more; the
 * number still comes from the plan's own speed and gradient. `none` means the
 * equations do not describe that session, so it is excluded from the range and
 * said to be excluded — never estimated by a stand-in.
 */
const MODEL_FOR_FOCUS: Record<TrainingFocus, EnergyModel> = {
  endurance: "running",
  intervals: "running",
  "long-mountain": "walking",
  recovery: "walking",
  // Strength and technical work are not ambulatory. The ACSM running and walking
  // equations describe running and walking; applying them to a session of split
  // squats or crampon drills would borrow a published equation's authority for a
  // number it was never fitted to. `tracking/energy.ts` makes the same refusal.
  strength: "none",
  technical: "none",
  rest: "none",
};

/**
 * Non-training activity, as a multiple of resting energy.
 *
 * THESE ARE A JUDGEMENT, NOT A PUBLISHED CONSTANT, AND THAT MATTERS. The
 * FAO/WHO/UNU physical activity levels (Human Energy Requirements, 2004) run
 * about 1.40–1.69 sedentary, 1.70–1.99 moderate and 2.00–2.40 vigorous — but
 * every one of those figures INCLUDES the person's exercise. This module costs
 * the training session separately and adds it on top, so using an FAO band here
 * would count the session twice. The bands below are deliberately lower and
 * deliberately overlapping, describing the rest of the day only.
 *
 * The unknown band spans every answer end to end rather than sitting in the
 * middle of them, because a band centred on an average is a guess about this
 * athlete and a band that covers every answer is not.
 */
const PAL_BANDS: Record<DailyMovement | "unknown", Band> = {
  seated: { low: 1.25, high: 1.4 },
  "on-feet": { low: 1.4, high: 1.55 },
  physical: { low: 1.55, high: 1.75 },
  unknown: { low: 1.25, high: 1.75 },
};

/* -------------------------------------------------------------------------- */
/* Small arithmetic                                                            */
/* -------------------------------------------------------------------------- */

const floorTo = (n: number, step: number): number => Math.floor(n / step) * step;
const ceilTo = (n: number, step: number): number => Math.ceil(n / step) * step;
const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** Outward in both directions. See ROW_STEP_KCAL for why never inward. */
function roundBandOutward(band: Band, step: number): Band {
  return { low: floorTo(band.low, step), high: ceilTo(band.high, step) };
}

function usableMass(kg: number | null | undefined): number | null {
  if (typeof kg !== "number" || !Number.isFinite(kg)) return null;
  if (kg < MIN_PLAUSIBLE_MASS_KG || kg > MAX_PLAUSIBLE_MASS_KG) return null;
  return kg;
}

function usableHeight(cm: number | null | undefined): number | null {
  if (typeof cm !== "number" || !Number.isFinite(cm)) return null;
  if (cm < MIN_PLAUSIBLE_HEIGHT_CM || cm > MAX_PLAUSIBLE_HEIGHT_CM) return null;
  return cm;
}

function usableAge(birthYear: number | null | undefined, now: Date): number | null {
  if (typeof birthYear !== "number" || !Number.isFinite(birthYear)) return null;
  const age = now.getFullYear() - birthYear;
  if (age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) return null;
  return age;
}

function usablePack(kg: number | null | undefined): number | null {
  if (typeof kg !== "number" || !Number.isFinite(kg)) return null;
  if (kg <= 0 || kg > MAX_PLAUSIBLE_PACK_KG) return null;
  return kg;
}

/** "5 h 12", "75 min". Prose, so no leading zeros and no false precision. */
function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem}`;
}

/** Thousands separated, because these are read at 34px in the dark. */
const kcal = (n: number): string => Math.round(n).toLocaleString("en-GB");

/* -------------------------------------------------------------------------- */
/* Resting energy                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mifflin-St Jeor, kcal/day.
 *
 *   BMR = 10·weight(kg) + 6.25·height(cm) − 5·age(y) + (male ? +5 : −161)
 *
 * Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new
 * predictive equation for resting energy expenditure in healthy individuals.
 * Am J Clin Nutr 1990;51:241-7.
 *
 * It is a fit to a population of healthy adults. It is not a measurement of this
 * athlete and it does not know about their thyroid, their medication, their
 * altitude history or the last three days of their training.
 */
function mifflin(massKg: number, heightCm: number, ageY: number, sex: Sex): number {
  return 10 * massKg + 6.25 * heightCm - 5 * ageY + (sex === "male" ? 5 : -161);
}

/**
 * Schofield weight-only, kcal/day. Used when there is no height.
 *
 * Schofield WN. Predicting basal metabolic rate, new standards and review of
 * previous work. Hum Nutr Clin Nutr 1985;39C Suppl 1:5-41. Adopted by
 * FAO/WHO/UNU. The coefficients are per sex and age band, which is why the
 * band is computed for the athlete's own age rather than one adult constant.
 */
function schofield(massKg: number, ageY: number, sex: Sex): number {
  if (sex === "male") {
    if (ageY < 18) return 17.686 * massKg + 658.2;
    if (ageY < 30) return 15.057 * massKg + 692.2;
    if (ageY < 60) return 11.472 * massKg + 873.1;
    return 11.711 * massKg + 587.7;
  }
  if (ageY < 18) return 13.384 * massKg + 692.6;
  if (ageY < 30) return 14.818 * massKg + 486.6;
  if (ageY < 60) return 8.126 * massKg + 845.6;
  return 9.082 * massKg + 658.5;
}

/**
 * Owen weight-only, kcal/day. Used when there is neither height nor age.
 *
 * Owen OE, Kavle E, Owen RS, et al. A reappraisal of caloric requirements in
 * healthy women. Am J Clin Nutr 1986;44:1-19.
 * Owen OE, Holup JL, D'Alessio DA, et al. A reappraisal of the caloric
 * requirements of men. Am J Clin Nutr 1987;46:875-85.
 *
 * Chosen for the no-age case specifically because Owen carries no age term at
 * all, so nothing is being silently assumed about how old the athlete is. It is
 * the least precise of the three and it is labelled as such on screen.
 */
function owen(massKg: number, sex: Sex): number {
  return sex === "male" ? 879 + 10.2 * massKg : 795 + 7.18 * massKg;
}

/**
 * The unrounded resting band and the equation that produced it.
 *
 * ONE selector, used by both the displayed band and the arithmetic the total
 * runs on. They were briefly two, which is exactly how a screen ends up citing
 * Mifflin in the drawer while adding up Schofield behind it.
 */
function restingRaw(args: {
  massKg: number;
  heightCm: number | null;
  ageY: number | null;
  sex: Sex | null;
}): { band: Band; equation: "mifflin" | "schofield" | "owen" } {
  const { massKg, heightCm, ageY, sex } = args;

  const equation: "mifflin" | "schofield" | "owen" =
    heightCm !== null && ageY !== null ? "mifflin" : ageY !== null ? "schofield" : "owen";

  const at = (s: Sex): number => {
    if (equation === "mifflin") return mifflin(massKg, heightCm as number, ageY as number, s);
    if (equation === "schofield") return schofield(massKg, ageY as number, s);
    return owen(massKg, s);
  };

  // Sex unknown → span the two answers rather than pick one. In every equation
  // here the female value is the lower, so the span is female-low to male-high.
  const rawLow = sex === null ? Math.min(at("female"), at("male")) : at(sex);
  const rawHigh = sex === null ? Math.max(at("female"), at("male")) : at(sex);

  return {
    band: {
      low: rawLow * (1 - RMR_INDIVIDUAL_SPREAD),
      high: rawHigh * (1 + RMR_INDIVIDUAL_SPREAD),
    },
    equation,
  };
}

function restingEnergyFor(args: {
  massKg: number | null;
  massGiven: boolean;
  heightCm: number | null;
  ageY: number | null;
  sex: Sex | null;
}): RestingEnergy {
  const { massKg, massGiven, heightCm, ageY, sex } = args;

  if (massKg === null) {
    // Two different absences, two different sentences. An athlete who typed 720
    // by accident must not be told ICEFALL has no weight for them.
    return massGiven
      ? {
          kind: "unavailable",
          reason: "implausible-body-mass",
          sentence: `The weight on your profile is outside the range ICEFALL will do arithmetic with (${MIN_PLAUSIBLE_MASS_KG}–${MAX_PLAUSIBLE_MASS_KG} kg), so nothing here is computed from it.`,
        }
      : {
          kind: "unavailable",
          reason: "no-body-mass",
          sentence:
            "Your weight is where every part of this starts, and ICEFALL doesn't have one.",
        };
  }

  const { band, equation } = restingRaw({ massKg, heightCm, ageY, sex });

  const equationName =
    equation === "mifflin"
      ? "the Mifflin-St Jeor equation, from your weight, height and age"
      : equation === "schofield"
        ? "the Schofield equation, from your weight and age — there is no height on your profile"
        : "the Owen equation, from your weight alone — there is no height or year of birth on your profile";

  const sexClause =
    sex === null
      ? " It spans both values of the equation's sex term, because ICEFALL doesn't hold one."
      : "";

  return {
    kind: "band",
    band: roundBandOutward(band, ROW_STEP_KCAL),
    equation,
    sexKnown: sex !== null,
    sentence: `What your body uses at complete rest over 24 hours, estimated with ${equationName}, widened by ${Math.round(RMR_INDIVIDUAL_SPREAD * 100)}% because individuals sit either side of any published equation.${sexClause}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Everyday movement                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Everything that is not the training session and not lying still.
 *
 * `PAL − 1` is the part of the multiplier that is not already counted as resting
 * energy, so this returns the ADDITION rather than the whole day. Computed from
 * the unrounded resting band so a 25 kcal display step does not get multiplied.
 */
function everydayEnergyFor(raw: Band | null, movement: DailyMovement | null): EverydayEnergy {
  if (raw === null) {
    return {
      kind: "unavailable",
      reason: "no-resting-energy",
      sentence: "Without a resting figure there is nothing to scale, so this is not estimated.",
    };
  }

  const pal = PAL_BANDS[movement ?? "unknown"];
  const band = roundBandOutward(
    { low: raw.low * (pal.low - 1), high: raw.high * (pal.high - 1) },
    ROW_STEP_KCAL,
  );

  const sentence =
    movement === null
      ? "Everything you do outside training, which ICEFALL does not measure. This band covers every answer from a desk job to a physical one, which is most of why the range above is wide."
      : "Everything you do outside training, scaled to what you told ICEFALL about your day. It is an estimate from a published activity range, not a step count — nothing in ICEFALL counts your steps.";

  return { kind: "band", band, answered: movement !== null, sentence };
}

/* -------------------------------------------------------------------------- */
/* Session cost                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The planned session, costed through the real ACSM equations.
 *
 * TWO PROFILES, NOT ONE, AND WHY THE ANSWER IS A RANGE. The plan says 18 km and
 * 1,200 m; it does not say how those are arranged. One long climb and an
 * out-and-back with the same totals cost different amounts, and there is no way
 * to know which the athlete will do. So both are computed:
 *
 *   metSteady — the whole distance at the average gradient (one long climb).
 *   metBack   — half the distance up at twice that gradient and half down at
 *               minus twice it, which preserves the total ascent exactly
 *               (2ḡ × dist/2 = ḡ × dist) while costing the descent properly.
 *
 * The band runs between them, then widens by ENERGY_TOLERANCE_MET in both
 * directions. That tolerance is NOT invented here: it is this repository's own
 * published agreement with the compendium, declared in
 * `tracking/energy.fixture.ts`, and it is imported rather than retyped so the
 * two can never drift apart.
 *
 * THE RESTING SUBTRACTION IS MANDATORY. ACSM oxygen cost is gross — the 3.5
 * ml·kg⁻¹·min⁻¹ resting term sits inside it. The daily total already counts 24
 * hours of resting energy, so adding a gross session figure on top would count
 * those hours twice: about 360 kcal on a five-hour day at 72 kg, added to a floor
 * the athlete is being asked to clear.
 *
 * THE PACK MOVES THE WORK, NOT THE BODY. Carried mass is added for the gross
 * work term and excluded from the resting share, because a rucksack has no
 * metabolism.
 */
function plannedSessionCost(args: {
  day: TrainingDay;
  model: "running" | "walking";
  massKg: number;
  /** Null when no pack is set — see below for why that is not the same as 0. */
  packKg: number | null;
}): SessionCost {
  const { day, model, massKg } = args;

  // An unset pack is NOT a measured zero, and this is the one place the two are
  // treated the same on purpose: with no figure to add, the only arithmetic
  // available is the athlete's body alone. The band is therefore a floor for a
  // day that may have been carried, and `excluded` says so in words — "Any pack
  // you carried — none is set." — rather than letting a silent zero imply the
  // athlete walked up empty-handed.
  const packKg = args.packKg === null ? 0 : args.packKg;
  const distanceKm = day.distanceKm;
  const durationMin = day.durationMin;

  if (
    typeof distanceKm !== "number" ||
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0 ||
    typeof durationMin !== "number" ||
    !Number.isFinite(durationMin) ||
    durationMin <= 0
  ) {
    return notCostable(day);
  }

  const distM = distanceKm * 1000;
  const sec = durationMin * 60;
  const v = distM / sec;
  const gainM = typeof day.elevationM === "number" && day.elevationM > 0 ? day.elevationM : 0;
  const gradeAvg = gainM > 0 ? gainM / distM : 0;

  const metSteady = metFor(model, v, gradeAvg);
  const up = metFor(model, v, gradeAvg * 2);
  const down = metFor(model, v, gradeAvg * -2);

  // Null here means the equations do not apply at this speed — a "session" so
  // slow there is no forward motion to cost. Excluded rather than floored at
  // something, because a floor would be a number nobody computed.
  if (metSteady === null || up === null || down === null) return notCostable(day);

  const metBack = (up + down) / 2;
  const metLo = Math.min(metSteady, metBack);
  const metHi = Math.max(metSteady, metBack);

  const workingMassKg = massKg + packKg;
  const grossLo = kcalFor(Math.max(MIN_MOVING_MET, metLo - ENERGY_TOLERANCE_MET), workingMassKg, sec);
  const grossHi = kcalFor(metHi + ENERGY_TOLERANCE_MET, workingMassKg, sec);
  const restingShare = kcalFor(1, massKg, sec);

  const band = roundBandOutward(
    { low: Math.max(0, grossLo - restingShare), high: Math.max(0, grossHi - restingShare) },
    RANGE_STEP_KCAL,
  );

  const packClause = packKg > 0 ? `, carrying ${packKg} kg` : "";
  const gainClause = gainM > 0 ? ` and ${kcal(gainM)} m of ascent` : " on the flat";

  return {
    kind: "band",
    band,
    model,
    distanceM: distM,
    gainM,
    durationMin,
    bodyMassKg: massKg,
    packKg,
    source: "planned",
    sentence: `Estimated from the ${distanceKm} km${gainClause} in today's plan over ${formatDuration(durationMin)}${packClause}, using the published ACSM ${model} equation. The range covers both a single long climb and an out-and-back with the same totals, because the plan does not say which it is. What your body would have used at rest over the same hours has been taken out, so it is not counted twice.`,
  };
}

function notCostable(day: TrainingDay): SessionCost {
  const durationMin =
    typeof day.durationMin === "number" && Number.isFinite(day.durationMin) && day.durationMin > 0
      ? day.durationMin
      : null;

  // F5, verbatim, with the second variant for a day that carries no duration
  // either. "Excluded rather than estimated" is the whole point of the state:
  // an estimate here would be a coefficient invented to avoid an empty row.
  const sentence =
    durationMin !== null
      ? `The plan sets ${durationMin} minutes of ${day.title.toLowerCase()} and no distance, so there is nothing to compute a cost from. It is excluded from the range above rather than estimated. What it takes is in the fuelling below.`
      : `The plan sets ${day.title.toLowerCase()} with no distance and no duration, so there is nothing to compute a cost from. It is excluded from the range above rather than estimated. What it takes is in the fuelling below.`;

  return { kind: "not-costable", rowLabel: "Not counted", title: day.title, durationMin, sentence };
}

/**
 * What was actually recorded today, net of resting energy over the same span.
 *
 * A recording beats a plan. The recorder's figure is MET × mass × hours and
 * nothing more — an estimate, not a calorimeter — but it is an estimate of what
 * this athlete did rather than of what a plan asked for, and it is preferred for
 * that reason alone.
 *
 * RESCALING IS EXACT, NOT A FUDGE. The recorder's arithmetic is linear in mass,
 * so multiplying by (their mass / the mass it used) recovers the figure it would
 * have produced. It is still flagged, because a figure recorded for a stranger's
 * 72 kg and then corrected is not the same thing as one recorded correctly.
 *
 * `movingSec` is used for the resting subtraction rather than elapsed time. It
 * is the conservative choice: the recorder accrues over sample intervals, which
 * can slightly exceed moving time, so this subtracts a little less than it might
 * and leaves the floor a little higher. On a screen whose whole purpose is to
 * stop athletes under-eating, that is the correct direction to be wrong in.
 */
function recordedSessionCost(entries: RecordedSessionInput[], massKg: number): SessionCost | null {
  let gross = 0;
  let movingSec = 0;
  let counted = 0;
  let unestimated = 0;
  let rescaled = false;
  const masses = new Set<number>();

  for (const e of entries) {
    // A null calorie figure is NOT a zero-calorie session. The recorder returns
    // null when it could not estimate — and it returns null, never 0, for a
    // session with no moving time. So null is counted as missing (the UI says
    // the total is low by whatever it contained) while a genuine 0 is added as
    // the measured nothing it is. Conflating the two is the one mistake this
    // whole module is arranged to prevent.
    if (typeof e.kcal !== "number" || !Number.isFinite(e.kcal)) {
      unestimated += 1;
      continue;
    }
    const forKg = usableMass(e.forKg);
    const scale = forKg !== null && forKg !== massKg ? massKg / forKg : 1;
    if (scale !== 1) rescaled = true;
    if (forKg !== null) masses.add(forKg);
    gross += Math.max(0, e.kcal) * scale;
    movingSec += Number.isFinite(e.movingSec) ? Math.max(0, e.movingSec) : 0;
    counted += 1;
  }

  if (counted === 0) return null;

  const net = Math.max(0, gross - kcalFor(1, massKg, movingSec));
  const forKg = masses.size === 1 ? [...masses][0] : null;

  const rescaleClause = rescaled
    ? ` It was recorded for ${forKg !== null ? `${forKg} kg` : "a different weight"} and has been scaled to yours.`
    : "";
  const missingClause =
    unestimated > 0
      ? unestimated === 1
        ? " One recording today had no energy estimate, so this is low by whatever it contained."
        : ` ${unestimated} recordings today had no energy estimate, so this is low by whatever they contained.`
      : "";

  return {
    kind: "recorded",
    kcal: roundTo(net, ROW_STEP_KCAL),
    movingSec,
    forKg,
    rescaled,
    unestimated,
    sentence: `Taken from what you recorded today — ${formatDuration(movingSec / 60)} moving — less what your body would have used at rest over the same hours, so it is not counted twice.${rescaleClause}${missingClause} It is an estimate from pace and gradient, not a measurement of you.`,
  };
}

/* -------------------------------------------------------------------------- */
/* The day                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Today's energy, as a floor with a stated width.
 *
 * GUARD ORDER, AND ONE DELIBERATE DEPARTURE FROM THE BRIEF. The brief ordered
 * the session guards with the plan first and the recording sixth, which meant a
 * gym session the athlete actually recorded would be reported as "Not counted"
 * while its real figure sat unread — and the recorder does produce a figure for
 * non-ambulatory work, from the activity's fixed MET (`recorder.ts:632`). A
 * measurement that exists must outrank a refusal derived from the plan, so the
 * recording is checked immediately after body mass. Nothing else moved, and the
 * plan-derived states are unchanged on every day with no recording.
 */
export function dailyEnergyFor(input: DailyEnergyInput): DailyEnergy {
  const now = input.now ?? new Date();
  const massGiven = input.bodyMassKgSet !== null && input.bodyMassKgSet !== undefined;
  const massKg = usableMass(input.bodyMassKgSet);
  const heightCm = usableHeight(input.heightCm);
  const ageY = usableAge(input.birthYear, now);
  const sex = input.sex ?? null;
  const movement = input.movement ?? null;
  const packKg = usablePack(input.packKg);
  const day = input.day ?? null;
  const easedFocus = input.easedFocus ?? null;
  const recorded = input.recorded ?? [];

  const resting = restingEnergyFor({ massKg, massGiven, heightCm, ageY, sex });
  const raw = massKg !== null ? restingRaw({ massKg, heightCm, ageY, sex }).band : null;
  const everyday = everydayEnergyFor(raw, movement);
  const session = sessionCostFor({ massKg, massGiven, packKg, day, easedFocus, recorded });

  /* ---- Total ----------------------------------------------------------- */

  const palRaw =
    raw === null
      ? null
      : (() => {
          const pal = PAL_BANDS[movement ?? "unknown"];
          return { low: raw.low * (pal.low - 1), high: raw.high * (pal.high - 1) };
        })();

  // The session contributes its band when it has one, a point when recorded, and
  // exactly zero when it is none-prescribed, not-costable, eased or unavailable —
  // each of which pushes a sentence onto `excluded` so the zero is never silent.
  const sessionBand: Band =
    session.kind === "band"
      ? session.band
      : session.kind === "recorded"
        ? { low: session.kcal, high: session.kcal }
        : { low: 0, high: 0 };

  const totalRaw: Band | null =
    raw === null || palRaw === null
      ? null
      : {
          low: raw.low + palRaw.low + sessionBand.low,
          high: raw.high + palRaw.high + sessionBand.high,
        };

  const total = totalRaw === null ? null : roundBandOutward(totalRaw, RANGE_STEP_KCAL);

  /* ---- Excluded --------------------------------------------------------- */

  const excluded: string[] = [
    "Everything outside a recorded session that you did not tell ICEFALL about.",
  ];
  if (
    session.kind === "none-prescribed" ||
    session.kind === "not-costable" ||
    session.kind === "eased" ||
    session.kind === "unavailable"
  ) {
    excluded.push(session.sentence);
  }
  if (session.kind === "band" && packKg === null) {
    excluded.push("Any pack you carried — none is set.");
  }
  if (session.kind === "recorded") {
    excluded.push(
      "Any pack you carried during the recording — the figure was computed for your body alone.",
    );
  }

  /* ---- Provenance ------------------------------------------------------- */

  const provenance: string[] = [resting.sentence, everyday.sentence, session.sentence];
  provenance.push(
    `Each row is rounded outward to the nearest ${ROW_STEP_KCAL} kcal and the range to the nearest ${RANGE_STEP_KCAL}, always away from the middle, so the rows do not always add up to exactly the range.`,
  );
  provenance.push(
    "Nothing here is measured. Every figure is a published equation applied to what you told ICEFALL, and the width is the honest part.",
  );

  return { resting, everyday, session, total, totalRaw, excluded, provenance, source: input };
}

function sessionCostFor(args: {
  massKg: number | null;
  massGiven: boolean;
  packKg: number | null;
  day: TrainingDay | null;
  easedFocus: TrainingFocus | null;
  recorded: RecordedSessionInput[];
}): SessionCost {
  const { massKg, massGiven, packKg, day, easedFocus, recorded } = args;

  // 1. No usable weight. Nothing downstream can be computed, including the
  //    rescaling a recorded figure needs.
  if (massKg === null) {
    return {
      kind: "unavailable",
      rowLabel: "—",
      reason: massGiven ? "implausible-body-mass" : "no-body-mass",
      sentence: massGiven
        ? "The weight on your profile is outside the range ICEFALL will do arithmetic with, so today's session is not costed."
        : "Without your weight there is nothing to compute a session cost from.",
    };
  }

  // 2. Something was actually recorded. It outranks everything the plan says,
  //    including a rest day and an eased one — the athlete went out.
  const fromRecording = recordedSessionCost(recorded, massKg);
  if (fromRecording !== null) return fromRecording;

  // 3. The briefing replaced today's session. The band is WITHDRAWN, not
  //    recomputed: `buildBriefing` emits {title, detail, focus} with no duration
  //    and no distance (briefing.ts:83-88), so there is genuinely nothing to
  //    cost. Recomputing from the day the briefing just vetoed would put the
  //    withdrawn session's energy back on the screen under another name.
  if (day !== null && easedFocus !== null && easedFocus !== day.focus) {
    return {
      kind: "eased",
      rowLabel: "Withdrawn",
      sentence: `Your plan had ${day.title.toLowerCase()} today, and ICEFALL held the intensity down. What replaced it carries no distance or hours, so there is nothing to cost and it is excluded from the range above.`,
    };
  }

  // 4. No plan day at all.
  if (day === null) {
    return {
      kind: "unavailable",
      rowLabel: "—",
      reason: "no-plan-day",
      sentence: "There is no session in your plan for today, so nothing is added here.",
    };
  }

  // 5. A prescribed rest day. A real nothing, and it says so in words rather
  //    than as a 0 an athlete would read as a session measured at zero.
  if (day.focus === "rest") {
    return {
      kind: "none-prescribed",
      rowLabel: "None",
      sentence:
        "Nothing is prescribed today. The range is smaller than yesterday's because you are moving less, not because you are allowed less.",
    };
  }

  // 6. The equations do not describe this session, or the plan gives no
  //    distance to run them on. The majority of the training week lands here —
  //    only three of the seven template days carry a distance — so this is a
  //    first-class state, not an edge case.
  const model = MODEL_FOR_FOCUS[day.focus];
  if (model === "none") return notCostable(day);

  return plannedSessionCost({ day, model, massKg, packKg });
}

/* -------------------------------------------------------------------------- */
/* Still to cover                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How far below the floor the athlete is — or that they are inside the range.
 *
 * There is no third answer. Past the floor the function returns
 * `"inside-range"` and stops: no surplus, no remainder against the top of the
 * range, no colour change for the UI to key off. An athlete who ate 6,000 kcal
 * on a 2,650–4,650 day gets exactly the same string as one who ate 2,700.
 *
 * Returns null when there is nothing to compare — no range, or nothing logged.
 * Null is the absence of an answer; it is not zero to go.
 */
export function stillToCover(total: Band | null, loggedKcal: number | null): StillToCover | null {
  if (total === null) return null;
  if (loggedKcal === null || !Number.isFinite(loggedKcal)) return null;
  if (loggedKcal >= total.low) return "inside-range";
  // Rounded UP, not to nearest. Nearest would report "0 kcal to go" to someone
  // who is 10 kcal short of the floor, which is a measured zero printed over a
  // real shortfall — and on this screen that is the error that costs the
  // athlete food. Below the floor, the figure is never zero.
  return { kcal: ceilTo(total.low - loggedKcal, ROW_STEP_KCAL) };
}

/* -------------------------------------------------------------------------- */
/* What answering is worth                                                     */
/* -------------------------------------------------------------------------- */

export interface NarrowingWorth {
  /** kcal of width an answer would remove, or null when there is nothing to gain. */
  sexKcal: number | null;
  movementKcal: number | null;
  heightKcal: number | null;
  birthYearKcal: number | null;
}

/**
 * What each unanswered question is worth, computed for THIS athlete.
 *
 * Not a generic "answering helps" — the day is re-run with each possible answer
 * and the width compared. Where the answers narrow by different amounts the
 * SMALLEST is returned, so the app never oversells what it is asking for. A
 * question that turns out to be worth nothing returns null and should not be
 * asked with a number attached.
 *
 * Run on `totalRaw` so a 50 kcal rounding step cannot be reported as a benefit.
 */
export function narrowingWorth(e: DailyEnergy): NarrowingWorth {
  const width = (d: DailyEnergy): number | null =>
    d.totalRaw === null ? null : d.totalRaw.high - d.totalRaw.low;

  const base = width(e);
  if (base === null) {
    return { sexKcal: null, movementKcal: null, heightKcal: null, birthYearKcal: null };
  }

  const gain = (overrides: Partial<DailyEnergyInput>[]): number | null => {
    let smallest: number | null = null;
    for (const o of overrides) {
      const w = width(dailyEnergyFor({ ...e.source, ...o }));
      if (w === null) return null;
      const saved = base - w;
      if (smallest === null || saved < smallest) smallest = saved;
    }
    if (smallest === null) return null;
    const rounded = roundTo(smallest, RANGE_STEP_KCAL);
    return rounded > 0 ? rounded : null;
  };

  const already = (v: unknown): boolean => v !== null && v !== undefined;

  return {
    sexKcal: already(e.source.sex)
      ? null
      : gain([{ sex: "female" }, { sex: "male" }]),
    movementKcal: already(e.source.movement)
      ? null
      : gain([{ movement: "seated" }, { movement: "on-feet" }, { movement: "physical" }]),
    // Height and birth year change WHICH equation is used, not just its width,
    // so the gain is computed with a plausible stand-in and reported as the
    // conservative one. The stand-in never reaches the screen — it exists only
    // to answer "how much would this help", never "what is your figure".
    heightKcal: already(e.source.heightCm) ? null : gain([{ heightCm: 175 }]),
    birthYearKcal: already(e.source.birthYear)
      ? null
      : gain([{ birthYear: (e.source.now ?? new Date()).getFullYear() - 35 }]),
  };
}

/* -------------------------------------------------------------------------- */
/* Self-check                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The arithmetic, checked as behaviour rather than trusted as comments.
 *
 * Same reasoning as `tracking/energy.fixture.ts`: this module's whole claim is
 * that its figures come from published equations applied to real inputs, and
 * that claim is worth nothing unless the implementation is checkable. Empty is
 * the passing state.
 *
 * The three expected day totals are the product, in one line each:
 * nothing answered 2,850 wide → sex and movement answered 2,000 wide → session
 * recorded 700 wide. If that arc ever stops holding, the narrowing the whole
 * screen is built around has stopped working.
 */
export function fuelDayCheckFailures(): string[] {
  const fails: string[] = [];
  const now = new Date("2026-06-15T12:00:00Z");
  const base = { bodyMassKgSet: 72, heightCm: 178, birthYear: 1994, now };

  const longMountain: TrainingDay = {
    date: "2026-06-20",
    focus: "long-mountain",
    title: "Long Mountain Session",
    distanceKm: 18,
    elevationM: 1200,
    durationMin: 300,
    difficulty: 4,
    completed: false,
  };
  const endurance: TrainingDay = {
    date: "2026-06-16",
    focus: "endurance",
    title: "Endurance Run",
    distanceKm: 12,
    elevationM: 420,
    durationMin: 75,
    difficulty: 2,
    completed: false,
  };
  const recoveryWalk: TrainingDay = {
    date: "2026-06-21",
    focus: "recovery",
    title: "Recovery Walk",
    distanceKm: 6,
    durationMin: 60,
    difficulty: 1,
    completed: false,
  };
  const strength: TrainingDay = {
    date: "2026-06-17",
    focus: "strength",
    title: "Strength — Lower Body",
    durationMin: 60,
    difficulty: 3,
    completed: false,
  };
  const restDay: TrainingDay = {
    date: "2026-06-18",
    focus: "rest",
    title: "Rest",
    difficulty: 1,
    completed: false,
  };

  const band = (label: string, got: Band | null, low: number, high: number) => {
    if (got === null) return fails.push(`${label}: expected ${low}–${high}, got nothing`);
    if (got.low !== low || got.high !== high) {
      fails.push(`${label}: expected ${low}–${high}, got ${got.low}–${got.high}`);
    }
    return undefined;
  };

  const sessionBandOf = (d: DailyEnergy): Band | null =>
    d.session.kind === "band" ? d.session.band : null;

  band(
    "Sat long mountain, 8 kg pack",
    sessionBandOf(dailyEnergyFor({ ...base, day: longMountain, packKg: 8 })),
    750,
    2050,
  );
  band("Tue endurance", sessionBandOf(dailyEnergyFor({ ...base, day: endurance })), 700, 1100);
  band("Sun recovery walk", sessionBandOf(dailyEnergyFor({ ...base, day: recoveryWalk })), 100, 300);

  const wed = dailyEnergyFor({ ...base, day: strength });
  if (wed.session.kind !== "not-costable") {
    fails.push(`Wed strength: expected not-costable, got ${wed.session.kind}`);
  }

  const restingOf = (d: DailyEnergy): Band | null =>
    d.resting.kind === "band" ? d.resting.band : null;
  band("Resting, sex unknown", restingOf(dailyEnergyFor(base)), 1350, 1850);
  band("Resting, female", restingOf(dailyEnergyFor({ ...base, sex: "female" })), 1350, 1675);

  const blank = dailyEnergyFor({ ...base, day: longMountain, packKg: 8 });
  band("Day total, nothing answered", blank.total, 2450, 5300);

  const answered = dailyEnergyFor({
    ...base,
    day: longMountain,
    packKg: 8,
    sex: "female",
    movement: "on-feet",
  });
  band("Day total, female + on-feet", answered.total, 2650, 4650);

  const withRecording = dailyEnergyFor({
    ...base,
    day: longMountain,
    packKg: 8,
    sex: "female",
    movement: "on-feet",
    recorded: [{ kcal: 1880, movingSec: 5 * 3600 + 12 * 60, forKg: 72 }],
  });
  band("Day total, session recorded", withRecording.total, 3400, 4100);

  const rest = dailyEnergyFor({ ...base, day: restDay, sex: "female", movement: "on-feet" });
  band("Rest day, female + on-feet", rest.total, 1900, 2600);
  if (rest.session.kind !== "none-prescribed") {
    fails.push(`Rest day: expected none-prescribed, got ${rest.session.kind}`);
  }

  /* ---- The narrowing arc, which is the product --------------------------- */

  const widthOf = (d: DailyEnergy) => (d.total === null ? null : d.total.high - d.total.low);
  if (widthOf(blank) !== 2850) fails.push(`Unanswered width: expected 2850, got ${widthOf(blank)}`);
  if (widthOf(answered) !== 2000) {
    fails.push(`Answered width: expected 2000, got ${widthOf(answered)}`);
  }
  if (widthOf(withRecording) !== 700) {
    fails.push(`Recorded width: expected 700, got ${widthOf(withRecording)}`);
  }

  /* ---- The refusals ------------------------------------------------------ */

  const noMass = dailyEnergyFor({ bodyMassKgSet: null, day: longMountain, now });
  if (noMass.total !== null) fails.push("No body mass must produce no total, never a default");
  if (noMass.resting.kind !== "unavailable") fails.push("No body mass must not produce a resting band");

  const eased = dailyEnergyFor({ ...base, day: longMountain, easedFocus: "recovery" });
  if (eased.session.kind !== "eased") {
    fails.push(`Eased day: expected eased, got ${eased.session.kind}`);
  }

  const recordedOnStrengthDay = dailyEnergyFor({
    ...base,
    day: strength,
    recorded: [{ kcal: 400, movingSec: 3000, forKg: 72 }],
  });
  if (recordedOnStrengthDay.session.kind !== "recorded") {
    fails.push("A recording must outrank a plan day the equations cannot cost");
  }

  const nullCalories = dailyEnergyFor({
    ...base,
    day: strength,
    recorded: [{ kcal: null, movingSec: 3000, forKg: 72 }],
  });
  if (nullCalories.session.kind !== "not-costable") {
    fails.push("A recording with null calories must not be read as a zero-calorie session");
  }

  if (stillToCover({ low: 2650, high: 4650 }, 6000) !== "inside-range") {
    fails.push("Eating past the range must return inside-range, never a surplus");
  }
  const under = stillToCover({ low: 2650, high: 4650 }, 2000);
  if (under === null || under === "inside-range" || under.kcal !== 650) {
    fails.push("650 kcal under the floor must report 650 to go");
  }
  if (stillToCover(null, 2000) !== null) fails.push("No range must not produce a remainder");
  if (stillToCover({ low: 2650, high: 4650 }, null) !== null) {
    fails.push("Nothing logged must be null, never zero to go");
  }

  const worth = narrowingWorth(blank);
  if (worth.sexKcal === null || worth.sexKcal <= 0) {
    fails.push("Answering sex must be worth a stated, positive number of kcal");
  }
  if (worth.movementKcal === null || worth.movementKcal <= 0) {
    fails.push("Answering everyday movement must be worth a stated, positive number of kcal");
  }
  if (narrowingWorth(answered).sexKcal !== null) {
    fails.push("An answered question must not be advertised as worth answering");
  }

  return fails;
}
