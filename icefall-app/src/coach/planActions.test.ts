/**
 * TEST SET FOR THE COACH'S TOOLS AND THE THREE GUARDRAILS AROUND THEM.
 *
 * `npm run test:coach-actions`. esbuild to node, like every other suite here.
 *
 * ============================================================================
 * WHAT IS BEING PROVED, AND WHY EACH ONE IS WORTH A TEST
 * ============================================================================
 *
 * 1. THE ABSOLUTE REFUSAL. A day readiness or recovery has downgraded is never
 *    made harder — by the model, by a tool, by a confirmation, or by Undo. This
 *    is the one rule in the phase that has no exceptions, so it is tested from
 *    every direction there is: a move that lands a hard session on today, a
 *    week reschedule that does the same by accident, a target-date change that
 *    rebuilds today into a harder day, and an Undo that hands back a session
 *    the coach took away. Each is then re-run with the downgrade lifted, to
 *    prove the guard is refusing for the stated reason and not refusing
 *    everything.
 *
 * 2. THE THRESHOLD IS A MEASUREMENT. `planActions.ts` claims 25% of a week's
 *    prescribed minutes separates the long mountain day from every other
 *    session, and cites a measurement across 798 weeks. Suite 3 RE-RUNS that
 *    measurement rather than trusting the comment, so the day somebody retunes
 *    the generator and the bands overlap, this fails instead of the rule
 *    quietly ceasing to mean what it says.
 *
 * 3. THE VOCABULARY IS CLOSED. Suite 4 feeds `parseCoachAction` the things a
 *    model actually gets wrong — a date that does not exist, a weekday name, a
 *    number as a string, a missing reason — and checks every one is refused
 *    rather than guessed at.
 *
 * 4. THE PREVIEW IS THE COMMIT. Suite 5 checks a preview is deterministic and
 *    that the plan it shows is arithmetically the plan the records produce.
 *
 * 5. THE TWO SCHEMAS AGREE. Suite 6 reads the edge function's source and
 *    compares its tool names and required arguments against this bundle's.
 *
 * ============================================================================
 * WHAT THIS FILE DOES NOT PROVE
 * ============================================================================
 *
 * That the chat screen renders any of it, that the model chooses sensible
 * tools, or that the edge function deploys. Those are call sites and a network,
 * verified by reading and by running the app.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPlanForGoal, type TrainingShape } from "@/tracking/training";
import {
  applyAdjustments,
  addAdjustments,
  currentAdjustments,
  livePlanAdjustments,
  undoAdjustment,
  type PlanAdjustment,
} from "@/tracking/adjustments";
import type { Goal, TrainingDay, TrainingPlan } from "@/types";
import { COACH_TOOL_NAMES, parseCoachAction, type CoachAction } from "@/coach/tools";
import { SUGGEST_ROUTES } from "@/coach/routeTools";
import { isHarderDay } from "@/coach/planGuard";
import type { DayDowngrade } from "@/coach/downgrade";
import {
  commitProposal,
  guardUndo,
  previewAction,
  type PlanActionContext,
  type PlanProposal,
} from "@/coach/planActions";

const proc = (globalThis as { process?: { exitCode?: number; cwd?: () => string } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* The fixture                                                                 */
/* -------------------------------------------------------------------------- */

/*
 * A fixed objective and a fixed clock, so every plan below is the same plan.
 *
 * TRAINING STARTED SIX MONTHS AGO ON PURPOSE. With a start date a week back,
 * "today" sits in week 2 of every plan — and `blockFor` puts week 2 in Base at
 * load 0.8 for any plan of 8 weeks or more, which is every plan the generator
 * will build. Today would therefore be the SAME DAY however the target date
 * moved, and suite 2e would be testing nothing while appearing to pass. Started
 * in March, today lands in Build 4 of a 52-week plan and pulling the date in
 * pushes it into Peak, which is the case the guard has to catch.
 */
const GOAL: Goal = {
  id: "goal-test",
  name: "Test objective",
  elevationM: 4808,
  targetDate: "2027-06-01",
  trainingStartedAt: "2026-03-02",
  status: "active",
} as Goal;

const NOW = new Date("2026-09-16T09:00:00.000Z");
const TODAY = "2026-09-16";
const SHAPE: TrainingShape = {
  trainingDays: [],
  typicalSessionMin: null,
  trainingBaseline: null,
};

const DOWNGRADED: DayDowngrade = {
  downgraded: true,
  reasons: ["today's readiness is 38 out of 100"],
  shortReason: "where your readiness sits",
};
const FINE: DayDowngrade = { downgraded: false, reasons: [], shortReason: "the last few days" };

const base = buildPlanForGoal(GOAL, undefined, NOW, SHAPE);
const allDays = (p: TrainingPlan) => p.weeks.flatMap((w) => w.days);
const dayOn = (p: TrainingPlan, iso: string) => allDays(p).find((d) => d.date === iso);

function ctxWith(over: Partial<PlanActionContext> = {}): PlanActionContext {
  return {
    today: TODAY,
    now: NOW,
    goal: GOAL,
    mountain: undefined,
    shape: SHAPE,
    adjustments: [],
    completedByDate: new Map(),
    downgrade: FINE,
    ...over,
  };
}

