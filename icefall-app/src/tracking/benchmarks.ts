import { useEffect, useState } from "react";

import type { RecordedActivity } from "@/tracking/types";

/**
 * BENCHMARK TESTS — the thing that turns "I feel fitter" into a measurement.
 *
 * ============================================================================
 * NAMING, BECAUSE THERE ARE NOW TWO "BENCHMARKS" IN THIS CODEBASE
 * ============================================================================
 *
 * `screens/mountain/Benchmark.tsx` is a DIFFERENT THING and this module has
 * nothing to do with it. That screen compares an athlete against what a
 * mountain asks — `assessObjectiveReadiness` beside `demandProfile` — and its
 * "benchmark" is a training reference figure per elevation band.
 *
 * THIS module is the roadmap's Phase 3 item: "Benchmark tests every 4–6 weeks.
 * For example, a timed loaded ascent with a set height and pack weight. This
 * turns fitness from self-reported into measured." It is a repeatable physical
 * test the athlete performs, and a record of how they did it.
 *
 * The two are deliberately not wired together. See THE DECISION NOT MADE below.
 *
 * ============================================================================
 * THE ONE PROPERTY THAT MAKES THIS HONEST: A TEST HAS NO PASS MARK
 * ============================================================================
 *
 * Every number in `BENCHMARK_TESTS` defines the MEASUREMENT — how far up, how
 * heavy — and not one of them is a standard anybody has to reach. There is no
 * target time, no grade, no "good for your age", and no line at which a result
 * means you are ready for anything.
 *
 * That is not modesty, it is the only defensible position. A pass mark for a
 * loaded ascent is a mountaineering judgement, it would have to differ by body
 * mass, altitude, terrain surface and gradient, and nobody on the build side of
 * ICEFALL is qualified to set one — the same argument `mountainRequirements.ts`
 * makes about requirement figures, and the same answer: ship the shape, refuse
 * the number.
 *
 * SO WHAT IS A RESULT COMPARED AGAINST? THE SAME ATHLETE'S LAST RESULT ON THE
 * SAME TEST. Nothing else. That comparison needs no external standard to be
 * meaningful, and it is exactly what the roadmap asked for.
 *
 * ============================================================================
 * WHY A FIXED PACK WEIGHT, AND WHAT THAT COSTS
 * ============================================================================
 *
 * A fixed absolute pack (10, 12, 15 kg) rather than a share of body mass. That
 * makes the test repeatable for one person with a bathroom scale and a rucksack
 * — which is the whole point — and it makes it MEANINGLESS BETWEEN PEOPLE: 15
 * kg is 27% of body mass for a 55 kg athlete and 16% for a 95 kg one. Nothing
 * in this module, and nothing on any screen reading it, may rank two athletes
 * or place one against a population. `BenchmarkTest.limits` says so in the
 * athlete's own words and the screen prints it.
 *
 * ============================================================================
 * PROVENANCE IS SPLIT, BECAUSE THE TRUTH IS SPLIT — RULE 5
 * ============================================================================
 *
 * A result has THREE figures and they do not share a provenance:
 *
 *   elapsed time   measured, if it came off a recorded activity; typed if not
 *   ascent         measured, if it came off a recorded activity; typed if not
 *   pack weight    ALWAYS self-reported. ALWAYS. Nothing ICEFALL records says
 *                  what anyone was carrying — `Benchmark.tsx` already tells the
 *                  athlete exactly that about the pack-endurance demand, and a
 *                  number typed into this form does not change it.
 *
 * `BenchmarkResult.provenance` therefore covers elapsed and ascent only, and
 * `PACK_WEIGHT_NOTICE` is rendered wherever a pack figure appears. A result
 * that quietly presented all three as "measured" would be the exact fabrication
 * rule 5 exists to prevent.
 *
 * ============================================================================
 * THE DECISION NOT MADE: BENCHMARKS DO NOT FEED READINESS
 * ============================================================================
 *
 * Nothing here is read by `mountainReadiness`, `compare.ts` or `demandProfile`,
 * and that is on purpose. The roadmap's own "Decisions to make" list ends with:
 * "Whether benchmark tests are required before readiness counts as 'verified'."
 * That decision belongs to Charlie and Chris and it has not been made. Wiring a
 * benchmark into the readiness score would make it for them, silently, in code.
 *
 * When it is made, this is the seam: `latestResult` and `compareResults` are
 * pure, take their inputs, and return everything a caller would need.
 */

