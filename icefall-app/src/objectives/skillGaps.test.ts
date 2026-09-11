/**
 * TEST SET FOR SKILL GAPS, COURSE TYPES AND CERTIFICATES.
 *
 * `npm run test:skill-gaps` — esbuild to node, like every other suite here.
 *
 * WHAT IS BEING PROVED, and every one of these is a claim whose failure mode is
 * SILENT — the screen keeps rendering something tidy and wrong:
 *
 *   1. EVERY ONE OF THE FIFTEEN COMPETENCES HAS A COURSE TYPE. A skill with
 *      none renders as "no course type recorded", which reads as ICEFALL having
 *      nothing to say when in fact somebody forgot a line.
 *   2. NO COURSE TYPE CARRIES A PROVIDER, A PRICE OR A DURATION. Checked
 *      structurally: there is not one digit anywhere in the catalogue, so a
 *      "typically 3 days" or a "€450" cannot be added without failing here.
 *   3. AN UNREVIEWED OBJECTIVE PRODUCES NO REQUIRED LINE. Every one of the
 *      fourteen curated mountains is unreviewed today, so this is the path
 *      everybody sees, and ICEFALL must not mark its own band list as required.
 *   4. A CERTIFICATE DOES NOT TICK THE BOX, and never reads as verified.
 *   5. COURSES DE-DUPLICATE, so two gaps that one course closes are one thing
 *      to book rather than two.
 *   6. THE STORE REFUSES A HALF-FILLED CERTIFICATE rather than filing a blank
 *      awarding body on a document somebody may hand to a guide.
 *
 * WHAT THIS FILE DOES NOT PROVE. That the screens render any of it. Those are
 * call sites, verified by reading them.
 */
import { assessPeak } from "@/services/peakAssessment";
import {
  COURSE_TYPES,
  NO_LISTINGS_NOTICE,
  courseTypeFor,
  skillsWithoutCourseType,
} from "@/objectives/courses";
import {
  ATHLETE_SKILLS,
  SKILL_LABEL,
  type AthleteSkillId,
  type ObjectiveRequirementSet,
  type RequirementSource,
  type StructuredRequirement,
} from "@/objectives/requirements";
import { coursesForGaps, gapsWithoutCourse, skillGapsFor } from "@/objectives/skillGaps";
import { requirementSetFor } from "@/data/mock/mountainRequirements";
import { MOUNTAINS } from "@/data/mock/mountains";
import {
  CERTIFICATE_PROVENANCE,
  addCertificate,
  clearCertificates,
  currentCertificates,
  forgetCertificate,
  readableSize,
  type SkillCertificate,
} from "@/passport/certificates";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

const SOURCE: RequirementSource = {
  kind: "guide-review",
  detail: "Test fixture — not a real review",
};

function skillReq(
  id: string,
  skillId: AthleteSkillId,
  necessity: "required" | "recommended",
): StructuredRequirement {
  return {
    id,
    kind: "skill",
    unit: "skill",
    skillId,
    label: SKILL_LABEL[skillId],
    necessity,
    why: `Fixture reason for ${skillId}.`,
    source: SOURCE,
  };
}

/** A signed set. The tuple type is what forces two reviewers; this honours it. */
function reviewedSet(requirements: StructuredRequirement[]): ObjectiveRequirementSet {
  return {
    objectiveId: "fixture",
    objectiveName: "Fixture Peak",
    sourceText: { technical: [], experience: "", training: [] },
    requirements,
    review: {
      reviewed: true,
      reviewers: [
        { name: "A Guide", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "Fixture" },
        { name: "B Guide", certification: "IFMGA/UIAGM Mountain Guide", awardedBy: "Fixture" },
      ],
      reviewedOn: "2026-09-11",
      scope: "Fixture scope",
    },
  };
}

