/**
 * THE BOOT DECISION — where a cold start opens (plan §2.2 CORRECTED, §10.4 item 4).
 *
 * Synchronous, from storage only, before the splash timer and before the
 * login check. Nothing here waits on anything.
 *
 * | Condition                                              | Opens                          |
 * |--------------------------------------------------------|--------------------------------|
 * | The athlete's own trip is running today — whatever the | Mountain mode · Now            |
 * | network says                                           |                                |
 * | The phone reports no network                           | Mountain mode · Now when a     |
 * |                                                        | recording is unfinished or the |
 * |                                                        | example trip is on; otherwise  |
 * |                                                        | "nothing is running"           |
 * | Anything else                                          | Exactly today's behaviour      |
 *
 * THE NETWORK IS NOT THE TRIGGER A TRIP IS. A phone on a mountain usually says
 * it is online — one bar with no data, a tea-house router — so the trip is the
 * signal, and "no network" only adds the case with no trip.
 *
 * ONE DELIBERATE NARROWING OF THE PLAN: §2.2 also opens Mountain mode for an
 * unfinished recording whatever the network says. That would move somebody
 * with an unfinished evening run at home out of the full app, which breaks
 * the brief's rule that the app keeps working exactly as before online. So an
 * unfinished recording only decides Now when there is no network; with a trip
 * running today the trip already decides it.
 *
 * THE OFFLINE REVIEW BUNDLE (`VITE_ICEFALL_OFFLINE=1`) never auto-enters: it is
 * the owner's copy of the full app and opens exactly as it does today. With
 * `VITE_ICEFALL_FORCE_MOUNTAIN=1` connectivity reads "unreachable" from the
 * first frame, so the rules above send it into Mountain mode.
 *
 * Only the launch surfaces are intercepted — "/" and the manifest's start_url
 * "/home" — and only once per page load. A deep link opens where it points.
 */

import { readConnectivity, type Reachability } from "@/trip/connectivity";
import { activeSessionSummary } from "@/tracking/activeSession";

import { buildExampleTrip } from "./exampleTrip";
import { MOUNTAIN_PATHS } from "./paths";
import { realTripRunningToday } from "./tripModel";

export interface BootInput {
  reachability: Reachability;
  /** Built with VITE_ICEFALL_OFFLINE=1. */
  offlineBundle: boolean;
  /** Built with VITE_ICEFALL_FORCE_MOUNTAIN=1. */
  forced: boolean;
  /** The athlete's own trip is inside its dates today and not closed. */
  ownTripToday: boolean;
  /** A recording was left in progress. */
  unfinishedRecording: boolean;
  /** The review example trip exists in this build. */
  exampleTrip: boolean;
}

/** Pure. A path to open instead, or null for today's behaviour. */
export function decideBoot(input: BootInput): string | null {
  if (input.offlineBundle && !input.forced) return null;
  if (input.ownTripToday) return MOUNTAIN_PATHS.now;
  if (input.reachability === "unreachable") {
    return input.unfinishedRecording || input.exampleTrip ? MOUNTAIN_PATHS.now : MOUNTAIN_PATHS.root;
  }
  return null;
}

export const LAUNCH_PATHS: readonly string[] = ["/", "/home"];

export function readBootInput(): BootInput {
  return {
    reachability: readConnectivity().state,
    offlineBundle: import.meta.env.VITE_ICEFALL_OFFLINE === "1",
    forced: import.meta.env.VITE_ICEFALL_FORCE_MOUNTAIN === "1",
    ownTripToday: realTripRunningToday() !== null,
    unfinishedRecording: activeSessionSummary() !== null,
    exampleTrip: buildExampleTrip() !== null,
  };
}

/** undefined: not asked yet this page load. null: nothing to do, or already used. */
let cached: string | null | undefined;

/**
 * The redirect for this page load's first route, or null.
 *
 * Idempotent until consumed — React renders twice in StrictMode and may
 * remount, and a one-shot answer would be lost to the discarded render.
 */
export function bootRedirectFor(pathname: string): string | null {
  if (cached === undefined) {
    cached = LAUNCH_PATHS.includes(pathname) ? decideBoot(readBootInput()) : null;
  }
  return cached;
}

/** Once the first route has moved on, the decision is spent for this page load. */
export function consumeBootRedirect(): void {
  cached = null;
}

/** TEST SEAM. */
export function __resetBootForTests(): void {
  cached = undefined;
}
