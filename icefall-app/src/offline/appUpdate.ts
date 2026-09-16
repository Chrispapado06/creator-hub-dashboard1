/// <reference types="vite-plugin-pwa/client" />
/**
 * SERVICE WORKER REGISTRATION AND HELD UPDATES (Mountain mode plan §2.3).
 *
 * `vite.config.ts` builds the worker with `registerType: "prompt"`, so a new
 * version installs its files in the background and then WAITS; the old files
 * stay on the phone and keep serving the open page. This module decides when
 * the waiting version may take over, using `appUpdateModel.ts`.
 *
 * Importing this module (from main.tsx) also stops vite-plugin-pwa injecting
 * its own `registerSW.js`, so there is exactly one registration.
 *
 * In `npm run dev` the worker is disabled and `registerSW` does nothing.
 */

import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

import { activeSessionSummary } from "@/tracking/activeSession";
import { realTripRunningToday } from "@/mountain/tripModel";

import { decideUpdate, type UpdateDecision } from "./appUpdateModel";

const HELD_KEY = "icefall.appUpdate.heldSince.v1";
/** Ask the server for a new version at most this often, only when the app comes to the front. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

export interface AppUpdateState {
  /** A new version is installed and waiting. */
  ready: boolean;
  decision: UpdateDecision | null;
  heldSince: number | null;
}

let state: AppUpdateState = { ready: false, decision: null, heldSince: null };
const listeners = new Set<() => void>();
let apply: ((reload?: boolean) => Promise<void>) | null = null;
let started = false;

function setState(next: AppUpdateState) {
  state = next;
  listeners.forEach((fn) => fn());
}

function readHeld(): number | null {
  try {
    const n = Number(localStorage.getItem(HELD_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeHeld(v: number | null) {
  try {
    if (v === null) localStorage.removeItem(HELD_KEY);
    else localStorage.setItem(HELD_KEY, String(v));
  } catch {
    /* storage refused: the hold still works for this page load */
  }
}

function install() {
  if (!apply) return;
  writeHeld(null);
  void apply(true);
}

/** Re-run the decision. Call after a trip ends or a recording stops. */
export function reevaluateAppUpdate(): void {
  if (!state.ready) return;
  const now = Date.now();
  const heldSince = readHeld() ?? now;
  const decision = decideUpdate({
    tripToday: realTripRunningToday() !== null,
    recording: activeSessionSummary() !== null,
    heldSince,
    now,
    hidden: document.visibilityState === "hidden",
  });
  if (decision === "install") return install();
  writeHeld(heldSince);
  setState({ ready: true, decision, heldSince });
}

/** The explicit "Install now" on the Trip tab. Reloads the app. */
export function installAppUpdateNow(): void {
  install();
}

/** Call once from main.tsx. Never waits on the network; never blocks drawing. */
export function startAppUpdates(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  let lastCheck = Date.now();

  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      setState({ ...state, ready: true });
      reevaluateAppUpdate();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      if (!reg.waiting) writeHeld(null);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible" || !navigator.onLine) return;
        if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
        lastCheck = Date.now();
        reg.update().catch(() => {
          /* no signal: the next return to the app tries again */
        });
      });
    },
  });

  document.addEventListener("visibilitychange", reevaluateAppUpdate);
  window.addEventListener("focus", reevaluateAppUpdate);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For the Trip tab row: show it when `ready && decision !== null`. */
export function useAppUpdate(): AppUpdateState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
