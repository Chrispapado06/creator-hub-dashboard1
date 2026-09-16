/**
 * WHEN A NEW VERSION OF THE APP MAY TAKE OVER (Mountain mode plan §2.3 CORRECTED).
 *
 * Pure. A new version replaces the files the open page still refers to, so it
 * must never take over under somebody on a mountain: the next tab they touch
 * could be a file that no longer exists.
 *
 * - A recording is running: hold. A reload would end it.
 * - The athlete's own trip is running today: hold, for up to fourteen days.
 * - Held fourteen days: install the next time the app goes to the background
 *   (a fortnight-stale app is the bigger risk; the Trip row warns first).
 * - Otherwise: install now, as the app always has.
 */

export const UPDATE_HOLD_CAP_MS = 14 * 24 * 3600 * 1000;

export type UpdateDecision = "install" | "hold" | "install-when-hidden";

export interface UpdateInput {
  tripToday: boolean;
  recording: boolean;
  /** When the waiting version was first held, ms since epoch; null if not held yet. */
  heldSince: number | null;
  now: number;
  /** The page is in the background. */
  hidden: boolean;
}

export function decideUpdate(i: UpdateInput): UpdateDecision {
  if (i.recording) return "hold";
  if (!i.tripToday) return "install";
  const capped = i.heldSince !== null && i.now - i.heldSince >= UPDATE_HOLD_CAP_MS;
  if (!capped) return "hold";
  return i.hidden ? "install" : "install-when-hidden";
}

/** Plain copy for the Trip tab row. */
export function updateRowCopy(decision: UpdateDecision): string {
  return decision === "install-when-hidden"
    ? "A new version of ICEFALL is ready. It will install next time you leave the app."
    : "A new version of ICEFALL is ready. It will install when this trip ends.";
}
