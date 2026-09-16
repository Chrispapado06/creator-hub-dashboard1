import { requirementSetFor } from "@/data/mock/mountainRequirements";
import { compareRequirements, type AthleteFacts, type Observed } from "@/objectives/compare";
import { requirementSetState, type RequirementSetState } from "@/objectives/requirements";
import type { RequirementComparison } from "@/objectives/compare";
import { PLAN_MIN_WEEKS } from "@/tracking/planLength";
import type { NewAdjustment } from "@/tracking/adjustments";
import type { Mountain, TrainingPlan } from "@/types";

/**
 * WHAT NEXT — AND WHY THIS MODULE REFUSES TO ANSWER THAT QUESTION.
 *
 * ============================================================================
 * THE ROADMAP ASKS FOR A RECOMMENDATION. THE APP CANNOT HONESTLY MAKE ONE.
 * ============================================================================
 *
 * The line is "proposes the next objective and a bridge plan. This protects
 * subscriptions once the trip is over." Both halves of that sentence are true
 * and the second one is exactly why this file has to be careful: the commercial
 * incentive is to hand somebody a bigger mountain the week they come home, and
 * the app has no basis whatsoever for choosing which one.
 *
 * Here is everything ICEFALL holds that bears on the question:
 *
 *   · A CATALOGUE OF FOURTEEN MOUNTAINS, each with a real elevation, a real
 *     country and a `difficultyLabel` a human wrote. Facts, quotable.
 *   · STRUCTURED REQUIREMENTS for those fourteen, all of which are
 *     `unreviewed` and empty — see `data/mock/mountainRequirements.ts`, where
 *     that is the finished state and not an unfinished one.
 *   · THE ATHLETE'S OWN RECORD, measured and self-reported, kept apart.
 *
 * So a ranking by readiness is not available: the only thing a comparison
 * engine could compare against is a requirement set nobody has signed, and
 * `compare.ts` correctly returns nothing for every one of them. This module
 * therefore produces a SHORTLIST, states in its own first sentence that it is
 * not a recommendation, and runs `compareRequirements` on every candidate
 * anyway — so that the day a guide signs a set, the same code starts printing
 * real blockers without a line changing.
 *
 * ============================================================================
 * THE THREE THINGS IT MAY NOT INVENT
 * ============================================================================
 *
 * A MOUNTAIN. Candidates come from the catalogue passed in. Nothing here
 * composes a name, and an empty catalogue produces an empty list with a reason,
 * never a suggestion.
 *
 * A DATE. `dateNote` is the only thing this module says about timing and it
 * does not contain one. What it does carry is a FACT about the generator that
 * an athlete cannot otherwise discover: `buildPlanForGoal` never builds a plan
 * shorter than `PLAN_MIN_WEEKS`, so a target date closer than that produces a
 * plan whose last weeks fall after the objective. Naming a constraint is not
 * naming a date.
 *
 * A DIFFICULTY. Every difficulty word on a candidate is `Mountain.difficultyLabel`
 * copied out of the catalogue. This module computes no grade, no score and no
 * "step up", and the ORDERING — which is the place a difficulty judgement would
 * hide — is by height above the athlete's own held altitude and says so in
 * `basis`, along with why height is the weakest possible ordering.
 *
 * ============================================================================
 * THE BRIDGE PLAN IS A RECORD OF THE PAST, NOT A PRESCRIPTION
 * ============================================================================
 *
 * ICEFALL holds no rule for how long anybody should rest after an expedition.
 * It is not in `training.ts`, no guide has given us one, and inventing a number
 * of recovery days would be the same class of error as inventing a threshold in
 * `mountainRequirements.ts`. So the bridge proposes NO recovery.
 *
 * What it does propose is the one thing that is a fact: the athlete was on a
 * mountain between two dates, so the sessions the generator had pencilled in
 * for those days did not happen. `bridgeProposals` turns exactly those days
 * into rest, in Phase 2's own closed vocabulary, through `NewAdjustment` —
 * which means the plan screen, the history screen and Undo all work on them
 * unchanged, and means they CANNOT make a day harder, because `PlanChange` has
 * no verb that could.
 *
 * Nothing here writes. `addAdjustments` is the athlete's tap, on the screen.
 */

/* -------------------------------------------------------------------------- */
/* Candidates                                                                 */
/* -------------------------------------------------------------------------- */

