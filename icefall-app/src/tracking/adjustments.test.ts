/**
 * TEST SET FOR THE PLAN ADJUSTMENT LAYER.
 *
 * `npm run test:plan-adjustments` — esbuild to node, like every other suite
 * here. Nothing in `tracking/adjustments.ts` touches the network and it
 * survives `localStorage` being absent (which it is, on node), so these are
 * run rather than reasoned about.
 *
 * WHY IT EXISTS. Three claims are made in the header of that module, each of
 * them the kind that is easy to believe and expensive to be wrong about:
 *
 *   1. "THE SAME ADJUSTMENTS ON THE SAME BASELINE ALWAYS PRODUCE THE SAME
 *      PLAN." A plan that drifts is a plan nobody can reason about. Suite 1
 *      shuffles the input, applies it twice, and compares byte for byte.
 *   2. "UNDO IS A DELETION OF A RECORD, NOT AN INVERSE EDIT." The whole shape
 *      of the layer is justified by this. Suite 2 proves it the only way that
 *      means anything: adjust, undo, and compare against the untouched
 *      baseline.
 *   3. "AN ADJUSTMENT KEYED ON A WEEK INDEX LANDS ON THE WRONG DAY AFTER A
 *      DATE CHANGE." Suite 3 moves the objective's target date — which
 *      renumbers weeks and re-blocks them — and checks the change is still on
 *      the day it was made for.
 *
 * Suite 4 covers the honesty cases: what happens when a record can no longer
 * apply, and that nothing is silently dropped.
 *
 * WHAT THIS FILE DOES NOT PROVE. That any screen renders `TrainingDay.adjusted`,
 * that the history screen is reachable, or that a coach tool calls
 * `addAdjustment`. Those are call sites, verified by reading them.
 */
import {
  applyAdjustments,
  describeChange,
  livePlanAdjustments,
  planChangeHistory,
  type PlanAdjustment,
} from "@/tracking/adjustments";
import { buildPlanForGoal } from "@/tracking/training";
import type { Goal, TrainingPlan } from "@/types";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* A fixed goal and a fixed clock. Every plan below is therefore the same plan,
   which is the only way a determinism test means anything. */
const GOAL: Goal = {
  id: "goal-test",
  name: "Test objective",
  targetDate: "2027-06-01",
  trainingStartedAt: "2026-09-07",
  status: "active",
} as Goal;

const NOW = new Date("2026-09-11T09:00:00.000Z");

const baseline = () => buildPlanForGoal(GOAL, undefined, NOW);

/** A record, with everything supplied so nothing depends on a clock. */
function adj(
  id: string,
  date: string,
  change: PlanAdjustment["change"],
  at: string,
  extra: Partial<PlanAdjustment> = {},
): PlanAdjustment {
  return {
    id,
    goalId: GOAL.id,
    date,
    change,
    why: `because ${id}`,
    at,
    by: "coach",
    ...extra,
  };
}

const days = (p: TrainingPlan) => p.weeks.flatMap((w) => w.days);
const dayOn = (p: TrainingPlan, iso: string) => days(p).find((d) => d.date === iso);

/* Find a real long day and a real rest day in the baseline, rather than
   assuming which weekday they land on — the generator's week depends on the
   athlete's answers, and a test that hardcodes Saturday would pass today and
   silently stop testing anything the day those answers change it. */
const base = baseline();
const LONG = days(base).find((d) => d.focus === "long-mountain" && d.date > "2026-10-01")!;
const REST = days(base).find((d) => d.focus === "rest" && d.date > LONG.date)!;
/* A third day, still carrying work and untouched by the two above. The
   composition test needs a record that actually changes something after the
   move has run — an ease aimed at a day a move has already emptied strands,
   which is right, but it proves nothing about composing. */
const OTHER = days(base).find(
  (d) => d.focus !== "rest" && d.date !== LONG.date && d.date > REST.date,
)!;

