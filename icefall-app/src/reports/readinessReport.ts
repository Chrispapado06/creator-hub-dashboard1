import type {
  AthleteFacts,
  Provenance,
  RequirementComparison,
  RequirementStatus,
} from "@/objectives/compare";
import type { RequirementSetState } from "@/objectives/requirements";

/**
 * ONE PAGE FOR AN OPERATOR OR A GUIDE.
 *
 * ============================================================================
 * WHO READS THIS, AND WHAT THEY WILL DO WITH IT
 * ============================================================================
 *
 * Somebody at a desk with forty enquiries, deciding in ninety seconds whether
 * this client goes on the trip. That reader is the entire specification:
 *
 *   · They will skim. So the split between what ICEFALL MEASURED and what the
 *     athlete TOLD it is structural — two sections, two labels, every line
 *     stamped — and not a footnote that a fast reader drops.
 *   · They will treat anything that looks like a grade as a grade. So there is
 *     NO SCORE. No percentage, no ratio, no "8 of 11", no traffic light.
 *     Phase 3 removed the number on purpose and this page does not bring it
 *     back through the side door — `reportPlainText` is tested for the absence
 *     of a percent sign for exactly that reason.
 *   · They will read a blank as a failure unless stopped. So the third status
 *     is spelled out in words on the page, twice: once in the legend and once
 *     on every line that carries it.
 *
 * ============================================================================
 * WHAT IT IS SEEDED FROM, AND THE ONE DELIBERATE DIFFERENCE
 * ============================================================================
 *
 * `enquiries/readinessAttachment.ts` already does this job in text form and
 * already holds the right posture: two headings, nothing medical, no address,
 * off by default, shown verbatim before it is sent. This page inherits all of
 * that, and its exclusions are repeated here because they must survive somebody
 * editing only one of the two files:
 *
 *   NOTHING MEDICAL. Not limitations, not the limitations note, not
 *   `altitudeIllness`. A health disclosure does not belong in a commercial
 *   document, and `AthleteFacts` — the type this page is built from — has no
 *   field that could carry one.
 *
 *   NO ADDRESS, NO EMAIL, NO LOCATION.
 *
 *   THE ONE DIFFERENCE: the attachment deliberately omits the athlete's NAME,
 *   because the enquiry it rides on already carries it. This page is a
 *   standalone document that can be handed over on its own, so it names who it
 *   is about — and that is the only field this page adds over the attachment.
 *
 *   THE OTHER DIFFERENCE, IN THE OPPOSITE DIRECTION: the attachment prints
 *   "ICEFALL training plan: N% of the prescribed sessions completed". That is a
 *   percentage, and no percentage appears here. It is defensible in a message
 *   the athlete wrote, beside a sentence saying what it counts; on a document
 *   headed with somebody's name it would be read as a mark out of a hundred.
 *
 * ============================================================================
 * THE REQUIREMENTS HALF PRINTS WHAT compare.ts RETURNS. NOTHING ELSE.
 * ============================================================================
 *
 * Every requirement line on this page is one `RequirementResult`, with its own
 * `reason` string rendered verbatim — those sentences are written so that they
 * stay true for a climber of twenty years who installed the app last week, and
 * a shorter paraphrase composed here would lose exactly that property.
 *
 * TODAY THAT MEANS THE PAGE PRINTS ONE SENTENCE. All fourteen shipped
 * requirement sets are `unreviewed` with no structured requirements in them, so
 * `compareRequirements` returns an empty comparison carrying the state copy,
 * and this page renders that copy under a heading saying no comparison was
 * made. That is the honest output and it is not a bug to be worked around: the
 * alternative is a page that appears to check something against nothing.
 *
 * ============================================================================
 * A DOCUMENT THAT KNOWS HOW OLD IT IS
 * ============================================================================
 *
 * A readiness page is worth less every day and is dangerous once it is stale —
 * forwarded in March, a January page describes somebody who has since had six
 * weeks off. So `provenance` carries, and the page prints:
 *
 *   · when it was generated, to the minute;
 *   · the window every measured figure is drawn from;
 *   · how many recorded sessions are behind those figures;
 *   · the date of the MOST RECENT recorded session and how many days before
 *     generation that was — the figure that actually says whether this person
 *     has been training lately;
 *   · that ICEFALL does not update a copy which has left the app.
 *
 * No staleness verdict is computed. There is no measured threshold for when a
 * training record stops being current, so the page gives the reader the dates
 * and lets them judge — which is rule 1 applied to a number nobody has.
 */