/* The real days the generator produced, found by shape rather than assumed to
   be a particular weekday — the week depends on the athlete's answers, and a
   test that hardcoded Saturday would quietly stop testing anything. */
const TODAY_DAY = dayOn(base, TODAY)!;
const LONG = allDays(base).find((d) => d.focus === "long-mountain" && d.date > TODAY)!;
const ORDINARY = allDays(base).find(
  (d) => d.focus !== "rest" && d.focus !== "long-mountain" && d.date > TODAY,
)!;
const FAR_ORDINARY = allDays(base).find(
  (d) =>
    d.focus !== "rest" &&
    d.focus !== "long-mountain" &&
    Date.parse(d.date) - Date.parse(TODAY) > 20 * 86_400_000,
)!;

const why = "because you said so";
const preview = (action: CoachAction, over: Partial<PlanActionContext> = {}): PlanProposal =>
  previewAction(ctxWith(over), action);

/* -------------------------------------------------------------------------- */

function main() {
  /* ======================================================================== */
  /* SUITE 1 — `isHarderDay`, the primitive the whole refusal rests on         */
  /* ======================================================================== */

  const day = (over: Partial<TrainingDay>): TrainingDay => ({
    date: TODAY,
    focus: "endurance",
    title: "Endurance",
    difficulty: 2,
    completed: false,
    durationMin: 60,
    distanceKm: 10,
    elevationM: 300,
    ...over,
  });

  ok(isHarderDay(day({}), day({ difficulty: 3 })), "a higher difficulty was not read as harder");
  ok(isHarderDay(day({}), day({ durationMin: 61 })), "one more minute was not read as harder");
  ok(isHarderDay(day({}), day({ distanceKm: 10.1 })), "more distance was not read as harder");
  ok(isHarderDay(day({}), day({ elevationM: 301 })), "more ascent was not read as harder");
  ok(
    isHarderDay(day({ focus: "rest", durationMin: undefined }), day({ durationMin: undefined })),
    "rest becoming work was not read as harder",
  );
  ok(
    isHarderDay(
      day({ focus: "endurance" }),
      day({ focus: "long-mountain", durationMin: 60, distanceKm: 10, elevationM: 300 }),
    ),
    "an ordinary session becoming a long mountain day was not read as harder",
  );
  ok(!isHarderDay(day({}), day({ durationMin: 45 })), "a shorter day was read as harder");
  ok(!isHarderDay(day({}), day({ focus: "rest" })), "a rest day was read as harder");
  ok(!isHarderDay(day({}), day({})), "an identical day was read as harder");
  ok(!isHarderDay(day({}), undefined), "a day that no longer exists was read as harder");

  /* ======================================================================== */
  /* SUITE 2 — THE ABSOLUTE REFUSAL, from every direction                      */
  /* ======================================================================== */

  /* 2a. Moving the long mountain day onto a downgraded today. This is the
     vector: nothing in the action vocabulary can make a day harder on its own,
     but an exchange can put harder work on a day that has been eased. */
  const moveLongToToday: CoachAction = {
    tool: "move_session",
    date: LONG.date,
    to: TODAY,
    why,
  };
  const refusedMove = preview(moveLongToToday, { downgrade: DOWNGRADED });
  ok(refusedMove.outcome === "refused", "a long day was allowed onto a downgraded today");
  ok(
    refusedMove.note.includes("38 out of 100"),
    "the refusal did not name the measurement it refused on",
  );
  ok(refusedMove.records.length === 0, "a refused move still produced a record to write");

  /* 2b. THE SAME MOVE, WITH THE DOWNGRADE LIFTED. Without this the suite would
     pass just as well against a guard that refused everything. */
  const allowedMove = preview(moveLongToToday, { downgrade: FINE });
  ok(
    allowedMove.outcome !== "refused",
    "the same move was refused on a day that is not downgraded",
  );

  /* 2c. Changes that make today EASIER are untouched by the guard. */
  for (const action of [
    { tool: "rest_day", date: TODAY, why } as CoachAction,
    { tool: "ease_session", date: TODAY, notches: 2, why } as CoachAction,
    { tool: "shorten_session", date: TODAY, minutes: 20, why } as CoachAction,
  ]) {
    if (TODAY_DAY.focus === "rest") continue;
    const p = preview(action, { downgrade: DOWNGRADED });
    ok(p.outcome !== "refused", `${action.tool} on a downgraded today was refused: ${p.note}`);
  }

  /* 2d. A WEEK RESCHEDULE THAT DOES IT BY ACCIDENT. Nobody asked to make today
     harder; shifting the week simply lands a bigger session on it. The guard
     compares plans, so it catches this without knowing what a reschedule is. */
  const weekOfToday = base.weeks.find((w) => w.days.some((d) => d.date === TODAY))!;
  let caughtByShift = false;
  for (const byDays of [1, 2, 3, -1, -2, -3]) {
    const shift: CoachAction = {
      tool: "reschedule_week",
      weekStartDate: weekOfToday.startDate,
      byDays,
      why,
    };
    const hot = preview(shift, { downgrade: DOWNGRADED });
    const cold = preview(shift, { downgrade: FINE });
    /* A shift refused while downgraded and allowed otherwise is the guard
       working. A shift refused in both is an ordinary refusal (a day outside
       the plan, say) and says nothing either way. */
    if (hot.outcome === "refused" && cold.outcome !== "refused") caughtByShift = true;
    if (cold.outcome !== "refused") {
      const after = applyAdjustments(
        base,
        cold.records.map((r, i) => ({
          ...r,
          id: `x-${String(i).padStart(3, "0")}`,
          at: "2030-01-01T00:00:00.000Z",
        })) as PlanAdjustment[],
      ).plan;
      const harder = isHarderDay(dayOn(base, TODAY), dayOn(after, TODAY));
      ok(
        !(harder && hot.outcome !== "refused"),
        `a ${byDays}-day shift made today harder and was not refused while downgraded`,
      );
    }
  }
  ok(caughtByShift, "no week shift in ±3 days ever made today harder — the vector went untested");

  /* 2e. A TARGET-DATE CHANGE THAT REBUILDS TODAY INTO A HARDER DAY. Pulling the
     date in compresses the plan; today's Base session can become a Peak one.
     The guard never learns what a target date is — it compares the two plans. */
  let caughtByDate = false;
  for (const months of [2, 3, 4, 5, 6, 8]) {
    const pulled = new Date(Date.parse(TODAY) + months * 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const action: CoachAction = { tool: "set_target_date", date: pulled, why };
    const hot = preview(action, { downgrade: DOWNGRADED });
    const cold = preview(action, { downgrade: FINE });
    if (hot.outcome === "refused" && cold.outcome !== "refused") caughtByDate = true;
    if (cold.outcome !== "refused") {
      const rebuilt = buildPlanForGoal(
        { ...GOAL, targetDate: new Date(`${pulled}T06:00:00`).toISOString() },
        undefined,
        NOW,
        SHAPE,
      );
      ok(
        !(isHarderDay(dayOn(base, TODAY), dayOn(rebuilt, TODAY)) && hot.outcome !== "refused"),
        `moving the date to ${pulled} made today harder and was not refused while downgraded`,
      );
    }
  }
  ok(caughtByDate, "no target date in the range tested ever made today harder");

  /* 2f. UNDO. The coach eased today because readiness is 38; the athlete taps
     Undo. It has to be refused, and it has to be allowed the moment the reason
     for the refusal is gone. */
  if (TODAY_DAY.focus !== "rest") {
    const eased: PlanAdjustment = {
      id: "adj-eased-today",
      goalId: GOAL.id,
      date: TODAY,
      change: { kind: "ease", notches: 2 },
      why: "readiness is low",
      at: "2026-09-16T07:00:00.000Z",
      by: "coach",
    };
    const hot = guardUndo(ctxWith({ adjustments: [eased], downgrade: DOWNGRADED }), eased.id);
    const cold = guardUndo(ctxWith({ adjustments: [eased], downgrade: FINE }), eased.id);
    ok(!hot.allowed, "undoing an ease on a downgraded today was allowed");
    ok(hot.reason.includes("38 out of 100"), "the undo refusal did not name the measurement");
    ok(cold.allowed, "undoing an ease was refused on a day that is not downgraded");

    /* An ease on a FUTURE day undoes freely even while today is downgraded —
       readiness is a today number and the guard does not pretend otherwise. */
    const future: PlanAdjustment = { ...eased, id: "adj-eased-later", date: ORDINARY.date };
    ok(
      guardUndo(ctxWith({ adjustments: [future], downgrade: DOWNGRADED }), future.id).allowed,
      "undoing a change on a future day was refused because TODAY is downgraded",
    );
  }

  /* ======================================================================== */
  /* SUITE 3 — THE THRESHOLD, AND THE MEASUREMENT IT CLAIMS TO REST ON         */
  /* ======================================================================== */

  /*
   * THE MEASUREMENT, RE-RUN. `planActions.ts` states that across the
   * generator's output the long mountain day is 49.4%-84.9% of a week's
   * prescribed minutes and every other session is 3.1%-17.3%, and puts the
   * confirmation threshold at 25% in the empty band between them.
   *
   * If a future tuning of `sessionsFor` closes that band, the 25% stops meaning
   * "the long day and nothing else" — silently, because the constant still
   * reads the same. So the bands are measured here rather than remembered.
   */
  const shapes: (TrainingShape | undefined)[] = [
    undefined,
    { trainingDays: [], typicalSessionMin: null, trainingBaseline: null },
    { trainingDays: [1, 3, 5], typicalSessionMin: null, trainingBaseline: "1-2" },
    { trainingDays: [1, 2, 3, 4, 5, 6, 0], typicalSessionMin: 60, trainingBaseline: "5-plus" },
    { trainingDays: [2, 4, 6], typicalSessionMin: 45, trainingBaseline: "none" },
    { trainingDays: [1, 2, 4, 6], typicalSessionMin: 90, trainingBaseline: "3-4" },
  ];
  const peaks: [string, number][] = [
    ["Ben Nevis", 1345],
    ["Toubkal", 4167],
    ["Mont Blanc", 4808],
    ["Aconcagua", 6961],
  ];
  let longMin = 1;
  let ordinaryMax = 0;
  let weeksMeasured = 0;
  for (const [name, elevationM] of peaks) {
    for (const s of shapes) {
      for (const mountain of [undefined, { difficulty: 5 } as never]) {
        const plan = buildPlanForGoal(
          { ...GOAL, name, elevationM, targetDate: "2027-06-01" },
          mountain,
          NOW,
          s,
        );
        for (const w of plan.weeks) {
          const total = w.days.reduce((n, d) => n + (d.durationMin ?? 0), 0);
          if (total <= 0) continue;
          weeksMeasured++;
          for (const d of w.days) {
            if (!d.durationMin) continue;
            const share = d.durationMin / total;
            if (d.focus === "long-mountain") longMin = Math.min(longMin, share);
            else ordinaryMax = Math.max(ordinaryMax, share);
          }
        }
      }
    }
  }
  console.log(
    `  (threshold measured over ${weeksMeasured} generated weeks: ordinary sessions reach ${(ordinaryMax * 100).toFixed(1)}%, the long mountain day never falls below ${(longMin * 100).toFixed(1)}%)`,
  );
  ok(weeksMeasured > 700, `only ${weeksMeasured} weeks measured — the sample shrank`);
  ok(
    ordinaryMax < 0.25,
    `an ordinary session reached ${(ordinaryMax * 100).toFixed(1)}% of a week — it would now need a tap`,
  );
  ok(
    longMin > 0.25,
    `a long mountain day fell to ${(longMin * 100).toFixed(1)}% of a week — it would now apply without one`,
  );
  ok(
    longMin - ordinaryMax > 0.2,
    `the gap the threshold sits in narrowed to ${((longMin - ordinaryMax) * 100).toFixed(1)} points`,
  );

  /* The rule, applied. Clearing an ordinary session is small; clearing the long
     mountain day is not, and the reason says so in minutes. */
  const restOrdinary = preview({ tool: "rest_day", date: ORDINARY.date, why });
  ok(restOrdinary.outcome === "applied", `clearing an ordinary session asked for a tap`);
  const restLong = preview({ tool: "rest_day", date: LONG.date, why });
  ok(restLong.outcome === "confirm", "clearing the long mountain day applied without a tap");
  ok(
    /\d+ of the week's \d+ prescribed minutes/.test(restLong.note),
    `the confirmation did not say what it measured: "${restLong.note}"`,
  );

  /* Multi-day, far-off, and the two that are never small. */
  const shiftWeek = preview({
    tool: "reschedule_week",
    weekStartDate: weekOfToday.startDate,
    byDays: 1,
    why,
  });
  if (shiftWeek.outcome !== "refused") {
    ok(shiftWeek.outcome === "confirm", "a week reschedule applied without a tap");
  }
  ok(
    preview({ tool: "shorten_session", date: FAR_ORDINARY.date, minutes: 30, why }).outcome ===
      "confirm",
    "a change three weeks out applied without a tap",
  );
  ok(
    preview({
      tool: "log_activity",
      date: "2026-09-15",
      activityTypeId: "hiking",
      durationMin: 120,
      ascentM: 600,
      why,
    }).outcome === "confirm",
    "logging an activity applied without a tap",
  );
  ok(
    preview({ tool: "set_target_date", date: "2027-08-01", why }).outcome === "confirm",
    "moving the objective's date applied without a tap",
  );

  /* A move is volume-neutral, so it passes the share test and is small when it
     is near and single. That is the rule working, not a hole in it. */
  const nearRest = allDays(base).find(
    (d) =>
      d.focus === "rest" &&
      d.date > ORDINARY.date &&
      Date.parse(d.date) - Date.parse(TODAY) <= 7 * 86_400_000,
  );
  if (nearRest) {
    const nearMove = preview({
      tool: "swap_sessions",
      date: ORDINARY.date,
      withDate: nearRest.date,
      why,
    });
    if (nearMove.outcome !== "refused") {
      ok(nearMove.outcome === "applied", `a near, single swap asked for a tap: ${nearMove.note}`);
    }
  }

  /* ======================================================================== */
  /* SUITE 3b — THE WEEK SHIFT DOES WHAT ITS COMMENT SAYS                     */
  /* ======================================================================== */

  /*
   * `reschedule_week` makes three claims in `planActions.ts`, and the third is
   * the uncomfortable one that has to be true rather than hoped for:
   *
   *   1. every session that moves is EXACTLY `byDays` later (or earlier);
   *   2. nothing is lost — the prescribed minutes across the touched days are
   *      unchanged;
   *   3. at most ONE session is displaced back into the week from outside it.
   *
   * Proved by applying the records the preview holds and comparing the plan to
   * the baseline, for every shift in range and for a week starting today.
   */
  for (const byDays of [1, 2, 3, -1, -2, -3]) {
    const p = preview({
      tool: "reschedule_week",
      weekStartDate: weekOfToday.startDate,
      byDays,
      why,
    });
    if (p.outcome === "refused") continue;

    const shifted = applyAdjustments(
      base,
      p.records.map((r, i) => ({
        ...r,
        id: `s-${String(i).padStart(3, "0")}`,
        at: "2030-01-01T00:00:00.000Z",
      })) as PlanAdjustment[],
    ).plan;

    /* 1. Every moved session landed exactly `byDays` away, identical in every
          figure — a shift that quietly rescaled a session would be a different
          session with the old title on it. */
    for (const r of p.records) {
      if (r.change.kind !== "move") continue;
      const was = dayOn(base, r.date)!;
      const now = dayOn(shifted, r.change.to)!;
      ok(
        (Date.parse(r.change.to) - Date.parse(r.date)) / 86_400_000 === byDays,
        `a ${byDays}-day shift produced a move of a different length`,
      );
      ok(
        now.title === was.title && now.durationMin === was.durationMin,
        `a ${byDays}-day shift changed the session it moved (${was.title} -> ${now.title})`,
      );
    }

    /* 2. Nothing lost. The union of every day the change touches holds the same
          prescribed minutes before and after. */
    const touchedDates = new Set<string>();
    for (const r of p.records) {
      touchedDates.add(r.date);
      if (r.change.kind === "move") touchedDates.add(r.change.to);
    }
    const sum = (plan: TrainingPlan) =>
      [...touchedDates].reduce((n, d) => n + (dayOn(plan, d)?.durationMin ?? 0), 0);
    ok(
      sum(base) === sum(shifted),
      `a ${byDays}-day shift changed the touched days' total from ${sum(base)} to ${sum(shifted)}`,
    );

    /*
     * 3. EVERY DAY THAT GAINS WORK IS NAMED IN THE NOTE.
     *
     * A shift hands each day the session that was on the day before it, so days
     * gaining work is ordinary rather than exceptional — a recovery walk
     * becoming the long mountain day is what "push the week back" means. What
     * is NOT acceptable is the athlete finding that out afterwards. ICEFALL has
     * a readiness figure for today only, so for every other day it names them
     * and says it is not judging them.
     */
    const gained = [...touchedDates].filter(
      (d) => d !== TODAY && isHarderDay(dayOn(base, d), dayOn(shifted, d)),
    );
    for (const d of gained) {
      ok(
        p.days.some((row) => row.date === d && row.harder),
        `a ${byDays}-day shift put work onto ${d} and the before/after did not flag it`,
      );
    }
    if (gained.length > 0) {
      ok(
        p.note.includes("puts more work on"),
        `a ${byDays}-day shift added work and the note did not say so: "${p.note}"`,
      );
      ok(
        p.note.includes("only measures readiness for today"),
        `a ${byDays}-day shift added work to a future day without saying ICEFALL cannot judge it`,
      );
    }
  }

  /* ======================================================================== */
  /* SUITE 4 — THE CLOSED VOCABULARY                                          */
  /* ======================================================================== */

  const good = parseCoachAction("shorten_session", {
    date: "2026-09-20",
    minutes: 45,
    why: "you have 45 minutes",
  });
  ok(good !== null && good.tool === "shorten_session", "a valid tool call was refused");

  const bad: [string, unknown, string][] = [
    ["shorten_session", { date: "next Tuesday", minutes: 45, why: "x" }, "a weekday name"],
    [
      "shorten_session",
      { date: "2026-02-31", minutes: 45, why: "x" },
      "a date that does not exist",
    ],
    ["shorten_session", { date: "2026-09-20", minutes: "45", why: "x" }, "a number as a string"],
    ["shorten_session", { date: "2026-09-20", minutes: 5, why: "x" }, "below the 15 min floor"],
    ["shorten_session", { date: "2026-09-20", minutes: 45 }, "no reason given"],
    ["ease_session", { date: "2026-09-20", notches: 3, why: "x" }, "three notches"],
    ["ease_session", { date: "2026-09-20", notches: 0, why: "x" }, "zero notches"],
    ["reschedule_week", { weekStartDate: "2026-09-14", byDays: 0, why: "x" }, "a shift of zero"],
    ["reschedule_week", { weekStartDate: "2026-09-14", byDays: 9, why: "x" }, "a nine-day shift"],
    [
      "lengthen_session",
      { date: "2026-09-20", minutes: 200, why: "x" },
      "a tool that does not exist",
    ],
    ["move_session", { date: "2026-09-20", why: "x" }, "a move with no destination"],
    [
      "log_activity",
      { date: "2026-09-20", activityTypeId: "hiking", why: "x" },
      "a log with no duration",
    ],
    ["rest_day", "2026-09-20", "a string where an object belongs"],
  ];
  for (const [tool, input, label] of bad) {
    ok(parseCoachAction(tool, input) === null, `${label} was accepted`);
  }

  /* The reason is cleaned rather than trusted: the house rules allow the model
     one piece of formatting and this string is not rendered through the
     component that understands it. */
  const formatted = parseCoachAction("rest_day", {
    date: "2026-09-20",
    why: "**take the day**\n\nyou are cooked",
  });
  ok(
    formatted?.why === "take the day you are cooked",
    `the reason was not flattened: "${formatted?.why}"`,
  );

  /* There is no way to express a prescription. Checked structurally rather than
     by eye, because this is the property the whole phase rests on. */
  const smuggled = parseCoachAction("shorten_session", {
    date: "2026-09-20",
    minutes: 45,
    why: "x",
    title: "6 x 4 min hill repeats",
    distanceKm: 14,
    elevationM: 900,
  });
  ok(
    smuggled !== null && !("title" in smuggled) && !("elevationM" in smuggled),
    "a prescription survived parsing",
  );

  /* ======================================================================== */
  /* SUITE 5 — PREVIEW IS THE COMMIT                                          */
  /* ======================================================================== */

  const a = preview({ tool: "ease_session", date: ORDINARY.date, notches: 1, why });
  const b = preview({ tool: "ease_session", date: ORDINARY.date, notches: 1, why });
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    "the same preview twice produced two different plans",
  );

  /* The rows the athlete reads come out of the engine, so applying the records
     the preview holds must reproduce the "after" side of those rows exactly. */
  const applied = applyAdjustments(
    base,
    a.records.map((r, i) => ({
      ...r,
      id: `p-${i}`,
      at: "2030-01-01T00:00:00.000Z",
    })) as PlanAdjustment[],
  ).plan;
  for (const d of a.days) {
    const after = dayOn(applied, d.date);
    ok(
      after !== undefined && d.after.startsWith(after.title),
      `the before/after row for ${d.date} does not match the plan the records produce`,
    );
  }

  /* Ordinary refusals, which are not the safety guard and must not be confused
     with it — they are about what the plan can express, not about the athlete. */
  ok(
    preview({ tool: "rest_day", date: "2026-09-10", why }).outcome === "refused",
    "a day in the past was accepted",
  );
  ok(
    preview({ tool: "rest_day", date: "2035-01-01", why }).outcome === "refused",
    "a day outside the plan was accepted",
  );
  ok(
    preview(
      { tool: "rest_day", date: ORDINARY.date, why },
      { completedByDate: new Map([[ORDINARY.date, true]]) },
    ).outcome === "refused",
    "a day the athlete had already trained was rewritten",
  );
  ok(
    preview({ tool: "rest_day", date: ORDINARY.date, why }, { goal: undefined }).outcome ===
      "refused",
    "a plan change was accepted with no objective",
  );
  ok(
    preview({
      tool: "log_activity",
      date: "2026-09-15",
      activityTypeId: "teleportation",
      durationMin: 60,
      why,
    }).outcome === "refused",
    "an activity type ICEFALL does not have was logged",
  );

  /* A logged activity shows the figures that would be STORED, and says whose
     they are. Rule 5: self-reported stays labelled. */
  const logged = preview({
    tool: "log_activity",
    date: "2026-09-15",
    activityTypeId: "hiking",
    durationMin: 135,
    distanceKm: 14.2,
    ascentM: 820,
    why,
  });
  ok(logged.days[0]?.after.includes("135 min"), "the logged duration was not shown back");
  ok(logged.days[0]?.after.includes("820 m up"), "the logged ascent was not shown back");
  ok(
    logged.days[0]?.after.includes("reported, not recorded"),
    "a self-reported activity was not labelled as one",
  );

  /* ======================================================================== */
  /* SUITE 6 — THE TWO SCHEMAS AGREE                                          */
  /* ======================================================================== */

  /*
   * The edge function declares these tools to the API by hand, because a Deno
   * deploy cannot import from this bundle. Drift can only ever cause a refusal
   * on the phone — never a wrong change — but a refusal the athlete meets in
   * the middle of a conversation is still a bug, so it is caught here.
   *
   * The path is the standard sibling checkout. If it is not there the suite
   * SAYS SO and does not fail: the app is checked out on its own often enough
   * that a hard failure would train people to ignore this file.
   */
  /* PATHS FROM THE WORKING DIRECTORY, NOT FROM `import.meta.url`. This file is
     esbuild-bundled into `node_modules/.icefall-tests/` before node sees it, so
     the module's own URL points at the bundle and every relative path from it
     lands three directories from where the source lives. `npm run` sets the cwd
     to the package root, which is stable and is what the other suites' aliases
     already assume. */
  const root = proc?.cwd?.() ?? ".";
  const read = (rel: string): string => {
    try {
      return readFileSync(join(root, rel), "utf8");
    } catch {
      console.log(`\n  (skipped: no file at ${join(root, rel)})`);
      return "";
    }
  };

  const src = read("../icefall-supabase/supabase/functions/coach/index.ts");
  if (src) {
    /*
     * THE APP'S SIDE IS TWO FILES AND THE SERVER'S IS ONE LIST.
     *
     * `COACH_TOOL_NAMES` covers the eight tools that CHANGE THE PLAN, which are
     * the ones `planActions.ts` applies. `suggest_routes` is the ninth and it
     * changes nothing — it draws trail and trek cards — so it is parsed by
     * `coach/routeTools.ts` and is deliberately not a member of `CoachAction`.
     * The union of the two is what the server must declare, exactly: a tool on
     * the server that neither parser knows would be refused mid-conversation.
     */
    const known = [...COACH_TOOL_NAMES, SUGGEST_ROUTES] as readonly string[];
    const declared = [...src.matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map((m) => m[1]);
    ok(
      declared.length === known.length,
      `the server declares ${declared.length} tools, the app knows ${known.length}`,
    );
    for (const name of known) {
      ok(declared.includes(name), `the server does not declare "${name}"`);
    }
    for (const name of declared) {
      ok(known.includes(name), `the server declares "${name}", which this app would refuse`);
    }

    /*
     * EVERY PLAN TOOL MUST REQUIRE A REASON. A change with nobody's words on
     * why is a change the history screen cannot explain.
     *
     * `suggest_routes` is exempt and is checked separately below, because it is
     * not a change: its reason lives on each route rather than on the call, and
     * `parseRouteSuggestion` deliberately accepts a pick without one — losing a
     * real route because the sentence beside it was blank is the worse trade.
     */
    const toolBlocks = src.split(/^\s{4}name: "/m).slice(1);
    ok(toolBlocks.length === known.length, "a declared tool could not be read back");
    for (const block of toolBlocks) {
      const name = block.slice(0, block.indexOf('"'));
      const requires = [...block.matchAll(/required: \[([^\]]*)\]/g)].map((m) => m[1]);
      ok(requires.length > 0, `${name} is declared with no \`required\` list`);
      if (name === SUGGEST_ROUTES) {
        ok(
          requires.some((r) => r.includes('"routes"')),
          "suggest_routes does not require any routes",
        );
        ok(
          requires.some((r) => r.includes('"id"') && r.includes('"reason"')),
          "suggest_routes does not require an id and a reason per route",
        );
        /* THE SCHEMA MUST NOT BE ABLE TO CARRY A ROUTE. If a name, a length or
           an ascent could be passed, the model could write a trail rather than
           point at one — which is the whole thing this tool exists to prevent,
           and it would be undetectable from the card. */
        for (const forbidden of ["name", "lengthKm", "distanceKm", "ascentM", "lat", "lon"]) {
          ok(
            !new RegExp(`\\b${forbidden}: \\{`).test(block),
            `suggest_routes declares a "${forbidden}" field — the model could supply route content`,
          );
        }
        continue;
      }
      ok(
        requires.every((r) => r.includes('"why"')),
        `${name} is declared without requiring a reason`,
      );
    }
  }

  /* ======================================================================== */
  /* SUITE 7 — THE SYMPTOM LAYER IS STILL AHEAD OF THE TOOL PATH              */
  /* ======================================================================== */

  /*
   * ROADMAP RULE 3: safety never depends on the model, and nothing may be added
   * that goes round it — INCLUDING A TOOL PATH.
   *
   * This is a structural check rather than a behavioural one, and deliberately:
   * the behaviour of `checkSafety` is proved by `coach/safety.test.ts` against
   * its own red-team corpus, and what this phase can break is not the gate but
   * its POSITION. A tool call is produced inside `askCoach`'s endpoint branch
   * and acted on in `CoachChat.send`; both of those sit below a `checkSafety`
   * that returns. Move either call and this fails.
   *
   * `safety.ts` having no imports is checked for the same reason it was written
   * that way: a module with no imports cannot reach `fetch`, Supabase or React,
   * so it answers identically offline, signed out, out of budget and on a demo
   * build. An import appearing there is the first step to a safety layer with a
   * network dependency.
   */
  const safetySrc = read("src/coach/safety.ts");
  if (safetySrc) {
    ok(
      !/^\s*import[\s{]/m.test(safetySrc),
      "coach/safety.ts has gained an import — it can now reach something that can fail",
    );
  }

  const chat = read("src/screens/CoachChat.tsx");
  if (chat) {
    const gate = chat.indexOf("const safety = checkSafety(q)");
    ok(gate > -1, "CoachChat.send no longer calls checkSafety");
    ok(
      gate > -1 && gate < chat.indexOf("await askCoach("),
      "the symptom gate no longer runs before the model is asked",
    );
    ok(
      gate > -1 && gate < chat.indexOf("preview(action)"),
      "the symptom gate no longer runs before a tool call is acted on",
    );
    /* The CALL, with its semicolon — the name also appears in the comment
       above the gate explaining why the gate has to come first, and matching
       that would compare the gate against its own justification. */
    ok(
      gate > -1 && gate < chat.indexOf("recordCoachInteraction();"),
      "the symptom gate no longer runs before a free conversation is spent",
    );
  }

  const service = read("src/services/coach.ts");
  if (service) {
    const gate = service.indexOf("const safety = checkSafety(question)");
    ok(gate > -1, "askCoach no longer calls checkSafety");
    ok(
      gate > -1 && gate < service.indexOf("await fetch(ENDPOINT"),
      "the symptom gate no longer runs before the endpoint is called",
    );
    ok(
      gate > -1 && gate < service.indexOf("parseCoachAction("),
      "the symptom gate no longer runs before a tool call is parsed",
    );
  }

  if (src) {
    /* Defence in depth, and explicitly not the defence: the app's gate means a
       symptom question never reaches this function at all. The line is worth
       its tokens for a modified client. */
    ok(
      /do not call any tool/i.test(src),
      "the server's tool rules no longer tell the model to call no tool on a symptom report",
    );
  }

  /* ======================================================================== */
  /* SUITE 8 — THE COMMIT IS A GATE, NOT A POSTBOX                            */
  /* ======================================================================== */

  /*
   * WHY THIS SUITE EXISTS, IN THE WORDS OF THE PROOF THAT FOUND THE HOLE.
   *
   * `commitProposal` used to read `proposal.outcome` and, if it did not say
   * "refused", do as it was told. The guard runs inside `previewAction`, so a
   * `PlanProposal` object built by hand with `outcome: "confirm"` walked
   * straight past it and wrote a record onto a day the app had already said to
   * take easy.
   *
   * No model could do that — a model emits a `CoachAction`, and both chat call
   * sites turn one into a proposal through `previewAction` first. The exposure
   * was future CODE: any caller that constructs a proposal some other way. A
   * rule that holds only while everyone uses one particular door is not a rule,
   * so `commitProposal` now re-runs the engine from `proposal.action` and
   * refuses on the FRESH verdict.
   *
   * These cases are the forged proposal, the smuggled records, the stale
   * preview, and — the one that stops this from being a blanket freeze — the
   * identical forged object on a day with nothing wrong with it.
   *
   * The store is real. Every record written here is undone again, and the live
   * count is asserted back to where it started.
   */
  {
    const sinks = { setGoalTargetDate: () => true };
    const live = () => livePlanAdjustments(currentAdjustments(), GOAL.id).length;
    const undoFrom = (n: number) => {
      for (const r of livePlanAdjustments(currentAdjustments(), GOAL.id).slice(n))
        undoAdjustment(r.id);
    };
    const start = live();

    /* 8a. THE FORGED PROPOSAL. Never passed through `previewAction`; the
       records are the ones the engine would have built, so only the guard can
       tell the difference. */
    const forged: PlanProposal = {
      action: moveLongToToday,
      why,
      summary: "Moved the long day to today",
      outcome: "confirm",
      note: "",
      days: [],
      records: [
        { goalId: GOAL.id, date: LONG.date, change: { kind: "move", to: TODAY }, why, by: "coach" },
      ],
    };
    const forgedResult = commitProposal(ctxWith({ downgrade: DOWNGRADED }), forged, sinks);
    ok(!forgedResult.ok, "a hand-built proposal walked past the guard at commit");
    ok(live() === start, "a hand-built proposal wrote a record onto a downgraded day");
    ok(
      forgedResult.problem.includes("38 out of 100"),
      "the commit refusal did not carry the guard's own re-derived reason",
    );

    /* 8b. THE CONTROL. The identical object, on a day nothing is wrong with. A
       suite without this would pass against a commit that refused everything. */
    const allowed = commitProposal(ctxWith({ downgrade: FINE }), forged, sinks);
    ok(allowed.ok, "the same proposal was refused on a day that is not downgraded");
    ok(live() === start + 1, "the allowed commit did not write exactly one record");
    undoFrom(start);
    ok(live() === start, "the test did not clean up after itself");

    /* 8c. SMUGGLED RECORDS ON AN INNOCENT ACTION. The action is a small ease
       that the guard has no reason to stop; the `records` array says something
       else entirely. The engine's own records are what may be written, so the
       mismatch is refused rather than silently corrected — the athlete agreed
       to a specific before and after. */
    const innocent: CoachAction = { tool: "ease_session", date: TODAY, notches: 1, why };
    const honest = preview(innocent);
    if (honest.outcome !== "refused") {
      const smuggled: PlanProposal = {
        ...honest,
        records: [
          {
            goalId: GOAL.id,
            date: LONG.date,
            change: { kind: "move", to: TODAY },
            why,
            by: "coach",
          },
        ],
      };
      const smuggledResult = commitProposal(ctxWith(), smuggled, sinks);
      ok(!smuggledResult.ok, "records that do not match the engine were committed");
      ok(live() === start, "a smuggled record reached the store");

      /* 8d. AND THE HONEST ONE STILL GOES THROUGH, or the gate has simply
         broken the feature. */
      const honestResult = commitProposal(ctxWith(), honest, sinks);
      ok(honestResult.ok, "an honest proposal no longer commits");
      ok(live() === start + 1, "an honest commit did not write its record");
      undoFrom(start);
    }

    /* 8e. THE STALE PREVIEW. A genuine proposal, read while readiness was fine
       and tapped after a poor check-in. The guard answers about the tap. */
    const readWhileFine = preview(moveLongToToday, { downgrade: FINE });
    if (readWhileFine.outcome !== "refused") {
      const tappedWhileDown = commitProposal(
        ctxWith({ downgrade: DOWNGRADED }),
        readWhileFine,
        sinks,
      );
      ok(!tappedWhileDown.ok, "a proposal read on a good day committed after a bad check-in");
      ok(live() === start, "a stale proposal wrote a record");
    }

    /* 8f. A REFUSED PROPOSAL IS STILL REFUSED ON ITS OWN WORD. A caller saying
       no is always taken at it — this is the check that was already here, and
       it has to survive the new one. */
    const refusedAtCommit = commitProposal(ctxWith({ downgrade: DOWNGRADED }), refusedMove, sinks);
    ok(!refusedAtCommit.ok, "a refused proposal was committed");
    ok(live() === start, "a refused proposal wrote a record");
  }

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
