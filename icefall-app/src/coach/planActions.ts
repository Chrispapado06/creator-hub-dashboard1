import { useCallback, useMemo } from "react";

import type { Goal, Mountain, TrainingDay, TrainingPlan } from "@/types";
import { isoDate } from "@/data/mock/clock";
import { fmtDistance, fmtElevation } from "@/lib/format";
import {
  addAdjustments,
  applyAdjustments,
  livePlanAdjustments,
  readableDay,
  undoAdjustment,
  useAdjustments,
  type NewAdjustment,
  type PlanAdjustment,
} from "@/tracking/adjustments";
import { buildPlanForGoal, useTraining, type TrainingShape } from "@/tracking/training";
import { sync } from "@/services/repository";
import { exactLocalStart } from "@/tracking/timeOfDay";
import {
  buildManualActivity,
  isKnownActivityType,
  logManualActivity,
  type ManualActivityInput,
} from "@/tracking/manual";
import { guardPlanChange, isHarderDay, type GuardVerdict } from "@/coach/planGuard";
import { assessDowngrade, type DayDowngrade } from "@/coach/downgrade";
import { useCoachIntel } from "@/coach/hooks";
import { useApp } from "@/state/AppState";
import { MAX_SHIFT_DAYS, type CoachAction } from "@/coach/tools";

/**
 * WHERE THE MODEL'S CHOICE BECOMES A REAL CHANGE — OR IS REFUSED.
 *
 * ============================================================================
 * THE DIVISION OF LABOUR, WHICH IS THE POINT OF THE WHOLE PHASE
 * ============================================================================
 *
 * The model picked a tool and a day. That is all it picked. Everything the
 * athlete then reads — which session it is, how long it was, how long it will
 * be, how much ascent came off, what the week now looks like — is computed
 * HERE, from `buildPlanForGoal` and `applyAdjustments`, and rendered from the
 * result. If the model's sentence and the figures disagree, the figures are
 * what is on the screen and the sentence is quoted beside them in quotation
 * marks with the coach's name on it.
 *
 * That is not a stylistic preference. A coach that can say "I've cut Saturday
 * to ninety minutes" without anything having been cut is worse than a coach
 * that cannot change the plan at all, because the athlete now believes
 * something about their own training that is not true and has been given no
 * reason to check.
 *
 * ============================================================================
 * PREVIEW, THEN COMMIT — AND PREVIEW IS PURE
 * ============================================================================
 *
 * `previewAction` writes nothing. It builds the baseline, applies the records
 * the change WOULD make, and hands back both plans' versions of every day the
 * change touches. Three things then read that preview:
 *
 *   · THE GUARD, which compares today's before and after (`planGuard.ts`);
 *   · THE THRESHOLD, which decides whether this applies straight away or asks
 *     for a tap (see `CONFIRM_AT_WEEK_SHARE` for the measured reasoning);
 *   · THE SCREEN, which renders the before/after rows the athlete sees.
 *
 * All three read the same preview, so the change the athlete is shown is
 * arithmetically the change that gets committed — not a description of it.
 *
 * ============================================================================
 * THE ORDER OF THE THREE ANSWERS, WHICH IS FIXED
 * ============================================================================
 *
 *   1. CAN THIS BE EXPRESSED AT ALL? — no objective, a day the plan does not
 *      contain, a day already trained, a session already shorter than asked.
 *   2. IS IT FORBIDDEN? — the guard. An absolute refusal that no confirmation
 *      can pass and no argument in the chat can talk round.
 *   3. IS IT BIG? — the threshold, which only ever decides between applying
 *      now and asking first.
 *
 * Two comes before three ON PURPOSE. If the threshold ran first, a forbidden
 * change would be offered to the athlete with a Confirm button under it, and
 * the app would be inviting a tap it is then going to refuse.
 *
 * ============================================================================
 * WHAT IS NOT HERE
 * ============================================================================
 *
 * The symptom layer. `coach/safety.ts` runs in `CoachChat.send` before a word
 * reaches the network and again in `askCoach` before the endpoint is called, so
 * a message reporting chest pain never produces a tool call to begin with —
 * there is no request for the model to answer. Nothing in this file may ever
 * become a way to reach the coach that skips those two, which is why nothing
 * here calls the endpoint.
 */

/* -------------------------------------------------------------------------- */
/* The confirmation threshold — a measured rule, not a feeling                 */
/* -------------------------------------------------------------------------- */