/* -------------------------------------------------------------------------- */
/* The tests                                                                  */
/* -------------------------------------------------------------------------- */

export const BENCHMARK_TEST_IDS = ["hill-400-10", "alpine-800-12", "expedition-1200-15"] as const;

export type BenchmarkTestId = (typeof BENCHMARK_TEST_IDS)[number];

export interface BenchmarkTest {
  id: BenchmarkTestId;
  name: string;
  /**
   * The prescribed ascent and pack. CHANGING EITHER MAKES IT A DIFFERENT TEST
   * and a different id — a result recorded against "800 m with 12 kg" can never
   * be compared with one recorded against "800 m with 15 kg", and
   * `compareResults` refuses rather than adjusting for the difference.
   */
  ascentM: number;
  packKg: number;
  /** What the athlete actually does, in order. The app's words, not a model's. */
  protocol: string[];
  /** Why this test measures anything worth measuring. */
  why: string;
  /** What a result is NOT evidence of. Printed beside every figure. */
  limits: string;
}

/**
 * Three tests, spanning the ground ICEFALL's athletes actually train on.
 *
 * They differ only in how much ascent and how heavy a pack, because those are
 * the two variables a person can control and repeat. There is no "elite" tier
 * and no progression between them: an athlete who moves from the 400 to the
 * 800 has not improved, they have started a different test, and their history
 * on the first one does not carry over. `compareResults` enforces that.
 */
export const BENCHMARK_TESTS: readonly BenchmarkTest[] = [
  {
    id: "hill-400-10",
    name: "400 m loaded ascent",
    ascentM: 400,
    packKg: 10,
    protocol: [
      "Find a hill or trail you can climb 400 m on without stopping for anything but breath. Use the same one every time.",
      "Load a pack to 10 kg on a scale. Water counts; it also gets lighter as you drink, so fill it at the bottom and leave it.",
      "Start your watch at the bottom and stop it at the top. Pauses count — this is elapsed time, not moving time.",
      "Go at the hardest pace you could hold for the whole climb. Not a sprint, not a stroll.",
      "Write down the time, the ascent your watch recorded, and the pack weight.",
    ],
    why: "Four hundred metres under load is long enough that pacing and aerobic fitness decide the time, and short enough to repeat on a weekday evening without wrecking the week's training.",
    limits:
      "This measures you against yourself on one hill. A 10 kg pack is a very different load for a 55 kg athlete than for a 95 kg one, so this time cannot be compared with anybody else's, and ICEFALL never will.",
  },
  {
    id: "alpine-800-12",
    name: "800 m loaded ascent",
    ascentM: 800,
    packKg: 12,
    protocol: [
      "Find a climb of 800 m you can do in one push. Use the same one every time — a different hill is a different test.",
      "Load a pack to 12 kg on a scale, and fill the water at the start rather than topping it up on the way.",
      "Start your watch at the bottom and stop it at the top. Elapsed time, including any stops.",
      "Hold the hardest pace you can sustain to the top. If you have to stop twice in the last hundred metres you went off too fast; note that, and keep the result anyway.",
      "Write down the time, the ascent your watch recorded, and the pack weight.",
    ],
    why: "Eight hundred metres in one push is the length at which fuelling, pacing and heat start to decide the outcome rather than raw fitness alone — the same things that decide a long day in the mountains.",
    limits:
      "This measures you against yourself on one climb, in whatever conditions you found on the day. It is not a grade, not a qualification, and not comparable with another athlete's time.",
  },
  {
    id: "expedition-1200-15",
    name: "1,200 m loaded ascent",
    ascentM: 1200,
    packKg: 15,
    protocol: [
      "Find a climb of 1,200 m in one push. The same one every time.",
      "Load a pack to 15 kg on a scale. Carry it up; you do not have to carry it down.",
      "Start your watch at the bottom and stop it at the top. Elapsed time.",
      "Pace it to finish rather than to start fast. Eat and drink as you would on a mountain day, and note what you took.",
      "Write down the time, the ascent your watch recorded, and the pack weight.",
    ],
    why: "This is close to a real mountain day in both height and load, which means the result reflects how you fuel and pace as much as how fit you are. That is the point — those are the parts that fail first on a long day.",
    limits:
      "A time here says nothing about altitude, technical ground, weather, or how you would be on day six of a trip. It measures one loaded climb, at low altitude, on a good day, against your own last one.",
  },
];

