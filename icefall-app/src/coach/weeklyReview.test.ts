/**
 * TEST SET FOR THE WEEKLY REVIEW.
 *
 * `npm run test:weekly-review` — esbuild to node, like every other suite here.
 * `coach/weeklyReview.ts` is pure, imports no React and touches no store, so
 * these are run rather than reasoned about.
 *
 * WHAT IS BEING DEFENDED, suite by suite. Each of these is a claim the module's
 * header makes, and each is the kind that is easy to believe and expensive to
 * be wrong about:
 *
 *   1. IT SAYS SO RATHER THAN INVENTING. Four states before "ready", each with
 *      its own sentence, and none of them producing a count or a proposal.
 *   2. RULE 5. A tick and a recording are never merged into one number or one
 *      word, and the sentence the athlete reads says which is which.
 *   3. AN EMPTY RECORD IS NOT AN EMPTY WEEK. A week with no recording never
 *      produces a proposal, however far short of plan it looks.
 *   4. VITALS ARE REPORTED AND NEVER ACTED ON. No finding and no proposal
 *      contains a measured figure, the coverage sentence is always present, and
 *      a reading outside the week is shown as outside it.
 *   5. RULE 1, ENFORCED RATHER THAN ASSERTED. Every action the review emits is
 *      round-tripped through `parseCoachAction` — the same boundary a model's
 *      tool call goes through. An action that would not survive that boundary
 *      is an action the review could not have had applied anyway.
 *   6. THE TWO PROPOSAL RULES fire on their measured triggers and on nothing
 *      else: the shortfall rule needs a recording, the pattern rule needs two
 *      of three weeks, and neither may re-offer a change already made.
 *   7. DETERMINISM. Same input twice, byte-identical output.
 *
 * WHAT THIS FILE DOES NOT PROVE. That the screen renders any of it, that the
 * hub row appears, or that `commitProposal` writes what `previewAction`
 * previewed — the last of those is `planActions.test.ts`'s, deliberately, since
 * the review deliberately owns no write path of its own.
 */
import {
  buildWeeklyReview,
  finishedWeeks,
  reviewableWeek,
  type ReviewActivity,
  type WeeklyReview,
  type WeeklyReviewInput,
} from "@/coach/weeklyReview";
import { parseCoachAction, COACH_TOOL_NAMES } from "@/coach/tools";
import type { VitalReport } from "@/coach/recovery";
import type { CheckIn } from "@/coach/types";
import type { PlanAdjustment } from "@/tracking/adjustments";
import type { Difficulty, TrainingDay, TrainingFocus, TrainingPlan, TrainingWeek } from "@/types";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* A plan built by hand                                                        */
/* -------------------------------------------------------------------------- */

/**
 * HAND-BUILT RATHER THAN GENERATED, deliberately.
 *
 * `buildPlanForGoal` decides where the long day lands from the athlete's
 * declared training days, and the pattern rule below is precisely about the
 * long day being on the wrong weekday. A test that let the generator choose
 * would be testing the generator's taste; this one fixes the week and tests the
 * review.
 */
const FOCUS_MINUTES: Record<string, number> = {
  "long-mountain": 240,
  endurance: 60,
  strength: 45,
  intervals: 50,
  recovery: 30,
  technical: 60,
  rest: 0,
};

