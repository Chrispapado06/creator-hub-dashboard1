/**
 * TEST SET FOR THE DERIVED SESSION REASON.
 *
 * `npm run test:session-reason` — esbuild to node, like every other suite here.
 * `coach/sessionReason.ts` is pure and reads no store, so these are run rather
 * than reasoned about.
 *
 * WHAT IT IS ACTUALLY PROVING. The module's whole claim is that the sentence a
 * session screen shows is MADE OF FIGURES THAT EXIST, and that when no such
 * figure exists it says nothing. Both halves are cheap to believe and expensive
 * to be wrong about, because the failure mode is not a crash: it is a plausible
 * sentence with an invented number in it, on the screen an athlete uses to
 * decide how hard to go on a mountain.
 *
 *   Suite 1  every figure a reason declares appears VERBATIM in its sentence,
 *            across every non-rest day of two full plans. This is the anti-
 *            platitude rule: a sentence cannot drift away from its figures
 *            without this failing.
 *   Suite 2  a goal with no curated mountain never gets a sentence that cites
 *            a route. This is the Erciyes rule from `training.ts` applied to
 *            prose: an unsurveyed peak has no route, so nothing may be said
 *            about one.
 *   Suite 3  the ladder's order — a deload week, a taper week and a curated
 *            long day each reach the rung they should.
 *   Suite 4  the guide rung: a set two certified guides signed produces a
 *            reason that names them, and an UNSIGNED set with the same figures
 *            in it produces nothing.
 *   Suite 5  rest days get silence, and the same inputs always give the same
 *            sentence.
 *
 * WHAT THIS FILE DOES NOT PROVE. That any screen renders the result. That is a
 * call site, verified by reading it.
 */
import { sessionReasonFor, type SessionReason } from "@/coach/sessionReason";
import { buildPlanForGoal, parseBlockLabel, type TrainingShape } from "@/tracking/training";
import type { ObjectiveRequirementSet } from "@/objectives/requirements";
import { MOUNTAINS } from "@/data/mock/mountains";
import type { Goal, Mountain, TrainingPlan } from "@/types";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* A fixed clock and fixed objectives: every plan below is the same plan on
   every run, which is the only way a determinism check means anything. */
const NOW = new Date("2026-09-11T09:00:00.000Z");

const MONT_BLANC = MOUNTAINS.find((m) => m.id === "mont-blanc") as Mountain;

const CURATED_GOAL: Goal = {
  id: "goal-mb",
  name: "Mont Blanc",
  mountainId: "mont-blanc",
  targetDate: "2027-06-20",
  trainingStartedAt: "2026-09-07",
  status: "active",
} as Goal;

/** A goal somebody typed. No curated record, therefore no route, therefore no
    route figures anywhere in its reasons. */
const TYPED_GOAL: Goal = {
  id: "goal-typed",
  name: "Erciyes Dağı",
  targetDate: "2027-06-20",
  trainingStartedAt: "2026-09-07",
  elevationM: 3917,
  status: "active",
} as Goal;

/** An athlete who trains two days a week already, so a ramp exists. */
const SHAPE: TrainingShape = {
  trainingDays: [1, 2, 4, 6],
  typicalSessionMin: 75,
  trainingBaseline: "1-2",
};

const curatedPlan = buildPlanForGoal(CURATED_GOAL, MONT_BLANC, NOW, SHAPE);
const typedPlan = buildPlanForGoal(TYPED_GOAL, undefined, NOW, SHAPE);

interface Case {
  reason: SessionReason | null;
  where: string;
  block: string;
}

/** Every non-rest day of a plan, with its reason. */
function sweep(
  plan: TrainingPlan,
  goal: Goal,
  mountain: Mountain | undefined,
  requirements?: ObjectiveRequirementSet | null,
): Case[] {
  const out: Case[] = [];
  for (const week of plan.weeks) {
    for (const day of week.days) {
      out.push({
        reason: sessionReasonFor({ day, week, plan, goal, mountain, requirements, shape: SHAPE }),
        where: `${goal.name} w${week.index} ${day.date} ${day.focus}`,
        block: week.block,
      });
    }
  }
  return out;
}

/* A reviewed set, built here rather than imported: `data/mock/mountainRequirements.ts`
   ships every record UNREVIEWED on purpose (no guide has signed one yet), so the
   only way to exercise the guide rung is to construct what a signed sheet will
   look like. The tuple type below is the point — this object cannot be written
   without naming two certified reviewers. */
