import { requirementSetFor } from "@/data/mock/mountainRequirements";
import { MOUNTAINS } from "@/data/mock/mountains";
import { compareRequirements, type AthleteFacts } from "@/objectives/compare";
import { REQUIREMENT_STATE_COPY } from "@/objectives/requirements";
import type {
  ObjectiveRequirementSet,
  RequirementReviewer,
  StructuredRequirement,
} from "@/objectives/requirements";
import {
  buildReadinessReport,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_MEANS,
  reportPlainText,
  type ReadinessReportInput,
} from "@/reports/readinessReport";

/**
 * THE SHAREABLE READINESS REPORT.
 *
 * `npm run test:readiness-report` — esbuild to node, like every other suite.
 *
 * WHAT IT IS GUARDING. Five claims, each of which is easy to break with an
 * improvement and expensive to be wrong about, because the reader of this page
 * is a commercial desk deciding whether somebody goes on a mountain:
 *
 *   1. "THERE IS NO SCORE." Suite 1 serialises the whole report and its plain
 *      text and fails on a percent sign, on an `n/m` ratio and on the phrase
 *      "readiness score". Phase 3 removed the number deliberately; a page like
 *      this is exactly where one grows back.
 *   2. "NOT CHECKED IS NOT A FAIL." Suite 3 asserts the third status is spelled
 *      out in its own words, that its explanation says in as many words that it
 *      is not a failure, and that it never shares wording with `not-met`.
 *   3. "MEASURED AND SELF-REPORTED ARE NOT MIXED." Suite 2 drives the same
 *      figure through both provenances and asserts it lands in a different
 *      section each time — and that summits and competences can only ever land
 *      in the self-reported one.
 *   4. "IT PRINTS WHAT compare.ts RETURNS." Suite 3 checks the lines are 1:1
 *      with `comparison.results` and that every `reason` is carried VERBATIM,
 *      because those sentences are written to stay true for a climber of
 *      twenty years with an empty feed, and a paraphrase loses that.
 *   5. "IT KNOWS HOW OLD IT IS." Suite 4 checks the generation stamp, the
 *      window, the session count and the age of the most recent session all
 *      reach the page, and that a report built on an empty feed says so rather
 *      than printing a confident blank.
 */

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* Fixtures — the only reviewed set in the codebase, and it is not shipped     */
/* -------------------------------------------------------------------------- */

const REVIEWERS: [RequirementReviewer, RequirementReviewer] = [
  { name: "Test Reviewer A", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "TEST" },
  { name: "Test Reviewer B", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "TEST" },
];

const FIXTURE_REQUIREMENTS: StructuredRequirement[] = [
  {
    id: "alt",
    kind: "altitude-reached",
    unit: "m",
    metres: 4000,
    label: "Been to 4,000 m",
    necessity: "required",
    why: "The route sleeps at 3,800 m.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "day",
    kind: "single-day-ascent",
    unit: "m",
    metres: 1200,
    label: "A 1,200 m day",
    necessity: "required",
    why: "Summit day is 1,150 m.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "skill-glacier",
    kind: "skill",
    unit: "skill",
    skillId: "roped-glacier-travel",
    label: "Roped glacier travel",
    necessity: "required",
    why: "The approach crosses a dry glacier.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "grade",
    kind: "technical-grade",
    unit: "grade",
    scale: "alpine-overall",
    grade: "AD",
    label: "AD overall",
    necessity: "required",
    why: "The ridge.",
    source: { kind: "guidebook", detail: "Test fixture guidebook" },
  },
];

const FIXTURE_SET: ObjectiveRequirementSet = {
  objectiveId: "fixture-peak",
  objectiveName: "Fixture Peak",
  routeName: "North ridge",
  sourceText: { technical: ["Prose."], experience: "Prose.", training: ["Prose."] },
  requirements: FIXTURE_REQUIREMENTS,
  review: {
    reviewed: true,
    reviewers: REVIEWERS,
    reviewedOn: "2026-09-11",
    scope: "North ridge, summer conditions",
  },
};

