import { fmtDate, fmtElevation } from "@/lib/format";
import {
  BLOCK_LOAD,
  DELOAD_EVERY,
  DELOAD_SCALE,
  parseBlockLabel,
  planSessionsInWeek,
  planShapeFor,
  type PlanShapeSummary,
  type TrainingShape,
} from "@/tracking/training";
import {
  isUsable,
  reviewAttribution,
  type ObjectiveRequirementSet,
  type StructuredRequirement,
} from "@/objectives/requirements";
import type {
  Goal,
  Mountain,
  MountainRoute,
  TrainingDay,
  TrainingPlan,
  TrainingWeek,
} from "@/types";

/**
 * WHY THIS SESSION, THIS SIZE, THIS WEEK — DERIVED, NEVER WRITTEN.
 *
 * ============================================================================
 * THE PROBLEM THIS REPLACES
 * ============================================================================
 *
 * The session screen already answers "what does this session train": that is
 * `purposeFor` in `coach/sessions.ts`, and it is a fixed paragraph per training
 * focus with the objective's name dropped into a clause. It is true, it is well
 * written, and it is the same paragraph for a Base week and a Peak week, for
 * Toubkal and for Everest, for an athlete's first Saturday and their last one.
 *
 * The roadmap asks for a different sentence — "Saturday's 1,200 m day is there
 * because summit day is 1,000 m+ after a 2 a.m. start" — and what makes that
 * sentence worth reading is not its tone. It is that both numbers in it are
 * real: one from the athlete's plan, one from the mountain. A sentence of the
 * same shape with invented numbers would read identically and be worthless,
 * which is exactly why this module cannot be a template that a model or an
 * author fills in.
 *
 * ============================================================================
 * THE RULE, ENFORCED BY THE TYPE
 * ============================================================================
 *
 * `SessionReason.figures` is a NON-EMPTY TUPLE. A reason with no figure in it
 * cannot be constructed — not discouraged, impossible — and every figure
 * carries the phrase naming where it came from. `sessionReason.test.ts` then
 * asserts the other half: every figure's printed form appears verbatim in the
 * sentence. Between the two, a rung of the ladder below cannot degrade into a
 * platitude without failing to compile or failing the suite.
 *
 * When no rung can produce a figure, this returns NULL and the screen shows
 * nothing. That is the required behaviour, not a gap: a day whose reason cannot
 * be derived gets silence, because the alternative — "today builds your base" —
 * is the thing the roadmap is asking to be replaced.
 *
 * ============================================================================
 * THE LADDER
 * ============================================================================
 *
 * Strongest first, first match wins, one reason per day:
 *
 *   1. guide-requirement  a certified guide put a figure on this objective and
 *                         today's session works toward that exact figure. The
 *                         only rung that quotes a human; carries their names.
 *   2. deload             the week itself is the reason this session is small.
 *   3. taper              likewise, and it dominates everything else.
 *   4. route-ascent       today's vertical against the objective's own route.
 *                         This is the roadmap's example sentence.
 *   5. route-duration     today's hours against how long the route takes.
 *   6. week-ascent        the week's total vertical against the route's.
 *   7. build-up           the athlete's own ramp: where this week sits in it.
 *   8. block              where the week sits in the plan, and what that does
 *                         to its volume.
 *
 * Rungs 4–6 need a CURATED mountain with a surveyed route. A goal typed by hand
 * has none, so those rungs never fire for one and the athlete drops to 7 or 8 —
 * which say true things about their plan without claiming anything about a
 * mountain ICEFALL has not surveyed.
 *
 * NOTHING HERE IS SAFETY-BEARING and nothing here decides anything. It is the
 * explanation of a session the engines already built.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type SessionReasonKind =
  | "guide-requirement"
  | "deload"
  | "taper"
  | "route-ascent"
  | "route-duration"
  | "week-ascent"
  | "build-up"
  | "block";

/**
 * One number the sentence prints, and where it came from.
 *
 * `printed` is the exact substring that appears in `text`, so a screen can
 * highlight it and the test can prove the sentence is made of these rather than
 * of adjectives. `from` is the phrase a person would answer "says who?" with.
 */
export interface ReasonFigure {
  printed: string;
  from: string;
}

