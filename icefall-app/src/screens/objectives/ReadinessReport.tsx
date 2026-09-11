import { useMemo, useState } from "react";
import { Check, Copy, Minus, X } from "lucide-react";

import { useParams } from "react-router-dom";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import {
  athleteFactsFrom,
  compareToRequirements,
  reportEvidenceCounts,
} from "@/coach/mountainReadiness";
import { mountainById } from "@/data/mock/mountains";
import { requirementSetFor } from "@/data/mock/mountainRequirements";
import type { RequirementStatus } from "@/objectives/compare";
import {
  buildReadinessReport,
  reportPlainText,
  REPORT_HEADING_MEASURED,
  REPORT_HEADING_REPORTED,
  REPORT_HEADING_REQUIREMENTS,
  REPORT_UNCHECKED_NOTICE,
} from "@/reports/readinessReport";
import { useSummitLogs } from "@/social/summitLog";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * THE SHAREABLE READINESS REPORT — one page for an operator or a guide.
 *
 * ============================================================================
 * WHAT THE DESIGN IS DOING, AND WHY
 * ============================================================================
 *
 * MEASURED AND SELF-REPORTED ARE TWO SECTIONS, NOT TWO TINTS. The split is
 * structural because the reader is skimming: a colour difference survives
 * neither a screenshot in grayscale, nor a forward, nor somebody in a hurry.
 * Each section carries its own heading in words, and every row repeats the
 * label — belt and brace, deliberately, because this is the one distinction the
 * whole page exists to preserve.
 *
 * THE THIRD STATUS IS SHOUTED. `not-measurable` renders with a dash rather than
 * a cross, the words "NOT CHECKED", and the sentence saying it is not a
 * failure. An operator who reads a blank as a fail has been misled by this
 * document, and rule 1 makes that ICEFALL's fault, not theirs.
 *
 * THERE IS NO SCORE ANYWHERE ON IT. No percentage, no ratio, no ring, no
 * traffic light. `reports/readinessReport.ts` has a test that fails on a
 * percent sign in the page's own text.
 *
 * IT SAYS HOW OLD IT IS, in a section of its own rather than a footnote, and
 * the copy button copies EXACTLY what is on screen — `reportPlainText`, not a
 * summary of it.
 *
 * NO BOXES. Flat rows, hairlines and spacing.
 */

const ACTION =
  "mt-5 w-full rounded-full border border-azure/45 px-4 py-2.5 text-[13px] text-azure transition-colors hover:bg-azure/10 disabled:border-hairline disabled:text-mist-dim disabled:hover:bg-transparent";

function StatusMark({ status }: { status: RequirementStatus }) {
  if (status === "met") {
    return (
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-azure/50 text-azure">
        <Check size={13} strokeWidth={2.2} />
      </span>
    );
  }
  if (status === "not-met") {
    return (
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline-strong text-mist">
        <X size={13} strokeWidth={2.2} />
      </span>
    );
  }
  /* A DASH, NOT A CROSS. The difference between "we looked and it fell short"
     and "we never looked" has to survive somebody glancing at the icons. */
  return (
    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim">
      <Minus size={13} strokeWidth={2.2} />
    </span>
  );
}

function Figure({
  label,
  value,
  note,
  provenance,
}: {
  label: string;
  value: string;
  note?: string;
  provenance: "recorded" | "self-reported";
}) {
  return (
    <div className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[13px] text-mist">{label}</p>
        <p className="shrink-0 text-[15px] text-snow">{value}</p>
      </div>
      <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-mist-dim">
        {provenance === "recorded" ? "Recorded by ICEFALL" : "Self-reported · not verified"}
      </p>
      {note ? <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{note}</p> : null}
    </div>
  );
}