const EMPTY_FACTS: AthleteFacts = {
  reportedSkillLabels: [],
  highestAltitude: null,
  biggestDayAscentM: null,
  longestDayHours: null,
  weeklyAscentM: null,
  summits: [],
};

const GENERATED = new Date("2026-09-20T09:30:00.000Z");

function input(patch: Partial<ReadinessReportInput> = {}): ReadinessReportInput {
  return {
    athleteName: "A. Climber",
    objectiveName: "Fixture Peak",
    comparison: compareRequirements({
      set: FIXTURE_SET,
      objectiveId: "fixture-peak",
      objectiveName: "Fixture Peak",
      facts: EMPTY_FACTS,
    }),
    facts: EMPTY_FACTS,
    evidence: {
      recordedSessions: 0,
      windowLabel: "the last twelve weeks",
      firstSessionOn: null,
      latestSessionOn: null,
    },
    generatedAt: GENERATED,
    ...patch,
  };
}

const FULL_FACTS: AthleteFacts = {
  reportedSkillLabels: ["Roped glacier travel", "Crevasse rescue"],
  highestAltitude: { value: 4500, provenance: "recorded" },
  biggestDayAscentM: { value: 900, provenance: "recorded" },
  longestDayHours: { value: 7.5, provenance: "recorded" },
  weeklyAscentM: { value: 1800, provenance: "recorded" },
  summits: [{ name: "Gran Paradiso", elevationM: 4061, date: "2026-07-04" }],
};

