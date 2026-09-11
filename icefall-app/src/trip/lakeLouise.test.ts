/**
 * THE LAKE LOUISE RED-TEAM CORPUS.
 *
 * `coach/safety.ts` set the standard: a safety layer ships with a corpus, and
 * the corpus is the thing that stops a later tidy-up quietly changing what the
 * app says to somebody at 4,200 m. This is that corpus for the questionnaire.
 *
 * WHAT IT PROVES, AND THE ORDER MATTERS:
 *
 *   1. THE ARITHMETIC. Exhaustively, over all 256 combinations of the four
 *      scored items, and over the published band boundaries.
 *   2. THE ESCALATION. Exhaustively, over every combination of items, red
 *      flags and functional score that the type system allows — 256 x 6 x 5 =
 *      7,680 forms. A red flag must win from every one of them.
 *   3. NO DIAGNOSIS. Every string this module can put on a screen is scanned
 *      for the sentences it may never say.
 *   4. UNCONDITIONAL DESCENT. The descent line is on every result at every
 *      score, including zero and including an unfinished form.
 *   5. NO DEPENDENCE ON ANYTHING. The scorer takes one argument, it is pure,
 *      and its two escalating bodies are BYTE IDENTICAL to `coach/safety.ts`.
 *
 * WHAT IT CANNOT PROVE: that the screen renders the result it was handed. The
 * screen is checked structurally by `src/trip/offline.test.ts` instead.
 */

import { SAFETY_DISCLAIMER, SAFETY_MESSAGES } from "@/coach/safety";

import {
  A_SCORE_IS_A_MOMENT,
  BANDS,
  DESCENT_IS_ALWAYS_AVAILABLE,
  ESCALATION_HEADING,
  FUNCTIONAL_OPTIONS,
  FUNCTIONAL_QUESTION,
  HEADACHE_MINIMUM,
  LAKE_LOUISE_ITEMS,
  LAKE_LOUISE_QUESTIONS,
  NOT_A_DIAGNOSIS,
  POSITIVE_TOTAL,
  RED_FLAG_ORDER,
  RED_FLAG_QUESTIONS,
  asAnswers,
  emptyAnswers,
  scoreLakeLouise,
  summariseCheck,
  type LakeLouiseAnswers,
  type LikertScore,
  type RedFlagId,
} from "./lakeLouise";

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
/* Builders                                                                    */
/* -------------------------------------------------------------------------- */

const SCORES: LikertScore[] = [0, 1, 2, 3];

function form(
  headache: LikertScore | null,
  gi: LikertScore | null,
  fatigue: LikertScore | null,
  dizzy: LikertScore | null,
  opts: { functional?: LikertScore | null; flag?: RedFlagId | null; allFlagsNo?: boolean } = {},
): LakeLouiseAnswers {
  const a = emptyAnswers();
  a.items.headache = headache;
  a.items.gastrointestinal = gi;
  a.items.fatigue = fatigue;
  a.items.dizziness = dizzy;
  a.functional = opts.functional ?? null;
  if (opts.allFlagsNo) for (const id of RED_FLAG_ORDER) a.redFlags[id] = false;
  if (opts.flag) a.redFlags[opts.flag] = true;
  return a;
}

/** Every complete four-item combination. 256 of them. */
function allComplete(): LakeLouiseAnswers[] {
  const out: LakeLouiseAnswers[] = [];
  for (const h of SCORES)
    for (const g of SCORES)
      for (const f of SCORES) for (const d of SCORES) out.push(form(h, g, f, d, { allFlagsNo: true }));
  return out;
}

/* -------------------------------------------------------------------------- */

