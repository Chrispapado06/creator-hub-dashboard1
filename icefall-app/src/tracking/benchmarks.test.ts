/**
 * TEST SET FOR THE BENCHMARK TEST LAYER.
 *
 * `npm run test:benchmarks` — esbuild to node, like every other suite here.
 * Nothing in `tracking/benchmarks.ts` touches the network and it survives
 * `localStorage` being absent (which it is, on node), so the store is exercised
 * for real rather than mocked.
 *
 * WHAT IS BEING PROVED. The module's header makes claims that are easy to
 * believe and expensive to be wrong about, and each suite pins one:
 *
 *   1. THE CATALOGUE CARRIES NO PASS MARK. A target time added to a test
 *      definition would turn a measurement into a verdict, and it would be a
 *      verdict nobody qualified set. Suite 1 checks the shape of every test.
 *   2. THE APP DOES NOT PICK A TEST OFF AN ASPIRATION. `suggestTest` reads the
 *      athlete's own recorded history and returns null rather than a default.
 *   3. THE SCHEDULE'S BOUNDARIES ARE WHERE THE ROADMAP PUT THEM — four weeks
 *      and six — and the day count survives a clock change.
 *   4. THE COMPARISON REFUSES. Six ways two results can fail to be comparable,
 *      each of which an app that "just showed the percentage" would get wrong.
 *   5. A DIFFERENCE INSIDE THE NOISE IS REPORTED AS NO DIFFERENCE.
 *   6. THE STORE REFUSES A RECORD RATHER THAN COERCING ONE.
 *
 * WHAT THIS FILE DOES NOT PROVE. That any screen renders a result, or that the
 * coach's prompt carries one. Those are call sites, verified by reading them.
 */
import {
  ASCENT_TOLERANCE_PCT,
  BENCHMARK_DUE_DAYS,
  BENCHMARK_OVERDUE_DAYS,
  BENCHMARK_TESTS,
  BENCHMARK_TEST_IDS,
  MEANINGFUL_CHANGE_PCT,
  MIN_COMPARABLE_DAYS,
  addBenchmarkResult,
  benchmarkSchedule,
  benchmarkTest,
  clearBenchmarkResults,
  compareResults,
  currentBenchmarkResults,
  daysBetween,
  forgetBenchmarkResult,
  latestComparison,
  latestResult,
  localDateKey,
  resultFromActivity,
  resultsForTest,
  suggestTest,
  verticalRate,
  type BenchmarkResult,
  type BenchmarkTestId,
} from "@/tracking/benchmarks";
import type { RecordedActivity } from "@/tracking/types";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

let seq = 0;
function result(over: Partial<BenchmarkResult> = {}): BenchmarkResult {
  seq += 1;
  return {
    id: `r${seq}`,
    testId: "alpine-800-12",
    date: "2026-01-01",
    elapsedMin: 120,
    ascentM: 800,
    packKg: 12,
    provenance: "self-reported",
    at: "2026-01-01T18:00:00.000Z",
    ...over,
  };
}

