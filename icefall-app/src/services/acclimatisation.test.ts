/**
 * Ascent-pace tests — the invariants a later edit would quietly break.
 *
 * WHY THIS FILE EXISTS. The module it tests is the one wiring in the coach
 * roadmap that touches safety, and its rules are the kind that read as obvious
 * in prose and get lost in a refactor: that a history can only SLOW a schedule,
 * that "never" is worth nothing and "never been high enough to know" is not
 * "never", that the caveat travels with the narrowed figure, and that the
 * unnarrowed wording is still the wording `assessPeak` has always shown. Every
 * one of those is a sentence in the header of `acclimatisation.ts`; a prose
 * rule with no test is a rule the next edit breaks.
 *
 * It follows `src/services/conditions.test.ts` exactly: a plain TypeScript
 * program with a small harness, inside `src/` so `npm run typecheck` checks it
 * against the same types the app uses. Nothing in the app imports it.
 *
 * WHAT IT CANNOT PROVE. It does not prove any screen renders the result, and it
 * does not prove the coach's model obeys the prompt line — a prompt is not a
 * guarantee, which is the whole reason the figures are computed here first.
 */

import {
  ACCLIMATISATION_FLOOR_M,
  ASCENT_PACE_CAVEAT,
  ASCENT_PACE_RELEVANT_M,
  STAGED_ITINERARY_M,
  asAltitudeIllnessHistory,
  ascentPaceFor,
  describeAscentPaceForPrompt,
  type AltitudeIllnessHistory,
} from "./acclimatisation";
import { assessPeak } from "./peakAssessment";

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(`${currentCase} — ${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const eq = (name: string, got: unknown, want: unknown) =>
  check(name, Object.is(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* -------------------------------------------------------------------------- */

const HISTORIES: (AltitudeIllnessHistory | null)[] = [null, "never", "unknown", "mild", "serious"];

/** Two peaks, one either side of where a staged itinerary starts. */
const EVEREST_M = 8849;
const MONT_BLANC_M = 4808;

function run() {
  /* ---------------------------------------------------------------------- */
  testCase("A history may only slow the schedule, never speed it up");

  for (const elevationM of [MONT_BLANC_M, EVEREST_M]) {
    const base = ascentPaceFor(elevationM, null);
    if (!base) {
      check(`a baseline exists at ${elevationM} m`, false);
      continue;
    }
    for (const h of HISTORIES) {
      const p = ascentPaceFor(elevationM, h);
      check(
        `${elevationM} m, ${h ?? "not stated"}: nightly gain never exceeds the default`,
        p !== null && p.maxSleepGainM <= base.maxSleepGainM,
        `${p?.maxSleepGainM} vs ${base.maxSleepGainM}`,
      );
      check(
        `${elevationM} m, ${h ?? "not stated"}: rest nights never come less often`,
        p !== null && p.restNightEveryM <= base.restNightEveryM,
        `${p?.restNightEveryM} vs ${base.restNightEveryM}`,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  testCase('"Never" buys nothing, and "unknown" is not "never"');

  const never = ascentPaceFor(EVEREST_M, "never");
  const unknown = ascentPaceFor(EVEREST_M, "unknown");
  const unstated = ascentPaceFor(EVEREST_M, null);

  eq("never is not flagged as a narrowing", never?.narrowed, false);
  eq("unknown is not flagged as a narrowing", unknown?.narrowed, false);
  eq("never gets the same figure as silence", never?.maxSleepGainM, unstated?.maxSleepGainM);
  eq("never gets the same wording as silence", never?.guidance, unstated?.guidance);
  eq("unknown gets the same wording as silence", unknown?.guidance, unstated?.guidance);

  // The two answers are still told apart where it matters — in the prompt,
  // where the model must not read "never been high enough" as a clean record.
  const neverLine = describeAscentPaceForPrompt(EVEREST_M, "never");
  const unknownLine = describeAscentPaceForPrompt(EVEREST_M, "unknown");
  check("never and unknown produce different prompt lines", neverLine !== unknownLine);
  check(
    "the never line forbids a faster schedule in words",
    /must not suggest a faster schedule/.test(neverLine),
  );
  check(
    "the unknown line refuses to read it as a clean record",
    /not the same as never having had it/.test(unknownLine),
  );

  /* ---------------------------------------------------------------------- */
  testCase("A reported episode narrows the figures, and more for a serious one");

  const mild = ascentPaceFor(EVEREST_M, "mild");
  const serious = ascentPaceFor(EVEREST_M, "serious");

  eq("mild is flagged as a narrowing", mild?.narrowed, true);
  eq("serious is flagged as a narrowing", serious?.narrowed, true);
  check(
    "serious is stricter than mild",
    (serious?.maxSleepGainM ?? 0) < (mild?.maxSleepGainM ?? 0) &&
      (serious?.restNightEveryM ?? 0) < (mild?.restNightEveryM ?? 0),
  );
  check("the narrowed wording quotes the computed ceiling", (mild?.guidance ?? "").includes("400"));
  check(
    "and says why, so the athlete is not left guessing",
    /you have reported altitude illness before/.test(mild?.guidance ?? ""),
  );

  /* ---------------------------------------------------------------------- */
  testCase("The caveat travels with the figure, and only with it");

  for (const elevationM of [MONT_BLANC_M, EVEREST_M]) {
    for (const h of HISTORIES) {
      const p = ascentPaceFor(elevationM, h);
      if (!p) continue;
      check(
        `${elevationM} m, ${h ?? "not stated"}: caveat present exactly when narrowed`,
        (p.caveat !== null) === p.narrowed,
      );
      if (p.caveat) eq("and it is the one exported sentence", p.caveat, ASCENT_PACE_CAVEAT);
    }
  }

  check(
    "the caveat refuses the word this feature must never imply",
    /does not make a mountain safe/.test(ASCENT_PACE_CAVEAT),
  );
  check("and points at descent rather than at the schedule", /descending/.test(ASCENT_PACE_CAVEAT));

  /* ---------------------------------------------------------------------- */
  testCase("A serious episode sends the athlete to a doctor, not to a number");

  eq("mild carries no medical note", mild?.medicalNote, null);
  check("serious does", (serious?.medicalNote ?? "").length > 0);
  check("and it names a doctor", /doctor/.test(serious?.medicalNote ?? ""));
  check(
    "and refuses to predict recurrence",
    /will not offer one|no view on whether/.test(serious?.medicalNote ?? ""),
  );

  /* ---------------------------------------------------------------------- */
  testCase("Below the relevant elevation there is no schedule to make conservative");

  for (const h of HISTORIES) {
    eq(
      `${h ?? "not stated"} at 2,000 m returns nothing`,
      ascentPaceFor(2000, h),
      null as unknown as ReturnType<typeof ascentPaceFor>,
    );
  }
  eq(
    "and one metre under the threshold is still nothing",
    ascentPaceFor(ASCENT_PACE_RELEVANT_M - 1, "serious"),
    null as unknown as ReturnType<typeof ascentPaceFor>,
  );
  check("while the threshold itself has one", ascentPaceFor(ASCENT_PACE_RELEVANT_M, null) !== null);
  check(
    "a non-finite elevation returns nothing rather than a default schedule",
    ascentPaceFor(Number.NaN, "serious") === null,
  );

  /* ---------------------------------------------------------------------- */
  testCase("assessPeak still shows the wording it always showed");

  // The two surfaces read ONE module now. If this drifts, a mountain page and a
  // readiness screen are describing different ascents up the same peak.
  for (const elevationM of [1200, 3000, 3500, 4808, 5500, 8849]) {
    eq(
      `${elevationM} m: assessPeak quotes the unnarrowed schedule`,
      assessPeak(elevationM, 0).acclimatisation,
      ascentPaceFor(elevationM, null)?.guidance,
    );
  }
  check(
    "the staged band still says 300–500 m, as every screen has always read",
    (assessPeak(STAGED_ITINERARY_M, 0).acclimatisation ?? "").includes("300–500 m"),
  );
  check(
    "and the lower band still says climb high, sleep low",
    (assessPeak(4000, 0).acclimatisation ?? "").includes("climb high and sleep low"),
  );
  eq("below 3,500 m it is still absent entirely", assessPeak(3000, 0).acclimatisation, undefined);

  /* ---------------------------------------------------------------------- */
  testCase("An unrecognised stored answer is not stated, not a default");

  eq("a valid id narrows", asAltitudeIllnessHistory("serious"), "serious");
  eq("null stays null", asAltitudeIllnessHistory(null), null);
  eq("undefined stays null", asAltitudeIllnessHistory(undefined), null);
  eq("a renamed id becomes not-stated", asAltitudeIllnessHistory("severe"), null);
  eq("and so does an empty string", asAltitudeIllnessHistory(""), null);
  eq(
    "the prompt says nothing when nothing was asked",
    describeAscentPaceForPrompt(EVEREST_M, null),
    "",
  );

  /* ---------------------------------------------------------------------- */
  testCase("The prompt hands over figures rather than an instruction to be careful");

  const seriousLine = describeAscentPaceForPrompt(EVEREST_M, "serious");
  check("it names the computed ceiling", seriousLine.includes("300 m"));
  check("it names the rest interval", seriousLine.includes("600 m"));
  check("it forbids the model inventing its own", /rather than any of your own/.test(seriousLine));
  check("it forbids anything faster", /never suggest anything faster/.test(seriousLine));
  check("and it refuses to let a schedule read as protection", /not protection/.test(seriousLine));

  // No objective, or an objective too low to have a schedule: the history is
  // still stated, and the model is told to give no rate of its own.
  for (const elevationM of [null, 2000]) {
    const line = describeAscentPaceForPrompt(elevationM, "mild");
    check(
      `${elevationM === null ? "no objective" : "a low objective"}: still states the history`,
      /reported mild altitude illness/.test(line),
    );
    check(
      `${elevationM === null ? "no objective" : "a low objective"}: and gives no rate`,
      /no ascent rate of your own/.test(line),
    );
  }

  /* ---------------------------------------------------------------------- */
  testCase("The floor the figures are counted from is the one the copy names");

  eq("3,000 m, as every string says", ACCLIMATISATION_FLOOR_M, 3000);
  check(
    "and every narrowed string names it",
    [MONT_BLANC_M, EVEREST_M].every((m) =>
      (ascentPaceFor(m, "serious")?.guidance ?? "").includes("3,000 m"),
    ),
  );

  /* ---------------------------------------------------------------------- */

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  \x1b[31m·\x1b[0m ${f}`));
    if (proc) proc.exitCode = 1;
  }
  console.log(
    "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that any screen renders the narrowed\n" +
      "schedule, that the coach's model obeys the prompt line it is handed, or\n" +
      "anything at all about the symptom layer in coach/safety.ts — which is a\n" +
      "different question, runs first, and has its own corpus.\x1b[0m",
  );
}

void run();