function run() {
  /* ---------------------------------------------------------------------- */
  testCase("1 — The arithmetic, exhaustively over all 256 complete forms");

  let totalsRight = 0;
  let thresholdRight = 0;
  let bandRight = 0;

  for (const a of allComplete()) {
    const r = scoreLakeLouise(a);
    const want = LAKE_LOUISE_ITEMS.reduce((s, id) => s + (a.items[id] as number), 0);
    if (r.total === want) totalsRight++;

    const wantThreshold =
      (a.items.headache as number) >= HEADACHE_MINIMUM && want >= POSITIVE_TOTAL;
    if (r.thresholdReached === wantThreshold) thresholdRight++;

    const wantBand = wantThreshold
      ? (BANDS.find((b) => want >= b.from && want <= b.to)?.id ?? null)
      : null;
    if (r.band === wantBand) bandRight++;
  }

  eq("every total is the sum of the four items", totalsRight, 256);
  eq("the published threshold is headache >= 1 AND total >= 3", thresholdRight, 256);
  eq("the band is only assigned once the threshold is met", bandRight, 256);

  /* The band boundaries, named rather than left to the loop above. */
  const at = (h: LikertScore, g: LikertScore, f: LikertScore, d: LikertScore) =>
    scoreLakeLouise(form(h, g, f, d, { allFlagsNo: true }));
  eq("3 is the bottom of mild", at(3, 0, 0, 0).band, "mild");
  eq("5 is the top of mild", at(2, 1, 1, 1).band, "mild");
  eq("6 is the bottom of moderate", at(3, 1, 1, 1).band, "moderate");
  eq("9 is the top of moderate", at(3, 3, 2, 1).band, "moderate");
  eq("10 is the bottom of severe", at(3, 3, 3, 1).band, "severe");
  eq("12 is the top of severe", at(3, 3, 3, 3).band, "severe");

  /* THE HALF OF THE THRESHOLD THAT IS EASIEST TO LOSE IN A REFACTOR. */
  const noHeadache = at(0, 3, 3, 3);
  eq("a total of 9 with no headache does NOT meet the threshold", noHeadache.thresholdReached, false);
  eq("... and gets no band", noHeadache.band, null);
  eq("... and is not told to stop ascending", noHeadache.escalation, "tell-someone");
  check(
    "... and the wording says exactly why, naming the missing headache",
    noHeadache.scoreReading.includes("you recorded no headache"),
  );

  /* ---------------------------------------------------------------------- */
  testCase("2 — Sleep is not on this form, and the functional score is never added");

  eq("there are exactly four scored items", LAKE_LOUISE_ITEMS.length, 4);
  check(
    "none of them is a sleep question (the 2018 revision removed it)",
    !LAKE_LOUISE_ITEMS.some((id) =>
      `${LAKE_LOUISE_QUESTIONS[id].question} ${LAKE_LOUISE_QUESTIONS[id].options.join(" ")}`
        .toLowerCase()
        .includes("sleep"),
    ),
  );

  const zeroWithFunctional = scoreLakeLouise(
    form(0, 0, 0, 0, { functional: 2, allFlagsNo: true }),
  );
  eq("a functional score of 2 does not move the total", zeroWithFunctional.total, 0);
  eq("... and is reported separately", zeroWithFunctional.functional, 2);

  /* ---------------------------------------------------------------------- */
  testCase("3 — Unanswered is never read as zero");

  const blank = scoreLakeLouise(emptyAnswers());
  eq("an empty form has no total", blank.total, null);
  eq("... and names all four missing items", blank.missing.length, 4);
  eq("... and its escalation is 'incomplete'", blank.escalation, "incomplete");

  const severeHeadacheOnly = scoreLakeLouise(form(3, null, null, null));
  eq("a severe headache with three blanks still has NO total", severeHeadacheOnly.total, null);
  check(
    "... and the wording refuses to add up part of the form",
    severeHeadacheOnly.scoreReading.includes("will not add up part of this form"),
  );

  /* NO TOTAL IS NOT THE SAME AS NO INSTRUCTION, AND THIS PAIR IS WHY.
     This assertion used to read `escalation === "incomplete"` under the label
     "so it is not scored as a 3". The label was right and the assertion was
     wrong: "not scored as a 3" is a claim about `total`, which is checked
     directly above and still null. Binding it to the escalation as well
     conflated the two, and that conflation was the bug — a severe
     incapacitating headache with three blanks was handed the unfinished-form
     body, which told the athlete in as many words that "no answer given so far
     reaches the questionnaire's threshold". A headache of 3 IS a total of at
     least 3 with a headache of at least 1, whatever the blanks become, so that
     sentence was false and it was false in the reassuring direction. */
  eq(
    "... but a headache of 3 already meets the threshold whatever the blanks become",
    severeHeadacheOnly.escalation,
    "stop-ascending",
  );
  eq(
    "... in the SAME words as a finished form that meets it",
    severeHeadacheOnly.body,
    SAFETY_MESSAGES["altitude-ams"],
  );
  check(
    "... while still claiming no total",
    severeHeadacheOnly.total === null && severeHeadacheOnly.band === null,
  );
  check(
    "... and the old reassuring line is gone from it",
    !severeHeadacheOnly.body.includes("no answer given so far reaches"),
  );

  /* THE BOUNDARY, BOTH SIDES. A blank can only add, so the threshold is
     unavoidable exactly when the answers in hand already carry a headache >= 1
     and already sum to >= 3. */
  eq(
    "a headache of 1 with a dizziness of 2 and two blanks already meets it",
    scoreLakeLouise(form(1, null, null, 2)).escalation,
    "stop-ascending",
  );
  eq(
    "a headache of 1 with a dizziness of 1 and two blanks does NOT yet",
    scoreLakeLouise(form(1, null, null, 1)).escalation,
    "incomplete",
  );
  eq(
    "no headache with three points elsewhere does not meet it either",
    scoreLakeLouise(form(0, 3, null, null)).escalation,
    "incomplete",
  );

  /* THE ASYMMETRY IS DELIBERATE: escalate on a partial form, never clear on
     one. A partial form that cannot yet reach the threshold must not be told
     it is below it, and must never be told it is in the clear. */
  const lowPartial = scoreLakeLouise(form(1, null, null, 1));
  check(
    "a low partial form is not told it is below the threshold as a finding",
    lowPartial.body.includes("not about how it ends"),
  );
  const headacheZeroPartial = scoreLakeLouise(form(0, 3, null, null));
  check(
    "a form whose headache rules the threshold out says so, and calls it not a clearance",
    headacheZeroPartial.body.includes("not a clearance"),
  );
  check(
    "... and still says going down is available",
    headacheZeroPartial.descent === DESCENT_IS_ALWAYS_AVAILABLE,
  );

  /* EXHAUSTIVE: no partial form anywhere may carry the false sentence. */
  {
    const opts: (LikertScore | null)[] = [null, 0, 1, 2, 3];
    let partials = 0;
    let unavoidable = 0;
    let falseClaim = 0;
    let totalLeak = 0;
    for (const h of opts)
      for (const g of opts)
        for (const f of opts)
          for (const d of opts) {
            const vals = [h, g, f, d];
            if (!vals.some((v) => v === null)) continue;
            partials++;
            const r = scoreLakeLouise(form(h, g, f, d));
            if (r.total !== null) totalLeak++;
            const sum = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
            const mustMeet = h !== null && h >= 1 && sum >= 3;
            if (mustMeet) {
              unavoidable++;
              if (r.escalation !== "stop-ascending") falseClaim++;
              if (r.body !== SAFETY_MESSAGES["altitude-ams"]) falseClaim++;
            }
            if (r.body.includes("no answer given so far reaches")) falseClaim++;
          }
    check(`every one of ${partials} partial forms still refuses a total`, totalLeak === 0);
    check(
      `all ${unavoidable} partial forms that already meet the threshold escalate, none carries the old line`,
      falseClaim === 0 && unavoidable === 160,
    );
  }

  eq(
    "an unanswered red flag is not a 'no'",
    scoreLakeLouise(form(0, 0, 0, 0)).redFlagsAnswered,
    false,
  );
  eq(
    "... and an explicitly answered set says so",
    scoreLakeLouise(form(0, 0, 0, 0, { allFlagsNo: true })).redFlagsAnswered,
    true,
  );

  /* ---------------------------------------------------------------------- */
  testCase("4 — A red flag wins from every possible form. 7,680 of them.");

  let forms = 0;
  let redFlagAlwaysDescends = 0;
  let severeBodyIdentical = 0;
  let amsBodyIdentical = 0;
  let amsCorrect = 0;
  let functionalThreeDescends = 0;
  let descentLineAlways = 0;
  let diagnosisFree = 0;
  let disclaimerAlways = 0;

  const FORBIDDEN = [
    /\byou have (?:acute mountain sickness|ams|altitude sickness)\b/i,
    /\byou are suffering\b/i,
    /\byou(?:'| a)?re? diagnosed\b/i,
    /\bdiagnosed with\b/i,
    /\bthis is ams\b/i,
    /\byou have altitude illness\b/i,
  ];

  const functionalValues: (LikertScore | null)[] = [null, 0, 1, 2, 3];
  const flagValues: (RedFlagId | null)[] = [null, ...RED_FLAG_ORDER];

  for (const base of allComplete()) {
    for (const fn of functionalValues) {
      for (const flag of flagValues) {
        const a: LakeLouiseAnswers = {
          items: { ...base.items },
          functional: fn,
          redFlags: { ...base.redFlags },
        };
        if (flag) a.redFlags[flag] = true;

        const r = scoreLakeLouise(a);
        forms++;

        if (flag !== null) {
          if (r.escalation === "descend-now") redFlagAlwaysDescends++;
          if (r.body === SAFETY_MESSAGES["altitude-severe"]) severeBodyIdentical++;
        } else if (fn === 3) {
          if (r.escalation === "descend-now") functionalThreeDescends++;
        } else if (r.thresholdReached && r.band !== "severe") {
          amsCorrect++;
          if (r.escalation === "stop-ascending") amsBodyIdentical++;
          if (r.body === SAFETY_MESSAGES["altitude-ams"]) amsBodyIdentical++;
        }

        if (r.descent === DESCENT_IS_ALWAYS_AVAILABLE) descentLineAlways++;
        if (r.disclaimer === SAFETY_DISCLAIMER) disclaimerAlways++;

        const prose = `${r.body} ${r.scoreReading} ${r.notADiagnosis} ${r.descent} ${r.moment} ${summariseCheck(r)}`;
        if (!FORBIDDEN.some((re) => re.test(prose))) diagnosisFree++;
      }
    }
  }

  eq("forms exercised", forms, 256 * 5 * 6);
  eq("a red flag always escalates to descend-now", redFlagAlwaysDescends, 256 * 5 * 5);
  eq(
    "... with the severe body byte-identical to coach/safety.ts",
    severeBodyIdentical,
    256 * 5 * 5,
  );
  eq("a functional score of 3 escalates to descend-now", functionalThreeDescends, 256);
  eq(
    "every sub-severe threshold form gets the AMS card, byte-identical",
    amsBodyIdentical,
    amsCorrect * 2,
  );
  eq("the descent line is on EVERY result", descentLineAlways, forms);
  eq("the safety disclaimer is on EVERY result", disclaimerAlways, forms);
  eq("no result anywhere in the corpus makes a diagnosis", diagnosisFree, forms);

  /* AND THE RED FLAG BEATS AN UNFINISHED FORM, which is the case an athlete
     actually hits: they tick "unsteady" and never reach the questions. */
  const flaggedBlank = scoreLakeLouise(form(null, null, null, null, { flag: "ataxia" }));
  eq("an untouched form with one red flag still descends", flaggedBlank.escalation, "descend-now");
  eq("... with no total invented", flaggedBlank.total, null);
  eq(
    "... and the descent card verbatim",
    flaggedBlank.body,
    SAFETY_MESSAGES["altitude-severe"],
  );

  /* ---------------------------------------------------------------------- */
  testCase("5 — The two escalating bodies are the safety layer's, not a third voice");

  const severe = scoreLakeLouise(form(3, 3, 3, 1, { allFlagsNo: true }));
  eq("a severe total routes to the severe card", severe.body, SAFETY_MESSAGES["altitude-severe"]);
  check(
    "... which carries the unconditional descent instruction",
    severe.body.includes("Descend immediately") && severe.body.includes("not in the morning"),
  );

  const ams = scoreLakeLouise(form(2, 1, 1, 0, { allFlagsNo: true }));
  eq("a mild/moderate threshold routes to the AMS card", ams.body, SAFETY_MESSAGES["altitude-ams"]);
  check(
    "... which carries 'gain no more height, including sleeping height'",
    ams.body.includes("gain no more height, including sleeping height"),
  );

  /* ---------------------------------------------------------------------- */
  testCase("6 — Nothing can be withheld: no tier, no connectivity, one argument");

  eq("scoreLakeLouise takes exactly one argument", scoreLakeLouise.length, 1);

  const strings = [
    NOT_A_DIAGNOSIS,
    DESCENT_IS_ALWAYS_AVAILABLE,
    A_SCORE_IS_A_MOMENT,
    FUNCTIONAL_QUESTION,
    ...FUNCTIONAL_OPTIONS,
    ...Object.values(RED_FLAG_QUESTIONS),
    ...Object.values(ESCALATION_HEADING),
    ...LAKE_LOUISE_ITEMS.flatMap((id) => [
      LAKE_LOUISE_QUESTIONS[id].question,
      ...LAKE_LOUISE_QUESTIONS[id].options,
    ]),
  ];

  /* THE LOOKBEHIND IS LOAD-BEARING, not a convenience. The descent line's whole
     job is to say the advice needs "no subscription", so a naive scan for the
     word flags the one string in the module that exists to rule selling out.
     What is forbidden is an OFFER, which is the word without a preceding "no". */
  const SELLING = /(?<!\bno )\b(upgrade|subscribe|subscription|pro plan|free trial|unlock)\b/i;
  const offenders = strings.filter((s) => SELLING.test(s));
  check(
    "no string on this form sells anything",
    offenders.length === 0,
    offenders.join(" | ").slice(0, 120),
  );
  check(
    "the descent line says so in as many words",
    DESCENT_IS_ALWAYS_AVAILABLE.includes("no subscription and no signal"),
  );
  /* And the scan is not toothless: a planted offer must still be caught. */
  check(
    "the scan would catch a real offer if one were added",
    SELLING.test("Upgrade to see your full score"),
  );

  /* Purity: a thousand calls, one answer. */
  const a = form(2, 1, 0, 0, { allFlagsNo: true });
  const first = JSON.stringify(scoreLakeLouise(a));
  let stable = 0;
  for (let i = 0; i < 1000; i++) if (JSON.stringify(scoreLakeLouise(a)) === first) stable++;
  eq("1,000 calls, identical output", stable, 1000);

  /* ---------------------------------------------------------------------- */
  testCase("7 — Stored answers are narrowed, never coerced");

  const junk = asAnswers({ items: { headache: "3", fatigue: 9 }, functional: true, redFlags: { ataxia: "yes" } });
  eq("a string '3' is not a 3", junk.items.headache, null);
  eq("an out-of-range 9 is not a score", junk.items.fatigue, null);
  eq("a boolean functional is not a score", junk.functional, null);
  eq("a string red flag is not a yes", junk.redFlags.ataxia, null);
  eq("garbage input yields no total", scoreLakeLouise(junk).total, null);
  eq("null input yields an empty form", scoreLakeLouise(asAnswers(null)).escalation, "incomplete");

  /* A round trip through JSON, which is what the store actually does. */
  const round = asAnswers(JSON.parse(JSON.stringify(form(1, 2, 0, 0, { allFlagsNo: true }))));
  eq("a real form survives a JSON round trip", scoreLakeLouise(round).total, 3);

  /* ---------------------------------------------------------------------- */

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  \x1b[31m·\x1b[0m ${f}`));
    if (proc) proc.exitCode = 1;
  }
  console.log(
    "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that the screen renders what the scorer\n" +
      "returned, or that a person reads it. It proves the scorer cannot be made to\n" +
      "diagnose, cannot be made to withhold the descent card, and cannot drift away\n" +
      "from coach/safety.ts without this file going red.\x1b[0m",
  );
}

void run();
