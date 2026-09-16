/**
 * WHAT THE SIGNAL PILL SAYS, AND WHEN LOSING SIGNAL MOVES THE ATHLETE (brief M2).
 *
 * Pure. No react, no requests, no storage — every input is passed in, so each
 * rule below is a test rather than a thing to try on a mountain. The hooks that
 * gather those inputs live in `useSignal.ts`.
 *
 * TWO SOURCES, ONE ANSWER. `trip/connectivity.ts` is the safety module: it
 * trusts "the phone has no network" and the review flag, and it never claims a
 * working connection. `connection/reachability.ts` is the check: it is the only
 * thing entitled to say "reachable", and only after our own server answered
 * with the expected body. The pill takes "no signal" from either and "Signal"
 * from the check alone.
 *
 * THE PILL NEVER SAYS "Signal" OFF AN OLD SUCCESS (plan §2.7 CORRECTED). Past
 * the freshness window it says when we last reached anything instead, which is
 * a useful sentence, where "Signal not checked" was only a restatement that
 * nobody had looked.
 */

import { REACH_FRESH_MS, formatAgo, type ReachState, type ReachabilitySnapshot } from "@/connection/reachability";

import { isLiveTrackerPath, isMountainModePath } from "./paths";

/** How long "Signal · synced 3 items" stays up after the run that sent them. */
export const SYNCED_SHOW_MS = 2 * 60_000;

export interface PillInput {
  /** The safety module says there is no network (or the review flag is on). */
  noSignal: boolean;
  reach: Pick<ReachabilitySnapshot, "state" | "checking" | "lastReachableAt">;
  /** Items the last sync run actually sent, and when that run happened. */
  synced: number;
  syncedAt: number | null;
  /** Things with a destination still waiting to send. */
  waiting: number;
  now: number;
}

function ago(at: number | null, now: number): string | null {
  return at === null ? null : formatAgo(now - at);
}

export function signalPillLabel(i: PillInput): string {
  const waitingText = i.waiting > 0 ? `${i.waiting} waiting to sync` : null;

  // Confirmed gone. The count matters more here than the age of the last success.
  if (i.noSignal || i.reach.state === "offline" || i.reach.state === "nothing-reachable") {
    if (waitingText) return `No signal · ${waitingText}`;
    const last = ago(i.reach.lastReachableAt, i.now);
    return last ? `No signal · last reachable ${last}` : "No signal";
  }

  if (i.reach.state === "reachable") {
    const fresh = i.reach.lastReachableAt !== null && i.now - i.reach.lastReachableAt < REACH_FRESH_MS;
    if (!fresh) {
      const last = ago(i.reach.lastReachableAt, i.now);
      return last ? `Last reachable ${last}` : "Signal not checked";
    }
    if (i.synced > 0 && i.syncedAt !== null && i.now - i.syncedAt < SYNCED_SHOW_MS) {
      return `Signal · synced ${i.synced} ${i.synced === 1 ? "item" : "items"}`;
    }
    if (waitingText) return `Signal · ${waitingText}`;
    return "Signal";
  }

  if (i.reach.checking) return "Checking signal";
  // Nothing checked yet, or a build that never checks: say the count, not a guess.
  return waitingText ?? "Signal not checked";
}

/* -------------------------------------------------------------------------- */
/* The header pill                                                             */
/* -------------------------------------------------------------------------- */

export interface HeaderPillInput {
  /** The safety module says there is no network (or the review flag is on). */
  noSignal: boolean;
  reach: Pick<ReachabilitySnapshot, "state" | "checking">;
  /** Things with a destination still waiting to send. */
  waiting: number;
}