function main() {
  /* ======================================================================== */
  /* Suite 1 — THERE IS NO SCORE                                              */
  /* ======================================================================== */

  {
    const cases = [
      input(),
      input({ facts: FULL_FACTS }),
      input({
        facts: FULL_FACTS,
        comparison: compareRequirements({
          set: FIXTURE_SET,
          objectiveId: "fixture-peak",
          objectiveName: "Fixture Peak",
          facts: FULL_FACTS,
        }),
        evidence: {
          recordedSessions: 41,
          windowLabel: "the last twelve weeks",
          firstSessionOn: "2026-07-01",
          latestSessionOn: "2026-09-14",
        },
      }),
      /* And the state every mountain in the app is actually in. */
      ...MOUNTAINS.slice(0, 3).map((m) =>
        input({
          objectiveName: m.name,
          comparison: compareRequirements({
            set: requirementSetFor(m),
            objectiveId: m.id,
            objectiveName: m.name,
            facts: FULL_FACTS,
          }),
          facts: FULL_FACTS,
        }),
      ),
    ];

    for (const c of cases) {
      const report = buildReadinessReport(c);
      const text = reportPlainText(report);
      const json = JSON.stringify(report);

      ok(!text.includes("%"), `${c.objectiveName}: a percentage reached the page`);
      ok(!json.includes("%"), `${c.objectiveName}: a percentage is in the report object`);
      /* A ratio is a score with a slash in it. "8 / 11 requirements" would be
         read as a mark exactly like a percentage, so it is barred too. */
      ok(
        !/\d\s*\/\s*\d/.test(text),
        `${c.objectiveName}: an n-of-m ratio reached the page`,
      );
      ok(
        !/readiness score|score of|out of \d/i.test(text),
        `${c.objectiveName}: the page named a score`,
      );
      /* Nothing medical, ever. `AthleteFacts` has no field that could carry it,
         and this is the belt on that brace. */
      ok(
        !/limitation|altitude illness|altitude sickness|injur|medication/i.test(text),
        `${c.objectiveName}: something medical reached a commercial document`,
      );
      /* And no clearance language. */
      ok(
        !/\bis ready\b|\bcleared\b|\bwe recommend\b/i.test(text),
        `${c.objectiveName}: the page vouched for the athlete`,
      );
      ok(
        text.includes("ICEFALL has not assessed this person"),
        `${c.objectiveName}: the standfirst did not reach the page`,
      );
      ok(
        text.startsWith("ICEFALL training record — A. Climber") ||
          text.startsWith(`ICEFALL training record — ${report.athleteName}`),
        `${c.objectiveName}: the page does not name who it is about`,
      );
    }
  }

  /* ======================================================================== */
  /* Suite 2 — MEASURED AND SELF-REPORTED ARE STRUCTURALLY APART              */
  /* ======================================================================== */

  {
    const recorded = buildReadinessReport(input({ facts: FULL_FACTS }));
    ok(
      recorded.measured.some((f) => f.label.startsWith("Highest altitude")),
      "a recorded altitude did not land in the measured section",
    );
    ok(
      !recorded.reported.some((f) => f.label.startsWith("Highest altitude")),
      "a recorded altitude also appeared as self-reported",
    );
    ok(
      recorded.measured.every((f) => f.provenance === "recorded"),
      "a self-reported figure is sitting in the measured section",
    );
    ok(
      recorded.reported.every((f) => f.provenance === "self-reported"),
      "a recorded figure is sitting in the self-reported section",
    );

    /* The SAME figure, told to ICEFALL rather than measured, changes section. */
    const claimed = buildReadinessReport(
      input({
        facts: { ...FULL_FACTS, highestAltitude: { value: 4500, provenance: "self-reported" } },
      }),
    );
    ok(
      claimed.reported.some((f) => f.label.startsWith("Highest altitude")),
      "a self-reported altitude did not land in the self-reported section",
    );
    ok(
      !claimed.measured.some((f) => f.label.startsWith("Highest altitude")),
      "a self-reported altitude reached the measured section",
    );

    /* Summits and competences can only ever be self-reported — they are pushed
       rather than routed, so no future edit can move them. */
    ok(
      recorded.reported.some((f) => f.label === "Summits marked in ICEFALL"),
      "marked summits left the self-reported section",
    );
    ok(
      recorded.reported.some((f) => f.label === "Competences claimed"),
      "claimed competences left the self-reported section",
    );
    const competences = recorded.reported.find((f) => f.label === "Competences claimed");
    ok(
      (competences?.note ?? "").includes("calls none of them verified"),
      "the competence line lost the sentence that stops a tick reading as a certificate",
    );
    ok(
      (competences?.note ?? "").includes("after a trip"),
      "the competence line does not tell an operator that post-trip ticks are in here too",
    );

    /* An empty section is a claim unless it carries its reason. */
    const empty = buildReadinessReport(input());
    ok(empty.measured.length === 0 && empty.measuredEmpty !== null, "an empty measured section said nothing");
    ok(
      (empty.measuredEmpty ?? "").includes("not about the person"),
      "the empty measured section reads as a verdict on the athlete",
    );
    ok(empty.reported.length === 0 && empty.reportedEmpty !== null, "an empty reported section said nothing");

    /* The headings are in the text, not implied by layout. */
    const text = reportPlainText(recorded);
    ok(text.includes("What ICEFALL recorded"), "the measured heading is missing from the text form");
    ok(
      text.includes("self-reported, not verified"),
      "the self-reported heading lost its label in the text form",
    );
  }

  /* ======================================================================== */
  /* Suite 3 — THE REQUIREMENT LINES, AND THE THIRD ANSWER                    */
  /* ======================================================================== */

  {
    const comparison = compareRequirements({
      set: FIXTURE_SET,
      objectiveId: "fixture-peak",
      objectiveName: "Fixture Peak",
      facts: FULL_FACTS,
    });
    const report = buildReadinessReport(input({ facts: FULL_FACTS, comparison }));

    /* 1:1 with compare.ts, in order, with the reason VERBATIM. */
    ok(
      report.requirements.lines.length === comparison.results.length,
      "the page dropped or added a requirement line",
    );
    comparison.results.forEach((r, i) => {
      const line = report.requirements.lines[i];
      ok(line.id === r.requirement.id, `line ${i}: out of order`);
      ok(line.reason === r.reason, `line ${i}: the reason was rewritten rather than printed`);
      ok(line.status === r.status, `line ${i}: the status changed on the way to the page`);
      ok(line.blocker === r.blocker, `line ${i}: the blocker flag changed`);
      ok(line.why === r.requirement.why, `line ${i}: the guide's reason was rewritten`);
      ok(line.source === r.requirement.source.detail, `line ${i}: the source was rewritten`);
    });

    /* The route the set was scoped to travels with it. */
    ok(report.routeName === "North ridge", "the page lost the route the review was scoped to");
    ok(
      (report.requirements.attribution ?? "").includes("Test Reviewer A"),
      "the page did not name who signed the requirements",
    );

    /* THE THIRD ANSWER. A grade is not measurable, and the page must make that
       unmistakable and unmistakably not a failure. */
    const grade = report.requirements.lines.find((l) => l.id === "grade");
    ok(grade?.status === "not-measurable", "the fixture grade line changed status");
    ok(
      (grade?.statusLabel ?? "").includes("NOT CHECKED"),
      "the unchecked status is not spelled out on the line",
    );
    ok(
      REPORT_STATUS_MEANS["not-measurable"].includes("not a fail"),
      "the legend no longer says that an unchecked line is not a failure",
    );
    ok(
      REPORT_STATUS_LABEL["not-measurable"] !== REPORT_STATUS_LABEL["not-met"],
      "the unchecked and the below-the-line answers share a label",
    );
    ok(
      report.requirements.notCheckedCount >= 1,
      "the page did not count the lines it could not check",
    );
    ok(
      report.requirements.legend.length === 3,
      "the three answers are not all explained on the page",
    );

    const text = reportPlainText(report);
    ok(
      text.includes("They are not failures"),
      "the plain-text page lost the notice that unchecked is not failed",
    );
    ok(
      text.includes(REPORT_STATUS_LABEL["not-measurable"]),
      "the unchecked label did not reach the plain-text page",
    );
    ok(text.includes("Test fixture guidebook"), "a requirement's source did not reach the page");

    /* A met line says what it is and is not. */
    const skill = report.requirements.lines.find((l) => l.id === "skill-glacier");
    ok(skill?.status === "met", "a reported competence was not counted as met");
    ok(
      (skill?.evidence?.provenance ?? "") === "self-reported",
      "a competence was evidenced as anything but self-reported",
    );
    ok(
      (skill?.reason ?? "").includes("Self-declared"),
      "the competence line lost compare.ts's own labelling",
    );

    /* A not-met line is about the record, not the person. */
    const day = report.requirements.lines.find((l) => l.id === "day");
    ok(day?.status === "not-met", "the fixture day line changed status");
    ok(
      (day?.reason ?? "").includes("not a statement about what you can do"),
      "the below-the-line reason lost the sentence that keeps it about the database",
    );
    ok(report.requirements.blockers.some((b) => b.id === "day"), "a required unmet line is not flagged");

    /* ---- The state every shipped mountain is actually in ------------------ */

    const real = MOUNTAINS[0];
    const shipped = buildReadinessReport(
      input({
        objectiveName: real.name,
        facts: FULL_FACTS,
        comparison: compareRequirements({
          set: requirementSetFor(real),
          objectiveId: real.id,
          objectiveName: real.name,
          facts: FULL_FACTS,
        }),
      }),
    );
    ok(shipped.requirements.state === "unreviewed", `${real.id}: unexpected requirement state`);
    ok(shipped.requirements.lines.length === 0, "an unreviewed set produced requirement lines");
    ok(shipped.requirements.legend.length === 0, "a legend was printed with nothing to explain");
    ok(
      shipped.requirements.note === REQUIREMENT_STATE_COPY.unreviewed,
      "the page did not print the app's own sentence for an unreviewed set",
    );
    ok(shipped.requirements.blockers.length === 0, "an unreviewed set produced blockers");
    ok(shipped.requirements.attribution === null, "an unreviewed set was attributed to somebody");
    const shippedText = reportPlainText(shipped);
    ok(
      shippedText.includes("No requirement was checked, so none is listed."),
      "the unreviewed page did not say that nothing was checked",
    );
    ok(
      shipped.provenance.lines.some((l) => l.includes("empty by design rather than by omission")),
      "the unreviewed page did not explain why the comparison section is empty",
    );
  }

  /* ======================================================================== */
  /* Suite 4 — A DOCUMENT THAT KNOWS HOW OLD IT IS                            */
  /* ======================================================================== */

  {
    const fresh = buildReadinessReport(
      input({
        facts: FULL_FACTS,
        evidence: {
          recordedSessions: 41,
          windowLabel: "the last twelve weeks",
          firstSessionOn: "2026-07-01",
          latestSessionOn: "2026-09-14",
        },
      }),
    );

    ok(fresh.provenance.generatedAt === GENERATED.toISOString(), "the page took its own clock");
    ok(fresh.provenance.recordedSessions === 41, "the session count did not reach the page");
    ok(fresh.provenance.daysSinceLatestSession === 6, `expected 6 days, got ${fresh.provenance.daysSinceLatestSession}`);

    const text = reportPlainText(fresh);
    ok(text.includes("2026-09-20 09:30 UTC"), "the generation stamp is not on the page");
    ok(text.includes("41 recorded sessions"), "the page does not say how much it is built from");
    ok(
      text.includes("2026-09-14, 6 days before this page was generated"),
      "the page does not say how old its most recent evidence is",
    );
    ok(text.includes("2026-07-01"), "the page does not say how far back its record goes");
    ok(
      text.includes("cannot update a copy of this page once it has left the app"),
      "the page does not warn that a forwarded copy goes stale",
    );
    /* No staleness VERDICT is computed — there is no measured threshold for
       one, so the page gives dates and lets the reader judge. */
    ok(
      !/\bstale\b|\bout of date\b|\bno longer valid\b/i.test(text),
      "the page reached a staleness verdict it has no basis for",
    );

    /* An empty feed says so rather than printing a confident blank. */
    const cold = buildReadinessReport(input());
    ok(cold.provenance.daysSinceLatestSession === null, "an absent session produced an age");
    const coldText = reportPlainText(cold);
    ok(
      coldText.includes("recorded no sessions"),
      "a page with no evidence did not say it has none",
    );
    ok(
      coldText.includes("no recorded session to date this record from"),
      "a page with no evidence claimed an age anyway",
    );

    /* A session recorded today reads as today, not as "0 days". */
    const sameDay = buildReadinessReport(
      input({
        evidence: {
          recordedSessions: 1,
          windowLabel: "the last twelve weeks",
          firstSessionOn: "2026-09-20",
          latestSessionOn: "2026-09-20",
        },
      }),
    );
    ok(
      reportPlainText(sameDay).includes("most recent recorded session is today"),
      "a session recorded today was described in days",
    );
    ok(
      reportPlainText(sameDay).includes("1 recorded session"),
      "the singular session count was pluralised",
    );
  }

  /* ======================================================================== */
  /* Suite 5 — the text form is the page, not a summary of it                 */
  /* ======================================================================== */

  {
    const report = buildReadinessReport(
      input({
        facts: FULL_FACTS,
        comparison: compareRequirements({
          set: FIXTURE_SET,
          objectiveId: "fixture-peak",
          objectiveName: "Fixture Peak",
          facts: FULL_FACTS,
        }),
      }),
    );
    const text = reportPlainText(report);

    /* Every figure on the page is in the text, with its value. */
    for (const f of [...report.measured, ...report.reported]) {
      ok(text.includes(f.label), `the text form dropped "${f.label}"`);
      ok(text.includes(f.value), `the text form dropped the value of "${f.label}"`);
      if (f.note) ok(text.includes(f.note), `the text form dropped the note on "${f.label}"`);
    }
    /* Every requirement line, with its own reason. */
    for (const l of report.requirements.lines) {
      ok(text.includes(l.label), `the text form dropped the requirement "${l.label}"`);
      ok(text.includes(l.reason), `the text form paraphrased the reason on "${l.label}"`);
    }
    /* Every provenance sentence. */
    for (const l of report.provenance.lines) {
      ok(text.includes(l), "the text form dropped a line about the page's own age");
    }
    ok(text.trim().endsWith(report.footer.trim()), "the footer is not the last thing on the page");
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