export function benchmarkTest(id: BenchmarkTestId | string): BenchmarkTest | undefined {
  return BENCHMARK_TESTS.find((t) => t.id === id);
}

/** Printed wherever a pack weight appears. See the header — this is rule 5. */
export const PACK_WEIGHT_NOTICE =
  "Pack weight is always something you tell ICEFALL. Nothing the app records measures what you were carrying, so this figure is your own and stays labelled that way.";

/** Printed above the test list, so nobody reads a prescription as a standard. */
export const NO_PASS_MARK_NOTICE =
  "There is no time to beat here. ICEFALL sets no target, no grade and no pass mark for these tests — the only comparison it will ever draw is between your result and your own last one on the same test.";

/* -------------------------------------------------------------------------- */
/* Which test to do                                                           */
/* -------------------------------------------------------------------------- */

export type TestSuggestion =
  | { suggested: BenchmarkTest; because: string }
  | { suggested: null; because: string };

/**
 * Which test to start with, from the athlete's OWN recorded history.
 *
 * The rule is one line and it is deliberately conservative: the largest test
 * whose prescribed ascent the athlete has already climbed in a single recorded
 * day. Nothing about the objective enters this — suggesting a 1,200 m loaded
 * test because somebody typed "Everest" into a goal field would be the app
 * prescribing a hard session off an aspiration, which is how people get hurt.
 *
 * NULL WHEN THERE IS NOTHING RECORDED, with a reason, rather than defaulting to
 * the smallest. A returning alpinist who installed the app last week has an
 * empty feed and is not a beginner, and the app does not get to decide which.
 */
export function suggestTest(biggestRecordedDayAscentM: number | null): TestSuggestion {
  if (biggestRecordedDayAscentM === null || !Number.isFinite(biggestRecordedDayAscentM)) {
    return {
      suggested: null,
      because:
        "ICEFALL has no recorded day to go on yet, so it will not pick one of these for you. Choose the one you know you can finish in a single push — then keep repeating that one.",
    };
  }

  const fits = BENCHMARK_TESTS.filter((t) => t.ascentM <= biggestRecordedDayAscentM);
  const largest = fits[fits.length - 1];

  if (!largest) {
    return {
      suggested: null,
      because: `Your biggest recorded day climbed ${Math.round(biggestRecordedDayAscentM)} m, which is under the smallest of these tests. Build the day first — a benchmark you cannot finish measures nothing.`,
    };
  }

  return {
    suggested: largest,
    because: `Your biggest recorded day climbed ${Math.round(biggestRecordedDayAscentM)} m, so this is the largest of the three you have already done the height of. Pick a different one if you would rather; the only thing that matters is repeating the same one.`,
  };
}

/* -------------------------------------------------------------------------- */
/* A result                                                                   */
/* -------------------------------------------------------------------------- */

