/**
 * THE SIGNAL, WIRED UP (brief M2). The rules are in `signal.ts`; this file only
 * collects the inputs and acts on the answer.
 *
 * `useSignalPill` is the shell's top bar. It also carries the sync runner:
 * `useSyncQueue` runs the queue the moment the check confirms a connection, so
 * REGAINING SIGNAL SYNCS AND SAYS SO — and never leaves Mountain mode, because
 * nothing here calls `leaveMountainMode`.
 *
 * `useAutoMountainSwitch` belongs in the full app, above the routes. It does
 * nothing at all until the check has CONFIRMED the connection is gone.
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { checkReachability, startReachabilityWatch, useReachability } from "@/connection/reachability";
import { useSyncQueue } from "@/device/useSyncQueue";
import { useConnectivity } from "@/trip/connectivity";

import { autoSwitchTaken, enterMountainMode, markAutoSwitchTaken, useMountainModeActive } from "./mode";
import { MOUNTAIN_PATHS } from "./paths";
import { confirmedOnline, decideAutoSwitch, headerPillLabel, isTypingIn, signalPillLabel } from "./signal";
import { realTripRunningToday } from "./tripModel";

/** "14 min ago" has to age. One minute is the smallest unit the pill prints. */
const TICK_MS = 60_000;

function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    // A phone in a pocket for four hours must not come back showing "just now".
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

/* -------------------------------------------------------------------------- */
/* The check itself                                                            */
/* -------------------------------------------------------------------------- */

let watchStarted = false;

/**
 * Starts the reachability watch, at most once per page load however many
 * places ask — the shell needs it for the pill, and the full app needs it for
 * the automatic switch, and neither should have to know about the other.
 *
 * IT IS NEVER TORN DOWN. The watch has no timer of its own; it listens for
 * network events and for the app coming back to the front. Stopping it on
 * unmount would only mean starting it again on the next mount, and each start
 * costs a fresh check — twice over in StrictMode.
 */
export function useReachabilityWatch(): void {
  useEffect(() => {
    if (watchStarted) return;
    watchStarted = true;
    startReachabilityWatch();
  }, []);
}

export interface SignalPill {
  /** "No signal", "Signal", "Signal · synced 3 items", "No signal · 3 waiting to sync". */
  label: string;
  /** The shell header's shorter two-part pill: "No signal · All saved". */
  headerLabel: string;
  /** No network, or the review flag: the pill's dot goes red. */
  noSignal: boolean;
  checking: boolean;
  /** The check confirmed a connection. The only thing allowed to say so. */
  online: boolean;
  /** Things with a destination still waiting to send. */
  waiting: number;
  /** False in a build that never checks: the row must not offer "Check". */
  canCheck: boolean;
  /** Tap the pill: check now. */
  check: () => void;
}

export function useSignalPill(): SignalPill {
  // Without this the pill would sit on "Signal not checked" until someone tapped it.
  useReachabilityWatch();
  const signal = useConnectivity();
  const reach = useReachability();
  const now = useMinuteTick();

  const noSignal = signal.state === "unreachable";
  const online = confirmedOnline(reach, noSignal);
  const queue = useSyncQueue({ confirmedOnline: online });

  return {
    label: signalPillLabel({
      noSignal,
      reach,
      synced: queue.lastResult?.sent ?? 0,
      syncedAt: queue.lastResult?.at ?? null,
      waiting: queue.waiting,
      now,
    }),
    headerLabel: headerPillLabel({ noSignal, reach, waiting: queue.waiting }),
    noSignal,
    checking: reach.checking,
    online,
    waiting: queue.waiting,
    canCheck: reach.state !== "disabled",
    check: () => void checkReachability(),
  };
}

/**
 * Mount once in the full app, inside the router. Switches into Mountain mode
 * when a trip is running today and the check has confirmed there is nothing
 * reachable — never on `navigator.onLine`, which reads true on a mountain.
 *
 * It waits while a field has focus: taking the screen away mid-word loses what
 * was typed, and nothing about the decision expires.
 */
export function useAutoMountainSwitch(): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reach = useReachability();
  const inMountainMode = useMountainModeActive();
  const [focusLeft, setFocusLeft] = useState(0);

  useEffect(() => {
    const decision = decideAutoSwitch({
      reach: reach.state,
      inMountainMode,
      alreadySwitched: autoSwitchTaken(),
      tripRunningToday: realTripRunningToday() !== null,
      typing: isTypingIn(typeof document === "undefined" ? null : document.activeElement),
      pathname,
    });

    if (decision === "switch") {
      markAutoSwitchTaken();
      enterMountainMode();
      navigate(MOUNTAIN_PATHS.now);
      return;
    }
    // "wait-screen" re-decides on the next route change, which is the event it waits for.
    if (decision !== "wait-typing") return;

    // focusout fires while focus is still leaving; decide on the next turn instead.
    const onFocusOut = () => setTimeout(() => setFocusLeft((n) => n + 1), 0);
    document.addEventListener("focusout", onFocusOut);
    return () => document.removeEventListener("focusout", onFocusOut);
  }, [reach.state, inMountainMode, pathname, focusLeft, navigate]);
}