/**
 * HOW MUCH OF A WEEK ONE CHANGE MAY TAKE AWAY BEFORE IT HAS TO ASK: 25%.
 *
 * THE MEASUREMENT THIS COMES FROM, AND IT IS RE-RUN BY THE TEST SUITE RATHER
 * THAN QUOTED FROM HERE. Every session in a generated week was measured as a
 * share of that week's prescribed minutes, across 2,496 generated weeks — 4
 * objectives (Ben Nevis, Toubkal, Mont Blanc, Aconcagua) x 6 athlete shapes
 * (never-asked, no fixed days, three days a week off a 1-2 baseline, all seven
 * days at 60 min off 5-plus, three days at 45 min off nothing, four days at 90
 * min off 3-4) x with and without technical ground x every week of each plan:
 *
 *     every ordinary session   3.1% .. 17.5%
 *     LONG MOUNTAIN DAY       45.1% .. 84.9%
 *
 * There is an empty band between 17.5% and 45.1%, and the threshold sits in it.
 * So the rule this number encodes is a sentence about training rather than a
 * percentage:
 *
 *     ANY ORDINARY SESSION CAN BE SHORTENED, EASED OR CLEARED WITHOUT A TAP.
 *     THE LONG MOUNTAIN DAY — THE ONE SESSION THE WEEK IS BUILT AROUND, AND
 *     THE ONE THE OBJECTIVE ACTUALLY DEPENDS ON — NEVER CAN.
 *
 * That is why it is defensible. It is not "big changes feel like they need a
 * confirmation": it is the generator's own output saying which session carries
 * the week, and the threshold placed where nothing lands. The margin is 7.5
 * points below and 20.1 above.
 *
 * AND IT IS GUARDED. Suite 3 of `planActions.test.ts` runs that measurement
 * again on every test run and fails if either band crosses 25%. Tuning
 * `sessionsFor` until an ordinary session takes a quarter of a week would
 * otherwise change what this constant MEANS while leaving it reading the same,
 * which is the failure a comment on its own cannot catch.
 *
 * A move is volume-neutral and removes nothing, so it passes this test on its
 * own and is caught, when it deserves to be, by the other two below.
 */
const CONFIRM_AT_WEEK_SHARE = 0.25;

/**
 * HOW FAR AHEAD A CHANGE APPLIES WITHOUT A TAP: SEVEN DAYS.
 *
 * A change to this week or the next few days is a change the athlete is about
 * to live and will see on the dashboard tomorrow morning. A change to a
 * Thursday five weeks out is one they will have forgotten agreeing to by the
 * time it bites, and the first they will know of it is a session that is not
 * the session the plan had.
 *
 * Seven days rather than "this week" because "this week" is an accident of
 * which day it is: the same request on a Sunday would be immediate and on a
 * Monday would not.
 */
const APPLY_WITHIN_DAYS = 7;

/**
 * A CHANGE THAT TOUCHES MORE THAN ONE SESSION ALWAYS ASKS.
 *
 * `reschedule_week` is the only tool that produces more than one record, and it
 * produces up to six. The athlete agreed to one sentence; six days of their
 * training moving is not something to discover. Written as a constant rather
 * than as `records.length > 1` inline so the rule is visible beside the other
 * two and so it stays true if a future tool batches for some other reason.
 */
const APPLY_UP_TO_RECORDS = 1;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export type ProposalOutcome =
  /** Already done by the time the athlete reads it. Undo is offered. */
  | "applied"
  /** Ready, and waiting for a tap. Nothing has been written. */
  | "confirm"
  /** Not happening. Nothing has been written and no tap will change that. */
  | "refused";

export interface DayDiff {
  date: string;
  /** "Sat 20 Sep" — from the adjustment layer's pinned formatter. */
  label: string;
  /** The day as it stands, in the app's words. */
  before: string;
  /** The day as the change would leave it. */
  after: string;
  /** True when this day gained work. Rendered, and read by nothing else. */
  harder: boolean;
}

export interface PlanProposal {
  action: CoachAction;
  /** The model's reason, cleaned and capped. Always shown attributed. */
  why: string;
  /**
   * ONE LINE, IN THE APP'S VOICE, DERIVED FROM THE ACTION AND THE ENGINE.
   * Never the model's prose. This is what goes into the transcript and into
   * the plan-change history.
   */
  summary: string;
  outcome: ProposalOutcome;
  /**
   * Why it is waiting, or why it was refused, in the app's words. Empty only
   * when it applied without asking.
   */
  note: string;
  /** Every day the change touches, before and after. Empty for a logged activity. */
  days: DayDiff[];
  /** What would be written. Empty for the two actions that are not plan changes. */
  records: NewAdjustment[];
  /** Set by `set_target_date` only. */
  targetDate?: string;
  /** Set by `log_activity` only. */
  activity?: ManualActivityInput;
}

export interface PlanActionContext {
  /** Local calendar date, the same string the plan keys days on. */
  today: string;
  /** The clock `buildPlanForGoal` is given. A parameter so this stays testable. */
  now: Date;
  goal?: Goal;
  mountain?: Mountain;
  shape: TrainingShape;
  /** Every stored record for this goal, undone ones already removed. */
  adjustments: readonly PlanAdjustment[];
  /** Effective completion per date — a manual tick or an activity that did the work. */
  completedByDate: ReadonlyMap<string, boolean>;
  downgrade: DayDowngrade;
}

/* -------------------------------------------------------------------------- */
/* Describing a day — the app's words, from the engine's numbers               */
/* -------------------------------------------------------------------------- */