function main() {
  /* ------------------------------------------------------------------------ */
  /* 1. The catalogue carries a measurement, never a standard                  */
  /* ------------------------------------------------------------------------ */

  ok(BENCHMARK_TESTS.length === BENCHMARK_TEST_IDS.length, "test list and id list disagree");
  ok(
    new Set(BENCHMARK_TESTS.map((t) => t.id)).size === BENCHMARK_TESTS.length,
    "two tests share an id",
  );
  ok(
    BENCHMARK_TESTS.every((t) => BENCHMARK_TEST_IDS.includes(t.id)),
    "a test has an id outside BENCHMARK_TEST_IDS",
  );

  /* The load-bearing one. A `targetMin`, `parTime`, `standard` or `grade` field
     would be a pass mark, which is a mountaineering judgement nobody on the
     build side is qualified to make — the same argument mountainRequirements.ts
     makes about requirement figures. The allowed key set is closed. */
  const ALLOWED = ["id", "name", "ascentM", "packKg", "protocol", "why", "limits"];
  for (const t of BENCHMARK_TESTS) {
    const extra = Object.keys(t).filter((k) => !ALLOWED.includes(k));
    ok(extra.length === 0, `${t.id} carries fields outside the allowed set: ${extra.join(", ")}`);
    ok(t.protocol.length >= 3, `${t.id} has a protocol too short to follow`);
    ok(t.why.length > 40 && t.limits.length > 40, `${t.id} is missing its why or its limits`);
    ok(t.ascentM > 0 && t.packKg > 0, `${t.id} has a nonsense prescription`);
  }

  ok(
    BENCHMARK_TESTS.every((t, i) => i === 0 || t.ascentM > BENCHMARK_TESTS[i - 1].ascentM),
    "the tests are not ordered by ascent, which the picker relies on",
  );
  ok(benchmarkTest("alpine-800-12")?.packKg === 12, "benchmarkTest did not find a known test");
  ok(benchmarkTest("not-a-test") === undefined, "benchmarkTest invented a test");

  /* ------------------------------------------------------------------------ */
  /* 2. Which test — off the athlete's record, or not at all                   */
  /* ------------------------------------------------------------------------ */

  ok(suggestTest(null).suggested === null, "an empty feed produced a suggested test");
  ok(
    suggestTest(null).because.includes("no recorded day"),
    "the empty-feed reason does not say the feed is empty",
  );
  ok(suggestTest(250).suggested === null, "a 250 m best produced a test it cannot finish");
  ok(suggestTest(500).suggested?.id === "hill-400-10", "a 500 m best did not get the 400 m test");
  ok(suggestTest(900).suggested?.id === "alpine-800-12", "a 900 m best did not get the 800 m test");
  ok(
    suggestTest(4000).suggested?.id === "expedition-1200-15",
    "a very large best did not get the largest test",
  );
  ok(suggestTest(400).suggested?.id === "hill-400-10", "the boundary case excluded an exact match");
  ok(suggestTest(Number.NaN).suggested === null, "NaN was treated as a recorded day");

  /* ------------------------------------------------------------------------ */
  /* 3. Scheduling, and the clock-change trap                                  */
  /* ------------------------------------------------------------------------ */

  const NOW = new Date("2026-03-01T09:00:00.000Z");
  const testId: BenchmarkTestId = "alpine-800-12";

  ok(
    benchmarkSchedule([], testId, NOW).state === "never-taken",
    "an athlete who has never tested is not 'never-taken'",
  );
  ok(
    benchmarkSchedule([], testId, NOW).dueOn === null,
    "a test never taken was given a due date out of nowhere",
  );

  const on = (d: string) => [result({ date: d, testId })];
  ok(benchmarkSchedule(on("2026-02-20"), testId, NOW).state === "current", "9 days is not current");
  ok(
    benchmarkSchedule(on("2026-02-01"), testId, NOW).state === "due",
    "28 days exactly is not due — the roadmap's four weeks",
  );
  ok(
    benchmarkSchedule(on("2026-02-02"), testId, NOW).state === "current",
    "27 days was already called due",
  );
  ok(
    benchmarkSchedule(on("2026-01-18"), testId, NOW).state === "due",
    "42 days exactly is not still due — the roadmap's six weeks",
  );
  ok(
    benchmarkSchedule(on("2026-01-17"), testId, NOW).state === "overdue",
    "43 days is not overdue",
  );
  ok(
    benchmarkSchedule(on("2026-02-01"), testId, NOW).dueOn === "2026-03-01",
    "the due date is not 28 days after the last attempt",
  );

  /* Another test's history must not make this one due. */
  ok(
    benchmarkSchedule([result({ date: "2026-01-01", testId: "hill-400-10" })], testId, NOW)
      .state === "never-taken",
    "a result on a different test counted towards this test's schedule",
  );

  /* The most recent attempt decides, whatever order the list is in. */
  ok(
    benchmarkSchedule(
      [result({ date: "2026-01-01", testId }), result({ date: "2026-02-25", testId })],
      testId,
      NOW,
    ).state === "current",
    "an older attempt overrode a newer one",
  );

  ok(BENCHMARK_DUE_DAYS === 28 && BENCHMARK_OVERDUE_DAYS === 42, "the 4–6 week window moved");

  /* Europe's spring clock change falls between these two dates. Counting in
     local instants would make one of the days 23 hours and lose it. */
  ok(daysBetween("2026-03-28", "2026-03-30") === 2, "a clock change ate a day");
  ok(daysBetween("2026-12-31", "2027-01-01") === 1, "the year boundary lost a day");
  ok(daysBetween("2026-02-01", "2026-03-01") === 28, "February was miscounted");

  /* ------------------------------------------------------------------------ */
  /* 4. The comparison refuses                                                 */
  /* ------------------------------------------------------------------------ */

  const base = result({ date: "2026-01-01", elapsedMin: 120, ascentM: 800, packKg: 12 });

  ok(compareResults(null, base).comparable === false, "one result produced a comparison");
  ok(
    compareResults(undefined, undefined).comparable === false,
    "two missing results produced a comparison",
  );

  const otherTest = compareResults(
    base,
    result({ testId: "hill-400-10", date: "2026-03-01", ascentM: 400, packKg: 10 }),
  );
  ok(!otherTest.comparable, "two different tests were compared");
  ok(
    !otherTest.comparable && otherTest.reason.includes("different tests"),
    "the different-test refusal does not say so",
  );

  const heavier = compareResults(base, result({ date: "2026-03-01", packKg: 15 }));
  ok(!heavier.comparable, "a 3 kg heavier pack was compared as the same test");
  const oneKilo = compareResults(base, result({ date: "2026-03-01", packKg: 13 }));
  ok(oneKilo.comparable, "a 1 kg difference — inside tolerance — was refused");

  const differentHill = compareResults(base, result({ date: "2026-03-01", ascentM: 1000 }));
  ok(!differentHill.comparable, "a 25% bigger climb was compared as the same climb");
  const sameHill = compareResults(base, result({ date: "2026-03-01", ascentM: 840 }));
  ok(sameHill.comparable, `a ${ASCENT_TOLERANCE_PCT}%-tolerance climb was refused`);

  const sameDay = compareResults(base, result({ date: "2026-01-01", elapsedMin: 110 }));
  ok(!sameDay.comparable, "two attempts on the same day were compared");

  const tooSoon = compareResults(base, result({ date: "2026-01-10", elapsedMin: 110 }));
  ok(!tooSoon.comparable, `${MIN_COMPARABLE_DAYS} days is not being enforced`);
  ok(
    !tooSoon.comparable && tooSoon.reason.includes("recovered"),
    "the too-soon refusal does not explain what it would actually be measuring",
  );
  ok(
    compareResults(base, result({ date: "2026-01-22", elapsedMin: 110 })).comparable,
    "exactly 21 days was refused",
  );

  const broken = compareResults(base, result({ date: "2026-03-01", elapsedMin: 0 }));
  ok(!broken.comparable, "a zero-minute result was compared");

  /* ------------------------------------------------------------------------ */
  /* 5. The noise floor, and the direction                                     */
  /* ------------------------------------------------------------------------ */

  /* 120 min → 117 min over the same climb is 2.6% — inside the floor. */
  const noise = compareResults(base, result({ date: "2026-03-01", elapsedMin: 117 }));
  ok(noise.comparable, "a small change was refused rather than reported as noise");
  ok(
    noise.comparable && noise.direction === "no-detectable-change",
    `a ${MEANINGFUL_CHANGE_PCT}%-floor difference was reported as a change`,
  );
  ok(
    noise.comparable && noise.summary.includes("noise"),
    "the no-change summary does not say why there is no change",
  );

  const faster = compareResults(base, result({ date: "2026-03-01", elapsedMin: 100 }));
  ok(
    faster.comparable && faster.direction === "faster",
    "a 20% faster climb was not called faster",
  );
  ok(faster.comparable && faster.deltaRatePct > 0, "a faster climb has a negative delta");

  const slower = compareResults(base, result({ date: "2026-03-01", elapsedMin: 140 }));
  ok(
    slower.comparable && slower.direction === "slower",
    "a much slower climb was not called slower",
  );
  ok(
    slower.comparable && slower.summary.includes("not a verdict"),
    "a slower result reads as a verdict",
  );

  /* Normalised on vertical rate, so GPS noise in the ascent is not read as
     fitness. Same time, 20 m more ascent = slightly faster, still inside the
     floor. */
  const normalised = compareResults(base, result({ date: "2026-03-01", ascentM: 820 }));
  ok(
    normalised.comparable && normalised.direction === "no-detectable-change",
    "twenty metres of GPS noise was reported as a change in fitness",
  );

  ok(Math.round(verticalRate(base)) === 400, "vertical rate is not ascent over hours");

  const mixed = compareResults(
    base,
    result({ date: "2026-03-01", elapsedMin: 100, provenance: "recorded" }),
  );
  ok(
    mixed.comparable && mixed.confounders.includes("typed in"),
    "comparing a typed figure with a measured one is not flagged",
  );
  ok(
    faster.comparable && !faster.confounders.includes("typed in"),
    "two figures of the same provenance were flagged as mixed",
  );
  ok(
    faster.comparable && faster.confounders.includes("slept"),
    "the confounders line does not name what ICEFALL cannot see",
  );

  /* ------------------------------------------------------------------------ */
  /* 6. The store refuses rather than coerces                                  */
  /* ------------------------------------------------------------------------ */

  clearBenchmarkResults();
  ok(currentBenchmarkResults().length === 0, "the store did not start empty");

  const good = addBenchmarkResult({
    testId: "alpine-800-12",
    date: "2026-05-01",
    elapsedMin: 118,
    ascentM: 805,
    packKg: 12,
    provenance: "self-reported",
    note: "  hot day  ",
    effort: 42,
  });
  ok(good !== null, "a valid result was refused");
  ok(good?.note === "hot day", "the note was not trimmed");
  ok(
    good?.effort === 10,
    "an out-of-range effort was not clamped to the 1–10 the athlete is asked",
  );

  ok(
    addBenchmarkResult({
      testId: "alpine-800-12",
      date: "2026-05-08",
      elapsedMin: 0,
      ascentM: 800,
      packKg: 12,
      provenance: "self-reported",
    }) === null,
    "a zero-minute result was stored",
  );
  ok(
    addBenchmarkResult({
      testId: "alpine-800-12",
      date: "2026-02-31",
      elapsedMin: 100,
      ascentM: 800,
      packKg: 12,
      provenance: "self-reported",
    }) === null,
    "31 February was accepted as a date",
  );
  ok(
    addBenchmarkResult({
      testId: "alpine-800-12",
      date: "2026-05-08",
      elapsedMin: 100,
      ascentM: 800,
      packKg: 90,
      provenance: "self-reported",
    }) === null,
    "a 90 kg pack was stored",
  );
  ok(
    addBenchmarkResult({
      testId: "not-a-test" as BenchmarkTestId,
      date: "2026-05-08",
      elapsedMin: 100,
      ascentM: 800,
      packKg: 12,
      provenance: "self-reported",
    }) === null,
    "a result against an unknown test was stored",
  );
  ok(currentBenchmarkResults().length === 1, "a refused result still reached the store");

  const second = addBenchmarkResult({
    testId: "alpine-800-12",
    date: "2026-06-05",
    elapsedMin: 104,
    ascentM: 800,
    packKg: 12,
    provenance: "self-reported",
  });
  ok(second !== null, "the second result was refused");

  const stored = currentBenchmarkResults();
  ok(
    resultsForTest(stored, "alpine-800-12")[0].date === "2026-05-01",
    "results are not oldest-first",
  );
  ok(
    latestResult(stored, "alpine-800-12")?.date === "2026-06-05",
    "the latest result is not latest",
  );
  ok(latestResult(stored, "hill-400-10") === null, "a test never taken returned a result");

  const live = latestComparison(stored, "alpine-800-12");
  ok(live.comparable && live.direction === "faster", "the stored pair did not compare as faster");

  forgetBenchmarkResult(good?.id ?? "");
  ok(currentBenchmarkResults().length === 1, "deleting a result did not remove it");
  ok(
    latestComparison(currentBenchmarkResults(), "alpine-800-12").comparable === false,
    "a single remaining result still produced a comparison",
  );
  clearBenchmarkResults();

  /* ------------------------------------------------------------------------ */
  /* 7. From a recorded activity — elapsed, and never the pack                 */
  /* ------------------------------------------------------------------------ */

  const activity = {
    id: "act-1",
    startedAt: "2026-05-01T06:00:00.000Z",
    durationSec: 7_200,
    movingSec: 6_600,
    elevationGainM: 812,
  } as unknown as RecordedActivity;

  const fromFeed = resultFromActivity({ activity, testId: "alpine-800-12", packKg: 12 });
  ok(fromFeed !== null, "a usable activity produced no result");
  ok(fromFeed?.provenance === "recorded", "a figure off the feed is not marked recorded");
  ok(fromFeed?.elapsedMin === 120, "moving time was used where the protocol says elapsed");
  ok(fromFeed?.ascentM === 812, "the recorded ascent was replaced by the prescription");
  ok(fromFeed?.activityId === "act-1", "the result does not point back at its activity");
  ok(fromFeed?.packKg === 12, "the pack weight was not carried from the caller");
  ok(
    fromFeed?.date === localDateKey(new Date("2026-05-01T06:00:00.000Z")),
    "the date was taken from a UTC slice rather than the local day",
  );

  ok(
    resultFromActivity({
      activity: { ...activity, elevationGainM: 0 } as RecordedActivity,
      testId: "alpine-800-12",
      packKg: 12,
    }) === null,
    "a flat activity was accepted as a loaded ascent",
  );

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