export interface SessionReason {
  kind: SessionReasonKind;
  /** The sentence shown under the session. Two clauses at most. */
  text: string;
  /** AT LEAST ONE. The tuple is the rule; see the header. */
  figures: [ReasonFigure, ...ReasonFigure[]];
  /**
   * Who stands behind the sentence, in one line, shown under it.
   *
   * Never omitted and never softened. Where a rung reads ICEFALL's own curated
   * record rather than a guide's signature, it says so — the athlete should be
   * able to tell a figure two IFMGA guides signed from one this app typed.
   */
  attribution: string;
}

export interface SessionReasonInput {
  day: TrainingDay;
  week: TrainingWeek;
  plan: TrainingPlan;
  goal: Goal;
  /** The curated record, when the objective is one of the surveyed mountains. */
  mountain?: Mountain;
  /** The guide-reviewed requirement set, when one exists for this objective. */
  requirements?: ObjectiveRequirementSet | null;
  /** The athlete's own answers, so the build-up rung can read its own ramp. */
  shape?: TrainingShape;
}

/* -------------------------------------------------------------------------- */
/* Printing                                                                    */
/* -------------------------------------------------------------------------- */

const metres = (m: number) => `${fmtElevation(m)} m`;

/** "5 h" / "4.5 h". Never "300 min" — nobody plans a Saturday in minutes. */
function hours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : Math.round(h * 10) / 10} h`;
}

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** "2.2×" — how many times over. Only ever printed above 1. */
const times = (part: number, whole: number) => `${Math.round((part / whole) * 10) / 10}×`;

const weekday = (iso: string) =>
  fmtDate(iso, { weekday: "long", day: undefined, month: undefined, year: undefined });

/* -------------------------------------------------------------------------- */
/* Reading the plan                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The route the rest of the app already measures this objective by.
 *
 * `computePreparation` takes the route with the greatest vertical gain and
 * calls it what the objective demands. This function has to pick the SAME one,
 * or the session screen would name one route's figure while the Training screen
 * scores the athlete against another's — two numbers, both real, that cannot
 * both be "what the mountain asks".
 */
function referenceRoute(mountain: Mountain | undefined): MountainRoute | null {
  if (!mountain || mountain.routes.length === 0) return null;
  return mountain.routes.reduce((best, r) => (r.elevationGainM > best.elevationGainM ? r : best));
}

/** Total vertical this week's days prescribe. 0 when no day carries any. */
function weekAscent(week: TrainingWeek): number {
  return week.days.reduce((sum, d) => sum + (d.elevationM ?? 0), 0);
}

/** True when no other day of the week asks for more vertical than this one. */
function isBiggestClimbOfWeek(day: TrainingDay, week: TrainingWeek): boolean {
  if (!day.elevationM) return false;
  return week.days.every((d) => d.date === day.date || (d.elevationM ?? 0) <= day.elevationM!);
}

/* -------------------------------------------------------------------------- */
/* Rung 1 — a guide's own figure                                               */
/* -------------------------------------------------------------------------- */

/**
 * The reviewed requirement today's session actually works toward.
 *
 * Only three of the eight requirement kinds have a matching figure on a planned
 * day — an ascent, a duration, a weekly total. A `technical-grade` line is a
 * true thing about the mountain and has nothing to do with why Tuesday is 70
 * minutes, so quoting it here would be provenance theatre: a guide's name
 * attached to a sentence the guide did not make.
 *
 * `required` beats `recommended` within a kind, because the required line is
 * the one that decides whether the athlete goes.
 */
function guideLineFor(
  set: ObjectiveRequirementSet,
  day: TrainingDay,
  ascentThisWeek: number,
): StructuredRequirement | null {
  const usable = set.requirements.filter((r) => {
    if (r.kind === "single-day-ascent") return (day.elevationM ?? 0) > 0;
    if (r.kind === "single-day-duration") return (day.durationMin ?? 0) > 0;
    if (r.kind === "weekly-ascent") return ascentThisWeek > 0;
    return false;
  });
  if (usable.length === 0) return null;

  const order: StructuredRequirement["kind"][] = [
    "single-day-ascent",
    "single-day-duration",
    "weekly-ascent",
  ];
  for (const kind of order) {
    const ofKind = usable.filter((r) => r.kind === kind);
    const required = ofKind.find((r) => r.necessity === "required");
    if (required) return required;
    if (ofKind.length > 0) return ofKind[0];
  }
  return null;
}

function guideReason(input: SessionReasonInput, ascentThisWeek: number): SessionReason | null {
  const set = input.requirements;
  // `isUsable` is the narrowing guard from step 1: a set nobody signed, or a
  // signed set with no figures in it, is not something to quote at anybody.
  if (!isUsable(set)) return null;

  const line = guideLineFor(set, input.day, ascentThisWeek);
  if (!line) return null;

  const attribution = reviewAttribution(set) ?? set.objectiveName;
  const objective = set.objectiveName;

  if (line.kind === "single-day-ascent") {
    const today = input.day.elevationM!;
    const asked = line.metres;
    const mine = metres(today);
    const theirs = metres(asked);
    const text =
      today >= asked
        ? `Today's ${mine} clears the ${theirs} single-day ascent ${objective} asks for. ${line.why}`
        : `Today's ${mine} is ${percent(today, asked)} of the ${theirs} single-day ascent ${objective} asks for. ${line.why}`;
    return {
      kind: "guide-requirement",
      text,
      figures:
        today >= asked
          ? [
              { printed: mine, from: "your plan" },
              { printed: theirs, from: `${objective}, reviewed requirement` },
            ]
          : [
              { printed: mine, from: "your plan" },
              { printed: percent(today, asked), from: "the two figures beside it" },
              { printed: theirs, from: `${objective}, reviewed requirement` },
            ],
      attribution,
    };
  }

  if (line.kind === "single-day-duration") {
    const today = hours(input.day.durationMin!);
    const asked = `${line.hours} h`;
    return {
      kind: "guide-requirement",
      text: `${today} on the move today, against the ${asked} day ${objective} asks you to have done. ${line.why}`,
      figures: [
        { printed: today, from: "your plan" },
        { printed: asked, from: `${objective}, reviewed requirement` },
      ],
      attribution,
    };
  }

  /* `guideLineFor` only ever returns one of the three kinds above, so this is
     unreachable — but narrowing it here is what lets the compiler check the
     field access below rather than a cast doing it by assertion. */
  if (line.kind !== "weekly-ascent") return null;

  const mine = metres(ascentThisWeek);
  const theirs = metres(line.metres);
  return {
    kind: "guide-requirement",
    text: `This week prescribes ${mine} of climbing, against the ${theirs} a week ${objective} asks for. ${line.why}`,
    figures: [
      { printed: mine, from: "your plan, this week's days added up" },
      { printed: theirs, from: `${objective}, reviewed requirement` },
    ],
    attribution,
  };
}

