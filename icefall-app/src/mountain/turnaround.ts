/**
 * THE TURNAROUND TIME — the field nothing in ICEFALL held (plan §1.3, §3.7).
 *
 * The athlete or their guide types it. Unset is the default and it is a
 * visible state; there is no itinerary to default from and no time is ever
 * invented.
 *
 * STORED TWICE, ON PURPOSE (plan §9.1 point 11): the absolute moment the alarm
 * fires on, and the date, time and time zone that were typed. A phone still on
 * home time after a flight makes the two disagree in a way a screen can show.
 *
 * THE WALL CLOCK DECIDES, NEVER A TIMER. Phones freeze timers in the
 * background, so every phase is computed from `Date.now()` at the moment it is
 * asked. A ticking display may drive the digits; it never decides.
 *
 * localStorage, because it must draw on the first frame (plan §2.4). No
 * network, ever.
 */

import { useEffect, useState } from "react";

export interface TurnaroundSetting {
  /** `MountainTrip.id` — a real trip id, or the example trip's id. */
  tripId: string;
  /** The absolute moment, ISO 8601 UTC. What the alarm fires on. */
  at: string;
  /** The calendar date that was typed, YYYY-MM-DD, in `timeZone`. */
  date: string;
  /** The time that was typed, HH:MM, 24-hour, in `timeZone`. */
  time: string;
  /** The phone's IANA time zone when it was set, e.g. "Europe/Paris". */
  timeZone: string;
  setAt: string;
  /** While in the future, the alarm is snoozed. */
  snoozedUntil: string | null;
  snoozeCount: number;
  /** When "Turning around" was tapped. Ends the alarm for this setting. */
  turnedAt: string | null;
  /** The last moment an alarm surface on screen looked at the clock. */
  lastObservedAt: string | null;
  /** Set when the alarm came due while nothing was on screen to show it. */
  missedAt: string | null;
  /** When the athlete saw the "did not sound" screen. */
  missedSeenAt: string | null;
}

/** Amber accent, and the screen lock is held, inside this window. */
export const AMBER_WINDOW_MS = 30 * 60_000;
export const SNOOZE_MS = 15 * 60_000;
/** After this many snoozes it stops interrupting but never goes quiet. */
export const MAX_SNOOZES = 3;
/** How late a first observation can be before the alarm counts as missed. */
export const MISSED_GRACE_MS = 2 * 60_000;
/** The full-app banner stops being dismissible inside this window. */
export const OFFER_WINDOW_MS = 60 * 60_000;

/** Plan §3.7, word for word. Shown where the time is set, not in a help page. */
export const ALARM_LIMITS =
  "This alarm only sounds while ICEFALL is open on the screen. If you lock your phone or switch to another app, it will not sound. If your phone is in low-power mode the screen may darken anyway. On an iPhone this alarm cannot vibrate, and it will make no sound if your ringer switch is off — it is a screen you have to be looking at. Set an alarm on your watch or your phone's own clock as well. The ICEFALL app for iPhone and Android will fix this; this one cannot.";

/** Plan §3.7: the arming screen's FIRST instruction. */
export const ARMING_FIRST_LINE =
  "Set this on your watch or your phone's own clock. ICEFALL will also show it, but only while the app is open.";

export const TURNAROUND_UNSET = "No turnaround time set.";
export const GUIDE_FIRST = "Your guide's call comes first.";

export type TurnaroundPhase =
  | { kind: "unset" }
  /** More than 30 minutes to go. */
  | { kind: "set"; msLeft: number }
  /** 30 minutes or less to go — amber. */
  | { kind: "countdown"; msLeft: number }
  /** Passed, not snoozed, not yet acknowledged — full-screen amber. */
  | { kind: "due"; msOver: number }
  | { kind: "snoozed"; msOver: number; msUntilSnoozeEnds: number }
  /** Passed after MAX_SNOOZES — a permanent amber line counting up. */
  | { kind: "overdue"; msOver: number }
  /** It came due while ICEFALL was not open. Full screen until seen. */
  | { kind: "missed"; msOver: number; missedAt: string }
  | { kind: "turned"; turnedAt: string };