function main() {
  clearCertificates();

  /* ------------------------------------------------------------------------ */
  /* 1. Coverage of the closed vocabulary                                      */
  /* ------------------------------------------------------------------------ */

  const uncovered = skillsWithoutCourseType();
  ok(uncovered.length === 0, `competences with no course type: ${uncovered.join(", ")}`);

  const covered = COURSE_TYPES.flatMap((c) => c.covers);
  ok(new Set(covered).size === covered.length, "a competence is covered by two course types");
  ok(
    covered.every((id) => ATHLETE_SKILLS.some((s) => s.id === id)),
    "a course type covers a competence outside the fifteen",
  );
  ok(covered.length === ATHLETE_SKILLS.length, "the course types do not cover all fifteen exactly");
  ok(
    new Set(COURSE_TYPES.map((c) => c.id)).size === COURSE_TYPES.length,
    "two course types share an id",
  );

  /* ------------------------------------------------------------------------ */
  /* 2. No provider, no price, no duration — checked structurally              */
  /* ------------------------------------------------------------------------ */

  for (const c of COURSE_TYPES) {
    const prose = `${c.name} ${c.what} ${c.taughtBy}`;
    ok(!/\d/.test(prose), `${c.id} contains a digit — a price, a duration or a date crept in`);
    ok(!/[€$£]/.test(prose), `${c.id} contains a currency symbol`);
    ok(c.what.length > 40, `${c.id} does not say what the course covers`);
    ok(
      /guide|instructor|provider|doctor/i.test(c.taughtBy),
      `${c.id} does not say who is qualified to teach it`,
    );
  }
  ok(
    NO_LISTINGS_NOTICE.includes("does not list courses"),
    "the empty state does not say ICEFALL lists no courses",
  );

  /* ------------------------------------------------------------------------ */
  /* 3. The unreviewed path — which is every mountain, today                   */
  /* ------------------------------------------------------------------------ */

  const montBlanc = MOUNTAINS.find((m) => m.id === "mont-blanc");
  ok(montBlanc !== undefined, "the fixture mountain is missing from the catalogue");

  const assessment = assessPeak(montBlanc?.elevationM ?? 4808, 0);
  const unreviewed = skillGapsFor({
    objectiveName: montBlanc?.name ?? "Mont Blanc",
    set: requirementSetFor(montBlanc),
    classSkills: assessment.skills,
    classLabel: assessment.label,
    reportedSkillLabels: [],
    certificates: [],
  });

  ok(unreviewed.demandSource === "icefall-class", "an unreviewed mountain read as guide-reviewed");
  ok(unreviewed.attribution === null, "an unreviewed set produced an attribution");
  ok(
    unreviewed.lines.every((l) => l.necessity === "icefall-list"),
    "ICEFALL's own band list was marked required or recommended by nobody",
  );
  ok(unreviewed.priority.length === 0, "an unreviewed objective produced priority lines");
  ok(
    unreviewed.lines.every((l) => l.why === undefined && l.source === undefined),
    "a band-list line carries a guide's reason it never had",
  );
  ok(
    unreviewed.sourceNote.includes("No certified guide has reviewed"),
    "the band-list note does not say no guide reviewed it",
  );
  ok(
    unreviewed.sourceNote.includes("class of objective"),
    "the band-list note does not say the list is about a class rather than this mountain",
  );
  ok(unreviewed.lines.length === assessment.skills.length, "the band list was not used verbatim");
  ok(
    unreviewed.gaps.length === unreviewed.lines.length,
    "an athlete reporting nothing has no gaps",
  );
  ok(unreviewed.emptyNote === null, "a populated list carried the empty note");

  /* A reported competence stops being a gap. */
  const partly = skillGapsFor({
    objectiveName: "Mont Blanc",
    set: requirementSetFor(montBlanc),
    classSkills: assessment.skills,
    classLabel: assessment.label,
    reportedSkillLabels: [assessment.skills[0]],
    certificates: [],
  });
  ok(partly.gaps.length === unreviewed.gaps.length - 1, "a reported competence stayed a gap");
  ok(partly.lines[0].status === "reported", "a reported competence is not marked reported");
  ok(
    partly.lines[0].note.includes("your own claim"),
    "a reported competence does not stay labelled self-reported",
  );

  /* An objective with no list at all says so rather than reading as "nothing
     required". */
  const nothing = skillGapsFor({
    objectiveName: "Unlisted Hill",
    set: undefined,
    classSkills: [],
    classLabel: "Hill walking",
    reportedSkillLabels: [],
    certificates: [],
  });
  ok(nothing.emptyNote !== null, "an objective with no competence list produced no note");
  ok(
    nothing.emptyNote?.includes("not the same as it asking for none") === true,
    "the empty note reads as 'this objective asks for nothing'",
  );

  /* ------------------------------------------------------------------------ */
  /* 4. The reviewed path                                                      */
  /* ------------------------------------------------------------------------ */

  const set = reviewedSet([
    skillReq("r1", "crevasse-rescue", "required"),
    skillReq("r2", "roped-glacier-travel", "required"),
    skillReq("r3", "navigation-poor-visibility", "recommended"),
  ]);

  const reviewed = skillGapsFor({
    objectiveName: "Fixture Peak",
    set,
    classSkills: assessment.skills,
    classLabel: assessment.label,
    reportedSkillLabels: ["Navigation in poor visibility"],
    certificates: [],
  });

  ok(reviewed.demandSource === "guide-reviewed", "a signed set did not read as guide-reviewed");
  ok(reviewed.attribution !== null, "a signed set produced no attribution");
  ok(reviewed.lines.length === 3, "the reviewed list was not taken from the requirement set");
  ok(reviewed.priority.length === 2, "the two required gaps were not marked priority");
  ok(
    reviewed.gaps.every((g) => g.why?.startsWith("Fixture reason") === true),
    "a reviewed line lost the guide's reason",
  );
  ok(
    reviewed.gaps.every((g) => g.source?.kind === "guide-review"),
    "a reviewed line lost its per-line provenance",
  );
  ok(
    reviewed.lines.find((l) => l.skillId === "navigation-poor-visibility")?.status === "reported",
    "a ticked competence on a reviewed set is not reported",
  );

  /* The word this module refuses to use. `compare.ts` never scores a skill
     `not-met`, so nothing here may call an athlete blocked by one. */
  const allProse = [
    reviewed.sourceNote,
    ...reviewed.lines.map((l) => `${l.note} ${l.courseNote}`),
  ].join(" ");
  ok(
    !/blocked|blocker|you cannot|not qualified/i.test(allProse),
    "a line calls the athlete blocked",
  );

  /* ------------------------------------------------------------------------ */
  /* 5. Courses de-duplicate                                                   */
  /* ------------------------------------------------------------------------ */

  const suggestions = coursesForGaps(reviewed);
  ok(
    suggestions.length === 1,
    `two gaps closed by one course produced ${suggestions.length} suggestions`,
  );
  ok(
    suggestions[0].course.id === "glacier-and-crevasse-rescue",
    "the glacier gaps did not map to the glacier course",
  );
  ok(suggestions[0].closes.length === 2, "the one course does not name both gaps it closes");
  ok(
    new Set(suggestions.map((s) => s.course.id)).size === suggestions.length,
    "a course type was suggested twice",
  );
  ok(gapsWithoutCourse(reviewed).length === 0, "a mapped competence was reported as unmapped");

  /* A band-list label outside the fifteen gets no course and says why. */
  const offRoster = skillGapsFor({
    objectiveName: "Fixture",
    set: undefined,
    classSkills: ["Judging a turnaround time"],
    classLabel: "Hill walking",
    reportedSkillLabels: [],
    certificates: [],
  });
  ok(
    offRoster.lines[0].course === null,
    "a competence outside the fifteen was given a course type",
  );
  ok(
    offRoster.lines[0].courseNote.includes("not one of the fifteen"),
    "an unmapped competence does not explain why it has no course",
  );
  ok(gapsWithoutCourse(offRoster).length === 1, "the unmapped gap was not surfaced separately");
  ok(coursesForGaps(offRoster).length === 0, "an unmapped gap invented a course");

  /* ------------------------------------------------------------------------ */
  /* 6. Certificates: recorded, never verified, never a tick                   */
  /* ------------------------------------------------------------------------ */

  ok(CERTIFICATE_PROVENANCE === "self-reported", "a certificate is provenanced as anything else");

  const cert = addCertificate({
    skillId: "crevasse-rescue",
    courseName: "  Crevasse rescue  ",
    awardedBy: "  A national association  ",
    completedOn: "2024-06-01",
    document: {
      fileName: "cert.pdf",
      mimeType: "application/pdf",
      sizeBytes: 240_000,
      chosenAt: "2026-09-11T10:00:00.000Z",
    },
  });
  ok(cert !== null, "a valid certificate was refused");
  ok(cert?.courseName === "Crevasse rescue", "the course name was not trimmed");
  ok(
    cert !== null && !("verified" in (cert as unknown as Record<string, unknown>)),
    "a certificate record carries a verified flag",
  );
  ok(
    cert?.document?.fileName === "cert.pdf" &&
      !("dataUrl" in (cert?.document as unknown as Record<string, unknown>)),
    "the certificate record stores the file's bytes",
  );

  const withCert = skillGapsFor({
    objectiveName: "Fixture Peak",
    set,
    classSkills: assessment.skills,
    classLabel: assessment.label,
    reportedSkillLabels: ["Navigation in poor visibility"],
    certificates: currentCertificates(),
  });
  const crev = withCert.lines.find((l) => l.skillId === "crevasse-rescue");
  ok(
    crev?.status === "certificate-only",
    "a certificate did not produce the certificate-only state",
  );
  ok(crev?.status !== "reported", "a certificate silently ticked the competence");
  ok(
    withCert.gaps.some((g) => g.skillId === "crevasse-rescue"),
    "a certificate closed the gap",
  );
  ok(
    crev?.note.includes("will not tick it for you") === true,
    "the certificate-only line does not say why it is not a tick",
  );
  ok(crev?.certificates.length === 1, "the line does not carry the certificate");
  ok(
    withCert.priority.some((p) => p.skillId === "crevasse-rescue"),
    "a required certificate-only competence dropped out of priority",
  );

  /* Refusals. */
  ok(
    addCertificate({
      skillId: "crevasse-rescue",
      courseName: "X",
      awardedBy: "   ",
      completedOn: "2024-06-01",
    }) === null,
    "a certificate with a blank awarding body was stored",
  );
  ok(
    addCertificate({
      skillId: "crevasse-rescue",
      courseName: "X",
      awardedBy: "Y",
      completedOn: "2024-02-31",
    }) === null,
    "31 February was accepted as a completion date",
  );
  ok(
    addCertificate({
      skillId: "not-a-skill" as AthleteSkillId,
      courseName: "X",
      awardedBy: "Y",
      completedOn: "2024-06-01",
    }) === null,
    "a certificate against an unknown competence was stored",
  );
  ok(currentCertificates().length === 1, "a refused certificate reached the store");

  forgetCertificate(cert?.id ?? "");
  ok(currentCertificates().length === 0, "deleting a certificate did not remove it");

  ok(readableSize(240_000) === "234 KB", `readableSize returned ${readableSize(240_000)}`);
  ok(readableSize(-1) === "unknown size", "a nonsense size was rendered as a number");

  /* Every course type is reachable from some competence — no orphan entries. */
  for (const c of COURSE_TYPES) {
    ok(
      c.covers.every((id) => courseTypeFor(id)?.id === c.id),
      `${c.id} is not the course found for its own competences`,
    );
  }

  clearCertificates();

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
