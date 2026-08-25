import { haversine } from "@/tracking/filters";
import { isKnown } from "@/coach/types";
import { COARSEN_GRID_KM, approxDistanceLabel, coarsen } from "./privacy";
import { EXPERIENCE_LABELS, LOOKING_FOR_LABELS } from "./types";
import type { AthleteProfile, ExperienceLevel, LookingFor } from "./types";

/**
 * The compatibility engine.
 *
 * Pure: no React, no state, no clock, no network. Given two profiles it returns
 * a number, the working behind it, and one line naming the real reason.
 *
 * WHAT IT SCORES, AND WHY THAT LIST IS CLOSED
 *
 * The objective is dominant and everything else is a distant second. Two people
 * on the same mountain in the same month have something to talk about even if
 * they live a thousand kilometres apart; two people in the same town heading for
 * different peaks in different seasons do not. That is the product thesis, and
 * it is enforced by arithmetic rather than by copy — see the ceilings below.
 *
 * NOTHING here scores age, appearance, popularity, follower counts, likes,
 * responsiveness or how much anyone trains. There is no ranking of people, only
 * a description of how well two plans line up. Volume of activity in particular
 * is excluded on purpose: rewarding it would turn a partner search into a
 * leaderboard, and a leaderboard is exactly the pressure that gets people onto
 * mountains they are not ready for.
 *
 * MISSING DATA IS NEVER A ZERO
 *
 * A factor either applies to both sides or it is dropped, and the weights of the
 * factors that remain are renormalised over what is left. Someone who has not
 * filled in their availability is not "incompatible on availability"; they are
 * unmeasured on it, and the score says so by not counting it. Dropped factors
 * are still returned, carrying `weight: 0` — see the note on `MatchFactor`.
 *
 * THE CEILINGS ARE THE THESIS
 *
 * Same objective  ⇒ the objective factor scores 100 and holds at least 0.40 of
 *                   the applied weight, so the total can never fall below 40.
 * Other objective ⇒ the total is capped at 35, whatever else lines up.
 *
 * 35 < 40, so every same-objective pair outranks every different-objective pair,
 * however close they live and however well everything else matches. That is a
 * property of the code, not an aspiration in a comment.
 *
 * WHAT THE NUMBER IS NOT
 *
 * It is not a safety assessment, an endorsement or a vetting result. ICEFALL
 * checks nobody: not identity, not qualifications, not experience, not
 * competence. Readiness and experience here are self-reported or derived, never
 * measured, and the notes below say so in every sentence that touches them. A
 * high score means two plans line up. It says nothing about whether either
 * person should be on that mountain, and nothing about whether they are safe to
 * meet — `SAFETY_REMINDER` in `./privacy` covers the second, and an
 * IFMGA/UIAGM-certified guide covers the first.
 */

/* -------------------------------------------------------------------------- */
/* Public shape                                                                */
/* -------------------------------------------------------------------------- */

export type MatchFactorId =
  | "objective"
  | "timing"
  | "experience"
  | "readiness"
  | "proximity"
  | "looking-for"
  | "availability";

export interface MatchFactor {
  id: string;
  label: string;
  /**
   * The weight ACTUALLY APPLIED, after renormalisation over the factors that
   * could be computed. Across one result these sum to 1.
   *
   * `weight === 0` means the factor was dropped: one side or the other had
   * nothing to compare. Its `score` is then meaningless filler — the interface
   * requires a number and there is no honest number — so a UI MUST test the
   * weight and render the note, never a zeroed bar. A dropped factor is an
   * unknown, and drawing it as an empty bar reads as "scored nothing", which is
   * the one thing it does not mean.
   */
  weight: number;
  /** 0–100. Only meaningful when `weight > 0`. */
  score: number;
  /** Convenience for a UI: the factor scored at or above `FACTOR_MET_AT`. Never a verdict. */
  met: boolean;
  note: string;
}

export interface MatchResult {
  /** 0–100, rounded. When every factor was dropped this is 0 and the headline says so. */
  score: number;
  factors: MatchFactor[];
  /** The real reason, in one line. Always renderable, even at zero. */
  headline: string;
}