/**
 * The shell header's pill: the signal half, then the saved half — the mockup's
 * `NO SIGNAL · ALL SAVED` (spec §0).
 *
 * BOTH HALVES ARE REAL. The signal half follows exactly the same rule as
 * `signalPillLabel`: "no signal" from either source, "Signal" only from a
 * confirmed check. The saved half is the sync queue and nothing else — with
 * nothing queued everything on this phone is written down, so "All saved"; with
 * items queued it says how many, because claiming "all saved" while a journal
 * entry is still waiting would be the lie this pill exists to prevent.
 *
 * It is rendered uppercase by CSS, so this returns ordinary prose and a screen
 * reader reads words rather than letters.
 */
export function headerPillLabel(i: HeaderPillInput): string {
  /* Shorter words than `signalPillLabel`'s: this one has to fit a pill between
     the mode's name and the SOS button on a 375 px phone. The tap target's
     `aria-label` carries the full sentence. */
  const signal =
    i.noSignal || i.reach.state === "offline" || i.reach.state === "nothing-reachable"
      ? "No signal"
      : i.reach.state === "reachable"
        ? "Signal"
        : i.reach.checking
          ? "Checking"
          : "Not checked";

  const saved = i.waiting > 0 ? `${i.waiting} to sync` : "All saved";
  return `${signal} · ${saved}`;
}

/**
 * Whether the sync runner may run. Only the check can answer this, and the
 * safety module can veto it — `navigator.onLine` is never consulted.
 */
export function confirmedOnline(reach: { state: ReachState }, noSignal: boolean): boolean {
  return !noSignal && reach.state === "reachable";
}

/* -------------------------------------------------------------------------- */
/* The mid-session switch                                                      */
/* -------------------------------------------------------------------------- */

export type AutoSwitch =
  /** Go to Mountain mode now. */
  | "switch"
  /** Everything says switch, but a field has focus. Decide again when it loses it. */
  | "wait-typing"
  /** Everything says switch, but this screen must not be taken away. */
  | "wait-screen"
  | "no";

export interface AutoSwitchInput {
  /** From the check, never from `navigator.onLine`. */
  reach: ReachState;
  inMountainMode: boolean;
  /** The automatic switch has already fired once this session. */
  alreadySwitched: boolean;
  /** The athlete's own trip, inside its dates, today. */
  tripRunningToday: boolean;
  typing: boolean;
  pathname: string;
}

/**
 * Only a trip moves somebody. A dropped connection on its own does not: the
 * offer row (`offer.tsx`) handles that case, because a phone losing signal in a
 * café is not an event worth taking the screen for.
 *
 * ONCE PER SESSION. Mountain mode is sticky, so the only way back out is the
 * athlete choosing it. Switching them again the moment they choose otherwise is
 * an argument, not a safety feature — the offer row still stands there.
 *
 * NOT MID-RECORDING. The live tracker holds the stop control and the athlete is
 * watching it; it draws the SOS button and the turnaround alarm fires over it
 * already, so nothing safety-critical is missing there. The switch waits for
 * them to leave it.
 */
export function decideAutoSwitch(i: AutoSwitchInput): AutoSwitch {
  if (i.inMountainMode || isMountainModePath(i.pathname)) return "no";
  if (i.alreadySwitched) return "no";
  if (!i.tripRunningToday) return "no";
  // "not-checked", "reachable" and "disabled" are all "we do not know it is gone".
  if (i.reach !== "offline" && i.reach !== "nothing-reachable") return "no";
  if (i.typing) return "wait-typing";
  if (isLiveTrackerPath(i.pathname)) return "wait-screen";
  return "switch";
}

/** The shape of a focused element this needs, so tests need no DOM. */
export interface FocusedElement {
  tagName?: string;
  type?: string;
  readOnly?: boolean;
  isContentEditable?: boolean;
}

/** Buttons and tick-boxes are not typing; losing them to a route change costs nothing. */
const NOT_TYPING_INPUTS = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"]);

export function isTypingIn(el: FocusedElement | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable === true) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return !el.readOnly;
  if (tag !== "INPUT") return false;
  if (el.readOnly === true) return false;
  return !NOT_TYPING_INPUTS.has((el.type ?? "text").toLowerCase());
}