const REVIEWED: ObjectiveRequirementSet = {
  objectiveId: "mont-blanc",
  objectiveName: "Mont Blanc",
  routeName: "Goûter Route",
  sourceText: {
    technical: MONT_BLANC.technicalRequirements,
    experience: MONT_BLANC.requiredExperience,
    training: MONT_BLANC.trainingRequirements,
  },
  requirements: [
    {
      id: "mb-day-ascent",
      kind: "single-day-ascent",
      unit: "m",
      metres: 1000,
      label: "1,000 m of ascent in one day carrying a pack",
      necessity: "required",
      why: "Summit day from the Goûter hut is a single sustained climb with no opportunity to break it up.",
      source: { kind: "guide-review", detail: "Test reviewer sheet" },
    },
  ],
  review: {
    reviewed: true,
    reviewers: [
      { name: "A. Reviewer", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "BMG" },
      { name: "B. Reviewer", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "SNGM" },
    ],
    reviewedOn: "2026-09-01",
    scope: "Goûter Route, summer conditions",
  },
};

/** The same figures with nobody's name on them. Must produce nothing. */
const UNREVIEWED: ObjectiveRequirementSet = {
  ...REVIEWED,
  requirements: [],
  review: { reviewed: false, awaiting: "No guide has reviewed this sheet." },
};

