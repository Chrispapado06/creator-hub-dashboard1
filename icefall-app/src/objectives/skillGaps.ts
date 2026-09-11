import { skillClaimed } from "@/coach/mountainReadiness";
import { COURSE_TYPES, courseTypeFor, type CourseType } from "@/objectives/courses";
import {
  SKILL_LABEL,
  requirementSetState,
  reviewAttribution,
  skillIdForLabel,
  type AthleteSkillId,
  type ObjectiveRequirementSet,
  type RequirementSource,
  type StructuredRequirement,
} from "@/objectives/requirements";
import { certificatesForSkill, type SkillCertificate } from "@/passport/certificates";

/**
 * SKILL GAPS — what this objective asks for, what you have told ICEFALL, and
 * what KIND of course teaches the difference.
 *
 * ============================================================================
 * THE WORD THIS MODULE REFUSES TO USE
 * ============================================================================
 *
 * "BLOCKED." Nothing here says an athlete is blocked from an objective by a
 * competence, and the reason is not delicacy — it is that the claim would be
 * false, and the engine next door already refuses to make it.
 *
 * `objectives/compare.ts` scores a skill requirement as `met` or
 * `not-measurable`, NEVER `not-met`, because not having reported crevasse
 * rescue is not evidence of being unable to do it. A `compareRequirements`
 * blocker is a `not-met` line, so a skill can never be one. If this module
 * called an unreported skill a blocker, the two would sit on the same screen
 * disagreeing about the same competence on the same day.
 *
 * So a line carries `necessity` — what the reviewing guides marked it — and
 * `status` — what ICEFALL has been told. The screen puts those two side by side
 * and the athlete draws the conclusion. That is the whole design.
 *
 * ============================================================================
 * WHERE THE LIST OF COMPETENCES COMES FROM, AND WHY IT IS LABELLED
 * ============================================================================
 *
 * TWO SOURCES, and which one is in use is `demandSource`, printed above the
 * list every time:
 *
 *   guide-reviewed   A signed requirement set named these competences for THIS
 *                    objective. Each line carries the guide's own `why` and its
 *                    own `source`, so the app can answer "who says so" about
 *                    the specific line.
 *   icefall-class    No guide has reviewed this objective, so the list is
 *                    `assessPeak`'s own for the class of mountain the elevation
 *                    puts it in. It is ICEFALL's list, about a BAND rather than
 *                    about this peak, and the note says exactly that.
 *
 * As of this build every one of the fourteen curated mountains is
 * `unreviewed` — see `data/mock/mountainRequirements.ts`, where that is the
 * finished state and not an oversight — so the second source is what everybody
 * actually sees. The first path is live code, tested, and waiting on the guides
 * the roadmap has yet to appoint.
 *
 * THE CLASS LIST IS THE SAME LIST `mountainReadiness.technicalDimension`
 * SCORES AGAINST, passed in by the caller rather than re-derived here, so the
 * readiness figure and this screen cannot name different competences.
 *
 * ============================================================================
 * A CERTIFICATE DOES NOT TICK THE BOX
 * ============================================================================
 *
 * `status` has THREE values and the middle one is the interesting one:
 *
 *   reported           the athlete ticked this competence in their profile
 *   certificate-only   they recorded a certificate against it but have NOT
 *                      ticked it
 *   not-reported       ICEFALL has been told nothing about it
 *
 * `certificate-only` does not silently become `reported`. Adding a certificate
 * is a record of a course; ticking a competence is a claim of present
 * competence, and they are not the same statement — a glacier course in 2014
 * is not a claim to be current on a glacier in 2026. The athlete makes that
 * claim themselves, in one tap, and ICEFALL does not make it for them.
 *
 * And the certificate is never "verified" — see `passport/certificates.ts` for
 * the long-form argument. Nothing checks it.
 *
 * ============================================================================
 * COURSES: THE KIND, NEVER THE PLACE
 * ============================================================================
 *
 * `course` is a `CourseType` from `objectives/courses.ts` — a generic course
 * name and what it covers. There is no provider, no price, no date and no
 * location anywhere in this feature, because ICEFALL holds none and inventing
 * one would put an athlete on the phone to a school that does not exist.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export type SkillDemandSource = "guide-reviewed" | "icefall-class";

export type SkillStatus = "reported" | "certificate-only" | "not-reported";

/**
 * `icefall-list` is a THIRD value beside the requirement type's two, and it
 * exists so that a class-derived line can never be presented as something a
 * guide marked required. Nobody signed the band list; it is ICEFALL's own.
 */