/* -------------------------------------------------------------------------- */
/* Lines                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReportFigure {
  label: string;
  value: string;
  provenance: Provenance;
  /** A qualifying sentence where the figure needs one. Rendered, not hidden. */
  note?: string;
}

export interface ReportRequirementLine {
  id: string;
  label: string;
  necessity: "required" | "recommended";
  status: RequirementStatus;
  /** Three different words for three different answers. Never two. */
  statusLabel: string;
  /** `RequirementResult.reason`, verbatim. */
  reason: string;
  /** The athlete figure the status turned on, where there is one. */
  evidence: { value: string; provenance: Provenance } | null;
  /** Why the mountain asks this, in the guide's words. */
  why: string;
  /** Who says so, for this line. */
  source: string;
  /** True for an unmet line the guide marked required. */
  blocker: boolean;
}

export interface ReportProvenance {
  /** ISO timestamp. */
  generatedAt: string;
  /** The window the measured figures are drawn from, in words. */
  windowLabel: string;
  recordedSessions: number;
  /** ISO date of the earliest recorded session ICEFALL holds, or null. */
  firstSessionOn: string | null;
  /** ISO date of the most recent, or null. */
  latestSessionOn: string | null;
  /** Whole days between that session and generation, or null. */
  daysSinceLatestSession: number | null;
  summitsMarked: number;
  /** The sentences the page prints, already assembled. */
  lines: string[];
}

export interface ReadinessReport {
  /** Who it is about. The one field this page adds over the enquiry attachment. */
  athleteName: string;
  objectiveName: string;
  /** The route the requirements were scoped to, where a guide scoped them. */
  routeName?: string;
  /** What this document is and is not. Printed at the TOP. */
  standfirst: string;
  measured: ReportFigure[];
  /** Said when `measured` is empty, because an empty section is a claim. */
  measuredEmpty: string | null;
  reported: ReportFigure[];
  reportedEmpty: string | null;
  requirements: {
    state: RequirementSetState;
    /** `RequirementComparison.note` — the app's one sentence for this state. */
    note: string;
    attribution: string | null;
    lines: ReportRequirementLine[];
    /** Unmet required lines, in the guide's order. */
    blockers: ReportRequirementLine[];
    /** How many lines ICEFALL could not check at all. */
    notCheckedCount: number;
    /** The legend, printed beside the lines whenever there are any. */
    legend: { status: RequirementStatus; label: string; means: string }[];
  };
  provenance: ReportProvenance;
  /** The last thing on the page. */
  footer: string;
}

/* -------------------------------------------------------------------------- */
/* Fixed copy                                                                 */
/* -------------------------------------------------------------------------- */

export const REPORT_HEADING_MEASURED = "What ICEFALL recorded";
export const REPORT_HEADING_REPORTED = "What the athlete told ICEFALL (self-reported, not verified)";
export const REPORT_HEADING_REQUIREMENTS = "Against this objective's written requirements";

export const REPORT_STANDFIRST =
  "This page is a training record, not a clearance. ICEFALL has not assessed this person, has met nobody, and is not vouching for anything below. Everything on it is either something the app recorded from a device, or something the athlete typed into a form — and which of the two is marked on every line.";

export const REPORT_FOOTER =
  "Generated from an ICEFALL training record by the athlete, for you. ICEFALL does not clear anybody to climb and holds no opinion about whether this person should go. Ask them for a fresh page rather than trusting this one: ICEFALL cannot update a copy that has left the app.";