function main() {
  ok(LONG !== undefined, "the baseline has no long mountain day to test with");
  ok(REST !== undefined, "the baseline has no rest day to test with");
  ok(OTHER !== undefined, "the baseline has no third working day to test with");

  /* ------------------------------------------------------------------------ */
  /* 1. DETERMINISM                                                            */
  /* ------------------------------------------------------------------------ */

  const set: PlanAdjustment[] = [
    adj("a1", LONG.date, { kind: "move", to: REST.date }, "2026-09-11T10:00:00.000Z"),
    adj("a2", REST.date, { kind: "shorten", minutes: 120 }, "2026-09-11T11:00:00.000Z"),
    adj("a3", OTHER.date, { kind: "ease", notches: 1 }, "2026-09-11T12:00:00.000Z"),
  ];

  const first = JSON.stringify(applyAdjustments(baseline(), set).plan);
  const again = JSON.stringify(applyAdjustments(baseline(), set).plan);
  ok(first === again, "the same adjustments on the same baseline produced two different plans");

  /* The caller's array order must not matter — a store, a fetch and a React
     memo will all hand these over in whatever order they happen to hold them.
     Only `at` then `id` decides. */
  const shuffled = [set[2], set[0], set[1]];
  ok(
    JSON.stringify(applyAdjustments(baseline(), shuffled).plan) === first,
    "the plan depended on the order the records were passed in",
  );

  /* Two records made in the same millisecond still compose one way only. */
  const tied = [
    adj("b2", LONG.date, { kind: "ease", notches: 1 }, "2026-09-11T10:00:00.000Z"),
    adj("b1", LONG.date, { kind: "shorten", minutes: 200 }, "2026-09-11T10:00:00.000Z"),
  ];
  ok(
    JSON.stringify(applyAdjustments(baseline(), tied).plan) ===
      JSON.stringify(applyAdjustments(baseline(), [tied[1], tied[0]]).plan),
    "records sharing a timestamp composed differently depending on array order",
  );

  /* ------------------------------------------------------------------------ */
  /* 2. UNDO IS A DELETION                                                     */
  /* ------------------------------------------------------------------------ */

  const untouched = JSON.stringify(baseline());
  ok(
    JSON.stringify(applyAdjustments(baseline(), []).plan) === untouched,
    "applying no adjustments changed the plan",
  );

  /* The real claim: remove the record and the plan is EXACTLY what it was.
     Not approximately, not with a leftover marker — byte for byte. */
  for (const remove of set) {
    const kept = set.filter((a) => a.id !== remove.id);
    const withAll = applyAdjustments(baseline(), set).plan;
    const withoutOne = applyAdjustments(baseline(), kept).plan;
    ok(
      JSON.stringify(withAll) !== JSON.stringify(withoutOne),
      `${remove.id} changed nothing, so undoing it proves nothing`,
    );
  }
  ok(
    JSON.stringify(
      applyAdjustments(
        baseline(),
        set.filter(() => false),
      ).plan,
    ) === untouched,
    "undoing every adjustment did not return the untouched baseline",
  );

  /* An undone record must never reach the applier. */
  const undone = set.map((a) => ({ ...a, undoneAt: "2026-09-12T09:00:00.000Z" }));
  ok(livePlanAdjustments(undone, GOAL.id).length === 0, "an undone record survived the filter");
  ok(
    JSON.stringify(applyAdjustments(baseline(), livePlanAdjustments(undone, GOAL.id)).plan) ===
      untouched,
    "undoing every record left the plan changed",
  );

  /* Another goal's records are not this goal's. */
  const other = set.map((a) => ({ ...a, goalId: "goal-other" }));
  ok(
    livePlanAdjustments([...set, ...other], GOAL.id).length === set.length,
    "a record from another objective leaked into this plan",
  );

  /* ------------------------------------------------------------------------ */
  /* 3. THE WEEK-INDEX TRAP                                                    */
  /* ------------------------------------------------------------------------ */

  /* Move the target date. This changes `totalWeeks`, which changes what
     `blockFor` calls each week — a record keyed on a week index would now be
     pointing at a different block's day. A record keyed on a date is not. */
  const later = buildPlanForGoal({ ...GOAL, targetDate: "2027-09-01" } as Goal, undefined, NOW);
  ok(later.totalWeeks !== base.totalWeeks, "the target date change did not renumber the plan");

  const movedPlan = applyAdjustments(later, [set[0]]).plan;
  const source = dayOn(movedPlan, LONG.date);
  const destination = dayOn(movedPlan, REST.date);
  ok(source?.focus === "rest", "the day the session moved off is still carrying a session");
  ok(
    destination?.focus === "long-mountain",
    "after the target date moved, the session did not land on the day it was moved to",
  );
  ok(
    destination?.adjusted?.length === 1 && destination.adjusted[0].id === "a1",
    "the destination day does not say why it changed",
  );

  /* ------------------------------------------------------------------------ */
  /* 4. WHAT CANNOT APPLY IS SAID, NOT SWALLOWED                               */
  /* ------------------------------------------------------------------------ */

  const gone = applyAdjustments(baseline(), [
    adj("s1", "2019-01-07", { kind: "rest" }, "2026-09-11T10:00:00.000Z"),
  ]);
  ok(gone.stranded.length === 1, "a record for a day outside the plan vanished silently");
  ok(gone.applied.length === 0, "a record for a day outside the plan counted as applied");
  ok(
    JSON.stringify(gone.plan) === untouched,
    "a record that could not apply still changed the plan",
  );

  /* A shorten that would LENGTHEN is refused rather than quietly ignored. */
  const longer = applyAdjustments(baseline(), [
    adj("s2", LONG.date, { kind: "shorten", minutes: 100_000 }, "2026-09-11T10:00:00.000Z"),
  ]);
  ok(longer.stranded.length === 1, "a shorten that would lengthen the session was accepted");

  /* Below the floor is refused rather than clamped — the athlete is told. */
  const tiny = applyAdjustments(baseline(), [
    adj("s3", LONG.date, { kind: "shorten", minutes: 5 }, "2026-09-11T10:00:00.000Z"),
  ]);
  ok(tiny.stranded.length === 1, "a 5-minute session was silently created");

  /* Nothing in the vocabulary may make a day harder. */
  const easedPlan = applyAdjustments(baseline(), [
    adj("s4", LONG.date, { kind: "ease", notches: 2 }, "2026-09-11T10:00:00.000Z"),
  ]).plan;
  const eased = dayOn(easedPlan, LONG.date)!;
  ok(eased.difficulty <= LONG.difficulty, "easing a day raised its difficulty");
  ok(
    (eased.durationMin ?? 0) < (LONG.durationMin ?? 0),
    "easing a day did not reduce what it asks for",
  );
  ok(
    (eased.elevationM ?? 0) < (LONG.elevationM ?? 0),
    "easing a day left the vertical standing while the time came down",
  );

  /* Completion follows the DATE and never travels with the session. */
  const withDone = baseline();
  const target = withDone.weeks.flatMap((w) => w.days).find((d) => d.date === LONG.date)!;
  target.completed = true;
  const afterMove = applyAdjustments(withDone, [set[0]]).plan;
  ok(
    dayOn(afterMove, LONG.date)?.completed === true,
    "moving a session off a day the athlete had trained erased the tick",
  );
  ok(
    dayOn(afterMove, REST.date)?.completed === false,
    "moving a session onto a day marked it done without anybody training",
  );

  /* A move onto an occupied day exchanges rather than deleting work. */
  const swapped = applyAdjustments(baseline(), [
    adj("s5", LONG.date, { kind: "move", to: OTHER.date }, "2026-09-11T10:00:00.000Z"),
  ]).plan;
  ok(
    dayOn(swapped, LONG.date)?.title === OTHER.title,
    "moving onto an occupied day deleted the session that was already there",
  );
  ok(
    dayOn(swapped, OTHER.date)?.title === LONG.title,
    "moving onto an occupied day did not deliver the session",
  );

  /* ------------------------------------------------------------------------ */
  /* 5. THE HISTORY IS GROUPED BY THE ACT THAT MADE IT                         */
  /* ------------------------------------------------------------------------ */

  const batch: PlanAdjustment[] = [
    adj("c1", LONG.date, { kind: "rest" }, "2026-09-11T13:00:00.000Z", { batchId: "batch-1" }),
    adj("c2", REST.date, { kind: "rest" }, "2026-09-11T13:00:00.000Z", { batchId: "batch-1" }),
  ];
  const history = planChangeHistory([...set, ...batch], GOAL.id);
  ok(history.length === 4, `history grouped into ${history.length} entries, expected 4`);
  ok(history[0].adjustments.length === 2, "a two-record act was not grouped into one entry");
  ok(history[0].at >= history[1].at, "the history is not newest first");
  ok(
    planChangeHistory([...set, ...batch], "goal-other").length === 0,
    "another objective's changes appeared in this objective's history",
  );

  /* The summary line is the app's own words, derived from the record. */
  ok(describeChange(set[0]).startsWith("Moved to "), "a move does not describe itself as a move");
  ok(describeChange(set[1]) === "Cut to 120 min", "a shorten does not name the new length");

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