/**
 * A day as one readable line.
 *
 * Reads only fields the generator produced. A figure the generator left absent
 * is left out rather than printed as zero, which is the same rule the session
 * screen and the summary follow.
 */
export function describeDay(day: TrainingDay | undefined): string {
  if (!day) return "Nothing scheduled";
  if (day.focus === "rest") return day.title;
  const parts = [
    day.durationMin ? `${Math.round(day.durationMin)} min` : null,
    day.distanceKm ? `${fmtDistance(day.distanceKm)} km` : null,
    day.elevationM ? `${fmtElevation(day.elevationM)} m up` : null,
  ].filter(Boolean);
  return parts.length ? `${day.title} · ${parts.join(" · ")}` : day.title;
}

function dayOn(plan: TrainingPlan | null, date: string): TrainingDay | undefined {
  if (!plan) return undefined;
  for (const w of plan.weeks) for (const d of w.days) if (d.date === date) return d;
  return undefined;
}

function weekOf(plan: TrainingPlan | null, date: string) {
  if (!plan) return undefined;
  return plan.weeks.find((w) => w.days.some((d) => d.date === date));
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** `date` shifted by whole days, as `YYYY-MM-DD`. */
function shiftDate(date: string, by: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(
    t.getUTCDate(),
  ).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Refusals that have nothing to do with safety                                */
/* -------------------------------------------------------------------------- */

function refuse(action: CoachAction, why: string, note: string): PlanProposal {
  return {
    action,
    why,
    summary: "No change made",
    outcome: "refused",
    note,
    days: [],
    records: [],
  };
}

/**
 * The ordinary checks on a day a change names.
 *
 * A COMPLETED DAY IS REFUSED OUTRIGHT rather than sent for confirmation. The
 * athlete trained on it; rewriting what the plan said was prescribed there
 * changes their preparation figure retrospectively, and no honest wording of a
 * confirmation makes that a thing to tap through. The activity itself is
 * untouched either way — this is about what the plan claims it asked for.
 */
function dayProblem(
  ctx: PlanActionContext,
  plan: TrainingPlan,
  date: string,
  verb: string,
): string | null {
  const day = dayOn(plan, date);
  if (!day) return `${readableDay(date)} is not a day in your plan.`;
  if (daysBetween(ctx.today, date) < 0) return `${readableDay(date)} has already gone.`;
  if (ctx.completedByDate.get(date)) {
    return `You already trained on ${readableDay(date)} — ICEFALL will not ${verb} a day you have done.`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The records a change would write                                            */
/* -------------------------------------------------------------------------- */

type Built = { records: NewAdjustment[] } | { refusal: string };

function buildRecords(ctx: PlanActionContext, plan: TrainingPlan, action: CoachAction): Built {
  const goalId = ctx.goal?.id ?? "";
  const why = action.why;
  const of = (date: string, change: NewAdjustment["change"]): NewAdjustment => ({
    goalId,
    date,
    change,
    why,
    /* EVERY RECORD A TOOL WRITES IS THE COACH'S, whoever asked for it. The
       athlete's request is the reason; the change is the coach's act, and the
       history screen attributes it that way so "your coach moved this" is
       never quietly written as "you moved this". */
    by: "coach",
  });

  switch (action.tool) {
    case "shorten_session": {
      const problem = dayProblem(ctx, plan, action.date, "shorten");
      if (problem) return { refusal: problem };
      return { records: [of(action.date, { kind: "shorten", minutes: action.minutes })] };
    }

    case "ease_session": {
      const problem = dayProblem(ctx, plan, action.date, "ease");
      if (problem) return { refusal: problem };
      return { records: [of(action.date, { kind: "ease", notches: action.notches })] };
    }

    case "rest_day": {
      const problem = dayProblem(ctx, plan, action.date, "clear");
      if (problem) return { refusal: problem };
      return { records: [of(action.date, { kind: "rest" })] };
    }

    case "move_session":
    case "swap_sessions": {
      /* ONE RECORD FOR BOTH, because the adjustment layer's `move` already
         exchanges when the destination is occupied — moving onto a full day and
         swapping two days are the same operation seen from two sides, and
         giving them two record kinds would give them two ways to be undone. */
      const to = action.tool === "move_session" ? action.to : action.withDate;
      if (to === action.date) return { refusal: "That is the same day." };
      const a = dayProblem(ctx, plan, action.date, "move");
      if (a) return { refusal: a };
      const b = dayProblem(ctx, plan, to, "move a session onto");
      if (b) return { refusal: b };
      return { records: [of(action.date, { kind: "move", to })] };
    }

    case "reschedule_week": {
      const week = plan.weeks.find((w) => w.startDate === action.weekStartDate);
      if (!week) {
        return {
          refusal: `${readableDay(action.weekStartDate)} does not start a week in your plan.`,
        };
      }
      if (Math.abs(action.byDays) > MAX_SHIFT_DAYS) {
        return { refusal: `A week can move by at most ${MAX_SHIFT_DAYS} days.` };
      }

      /* WHICH DAYS ACTUALLY MOVE. Days already gone and days already trained
         stay exactly where they are: an athlete asking on Thursday to push the
         week back is asking about the rest of it, and a shift that dragged
         Monday's completed session forward would rewrite training they did. */
      const movable = week.days.filter(
        (d) =>
          d.focus !== "rest" &&
          daysBetween(ctx.today, d.date) >= 0 &&
          !ctx.completedByDate.get(d.date),
      );
      if (movable.length === 0) {
        return { refusal: "There is nothing left to move in that week." };
      }

      /* Every destination is checked before a single record is written, so the
         act is all-or-nothing rather than partly applied and partly refused. */
      for (const d of movable) {
        const to = shiftDate(d.date, action.byDays);
        if (!dayOn(plan, to)) {
          return {
            refusal: `That would move a session to ${readableDay(to)}, which is outside your plan.`,
          };
        }
        if (ctx.completedByDate.get(to)) {
          return {
            refusal: `That would move a session onto ${readableDay(to)}, which you have already trained.`,
          };
        }
        if (daysBetween(ctx.today, to) < 0) {
          return { refusal: `That would move a session into the past.` };
        }
      }

      /*
       * ORDER IS THE WHOLE CORRECTNESS ARGUMENT, AND ONE SESSION IS DISPLACED.
       *
       * `move` EXCHANGES the two days. Shifting a week forward one day by
       * applying Monday->Tuesday first would put Monday's session on Tuesday
       * and Tuesday's on Monday, and the next move would then carry the wrong
       * session onward — the week would shuffle rather than shift.
       *
       * Applied from the LAST day backwards, every destination has already been
       * emptied by the move before it, so each exchange hands a rest day back
       * to the day the session left and the week slides intact. A negative
       * shift is the mirror image and runs earliest-first.
       *
       * WHAT THAT LEAVES, SAID PLAINLY RATHER THAN DISCOVERED. The first move
       * in the chain lands on a day OUTSIDE the week — the following Monday for
       * a forward shift — and that day usually has a session of its own. The
       * exchange sends it back down the chain until it settles on a day the
       * shift vacated. So after a shift, and asserted in `planActions.test.ts`
       * for every shift in range:
       *
       *   · EVERY SESSION THAT MOVED IS EXACTLY `byDays` AWAY, unchanged in
       *     title and in every figure — which is what was asked for;
       *   · NOTHING IS LOST. The prescribed minutes across every touched day
       *     are identical before and after.
       *
       * What it does NOT leave is each day carrying what it carried. Each day
       * receives the session that was on the day before it, so a recovery walk
       * can become the long mountain day — that is what "push the week back"
       * means, and pretending otherwise would be pretending the tool does
       * something smaller than it does. Every such day is listed in the
       * before/after and NAMED in the note, with the app saying plainly that it
       * has no readiness figure for a future day and is not judging it.
       *
       * The alternative to the displacement is cascading into the following
       * week, and the week after that, which is a far larger change than the
       * one the athlete asked for. So it stays, and a reschedule always
       * requires a tap.
       *
       * The applier orders records by `at` then `id`; `addAdjustments` stamps
       * one `at` for the batch and mints ids in array order, so the array order
       * below IS the order they apply in.
       */
      const ordered = [...movable].sort((x, y) =>
        action.byDays > 0 ? (x.date < y.date ? 1 : -1) : x.date < y.date ? -1 : 1,
      );
      return {
        records: ordered.map((d) =>
          of(d.date, { kind: "move", to: shiftDate(d.date, action.byDays) }),
        ),
      };
    }

    case "set_target_date":
    case "log_activity":
      /* Neither writes an adjustment. The target date is a property of the
         objective and rebuilds the plan from the generator; a logged activity
         is a record of what happened and changes no prescription at all. */
      return { records: [] };
  }
}

/* -------------------------------------------------------------------------- */
/* Preview — pure, and the single source of everything the athlete is shown    */
/* -------------------------------------------------------------------------- */

/**
 * What this change would do. Writes nothing, reads no clock (`ctx.now` is the
 * clock), and returns the same proposal every time for the same context.
 */
export function previewAction(ctx: PlanActionContext, action: CoachAction): PlanProposal {
  const why = action.why;

  /* ---- The two actions that are not plan changes ------------------------- */

  if (action.tool === "log_activity") {
    if (!isKnownActivityType(action.activityTypeId)) {
      return refuse(
        action,
        why,
        "Your coach asked to log an activity ICEFALL does not have a type for, so nothing was written.",
      );
    }
    if (daysBetween(ctx.today, action.date) > 0) {
      return refuse(action, why, "That day has not happened yet.");
    }
    const input: ManualActivityInput = {
      date: action.date,
      timeLocal: action.startTimeLocal,
      activityTypeId: action.activityTypeId,
      durationMin: action.durationMin,
      distanceKm: action.distanceKm,
      ascentM: action.ascentM,
      source: "coach",
    };
    /* Built rather than described, so the before/after row shows the figures
       that would actually be stored — including the rounding. */
    const built = buildManualActivity(input, ctx.now);
    /* THE START TIME IS SHOWN, AND SO IS WHERE IT CAME FROM.
       A time the athlete gave is theirs and reads as a fact. A time nobody gave
       was placed by the app, and the row says so in the same breath as it shows
       it — this is the tap that writes a session into somebody's history, and
       an inferred figure discovered afterwards is exactly what this
       confirmation exists to prevent. */
    /* A start time can be in the future even when the DATE is not: "I ran at
       eight" said at seven in the morning. The date check above cannot see it,
       and a session that has not happened must not enter a training history. */
    if (new Date(built.startedAt).getTime() > ctx.now.getTime()) {
      return refuse(action, why, "That start time has not come round yet today.");
    }
    const start = exactLocalStart(built);
    const startLabel = start
      ? built.startTimeSource === "inferred"
        ? `${start.clock} — time not given, placed by ICEFALL`
        : `${start.clock}`
      : null;
    const after = [
      built.title,
      startLabel,
      `${Math.round(built.durationSec / 60)} min`,
      built.distanceM > 0 ? `${fmtDistance(built.distanceM / 1000)} km` : null,
      built.elevationGainM > 0 ? `${fmtElevation(built.elevationGainM)} m up` : null,
      "reported, not recorded",
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      action,
      why,
      summary: `Log ${built.title.toLowerCase()} on ${readableDay(action.date)}`,
      /*
       * ALWAYS ASKS, WITHOUT EXCEPTION AND WHATEVER THE SIZE.
       *
       * Every other tool changes what the athlete is being ASKED to do, which
       * they can read on the plan screen and undo. This one changes what the
       * athlete DID — it enters their history, their load curve, their weekly
       * totals and their preparation — and it does it from figures a model
       * transcribed out of a sentence. "About two hours" becoming 120 minutes
       * is a reasonable reading; it is not a reading anyone should have to
       * discover afterwards.
       */
      outcome: "confirm",
      note:
        "This goes into your history, so ICEFALL asks first. Check the figures — they are what you said, not what anything measured." +
        (built.startTimeSource === "inferred"
          ? " You did not say when you started, so ICEFALL has placed it on the day rather than guessing at your morning. Tell your coach the time if it matters."
          : ""),
      days: [
        {
          date: action.date,
          label: readableDay(action.date),
          before: "Nothing recorded",
          after,
          harder: false,
        },
      ],
      records: [],
      activity: input,
    };
  }

  if (!ctx.goal) {
    return refuse(action, why, "You have no active objective, so there is no plan to change.");
  }

  const baseline = buildPlanForGoal(ctx.goal, ctx.mountain, ctx.now, ctx.shape);
  const live = livePlanAdjustments(ctx.adjustments, ctx.goal.id);
  const before = applyAdjustments(baseline, live).plan;

  if (action.tool === "set_target_date") {
    if (daysBetween(ctx.today, action.date) < 1) {
      return refuse(action, why, "An objective needs a date in the future.");
    }
    const moved = { ...ctx.goal, targetDate: new Date(`${action.date}T06:00:00`).toISOString() };
    const after = applyAdjustments(
      buildPlanForGoal(moved, ctx.mountain, ctx.now, ctx.shape),
      live,
    ).plan;

    const verdict = guardPlanChange({
      today: ctx.today,
      before,
      after,
      downgrade: ctx.downgrade,
    });
    if (!verdict.allowed) return refuse(action, why, verdict.reason);

    /* ONE ROW, AND ONLY IF IT SAYS SOMETHING. A date move rewrites every week,
       and listing forty of them is not a before/after anybody reads — the two
       things that actually change the athlete's week are the plan's length,
       which the note carries, and what today becomes, which is this row. It is
       dropped when today is unchanged, because a row whose two halves are
       identical is the screen taking up space to say nothing. */
    const todayBefore = describeDay(dayOn(before, ctx.today));
    const todayAfter = describeDay(dayOn(after, ctx.today));
    const days: DayDiff[] =
      todayBefore === todayAfter
        ? []
        : [
            {
              date: ctx.today,
              label: readableDay(ctx.today),
              before: todayBefore,
              after: todayAfter,
              harder: isHarderDay(dayOn(before, ctx.today), dayOn(after, ctx.today)),
            },
          ];

    return {
      action,
      why,
      summary: `Move ${ctx.goal.name} to ${readableDay(action.date)} — ${before.totalWeeks} weeks becomes ${after.totalWeeks}`,
      /*
       * ALWAYS ASKS. The target date is the one answer the whole plan is
       * generated from: it sets the number of weeks, the Base/Build/Peak/Taper
       * split and therefore what every remaining day of training looks like.
       * There is no small version of it.
       */
      outcome: "confirm",
      note: `This rebuilds every week of the plan, from ${before.totalWeeks} weeks to ${after.totalWeeks}. Changes you have already made stay on the days they name.`,
      days,
      records: [],
      targetDate: moved.targetDate,
    };
  }

  /* ---- The plan changes -------------------------------------------------- */

  const built = buildRecords(ctx, before, action);
  if ("refusal" in built) return refuse(action, why, built.refusal);

  const applied = applyAdjustments(baseline, [
    ...live,
    ...built.records.map((r, i) => ({
      ...r,
      /* Stamped to sort AFTER every stored record, in array order, exactly as
         `addAdjustments` will stamp them when this is committed. A preview that
         composed in a different order from the commit would show a plan the
         athlete is not going to get. */
      id: `preview-${String(i).padStart(4, "0")}`,
      at: new Date(8.64e15).toISOString(),
    })),
  ]);
  const after = applied.plan;

  /* A record the plan could not take is not a silent no-op: it means the change
     was expressible but did not land, and the athlete is owed the engine's own
     reason for that rather than a screen showing an unchanged plan. */
  const strandedHere = applied.stranded.find((s) => s.adjustment.id.startsWith("preview-"));
  if (strandedHere) return refuse(action, why, strandedHere.reason);

  /* ---- 2. THE GUARD. Absolute, and ahead of the threshold. ---------------- */

  const verdict: GuardVerdict = guardPlanChange({
    today: ctx.today,
    before,
    after,
    downgrade: ctx.downgrade,
  });
  if (!verdict.allowed) return refuse(action, why, verdict.reason);

  /* ---- The before/after the athlete reads -------------------------------- */

  const touched = new Set<string>();
  for (const r of built.records) {
    touched.add(r.date);
    if (r.change.kind === "move") touched.add(r.change.to);
  }
  const days: DayDiff[] = [...touched]
    .sort()
    .map((date) => {
      const b = dayOn(before, date);
      const a = dayOn(after, date);
      return {
        date,
        label: readableDay(date),
        before: describeDay(b),
        after: describeDay(a),
        /* THE SAME PREDICATE THE GUARD REFUSES ON. A second, looser copy here
           would let a row read as unchanged that the guard considers harder,
           and the athlete would be shown one story and given another. */
        harder: isHarderDay(b, a),
      };
    })
    /* Days the change named but did not alter are dropped: a before/after row
       whose two halves are identical is noise on a screen that exists to show
       what is different. */
    .filter((d) => d.before !== d.after);

  /* ---- 3. THE THRESHOLD -------------------------------------------------- */

  const { confirm, note } = thresholdFor(ctx, before, after, built.records, touched);

  /*
   * EVERY DAY THAT GAINS WORK IS NAMED, AND THIS IS THE ONE PLACE THE GUARD
   * CANNOT HELP.
   *
   * Moving and swapping are the two actions that can put MORE work on a day
   * than the plan had there — a swap hands Wednesday the long mountain day, a
   * week shift hands each day the one before it. That is not a fault; it is
   * what rescheduling is.
   *
   * But ICEFALL has a readiness and a recovery figure for exactly one day, and
   * that is today. The guard above has already refused this outright if today
   * is one of the days gaining work. For every OTHER day there is no
   * measurement to refuse on, and inventing one would be the dishonesty this
   * app spends most of its comments avoiding. So the days are named, the reason
   * ICEFALL is not judging them is stated, and the athlete decides.
   */
  const gained = days.filter((d) => d.harder);
  const withGain = gained.length
    ? `${note ? `${note} ` : ""}This puts more work on ${gained
        .map((d) => d.label)
        .join(", ")} than the plan had there. ICEFALL only measures readiness for today, so judge ${
        gained.length === 1 ? "that day" : "those days"
      } yourself.`
    : note;

  return {
    action,
    why,
    summary: summarise(action, days),
    outcome: confirm ? "confirm" : "applied",
    note: withGain,
    days,
    records: built.records,
  };
}

/**
 * Big or small, and why. Returns the reason in the app's words whenever the
 * answer is "ask" — a confirmation that does not say what makes this one worth
 * stopping for teaches the athlete to tap through the next one.
 */
function thresholdFor(
  ctx: PlanActionContext,
  before: TrainingPlan,
  after: TrainingPlan,
  records: NewAdjustment[],
  touched: Set<string>,
): { confirm: boolean; note: string } {
  if (records.length > APPLY_UP_TO_RECORDS) {
    return {
      confirm: true,
      note: `This moves ${records.length} sessions, so ICEFALL asks before it does.`,
    };
  }

  const furthest = [...touched].reduce((n, d) => Math.max(n, daysBetween(ctx.today, d)), 0);
  if (furthest > APPLY_WITHIN_DAYS) {
    return {
      confirm: true,
      note: `That day is ${furthest} days out, far enough that ICEFALL asks rather than changing a week you have not looked at yet.`,
    };
  }

  const week = weekOf(before, records[0]?.date ?? ctx.today);
  const weekMinutes = week?.days.reduce((n, d) => n + (d.durationMin ?? 0), 0) ?? 0;
  const removed = [...touched].reduce(
    (n, date) =>
      n +
      Math.max(0, (dayOn(before, date)?.durationMin ?? 0) - (dayOn(after, date)?.durationMin ?? 0)),
    0,
  );

  /* A week with no prescribed minutes cannot produce a share, and a share that
     cannot be computed is not a small one — it asks. */
  if (weekMinutes <= 0) {
    return { confirm: true, note: "ICEFALL could not measure this against the week, so it asks." };
  }

  if (removed / weekMinutes > CONFIRM_AT_WEEK_SHARE) {
    return {
      confirm: true,
      note: `That takes ${Math.round(removed)} of the week's ${Math.round(weekMinutes)} prescribed minutes away — more than a quarter of it — so ICEFALL asks first.`,
    };
  }

  return { confirm: false, note: "" };
}

/**
 * The app's one-line account of what happened.
 *
 * BUILT FROM THE ACTION AND THE COMPUTED DAYS, never from the model's sentence.
 * It is what goes into the transcript, which means it is also what is sent back
 * to the model as history on the next turn — so the model's own record of what
 * it did is the app's record, not its own earlier prose.
 */
function summarise(action: CoachAction, days: DayDiff[]): string {
  switch (action.tool) {
    case "shorten_session":
      return `Cut ${readableDay(action.date)} to ${action.minutes} min`;
    case "ease_session":
      return `Eased ${readableDay(action.date)} ${action.notches === 1 ? "one notch" : "two notches"}`;
    case "rest_day":
      return `Made ${readableDay(action.date)} a rest day`;
    case "move_session":
      return `Moved ${readableDay(action.date)} to ${readableDay(action.to)}`;
    case "swap_sessions":
      return `Swapped ${readableDay(action.date)} and ${readableDay(action.withDate)}`;
    case "reschedule_week":
      return `Shifted the week of ${readableDay(action.weekStartDate)} by ${action.byDays > 0 ? "+" : ""}${action.byDays} ${Math.abs(action.byDays) === 1 ? "day" : "days"} — ${days.length} days changed`;
    default:
      return "Plan updated";
  }
}

/* -------------------------------------------------------------------------- */
/* Commit                                                                      */
/* -------------------------------------------------------------------------- */

export interface CommitSinks {
  /** `AppState.setGoalTargetDate`. Returns false for a goal that is not theirs. */
  setGoalTargetDate: (id: string, iso: string) => boolean;
}

export interface CommitResult {
  ok: boolean;
  /** Record ids Undo can name. Empty for the two non-plan actions. */
  recordIds: string[];
  /** Said to the athlete when something went wrong. Empty on success. */
  problem: string;
}

/**
 * A stable fingerprint of WHAT A PROPOSAL WOULD DO — nothing about how it was
 * described. Key order is sorted, so two objects with the same effect built by
 * different code fingerprint the same and a divergence here is a real one.
 *
 * Deliberately excludes `summary`, `note`, `why` and `days`: those are prose
 * and presentation. What must match between what the athlete was shown and
 * what gets written is the records, the target date and the activity.
 */
function effectFingerprint(p: PlanProposal): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = stable(o[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(
    stable({
      records: p.records,
      targetDate: p.targetDate ?? null,
      activity: p.activity ?? null,
    }),
  );
}

/**
 * Do it.
 *
 * THE GUARD IS RE-EVALUATED HERE, AGAINST LIVE READINESS — IT IS NOT READ OFF
 * THE PROPOSAL.
 *
 * Phase 2's own proof found the hole this closes and reported it rather than
 * burying it: the old body trusted `proposal.outcome`, so anything that could
 * hand this function a `PlanProposal` object with `outcome: "confirm"` was past
 * the guard, because the guard runs inside `previewAction`. No model could do
 * that — a model emits a `CoachAction` and both chat call sites turn it into a
 * proposal through `previewAction` first — but future CODE could, and a safety
 * rule that depends on every future caller using one particular door is not a
 * safety rule.
 *
 * So this now re-runs the engine from `proposal.action` — the one field that
 * came through `parseCoachAction` and is therefore the only field a caller
 * could not have invented a plan change inside — and:
 *
 *   1. refuses if the FRESH preview refuses. `ctx.downgrade` is built from the
 *      athlete's readiness and check-in at the moment of the tap, so this is
 *      the guard answering about NOW rather than about whenever the proposal
 *      was made. An athlete who checked in poorly between reading and tapping
 *      is refused at the tap;
 *   2. refuses if what the fresh preview would do differs from what the athlete
 *      was shown. Agreement is to a specific before/after, not to a tool name;
 *   3. writes the FRESH preview's records, never the handed-in ones — so a
 *      fabricated `records` array is not written even when its action is
 *      innocent.
 *
 * The handed-in `outcome` is still honoured when it says "refused", because a
 * caller saying no is always allowed to be taken at its word.
 *
 * `previewAction` is pure and writes nothing, so running it twice costs a plan
 * rebuild and changes no state.
 */
export function commitProposal(
  ctx: PlanActionContext,
  proposal: PlanProposal,
  sinks: CommitSinks,
): CommitResult {
  if (proposal.outcome === "refused") {
    return { ok: false, recordIds: [], problem: proposal.note };
  }

  const fresh = previewAction(ctx, proposal.action);
  if (fresh.outcome === "refused") {
    return { ok: false, recordIds: [], problem: fresh.note };
  }
  if (effectFingerprint(fresh) !== effectFingerprint(proposal)) {
    return {
      ok: false,
      recordIds: [],
      problem:
        "What ICEFALL showed you is no longer what this change would do, so nothing was written. Ask your coach again and you will see the current version.",
    };
  }

  if (fresh.activity) {
    logManualActivity(fresh.activity, ctx.now);
    return { ok: true, recordIds: [], problem: "" };
  }

  if (fresh.targetDate) {
    const moved = ctx.goal ? sinks.setGoalTargetDate(ctx.goal.id, fresh.targetDate) : false;
    return moved
      ? { ok: true, recordIds: [], problem: "" }
      : {
          ok: false,
          recordIds: [],
          problem: "That objective is not one you created, so its date cannot be moved here.",
        };
  }

  if (fresh.records.length === 0) {
    return { ok: false, recordIds: [], problem: "There was nothing to change." };
  }
  return { ok: true, recordIds: addAdjustments(fresh.records).map((r) => r.id), problem: "" };
}

/* -------------------------------------------------------------------------- */
/* Undo, through the same gate                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Would undoing this record be refused? See `planGuard.ts` for why Undo is
 * guarded at all — in short, because "not by the athlete tapping through a
 * confirmation" means this tap too.
 *
 * Pure, and exported so the history screen can DISABLE the control and say why
 * rather than accepting the tap and then doing nothing.
 */
export function guardUndo(ctx: PlanActionContext, id: string): GuardVerdict {
  if (!ctx.goal) return { allowed: true, reason: "" };
  const baseline = buildPlanForGoal(ctx.goal, ctx.mountain, ctx.now, ctx.shape);
  const live = livePlanAdjustments(ctx.adjustments, ctx.goal.id);
  const target = live.find((a) => a.id === id);
  if (!target) return { allowed: true, reason: "" };

  /* A batch undoes as one act, so the simulation has to remove the whole batch
     — otherwise the guard would be answering a question about a state the Undo
     button never produces. */
  const remaining = live.filter((a) =>
    target.batchId !== undefined ? a.batchId !== target.batchId : a.id !== id,
  );

  return guardPlanChange({
    today: ctx.today,
    before: applyAdjustments(baseline, live).plan,
    after: applyAdjustments(baseline, remaining).plan,
    downgrade: ctx.downgrade,
  });
}

/* -------------------------------------------------------------------------- */
/* The hook — live context, and the two things a screen needs                  */
/* -------------------------------------------------------------------------- */

/**
 * Everything above, bound to what the athlete actually has.
 *
 * `downgrade` comes from `useCoachIntel`, which is the one hook every Coach
 * screen reads — so the readiness number this guard refuses on is the number on
 * the dashboard, computed once, not a second opinion assembled here.
 */
export function useCoachActions(): {
  ctx: PlanActionContext;
  preview: (action: CoachAction) => PlanProposal;
  commit: (proposal: PlanProposal) => CommitResult;
  undo: (id: string) => GuardVerdict;
  canUndo: (id: string) => GuardVerdict;
} {
  const { coachProfile, setGoalTargetDate } = useApp();
  const { goal, completedByDate } = useTraining();
  const intel = useCoachIntel();
  const adjustments = useAdjustments();

  const ctx = useMemo<PlanActionContext>(() => {
    const now = new Date();
    return {
      today: isoDate(now),
      now,
      goal,
      mountain: goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined,
      shape: {
        trainingDays: coachProfile.trainingDays ?? [],
        typicalSessionMin: coachProfile.typicalSessionMin ?? null,
        trainingBaseline: coachProfile.trainingBaseline ?? null,
      },
      adjustments,
      completedByDate,
      downgrade: assessDowngrade({
        readiness: intel.readiness,
        recovery: intel.recovery,
        load: intel.load,
      }),
    };
    /* `goal` alone stands in for the objectives list: `useTraining` memoises it
       on `goals`, so moving a target date produces a new object here and this
       context is rebuilt. Adding `goals` as well only made the rule harder to
       read without changing when it fires. */
  }, [goal, coachProfile, adjustments, completedByDate, intel]);

  return {
    ctx,
    preview: useCallback((action: CoachAction) => previewAction(ctx, action), [ctx]),
    commit: useCallback(
      (proposal: PlanProposal) => commitProposal(ctx, proposal, { setGoalTargetDate }),
      [ctx, setGoalTargetDate],
    ),
    canUndo: useCallback((id: string) => guardUndo(ctx, id), [ctx]),
    undo: useCallback(
      (id: string) => {
        const verdict = guardUndo(ctx, id);
        if (verdict.allowed) undoAdjustment(id);
        return verdict;
      },
      [ctx],
    ),
  };
}