/**
 * The nominal weights, exported so a UI can show its working.
 *
 * These are what a factor is worth when everything is known. The applied weight
 * on each returned factor is this figure renormalised over the factors that
 * survived, which is why the two can differ and why both are exposed.
 */
export const MATCH_WEIGHTS: Record<MatchFactorId, number> = {
  objective: 0.4,
  timing: 0.2,
  experience: 0.12,
  readiness: 0.1,
  proximity: 0.08,
  "looking-for": 0.06,
  availability: 0.04,
};

export const MATCH_FACTOR_LABELS: Record<MatchFactorId, string> = {
  objective: "Objective",
  timing: "Timing",
  experience: "Experience",
  readiness: "Readiness",
  proximity: "Distance",
  "looking-for": "What you are both after",
  availability: "Availability",
};

/**
 * Hard ceiling on any pair whose objectives are both known and are not the same
 * mountain. Below the floor of a same-objective match (40) by a clear margin,
 * so proximity, timing and everything else can never buy a way past the
 * mountain itself.
 */
export const DIFFERENT_OBJECTIVE_CEILING = 35;

/**
 * Ceiling when one side or the other has not named an objective.
 *
 * Not the same statement as the ceiling above. "Different" is something we
 * know; "unknown" is something we do not, so the pair is neither ranked as a
 * strong match nor pushed below a pair we know to be on different mountains.
 * The dominant signal is simply absent, and a score that could reach into the
 * eighties on availability and postcodes alone would be a confident-looking
 * number built on the two least important things in the model.
 */
export const UNKNOWN_OBJECTIVE_CEILING = 50;

/** Where a single factor starts reading as "yes" rather than "partly". */
export const FACTOR_MET_AT = 60;

/* -------------------------------------------------------------------------- */
/* Thresholds                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Two objectives closer than this are treated as the same mountain even when
 * the names differ. Peaks are widely known by more than one name — Denali and
 * Mount McKinley, Everest and Sagarmatha and Chomolungma — and a string
 * comparison would split two people standing on the same summit.
 */
const SAME_PEAK_KM = 2;

/** Different peaks near enough to share an approach, a valley and a season. */
const SAME_MASSIF_KM = 30;
const SAME_MASSIF_SCORE = 40;

/** Different peaks in neighbouring ranges: weakly related, and scored weakly. */
const NEIGHBOURING_RANGE_KM = 120;
const NEIGHBOURING_RANGE_SCORE = 20;

/**
 * Timing decays with a 45-day half-life rather than switching off at a
 * boundary. Dates a fortnight apart are effectively the same trip, since plans
 * move by a fortnight all the time; three months apart is a different season on
 * the same mountain, which is a different objective in everything but name.
 * A cliff edge at "same month" would rank 30 April and 2 May as strangers.
 */
const TIMING_HALF_LIFE_DAYS = 45;

const DAY_MS = 86_400_000;

/** Same month, and same season, for the headline only. */
const SAME_MONTH_DAYS = 31;
const SAME_SEASON_DAYS = 92;

const EXPERIENCE_ORDER: Record<ExperienceLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3,
};

/**
 * Score by the gap in self-declared standing, indexed by that gap.
 *
 * The floor is 15, never 0. A gap is not a disqualification: climbing with
 * someone more experienced is how most people learn, and an expert willing to
 * go out with a beginner may be exactly the right partner. What the taper
 * encodes is only that two people at the same standing need less negotiating
 * about what a day will involve.
 */
const EXPERIENCE_GAP_SCORE = [100, 75, 40, 15];

/**
 * Distance bands, mirroring the bands `approxDistanceLabel` displays.
 *
 * The score is banded for the same reason the label is: a continuous function
 * of distance, read a few times as the athlete moves, is a position fix. It
 * never reaches 0 either — living far apart is a logistics problem, not an
 * incompatibility, and people fly to mountains.
 */
const PROXIMITY_BANDS: { upToKm: number; score: number }[] = [
  { upToKm: 25, score: 100 },
  { upToKm: 75, score: 80 },
  { upToKm: 200, score: 55 },
  { upToKm: 500, score: 30 },
];
const PROXIMITY_FAR_SCORE = 10;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Never "They is…". A blank display name still has to read as a sentence. */
function subjectOf(them: AthleteProfile): string {
  const name = them.displayName.trim();
  return name.length > 0 ? name : "This athlete";
}

