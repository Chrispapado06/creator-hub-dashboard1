import { useEffect, useState } from "react";

import type { PlanProposal } from "@/coach/planActions";

/**
 * THE CHANGES THIS CONVERSATION HAS OFFERED OR MADE, KEYED TO THE MESSAGE THAT
 * CARRIED THEM.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE STORE AND NOT A FIELD ON THE MESSAGE
 * ============================================================================
 *
 * A coach message is persisted — `coach/conversations.ts` keeps the transcript
 * in `icefall.coach.conversations.v1` so tapping PLAN and coming back does not
 * erase it. Putting a live proposal on the message would persist that too, and
 * then a big change offered on Tuesday would still be sitting there on Friday
 * with a Confirm button under it.
 *
 * That button would be a lie by then. The proposal was computed against the
 * plan as it stood, the adjustments as they stood and the readiness the athlete
 * had that morning; three days later the guard's answer may be the opposite one
 * and the arithmetic certainly is. Re-previewing on load would fix the numbers
 * and make the offer stranger still — the athlete would be shown a confirmation
 * for a change they never agreed to keep pending.
 *
 * SO IT IS DELIBERATELY IN MEMORY ONLY. It survives leaving the chat screen and
 * coming back, which is the case that actually happens (the athlete taps
 * through to the plan to look at the day before agreeing). It does not survive
 * a reload, and that is the correct behaviour rather than a limitation: an
 * offer nobody took is an offer that expired.
 *
 * WHAT DOES SURVIVE IS THE MESSAGE. Its body is written by the app and says
 * what happened in the past tense — "Cut Sat 20 Sep to 90 min · waiting for you
 * to confirm". After a reload that sentence is still true: nothing was applied.
 *
 * ============================================================================
 * WHAT IS RECORDED HERE AND WHAT IS RECORDED IN THE PLAN
 * ============================================================================
 *
 * Nothing here is the record of a change. A change that was APPLIED is a row in
 * `icefall.plan.adjustments.v1`, visible on /coach/plan/changes with its reason
 * and its Undo, and it is there whether or not this store still exists. This
 * only remembers which chat bubble to draw the controls under.
 */

export type CoachChangeStatus =
  /** Offered, nothing written, waiting for a tap. */
  | "pending"
  /** Written. Undo is offered — and may itself be refused; see `planGuard`. */
  | "applied"
  /** The athlete said no. Nothing was written and nothing will be. */
  | "declined"
  /** Applied, then undone. */
  | "undone"
  /** Refused outright, by the guard or by the plan. Nothing was written. */
  | "refused"
  /** The commit was attempted and did not take. `problem` says why. */
  | "failed";

export interface CoachChange {
  /** The coach message this belongs under. */
  messageId: string;
  proposal: PlanProposal;
  status: CoachChangeStatus;
  /** Adjustment ids, so Undo names exactly what was written. */
  recordIds: string[];
  /** Set on `failed`, in the app's words. */
  problem: string;
}

let changes: CoachChange[] = [];
const listeners = new Set<(c: CoachChange[]) => void>();

function emit() {
  listeners.forEach((l) => l(changes));
}

export function recordChange(c: CoachChange): void {
  changes = [...changes.filter((x) => x.messageId !== c.messageId), c];
  emit();
}

export function updateChange(
  messageId: string,
  patch: Partial<Pick<CoachChange, "status" | "recordIds" | "problem">>,
): void {
  changes = changes.map((c) => (c.messageId === messageId ? { ...c, ...patch } : c));
  emit();
}

/** Every change this session has offered, for the screen that renders them. */
export function useCoachChanges(): CoachChange[] {
  const [state, setState] = useState(changes);
  useEffect(() => {
    listeners.add(setState);
    setState(changes);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

/** Dropped when the athlete starts a new conversation. */
export function clearChanges(): void {
  changes = [];
  emit();
}
