/**
 * TEST SET FOR STRUCTURED OBJECTIVE REQUIREMENTS.
 *
 * `npm run test:objective-requirements` — esbuild to node, like every other
 * suite here. Nothing in `objectives/` touches the network, React or storage.
 *
 * WHAT IT IS ACTUALLY GUARDING. Four claims, each one the sort that is easy to
 * believe and expensive to be wrong about:
 *
 *   1. "NOTHING IS INVENTED." Suite 1 walks all fourteen curated mountains and
 *      fails if any of them has acquired a threshold without a named certified
 *      guide behind it. That is the single rule this whole design exists for,
 *      and it is the one a future edit is most likely to break by accident,
 *      because adding a plausible number is the obvious "improvement".
 *   2. "THE PROSE CROSSED OVER UNCHANGED." Suite 1 compares `sourceText`
 *      against the `Mountain` record character for character, so the migration
 *      cannot quietly become a paraphrase.
 *   3. "THE SKILL VOCABULARIES MATCH." Suite 2 reads `src/coach/answers.ts`
 *      off disk and compares its `SKILL_GROUPS` labels with `ATHLETE_SKILLS`.
 *      The profile stores LABELS; a copy edit on one side only would stop every
 *      skill requirement from ever being met, and would look like a tidy "not
 *      reported" rather than a bug.
 *   4. "AN UNREVIEWED SET CHANGES NOTHING." Suite 4 runs the readiness engine
 *      with and without the unreviewed sets that actually ship and compares the
 *      dimensions. If passing one moved a score, the gate leaked.
 *
 * Suites 3 and 5 exercise the comparison engine itself against a REVIEWED set
 * that exists only in this file. That set is a fixture, not data: it is how the
 * engine gets tested without a guide's signature being forged in the app.
 */
import { assessObjectiveReadiness, compareToRequirements } from "@/coach/mountainReadiness";
import { MOUNTAINS } from "@/data/mock/mountains";
import {
  REQUIREMENT_OBJECTIVE_IDS,
  requirementSetById,
  requirementSetFor,
} from "@/data/mock/mountainRequirements";
import {
  compareRequirements,
  reviewedSkillLabels,
  reviewedTrainingFigures,
  type AthleteFacts,
} from "@/objectives/compare";
import {
  ATHLETE_SKILLS,
  isUsable,
  requirementSetState,
  reviewAttribution,
  SKILL_LABEL,
  skillIdForLabel,
  validateRequirementSet,
  type ObjectiveRequirementSet,
  type RequirementReviewer,
  type StructuredRequirement,
} from "@/objectives/requirements";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* Fixture: the only reviewed set in the codebase, and it is not shipped      */
/* -------------------------------------------------------------------------- */

const REVIEWERS: [RequirementReviewer, RequirementReviewer] = [
  { name: "Test Reviewer A", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "TEST" },
  { name: "Test Reviewer B", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "TEST" },
];

const FIXTURE_REQUIREMENTS: StructuredRequirement[] = [
  {
    id: "skill-glacier",
    kind: "skill",
    unit: "skill",
    skillId: "roped-glacier-travel",
    label: "Roped glacier travel",
    necessity: "required",
    why: "The approach crosses a crevassed glacier.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "skill-crevasse",
    kind: "skill",
    unit: "skill",
    skillId: "crevasse-rescue",
    label: "Crevasse rescue",
    necessity: "required",
    why: "Nobody else is coming.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "alt",
    kind: "altitude-reached",
    unit: "m",
    metres: 4000,
    label: "Been at or above 4,000 m",
    necessity: "required",
    why: "The hut sits at 3,800 m.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "day-small",
    kind: "single-day-ascent",
    unit: "m",
    metres: 900,
    label: "A 900 m day",
    necessity: "recommended",
    why: "The walk-in alone.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "day-big",
    kind: "single-day-ascent",
    unit: "m",
    metres: 1300,
    label: "A 1,300 m day",
    necessity: "required",
    why: "Summit day from the hut.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "hours",
    kind: "single-day-duration",
    unit: "h",
    hours: 11,
    label: "Eleven hours on the move",
    necessity: "required",
    why: "Hut to summit and back.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "weekly",
    kind: "weekly-ascent",
    unit: "m-per-week",
    metres: 1500,
    label: "1,500 m of ascent a week",
    necessity: "recommended",
    why: "A build, not a spike.",
    source: { kind: "guide-review", detail: "Test fixture" },
  },
  {
    id: "summits",
    kind: "prior-summits",
    unit: "count",
    count: 2,
    atOrAboveM: 4000,
    label: "Two prior 4,000 m summits",
    necessity: "required",
    why: "Route-finding at altitude is learned, not read.",
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
    source: { kind: "guidebook", detail: "Test fixture" },
  },
  {
    id: "cert",
    kind: "certification",
    unit: "none",
    certification: "Glacier travel and crevasse rescue course",
    label: "A crevasse rescue course",
    necessity: "recommended",
    why: "Instruction beats reading.",
    source: { kind: "operator-listing", detail: "Test fixture" },
  },
];