export type SkillNecessity = "required" | "recommended" | "icefall-list";

export interface SkillLine {
  /** Set when the demanded competence is one of the fifteen in the profile. */
  skillId?: AthleteSkillId;
  /** The competence as the athlete would read it. */
  label: string;
  status: SkillStatus;
  necessity: SkillNecessity;
  /** The reviewing guide's sentence. Only ever present on a reviewed line. */
  why?: string;
  /** Per-line provenance. Only ever present on a reviewed line. */
  source?: RequirementSource;
  /** The kind of course that teaches this, or null when none is mapped. */
  course: CourseType | null;
  /** Why there is no course type, when there is not. Empty string otherwise. */
  courseNote: string;
  /** The athlete's own certificates against this competence. Self-reported. */
  certificates: SkillCertificate[];
  /** The sentence the screen prints for this line. True in every status. */
  note: string;
}

export interface SkillGapReport {
  objectiveName: string;
  demandSource: SkillDemandSource;
  /** Where the list came from. Printed above the list, every time. */
  sourceNote: string;
  /** Who signed the set, when one is signed. Null otherwise. */
  attribution: string | null;
  /** Every competence the objective asks for, in the order the source gives. */
  lines: SkillLine[];
  /** Lines the athlete has not ticked. The gaps. */
  gaps: SkillLine[];
  /** Gaps the reviewing guides marked `required`. Empty unless reviewed. */
  priority: SkillLine[];
  /** Set when the objective asks for no competences at all. */
  emptyNote: string | null;
}

/* -------------------------------------------------------------------------- */
/* The engine                                                                 */
/* -------------------------------------------------------------------------- */

const NO_COURSE_TYPE_NOTE =
  "This is not one of the fifteen competences ICEFALL asks about in your profile, so there is no course type mapped to it. It is still something learned in person rather than from training volume.";

function statusNote(status: SkillStatus, necessity: SkillNecessity, label: string): string {
  const lower = label.toLowerCase();
  if (status === "reported") {
    return `You have told ICEFALL you hold this. It is your own claim — nothing here has been checked.`;
  }
  if (status === "certificate-only") {
    return `You have a certificate recorded against ${lower}, but you have not ticked the competence itself. ICEFALL will not tick it for you: a course you did is not the same statement as being current on it today.`;
  }
  return necessity === "required"
    ? `You have not told ICEFALL about ${lower}, and the guides who reviewed this objective marked it required. If you already hold it, tick it in your coaching profile; if you do not, this is the one to close first.`
    : `You have not told ICEFALL about ${lower}. That is not a mark against you — it only means the app has never been told. Tick it if you hold it.`;
}

function lineFor(args: {
  label: string;
  skillId?: AthleteSkillId;
  necessity: SkillNecessity;
  why?: string;
  source?: RequirementSource;
  reportedSkillLabels: string[];
  certificates: readonly SkillCertificate[];
}): SkillLine {
  const { label, skillId, necessity } = args;

  const certificates = skillId ? certificatesForSkill(args.certificates, skillId) : [];

  /* The closed vocabulary is used where both sides have one, and the
     containment test only where the demanded label came from the band list and
     may not be one of the fifteen. `requirements.ts` makes the argument:
     substring matching is the right tool when one side is free text and the
     wrong one once both sides are choosing from the same list. */
  const reported = skillId
    ? args.reportedSkillLabels.some((l) => skillIdForLabel(l) === skillId)
    : skillClaimed(label, args.reportedSkillLabels);

  const status: SkillStatus = reported
    ? "reported"
    : certificates.length > 0
      ? "certificate-only"
      : "not-reported";

  const course = skillId ? (courseTypeFor(skillId) ?? null) : null;

  const line: SkillLine = {
    label,
    status,
    necessity,
    course,
    courseNote: course ? "" : NO_COURSE_TYPE_NOTE,
    certificates,
    note: statusNote(status, necessity, label),
  };
  if (skillId) line.skillId = skillId;
  if (args.why) line.why = args.why;
  if (args.source) line.source = args.source;
  return line;
}

/**
 * The gap report for one objective.
 *
 * `classSkills` and `classLabel` are PASSED IN rather than derived, for the
 * same reason `compare.ts` takes `AthleteFacts` rather than reading app state:
 * the caller has already decided which assessment this screen is about, and a
 * second `assessPeak` call here could quietly disagree with the one the
 * readiness ring was drawn from.
 */