function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDay(iso: string | undefined): number | null {
  if (typeof iso !== "string" || iso.trim().length === 0) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Peak-to-peak distance. Public geography — nothing personal is involved. */
function peakDistanceKm(
  a: { lat?: number; lon?: number },
  b: { lat?: number; lon?: number },
): number | null {
  if (
    typeof a.lat !== "number" ||
    typeof a.lon !== "number" ||
    typeof b.lat !== "number" ||
    typeof b.lon !== "number" ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lon) ||
    !Number.isFinite(b.lat) ||
    !Number.isFinite(b.lon)
  ) {
    return null;
  }
  return haversine({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) / 1000;
}

function describeDayGap(days: number): string {
  if (days < 14) return "less than a fortnight apart";
  if (days < 60) return `about ${Math.max(1, Math.round(days / 7))} weeks apart`;
  return `about ${Math.max(2, Math.round(days / 30))} months apart`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Overlap as a share of the SHORTER list.
 *
 * Not Jaccard. Someone who wants one thing and finds it in a list of five has
 * found what they came for; dividing by the union would score that 20% and
 * quietly penalise people for being open to more than one kind of company.
 */
function overlapScore(mine: string[], theirs: string[]): number {
  const a = new Set(mine);
  const b = new Set(theirs);
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  const smaller = Math.min(a.size, b.size);
  return smaller === 0 ? 0 : (shared / smaller) * 100;
}

/* -------------------------------------------------------------------------- */
/* Factor outcomes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `score === null` means the factor could not be computed and is dropped from
 * the total. It never means zero, and no branch below may conflate the two.
 */
interface FactorOutcome {
  score: number | null;
  note: string;
}

/* ---- Objective ----------------------------------------------------------- */

type ObjectiveRelation =
  | { kind: "same"; mine: string; theirs: string }
  | { kind: "same-massif"; mine: string; theirs: string; km: number }
  | { kind: "neighbouring"; mine: string; theirs: string; km: number }
  | { kind: "different"; mine: string; theirs: string }
  | { kind: "unknown"; missing: "yours" | "theirs" | "both" };

function relateObjectives(me: AthleteProfile, them: AthleteProfile): ObjectiveRelation {
  const mine = me.objective;
  const theirs = them.objective;

  if (!mine && !theirs) return { kind: "unknown", missing: "both" };
  if (!mine) return { kind: "unknown", missing: "yours" };
  if (!theirs) return { kind: "unknown", missing: "theirs" };

  const km = peakDistanceKm(mine, theirs);
  const sameName = normaliseName(mine.peakName) === normaliseName(theirs.peakName);

  // Coordinates outrank the string: they resolve alternative names for one
  // mountain, and they separate the many peaks that share a name.
  if (km !== null ? km <= SAME_PEAK_KM : sameName) {
    return { kind: "same", mine: mine.peakName, theirs: theirs.peakName };
  }
  if (km !== null && km <= SAME_MASSIF_KM) {
    return { kind: "same-massif", mine: mine.peakName, theirs: theirs.peakName, km };
  }
  if (km !== null && km <= NEIGHBOURING_RANGE_KM) {
    return { kind: "neighbouring", mine: mine.peakName, theirs: theirs.peakName, km };
  }
  return { kind: "different", mine: mine.peakName, theirs: theirs.peakName };
}

function objectiveFactor(relation: ObjectiveRelation, subject: string): FactorOutcome {
  switch (relation.kind) {
    case "same":
      // When the two spellings differ the mountain is named BOTH ways rather
      // than silently adopting theirs. Someone searching for Denali should not
      // be told they are heading for Mount McKinley.
      return {
        score: 100,
        note:
          normaliseName(relation.mine) === normaliseName(relation.theirs)
            ? `You are both heading for ${relation.mine}.`
            : `You are both heading for the same mountain — you have it as ${relation.mine}, ${subject} as ${relation.theirs}.`,
      };

    case "same-massif":
      return {
        score: SAME_MASSIF_SCORE,
        // A genuine zero-to-partial measurement, not an unknown: both peaks are
        // named and they are not the same mountain.
        note: `Different objectives — ${relation.mine} and ${relation.theirs} — but the two sit in the same massif, within about ${Math.round(relation.km)} km of each other.`,
      };

    case "neighbouring":
      return {
        score: NEIGHBOURING_RANGE_SCORE,
        note: `${relation.mine} and ${relation.theirs} are different objectives about ${Math.round(relation.km / 10) * 10} km apart — neighbouring ground, not a shared plan.`,
      };

    case "different":
      return {
        score: 0,
        note: `Different objectives: ${relation.mine} and ${relation.theirs}. The mountain is what this network matches on, so this holds the whole score down whatever else lines up.`,
      };

    case "unknown":
      return {
        score: null,
        note:
          relation.missing === "yours"
            ? "You have not set an objective, so there is no mountain to compare."
            : relation.missing === "theirs"
              ? `${subject} has not named an objective, so there is no mountain to compare.`
              : "Neither of you has set an objective, so there is no mountain to compare.",
      };
  }
}

/* ---- Timing -------------------------------------------------------------- */

function timingFactor(me: AthleteProfile, them: AthleteProfile, subject: string): FactorOutcome {
  const mine = parseDay(me.objective?.targetDate);
  const theirs = parseDay(them.objective?.targetDate);

  if (mine === null || theirs === null) {
    return {
      score: null,
      note:
        mine === null && theirs === null
          ? "Neither of you has set a target date."
          : mine === null
            ? "You have not set a target date."
            : `${subject} has not set a target date.`,
    };
  }

  const days = Math.abs(mine - theirs) / DAY_MS;
  const score = 100 * Math.pow(0.5, days / TIMING_HALF_LIFE_DAYS);

  return {
    score,
    note: `Your target dates are ${describeDayGap(days)}.`,
  };
}

/* ---- Experience ---------------------------------------------------------- */

function experienceFactor(
  me: AthleteProfile,
  them: AthleteProfile,
  subject: string,
): FactorOutcome {
  const mine = me.experience;
  const theirs = them.experience;

  if (!mine || !theirs) {
    return {
      score: null,
      note:
        !mine && !theirs
          ? "Neither of you has said where you are in your climbing."
          : !mine
            ? "You have not said where you are in your climbing."
            : `${subject} has not said where they are in their climbing.`,
    };
  }

  const gap = Math.abs(EXPERIENCE_ORDER[mine] - EXPERIENCE_ORDER[theirs]);
  const score = EXPERIENCE_GAP_SCORE[gap];

  // Self-declared on both sides, and said so every time it is shown. ICEFALL has
  // no way to check what anyone can do, and this line is what stops the number
  // above from reading as an assessment.
  const provenance = "Self-declared on both sides — ICEFALL does not check anyone's ability.";

  if (gap === 0) {
    return {
      score,
      note: `You both describe yourselves as ${EXPERIENCE_LABELS[mine].toLowerCase()}. ${provenance}`,
    };
  }

  return {
    score,
    note: `You describe yourself as ${EXPERIENCE_LABELS[mine].toLowerCase()}; ${subject} as ${EXPERIENCE_LABELS[theirs].toLowerCase()}. ${provenance}`,
  };
}

/* ---- Readiness ----------------------------------------------------------- */

function readinessFactor(me: AthleteProfile, them: AthleteProfile, subject: string): FactorOutcome {
  const mine = me.readiness;
  const theirs = them.readiness;

  // A `Score` carries its own absence. `value === null` is a reason, not a nil
  // readiness, and it drops the factor rather than scoring against anyone.
  if (!mine || !theirs || !isKnown(mine) || !isKnown(theirs)) {
    const iHave = mine !== undefined && isKnown(mine);
    const theyHave = theirs !== undefined && isKnown(theirs);
    return {
      score: null,
      note:
        !iHave && !theyHave
          ? "Neither of you has a readiness figure yet."
          : !iHave
            ? "You do not have a readiness figure for your objective yet."
            : `${subject} does not have a readiness figure yet.`,
    };
  }

  const gap = Math.abs(mine.value - theirs.value);

  return {
    score: 100 - gap,
    // Compared, never ranked: the lower figure is not the lesser person, and
    // both figures are self-reported or derived rather than measured.
    note: `Readiness for your objectives is ${Math.round(gap)} points apart. Both figures are self-reported or derived from training, never measured, and neither says anyone is ready to climb anything.`,
  };
}

/* ---- Proximity ----------------------------------------------------------- */

function proximityFactor(me: AthleteProfile, them: AthleteProfile, subject: string): FactorOutcome {
  const mine = me.approxLocation;
  const theirs = them.approxLocation;

  if (!mine || !theirs) {
    return {
      score: null,
      note:
        !mine && !theirs
          ? "Neither of you is sharing an approximate area."
          : !mine
            ? "You are not sharing an approximate area."
            : `${subject} is not sharing an approximate area.`,
    };
  }

  // Coarsened again here even though `AppState` coarsens on write. This engine
  // must not depend on every future caller having done the right thing: a
  // precise coordinate handed in from anywhere would otherwise become a precise
  // distance, and a precise distance is a position fix.
  const a = coarsen(mine.lat, mine.lon);
  const b = coarsen(theirs.lat, theirs.lon);
  const km = haversine(a, b) / 1000;

  if (!Number.isFinite(km)) {
    return { score: null, note: "Your areas cannot be compared." };
  }

  const band = PROXIMITY_BANDS.find((x) => km <= x.upToKm);
  const label = approxDistanceLabel(km);

  return {
    score: band ? band.score : PROXIMITY_FAR_SCORE,
    note: `${subject} is around ${theirs.label} — ${label.toLowerCase()}. Positions are rounded to a ${COARSEN_GRID_KM} km grid and exact locations are never compared or shown.`,
  };
}

/* ---- Looking for --------------------------------------------------------- */

function lookingForFactor(
  me: AthleteProfile,
  them: AthleteProfile,
  subject: string,
): FactorOutcome {
  const mine = me.lookingFor ?? [];
  const theirs = them.lookingFor ?? [];

  if (mine.length === 0 || theirs.length === 0) {
    return {
      score: null,
      note:
        mine.length === 0 && theirs.length === 0
          ? "Neither of you has said what you are looking for."
          : mine.length === 0
            ? "You have not said what you are looking for."
            : `${subject} has not said what they are looking for.`,
    };
  }

  const shared = mine.filter((x) => theirs.includes(x));
  const score = overlapScore(mine, theirs);

  return {
    score,
    note:
      shared.length > 0
        ? `You are both after ${joinList(shared.map((x: LookingFor) => LOOKING_FOR_LABELS[x].toLowerCase()))}.`
        : `You are looking for ${joinList(mine.map((x) => LOOKING_FOR_LABELS[x].toLowerCase()))}; ${subject} for ${joinList(theirs.map((x) => LOOKING_FOR_LABELS[x].toLowerCase()))}.`,
  };
}

/* ---- Availability -------------------------------------------------------- */

function availabilityFactor(
  me: AthleteProfile,
  them: AthleteProfile,
  subject: string,
): FactorOutcome {
  const mine = (me.availability ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  const theirs = (them.availability ?? []).map((s) => s.trim()).filter((s) => s.length > 0);

  if (mine.length === 0 || theirs.length === 0) {
    return {
      score: null,
      note:
        mine.length === 0 && theirs.length === 0
          ? "Neither of you has said when you can get out."
          : mine.length === 0
            ? "You have not said when you can get out."
            : `${subject} has not said when they can get out.`,
    };
  }

  const theirsLower = theirs.map((s) => s.toLowerCase());
  const shared = mine.filter((s) => theirsLower.includes(s.toLowerCase()));
  const score = overlapScore(
    mine.map((s) => s.toLowerCase()),
    theirsLower,
  );

  return {
    score,
    note:
      shared.length > 0
        ? // Quoted in the athlete's own words and casing. Lower-casing free
          // text turns "June to August" into "june to august".
          `You are both free: ${joinList(shared)}.`
        : "Nothing you have both written down lines up, though free text rarely matches exactly — worth asking.",
  };
}

/* -------------------------------------------------------------------------- */
/* Headline                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One line naming the actual reason, never a grade or an adjective about a
 * person. "Same objective, same month" is a fact two people can act on;
 * "Excellent match" is flattery, and flattery about a climbing partner is how
 * somebody ends up on a route with a stranger they never questioned.
 */
function headlineFor(
  relation: ObjectiveRelation,
  dayGap: number | null,
  proximityMet: boolean,
): string {
  switch (relation.kind) {
    case "same":
      if (dayGap === null) return "Same objective, no date set";
      if (dayGap <= SAME_MONTH_DAYS) return "Same objective, same month";
      if (dayGap <= SAME_SEASON_DAYS) return "Same objective, same season";
      return "Same objective, months apart";

    case "same-massif":
      return "Different objectives, same massif";

    case "neighbouring":
      return "Different objectives, neighbouring ranges";

    case "different":
      return proximityMet ? "Different objectives, training nearby" : "Different objectives";

    case "unknown":
      return relation.missing === "yours"
        ? "Set an objective to compare"
        : relation.missing === "theirs"
          ? "No objective named"
          : "No objectives to compare";
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function matchScore(me: AthleteProfile, them: AthleteProfile): MatchResult {
  const subject = subjectOf(them);
  const relation = relateObjectives(me, them);

  const outcomes: { id: MatchFactorId; outcome: FactorOutcome }[] = [
    { id: "objective", outcome: objectiveFactor(relation, subject) },
    { id: "timing", outcome: timingFactor(me, them, subject) },
    { id: "experience", outcome: experienceFactor(me, them, subject) },
    { id: "readiness", outcome: readinessFactor(me, them, subject) },
    { id: "proximity", outcome: proximityFactor(me, them, subject) },
    { id: "looking-for", outcome: lookingForFactor(me, them, subject) },
    { id: "availability", outcome: availabilityFactor(me, them, subject) },
  ];

  // Renormalise over what could actually be computed. An unanswered question is
  // not a zero, and dividing by the full weight table would silently punish
  // every athlete for the fields the other one left blank.
  const appliedWeight = outcomes.reduce(
    (sum, o) => (o.outcome.score === null ? sum : sum + MATCH_WEIGHTS[o.id]),
    0,
  );

  const factors: MatchFactor[] = outcomes.map(({ id, outcome }) => {
    const label = MATCH_FACTOR_LABELS[id];
    if (outcome.score === null || appliedWeight === 0) {
      return { id, label, weight: 0, score: 0, met: false, note: `Not counted. ${outcome.note}` };
    }
    return {
      id,
      label,
      weight: MATCH_WEIGHTS[id] / appliedWeight,
      score: Math.round(outcome.score),
      met: outcome.score >= FACTOR_MET_AT,
      note: outcome.note,
    };
  });

  const raw =
    appliedWeight === 0
      ? 0
      : outcomes.reduce(
          (sum, o) =>
            o.outcome.score === null
              ? sum
              : sum + (MATCH_WEIGHTS[o.id] / appliedWeight) * o.outcome.score,
          0,
        );

  // The thesis, applied last so nothing downstream can undo it.
  const capped =
    relation.kind === "same"
      ? raw
      : relation.kind === "unknown"
        ? Math.min(raw, UNKNOWN_OBJECTIVE_CEILING)
        : Math.min(raw, DIFFERENT_OBJECTIVE_CEILING);

  const mineDay = parseDay(me.objective?.targetDate);
  const theirDay = parseDay(them.objective?.targetDate);
  const dayGap =
    mineDay === null || theirDay === null ? null : Math.abs(mineDay - theirDay) / DAY_MS;

  const proximity = factors.find((f) => f.id === "proximity");
  const proximityMet = proximity !== undefined && proximity.weight > 0 && proximity.met;

  // Nothing was comparable at all. The 0 is not a judgement on anyone, and the
  // headline is what a UI must show in its place.
  const headline =
    appliedWeight === 0 ? "Nothing to compare yet" : headlineFor(relation, dayGap, proximityMet);

  return {
    score: Math.round(Math.max(0, Math.min(100, capped))),
    factors,
    headline,
  };
}