export interface BenchmarkResult {
  id: string;
  testId: BenchmarkTestId;
  /** Local calendar date of the attempt, YYYY-MM-DD. Never a UTC slice. */
  date: string;
  /** Elapsed time for the ascent, whole minutes. Includes stops — see the protocol. */
  elapsedMin: number;
  /**
   * The ascent ACTUALLY climbed, which is rarely the prescription exactly.
   * Stored as it happened; `compareResults` uses it to normalise, and refuses
   * outright once two attempts drift further apart than `ASCENT_TOLERANCE_PCT`.
   */
  ascentM: number;
  /** Pack weight. ALWAYS self-reported, whatever `provenance` says. */
  packKg: number;
  /**
   * Where `elapsedMin` and `ascentM` came from — and ONLY those two.
   * "recorded" is reachable only through `resultFromActivity`.
   */
  provenance: "recorded" | "self-reported";
  /** The recorded activity this was read off, when it was one. */
  activityId?: string;
  /** The athlete's own 1–10. Their word, kept as their word. */
  effort?: number;
  /** Anything they want to remember about the day. Free text, capped. */
  note?: string;
  /** When the record was made, ISO instant. */
  at: string;
}

export const MAX_NOTE_CHARS = 240;
/** Above this a "pack" is a different activity, and almost always a typo. */
export const MAX_PACK_KG = 40;
/** A whole day's elapsed time. Beyond it the figure is a mistake, not a result. */
export const MAX_ELAPSED_MIN = 24 * 60;

export interface NewBenchmarkResult {
  testId: BenchmarkTestId;
  date: string;
  elapsedMin: number;
  ascentM: number;
  packKg: number;
  provenance: "recorded" | "self-reported";
  activityId?: string;
  effort?: number;
  note?: string;
}

/**
 * Local date components, never `toISOString()`.
 *
 * The same trap `benchmarkHistory.todayKey` and the training week strip have
 * both been bitten by: a UTC key rolls the day over early for anyone west of
 * Greenwich, so an evening attempt would be filed under tomorrow.
 */
export function localDateKey(d: Date = new Date()): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Build a result from a recorded activity — the only path to "recorded".
 *
 * ELAPSED, NOT MOVING TIME. `durationSec` rather than `movingSec`, because the
 * protocol says the watch runs through the stops, and because moving time is
 * itself a derived figure that different devices compute differently. Two
 * results are only comparable if they were timed the same way, and elapsed is
 * the one a person can reproduce with any watch.
 *
 * The pack is asked for separately and stays self-reported. There is no way to
 * read it off an activity, and this function will not guess it.
 */
export function resultFromActivity(args: {
  activity: RecordedActivity;
  testId: BenchmarkTestId;
  packKg: number;
  effort?: number;
  note?: string;
}): NewBenchmarkResult | null {
  const { activity } = args;
  if (!Number.isFinite(activity.durationSec) || activity.durationSec <= 0) return null;
  if (!Number.isFinite(activity.elevationGainM) || activity.elevationGainM <= 0) return null;

  const draft: NewBenchmarkResult = {
    testId: args.testId,
    date: localDateKey(new Date(activity.startedAt)),
    elapsedMin: Math.round(activity.durationSec / 60),
    ascentM: Math.round(activity.elevationGainM),
    packKg: args.packKg,
    provenance: "recorded",
    activityId: activity.id,
  };
  if (args.effort !== undefined) draft.effort = args.effort;
  if (args.note !== undefined) draft.note = args.note;
  return draft;
}

/** Vertical metres per hour. The figure two attempts are actually compared on. */
export function verticalRate(result: BenchmarkResult): number {
  return result.ascentM / (result.elapsedMin / 60);
}

/* -------------------------------------------------------------------------- */
/* Scheduling                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The roadmap says every 4–6 weeks, so: due at 28 days, overdue past 42.
 *
 * The window is not pedantry. Sooner than four weeks and the difference between
 * two results is mostly how recovered you were on each day rather than any
 * change in fitness — `compareResults` refuses below `MIN_COMPARABLE_DAYS` for
 * exactly that reason. Later than six weeks and a block of training has gone by
 * unmeasured, which is the thing this feature exists to stop.
 */
export const BENCHMARK_DUE_DAYS = 28;
export const BENCHMARK_OVERDUE_DAYS = 42;

