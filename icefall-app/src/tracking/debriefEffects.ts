import { DEBRIEF_BODY_LABEL, HARD_EFFORT, type ActivityDebrief } from "./debrief";
import type { SafetyCategory } from "@/coach/safety";

/**
 * WHAT A DEBRIEF ANSWER ACTUALLY CHANGES.
 *
 * A question that reaches nothing is worse than a question not asked: it
 * teaches the athlete that answering is theatre, and it is the exact failure
 * Phase 1 of this roadmap existed to end for the signup questionnaire ("every
 * questionnaire answer either changes something the user can see, or the app
 * plainly says it doesn't"). So this module is the answer to "and then what",
 * written as a type rather than as a promise.
 *
 * Three destinations, and each one is a real call site:
 *
 *   RECOVERY          `hardSessionHoursAgo` in `coach/hooks.ts` asked how long
 *                     since a hard session and answered it from ascent and
 *                     duration alone — a proxy that cannot see a short session
 *                     that hurt. An effort rating at or above `HARD_EFFORT` is
 *                     the athlete saying it was hard, and it now counts.
 *   THE NEXT SESSION  a recognised pain area becomes a one-tap "train around
 *                     this" on the session screen, using the discomfort path
 *                     `modifySession` already has. OFFERED, NOT APPLIED: a
 *                     session silently made easier is a session the athlete
 *                     quietly puts back.
 *   THE COACH         `coach/context.ts` carries the recent debriefs into the
 *                     prompt, labelled as self-reported, so the coach can
 *                     answer "how did last week feel" from what was said rather
 *                     than from distances.
 *
 * AND THE ONE THAT IS NOT A TRAINING CHANGE. A pain note the safety layer fired
 * on comes out as `medical` and never as `trainAround`. The two must not be
 * merged: easing Thursday for a suspected fracture looks, on screen, exactly
 * like the app having dealt with it.
 *
 * PURE. No storage, no React, no clock but the one passed in.
 */

/** How long a pain report is carried forward into the next session. */
export const PAIN_CARRY_DAYS = 7;

/** How long an effort rating counts as "a hard session" for recovery. */
const HARD_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * One consequence, in the words the athlete reads.
 *
 * Shown on the debrief screen the moment they answer, so the question visibly
 * lands somewhere. `text` describes what ICEFALL DID, in the past tense, and
 * never what it might do.
 */
export interface DebriefConsequence {
  id: "recovery" | "next-session" | "coach" | "medical";
  text: string;
  activityId: string;
}

export interface DebriefSignals {
  /**
   * Hours since the most recent session the ATHLETE rated as hard, or null.
   *
   * Null is a named absence: no debrief in the window said so. It never stands
   * in for "no hard session" — the derived proxy in `coach/hooks.ts` answers
   * that separately, and the caller takes whichever is more recent.
   */
  hardSessionHoursAgo: number | null;
  /**
   * The area the next session should train around, from a recent pain answer.
   *
   * `area` is the session engine's own label, so the screen that offers it
   * cannot name something the engine will then fail to act on.
   */
  trainAround: { area: string; activityId: string; at: string } | null;
  /** A pain note the safety layer answered. A doctor, not a lighter session. */
  medical: { category: SafetyCategory; activityId: string; at: string } | null;
  consequences: DebriefConsequence[];
}

const EMPTY: DebriefSignals = {
  hardSessionHoursAgo: null,
  trainAround: null,
  medical: null,
  consequences: [],
};

function hoursSince(iso: string, now: Date): number | null {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  // A record from the future is a clock problem, not a recent session. Reading
  // it as "0 hours ago" would hold the next session down for no reason.
  return ms >= 0 ? ms / 3_600_000 : null;
}

/** Newest first by when the answers were given. */
function newestFirst(debriefs: ActivityDebrief[]): ActivityDebrief[] {
  return [...debriefs].sort((a, b) => (a.answeredAt < b.answeredAt ? 1 : -1));
}

