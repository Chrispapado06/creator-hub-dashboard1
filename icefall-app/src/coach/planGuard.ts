import type { TrainingDay, TrainingPlan } from "@/types";
import { HARD_FOCUS } from "@/coach/briefing";
import type { DayDowngrade } from "@/coach/downgrade";

/**
 * THE ONE REFUSAL. A DAY READINESS OR RECOVERY HAS DOWNGRADED IS NEVER MADE
 * HARDER — NOT BY THE MODEL, NOT BY A TOOL, NOT BY THE ATHLETE.
 *
 * ============================================================================
 * WHY THIS GUARDS PLANS AND NOT ACTIONS
 * ============================================================================
 *
 * The obvious shape is a list: "refuse `move` onto a downgraded day, refuse
 * `undo` of an ease, refuse …". That shape is wrong, and it is wrong in a way
 * that only shows up later. It has to enumerate every route to the outcome, so
 * the day somebody adds a ninth tool, or batches two changes that are each
 * harmless, or pulls the target date forward so that today's Base week becomes
 * a Peak week — the list is silently incomplete and nothing says so.
 *
 * So this compares OUTCOMES. Give it the plan as it stands and the plan the
 * change would produce, and it answers one question about one day. It does not
 * know what a tool is, it cannot be given a new action it has not been taught,
 * and there is no argument a model can supply that reaches it — because the
 * only thing it reads is the plan that came out the other side.
 *
 * That makes it a true choke point, and `coach/planActions.ts` routes every
 * write through it: every tool, the week reschedule, the target-date move and
 * the Undo button all produce an "after" plan and all are compared here.
 *
 * ============================================================================
 * WHY UNDO IS GUARDED TOO, WHICH LOOKS WRONG AT FIRST
 * ============================================================================
 *
 * Undo in this app is a deletion: the plan is recomputed from the generator
 * plus whatever records are left, so undoing a change returns exactly the plan
 * that change was never in. That is a good property and it is not weakened
 * here.
 *
 * But consider the sequence. Readiness is 38. The coach eases today. The
 * athlete, who wants to train, taps Undo — and today is a hard session again,
 * on a body the app measured this morning and told to take it easy. Nothing
 * about that outcome is better because the mechanism was a deletion rather
 * than an edit, and the roadmap's rule says "not by the athlete tapping through
 * a confirmation" precisely because that is the tap it means.
 *
 * So Undo goes through the same comparison as everything else, and it is
 * refused for the same stated reason. It is refused ONLY when it would make
 * TODAY harder while today is downgraded: yesterday's changes, next week's
 * changes, and every change on a day that is not downgraded undo freely.
 *
 * ============================================================================
 * WHAT "HARDER" MEANS, AND WHY IT IS DELIBERATELY GENEROUS
 * ============================================================================
 *
 * Any of: a higher difficulty, more minutes, more distance, more ascent, rest
 * becoming work, or an ordinary session becoming one of `HARD_FOCUS`. ANY one
 * is enough.
 *
 * The list is generous because the cost of the two mistakes is not symmetric. A
 * false positive refuses a change the athlete could have had, tells them
 * exactly why, and they can make it tomorrow. A false negative puts a long
 * mountain day on somebody who reported bottom-of-scale energy four hours ago.
 *
 * `HARD_FOCUS` IS IMPORTED, NOT RESTATED. It is the same list `buildBriefing`
 * uses to decide it will not present a hard session today — so the screen that
 * hides one and the gate that refuses to move one in agree by construction.
 */

export interface GuardVerdict {
  allowed: boolean;
  /** Empty when allowed. Otherwise the sentence the athlete is shown. */
  reason: string;
}

const ALLOWED: GuardVerdict = { allowed: true, reason: "" };

/**
 * Is `after` a harder day than `before`? Pure, total, and it treats a missing
 * figure as absent rather than as zero on the `before` side — a day that had no
 * duration and now has one has gained work.
 */
export function isHarderDay(
  before: TrainingDay | undefined,
  after: TrainingDay | undefined,
): boolean {
  if (!after) return false;
  /* No day there before and a session there now is the largest increase
     available, so it is the one case that needs no comparison. */
  if (!before) return after.focus !== "rest";

  if (after.difficulty > before.difficulty) return true;
  if ((after.durationMin ?? 0) > (before.durationMin ?? 0)) return true;
  if ((after.distanceKm ?? 0) > (before.distanceKm ?? 0)) return true;
  if ((after.elevationM ?? 0) > (before.elevationM ?? 0)) return true;
  if (before.focus === "rest" && after.focus !== "rest") return true;
  if (!HARD_FOCUS.includes(before.focus) && HARD_FOCUS.includes(after.focus)) return true;

  return false;
}

/** The day a plan holds for one date, or undefined. */
export function dayOn(plan: TrainingPlan | null, date: string): TrainingDay | undefined {
  if (!plan) return undefined;
  for (const w of plan.weeks) for (const d of w.days) if (d.date === date) return d;
  return undefined;
}

/**
 * THE GATE. Every write to the plan passes through this.
 *
 * `today` is passed in rather than read from a clock so the guard is pure and
 * so a test can put the athlete on any date it likes. Callers hand it the same
 * `isoDate(new Date())` every other part of the plan uses.
 */
export function guardPlanChange(args: {
  today: string;
  before: TrainingPlan | null;
  after: TrainingPlan | null;
  downgrade: DayDowngrade;
}): GuardVerdict {
  const { today, before, after, downgrade } = args;

  /* Not a downgraded day: nothing to refuse. The guard has no opinion about
     any other kind of change — the confirmation threshold is a separate
     question and lives in `planActions.ts`. */
  if (!downgrade.downgraded) return ALLOWED;

  const wasToday = dayOn(before, today);
  const willBeToday = dayOn(after, today);
  if (!isHarderDay(wasToday, willBeToday)) return ALLOWED;

  /* The refusal NAMES THE MEASUREMENTS. An athlete who is told "your readiness
     is 38 out of 100" can open the dashboard and check; one who is told "you
     are not ready today" cannot check anything, and a refusal nobody can check
     is indistinguishable from the app being difficult. */
  const because = downgrade.reasons.join(", and ");
  return {
    allowed: false,
    reason: `Not today — ${because}. ICEFALL will not add work to a day it has already told you to take easy, whoever asks for it. ${
      willBeToday && willBeToday.focus !== "rest"
        ? "The session can go on another day, or wait until you check in again tomorrow."
        : "Try it again after your next check-in."
    }`,
  };
}