/**
 * Two attempts closer together than this are not a trend.
 *
 * Set below `BENCHMARK_DUE_DAYS` on purpose: an athlete who tests at 25 days
 * because that is the weekend the weather was good should still get a
 * comparison. One who retests four days later after a bad result should not,
 * and gets told why rather than being shown a 6% "improvement" that is a
 * night's sleep.
 */
export const MIN_COMPARABLE_DAYS = 21;

export type BenchmarkDueState = "never-taken" | "current" | "due" | "overdue";

export interface BenchmarkSchedule {
  state: BenchmarkDueState;
  /** The date of the most recent attempt at this test, when there is one. */
  lastOn: string | null;
  /** Days since that attempt. Null when there has never been one. */
  daysSince: number | null;
  /** The day this test comes due. Null when there has never been an attempt. */
  dueOn: string | null;
  /** The sentence the screen prints. True in every state. */
  note: string;
}

/**
 * Whole days between two calendar dates.
 *
 * UTC midnights on both sides, so a clock change in between cannot make a day
 * 23 or 25 hours long and shift the count. The INPUTS are local calendar keys —
 * see `localDateKey` — which is what makes that safe: no instant is involved.
 */
export function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/**
 * Where one test stands for this athlete, today.
 *
 * Scoped to a single test id because that is the only scope in which "due"
 * means anything: an athlete who did the 800 last month is not overdue on the
 * 400 they have never done, and a schedule pooled across tests would say so.
 */
export function benchmarkSchedule(
  results: readonly BenchmarkResult[],
  testId: BenchmarkTestId,
  now: Date = new Date(),
): BenchmarkSchedule {
  const name = benchmarkTest(testId)?.name ?? "this test";
  const mine = results.filter((r) => r.testId === testId);

  if (mine.length === 0) {
    return {
      state: "never-taken",
      lastOn: null,
      daysSince: null,
      dueOn: null,
      note: `You have not done the ${name} yet. The first result is not a score — it is the line everything after it is measured from.`,
    };
  }

  const last = [...mine].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const daysSince = daysBetween(last.date, localDateKey(now));
  const dueOn = addDays(last.date, BENCHMARK_DUE_DAYS);

  if (daysSince < BENCHMARK_DUE_DAYS) {
    return {
      state: "current",
      lastOn: last.date,
      daysSince,
      dueOn,
      note: `Done ${daysSince} ${daysSince === 1 ? "day" : "days"} ago. Next one from ${dueOn} — repeating it sooner mostly measures how recovered you are, not how fit.`,
    };
  }

  if (daysSince <= BENCHMARK_OVERDUE_DAYS) {
    return {
      state: "due",
      lastOn: last.date,
      daysSince,
      dueOn,
      note: `It has been ${daysSince} days. This is the window — four to six weeks after the last one — where a repeat says something about the training in between.`,
    };
  }

  return {
    state: "overdue",
    lastOn: last.date,
    daysSince,
    dueOn,
    note: `It has been ${daysSince} days, past the six-week window. A repeat is still worth doing; just read the difference as the whole ${Math.round(daysSince / 7)} weeks rather than as one training block.`,
  };
}

/** The most recent result for a test, or null. */
export function latestResult(
  results: readonly BenchmarkResult[],
  testId: BenchmarkTestId,
): BenchmarkResult | null {
  const mine = results.filter((r) => r.testId === testId);
  if (mine.length === 0) return null;
  return [...mine].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/**
 * The single most recent attempt across every test, or null.
 *
 * For the caller that needs "what has this athlete last measured about
 * themselves" without caring which test it was — the coach's prompt, and the
 * screen's choice of which test to open on.
 */
export function mostRecentResult(results: readonly BenchmarkResult[]): BenchmarkResult | null {
  if (results.length === 0) return null;
  return [...results].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.at < b.at ? 1 : -1,
  )[0];
}