/* -------------------------------------------------------------------------- */
/* Pure                                                                        */
/* -------------------------------------------------------------------------- */

/** The phase at `now`. Pure: the same setting and clock always give the same answer. */
export function turnaroundPhase(
  setting: TurnaroundSetting | null,
  now: number = Date.now(),
): TurnaroundPhase {
  if (!setting) return { kind: "unset" };
  const at = Date.parse(setting.at);
  if (Number.isNaN(at)) return { kind: "unset" };
  if (setting.turnedAt) return { kind: "turned", turnedAt: setting.turnedAt };
  const left = at - now;
  if (left > AMBER_WINDOW_MS) return { kind: "set", msLeft: left };
  if (left > 0) return { kind: "countdown", msLeft: left };
  const over = -left;
  if (setting.missedAt && !setting.missedSeenAt) {
    return { kind: "missed", msOver: over, missedAt: setting.missedAt };
  }
  const snoozeEnd = setting.snoozedUntil ? Date.parse(setting.snoozedUntil) : NaN;
  if (!Number.isNaN(snoozeEnd) && snoozeEnd > now) {
    return { kind: "snoozed", msOver: over, msUntilSnoozeEnds: snoozeEnd - now };
  }
  if (setting.snoozeCount >= MAX_SNOOZES) return { kind: "overdue", msOver: over };
  return { kind: "due", msOver: over };
}

/** Milliseconds to the turnaround (negative once passed), or null when unset/turned. */
export function msUntilTurnaround(setting: TurnaroundSetting | null, now: number = Date.now()): number | null {
  if (!setting || setting.turnedAt) return null;
  const at = Date.parse(setting.at);
  return Number.isNaN(at) ? null : at - now;
}

/** The phone's time zone, or "UTC" where the browser will not say. */
export function phoneTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** A typed local date + time as an absolute moment, or null if either does not parse. */
export function localMoment(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const hh = Number(t[1]);
  const mm = Number(t[2]);
  if (hh > 23 || mm > 59) return null;
  const m = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mm, 0, 0);
  return Number.isNaN(m.getTime()) ? null : m;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

const KEY = "icefall.mountain.turnaround.v1";

type Stored = Record<string, TurnaroundSetting>;

/** The fields every stored setting must carry; the rest default on read. */
type StoredSetting = Pick<TurnaroundSetting, "tripId" | "at" | "date" | "time" | "snoozeCount"> &
  Partial<TurnaroundSetting>;