/* -------------------------------------------------------------------------- */
/* Rungs 2–3 — the week is the reason                                          */
/* -------------------------------------------------------------------------- */

/**
 * Where a rung that reads a curated record, rather than a guide's signature,
 * has to say so.
 *
 * This is the sentence that keeps rungs 4–6 honest. ICEFALL's fourteen records
 * are carefully written and they are not reviewed; an athlete comparing today's
 * vertical against a route's should be able to tell that apart from a figure
 * two guides signed, at a glance, without opening the requirements screen.
 */
function curatedAttribution(mountain: Mountain, route: MountainRoute): string {
  return `Your plan, against ICEFALL's record of the ${route.name} on ${mountain.name}. No guide has reviewed that route's figures.`;
}

function planAttribution(): string {
  return "Your plan — the objective's date, and the answers you gave about your week.";
}

/**
 * The build-up sentence, written once and reached from two rungs.
 *
 * It sits both above and below the mountain rungs (see the ladder), so it has
 * to be one function. Two copies of a sentence containing five figures is two
 * sentences that will one day print different numbers for the same week.
 */
function buildUpReason(
  weekIndex: number,
  shape: PlanShapeSummary,
  sessionsThisWeek: number,
): SessionReason {
  const start = `${shape.startSessions} sessions`;
  const full = `${shape.fullSessions} sessions`;
  const now = `${sessionsThisWeek} sessions`;
  const span = `${shape.rampWeeks}-week`;
  return {
    kind: "build-up",
    text: `Week ${weekIndex} of a ${span} build-up. The plan started you at ${start} a week — one more than you said you were already doing — and adds one every second week until it reaches the ${full} your training days allow. This week carries ${now}.`,
    figures: [
      { printed: `Week ${weekIndex}`, from: "your plan" },
      { printed: span, from: "your answer about what you already train" },
      { printed: start, from: "your answer about what you already train" },
      { printed: full, from: "the training days you gave" },
      { printed: now, from: "your plan" },
    ],
    attribution: planAttribution(),
  };
}