export function skillGapsFor(args: {
  objectiveName: string;
  set: ObjectiveRequirementSet | undefined | null;
  /** `assessPeak(...).skills` — ICEFALL's own list for the class of objective. */
  classSkills: readonly string[];
  /** `assessPeak(...).label` — e.g. "Glaciated alpine". Used in the note. */
  classLabel: string;
  reportedSkillLabels: string[];
  certificates: readonly SkillCertificate[];
}): SkillGapReport {
  const reviewed = requirementSetState(args.set) === "usable" && args.set;

  const lines: SkillLine[] = reviewed
    ? (args.set as ObjectiveRequirementSet).requirements
        .filter((r): r is Extract<StructuredRequirement, { kind: "skill" }> => r.kind === "skill")
        .map((r) =>
          lineFor({
            label: SKILL_LABEL[r.skillId] ?? r.skillId,
            skillId: r.skillId,
            necessity: r.necessity,
            why: r.why,
            source: r.source,
            reportedSkillLabels: args.reportedSkillLabels,
            certificates: args.certificates,
          }),
        )
    : args.classSkills.map((label) =>
        lineFor({
          label,
          skillId: skillIdForLabel(label),
          necessity: "icefall-list",
          reportedSkillLabels: args.reportedSkillLabels,
          certificates: args.certificates,
        }),
      );

  const attribution = reviewed ? reviewAttribution(args.set) : null;

  const sourceNote = reviewed
    ? `These competences were named for ${args.objectiveName} by the guides who reviewed it${attribution ? `, ${attribution}` : ""}. Each line carries their reason and where it came from.`
    : `No certified guide has reviewed ${args.objectiveName} yet, so this is ICEFALL's own list for ${args.classLabel.toLowerCase()} ground — about the class of objective rather than about this mountain. It is the same list your technical readiness is scored against, and nobody has marked any of it required.`;

  const gaps = lines.filter((l) => l.status !== "reported");

  return {
    objectiveName: args.objectiveName,
    demandSource: reviewed ? "guide-reviewed" : "icefall-class",
    sourceNote,
    attribution,
    lines,
    gaps,
    /* Only a reviewed line can be a priority. A band-list line is ICEFALL's own
       and nobody signed it, so promoting one would be the app marking its own
       homework as required. */
    priority: gaps.filter((l) => l.necessity === "required"),
    emptyNote:
      lines.length === 0
        ? `ICEFALL holds no list of competences for ${args.objectiveName}. That is not the same as it asking for none — it means nobody has written one down, and the honest place to find out is a guide who knows the route.`
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Courses, gathered                                                          */
/* -------------------------------------------------------------------------- */

export interface CourseSuggestion {
  course: CourseType;
  /** The gaps on THIS objective this one course would close, in list order. */
  closes: SkillLine[];
}

/**
 * The course types that would close this athlete's gaps, each listed once.
 *
 * DE-DUPLICATED ON PURPOSE. Roped glacier travel and crevasse rescue are two
 * gaps and one course; showing the same course twice would read as two things
 * to book and two amounts of money to spend. Ordered by how many gaps each
 * closes, then by the order the objective's own list put them in, so the course
 * that does the most work is first.
 *
 * `certificate-only` gaps are INCLUDED, because the athlete may well want to
 * refresh a competence they last trained years ago — but the line's own note
 * tells them the simpler answer is a tap in their profile.
 */
export function coursesForGaps(report: SkillGapReport): CourseSuggestion[] {
  const byId = new Map<string, CourseSuggestion>();

  for (const gap of report.gaps) {
    if (!gap.course) continue;
    const existing = byId.get(gap.course.id);
    if (existing) existing.closes.push(gap);
    else byId.set(gap.course.id, { course: gap.course, closes: [gap] });
  }

  const order = new Map(COURSE_TYPES.map((c, i) => [c.id, i]));
  return [...byId.values()].sort((a, b) =>
    b.closes.length - a.closes.length !== 0
      ? b.closes.length - a.closes.length
      : (order.get(a.course.id) ?? 0) - (order.get(b.course.id) ?? 0),
  );
}

/** Gaps with no course type mapped. Rendered separately, with their reason. */
export function gapsWithoutCourse(report: SkillGapReport): SkillLine[] {
  return report.gaps.filter((g) => g.course === null);
}