export const REPORT_MEASURED_EMPTY =
  "ICEFALL has recorded nothing for this athlete. That is a fact about the app, not about the person — a climber of twenty years who installed it last week has this section empty.";

export const REPORT_REPORTED_EMPTY =
  "This athlete has told ICEFALL nothing about their experience. Nothing is implied by the blank.";

/**
 * The three answers, in words, on the page.
 *
 * The third one is the reason this legend exists. An operator who reads "not
 * checked" as "failed" has been misled by the document, and no amount of
 * correctness further down repairs that.
 */
export const REPORT_STATUS_LABEL: Record<RequirementStatus, string> = {
  met: "Met",
  "not-met": "Recorded figure is below this line",
  "not-measurable": "NOT CHECKED — ICEFALL holds no figure for this",
};

export const REPORT_STATUS_MEANS: Record<RequirementStatus, string> = {
  met: "Something in this athlete's ICEFALL record reaches the figure this line asks for. It is not a judgement that they are ready for the ground.",
  "not-met":
    "What ICEFALL has RECORDED falls short of the figure. It is a statement about the app's twelve-week window, not about what this person can do — anything they did before they installed it, or did not record, is invisible here.",
  "not-measurable":
    "ICEFALL has nothing that speaks to this line at all, and has therefore checked NOTHING. This is not a fail and must not be read as one. Grades led, certificates held and ground covered before the app existed all land here.",
};

export const REPORT_UNCHECKED_NOTICE =
  "Lines marked NOT CHECKED are lines ICEFALL could not measure. They are not failures, and treating them as failures would penalise every experienced climber who has just installed the app.";

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReadinessReportInput {
  athleteName: string;
  objectiveName: string;
  /**
   * Phase 3's output for this objective, whatever state it is in. The ONLY
   * source of requirement content on the page.
   */
  comparison: RequirementComparison;
  /**
   * The athlete's record in `compare.ts`'s own shape — the same object the
   * comparison above was run against, so the two halves of the page cannot
   * describe two different people.
   */
  facts: AthleteFacts;
  /** How much, how recent. Supplied by the caller, which has the feed. */
  evidence: {
    recordedSessions: number;
    windowLabel: string;
    firstSessionOn: string | null;
    latestSessionOn: string | null;
  };
  generatedAt?: Date;
}

/* -------------------------------------------------------------------------- */
/* Building it                                                                */
/* -------------------------------------------------------------------------- */

const metres = (n: number) => `${Math.round(n).toLocaleString("en-GB")} m`;
const hours = (n: number) => `${n.toFixed(1)} h`;

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBetween(from: string | null, to: Date): number | null {
  if (!from) return null;
  const t = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const end = Date.parse(`${isoDay(to)}T00:00:00Z`);
  return Math.max(0, Math.round((end - t) / DAY_MS));
}