export interface ObjectiveCandidate {
  mountainId: string;
  name: string;
  /** From the catalogue. Never computed. */
  elevationM: number;
  /** From the catalogue, word for word. Never computed. */
  difficultyLabel: string;
  country: string;
  range: string;
  /**
   * How far this summit stands above the highest altitude ICEFALL holds for the
   * athlete, with the provenance of that altitude — or null when ICEFALL holds
   * no altitude at all and the subtraction has nothing to stand on.
   *
   * A NUMBER, NOT A VERDICT. `aboveHeldM` of 1,200 says this summit is 1,200 m
   * higher than the highest point ICEFALL has for you. It does not say the
   * mountain is harder, and `basis` says so on the screen.
   */
  aboveHeldM: number | null;
  /** The comparison, always run. Today every one of these is `unreviewed`. */
  comparison: RequirementComparison;
  /** Short form of the above, so a list row does not have to reach into it. */
  requirementState: RequirementSetState;
  /** True when a summit log already names this peak. Self-logged, and labelled. */
  alreadyLogged: boolean;
}

export interface BridgeProposal {
  /** Phase 2 records, unsaved. The closed vocabulary, and `rest` only. */
  proposals: NewAdjustment[];
  /** What these do, in the app's words. Rendered above the accept control. */
  note: string;
  /** Set when there is nothing to propose, saying why. Null when there is. */
  none: string | null;
}