export function debriefSignals(debriefs: ActivityDebrief[], now = new Date()): DebriefSignals {
  if (debriefs.length === 0) return EMPTY;

  const sorted = newestFirst(debriefs);
  const consequences: DebriefConsequence[] = [];

  /* ---- Recovery ---------------------------------------------------------- */

  let hardSessionHoursAgo: number | null = null;
  for (const d of sorted) {
    if (d.effort < HARD_EFFORT) continue;
    /* Aged from the ACTIVITY's start, not from when the questions were
       answered. Somebody who answers on Monday about Saturday has not just
       done a hard session, and recovery would hold Monday down for it. */
    const hours = hoursSince(d.activityStartedAt, now);
    if (hours === null || hours > HARD_WINDOW_DAYS * 24) continue;
    hardSessionHoursAgo = hours;
    consequences.push({
      id: "recovery",
      activityId: d.activityId,
      text: `You rated that ${d.effort} out of 10, so recovery is now counting it as a hard session rather than judging it by its distance and ascent.`,
    });
    break;
  }

  /* ---- The next session, or a doctor ------------------------------------- */

  let trainAround: DebriefSignals["trainAround"] = null;
  let medical: DebriefSignals["medical"] = null;

  for (const d of sorted) {
    if (!d.pain.reported) continue;
    const hours = hoursSince(d.activityStartedAt, now);
    if (hours === null || hours > PAIN_CARRY_DAYS * 24) continue;

    if (d.pain.safety) {
      medical = { category: d.pain.safety, activityId: d.activityId, at: d.activityStartedAt };
      consequences.push({
        id: "medical",
        activityId: d.activityId,
        text: "What you described is not something ICEFALL will train around. The fixed safety guidance above is the answer, and the coach will not build sessions over it.",
      });
      break;
    }

    if (d.pain.area) {
      trainAround = { area: d.pain.area, activityId: d.activityId, at: d.activityStartedAt };
      consequences.push({
        id: "next-session",
        activityId: d.activityId,
        text: `Your next session can be built around your ${d.pain.area}. The session screen offers it as a change you apply, so nothing is quietly made easier without you seeing it.`,
      });
      break;
    }

    /* Reported, recognised by neither. Said plainly rather than filed in
       silence — an athlete who typed a sentence and got nothing back has been
       taught not to bother next time. */
    consequences.push({
      id: "coach",
      activityId: d.activityId,
      text: "ICEFALL could not match that to a body area its session engine can work around, so nothing in your plan has changed. It is saved with the activity and the coach can see it.",
    });
    break;
  }

  /* ---- The coach --------------------------------------------------------- */

  const latest = sorted[0];
  consequences.push({
    id: "coach",
    activityId: latest.activityId,
    text: `Saved: ${latest.effort} out of 10, body ${DEBRIEF_BODY_LABEL[latest.body].toLowerCase()}. The coach reads your last few debriefs, labelled as your own report rather than as anything measured.`,
  });

  return { hardSessionHoursAgo, trainAround, medical, consequences };
}

/**
 * The recent debriefs the coach's prompt carries, oldest field first.
 *
 * Capped and windowed here rather than at the prompt, so the same rule applies
 * wherever they are read. Free text is NOT included — `coach/context.ts` runs
 * the note through `sanitiseForPrompt` at the boundary, and a second copy of
 * that decision here is a second place for it to go wrong.
 */
export function recentDebriefs(
  debriefs: ActivityDebrief[],
  limit = 5,
  now = new Date(),
  withinDays = 21,
): ActivityDebrief[] {
  return newestFirst(debriefs)
    .filter((d) => {
      const ms = now.getTime() - new Date(d.activityStartedAt).getTime();
      return Number.isFinite(ms) && ms >= 0 && ms <= withinDays * DAY_MS;
    })
    .slice(0, limit);
}
