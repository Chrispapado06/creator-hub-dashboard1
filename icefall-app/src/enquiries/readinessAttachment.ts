import type { CoachContext } from "@/coach/context";

/**
 * THE TRAINING PICTURE AN ATHLETE MAY CHOOSE TO SEND WITH AN ENQUIRY.
 *
 * Phase 2, step 3. The roadmap asks that "Enquire" be able to attach
 * readiness. The first question a real operator or guide asks is some version
 * of *what have you actually been doing* — and the athlete has that in the app
 * already, measured, and currently retypes it badly or not at all.
 *
 * ============================================================================
 * CONSENT IS A TAP, A PREVIEW, AND A DEFAULT OF OFF
 * ============================================================================
 *
 * This is the athlete's training record leaving the device and going to a
 * commercial desk. Three things follow and none is negotiable:
 *
 *   1. OFF BY DEFAULT. An enquiry sends exactly what was typed unless somebody
 *      deliberately adds this.
 *   2. SHOWN BEFORE IT GOES. `buildReadinessAttachment` returns the literal
 *      text that will be appended, and the compose screen renders that same
 *      string — not a summary of it, not a description of it. A consent screen
 *      that paraphrases what it is about to send is not consent.
 *   3. APPENDED TO THE BODY, visibly, so it is in the message the athlete can
 *      read back in their own thread. Nothing travels in a side channel.
 *
 * ============================================================================
 * WHAT IS DELIBERATELY NOT IN IT
 * ============================================================================
 *
 * NOTHING MEDICAL. Not `limitations`, not `limitationsNote`, not
 * `altitudeIllness`. Those exist so the coach can narrow what it prescribes;
 * they are a health disclosure, and a health disclosure does not belong in a
 * sales enquiry — `mountainReadiness` makes the same exclusion for the same
 * reason, and says so at the field.
 *
 * NO READINESS SCORE. `assessObjectiveReadiness` produces one for the athlete
 * to read, under a disclaimer saying it does not clear anybody to go. Sent to
 * a company it becomes a credential, read as ICEFALL's opinion of a client,
 * and a guide could reasonably weigh it. ICEFALL has not assessed anybody and
 * must not appear to have.
 *
 * NO NAME, NO EMAIL, NO LOCATION. The enquiry already carries who is asking,
 * and `homeBase` is a home address by another name.
 *
 * ============================================================================
 * RULE 5, ON THE FACE OF EVERY LINE
 * ============================================================================
 *
 * Measured beats self-reported and self-reported stays labelled. The block is
 * split under two headings rather than mixing them, because to the person
 * reading it "620 m of ascent this week" and "says they have been to 4,000 m"
 * are evidence of very different weight, and a single list flattens them.
 */

export interface ReadinessAttachment {
  /** Exactly what will be appended to the enquiry body. Empty when there is nothing to send. */
  text: string;
  /** How many measured lines it holds — the compose screen says so before the tap. */
  measuredLines: number;
  /** How many self-reported lines it holds. */
  reportedLines: number;
}

/** Shown beside the control, every time. */
export const READINESS_ATTACHMENT_CONSENT =
  "Off unless you turn it on. This adds your own training figures to the message you are sending — what ICEFALL measured, and what you told it, kept apart and labelled. It carries nothing about your health, no readiness score and no address, and ICEFALL adds no opinion of you: it is your record, in your words, going out under your name.";

export const READINESS_ATTACHMENT_NOTHING =
  "Nothing to attach yet. ICEFALL has no recorded sessions for you and no objective to describe, so there are no figures to add — write what you have been doing in your own words instead.";

const HEADING_MEASURED = "What ICEFALL has recorded for me";
const HEADING_REPORTED = "What I have told ICEFALL (self-reported, not verified)";

function round(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/**
 * The block, or an empty one.
 *
 * Pure. Given the same context it returns the same string, which is what lets
 * the compose screen show the athlete the exact text and then send that exact
 * text rather than rebuilding it at send time.
 */
export function buildReadinessAttachment(ctx: CoachContext): ReadinessAttachment {
  const measured: string[] = [];
  const reported: string[] = [];

  /* ---- Measured -------------------------------------------------------- */

  if (ctx.weekly.activities > 0) {
    measured.push(
      `- Last 7 days: ${ctx.weekly.activities} ${ctx.weekly.activities === 1 ? "session" : "sessions"}, ${round(ctx.weekly.distanceKm)} km, ${round(ctx.weekly.elevationM)} m of ascent, ${ctx.weekly.timeHours.toFixed(1)} h moving.`,
    );
  }

  if (ctx.recent.length > 0) {
    // The three most recent, as they were recorded. Longest-first would be a
    // flattering selection, and a selection made to flatter is a claim.
    const lines = ctx.recent
      .slice(0, 3)
      .map(
        (a) =>
          `  · ${a.title} — ${round(a.distanceKm)} km, ${round(a.elevationGainM)} m ascent, ${round(a.movingMin)} min`,
      );
    measured.push(`- Most recent sessions:\n${lines.join("\n")}`);
  }

  if (ctx.objective) {
    const o = ctx.objective;
    const when = o.daysAway !== null ? `, ${o.daysAway} days away` : "";
    measured.push(
      `- Objective: ${o.name}${o.elevationM ? ` (${round(o.elevationM)} m)` : ""}, target ${o.targetDate.slice(0, 10)}${when}.`,
    );
    /*
     * Preparation is a percentage through a TRAINING PLAN, not a verdict on a
     * person, and it is the single figure on this block most likely to be
     * misread by somebody skimming. So it is named for what it counts.
     */
    measured.push(
      `- ICEFALL training plan: ${Math.round(o.preparationPct)}% of the prescribed sessions completed so far. This counts sessions done against sessions planned. It is not an assessment of me and ICEFALL does not clear anyone to climb.`,
    );
  }

  /* ---- Self-reported ---------------------------------------------------- */

  if (ctx.athlete.experience) {
    reported.push(`- Experience level I selected: ${ctx.athlete.experience}.`);
  }
  if (ctx.athlete.maxAltitudeM !== null) {
    reported.push(`- Highest altitude I say I have been to: ${round(ctx.athlete.maxAltitudeM)} m.`);
  }
  if (ctx.athlete.technicalSkills.length > 0) {
    reported.push(`- Technical skills I say I have: ${ctx.athlete.technicalSkills.join(", ")}.`);
  }
  if (ctx.athlete.disciplines.length > 0) {
    reported.push(`- Disciplines I listed: ${ctx.athlete.disciplines.join(", ")}.`);
  }

  if (measured.length === 0 && reported.length === 0) {
    return { text: "", measuredLines: 0, reportedLines: 0 };
  }

  const parts: string[] = ["", "---", ""];
  if (measured.length > 0) parts.push(HEADING_MEASURED, ...measured, "");
  if (reported.length > 0) parts.push(HEADING_REPORTED, ...reported, "");
  parts.push(
    "Attached by me from my ICEFALL training record. ICEFALL has not assessed me and is not vouching for any of it.",
  );

  return {
    text: parts.join("\n"),
    measuredLines: measured.length,
    reportedLines: reported.length,
  };
}