const FIXTURE: ObjectiveRequirementSet = {
  objectiveId: "fixture-peak",
  objectiveName: "Fixture Peak",
  sourceText: { technical: ["Prose."], experience: "Prose.", training: ["Prose."] },
  requirements: FIXTURE_REQUIREMENTS,
  review: { reviewed: true, reviewers: REVIEWERS, reviewedOn: "2026-09-11", scope: "Normal route, summer" },
};

const EMPTY_FACTS: AthleteFacts = {
  reportedSkillLabels: [],
  highestAltitude: null,
  biggestDayAscentM: null,
  longestDayHours: null,
  weeklyAscentM: null,
  summits: [],
};

function main() {
  /* ======================================================================== */
  /* Suite 1 — the fourteen ship empty and unreviewed                         */
  /* ======================================================================== */

  ok(
    REQUIREMENT_OBJECTIVE_IDS.length === MOUNTAINS.length,
    `${REQUIREMENT_OBJECTIVE_IDS.length} requirement records against ${MOUNTAINS.length} curated mountains`,
  );

  for (const mountain of MOUNTAINS) {
    const set = requirementSetFor(mountain);
    ok(set !== undefined, `${mountain.id}: no requirement record at all`);
    if (!set) continue;

    // The rule. A threshold in the app with no named guide behind it is the
    // one outcome this whole design exists to prevent.
    ok(
      set.review.reviewed === false,
      `${mountain.id}: marked reviewed — a real review needs named guides in the record and this test updating`,
    );
    ok(
      set.requirements.length === 0,
      `${mountain.id}: ${set.requirements.length} structured requirement(s) shipped without a guide review`,
    );
    ok(requirementSetState(set) === "unreviewed", `${mountain.id}: unexpected set state`);
    ok(isUsable(set) === false, `${mountain.id}: an unreviewed set reported itself usable`);
    ok(reviewAttribution(set) === null, `${mountain.id}: an unreviewed set produced an attribution`);
    ok(validateRequirementSet(set).length === 0, `${mountain.id}: ${validateRequirementSet(set).join("; ")}`);

    // The migration, character for character.
    ok(
      JSON.stringify(set.sourceText.technical) === JSON.stringify(mountain.technicalRequirements),
      `${mountain.id}: technical prose was altered in migration`,
    );
    ok(
      set.sourceText.experience === mountain.requiredExperience,
      `${mountain.id}: experience prose was altered in migration`,
    );
    ok(
      JSON.stringify(set.sourceText.training) === JSON.stringify(mountain.trainingRequirements),
      `${mountain.id}: training prose was altered in migration`,
    );

    ok(requirementSetById(mountain.id)?.objectiveId === mountain.id, `${mountain.id}: id lookup failed`);
  }

  for (const id of REQUIREMENT_OBJECTIVE_IDS) {
    ok(
      MOUNTAINS.some((m) => m.id === id),
      `requirement record "${id}" names no curated mountain`,
    );
  }

  ok(requirementSetById("not-a-mountain") === undefined, "an unknown id produced a set");
  ok(requirementSetFor(undefined) === undefined, "an absent mountain produced a set");

  /* ======================================================================== */
  /* Suite 2 — the skill vocabularies have not drifted                        */
  /* ======================================================================== */

  const answersSrc = readFileSync(resolve(process.cwd(), "src/coach/answers.ts"), "utf8");
  // Bounded at the array's own closing bracket, not at the next export: the
  // doc comment on ALTITUDE_BANDS quotes an answer option in double quotes, and
  // a slice that reached it would count that quote as a competence.
  const groupsStart = answersSrc.indexOf("export const SKILL_GROUPS");
  const groupsBlock = answersSrc.slice(
    groupsStart,
    answersSrc.indexOf("\n];", groupsStart),
  );
  ok(groupsBlock.length > 0, "could not find SKILL_GROUPS in src/coach/answers.ts");

  const quoted = [...groupsBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // The block also holds group titles; the skills are everything that is not a
  // title, and the titles are the strings that appear on a `title:` line.
  const titles = new Set(
    [...groupsBlock.matchAll(/title:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  const offered = quoted.filter((q) => !titles.has(q));

  const ours = ATHLETE_SKILLS.map((s) => s.label);
  ok(
    offered.length === ours.length,
    `answers.ts offers ${offered.length} competences, requirements.ts knows ${ours.length}`,
  );
  for (const label of offered) {
    ok(
      skillIdForLabel(label) !== undefined,
      `"${label}" is offered in onboarding but has no id in requirements.ts — skill requirements naming it could never be met`,
    );
  }
  for (const label of ours) {
    ok(offered.includes(label), `"${label}" is known to requirements.ts but is not offered in onboarding`);
  }
  ok(new Set(ATHLETE_SKILLS.map((s) => s.id)).size === ATHLETE_SKILLS.length, "duplicate skill id");
  ok(Object.keys(SKILL_LABEL).length === ATHLETE_SKILLS.length, "SKILL_LABEL lost an entry");
  ok(skillIdForLabel("Grade I-II scrambling") === "scrambling-i-ii", "a hyphen for an en dash broke the match");
  ok(skillIdForLabel("Something nobody offers") === undefined, "an unknown label matched a skill");

  /* ======================================================================== */
  /* Suite 3 — the gate: an unusable set produces no comparison               */
  /* ======================================================================== */

  for (const [label, set] of [
    ["missing", undefined],
    ["unreviewed", requirementSetById("matterhorn")],
    [
      "empty",
      {
        ...FIXTURE,
        requirements: [],
      } as ObjectiveRequirementSet,
    ],
  ] as const) {
    const c = compareRequirements({
      set,
      objectiveId: "x",
      objectiveName: "X",
      facts: EMPTY_FACTS,
    });
    ok(c.state === label, `${label}: state came back as "${c.state}"`);
    ok(c.results.length === 0, `${label}: produced ${c.results.length} results from an unusable set`);
    ok(c.blockers.length === 0, `${label}: produced blockers from an unusable set`);
    ok(c.attribution === null, `${label}: produced an attribution from an unusable set`);
    ok(
      c.counts.met === 0 && c.counts.notMet === 0 && c.counts.notMeasurable === 0,
      `${label}: produced counts from an unusable set`,
    );
    ok(c.note.length > 0, `${label}: no sentence for the screen`);
    ok(
      !/compared against this mountain/i.test(c.note),
      `${label}: the note claims a comparison that did not happen`,
    );
  }

  ok(reviewedTrainingFigures(requirementSetById("everest")) === null, "an unreviewed set supplied figures");
  ok(reviewedSkillLabels(requirementSetById("everest")).length === 0, "an unreviewed set supplied skills");

  /* ======================================================================== */
  /* Suite 4 — the comparison itself, on the fixture                          */
  /* ======================================================================== */

  /* 4a. An athlete ICEFALL has never seen: nothing may be held against them. */
  const blank = compareRequirements({
    set: FIXTURE,
    objectiveId: FIXTURE.objectiveId,
    objectiveName: FIXTURE.objectiveName,
    facts: EMPTY_FACTS,
  });
  ok(blank.state === "usable", "the fixture did not read as usable");
  ok(blank.results.length === FIXTURE_REQUIREMENTS.length, "a requirement was dropped");
  ok(blank.counts.notMet === 0, `an empty history produced ${blank.counts.notMet} failures`);
  ok(blank.counts.met === 0, "an empty history met something");
  ok(blank.blockers.length === 0, "an empty history produced blockers");
  ok(blank.attribution !== null && blank.attribution.includes("Test Reviewer A"), "no attribution");

  /* 4b. Every reason must stay true for someone with twenty years and no app. */
  for (const r of blank.results) {
    ok(
      !/\byou (cannot|can't|are not able|lack)\b/i.test(r.reason),
      `${r.requirement.id}: the reason asserts an inability — "${r.reason}"`,
    );
  }

  /* 4c. A real, mixed history. */
  const facts: AthleteFacts = {
    reportedSkillLabels: ["Roped glacier travel", "Navigation in poor visibility"],
    highestAltitude: { value: 3800, provenance: "recorded" },
    biggestDayAscentM: { value: 1000, provenance: "recorded" },
    longestDayHours: { value: 12.5, provenance: "recorded" },
    weeklyAscentM: { value: 900, provenance: "recorded" },
    summits: [
      { name: "A", elevationM: 4100, date: "2025-07-01" },
      { name: "B", elevationM: 3200, date: "2025-08-01" },
    ],
  };
  const c = compareRequirements({
    set: FIXTURE,
    objectiveId: FIXTURE.objectiveId,
    objectiveName: FIXTURE.objectiveName,
    facts,
  });
  const by = (id: string) => c.results.find((r) => r.requirement.id === id);

  ok(by("skill-glacier")?.status === "met", "a reported skill was not met");
  ok(by("skill-crevasse")?.status === "not-measurable", "an unreported skill was not left open");
  // The rule from technicalDimension, restated: a skill is never a cross.
  ok(
    c.results.filter((r) => r.requirement.kind === "skill").every((r) => r.status !== "not-met"),
    "a skill came back as not-met",
  );

  // 4,100 m from a marked summit beats the 3,800 m recorded maximum.
  ok(by("alt")?.status === "met", "the best altitude across sources was not used");
  ok(by("alt")?.evidence?.provenance === "self-reported", "a marked summit was passed off as recorded");

  ok(by("day-small")?.status === "met", "a 1,000 m day did not clear 900 m");
  ok(by("day-big")?.status === "not-met", "a 1,000 m day cleared 1,300 m");
  ok(by("day-big")?.blocker === true, "an unmet required line was not a blocker");
  ok(by("day-small")?.blocker === false, "an unmet recommended line became a blocker");
  ok(by("hours")?.status === "met", "12.5 h did not clear 11 h");
  ok(by("weekly")?.status === "not-met", "900 m a week cleared 1,500 m");
  ok(by("summits")?.status === "not-met", "one qualifying summit cleared a requirement for two");
  ok(/1 summit\b/.test(by("summits")?.reason ?? ""), "the summit count was not singular");

  // The two ICEFALL genuinely cannot see, whatever the athlete has done.
  ok(by("grade")?.status === "not-measurable", "a grade was judged");
  ok(by("cert")?.status === "not-measurable", "a certificate was judged");
  ok(/no record of the grades/i.test(by("grade")?.reason ?? ""), "the grade reason is not specific");

  // Two: the 1,300 m day and the two 4,000 m summits. NOT the AD grade, which
  // is `required` and unmet only in the sense that ICEFALL cannot see it — a
  // blocker is a line the athlete has been measured against and fallen short
  // of, never a line nobody has answered.
  ok(c.blockers.length === 2, `${c.blockers.length} blockers, expected 2`);
  ok(
    c.blockers.every((b) => b.status === "not-met"),
    "a not-measurable line was counted as a blocker",
  );
  ok(
    c.counts.met + c.counts.notMet + c.counts.notMeasurable === FIXTURE_REQUIREMENTS.length,
    "the counts do not add up to the requirements",
  );

  /* 4d. Figures a reviewed set hands to readiness: the hardest line stands. */
  const figures = reviewedTrainingFigures(FIXTURE);
  ok(figures?.dayAscentM === 1300, `day figure came back as ${figures?.dayAscentM}, expected the larger`);
  ok(figures?.sustainedHours === 11, "hours figure lost");
  ok(figures?.weeklyAscentM === 1500, "weekly figure lost");
  ok(reviewedSkillLabels(FIXTURE).length === 2, "the reviewed skill list is the wrong length");

  /* ======================================================================== */
  /* Suite 5 — readiness: an unreviewed set moves nothing                     */
  /* ======================================================================== */

  const matterhorn = MOUNTAINS.find((m) => m.id === "matterhorn");
  ok(matterhorn !== undefined, "the Matterhorn record has gone");
  if (matterhorn) {
    const peak = {
      name: matterhorn.name,
      elevationM: matterhorn.elevationM,
      lat: matterhorn.coords.lat,
      lon: matterhorn.coords.lon,
    };
    const shared = {
      peak,
      activities: [],
      summitsLogged: [{ name: "A", elevationM: 4100, date: "2025-07-01" }],
      selfReported: { technicalSkills: ["Crampon and ice-axe technique"], maxAltitudeM: 4500 },
      now: new Date("2026-09-11T09:00:00.000Z"),
    };

    const without = assessObjectiveReadiness(shared);
    const with_ = assessObjectiveReadiness({ ...shared, requirements: requirementSetFor(matterhorn) });

    ok(without.requirementBasis.state === "missing", "no set did not read as missing");
    ok(with_.requirementBasis.state === "unreviewed", "an unreviewed set did not read as unreviewed");
    ok(
      without.requirementBasis.source === "elevation-band" &&
        with_.requirementBasis.source === "elevation-band",
      "an unreviewed set switched the basis to reviewed requirements",
    );
    ok(with_.requirementBasis.attribution === null, "an unreviewed set produced an attribution");

    // The gate, proved: same scores either way.
    ok(
      JSON.stringify(without.dimensions.map((d) => d.score)) ===
        JSON.stringify(with_.dimensions.map((d) => d.score)),
      "passing an unreviewed set moved a score",
    );
    ok(
      JSON.stringify(without.overall) === JSON.stringify(with_.overall),
      "passing an unreviewed set moved the composite",
    );

    // But it does change what the app SAYS, which is the whole point.
    const tech = with_.dimensions.find((d) => d.id === "technical");
    ok(
      (tech?.summary ?? "").includes("has not compared you against them"),
      "the unreviewed caveat did not reach the technical summary",
    );
    ok(
      !/compared against this mountain's own reviewed/i.test(with_.requirementBasis.note),
      "an unreviewed objective claimed a comparison",
    );

    /* A reviewed set, on the other hand, must visibly take over. */
    const reviewed = assessObjectiveReadiness({
      ...shared,
      requirements: { ...FIXTURE, objectiveName: matterhorn.name },
    });
    ok(
      reviewed.requirementBasis.source === "reviewed-requirements",
      "a reviewed set did not switch the basis",
    );
    ok(
      (reviewed.requirementBasis.attribution ?? "").includes("Test Reviewer B"),
      "a reviewed set did not name its reviewers",
    );
    const rTech = reviewed.dimensions.find((d) => d.id === "technical");
    ok(
      (rTech?.summary ?? "").includes("certified guides list"),
      "the technical dimension did not credit the guides",
    );
    ok(
      !(rTech?.summary ?? "").includes("has not compared you against them"),
      "a reviewed objective still carried the unreviewed caveat",
    );
    ok(
      (rTech?.requirements ?? []).length === 2,
      `the technical dimension checked ${(rTech?.requirements ?? []).length} competences, expected the guides' 2`,
    );

    /* ---- Suite 6 — the adapter builds the same athlete ------------------- */

    // The line-by-line view must be built from the same evidence as the
    // dimensions, or two versions of the same person end up on one screen.
    const unreviewedView = compareToRequirements({
      requirements: requirementSetFor(matterhorn),
      objectiveId: matterhorn.id,
      objectiveName: matterhorn.name,
      activities: [],
      summitsLogged: shared.summitsLogged,
      selfReported: { technicalSkills: shared.selfReported.technicalSkills, maxAltitudeM: 4500 },
      now: shared.now,
    });
    ok(unreviewedView.state === "unreviewed", "the adapter did not gate on the review state");
    ok(unreviewedView.results.length === 0, "the adapter produced lines from an unreviewed set");

    const reviewedView = compareToRequirements({
      requirements: { ...FIXTURE, objectiveName: matterhorn.name },
      objectiveId: matterhorn.id,
      objectiveName: matterhorn.name,
      activities: [],
      summitsLogged: shared.summitsLogged,
      selfReported: { technicalSkills: shared.selfReported.technicalSkills, maxAltitudeM: 4500 },
      now: shared.now,
    });
    ok(reviewedView.results.length === FIXTURE_REQUIREMENTS.length, "the adapter dropped a line");
    // 4,500 m self-reported beats the 4,100 m marked summit, and nothing is
    // recorded, so the altitude line is met and labelled as an estimate.
    const alt = reviewedView.results.find((r) => r.requirement.id === "alt");
    ok(alt?.status === "met", "the adapter lost the self-reported altitude");
    ok(alt?.evidence?.provenance === "self-reported", "an estimate was passed off as recorded");
    // An empty feed must produce questions, not failures.
    ok(
      reviewedView.results.filter((r) => r.requirement.id.startsWith("day")).every(
        (r) => r.status === "not-measurable",
      ),
      "an empty activity feed produced a training failure",
    );
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