/** Every result for a test, oldest first — the order a chart wants. */
export function resultsForTest(
  results: readonly BenchmarkResult[],
  testId: BenchmarkTestId,
): BenchmarkResult[] {
  return results.filter((r) => r.testId === testId).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* -------------------------------------------------------------------------- */
/* Comparison — the part that has to refuse                                   */
/* -------------------------------------------------------------------------- */

/** A pack this much heavier or lighter is a different test. */
export const PACK_TOLERANCE_KG = 1;
/** Two climbs differing by more than this are not the same climb. */
export const ASCENT_TOLERANCE_PCT = 10;
/**
 * Below this, a difference in vertical rate is not distinguishable from the day.
 *
 * Heat, sleep, what you ate, how hard you were willing to push, whether the
 * ground was wet — none of which ICEFALL holds — move a loaded ascent by more
 * than a few per cent on their own. Reporting "2% faster" as progress is
 * precision the measurement does not have, so it is reported as no detectable
 * change and the reason is given.
 */
export const MEANINGFUL_CHANGE_PCT = 3;

export type BenchmarkDirection = "faster" | "slower" | "no-detectable-change";

export type BenchmarkComparison =
  | {
      comparable: false;
      /** Why not, in a sentence fit to print. Never "invalid". */
      reason: string;
    }
  | {
      comparable: true;
      previous: BenchmarkResult;
      latest: BenchmarkResult;
      daysApart: number;
      previousRateMPerH: number;
      latestRateMPerH: number;
      /** Positive means the latest was faster. Signed, one decimal. */
      deltaRatePct: number;
      direction: BenchmarkDirection;
      /** The app's own sentence about the difference. */
      summary: string;
      /**
       * What could explain the difference besides fitness, listed rather than
       * buried. Always present, always rendered.
       */
      confounders: string;
    };

const CONFOUNDERS_BASE =
  "ICEFALL does not know the weather, the heat, how you slept, what you ate, how hard you chose to push, or whether the ground was dry. Any of those moves a loaded ascent by a few per cent on its own.";

/**
 * Compare two attempts, or explain why they cannot be compared.
 *
 * SIX REFUSALS, and each is a case where an app that "just showed the
 * percentage" would be lying:
 *
 *   1. different test — 400 m with 10 kg against 800 m with 12 kg is not a
 *      before and after, it is two different things
 *   2. pack differs by more than a kilo
 *   3. ascent differs by more than a tenth
 *   4. fewer than three weeks apart — see MIN_COMPARABLE_DAYS
 *   5. the same day twice
 *   6. a figure that is not a usable number
 *
 * It compares VERTICAL RATE rather than raw time, so a climb that measured 790
 * m one month and 810 m the next is compared fairly instead of showing the
 * athlete twenty metres of GPS noise as a loss of fitness.
 */
export function compareResults(
  previous: BenchmarkResult | null | undefined,
  latest: BenchmarkResult | null | undefined,
): BenchmarkComparison {
  if (!previous || !latest) {
    return {
      comparable: false,
      reason:
        "There is only one result for this test so far. A benchmark becomes useful on the second one — this is the line, not the reading.",
    };
  }

  if (previous.testId !== latest.testId) {
    const a = benchmarkTest(previous.testId)?.name ?? previous.testId;
    const b = benchmarkTest(latest.testId)?.name ?? latest.testId;
    return {
      comparable: false,
      reason: `These are different tests — the ${a} and the ${b}. ICEFALL will not convert one into the other; changing the height or the pack changes what is being measured.`,
    };
  }

  for (const r of [previous, latest]) {
    const usable =
      Number.isFinite(r.elapsedMin) &&
      r.elapsedMin > 0 &&
      Number.isFinite(r.ascentM) &&
      r.ascentM > 0;
    if (!usable) {
      return {
        comparable: false,
        reason:
          "One of these results has no usable time or ascent, so there is nothing to compare.",
      };
    }
  }

  const packGap = Math.abs(latest.packKg - previous.packKg);
  if (packGap > PACK_TOLERANCE_KG) {
    return {
      comparable: false,
      reason: `The packs differ by ${packGap.toFixed(1)} kg — ${previous.packKg} kg then, ${latest.packKg} kg now. That is a different test, and ICEFALL will not adjust a time for a load it never measured.`,
    };
  }

  const ascentGapPct = (Math.abs(latest.ascentM - previous.ascentM) / previous.ascentM) * 100;
  if (ascentGapPct > ASCENT_TOLERANCE_PCT) {
    return {
      comparable: false,
      reason: `The two climbs differ by ${Math.round(ascentGapPct)}% in ascent — ${previous.ascentM} m then, ${latest.ascentM} m now. That is far enough apart to be a different climb rather than the same one measured twice.`,
    };
  }

  const daysApart = daysBetween(previous.date, latest.date);
  if (daysApart === 0) {
    return {
      comparable: false,
      reason:
        "Both of these are on the same day. Two attempts in one day measure fatigue, not fitness.",
    };
  }
  if (daysApart < MIN_COMPARABLE_DAYS) {
    return {
      comparable: false,
      reason: `These are ${daysApart} days apart. Under three weeks, the difference between two loaded ascents is mostly how recovered you were on each day — ICEFALL will not present that as a change in fitness.`,
    };
  }

  const previousRateMPerH = verticalRate(previous);
  const latestRateMPerH = verticalRate(latest);
  const deltaRatePct =
    Math.round(((latestRateMPerH - previousRateMPerH) / previousRateMPerH) * 1000) / 10;

  const direction: BenchmarkDirection =
    Math.abs(deltaRatePct) < MEANINGFUL_CHANGE_PCT
      ? "no-detectable-change"
      : deltaRatePct > 0
        ? "faster"
        : "slower";

  const rates = `${Math.round(previousRateMPerH)} m/h then, ${Math.round(latestRateMPerH)} m/h now`;
  const summary =
    direction === "no-detectable-change"
      ? `No change ICEFALL can tell apart from the day itself — ${rates}, ${Math.abs(deltaRatePct).toFixed(1)}% apart. Anything under ${MEANINGFUL_CHANGE_PCT}% is inside the noise of weather, sleep and effort.`
      : direction === "faster"
        ? `${deltaRatePct.toFixed(1)}% faster up the same climb under the same pack — ${rates}.`
        : `${Math.abs(deltaRatePct).toFixed(1)}% slower up the same climb under the same pack — ${rates}. That is a reading, not a verdict; a hard training block, a cold, or a hot day all look like this.`;

  /* The mixed-provenance case is flagged rather than refused. Typing in a time
     and an ascent is a legitimate way to do this test and most athletes will do
     exactly that — but a percentage drawn between a measured figure and an
     estimated one carries the estimate's error, and that has to be said. */
  const mixed =
    previous.provenance !== latest.provenance
      ? " One of these two was typed in and the other came off a recorded activity, so the difference between them includes any difference in how they were arrived at."
      : "";

  return {
    comparable: true,
    previous,
    latest,
    daysApart,
    previousRateMPerH,
    latestRateMPerH,
    deltaRatePct,
    direction,
    summary,
    confounders: CONFOUNDERS_BASE + mixed,
  };
}

/** The latest comparison for a test: its last two attempts, in order. */
export function latestComparison(
  results: readonly BenchmarkResult[],
  testId: BenchmarkTestId,
): BenchmarkComparison {
  const series = resultsForTest(results, testId);
  return compareResults(series[series.length - 2], series[series.length - 1]);
}

/* -------------------------------------------------------------------------- */
/* Store — this device, like every other ICEFALL store                        */
/* -------------------------------------------------------------------------- */

const KEY = "icefall.benchmarks.v1";

/**
 * A result is a handful of numbers, so the cap is generous — but it IS a cap.
 * `localStorage` is a hard ~5 MB shared with every other `icefall.` key, and an
 * unbounded store here would eventually evict somebody's training plan.
 */
const MAX_RESULTS = 200;

export const BENCHMARK_STORAGE_NOTICE =
  "Benchmark results are kept on this phone. There is no server table for them yet, so a new phone starts with an empty history, and erasing your data in Settings takes them with it.";

interface Stored {
  results: BenchmarkResult[];
}

const EMPTY: Stored = { results: [] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date that exists. `2026-02-31` matches the pattern and is not a day. */
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function isResult(v: unknown): v is BenchmarkResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<BenchmarkResult>;
  return (
    typeof r.id === "string" &&
    BENCHMARK_TEST_IDS.includes(r.testId as BenchmarkTestId) &&
    isCalendarDate(r.date) &&
    typeof r.elapsedMin === "number" &&
    Number.isFinite(r.elapsedMin) &&
    r.elapsedMin > 0 &&
    r.elapsedMin <= MAX_ELAPSED_MIN &&
    typeof r.ascentM === "number" &&
    Number.isFinite(r.ascentM) &&
    r.ascentM > 0 &&
    typeof r.packKg === "number" &&
    Number.isFinite(r.packKg) &&
    r.packKg >= 0 &&
    r.packKg <= MAX_PACK_KG &&
    (r.provenance === "recorded" || r.provenance === "self-reported") &&
    typeof r.at === "string"
  );
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    /* A half-written record reads as no record. This runs while a screen
       mounts; it must never throw the athlete onto a blank app. */
    return { results: Array.isArray(parsed.results) ? parsed.results.filter(isResult) : [] };
  } catch {
    return EMPTY;
  }
}