export function buildReadinessReport(input: ReadinessReportInput): ReadinessReport {
  const now = input.generatedAt ?? new Date();
  const facts = input.facts;

  /* ---- The two halves, split by the data's own provenance ---------------- */

  const measured: ReportFigure[] = [];
  const reported: ReportFigure[] = [];

  const place = (figure: ReportFigure) => {
    (figure.provenance === "recorded" ? measured : reported).push(figure);
  };

  if (facts.highestAltitude) {
    place({
      label: "Highest altitude reached",
      value: metres(facts.highestAltitude.value),
      provenance: facts.highestAltitude.provenance,
      note:
        facts.highestAltitude.provenance === "recorded"
          ? "The highest point a recorded session reached. Having been to a height once is not the same as being acclimatised for it on the day."
          : "Given by the athlete. ICEFALL has not verified it.",
    });
  }

  if (facts.biggestDayAscentM) {
    place({
      label: `Biggest single day of ascent, ${input.evidence.windowLabel}`,
      value: metres(facts.biggestDayAscentM.value),
      provenance: facts.biggestDayAscentM.provenance,
    });
  }

  if (facts.longestDayHours) {
    place({
      label: `Longest single day moving, ${input.evidence.windowLabel}`,
      value: hours(facts.longestDayHours.value),
      provenance: facts.longestDayHours.provenance,
    });
  }

  if (facts.weeklyAscentM) {
    place({
      label: "Weekly ascent, averaged over the period ICEFALL has observed",
      value: `${metres(facts.weeklyAscentM.value)} a week`,
      provenance: facts.weeklyAscentM.provenance,
      note:
        facts.weeklyAscentM.provenance === "recorded"
          ? "Averaged over the span ICEFALL was present for, which may be shorter than the window."
          : undefined,
    });
  }

  /* Summits and competences are ALWAYS self-reported, by their own definition
     in `compare.ts`. They are pushed rather than placed, so no future edit can
     route either of them into the measured column. */

  if (facts.summits.length > 0) {
    const highest = facts.summits.reduce(
      (best, s) => (Number.isFinite(s.elevationM) && s.elevationM > best ? s.elevationM : best),
      0,
    );
    reported.push({
      label: "Summits marked in ICEFALL",
      value:
        highest > 0
          ? `${facts.summits.length}, highest ${metres(highest)}`
          : `${facts.summits.length}`,
      provenance: "self-reported",
      note: "Marked by the athlete. ICEFALL does not verify a summit and has no way to.",
    });
  }

  if (facts.reportedSkillLabels.length > 0) {
    reported.push({
      label: "Competences claimed",
      value: facts.reportedSkillLabels.join(", "),
      provenance: "self-reported",
      note: "Ticked by the athlete in their own profile — including any ticked after a trip. ICEFALL did not watch, holds no certificate for these, and calls none of them verified.",
    });
  }

  /* ---- The requirements half, verbatim from compare.ts ------------------- */

  const lines: ReportRequirementLine[] = input.comparison.results.map((r) => ({
    id: r.requirement.id,
    label: r.requirement.label,
    necessity: r.requirement.necessity,
    status: r.status,
    statusLabel: REPORT_STATUS_LABEL[r.status],
    reason: r.reason,
    evidence: r.evidence ? { value: r.evidence.value, provenance: r.evidence.provenance } : null,
    why: r.requirement.why,
    source: r.requirement.source.detail,
    blocker: r.blocker,
  }));

  const notCheckedCount = lines.filter((l) => l.status === "not-measurable").length;

  /* ---- How old, and from what ------------------------------------------- */

  const daysSince = daysBetween(input.evidence.latestSessionOn, now);
  const provenanceLines: string[] = [];

  provenanceLines.push(`Generated ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`);

  if (input.evidence.recordedSessions > 0) {
    provenanceLines.push(
      `Measured figures come from ${input.evidence.recordedSessions} recorded ${input.evidence.recordedSessions === 1 ? "session" : "sessions"} in ${input.evidence.windowLabel}.`,
    );
  } else {
    provenanceLines.push(
      `ICEFALL recorded no sessions in ${input.evidence.windowLabel}, so there are no measured figures on this page.`,
    );
  }

  if (input.evidence.latestSessionOn && daysSince !== null) {
    provenanceLines.push(
      daysSince === 0
        ? "The most recent recorded session is today."
        : `The most recent recorded session was ${input.evidence.latestSessionOn}, ${daysSince} ${daysSince === 1 ? "day" : "days"} before this page was generated.`,
    );
  } else {
    provenanceLines.push("There is no recorded session to date this record from.");
  }

  if (input.evidence.firstSessionOn) {
    provenanceLines.push(`The earliest session ICEFALL holds is ${input.evidence.firstSessionOn}.`);
  }

  provenanceLines.push(
    input.comparison.attribution ??
      "No certified guide has reviewed this objective's requirements, so the comparison section is empty by design rather than by omission.",
  );

  provenanceLines.push(
    "ICEFALL cannot update a copy of this page once it has left the app. If you are reading it long after the date above, ask for a new one.",
  );

  return {
    athleteName: input.athleteName,
    objectiveName: input.objectiveName,
    routeName: input.comparison.routeName,
    standfirst: REPORT_STANDFIRST,
    measured,
    measuredEmpty: measured.length === 0 ? REPORT_MEASURED_EMPTY : null,
    reported,
    reportedEmpty: reported.length === 0 ? REPORT_REPORTED_EMPTY : null,
    requirements: {
      state: input.comparison.state,
      note: input.comparison.note,
      attribution: input.comparison.attribution,
      lines,
      blockers: lines.filter((l) => l.blocker),
      notCheckedCount,
      legend:
        lines.length === 0
          ? []
          : (["met", "not-met", "not-measurable"] as RequirementStatus[]).map((status) => ({
              status,
              label: REPORT_STATUS_LABEL[status],
              means: REPORT_STATUS_MEANS[status],
            })),
    },
    provenance: {
      generatedAt: now.toISOString(),
      windowLabel: input.evidence.windowLabel,
      recordedSessions: input.evidence.recordedSessions,
      firstSessionOn: input.evidence.firstSessionOn,
      latestSessionOn: input.evidence.latestSessionOn,
      daysSinceLatestSession: daysSince,
      summitsMarked: facts.summits.length,
      lines: provenanceLines,
    },
    footer: REPORT_FOOTER,
  };
}

