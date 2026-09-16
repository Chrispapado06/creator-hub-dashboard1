/**
 * THE REACHABILITY CHECK (plan §2.7, brief M2).
 *
 * `navigator.onLine === true` only means an interface is up. A tea-house router
 * with a dead uplink, one bar with no data or a captive portal all read true.
 * So this asks our own server for a 13-byte file and checks the body, which
 * also catches a captive portal answering 200 with its login page.
 *
 *   · One success ends the check at once: "reachable".
 *   · Offline is declared only after REACH_ATTEMPTS failures spread over about
 *     ten seconds (attempts at 0 s, 5 s and 10 s, each with a 4 s limit).
 *   · `navigator.onLine === false` is trusted immediately and makes no request.
 *
 * It never runs on a timer. It checks when the watch starts, when the phone
 * reports a network again, when the app comes back to the front (at most once
 * a minute), when another request fails, and when the athlete taps Check. A
 * check costs one small request, well under the ~3 KB the plan budgets.
 *
 * It stays OFF the safety path: `trip/connectivity.ts` never imports this file.
 * The confirmed "nothing reachable" verdict is pushed into it through
 * `setNothingReachable`, which can only move that answer towards "no signal".
 *
 * Offline flight builds (VITE_ICEFALL_OFFLINE=1) and the review switch
 * (VITE_ICEFALL_FORCE_MOUNTAIN=1) never probe: the flight bundle is served from
 * a laptop, so a success would only prove the laptop answers.
 */

import { useSyncExternalStore } from "react";
import { FORCE_MOUNTAIN, OFFLINE } from "@/offline/offline";
import { setNothingReachable } from "@/trip/connectivity";

export const REACH_PATH = "/reachability.txt";
export const REACH_TOKEN = "ICEFALL-OK-1";
export const REACH_TIMEOUT_MS = 4_000;
export const REACH_ATTEMPT_GAP_MS = 5_000;
export const REACH_ATTEMPTS = 3;
/** Coming back to the front re-checks only if the last check is older than this. */
export const REACH_MIN_RECHECK_MS = 60_000;
/** A success younger than this reads as plain "Signal". */
export const REACH_FRESH_MS = 2 * 60_000;

export type ReachState =
  /** Nothing has been checked yet. */
  | "not-checked"
  /** The phone reports no network. Trusted, no request made. */
  | "offline"
  /** Our server answered with the right body. */
  | "reachable"
  /** Every attempt over ~10 s failed while the phone said it had a network. */
  | "nothing-reachable"
  /** This build never checks. */
  | "disabled";

export interface ReachabilitySnapshot {
  state: ReachState;
  checking: boolean;
  lastReachableAt: number | null;
  lastCheckedAt: number | null;
  disabledReason: string | null;
}

export interface ReachabilityDeps {
  /** Resolves true only when our server answered with the expected body. */
  probe: (signal: AbortSignal) => Promise<boolean>;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  interfaceDown: () => boolean;
  onVerdict?: (nothingReachable: boolean) => void;
  disabledReason?: string | null;
}

export interface ReachabilityEngine {
  get: () => ReachabilitySnapshot;
  subscribe: (fn: () => void) => () => void;
  /** Starts a check, or joins the one already running. Never rejects. */
  check: () => Promise<ReachabilitySnapshot>;
  /** The browser fired `online` or `offline`. */
  interfaceChanged: () => void;
  /** A real request just succeeded, so no probe is needed. */
  noteRequestSucceeded: () => void;
  /** A real request just failed: check, unless we already know. */
  noteRequestFailed: () => void;
}

