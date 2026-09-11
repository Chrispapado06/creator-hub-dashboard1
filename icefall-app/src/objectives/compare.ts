import {
  REQUIREMENT_STATE_COPY,
  requirementSetState,
  reviewAttribution,
  SKILL_LABEL,
  skillIdForLabel,
} from "@/objectives/requirements";
import type {
  AthleteSkillId,
  ObjectiveRequirementSet,
  RequirementSetState,
  StructuredRequirement,
} from "@/objectives/requirements";

/**
 * THE COMPARISON ENGINE: an athlete's record against an objective's structured
 * requirements.
 *
 * ============================================================================
 * THE THREE ANSWERS, AND WHY THERE ARE THREE
 * ============================================================================
 *
 *   met             ICEFALL holds evidence that clears the line.
 *   not-met         ICEFALL holds evidence that FALLS SHORT of the line.
 *   not-measurable  ICEFALL holds nothing that speaks to the line at all.
 *
 * The third is the one that matters, and it is not a rounding of the second.
 * "Your biggest recorded day in the last twelve weeks climbed 900 m" is a
 * finding. "You have recorded nothing" is not a finding about the athlete, it
 * is a finding about ICEFALL, and collapsing the two would turn every new
 * install into a person who fails every requirement on every mountain.
 *
 * ============================================================================
 * WHAT "NOT MET" IS ALLOWED TO MEAN
 * ============================================================================
 *
 * Only ever: nothing ICEFALL can see reaches this figure. Never: you cannot do
 * this. A climber who has done 2,000 m days for twenty years and installed the
 * app last week has an empty feed, and every `reason` string below is written
 * so that it stays true for that person. Read them before editing one — they
 * are the whole safety margin of this module, and a tidier sentence that drops
 * "recorded" turns a statement about a database into an accusation.
 *
 * A SKILL IS NEVER "not-met". This follows `mountainReadiness.technicalDimension`,
 * which already refuses to put a cross beside a competence nobody was asked
 * about: not having reported crevasse rescue is not evidence of being unable to
 * do it. Skills are `met` or `not-measurable`, and the reason asks.
 *
 * ============================================================================
 * WHAT THIS ENGINE REFUSES TO DO
 * ============================================================================
 *
 * It produces NO SCORE. There is deliberately no percentage, no ratio and no
 * arithmetic between requirements: nine met and one unmet is not 90% ready when
 * the unmet one is the glacier. `mountainReadiness` owns scoring, it already
 * scores on the weakest link rather than a mean, and a second number computed
 * here would inevitably end up on a screen beside the first, disagreeing.
 *
 * It also refuses to run at all on a set no guide has reviewed. See
 * `compareRequirements` — the unusable states return an empty result carrying
 * the sentence the app must say instead.
 */

/* -------------------------------------------------------------------------- */
/* What the athlete brings                                                    */
/* -------------------------------------------------------------------------- */

/** Where a figure came from. The distinction survives to the screen. */
export type Provenance = "recorded" | "self-reported";

export interface Observed<T> {
  value: T;
  provenance: Provenance;
}

/**
 * Everything this engine is allowed to know about the athlete.
 *
 * Passed in rather than read, and deliberately narrow: no activity feed, no
 * profile object, no app state. The caller has already decided what each figure
 * means and where it came from, so this module cannot quietly re-derive a
 * number a different way from `mountainReadiness` and put a second version of
 * it on the same screen.
 *
 * Every field is nullable and null means "ICEFALL has nothing", which is what
 * produces `not-measurable`. None of them may be defaulted to zero.
 */
