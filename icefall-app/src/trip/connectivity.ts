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
 * The obvious way to upgrade "unknown" to "online" is to fetch something small
 * and see if it comes back. This module does not, and must not:
 *
 *   · It sits on the screen that carries descent advice. Nothing on that path
 *     may depend on a network call, including a network call whose only job is
 *     to say the network is down. A hung request is a spinner between somebody
 *     and the word "descend".
 *   · A probe on a metered satellite connection costs the athlete money to
 *     learn something the screen does not need to know.
 *   · The trip screen computes everything locally anyway. "Are we online?" is
 *     not a question any figure on it depends on — it is context for the
 *     athlete, and context is not worth a request.
 *
 * The honest consequence is that ICEFALL says "not checked" rather than
 * "online", forever. That is the true sentence.
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
    "Your phone reports a network connection, which is not the same as anything being reachable through it — a tea-house router with a dead uplink reports exactly this. ICEFALL has not checked, and deliberately does not check: it will not put a network request in front of a screen that carries descent advice. Nothing here needs one either way.",
};

/** The current signal, computed with no side effects and no request. */
export function readConnectivity(): ConnectivitySignal {
  /* `navigator` is absent under the test runner and in any non-DOM context.
     Absent means unknown, which is the honest reading — not "online". */
  if (typeof navigator === "undefined") return UNKNOWN;
  return navigator.onLine === false ? UNREACHABLE : UNKNOWN;
}

/**
 * The signal, kept current.
 *
 * Subscribes to the browser's own `online`/`offline` events, which cost
 * nothing and fire when the interface genuinely changes. There is no polling
 * and no timer: a trip screen open in a tent overnight must not wake the radio.
 */
export function useConnectivity(): ConnectivitySignal {
  const [signal, setSignal] = useState<ConnectivitySignal>(readConnectivity);

  useEffect(() => {
    const update = () => setSignal(readConnectivity());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
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