export function createReachability(deps: ReachabilityDeps): ReachabilityEngine {
  const disabledReason = deps.disabledReason ?? null;
  let snap: ReachabilitySnapshot = {
    state: disabledReason ? "disabled" : "not-checked",
    checking: false,
    lastReachableAt: null,
    lastCheckedAt: null,
    disabledReason,
  };
  const listeners = new Set<() => void>();
  let run: Promise<ReachabilitySnapshot> | null = null;
  let runId = 0;
  let abortAttempt: (() => void) | null = null;

  const set = (patch: Partial<ReachabilitySnapshot>) => {
    snap = { ...snap, ...patch };
    listeners.forEach((fn) => fn());
  };

  const invalidateRun = () => {
    runId++;
    run = null;
    abortAttempt?.();
    abortAttempt = null;
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => void deps.setTimer(resolve, ms));

  const attempt = () =>
    new Promise<boolean>((resolve) => {
      const ctrl = new AbortController();
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        deps.clearTimer(timer);
        resolve(ok);
      };
      const timer = deps.setTimer(() => {
        ctrl.abort();
        finish(false);
      }, REACH_TIMEOUT_MS);
      abortAttempt = () => {
        ctrl.abort();
        finish(false);
      };
      let probing: Promise<boolean>;
      try {
        probing = deps.probe(ctrl.signal);
      } catch {
        probing = Promise.resolve(false);
      }
      probing.then(
        (ok) => finish(ok === true),
        () => finish(false),
      );
    });

  const markReachable = () => {
    deps.onVerdict?.(false);
    const t = deps.now();
    set({ state: "reachable", checking: false, lastReachableAt: t, lastCheckedAt: t });
  };

  async function runCheck(id: number): Promise<ReachabilitySnapshot> {
    const started = deps.now();
    for (let i = 0; i < REACH_ATTEMPTS; i++) {
      if (i > 0) {
        const wait = started + i * REACH_ATTEMPT_GAP_MS - deps.now();
        if (wait > 0) await sleep(wait);
        if (id !== runId) return snap;
      }
      if (deps.interfaceDown()) {
        invalidateRun();
        set({ state: "offline", checking: false });
        return snap;
      }
      const ok = await attempt();
      if (id !== runId) return snap;
      if (ok) {
        markReachable();
        run = null;
        return snap;
      }
      set({ lastCheckedAt: deps.now() });
    }
    deps.onVerdict?.(true);
    set({ state: "nothing-reachable", checking: false });
    run = null;
    return snap;
  }

  const check = (): Promise<ReachabilitySnapshot> => {
    if (disabledReason) return Promise.resolve(snap);
    if (run) return run;
    if (deps.interfaceDown()) {
      set({ state: "offline", checking: false });
      return Promise.resolve(snap);
    }
    const id = ++runId;
    set({ checking: true });
    run = runCheck(id).catch(() => snap);
    return run;
  };

  return {
    get: () => snap,
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    check,
    interfaceChanged() {
      if (disabledReason) return;
      if (deps.interfaceDown()) {
        // The confirmed verdict is left alone: if the interface comes back with
        // nothing behind it, the screen must not flicker to "not checked".
        invalidateRun();
        set({ state: "offline", checking: false });
      } else {
        void check();
      }
    },
    noteRequestSucceeded() {
      if (disabledReason) return;
      invalidateRun();
      markReachable();
    },
    noteRequestFailed() {
      if (disabledReason || run) return;
      const recent = snap.lastCheckedAt !== null && deps.now() - snap.lastCheckedAt < REACH_MIN_RECHECK_MS;
      if (recent && snap.state === "nothing-reachable") return;
      void check();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

export function formatAgo(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/**
 * The signal pill. Never says "Signal" off an old success: past REACH_FRESH_MS
 * it says when we last reached anything instead.
 */
export function reachabilityLabel(s: ReachabilitySnapshot, now: number, syncedItems = 0): string {
  const ago = s.lastReachableAt === null ? null : formatAgo(now - s.lastReachableAt);
  switch (s.state) {
    case "disabled":
      return "Signal not checked";
    case "offline":
    case "nothing-reachable":
      return ago ? `No signal · last reachable ${ago}` : "No signal";
    case "reachable": {
      if (s.lastReachableAt !== null && now - s.lastReachableAt < REACH_FRESH_MS) {
        if (syncedItems > 0) return `Signal · synced ${syncedItems} ${syncedItems === 1 ? "item" : "items"}`;
        return "Signal";
      }
      return `Last reachable ${ago}`;
    }
    default:
      return s.checking ? "Checking signal" : "Signal not checked";
  }
}

/* -------------------------------------------------------------------------- */
/* The browser singleton                                                       */
/* -------------------------------------------------------------------------- */

async function probeOwnServer(signal: AbortSignal): Promise<boolean> {
  const res = await fetch(`${REACH_PATH}?t=${Date.now()}`, {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal,
  });
  if (!res.ok) return false;
  return (await res.text()).trim() === REACH_TOKEN;
}

function buildDisabledReason(): string | null {
  if (FORCE_MOUNTAIN) return "Review switch is on: the signal is forced off.";
  if (OFFLINE) return "This is an offline build. It does not check for a signal.";
  return null;
}

let engine: ReachabilityEngine | null = null;

function browserEngine(): ReachabilityEngine {
  if (!engine) {
    engine = createReachability({
      probe: probeOwnServer,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      interfaceDown: () => typeof navigator !== "undefined" && navigator.onLine === false,
      onVerdict: setNothingReachable,
      disabledReason: buildDisabledReason(),
    });
  }
  return engine;
}

export const getReachability = (): ReachabilitySnapshot => browserEngine().get();
export const subscribeReachability = (fn: () => void): (() => void) => browserEngine().subscribe(fn);
export const checkReachability = (): Promise<ReachabilitySnapshot> => browserEngine().check();
export const noteRequestSucceeded = (): void => browserEngine().noteRequestSucceeded();
export const noteRequestFailed = (): void => browserEngine().noteRequestFailed();

/**
 * Mount once, near the top of the app. Returns the cleanup. The first check is
 * deferred so it can never hold up the first frame.
 */
export function startReachabilityWatch(): () => void {
  if (typeof window === "undefined") return () => {};
  const e = browserEngine();
  const onInterface = () => e.interfaceChanged();
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    const last = e.get().lastCheckedAt;
    if (last === null || Date.now() - last >= REACH_MIN_RECHECK_MS) void e.check();
  };
  window.addEventListener("online", onInterface);
  window.addEventListener("offline", onInterface);
  document.addEventListener("visibilitychange", onVisible);
  const first = setTimeout(() => void e.check(), 0);
  return () => {
    clearTimeout(first);
    window.removeEventListener("online", onInterface);
    window.removeEventListener("offline", onInterface);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function useReachability(): ReachabilitySnapshot {
  return useSyncExternalStore(subscribeReachability, getReachability, getReachability);
}