function main() {
  /* ------------------------------------------------------------------------ */
  /* Suite 1 — every figure is in the sentence, and there is always one        */
  /* ------------------------------------------------------------------------ */

  const all = [
    ...sweep(curatedPlan, CURATED_GOAL, MONT_BLANC),
    ...sweep(typedPlan, TYPED_GOAL, undefined),
  ];
  ok(all.length > 200, `only ${all.length} days swept — the plans did not generate`);

  let withReason = 0;
  for (const c of all) {
    if (!c.reason) continue;
    withReason += 1;
    ok(c.reason.figures.length > 0, `${c.where}: a reason with no figure in it`);
    for (const f of c.reason.figures) {
      ok(
        c.reason.text.includes(f.printed),
        `${c.where}: declares the figure "${f.printed}" but its sentence does not contain it — ${c.reason.text}`,
      );
      ok(f.from.trim().length > 0, `${c.where}: the figure "${f.printed}" names no source`);
    }
    ok(c.reason.attribution.trim().length > 0, `${c.where}: a reason with no attribution`);
    ok(
      !/\bNaN\b|Infinity|undefined|null/.test(c.reason.text),
      `${c.where}: a non-figure leaked into the sentence — ${c.reason.text}`,
    );
  }
  ok(withReason > 150, `only ${withReason} days produced a reason`);

  /* ------------------------------------------------------------------------ */
  /* Suite 2 — an unsurveyed objective is never given a route                  */
  /* ------------------------------------------------------------------------ */

  const typed = sweep(typedPlan, TYPED_GOAL, undefined).filter((c) => c.reason);
  ok(typed.length > 0, "a typed goal produced no reasons at all");
  for (const c of typed) {
    const r = c.reason!;
    ok(
      r.kind !== "route-ascent" && r.kind !== "route-duration" && r.kind !== "week-ascent",
      `${c.where}: reached a route rung with no curated mountain — ${r.kind}`,
    );
    ok(
      !r.text.includes("ICEFALL's record") && !r.attribution.includes("ICEFALL's record"),
      `${c.where}: cited a record that does not exist — ${r.text}`,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Suite 3 — the ladder reaches the rung it should                           */
  /* ------------------------------------------------------------------------ */

  const curated = sweep(curatedPlan, CURATED_GOAL, MONT_BLANC);

  const deloads = curated.filter((c) => parseBlockLabel(c.block)?.deload && c.reason);
  ok(deloads.length > 0, "the plan generated no deload weeks to check");
  ok(
    deloads.every((c) => c.reason!.kind === "deload"),
    "a deload week did not give the deload reason",
  );

  const tapers = curated.filter((c) => parseBlockLabel(c.block)?.kind === "taper" && c.reason);
  ok(tapers.length > 0, "the plan generated no taper weeks to check");
  ok(
    tapers.every((c) => c.reason!.kind === "taper"),
    "a taper week did not give the taper reason",
  );

  /* Past the build-up AND out of a deload week: the two rungs that outrank the
     mountain on purpose. Inside the ramp the correct answer IS the ramp, which
     is what suite 3's last check proves. */
  const longDays = curatedPlan.weeks
    .flatMap((w) => w.days.map((d) => ({ w, d })))
    .filter(
      ({ w, d }) => d.focus === "long-mountain" && !parseBlockLabel(w.block)?.deload && w.index > 6,
    );
  ok(longDays.length > 0, "the plan generated no long mountain days past the build-up");
  const longReason = sessionReasonFor({
    day: longDays[0].d,
    week: longDays[0].w,
    plan: curatedPlan,
    goal: CURATED_GOAL,
    mountain: MONT_BLANC,
    shape: SHAPE,
  });
  ok(
    longReason?.kind === "route-ascent",
    `a curated long day reached ${longReason?.kind ?? "no reason"}, not route-ascent`,
  );
  ok(
    longReason!.attribution.includes("No guide has reviewed"),
    "a curated-record reason did not say it is unreviewed",
  );

  /* Inside the build-up, the mountain does NOT win: the honest answer to why a
     week 1 Saturday is small is the ramp, not the route. */
  const rampLong = curatedPlan.weeks
    .flatMap((w) => w.days.map((d) => ({ w, d })))
    .find(({ w, d }) => d.focus === "long-mountain" && w.index === 1);
  ok(rampLong !== undefined, "the plan has no long day in week 1");
  const rampReason = sessionReasonFor({
    day: rampLong!.d,
    week: rampLong!.w,
    plan: curatedPlan,
    goal: CURATED_GOAL,
    mountain: MONT_BLANC,
    shape: SHAPE,
  });
  ok(
    rampReason?.kind === "build-up",
    `a week-1 session reached ${rampReason?.kind ?? "no reason"} rather than explaining the build-up that made it small`,
  );

  /* ------------------------------------------------------------------------ */
  /* Suite 4 — the guide rung                                                  */
  /* ------------------------------------------------------------------------ */

  const signed = sessionReasonFor({
    day: longDays[0].d,
    week: longDays[0].w,
    plan: curatedPlan,
    goal: CURATED_GOAL,
    mountain: MONT_BLANC,
    requirements: REVIEWED,
    shape: SHAPE,
  });
  ok(signed?.kind === "guide-requirement", "a reviewed requirement did not win the ladder");
  ok(
    signed!.attribution.includes("A. Reviewer") && signed!.attribution.includes("B. Reviewer"),
    "a guide reason did not name the guides who signed it",
  );
  ok(
    signed!.text.includes("1,000 m"),
    `a guide reason did not print the guide's own figure — ${signed!.text}`,
  );
  ok(
    signed!.figures.every((f) => signed!.text.includes(f.printed)),
    "a guide reason declared a figure its sentence does not contain",
  );

  const unsigned = sessionReasonFor({
    day: longDays[0].d,
    week: longDays[0].w,
    plan: curatedPlan,
    goal: CURATED_GOAL,
    mountain: MONT_BLANC,
    requirements: UNREVIEWED,
    shape: SHAPE,
  });
  ok(
    unsigned?.kind !== "guide-requirement",
    "an unreviewed set was quoted as though a guide had signed it",
  );

  /* ------------------------------------------------------------------------ */
  /* Suite 5 — silence, and determinism                                        */
  /* ------------------------------------------------------------------------ */

  const restDays = curatedPlan.weeks.flatMap((w) =>
    w.days.filter((d) => d.focus === "rest").map((d) => ({ w, d })),
  );
  ok(restDays.length > 0, "the plan generated no rest days");
  ok(
    restDays.every(
      ({ w, d }) =>
        sessionReasonFor({
          day: d,
          week: w,
          plan: curatedPlan,
          goal: CURATED_GOAL,
          mountain: MONT_BLANC,
          shape: SHAPE,
        }) === null,
    ),
    "a rest day was given a reason on top of the one the generator already wrote",
  );

  const unknownBlock = sessionReasonFor({
    day: longDays[0].d,
    week: { ...longDays[0].w, block: "Something nobody here wrote" },
    plan: curatedPlan,
    goal: CURATED_GOAL,
    mountain: MONT_BLANC,
    shape: SHAPE,
  });
  ok(unknownBlock === null, "an unrecognised block label still produced a confident sentence");

  const a = JSON.stringify(sweep(curatedPlan, CURATED_GOAL, MONT_BLANC).map((c) => c.reason));
  const b = JSON.stringify(sweep(curatedPlan, CURATED_GOAL, MONT_BLANC).map((c) => c.reason));
  ok(a === b, "the same plan produced two different sets of sentences");

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures.slice(0, 40)) console.log(`  - ${f}`);
    if (failures.length > 40) console.log(`  … and ${failures.length - 40} more`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