export interface AthleteFacts {
  /**
   * Competences the athlete has ticked, as the LABELS the profile stores.
   * Mapped to ids here, so a stored label the app no longer offers is dropped
   * rather than half-matched.
   */
  reportedSkillLabels: string[];
  /** Highest point ICEFALL can stand behind, recorded or self-reported. */
  highestAltitude: Observed<number> | null;
  /** Biggest single recorded day of ascent, in the fitness window. */
  biggestDayAscentM: Observed<number> | null;
  /** Longest single recorded day of movement, in hours. */
  longestDayHours: Observed<number> | null;
  /** Weekly ascent averaged over the span ICEFALL has actually observed. */
  weeklyAscentM: Observed<number> | null;
  /** Summits the athlete has MARKED as done. Always self-logged. */
  summits: { name: string; elevationM: number; date: string }[];
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export type RequirementStatus = "met" | "not-met" | "not-measurable";

export interface RequirementResult {
  requirement: StructuredRequirement;
  status: RequirementStatus;
  /**
   * One sentence naming what was compared against what. Safe to render on its
   * own, because it never asserts anything beyond what ICEFALL holds.
   */
  reason: string;
  /** The athlete figure the status turned on, formatted, with its provenance. */
  evidence?: Observed<string>;
  /** True for an unmet line the guide marked `required`. */
  blocker: boolean;
}

export interface RequirementComparison {
  objectiveId: string;
  objectiveName: string;
  routeName?: string;
  state: RequirementSetState;
  /** Empty unless `state === "usable"`. */
  results: RequirementResult[];
  counts: { met: number; notMet: number; notMeasurable: number };
  /** Unmet `required` lines, in the order the guide wrote them. */
  blockers: RequirementResult[];
  /** Who signed the set. Null whenever `state !== "usable"`. */
  attribution: string | null;
  /**
   * The sentence the app must say about this comparison, in every state.
   *
   * On an unusable set this is the whole output — it is what stops a screen
   * rendering "0 requirements met" and calling that a comparison.
   */
  note: string;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

const metres = (n: number) => `${Math.round(n).toLocaleString("en-GB")} m`;
const hours = (n: number) => `${n.toFixed(1)} h`;

/* -------------------------------------------------------------------------- */
/* Per-kind evaluation                                                        */
/* -------------------------------------------------------------------------- */

/** The window wording, kept identical to the one `mountainReadiness` quotes. */
const RECORDED_WINDOW = "the last twelve weeks";

function evaluate(
  requirement: StructuredRequirement,
  facts: AthleteFacts,
  skillIds: Set<AthleteSkillId>,
): Omit<RequirementResult, "requirement" | "blocker"> {
  switch (requirement.kind) {
    /* ---- Skills: met or unknown, never a cross ---------------------------- */
    case "skill": {
      const label = SKILL_LABEL[requirement.skillId] ?? requirement.skillId;
      if (skillIds.has(requirement.skillId)) {
        return {
          status: "met",
          reason: `You have reported "${label}". Self-declared — ICEFALL cannot verify it, and a guide will form their own view.`,
          evidence: { value: label, provenance: "self-reported" },
        };
      }
      return {
        status: "not-measurable",
        reason: `You have not told ICEFALL whether you hold "${label}". Not having mentioned it is not evidence of lacking it, so nothing is marked against you here — but a guide will ask.`,
      };
    }

    /* ---- Altitude actually reached --------------------------------------- */
    case "altitude-reached": {
      const fromSummits = facts.summits.reduce(
        (best, s) => (Number.isFinite(s.elevationM) && s.elevationM > best ? s.elevationM : best),
        0,
      );
      const observed = facts.highestAltitude;
      const best =
        observed && observed.value >= fromSummits
          ? observed
          : fromSummits > 0
            ? ({ value: fromSummits, provenance: "self-reported" } as Observed<number>)
            : observed;

      if (!best) {
        return {
          status: "not-measurable",
          reason: `ICEFALL has no altitude for you — no recorded session reached a height, no summit is marked, and your profile does not give one. This line asks for ${metres(requirement.metres)}.`,
        };
      }
      const source =
        best.provenance === "recorded"
          ? "the highest point a recorded session reached"
          : "what you have told ICEFALL";
      if (best.value >= requirement.metres) {
        return {
          status: "met",
          reason: `${metres(best.value)} — ${source} — is at or above the ${metres(requirement.metres)} this asks for. Having reached an altitude once is not the same as being acclimatised for it on the day.`,
          evidence: { value: metres(best.value), provenance: best.provenance },
        };
      }
      return {
        status: "not-met",
        reason: `The highest ICEFALL has for you is ${metres(best.value)} — ${source} — against ${metres(requirement.metres)} here.`,
        evidence: { value: metres(best.value), provenance: best.provenance },
      };
    }

    /* ---- A single big day ------------------------------------------------- */
    case "single-day-ascent": {
      const best = facts.biggestDayAscentM;
      if (!best) {
        return {
          status: "not-measurable",
          reason: `Nothing is recorded in ${RECORDED_WINDOW}, so ICEFALL has no day to compare against the ${metres(requirement.metres)} this asks for. Record your days and this fills in on its own.`,
        };
      }
      if (best.value >= requirement.metres) {
        return {
          status: "met",
          reason: `Your biggest recorded day in ${RECORDED_WINDOW} climbed ${metres(best.value)}, at or above the ${metres(requirement.metres)} this asks for.`,
          evidence: { value: metres(best.value), provenance: best.provenance },
        };
      }
      return {
        status: "not-met",
        reason: `Your biggest recorded day in ${RECORDED_WINDOW} climbed ${metres(best.value)}, against ${metres(requirement.metres)} here. That is what ICEFALL has seen, not a statement about what you can do.`,
        evidence: { value: metres(best.value), provenance: best.provenance },
      };
    }

    /* ---- A long day on the move ------------------------------------------ */
    case "single-day-duration": {
      const best = facts.longestDayHours;
      if (!best) {
        return {
          status: "not-measurable",
          reason: `Nothing is recorded in ${RECORDED_WINDOW}, so ICEFALL has no day long enough or short enough to compare against the ${requirement.hours} hours this asks for.`,
        };
      }
      if (best.value >= requirement.hours) {
        return {
          status: "met",
          reason: `Your longest recorded day in ${RECORDED_WINDOW} was ${hours(best.value)}, at or above the ${requirement.hours} hours this asks for.`,
          evidence: { value: hours(best.value), provenance: best.provenance },
        };
      }
      return {
        status: "not-met",
        reason: `Your longest recorded day in ${RECORDED_WINDOW} was ${hours(best.value)}, against ${requirement.hours} hours here.`,
        evidence: { value: hours(best.value), provenance: best.provenance },
      };
    }

    /* ---- Weekly volume ---------------------------------------------------- */
    case "weekly-ascent": {
      const avg = facts.weeklyAscentM;
      if (!avg) {
        return {
          status: "not-measurable",
          reason: `There is not enough recorded history to average a week, so ICEFALL cannot compare anything against the ${metres(requirement.metres)} a week this asks for.`,
        };
      }
      if (avg.value >= requirement.metres) {
        return {
          status: "met",
          reason: `You are averaging ${metres(avg.value)} a week over the period ICEFALL can see, at or above the ${metres(requirement.metres)} this asks for.`,
          evidence: { value: `${metres(avg.value)}/week`, provenance: avg.provenance },
        };
      }
      return {
        status: "not-met",
        reason: `You are averaging ${metres(avg.value)} a week over the period ICEFALL can see, against ${metres(requirement.metres)} here.`,
        evidence: { value: `${metres(avg.value)}/week`, provenance: avg.provenance },
      };
    }

    /* ---- Prior summits at height ------------------------------------------ */
    case "prior-summits": {
      const qualifying = facts.summits.filter(
        (s) => Number.isFinite(s.elevationM) && s.elevationM >= requirement.atOrAboveM,
      );
      if (facts.summits.length === 0) {
        return {
          status: "not-measurable",
          reason: `You have not marked any summits in ICEFALL, so there is nothing to count against the ${requirement.count} at or above ${metres(requirement.atOrAboveM)} this asks for. An unmarked summit is invisible to the app, not absent from your record.`,
        };
      }
      if (qualifying.length >= requirement.count) {
        return {
          status: "met",
          reason: `You have marked ${qualifying.length} summit${qualifying.length === 1 ? "" : "s"} at or above ${metres(requirement.atOrAboveM)}, against the ${requirement.count} this asks for. Marked by you, not verified by ICEFALL.`,
          evidence: { value: `${qualifying.length} marked`, provenance: "self-reported" },
        };
      }
      return {
        status: "not-met",
        reason: `You have marked ${qualifying.length} summit${qualifying.length === 1 ? "" : "s"} at or above ${metres(requirement.atOrAboveM)}, against the ${requirement.count} this asks for. Only summits marked in ICEFALL are counted.`,
        evidence: { value: `${qualifying.length} marked`, provenance: "self-reported" },
      };
    }

    /* ---- A climbing grade: honestly out of reach --------------------------- */
    case "technical-grade":
      // Nothing ICEFALL holds records a grade. An activity carries a type, a
      // distance, an ascent and a duration; none of that says what ground it
      // was on, what was led, or who was leading. Inferring a grade from any of
      // it would be the single most dangerous invention in the app.
      return {
        status: "not-measurable",
        reason: `ICEFALL holds no record of the grades you have climbed or led, and will not infer one from training. Your logbook and a guide are the only sources for whether ${requirement.grade} is within your reach.`,
      };

    /* ---- A held qualification: not yet something the app can see ----------- */
    case "certification":
      // Phase 3 of the roadmap adds certificate upload, which is what would make
      // this checkable. Until it exists, saying so is the honest answer.
      return {
        status: "not-measurable",
        reason: `ICEFALL has no way to hold a certificate yet, so it cannot tell whether you have "${requirement.certification}". Bring it to the operator or guide directly.`,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* The engine                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Compare an athlete against one objective's requirement set.
 *
 * THE GATE IS THE FIRST THING THAT HAPPENS. On anything but a signed, populated
 * set this returns an empty comparison carrying `REQUIREMENT_STATE_COPY`, and a
 * caller that renders `note` is telling the truth in all four states without
 * having to know which one it is in.
 */
export function compareRequirements(args: {
  set: ObjectiveRequirementSet | undefined | null;
  objectiveId: string;
  objectiveName: string;
  facts: AthleteFacts;
}): RequirementComparison {
  const state = requirementSetState(args.set);
  const empty = { met: 0, notMet: 0, notMeasurable: 0 };

  if (state !== "usable" || !args.set) {
    return {
      objectiveId: args.objectiveId,
      objectiveName: args.objectiveName,
      routeName: args.set?.routeName,
      state,
      results: [],
      counts: empty,
      blockers: [],
      attribution: null,
      note: REQUIREMENT_STATE_COPY[state],
    };
  }

  const set = args.set;

  // Stored labels the app no longer offers are dropped rather than
  // half-matched. Losing a tick is visible ("not reported"); a wrong match is
  // not, and would credit a competence nobody claimed.
  const skillIds = new Set<AthleteSkillId>();
  for (const label of args.facts.reportedSkillLabels) {
    const id = skillIdForLabel(label);
    if (id) skillIds.add(id);
  }

  const results: RequirementResult[] = set.requirements.map((requirement) => {
    const outcome = evaluate(requirement, args.facts, skillIds);
    return {
      requirement,
      ...outcome,
      blocker: outcome.status === "not-met" && requirement.necessity === "required",
    };
  });

  const counts = {
    met: results.filter((r) => r.status === "met").length,
    notMet: results.filter((r) => r.status === "not-met").length,
    notMeasurable: results.filter((r) => r.status === "not-measurable").length,
  };

  return {
    objectiveId: set.objectiveId,
    objectiveName: set.objectiveName,
    routeName: set.routeName,
    state,
    results,
    counts,
    blockers: results.filter((r) => r.blocker),
    attribution: reviewAttribution(set),
    note: REQUIREMENT_STATE_COPY[state],
  };
}

/* -------------------------------------------------------------------------- */
/* What a usable set can tell readiness                                       */
/* -------------------------------------------------------------------------- */

/**
 * The training figures a reviewed set supplies, where it supplies them.
 *
 * `mountainReadiness` scores fitness against `TRAINING_REFERENCE`, its own
 * per-band benchmarks. Where a guide has written this mountain's actual
 * figures, those are better — they are about the mountain rather than about its
 * elevation band — and this pulls them out so the readiness engine can use them
 * and SAY that it did.
 *
 * A partial answer is normal and fine: a guide may set a day-ascent figure and
 * leave weekly volume alone. The caller falls back per field.
 */
export interface ReviewedTrainingFigures {
  dayAscentM?: number;
  sustainedHours?: number;
  weeklyAscentM?: number;
}

export function reviewedTrainingFigures(
  set: ObjectiveRequirementSet | undefined | null,
): ReviewedTrainingFigures | null {
  if (requirementSetState(set) !== "usable" || !set) return null;

  const figures: ReviewedTrainingFigures = {};
  for (const r of set.requirements) {
    // The LARGEST stands where a guide wrote several of a kind. A set saying
    // "1,000 m days, and 1,400 m before the summit push" is asking for 1,400;
    // taking the first or the smallest would quietly relax the harder line.
    if (r.kind === "single-day-ascent")
      figures.dayAscentM = Math.max(figures.dayAscentM ?? 0, r.metres);
    if (r.kind === "single-day-duration")
      figures.sustainedHours = Math.max(figures.sustainedHours ?? 0, r.hours);
    if (r.kind === "weekly-ascent")
      figures.weeklyAscentM = Math.max(figures.weeklyAscentM ?? 0, r.metres);
  }
  return Object.keys(figures).length > 0 ? figures : null;
}

/**
 * The competences a reviewed set names, as labels, in the guide's order.
 *
 * `mountainReadiness.technicalDimension` scores against `assessPeak`'s per-band
 * skill list. Where a guide has named the competences THIS mountain asks for,
 * these replace that list.
 */
export function reviewedSkillLabels(set: ObjectiveRequirementSet | undefined | null): string[] {
  if (requirementSetState(set) !== "usable" || !set) return [];
  return set.requirements
    .filter((r): r is Extract<StructuredRequirement, { kind: "skill" }> => r.kind === "skill")
    .map((r) => SKILL_LABEL[r.skillId] ?? r.skillId);
}