export interface NextObjectiveProposal {
  /** The first line on the screen. Says what this is and is not. */
  headline: string;
  candidates: ObjectiveCandidate[];
  /** What the ordering means, and what it does not mean. */
  basis: string;
  /**
   * `basis` for a screen with room for two lines (Home's "just back" cards).
   * It keeps the three things `basis` exists to say — what the order is, what
   * figure it hangs on and whether anyone verified it, and that height is not
   * difficulty — and drops only the elaboration. Owned here so the wording has
   * one author.
   */
  basisShort: string;
  /** ICEFALL's whole answer on timing. Contains no date. */
  dateNote: string;
  /** What ICEFALL could check about these mountains, which today is nothing. */
  requirementNote: string;
  bridge: BridgeProposal;
  /**
   * The altitude the ordering is measured from, WITH ITS PROVENANCE. Null when
   * ICEFALL holds none.
   *
   * Carried because the whole shortlist turns on this one figure, and on the
   * screen where it most matters — straight after a debrief in which somebody
   * has just typed a new high point into a form — it is a self-reported number
   * doing the ordering. Rule 4 does not stop applying because the figure is an
   * input rather than an output: `basis` names it and names where it came from.
   */
  heldAltitude: Observed<number> | null;
  /** Set when no shortlist could be produced at all, and why. */
  unavailable: string | null;
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

export const NEXT_OBJECTIVE_HEADLINE =
  "A shortlist, not a recommendation. ICEFALL has not assessed you and does not know which of these you are ready for — these are the objectives it holds a record for, with the one fact it can put beside each of them.";

const BASIS_WITH_ALTITUDE =
  "Ordered by how far each summit stands above the highest altitude ICEFALL holds for you. Height is the ONLY dimension ICEFALL can compare, and it is the weakest one there is: a glaciated 4,000 m north face is not easier than a 5,800 m walk-up, and nothing in this order says otherwise.";

const metresOf = (n: number) => `${Math.round(n).toLocaleString("en-GB")} m`;

/**
 * The second half of `basis`: the figure the order turns on, and where it came
 * from.
 *
 * This sentence is not optional politeness. The most likely moment anybody
 * reads this shortlist is immediately after a post-trip debrief in which they
 * typed a new high point — so the number driving the whole ordering can be
 * minutes old, unverified, and entered by the person reading it. Saying so is
 * rule 4, and it is the difference between an ordering and an endorsement.
 */
function basisSource(held: Observed<number>): string {
  return held.provenance === "recorded"
    ? `The figure it is measured from is ${metresOf(held.value)} — the highest point a recorded session reached.`
    : `The figure it is measured from is ${metresOf(held.value)}, which is what you have told ICEFALL. Nobody has verified it, and an order built on a self-reported number is no better than the number.`;
}

function basisShortFor(held: Observed<number> | null): string {
  if (!held) return "In catalogue order by elevation — that order means nothing about you.";
  const figure =
    held.provenance === "recorded"
      ? `${metresOf(held.value)}, the highest point you have recorded`
      : `${metresOf(held.value)}, a figure you gave that nobody has verified`;
  return `Ordered by height above ${figure}. Height says nothing about difficulty.`;
}

const BASIS_WITHOUT_ALTITUDE =
  "ICEFALL holds no altitude for you — nothing recorded reached a height, no summit is marked, and your profile gives none — so it cannot even do the crude height comparison. These are in catalogue order by elevation, and that order means nothing about you.";

const DATE_NOTE = `ICEFALL does not choose a date and will not suggest one: when you go depends on the season, the permit, the operator and your life, and none of those are in the app. One thing worth knowing before you pick — the plan generator never builds a block shorter than ${PLAN_MIN_WEEKS} weeks, so a target date closer than that produces a plan whose last weeks fall after the objective itself.`;

export const NEXT_OBJECTIVE_NO_CATALOGUE =
  "ICEFALL holds no mountain records to draw a shortlist from, so it offers none. It will not compose a name.";

/* -------------------------------------------------------------------------- */
/* The shortlist                                                              */
/* -------------------------------------------------------------------------- */

export interface NextObjectiveInput {
  /** The catalogue. Passed in; this module never reaches for one. */
  catalogue: readonly Mountain[];
  /** The athlete's record, in the shape `compare.ts` already defines. */
  facts: AthleteFacts;
  /** The objective just finished, excluded from its own shortlist. */
  finishedMountainId?: string;
  /** How many to offer. The screen's choice, not this module's. */
  limit?: number;
  /** The bridge, already built. Kept separate so the shortlist stays pure. */
  bridge: BridgeProposal;
}

/**
 * The highest altitude ICEFALL holds, folding marked summits in the same way
 * `compare.ts` does — so this module and the comparison engine cannot disagree
 * about the athlete's ceiling on the same screen.
 */
export function heldAltitude(facts: AthleteFacts): Observed<number> | null {
  const fromSummits = facts.summits.reduce(
    (best, s) => (Number.isFinite(s.elevationM) && s.elevationM > best ? s.elevationM : best),
    0,
  );
  const observed = facts.highestAltitude;
  if (observed && observed.value >= fromSummits) return observed;
  if (fromSummits > 0) return { value: fromSummits, provenance: "self-reported" };
  return observed;
}

export function proposeNextObjective(input: NextObjectiveInput): NextObjectiveProposal {
  const held = heldAltitude(input.facts);
  const loggedNames = new Set(input.facts.summits.map((s) => s.name.trim().toLowerCase()));

  const pool = input.catalogue.filter((m) => m.id !== input.finishedMountainId);

  if (pool.length === 0) {
    return {
      headline: NEXT_OBJECTIVE_HEADLINE,
      candidates: [],
      basis: held ? `${BASIS_WITH_ALTITUDE} ${basisSource(held)}` : BASIS_WITHOUT_ALTITUDE,
      basisShort: basisShortFor(held),
      dateNote: DATE_NOTE,
      requirementNote: requirementNoteFor([]),
      bridge: input.bridge,
      heldAltitude: held,
      unavailable: NEXT_OBJECTIVE_NO_CATALOGUE,
    };
  }

  const candidates: ObjectiveCandidate[] = pool.map((m) => {
    const set = requirementSetFor(m);
    return {
      mountainId: m.id,
      name: m.name,
      elevationM: m.elevationM,
      difficultyLabel: m.difficultyLabel,
      country: m.country,
      range: m.range,
      aboveHeldM: held ? Math.round(m.elevationM - held.value) : null,
      /* PHASE 3, ON EVERY CANDIDATE, EVERY TIME. Today this returns the
         unreviewed early exit for all fourteen. It is called anyway so that the
         first signed set starts printing real lines here with no edit. */
      comparison: compareRequirements({
        set,
        objectiveId: m.id,
        objectiveName: m.name,
        facts: input.facts,
      }),
      requirementState: requirementSetState(set),
      alreadyLogged: loggedNames.has(m.name.trim().toLowerCase()),
    };
  });

  /*
   * THE ORDER. Nearest above the held altitude first, then the rest of the ones
   * above it, then everything at or below it by descending height.
   *
   * It is a sort on one measured number and it is described on the screen. What
   * it is NOT is a difficulty ranking, and the `basis` string is not decoration
   * — it is the sentence that stops the first row being read as "do this next".
   */
  const ordered = held
    ? [...candidates].sort((a, b) => rank(a.aboveHeldM) - rank(b.aboveHeldM))
    : [...candidates].sort((a, b) => a.elevationM - b.elevationM);

  const limited =
    typeof input.limit === "number" && input.limit > 0 ? ordered.slice(0, input.limit) : ordered;

  return {
    headline: NEXT_OBJECTIVE_HEADLINE,
    candidates: limited,
    basis: held ? `${BASIS_WITH_ALTITUDE} ${basisSource(held)}` : BASIS_WITHOUT_ALTITUDE,
      basisShort: basisShortFor(held),
    dateNote: DATE_NOTE,
    requirementNote: requirementNoteFor(limited),
    bridge: input.bridge,
    heldAltitude: held,
    unavailable: null,
  };
}

/**
 * Above the held altitude sorts by how little it exceeds it; at or below sorts
 * after everything above, highest first. Expressed as one key so the comparator
 * is a subtraction and cannot accidentally become a series of tie-breaks that
 * encode a judgement.
 */
function rank(aboveHeldM: number | null): number {
  if (aboveHeldM === null) return Number.MAX_SAFE_INTEGER;
  return aboveHeldM > 0 ? aboveHeldM : Number.MAX_SAFE_INTEGER / 2 - aboveHeldM;
}

/**
 * What ICEFALL could check about the shortlist — which today, for every
 * mountain in it, is nothing. Said once, plainly, rather than repeated as a
 * shrug on every row.
 */
function requirementNoteFor(candidates: readonly ObjectiveCandidate[]): string {
  const usable = candidates.filter((c) => c.requirementState === "usable");
  if (candidates.length === 0) {
    return "There is nothing to check.";
  }
  if (usable.length === 0) {
    return "None of these mountains has had its written requirements reviewed by a certified guide, so ICEFALL compares you against none of them. What you see beside each one is its elevation and the words the catalogue already carries — not an assessment.";
  }
  if (usable.length === candidates.length) {
    return "Each of these has reviewed requirements, and what ICEFALL holds for you has been checked line by line against them. Open one to see which lines it could not check at all.";
  }
  return `${usable.length} of these ${candidates.length} have reviewed requirements and have been checked line by line. The rest have not been reviewed by a guide, so ICEFALL compares you against nothing on them.`;
}

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

export const BRIDGE_NO_RECOVERY_RULE =
  "ICEFALL proposes no recovery. It holds no rule for how long anybody should rest after an expedition — no guide has given it one and it will not invent a number of days. What comes next is a conversation for you, your coach or your guide.";

const BRIDGE_NOTE =
  "You were on the mountain on these days, so the sessions the plan had pencilled in for them did not happen. Accepting turns those days into rest, as a record of what was true. Nothing is made harder — the plan-change vocabulary has no verb that could — and every one of these can be undone from the plan history.";

/**
 * Rest the plan days that fall inside the trip, and propose nothing else.
 *
 * PURE, and it returns `NewAdjustment` rather than saving: the athlete's tap on
 * the screen calls `addAdjustments`, which stamps the batch so Undo takes all
 * of them together — a half-undone week is a week nobody chose.
 *
 * Days already marked `completed` are left alone. A session ticked off is a
 * session something satisfied, and overwriting it with rest would delete a
 * fact to tidy the calendar.
 */
export function bridgeProposals(args: {
  plan: TrainingPlan | null | undefined;
  goalId: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  startedOn: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  endedOn: string;
  objectiveName: string;
}): BridgeProposal {
  const from = isoDay(args.startedOn);
  const to = isoDay(args.endedOn);

  if (from === null || to === null || from > to) {
    return {
      proposals: [],
      note: BRIDGE_NOTE,
      none: "ICEFALL could not read the dates of the trip, so it has not touched the plan. Nothing was guessed at.",
    };
  }

  if (!args.plan) {
    return {
      proposals: [],
      note: BRIDGE_NOTE,
      none: "There is no training plan for this objective, so there are no days to clear.",
    };
  }

  const why = `Away on ${args.objectiveName}`.slice(0, 240);

  const proposals: NewAdjustment[] = [];
  for (const week of args.plan.weeks) {
    for (const day of week.days) {
      if (day.date < from || day.date > to) continue;
      if (day.focus === "rest") continue;
      if (day.completed) continue;
      proposals.push({ goalId: args.goalId, date: day.date, change: { kind: "rest" }, why, by: "athlete" });
    }
  }

  if (proposals.length === 0) {
    return {
      proposals: [],
      note: BRIDGE_NOTE,
      none: "The plan had no outstanding sessions on the days you were away, so there is nothing to clear.",
    };
  }

  return { proposals, note: BRIDGE_NOTE, none: null };
}

function isoDay(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return Number.isFinite(Date.parse(`${raw}T00:00:00Z`)) ? raw : null;
}
