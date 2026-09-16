/**
 * Whether the athlete is in Mountain mode this session.
 *
 * Entering is sticky: regaining signal never exits (plan §2.2). Only "Open full
 * app" or "Back down / End trip" leaves. Kept in sessionStorage, so a reload
 * keeps it and a cold relaunch re-runs the boot decision instead.
 */

import { useEffect, useState } from "react";

const KEY = "icefall.mountain.mode.v1";
/** The automatic mid-session switch has fired once this session (M2). */
const AUTO_KEY = "icefall.mountain.auto.v1";

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    /* in memory only */
  }
}

const hasSession = typeof sessionStorage !== "undefined";
let active = hasSession && readFlag(KEY);
const listeners = new Set<(on: boolean) => void>();

function set(on: boolean) {
  if (active === on) return;
  active = on;
  writeFlag(KEY, on);
  listeners.forEach((l) => l(on));
}

export const enterMountainMode = () => set(true);
export const leaveMountainMode = () => set(false);
export const isMountainModeActive = () => active;

/* -------------------------------------------------------------------------- */
/* The automatic switch fires at most once a session                           */
/* -------------------------------------------------------------------------- */

/**
 * Losing signal with a trip running switches the athlete over automatically
 * (M2). Leaving again is a deliberate choice — "Open full app" or "Back down" —
 * and switching them straight back would be an argument with them, and a loop
 * with the back button. So the automatic switch is spent once used; the offer
 * row still stands on every screen while there is no signal.
 */
let autoTaken = hasSession && readFlag(AUTO_KEY);

export const autoSwitchTaken = () => autoTaken;

export function markAutoSwitchTaken(): void {
  if (autoTaken) return;
  autoTaken = true;
  writeFlag(AUTO_KEY, true);
}

/** TEST SEAM. */
export function __resetMountainModeForTests(): void {
  autoTaken = false;
  writeFlag(AUTO_KEY, false);
  set(false);
}

export function useMountainModeActive(): boolean {
  const [on, setOn] = useState(active);
  useEffect(() => {
    listeners.add(setOn);
    setOn(active);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}