/* -------------------------------------------------------------------------- */
/* The ladder                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The reason today's session is here and this size, or null.
 *
 * PURE, and it must stay pure: the same day, plan and objective always produce
 * the same sentence. Nothing here reads state, a clock or a store — the two
 * screens that show a reason must never show different ones.
 */
export function sessionReasonFor(input: SessionReasonInput): SessionReason | null {
  const { day, week, plan, goal, mountain } = input;

  /* A rest day already carries its own reason, written by the generator into
     `detail` — "you gave us this day; the plan is building up to it", or "you
     gave us every day; the plan keeps one back". A second sentence explaining
     the same silence would either repeat it or contradict it. */
  if (day.focus === "rest") return null;

  const block = parseBlockLabel(week.block);
  // A block label this app did not write. Nothing can be said about a phase
  // that cannot be identified, so nothing is.
  if (!block) return null;

  const ascentThisWeek = weekAscent(week);
  const route = referenceRoute(mountain);

  /* 1 — a guide's figure, where one exists. */
  const guide = guideReason(input, ascentThisWeek);
  if (guide) return guide;

  /* 2 — a deload week. The week, not the session, is why today is small. */
  if (block.deload) {
    const dropped = `${Math.round(DELOAD_SCALE * 100)}%`;
    const every = `every ${DELOAD_EVERY}th week`;
    return {
      kind: "deload",
      text: `Week ${week.index} is a deload: ${every} drops to ${dropped} of what its block would otherwise ask, so the weeks before it are absorbed rather than only survived.`,
      figures: [
        { printed: `Week ${week.index}`, from: "your plan" },
        { printed: every, from: "the plan generator's deload rule" },
        { printed: dropped, from: "the plan generator's deload rule" },
      ],
      attribution: planAttribution(),
    };
  }

  /* 3 — the taper. Dominates every other reason once it starts. */
  if (block.kind === "taper") {
    const share = `${Math.round((BLOCK_LOAD.taper / BLOCK_LOAD.build) * 100)}%`;
    const date = fmtDate(goal.targetDate);
    return {
      kind: "taper",
      text: `Taper: the plan drops to ${share} of a Build week's volume so that the work behind you has become fitness by ${date}, rather than fatigue you carry onto the mountain.`,
      figures: [
        { printed: share, from: "the plan generator's block loads" },
        { printed: date, from: "your objective's date" },
      ],
      attribution: planAttribution(),
    };
  }

  /* 3b — the athlete's own build-up, WHILE IT IS STILL THE BINDING CONSTRAINT.
     Above the mountain rungs on purpose. In these weeks the honest answer to
     "why is Saturday only 996 m when the route gains 2,400" is not the route at
     all — it is that the plan is deliberately starting below the block, from
     what this athlete said they already do. Quoting the mountain here would
     answer a question the athlete did not ask and leave the one they did ask
     unanswered.

     It steps aside the moment the ramp stops binding — once the week carries
     the athlete's full session count, the build-up is no longer why anything is
     the size it is, and the mountain becomes the better answer. */
  const shape = planShapeFor(input.shape);
  const sessionsThisWeek = planSessionsInWeek(input.shape, week.index);
  const rampBinding =
    shape.rampWeeks > 0 && week.index <= shape.rampWeeks && sessionsThisWeek < shape.fullSessions;
  if (rampBinding) return buildUpReason(week.index, shape, sessionsThisWeek);

  /* 4 — today's vertical against the objective's own. The roadmap's example. */
  if (route && day.elevationM && day.elevationM > 0 && route.elevationGainM > 0) {
    const mine = metres(day.elevationM);
    const theirs = metres(route.elevationGainM);
    const share = percent(day.elevationM, route.elevationGainM);
    const biggest = isBiggestClimbOfWeek(day, week);
    const opening = biggest
      ? `${weekday(day.date)}'s ${mine} is the biggest climb in your week.`
      : `Today asks for ${mine}.`;
    return {
      kind: "route-ascent",
      text: `${opening} The ${route.name} gains ${theirs}, so today is ${share} of the objective's own ascent.`,
      figures: [
        { printed: mine, from: "your plan" },
        { printed: theirs, from: `ICEFALL's record of the ${route.name}` },
        { printed: share, from: "the two figures beside it" },
      ],
      attribution: curatedAttribution(mountain!, route),
    };
  }

  /* 5 — today's hours against how long the route is described as taking.
     `durationLabel` is prose ("10–12 hours") and is quoted VERBATIM rather than
     parsed: a range turned into a number is a figure nobody wrote down. */
  if (route && day.durationMin && day.durationMin >= 120 && route.durationLabel.trim()) {
    const mine = hours(day.durationMin);
    const theirs = route.durationLabel.trim();
    return {
      kind: "route-duration",
      text: `${mine} on the move today. ICEFALL's record describes the ${route.name} as ${theirs}, and this is the session that builds toward it.`,
      figures: [
        { printed: mine, from: "your plan" },
        { printed: theirs, from: `ICEFALL's record of the ${route.name}` },
      ],
      attribution: curatedAttribution(mountain!, route),
    };
  }

  /* 6 — the week's total against the route's, for a day carrying no vertical
     of its own. This is how a strength Tuesday still gets a real reason.

     Two framings, and the split is not cosmetic: "0.6×" is arithmetic nobody
     reads as a quantity, while "56% of" is the same fact in the form a person
     actually compares with. Above one, the multiple is the readable form. */
  if (route && ascentThisWeek > 0 && route.elevationGainM > 0) {
    const mine = metres(ascentThisWeek);
    const theirs = metres(route.elevationGainM);
    const over = ascentThisWeek >= route.elevationGainM;
    const ratio = over
      ? times(ascentThisWeek, route.elevationGainM)
      : percent(ascentThisWeek, route.elevationGainM);
    return {
      kind: "week-ascent",
      text: over
        ? `Your week prescribes ${mine} of climbing in total — ${ratio} the ${theirs} the ${route.name} gains. Today is one of the days that adds up to it.`
        : `Your week prescribes ${mine} of climbing in total, ${ratio} of the ${theirs} the ${route.name} gains. Today is one of the days that adds up to it.`,
      figures: [
        { printed: mine, from: "your plan, this week's days added up" },
        { printed: ratio, from: "the two figures beside it" },
        { printed: theirs, from: `ICEFALL's record of the ${route.name}` },
      ],
      attribution: curatedAttribution(mountain!, route),
    };
  }

  /* 7 — the build-up again, for the weeks where no mountain figure existed to
     outrank it. Same sentence, same builder: two copies would drift. */
  if (shape.rampWeeks > 0 && week.index <= shape.rampWeeks + 1) {
    return buildUpReason(week.index, shape, sessionsThisWeek);
  }

  /* 8 — where the week sits, and what that does to its size. The floor of the
     ladder: it fires for every non-rest day of a plan this app generated, and
     it is still three real figures rather than a sentence about session types. */
  const share = `${Math.round((BLOCK_LOAD[block.kind] / BLOCK_LOAD.build) * 100)}%`;
  const position = `week ${week.index} of ${plan.totalWeeks}`;
  const left = plan.totalWeeks - week.index;
  const remaining = left === 1 ? "1 week" : `${left} weeks`;
  const tail = left > 0 ? ` ${remaining} of the build left before ${goal.name}.` : "";

  const opening =
    block.kind === "peak"
      ? `Peak block, ${position} — the heaviest the plan gets, at ${share} of a Build week's volume.`
      : block.kind === "build"
        ? `Build block, ${position}. This is the plan's reference volume, at ${share}: every other block is set against it.`
        : `Base block, ${position}. Volume is held at ${share} of a Build week while the habit is built.`;

  return {
    kind: "block",
    text: `${opening}${tail}`,
    figures: [
      { printed: position, from: "your plan" },
      { printed: share, from: "the plan generator's block loads" },
      ...(left > 0 ? [{ printed: remaining, from: "your plan's length" } as ReasonFigure] : []),
    ] as [ReasonFigure, ...ReasonFigure[]],
    attribution: planAttribution(),
  };
}