function shift(date: string, by: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(
    t.getUTCDate(),
  ).padStart(2, "0")}`;
}

function mkWeek(index: number, block: string, monday: string, focuses: TrainingFocus[]): TrainingWeek {
  return {
    index,
    block,
    startDate: monday,
    days: focuses.map((focus, i): TrainingDay => {
      const minutes = FOCUS_MINUTES[focus] ?? 45;
      return {
        date: shift(monday, i),
        focus,
        title: focus === "rest" ? "Rest" : `${focus} session`,
        durationMin: minutes || undefined,
        elevationM: focus === "long-mountain" ? 1200 : focus === "endurance" ? 300 : undefined,
        difficulty: (focus === "long-mountain" ? 4 : 2) as Difficulty,
        completed: false,
      };
    }),
  };
}

/** Mon Tue Wed Thu Fri Sat Sun — long day on Saturday, which is index 5. */
const SHAPE: TrainingFocus[] = [
  "rest",
  "endurance",
  "strength",
  "rest",
  "endurance",
  "long-mountain",
  "rest",
];

const MONDAYS = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"];

function mkPlan(shapes: TrainingFocus[][] = MONDAYS.map(() => SHAPE)): TrainingPlan {
  return {
    id: "plan-test",
    goalId: "goal-test",
    title: "Test plan",
    totalWeeks: MONDAYS.length,
    currentWeek: 3,
    weeks: MONDAYS.map((m, i) => mkWeek(i, i < 2 ? "Base" : "Build", m, shapes[i] ?? SHAPE)),
  };
}

const TODAY = "2026-09-11"; // Friday of week 3
const COMPUTED_AT = "2026-09-11T07:30:00.000Z";

function act(id: string, date: string, minutes: number, ascent = 0): ReviewActivity {
  return {
    id,
    title: "Hike",
    /* Midday local, so the local date is unambiguous under any node TZ. */
    startedAt: `${date}T12:00:00.000Z`,
    durationSec: minutes * 60,
    distanceKm: minutes / 10,
    elevationGainM: ascent,
  };
}

function checkIn(date: string, energy: number): CheckIn {
  return { date, energy, soreness: 2, sleep: 3, stress: 2, motivation: 4 };
}

const localDate = (iso: string) => iso.slice(0, 10);

function input(over: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    today: TODAY,
    computedAt: COMPUTED_AT,
    plan: mkPlan(),
    objective: { name: "Mont Blanc", targetDate: "2027-06-20" },
    completedByDate: new Map(),
    satisfiedByActivity: new Set(),
    activities: [],
    adjustments: [],
    checkIns: [],
    vitals: [],
    localDate,
    ...over,
  };
}

function vital(over: Partial<VitalReport> = {}): VitalReport {
  return {
    id: "sleepDuration",
    label: "Sleep",
    value: 372,
    unit: "min",
    source: "oura",
    sourceLabel: "your Oura ring",
    measuredOn: "2026-09-05",
    when: "last night",
    scored: true,
    note: "Measured by your Oura ring.",
    ...over,
  };
}

/** Every string the athlete could read, so a claim cannot hide in a field. */
function allProse(r: WeeklyReview): string {
  return [
    r.note,
    ...r.findings.flatMap((f) => [f.text, ...f.figures]),
    ...r.proposals.flatMap((p) => [p.rationale, ...p.basis, p.action.why]),
  ].join(" | ");
}

/* -------------------------------------------------------------------------- */

function main() {
  /* ======================================================================== */
  /* 1 — TOO LITTLE TO SAY, SAID                                              */
  /* ======================================================================== */

  const noGoal = buildWeeklyReview(input({ plan: null, objective: null }));
  ok(noGoal.state === "no-objective", `no objective gave state ${noGoal.state}`);
  ok(noGoal.note.length > 0, "the no-objective state came back with no sentence");
  ok(noGoal.proposals.length === 0, "a review with no objective proposed a change");
  ok(noGoal.counts.prescribed === 0, "a review with no objective produced a count");

  /* A plan whose first week has not finished. `today` sits inside week 0. */
  const early = buildWeeklyReview(input({ today: "2026-08-19" }));
  ok(early.state === "no-finished-week", `an unfinished first week gave ${early.state}`);
  ok(early.findings.length === 0, "an unfinished first week produced findings");

  /* A rest week prescribes nothing, and "0 of 0" must never be printed. */
  const restWeek = mkPlan(
    MONDAYS.map((_, i) => (i === 2 ? (Array(7).fill("rest") as TrainingFocus[]) : SHAPE)),
  );
  const rest = buildWeeklyReview(
    input({ plan: restWeek, activities: [act("a", "2026-09-02", 60)] }),
  );
  ok(rest.state === "week-prescribed-nothing", `a rest week gave ${rest.state}`);
  ok(!allProse(rest).includes("0 of 0"), "a rest week was described as 0 of 0");

  /* Nothing recorded, nothing ticked, no check-in: the review declines. */
  const blank = buildWeeklyReview(input({ activities: [act("old", "2026-08-01", 90)] }));
  ok(blank.state === "week-empty", `a blank week gave ${blank.state}`);
  ok(blank.proposals.length === 0, "a blank week produced a proposal");
  ok(
    blank.note.includes("not a week without training"),
    "a blank week was not distinguished from a week without training",
  );

  /* ======================================================================== */
  /* 2 — RULE 5: A TICK AND A RECORDING ARE NOT THE SAME EVIDENCE             */
  /* ======================================================================== */

  /* Week 2 is 31 Aug – 6 Sep. Tuesday 1 Sep endurance, recorded. Wednesday 2
     Sep strength, ticked only. */
  const mixed = buildWeeklyReview(
    input({
      activities: [act("r1", "2026-09-01", 60, 300), act("r2", "2026-09-05", 250, 1300)],
      satisfiedByActivity: new Set(["2026-09-01", "2026-09-05"]),
      completedByDate: new Map([
        ["2026-09-01", true],
        ["2026-09-02", true],
        ["2026-09-05", true],
      ]),
    }),
  );
  ok(mixed.state === "ready", `the mixed week gave ${mixed.state}`);
  ok(mixed.counts.prescribed === 4, `prescribed was ${mixed.counts.prescribed}, expected 4`);
  ok(
    mixed.counts.completedRecorded === 2,
    `completedRecorded was ${mixed.counts.completedRecorded}, expected 2`,
  );
  ok(
    mixed.counts.completedTicked === 1,
    `completedTicked was ${mixed.counts.completedTicked}, expected 1`,
  );
  ok(mixed.counts.missed === 1, `missed was ${mixed.counts.missed}, expected 1`);

  const completion = mixed.findings.find((f) => f.id === "completion");
  ok(completion !== undefined, "there is no completion finding");
  ok(
    completion !== undefined && completion.text.includes("ticked"),
    "a week containing a tick did not say the word",
  );
  ok(
    completion !== undefined && completion.text.includes("taking your word"),
    "a ticked session was not labelled as the athlete's own word for it",
  );
  ok(
    mixed.days.filter((d) => d.evidence === "recorded").length === 2 &&
      mixed.days.filter((d) => d.evidence === "ticked").length === 1,
    "the per-day evidence split does not match the counts",
  );

  /* The long day WAS recorded here, so the review must not say it was missed. */
  const longFinding = mixed.findings.find((f) => f.id === "long-day");
  ok(
    longFinding !== undefined && longFinding.text.includes("went ahead"),
    "a completed long day was not reported as completed",
  );

  /* ======================================================================== */
  /* 3 — AN EMPTY RECORD IS NOT AN EMPTY WEEK                                 */
  /* ======================================================================== */

  /* Everything ticked, nothing recorded in the week. A shortfall on paper of
     100% of the minutes — and no proposal, because there is no evidence. */
  const tickedOnly = buildWeeklyReview(
    input({
      activities: [act("before", "2026-08-20", 200, 900)],
      completedByDate: new Map([
        ["2026-09-01", true],
        ["2026-09-02", true],
      ]),
    }),
  );
  ok(tickedOnly.state === "ready", `the ticked-only week gave ${tickedOnly.state}`);
  ok(
    tickedOnly.proposals.length === 0,
    "a week with no recording produced a proposal off the app's own blindness",
  );
  const volume = tickedOnly.findings.find((f) => f.id === "volume");
  ok(
    volume !== undefined && volume.text.includes("not the same as a week without training"),
    "an unrecorded week was described as a week without training",
  );

  /* ======================================================================== */
  /* 4 — VITALS ARE REPORTED, NEVER ACTED ON                                  */
  /* ======================================================================== */

  const withVitals = buildWeeklyReview(
    input({
      activities: [act("r1", "2026-09-01", 60, 300)],
      satisfiedByActivity: new Set(["2026-09-01"]),
      completedByDate: new Map([["2026-09-01", true]]),
      vitals: [
        vital({ measuredOn: "2026-09-05" }),
        vital({ id: "restingHeartRate", label: "Resting heart rate", value: 48, unit: "bpm", measuredOn: "2026-09-10" }),
      ],
    }),
  );
  ok(withVitals.vitals.inWindow.length === 1, "a reading inside the week was not placed inside it");
  ok(
    withVitals.vitals.outside.length === 1,
    "a reading outside the week was not placed outside it",
  );
  ok(withVitals.vitals.coverage.length > 0, "the coverage sentence is missing");
  ok(
    withVitals.vitals.coverage.includes("not a history of nights"),
    "the coverage sentence does not say ICEFALL keeps no night history",
  );
  /* THE LOAD-BEARING ONE: no measured figure reaches a finding or a proposal. */
  const prose = allProse(withVitals);
  ok(!prose.includes("372"), "a measured sleep figure reached the review's prose");
  ok(!prose.includes("48 bpm"), "a measured heart rate reached the review's prose");
  ok(!prose.includes("Oura"), "an instrument's name reached the review's prose");

  /* A reading with no stated night is treated as outside the week, never as
     this week's by default. */
  const undated = buildWeeklyReview(
    input({
      activities: [act("r1", "2026-09-01", 60, 300)],
      satisfiedByActivity: new Set(["2026-09-01"]),
      completedByDate: new Map([["2026-09-01", true]]),
      vitals: [vital({ measuredOn: undefined })],
    }),
  );
  ok(
    undated.vitals.inWindow.length === 0 && undated.vitals.outside.length === 1,
    "a reading with no date was counted as belonging to the reviewed week",
  );

  /* ======================================================================== */
  /* 5 — THE SHORTFALL RULE                                                   */
  /* ======================================================================== */

  /* Week 2 prescribes 60 + 45 + 60 + 240 = 405 min. One 60-minute recording is
     under half, and there IS a recording — so the rule fires. */
  const shortfall = buildWeeklyReview(
    input({
      activities: [act("r1", "2026-09-01", 60, 300)],
      satisfiedByActivity: new Set(["2026-09-01"]),
      completedByDate: new Map([["2026-09-01", true]]),
    }),
  );
  const ease = shortfall.proposals.find((p) => p.action.tool === "ease_session");
  ok(ease !== undefined, "a week under half of plan produced no easing proposal");
  ok(
    ease !== undefined && ease.action.tool === "ease_session" && ease.action.notches === 1,
    "the easing proposal was not one notch",
  );
  ok(
    ease !== undefined && ease.action.tool === "ease_session" && ease.action.date === "2026-09-12",
    `the easing proposal landed on ${ease && ease.action.tool === "ease_session" ? ease.action.date : "?"}, expected the coming week's long day`,
  );
  ok(
    ease !== undefined && ease.basis.some((b) => b.includes("405")),
    "the easing proposal does not quote the week's prescribed minutes",
  );
  ok(
    ease !== undefined && ease.rationale.includes("Mont Blanc"),
    "the easing proposal does not name what it is protecting",
  );

  /* IT DOES NOT FIRE INTO A TAPER. Make the coming week lighter than the
     reviewed one and the step down is already there. */
  /* The coming week holds ONE 60-minute session, on the Saturday — lighter
     than the 405 minutes the reviewed week asked for, and late enough in the
     week that it is a day the review could still reach. So the only thing
     stopping the ease is the taper guard itself. */
  const taper = mkPlan(
    MONDAYS.map((_, i) =>
      i === 3
        ? (["rest", "rest", "rest", "rest", "rest", "endurance", "rest"] as TrainingFocus[])
        : SHAPE,
    ),
  );
  const tapered = buildWeeklyReview(
    input({
      plan: taper,
      activities: [act("r1", "2026-09-01", 60, 300)],
      satisfiedByActivity: new Set(["2026-09-01"]),
      completedByDate: new Map([["2026-09-01", true]]),
    }),
  );
  ok(
    tapered.proposals.every((p) => p.action.tool !== "ease_session"),
    "the review eased a week that was already a taper",
  );

  /* IT DOES NOT RE-OFFER A CHANGE ALREADY MADE. */
  const alreadyEased: PlanAdjustment = {
    id: "adj-1",
    goalId: "goal-test",
    date: "2026-09-12",
    change: { kind: "ease", notches: 1 },
    why: "already done",
    at: "2026-09-08T10:00:00.000Z",
    by: "coach",
  };
  const again = buildWeeklyReview(
    input({
      activities: [act("r1", "2026-09-01", 60, 300)],
      satisfiedByActivity: new Set(["2026-09-01"]),
      completedByDate: new Map([["2026-09-01", true]]),
      adjustments: [alreadyEased],
    }),
  );
  ok(
    again.proposals.every((p) => p.action.tool !== "ease_session"),
    "the review offered an ease that had already been applied to that day",
  );

  /* A WEEK THAT WENT WELL GETS NOTHING. */
  const good = buildWeeklyReview(
    input({
      activities: [
        act("g1", "2026-09-01", 60, 300),
        act("g2", "2026-09-02", 45),
        act("g3", "2026-09-04", 60, 300),
        act("g4", "2026-09-05", 250, 1300),
      ],
      satisfiedByActivity: new Set([
        "2026-09-01",
        "2026-09-02",
        "2026-09-04",
        "2026-09-05",
      ]),
      completedByDate: new Map([
        ["2026-09-01", true],
        ["2026-09-02", true],
        ["2026-09-04", true],
        ["2026-09-05", true],
      ]),
    }),
  );
  ok(good.allClear && good.proposals.length === 0, "a completed week still produced a proposal");
  ok(good.state === "ready", "a completed week was not reviewable");

  /* ======================================================================== */
  /* 6 — THE PATTERN RULE                                                     */
  /* ======================================================================== */

  /* Saturdays missed, Sundays trained, in weeks 1 and 2. Week 0 untouched.
     Two of three is the floor, so this fires. */
  const sundays = buildWeeklyReview(
    input({
      activities: [
        act("s1", "2026-08-30", 260, 1300), // Sunday of week 1
        act("s2", "2026-09-06", 255, 1250), // Sunday of week 2
        act("s3", "2026-09-01", 30),
      ],
      completedByDate: new Map([["2026-09-01", true]]),
      satisfiedByActivity: new Set(["2026-09-01"]),
    }),
  );
  const move = sundays.proposals.find((p) => p.action.tool === "move_session");
  ok(move !== undefined, "two displaced long days in three weeks produced no move");
  ok(
    move !== undefined && move.action.tool === "move_session" && move.action.date === "2026-09-12",
    "the move did not start from the coming week's long day",
  );
  ok(
    move !== undefined && move.action.tool === "move_session" && move.action.to === "2026-09-13",
    "the move did not land on the weekday the athlete actually trains",
  );
  ok(
    move !== undefined && move.basis.length >= 2,
    "the move did not show both weeks of evidence",
  );

  /* ONE WEEK IS NOT A PATTERN. */
  const onceOnly = buildWeeklyReview(
    input({
      activities: [act("s2", "2026-09-06", 255, 1250), act("s3", "2026-09-01", 30)],
      completedByDate: new Map([["2026-09-01", true]]),
      satisfiedByActivity: new Set(["2026-09-01"]),
    }),
  );
  ok(
    onceOnly.proposals.every((p) => p.action.tool !== "move_session"),
    "a single displaced week was treated as a pattern",
  );

  /* ======================================================================== */
  /* 7 — RULE 1: EVERY ACTION SURVIVES THE MODEL'S OWN BOUNDARY               */
  /* ======================================================================== */

  const everyProposal = [...shortfall.proposals, ...sundays.proposals];
  ok(everyProposal.length >= 2, "not enough proposals were produced to check the vocabulary");
  for (const p of everyProposal) {
    ok(
      (COACH_TOOL_NAMES as readonly string[]).includes(p.action.tool),
      `the review emitted ${p.action.tool}, which is not a coach tool`,
    );
    /* THE REAL CHECK. `parseCoachAction` is the boundary a model's tool call
       crosses; an action the review emits that would not survive it is an
       action that could never be applied, and one that carried a field the
       parser drops would be a field the review thought it had set. */
    const { tool, ...rest } = p.action;
    const round = parseCoachAction(tool, rest);
    ok(round !== null, `the review's ${tool} did not survive parseCoachAction`);
    ok(
      round !== null && JSON.stringify(round) === JSON.stringify(p.action),
      `the review's ${tool} changed shape crossing parseCoachAction`,
    );
    /* No prescription anywhere in it — the closed vocabulary has no field for
       one, and this asserts the review did not smuggle one in another way. */
    const keys = Object.keys(p.action);
    for (const forbidden of ["title", "distanceKm", "ascentM", "elevationM", "difficulty"]) {
      ok(!keys.includes(forbidden), `the review's ${tool} carried a ${forbidden}`);
    }
  }

  /* THE TWO TOOLS A REVIEW MAY NEVER REACH FOR. A date is a flight and a
     booking; a logged activity is a claim about what somebody did. */
  for (const r of [shortfall, sundays, mixed, good, tickedOnly]) {
    ok(
      r.proposals.every((p) => p.action.tool !== "set_target_date"),
      "a review proposed moving the objective's date",
    );
    ok(
      r.proposals.every((p) => p.action.tool !== "log_activity"),
      "a review proposed logging an activity",
    );
    ok(r.proposals.length <= 2, `a review produced ${r.proposals.length} proposals, cap is 2`);
  }

  /* ======================================================================== */
  /* 8 — DETERMINISM, AND NO WRITES                                           */
  /* ======================================================================== */

  const a = buildWeeklyReview(input({ activities: [act("r1", "2026-09-01", 60, 300)] }));
  const b = buildWeeklyReview(input({ activities: [act("r1", "2026-09-01", 60, 300)] }));
  ok(JSON.stringify(a) === JSON.stringify(b), "two identical inputs produced different reviews");

  const frozen: readonly PlanAdjustment[] = [alreadyEased];
  const before = JSON.stringify(frozen);
  buildWeeklyReview(input({ adjustments: frozen }));
  ok(JSON.stringify(frozen) === before, "the review mutated the adjustments it was given");

  /* The week selector itself, since everything above depends on it. */
  ok(finishedWeeks(mkPlan(), TODAY).length === 3, "the wrong number of weeks counted as finished");
  ok(
    reviewableWeek(mkPlan(), TODAY)?.startDate === "2026-08-31",
    "the reviewed week is not the most recent finished one",
  );
  ok(
    reviewableWeek(mkPlan(), "2026-09-06")?.startDate === "2026-08-24",
    "a week whose last day is today was treated as finished",
  );

  /* The computed-at stamp is carried through untouched — the screen prints it
     as a claim about when this happened. */
  ok(a.computedAt === COMPUTED_AT, "the review invented its own computed-at");

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