export default function ReadinessReportScreen() {
  const { goalId } = useParams<{ goalId: string }>();
  const { goals, coachProfile, user } = useApp();
  const feed = useRecordedActivities();
  const summits = useSummitLogs();
  const [copied, setCopied] = useState<string | null>(null);

  const goal = goals.find((g) => g.id === goalId);
  const mountain = goal?.mountainId ? mountainById(goal.mountainId) : undefined;

  const summitsLogged = useMemo(
    () =>
      summits
        .filter((l) => typeof l.elevationM === "number")
        .map((l) => ({ name: l.peakName, elevationM: l.elevationM as number, date: l.date })),
    [summits],
  );

  const selfReported = useMemo(
    () => ({
      technicalSkills: coachProfile.technicalSkills,
      maxAltitudeM: coachProfile.maxAltitudeM,
    }),
    [coachProfile.technicalSkills, coachProfile.maxAltitudeM],
  );

  const report = useMemo(() => {
    if (!goal) return null;
    /* ONE reading of the athlete, shared by both halves of the page. The facts
       and the comparison come from the same builder in `mountainReadiness.ts`,
       so the figures in the top half cannot disagree with the evidence quoted
       against a requirement in the bottom half. */
    const facts = athleteFactsFrom({ activities: feed, summitsLogged, selfReported });
    const comparison = compareToRequirements({
      requirements: requirementSetFor(mountain),
      objectiveId: goal.mountainId ?? goal.id,
      objectiveName: goal.name,
      activities: feed,
      summitsLogged,
      selfReported,
    });
    return buildReadinessReport({
      athleteName: user.name,
      objectiveName: goal.name,
      comparison,
      facts,
      evidence: reportEvidenceCounts(feed),
    });
  }, [goal, mountain, feed, summitsLogged, selfReported, user.name]);

  if (!goal || !report) {
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader title="Readiness page" back="/coach" large />
        </div>
        <Stagger className="px-5">
          <Rise>
            <p className="text-[13px] leading-relaxed text-mist">
              That objective is not in your list, so there is nothing to build a page from.
            </p>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  async function copy() {
    if (!report) return;
    const text = reportPlainText(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copied. It is the same words as the page above, nothing added or left out.");
    } catch {
      /* Rule 2: the failure carries its reason rather than looking like nothing
         happened. A silent clipboard is indistinguishable from a dead button. */
      setCopied(
        "This browser refused the clipboard. Select the page and copy it by hand — nothing has been sent anywhere either way.",
      );
    }
  }

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Readiness page"
          subtitle={`${report.athleteName} · ${report.objectiveName}`}
          back={`/objective/${goal.id}/debrief`}
          large
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">{report.standfirst}</p>
          {report.routeName ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              Scoped to {report.routeName}.
            </p>
          ) : null}
        </Rise>

        {/* ---- MEASURED --------------------------------------------------- */}

        <Group label={REPORT_HEADING_MEASURED}>
          {report.measuredEmpty ? (
            <p className="text-[13px] leading-relaxed text-mist">{report.measuredEmpty}</p>
          ) : (
            <div>
              {report.measured.map((f) => (
                <Figure key={f.label} {...f} />
              ))}
            </div>
          )}
        </Group>

        {/* ---- SELF-REPORTED ---------------------------------------------- */}

        <Group label={REPORT_HEADING_REPORTED}>
          {report.reportedEmpty ? (
            <p className="text-[13px] leading-relaxed text-mist">{report.reportedEmpty}</p>
          ) : (
            <div>
              {report.reported.map((f) => (
                <Figure key={f.label} {...f} />
              ))}
            </div>
          )}
        </Group>

        {/* ---- REQUIREMENTS ------------------------------------------------ */}

        <Group label={REPORT_HEADING_REQUIREMENTS}>
          <p className="text-[13px] leading-relaxed text-mist">{report.requirements.note}</p>

          {report.requirements.lines.length === 0 ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              No requirement was checked, so none is listed. An empty list here is ICEFALL's
              homework outstanding, not a finding about this athlete.
            </p>
          ) : (
            <>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
                {REPORT_UNCHECKED_NOTICE}
              </p>

              <div className="mt-3">
                {report.requirements.lines.map((l) => (
                  <div
                    key={l.id}
                    className="-mx-5 flex items-start gap-3.5 border-t border-hairline px-5 py-3.5"
                  >
                    <StatusMark status={l.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-snow">{l.label}</p>
                      <p
                        className={cn(
                          "mt-0.5 text-[12px] uppercase tracking-[0.08em]",
                          l.status === "not-measurable" ? "text-mist-dim" : "text-mist",
                        )}
                      >
                        {l.statusLabel}
                        {l.necessity === "required" ? " · required" : " · recommended"}
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{l.reason}</p>
                      {l.evidence ? (
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
                          Figure used: {l.evidence.value} —{" "}
                          {l.evidence.provenance === "recorded"
                            ? "recorded by ICEFALL"
                            : "self-reported, not verified"}
                          .
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11.5px] text-mist-dim">Source: {l.source}</p>
                    </div>
                  </div>
                ))}
              </div>

              {report.requirements.legend.length > 0 ? (
                <div className="mt-5">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-mist-dim">
                    What the three answers mean
                  </p>
                  {report.requirements.legend.map((entry) => (
                    <p
                      key={entry.status}
                      className="mt-2 text-[13px] leading-relaxed text-mist"
                    >
                      <span className="text-snow">{entry.label}.</span> {entry.means}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {report.requirements.attribution ? (
            <p className="mt-4 text-[12.5px] leading-relaxed text-mist">
              {report.requirements.attribution}
            </p>
          ) : null}
        </Group>

        {/* ---- AGE --------------------------------------------------------- */}

        <Group label="How old this page is, and what it was built from">
          <div>
            {report.provenance.lines.map((line, i) => (
              <p
                key={i}
                className="-mx-5 border-t border-hairline px-5 py-3 text-[13px] leading-relaxed text-mist first:border-t-0"
              >
                {line}
              </p>
            ))}
          </div>
        </Group>

        <Rise>
          <button type="button" className={ACTION} onClick={copy}>
            <span className="inline-flex items-center gap-2">
              <Copy size={14} strokeWidth={1.8} />
              Copy this page as text
            </span>
          </button>
          {copied ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{copied}</p>
          ) : (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              Copying puts the page on your clipboard and nowhere else. ICEFALL does not send this
              to anybody, and has no operator it could send it to.
            </p>
          )}
          <p className="mt-4 text-[13px] leading-relaxed text-mist">{report.footer}</p>
        </Rise>
      </Stagger>
    </Screen>
  );
}