function isSetting(v: unknown): v is StoredSetting {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.tripId === "string" &&
    typeof r.at === "string" &&
    !Number.isNaN(Date.parse(r.at)) &&
    typeof r.date === "string" &&
    typeof r.time === "string" &&
    typeof r.snoozeCount === "number"
  );
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Stored = {};
    for (const [k, v] of Object.entries(p ?? {})) {
      if (isSetting(v)) {
        out[k] = {
          timeZone: "UTC",
          setAt: v.at,
          snoozedUntil: null,
          turnedAt: null,
          lastObservedAt: null,
          missedAt: null,
          missedSeenAt: null,
          ...v,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

let current: Stored = typeof localStorage === "undefined" ? {} : read();
const listeners = new Set<() => void>();

function write(next: Stored) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage full: the setting holds for this session. */
  }
  listeners.forEach((l) => l());
}

function patch(tripId: string, fn: (s: TurnaroundSetting) => TurnaroundSetting | null) {
  const s = current[tripId];
  if (!s) return;
  const next = fn(s);
  if (next === s) return;
  const copy = { ...current };
  if (next) copy[tripId] = next;
  else delete copy[tripId];
  write(copy);
}

export function readTurnaround(tripId: string | null | undefined): TurnaroundSetting | null {
  if (!tripId) return null;
  return current[tripId] ?? null;
}

/**
 * Set (or replace) the turnaround for a trip from a typed local date and time.
 * Replacing clears snoozes, the missed state and "turned around".
 */
export function setTurnaround(
  tripId: string,
  date: string,
  time: string,
  now: Date = new Date(),
): TurnaroundSetting | { error: string } {
  const moment = localMoment(date, time);
  if (!moment) return { error: "That is not a time ICEFALL can read." };
  const setting: TurnaroundSetting = {
    tripId,
    at: moment.toISOString(),
    date,
    time: time.padStart(5, "0"),
    timeZone: phoneTimeZone(),
    setAt: now.toISOString(),
    snoozedUntil: null,
    snoozeCount: 0,
    turnedAt: null,
    lastObservedAt: now.toISOString(),
    missedAt: null,
    missedSeenAt: null,
  };
  write({ ...current, [tripId]: setting });
  return setting;
}

export function clearTurnaround(tripId: string) {
  patch(tripId, () => null);
}

/** Snooze 15 minutes. Returns false once MAX_SNOOZES is reached. */
export function snoozeTurnaround(tripId: string, now: Date = new Date()): boolean {
  const s = current[tripId];
  if (!s || s.snoozeCount >= MAX_SNOOZES) return false;
  patch(tripId, (x) => ({
    ...x,
    snoozeCount: x.snoozeCount + 1,
    snoozedUntil: new Date(now.getTime() + SNOOZE_MS).toISOString(),
    missedSeenAt: x.missedAt ? (x.missedSeenAt ?? now.toISOString()) : x.missedSeenAt,
  }));
  return true;
}

/** "Turning around". Ends the alarm for this setting. */
export function markTurnedAround(tripId: string, now: Date = new Date()) {
  patch(tripId, (x) => ({ ...x, turnedAt: now.toISOString() }));
}

/** The athlete has seen "This alarm did not sound". */
export function dismissMissed(tripId: string, now: Date = new Date()) {
  patch(tripId, (x) => (x.missedAt && !x.missedSeenAt ? { ...x, missedSeenAt: now.toISOString() } : x));
}

const OBSERVE_WRITE_EVERY_MS = 15_000;

/**
 * An alarm surface is on screen and has looked at the clock. Call it on mount,
 * on every return to the foreground, and on each tick while visible.
 *
 * If the first look after the moment passed comes more than MISSED_GRACE_MS
 * late, the alarm did not sound and the setting records that it was missed.
 */
export function observeTurnaround(tripId: string, now: Date = new Date()) {
  const s = current[tripId];
  if (!s || s.turnedAt) return;
  const at = Date.parse(s.at);
  const last = s.lastObservedAt ? Date.parse(s.lastObservedAt) : NaN;
  const t = now.getTime();
  const unseenSinceDue = Number.isNaN(last) || last < at;
  const missed = !s.missedAt && t - at > MISSED_GRACE_MS && unseenSinceDue;
  // The first look at or after the moment is always saved. Throttled, a phone
  // locked a few seconds after the alarm appeared would come back "did not sound".
  const firstLookSinceDue = t >= at && unseenSinceDue;
  if (!missed && !firstLookSinceDue && !Number.isNaN(last) && t - last < OBSERVE_WRITE_EVERY_MS) return;
  patch(tripId, (x) => ({
    ...x,
    lastObservedAt: now.toISOString(),
    missedAt: missed ? now.toISOString() : x.missedAt,
  }));
}

/* -------------------------------------------------------------------------- */
/* React                                                                       */
/* -------------------------------------------------------------------------- */

export interface UseTurnaround {
  setting: TurnaroundSetting | null;
  phase: TurnaroundPhase;
  /** The clock the phase was computed at, epoch ms. */
  now: number;
}

/**
 * The setting and its phase, re-read from the wall clock every second while
 * mounted and immediately on every return to the foreground.
 */
export function useTurnaround(tripId: string | null | undefined): UseTurnaround {
  const [, bump] = useState(0);

  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    listeners.add(rerender);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      current = read();
      listeners.forEach((l) => l());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") rerender();
    };
    const tick = setInterval(rerender, 1000);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", rerender);
    window.addEventListener("pageshow", rerender);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(rerender);
      clearInterval(tick);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", rerender);
      window.removeEventListener("pageshow", rerender);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const now = Date.now();
  const setting = readTurnaround(tripId);
  return { setting, phase: turnaroundPhase(setting, now), now };
}

/** TEST SEAM. */
export function __resetTurnaroundForTests(next: Stored = {}) {
  current = next;
  listeners.forEach((l) => l());
}
