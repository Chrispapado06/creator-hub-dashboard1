import { useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import { COURSE_SECTION_INTRO, NO_LISTINGS_NOTICE } from "@/objectives/courses";
import { SKILL_LABEL, skillIdForLabel } from "@/objectives/requirements";
import {
  coursesForGaps,
  gapsWithoutCourse,
  skillGapsFor,
  type SkillLine,
} from "@/objectives/skillGaps";
import { requirementSetFor } from "@/data/mock/mountainRequirements";
import { mountainById } from "@/data/mock/mountains";
import {
  CERTIFICATE_DOES_NOT_TICK,
  CERTIFICATE_NOTICE,
  CERTIFICATE_STORAGE_NOTICE,
  DOCUMENT_NOTICE,
  addCertificate,
  forgetCertificate,
  readableSize,
  useCertificates,
  type CertificateDocument,
} from "@/passport/certificates";
import { assessPeak } from "@/services/peakAssessment";
import { useTraining } from "@/tracking/training";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * SKILL GAPS — what this objective asks for, what you have told ICEFALL, and
 * what kind of course teaches the difference.
 *
 * ============================================================================
 * THREE THINGS THIS SCREEN WILL NOT DO
 * ============================================================================
 *
 *   1. IT WILL NOT SAY YOU ARE BLOCKED. `objectives/compare.ts` scores a skill
 *      as met or not-measurable and NEVER as not-met, because not having
 *      reported crevasse rescue is not evidence of being unable to do it. This
 *      screen shows what the objective asks and what ICEFALL has been told, side
 *      by side, and leaves the conclusion to the person who knows the answer.
 *   2. IT WILL NOT NAME A COURSE PROVIDER. ICEFALL holds no course catalogue —
 *      no schools, no dates, no prices, no partners. What it can honestly give
 *      is the generic NAME of the kind of course that teaches a competence, so
 *      the athlete knows what to search for, and `NO_LISTINGS_NOTICE` says
 *      plainly that the app is not the one telling them where to go.
 *   3. IT WILL NOT TICK A COMPETENCE FOR YOU, and a certificate does not make
 *      one verified. Nobody at ICEFALL has seen the document or rung the
 *      awarding body — see `passport/certificates.ts` for why the word
 *      "verified" is not available here at any price.
 *
 * ============================================================================
 * WHERE THE LIST COMES FROM, SAID ON THE SCREEN
 * ============================================================================
 *
 * Either the competences certified guides named for this objective, or — for
 * every mountain in the app today — ICEFALL's own list for the class the
 * elevation puts it in. `report.sourceNote` says which, every time, and it is
 * the first thing under the heading rather than a footnote.
 *
 * NO BOXES. Flat rows, hairlines and spacing.
 */

const FIELD =
  "w-full rounded-none border-0 border-b border-hairline bg-transparent px-0 py-2 text-[15px] text-snow outline-none placeholder:text-mist focus:border-snow/40";

function today(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function SkillGaps() {
  const { goal } = useTraining();
  const { coachProfile, updateCoachProfile } = useApp();
  const certificates = useCertificates();

  const mountain = goal?.mountainId ? mountainById(goal.mountainId) : undefined;
  const elevationM = mountain?.elevationM ?? goal?.elevationM ?? null;

  /* The same assessment the readiness ring is drawn from, so this screen and
     that one cannot name different competences for the same objective. */
  const assessment = useMemo(
    () => (elevationM === null ? null : assessPeak(elevationM, 0)),
    [elevationM],
  );

  const report = useMemo(() => {
    if (!goal || !assessment) return null;
    return skillGapsFor({
      objectiveName: goal.name,
      set: requirementSetFor(mountain),
      classSkills: assessment.skills,
      classLabel: assessment.label,
      reportedSkillLabels: coachProfile.technicalSkills ?? [],
      certificates,
    });
  }, [goal, assessment, mountain, coachProfile.technicalSkills, certificates]);

  const courses = useMemo(() => (report ? coursesForGaps(report) : []), [report]);
  const unmapped = useMemo(() => (report ? gapsWithoutCourse(report) : []), [report]);

  /** Which competence has its certificate form open. */
  const [certFor, setCertFor] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [awardedBy, setAwardedBy] = useState("");
  const [completedOn, setCompletedOn] = useState(today());
  /* Named `doc` rather than `document`: a state variable called `document`
     shadows the DOM global inside this component, which is a trap waiting for
     whoever next adds a focus call or a portal here. */
  const [doc, setDoc] = useState<CertificateDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Tick or untick a competence in the coaching profile.
   *
   * The profile stores LABELS, which is why the untick filters by resolved id
   * where there is one: an athlete whose profile holds an old wording of the
   * same competence should still have it removed rather than left behind as a
   * claim they can no longer see.
   */
  function toggle(line: SkillLine) {
    const held = coachProfile.technicalSkills ?? [];
    const label = line.skillId ? (SKILL_LABEL[line.skillId] ?? line.label) : line.label;

    if (line.status === "reported") {
      const next = held.filter((l) =>
        line.skillId ? skillIdForLabel(l) !== line.skillId : l !== label,
      );
      updateCoachProfile({ technicalSkills: next });
      return;
    }
    if (held.includes(label)) return;
    updateCoachProfile({ technicalSkills: [...held, label] });
  }

  function saveCertificate(line: SkillLine) {
    if (!line.skillId) return;
    if (courseName.trim().length === 0 || awardedBy.trim().length === 0) {
      setError(
        "Give the course name and who awarded it. The awarding body is the line a guide asks about.",
      );
      return;
    }
    const saved = addCertificate({
      skillId: line.skillId,
      courseName,
      awardedBy,
      completedOn,
      document: doc ?? undefined,
    });
    if (!saved) {
      setError("ICEFALL could not file that. Check the date.");
      return;
    }
    setCertFor(null);
    setCourseName("");
    setAwardedBy("");
    setDoc(null);
    setError(null);
  }

  if (!goal || !report) {
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader title="Skills and courses" back="/coach/progress" large />
        </div>
        <Stagger className="px-5">
          <Group label="Competences">
            <p className="py-3 text-[13px] leading-relaxed text-mist">
              {goal
                ? "ICEFALL has no elevation for this objective, so it cannot say what class of ground it is — and it will not guess at a list of competences from a name."
                : "You have no active objective, so there is nothing to compare your competences against yet."}
            </p>
          </Group>
        </Stagger>
      </Screen>
    );
  }

  const statusLabel = (line: SkillLine) =>
    line.status === "reported"
      ? "You hold this"
      : line.status === "certificate-only"
        ? "Certificate on file"
        : line.necessity === "required"
          ? "Required · not reported"
          : "Not reported";

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Skills and courses"
          subtitle={goal.name}
          back="/coach/progress"
          large
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">{report.sourceNote}</p>
          {report.emptyNote ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{report.emptyNote}</p>
          ) : null}
        </Rise>

        {/* ---- The competences ------------------------------------------- */}

        <Group
          label={
            report.gaps.length > 0
              ? `Competences · ${report.lines.length - report.gaps.length} of ${report.lines.length} reported`
              : "Competences"
          }
        >
          <div>
            {report.lines.map((line) => {
              const open = certFor === line.label;
              return (
                <div
                  key={line.label}
                  className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                >
                  <div className="flex items-start gap-3.5">
                    <button
                      type="button"
                      onClick={() => toggle(line)}
                      aria-label={
                        line.status === "reported"
                          ? `Remove ${line.label} from your profile`
                          : `Add ${line.label} to your profile`
                      }
                      className={cn(
                        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                        line.status === "reported"
                          ? "border-azure/50 text-azure"
                          : "border-hairline text-transparent",
                      )}
                    >
                      <Check size={13} strokeWidth={2.2} />
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-snow">{line.label}</p>
                      <p className="mt-0.5 text-[12px] text-mist">{statusLabel(line)}</p>

                      {line.why ? (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{line.why}</p>
                      ) : null}

                      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{line.note}</p>

                      {line.source ? (
                        <p className="mt-1 text-[11.5px] text-mist">Source: {line.source.detail}</p>
                      ) : null}

                      {line.certificates.map((c) => (
                        <div key={c.id} className="mt-2.5 flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] text-snow">
                              {c.courseName} — {c.awardedBy}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-mist">
                              Completed {c.completedOn}
                              {c.document
                                ? ` · ${c.document.fileName} (${readableSize(c.document.sizeBytes)}, not stored)`
                                : ""}
                            </p>
                            <p className="mt-1 text-[12px] leading-relaxed text-mist">
                              {CERTIFICATE_NOTICE}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => forgetCertificate(c.id)}
                            aria-label={`Delete the certificate for ${c.courseName}`}
                            className="-mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
                          >
                            <Trash2 size={15} strokeWidth={1.7} />
                          </button>
                        </div>
                      ))}

                      {line.skillId ? (
                        open ? (
                          <div className="mt-3">
                            <label className="block">
                              <span className="text-[12.5px] text-mist">
                                Course, as it is printed on the certificate
                              </span>
                              <input
                                value={courseName}
                                onChange={(e) => setCourseName(e.target.value)}
                                className={FIELD}
                              />
                            </label>
                            <label className="mt-3 block">
                              <span className="text-[12.5px] text-mist">Awarded by</span>
                              <input
                                value={awardedBy}
                                onChange={(e) => setAwardedBy(e.target.value)}
                                className={FIELD}
                              />
                            </label>
                            <label className="mt-3 block">
                              <span className="text-[12.5px] text-mist">Completed on</span>
                              <input
                                type="date"
                                value={completedOn}
                                onChange={(e) => setCompletedOn(e.target.value)}
                                className={FIELD}
                              />
                            </label>

                            <label className="mt-3 block">
                              <span className="text-[12.5px] text-mist">
                                Attach the certificate — optional
                              </span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => {
                                  /* METADATA ONLY. The file is never read, never
                                     stored and never sent — see DOCUMENT_NOTICE
                                     and the header of passport/certificates.ts.
                                     There is no FileReader anywhere near this. */
                                  const f = e.target.files?.[0];
                                  setDoc(
                                    f
                                      ? {
                                          fileName: f.name,
                                          mimeType: f.type,
                                          sizeBytes: f.size,
                                          chosenAt: new Date().toISOString(),
                                        }
                                      : null,
                                  );
                                }}
                                className="mt-1.5 block w-full text-[13px] text-mist"
                              />
                            </label>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                              {DOCUMENT_NOTICE}
                            </p>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                              {CERTIFICATE_DOES_NOT_TICK}
                            </p>

                            {error ? (
                              <p className="mt-2.5 text-[13px] leading-relaxed text-snow">
                                {error}
                              </p>
                            ) : null}

                            <div className="mt-3 flex gap-5">
                              <button
                                type="button"
                                onClick={() => saveCertificate(line)}
                                className="text-[14px] text-azure"
                              >
                                Save certificate
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCertFor(null);
                                  setError(null);
                                }}
                                className="text-[14px] text-mist"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCertFor(line.label);
                              setError(null);
                            }}
                            className="mt-2 text-[13px] text-azure"
                          >
                            Add a certificate
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Group>

        {/* ---- Courses ---------------------------------------------------- */}

        <Group label={courses.length > 0 ? "What teaches the rest" : "Courses"}>
          <p className="py-1 text-[13px] leading-relaxed text-mist">{COURSE_SECTION_INTRO}</p>

          {courses.length === 0 ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              {report.gaps.length === 0
                ? "You have reported every competence on this list, so there is nothing here to learn first."
                : "None of your open competences maps to a course type ICEFALL knows the name of."}
            </p>
          ) : (
            <div className="mt-1.5">
              {courses.map(({ course, closes }) => (
                <div
                  key={course.id}
                  className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                >
                  <p className="text-[15px] text-snow">{course.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-mist">{course.what}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
                    Would cover {closes.map((c) => c.label.toLowerCase()).join(", ")}.
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-mist">
                    Taught by {course.taughtBy}.
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{NO_LISTINGS_NOTICE}</p>
        </Group>

        {unmapped.length > 0 ? (
          <Group label="No course type for these">
            <div>
              {unmapped.map((line) => (
                <div
                  key={line.label}
                  className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                >
                  <p className="text-[14.5px] text-snow">{line.label}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-mist">{line.courseNote}</p>
                </div>
              ))}
            </div>
          </Group>
        ) : null}

        <Rise>
          <p className="text-[12.5px] leading-relaxed text-mist">{CERTIFICATE_STORAGE_NOTICE}</p>
        </Rise>
      </Stagger>
    </Screen>
  );
}
