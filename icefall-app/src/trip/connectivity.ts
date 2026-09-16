/**
 * RUNTIME CONNECTIVITY — the question this app has never asked, and the very
 * careful answer it is entitled to give.
 *
 * ============================================================================
 * WHY NOTHING EXISTING COULD BE REUSED
 * ============================================================================
 *
 * `offline/offline.ts` exports `OFFLINE`, and it is a BUILD-TIME flag —
 * `import.meta.env.VITE_ICEFALL_OFFLINE === "1"` — set when a demo bundle is
 * cut. Its own header rejects `navigator.onLine` for a good reason: a laptop on
 * a plane is associated with an access point that routes nowhere, so
 * `navigator.onLine` reads true and would flip a whole demo mid-session.
 *
 * `offline/OfflineBanner.tsx` renders "Offline demo · sample data, not real".
 * That is a statement about the DATA SOURCE, not about the radio, and putting
 * it on a real trip screen would tell an athlete at 4,200 m that their own
 * recorded nights were samples. It would be a lie in the one place a lie costs
 * the most.
 *
 * So a trip screen has to own this question, and this file is the whole answer.
 *
 * ============================================================================
 * THE ASYMMETRY THIS FILE IS BUILT ON
 * ============================================================================
 *
 * `navigator.onLine === false` IS RELIABLE. The browser is reporting that the
 * device has no network interface up at all. It cannot be wrong in the
 * direction that matters.
 *
 * `navigator.onLine === true` IS NOT RELIABLE, and this is exactly the case
 * `offline.ts` warns about: it means an interface exists, not that anything is
 * reachable through it. A tea-house wifi router with a dead uplink, a phone
 * with one bar and no data, a captive portal — all of them read true.
 *
 * So this module reports THREE states and never claims the one it cannot know:
 *
 *   unreachable  the browser says there is no network. Trustworthy.
 *   unknown      there is an interface, or there is no `navigator` to ask.
 *                ICEFALL has NOT checked whether anything is reachable.
 *   -            there is deliberately no "online" state. Claiming one would
 *                need a request, and see below.
 *
 * ============================================================================
 * IT MAKES NO REQUEST, ON PURPOSE
 * ============================================================================
 *
 * It sits on the screen that carries descent advice, and nothing on that path
 * may depend on a network call — including one whose only job is to say the
 * network is down. A hung request is a spinner between somebody and "descend".
 *
 * The reachability check (plan §2.7) therefore lives in
 * `connection/reachability.ts`, which this file never imports. Once that check
 * has CONFIRMED nothing is reachable (repeated failures over ~10 s) it pushes a
 * yes/no verdict in through `setNothingReachable`. The verdict can only move
 * the answer towards "unreachable": a success never overrides the phone saying
 * there is no network, and there is still no "online" state here. The positive
 * "last reachable" answer belongs to the check itself.
 */

import { useEffect, useState } from "react";

export type Reachability = "unreachable" | "unknown";

export interface ConnectivitySignal {
  state: Reachability;
  /** One sentence, safe to render alone. Never claims a working connection. */
  label: string;
  /** Longer explanation for the screen that wants to be explicit. */
  detail: string;
}

export const UNREACHABLE: ConnectivitySignal = {
  state: "unreachable",
  label: "No network",
  detail:
    "Your phone reports no network connection. Nothing on this screen needs one — the schedule, the self-check and the timeline are all computed here, on this device, from what you have recorded.",
};

export const UNKNOWN: ConnectivitySignal = {
  state: "unknown",
  label: "Network not checked",
  detail:
    "Your phone reports a network connection, which is not the same as anything being reachable through it — a tea-house router with a dead uplink reports exactly this. This screen never waits on a network request, because it carries descent advice. Nothing here needs one either way.",
};

export const NOTHING_REACHABLE: ConnectivitySignal = {
  state: "unreachable",
  label: "No signal",
  detail:
    "Your phone says it is connected, but ICEFALL tried several times and could not reach anything through it. Nothing on this screen needs a signal.",
};

/* The confirmed verdict from the reachability check. Module state rather than
   an import, so the safety core's closure stays free of anything that calls out. */
let nothingReachable = false;
const verdictListeners = new Set<() => void>();

/** Called by the reachability check only. True = confirmed nothing reachable. */
export function setNothingReachable(on: boolean): void {
  if (nothingReachable === on) return;
  nothingReachable = on;
  verdictListeners.forEach((fn) => fn());
}

/** Change notifications for the signal: interface events plus the confirmed verdict. */
export function subscribeConnectivity(fn: () => void): () => void {
  verdictListeners.add(fn);
  const hasWindow = typeof window !== "undefined";
  if (hasWindow) {
    window.addEventListener("online", fn);
    window.addEventListener("offline", fn);
  }
  return () => {
    verdictListeners.delete(fn);
    if (hasWindow) {
      window.removeEventListener("online", fn);
      window.removeEventListener("offline", fn);
    }
  };
}

/** The current signal, computed with no side effects and no request. */
export function readConnectivity(): ConnectivitySignal {
  /* The Mountain mode review switch (`offline/offline.ts` FORCE_MOUNTAIN).
     Read inline rather than imported so this file keeps zero imports of its
     own, and so the branch folds away in a normal build. */
  if (import.meta.env.VITE_ICEFALL_FORCE_MOUNTAIN === "1") return UNREACHABLE;
  /* `navigator` is absent under the test runner and in any non-DOM context.
     Absent means unknown, which is the honest reading — not "online". */
  if (typeof navigator !== "undefined" && navigator.onLine === false) return UNREACHABLE;
  if (nothingReachable) return NOTHING_REACHABLE;
  return UNKNOWN;
}

/**
 * The signal, kept current.
 *
 * Listens to the browser's own `online`/`offline` events and the confirmed
 * verdict. No polling and no timer here: a trip screen open in a tent
 * overnight must not wake the radio.
 */
export function useConnectivity(): ConnectivitySignal {
  const [signal, setSignal] = useState<ConnectivitySignal>(readConnectivity);

  useEffect(() => {
    const update = () => setSignal(readConnectivity());
    update();
    return subscribeConnectivity(update);
  }, []);

  return signal;
}

/**
 * What the trip screen says about itself, at every connectivity state.
 *
 * IT IS THE SAME SENTENCE EITHER WAY, which is the point: the claim is about
 * where the arithmetic happens, and that does not change with the radio.
 */
export const COMPUTED_ON_THIS_DEVICE =
  "Everything on this screen is worked out on your phone, from what you have recorded on it. It does not need a signal, and losing one changes nothing here.";