/* -------------------------------------------------------------------------- */
/* The same page as text                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The page as plain text, for copying into an email or a message.
 *
 * SAME CONTENT, SAME ORDER, SAME WORDS as the screen renders. It is not a
 * summary: a copy button that sent a shortened version of what the athlete had
 * just read would be the same failure as a consent screen that paraphrases what
 * it is about to send (`enquiries/readinessAttachment.ts`, and the rule there
 * applies here for the same reason).
 */
export function reportPlainText(report: ReadinessReport): string {
  const out: string[] = [];

  out.push(`ICEFALL training record — ${report.athleteName}`);
  out.push(
    `For: ${report.objectiveName}${report.routeName ? ` · ${report.routeName}` : ""}`,
  );
  out.push("");
  out.push(report.standfirst);
  out.push("");

  out.push(REPORT_HEADING_MEASURED);
  if (report.measuredEmpty) {
    out.push(report.measuredEmpty);
  } else {
    for (const f of report.measured) {
      out.push(`- ${f.label}: ${f.value}${f.note ? ` (${f.note})` : ""}`);
    }
  }
  out.push("");

  out.push(REPORT_HEADING_REPORTED);
  if (report.reportedEmpty) {
    out.push(report.reportedEmpty);
  } else {
    for (const f of report.reported) {
      out.push(`- ${f.label}: ${f.value}${f.note ? ` (${f.note})` : ""}`);
    }
  }
  out.push("");

  out.push(REPORT_HEADING_REQUIREMENTS);
  out.push(report.requirements.note);
  if (report.requirements.lines.length === 0) {
    out.push("No requirement was checked, so none is listed.");
  } else {
    out.push(REPORT_UNCHECKED_NOTICE);
    out.push("");
    for (const l of report.requirements.lines) {
      out.push(`- ${l.label} (${l.necessity}) — ${l.statusLabel}`);
      out.push(`  ${l.reason}`);
      if (l.evidence) {
        out.push(
          `  Figure used: ${l.evidence.value} (${l.evidence.provenance === "recorded" ? "recorded by ICEFALL" : "self-reported"}).`,
        );
      }
      out.push(`  Source of the requirement: ${l.source}`);
    }
    if (report.requirements.attribution) {
      out.push("");
      out.push(report.requirements.attribution);
    }
  }
  out.push("");

  out.push("How old this page is, and what it was built from");
  for (const line of report.provenance.lines) out.push(`- ${line}`);
  out.push("");
  out.push(report.footer);

  return out.join("\n");
}