const listeners = new Set<(s: Stored) => void>();
let current: Stored = typeof localStorage === "undefined" ? EMPTY : read();

function write(next: Stored) {
  const sorted = [...next.results].sort((a, b) =>
    a.date === b.date ? (a.at < b.at ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
  current = { results: sorted.length > MAX_RESULTS ? sorted.slice(-MAX_RESULTS) : sorted };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Private mode or a full quota. The result holds for this session and is
       gone on the next launch. Nothing here may pretend it was kept — that is
       what BENCHMARK_STORAGE_NOTICE on the screen is for. */
  }
  listeners.forEach((l) => l(current));
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `bm-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

export function currentBenchmarkResults(): readonly BenchmarkResult[] {
  return current.results;
}

/**
 * Record one attempt. Returns it, or NULL when the figures are not usable.
 *
 * NULL RATHER THAN A COERCED RECORD. A form that turned "1o5" into 105 minutes,
 * or a blank pack field into 0 kg, would file a number nobody entered and then
 * compare against it for the next year. The caller shows the field error.
 */
export function addBenchmarkResult(r: NewBenchmarkResult): BenchmarkResult | null {
  const record: BenchmarkResult = {
    id: newId(),
    testId: r.testId,
    date: r.date,
    elapsedMin: Math.round(r.elapsedMin),
    ascentM: Math.round(r.ascentM),
    packKg: Math.round(r.packKg * 10) / 10,
    provenance: r.provenance,
    at: new Date().toISOString(),
  };
  if (r.activityId) record.activityId = r.activityId;
  if (typeof r.effort === "number" && Number.isFinite(r.effort)) {
    record.effort = Math.min(10, Math.max(1, Math.round(r.effort)));
  }
  if (typeof r.note === "string" && r.note.trim().length > 0) {
    record.note = r.note.trim().slice(0, MAX_NOTE_CHARS);
  }

  if (!isResult(record)) return null;

  write({ results: [...current.results, record] });
  return record;
}

/**
 * Delete one result.
 *
 * A DELETION, not a "void" flag. A benchmark history with a struck-through row
 * in it is a history the athlete has to keep explaining to themselves, and
 * unlike a plan change there is nothing downstream that depends on the record
 * having existed — see `tracking/adjustments.ts`, where undo has to be a
 * deletion for a quite different reason.
 */
export function forgetBenchmarkResult(id: string): void {
  write({ results: current.results.filter((r) => r.id !== id) });
}

export function clearBenchmarkResults(): void {
  write(EMPTY);
}

function useStore(): Stored {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function useBenchmarkResults(): readonly BenchmarkResult[] {
  return useStore().results;
}
