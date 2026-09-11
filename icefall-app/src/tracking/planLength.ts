/**
 * HOW LONG A GENERATED PLAN IS ALLOWED TO BE.
 *
 * A LEAF MODULE ON PURPOSE — it imports nothing, so anything may import it.
 *
 * These two numbers used to sit at the top of `tracking/training.ts`, which is
 * the right place for a constant used only there. They moved the day a second
 * module needed to TELL AN ATHLETE about one of them: `objectives/nextObjective.ts`
 * warns somebody picking a target date for their next objective that a date
 * closer than `PLAN_MIN_WEEKS` produces a plan whose last weeks fall after the
 * objective itself. That warning is true only because of the clamp in
 * `buildPlanForGoal`, so the two must be the same number for ever — and
 * `training.ts` cannot be the home of it, because it pulls in React, AppState
 * and the whole activity feed, which is not a dependency a pure module should
 * take on to learn the number 8.
 */

/**
 * The shortest block `buildPlanForGoal` will ever produce.
 *
 * The clamp is `Math.max`, not a refusal: ask for a six-week plan and you get
 * eight weeks, the last two of which land after your objective. That is a real
 * consequence an athlete choosing a date is entitled to hear about before they
 * choose, rather than discover on the calendar.
 */
export const PLAN_MIN_WEEKS = 8;

/** The longest. A plan beyond this stops being a plan and becomes a wall chart. */
export const PLAN_MAX_WEEKS = 52;
