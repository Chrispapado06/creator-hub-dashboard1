/**
 * THE TRIP — the noun ICEFALL did not have.
 *
 * ============================================================================
 * WHAT WAS MISSING
 * ============================================================================
 *
 * Nothing in this app represented "I am on a trip right now". There were
 * objectives (a mountain and a date, months out), activities (a recording that
 * has already finished), and an operator's commercial trip page at
 * `/operator/:id/trip/:tripId` — which is a product somebody is selling, not a
 * thing the athlete is on. The acclimatisation schedule, the daily self-check
 * and the pre-trip timeline all need a subject, and this is it.
 *
 * ============================================================================
 * WHAT A DAY IS IDENTIFIED BY — THE PHASE 2 RULE, UNCHANGED
 * ============================================================================
 *
 * BY ITS CALENDAR DATE, INSIDE ITS TRIP. Never by a day index.
 *
 * `tracking/adjustments.ts` settled this and the reasoning transfers exactly: a
 * day index is assigned by whatever generates the itinerary, so it moves the
 * moment the start date moves, and a record keyed on "day 4" then lands on a
 * night nobody pointed at. Tuesday 14 October is Tuesday 14 October whether the
 * trip started on the 10th or the 11th. A trip whose start date is edited keeps
 * every night's record attached to the night it was actually slept.
 *
 * WHAT THAT COSTS, SAID RATHER THAN GLOSSED: shortening a trip can leave a
 * night recorded outside it. Those records are NOT deleted and NOT silently
 * hidden — `nightsOutside` returns them, and the schedule screen says the date
 * is no longer inside the trip. Somebody who typed in an altitude is entitled
 * to know what happened to it.
 *
 * ============================================================================
 * LOCAL, AND THAT IS THE FEATURE
 * ============================================================================
 *
 * `localStorage`, one key, no network in this file or anything it imports.
 * `offline/seed.ts` already states the general case — "ICEFALL has always kept
 * the athlete's world in localStorage ... That is the app's REAL data path, and
 * it needs no network" — and for a trip it stops being an implementation note
 * and becomes the requirement. An athlete at 4,200 m has no signal. Every write
 * on this screen has to land, and every read has to work, with the radio off.
 *
 * NOTHING HERE SYNCS, AND NO SCREEN MAY IMPLY IT DOES. There is no trips table,
 * no RLS policy and no edge function; a trip lives on the phone that recorded
 * it. Reinstall the app and it is gone. That is stated on the screen rather
 * than discovered.
 *
 * ============================================================================
 * SELF-REPORTED, AND LABELLED FOREVER (house rule 4)
 * ============================================================================
 *
 * Every altitude in this file is TYPED IN BY A PERSON. ICEFALL does not measure
 * sleeping altitude: there is no barometric altimeter reading in the app, GPS
 * altitude is poor and is not recorded overnight, and a recorded activity ends
 * hours before anybody goes to bed. So `sleptAtM` is self-reported, it is
 * labelled self-reported on every surface that draws it, and it must never be
 * merged into `highestRecordedAltitudeM` or any other measured figure.
 */

import { useCallback, useEffect, useState } from "react";

import { asAnswers, type LakeLouiseAnswers } from "./lakeLouise";

/* -------------------------------------------------------------------------- */
/* Calendar dates                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Today, as the calendar on the wall in front of the athlete reads it.
 *
 * LOCAL, NOT UTC, and the difference is not academic here. `toISOString()` on a
 * phone in Nepal at nine in the evening returns tomorrow's date, so an evening
 * self-check would file itself under the wrong night — the one night of the
 * trip it most matters to get right.
 */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** `date` shifted by whole days, still a calendar date. */
export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  const d = new Date(t + days * 86400000);
  return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-${`${d.getUTCDate()}`.padStart(2, "0")}`;
}

/** Every calendar date from `start` to `end` inclusive. Empty if reversed. */
export function datesInclusive(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  if (n < 0) return [];
  /* A trip is days, not years. The cap stops a mistyped 2099 end date from
     building a million-element array and freezing the phone — and it is a
     REFUSAL, not a silent truncation: `tripLengthProblem` below is what the
     screen shows instead. */
  if (n > MAX_TRIP_DAYS) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

/** The longest trip ICEFALL will lay out. Longer than any expedition. */
export const MAX_TRIP_DAYS = 400;

/**
 * Why a start and end date cannot make a trip, or null when they can.
 *
 * Returned as a sentence rather than a boolean so the form can say what is
 * wrong instead of just refusing.
 */
export function tripLengthProblem(start: string, end: string): string | null {
  if (!isCalendarDate(start)) return "The start date is not a date ICEFALL can read.";
  if (!isCalendarDate(end)) return "The end date is not a date ICEFALL can read.";
  const n = daysBetween(start, end);
  if (n < 0) return "The trip ends before it starts.";
  if (n > MAX_TRIP_DAYS)
    return `That is ${n + 1} days. ICEFALL lays out trips up to ${MAX_TRIP_DAYS + 1} days; anything longer is almost always a mistyped year.`;
  return null;
}

export function isCalendarDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/* -------------------------------------------------------------------------- */
/* The records                                                                 */
/* -------------------------------------------------------------------------- */

export interface Trip {
  id: string;
  /** What the athlete calls it. Free text — a trip is not always a mountain. */
  name: string;
  /**
   * The objective this trip is for, when there is one. Null is a real answer:
   * plenty of trips are not somebody's logged objective, and the trip screen
   * works without one — it simply has no elevation to build a schedule from,
   * and says so.
   */
  goalId: string | null;
  /** Carried at creation so the trip survives the goal being deleted. */
  peakName: string | null;
  /**
   * The objective's elevation, in metres, copied at creation.
   *
   * COPIED RATHER THAN LOOKED UP, on purpose: the schedule an athlete reads on
   * the mountain must not change under them because somebody edited a goal at
   * home. Null when the objective had no elevation, and null is NOT zero — the
   * schedule states that it has no peak elevation rather than deriving one.
   */
  peakElevationM: number | null;
  /**
   * The curated mountain id (`data/mock/mountains.ts`), copied at creation for
   * the same reason as the elevation: the SOS screen's numbers must not change
   * under an athlete because a goal was edited at home. Optional because trips
   * written before it existed have none; Mountain mode then falls back to the
   * trip's goal.
   */
  mountainId?: string | null;
  /**
   * ISO 3166-1 alpha-2 destination country, when the athlete set one. Never
   * derived from a position (plan §5.6). Nothing sets it yet.
   */
  countryCode?: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  /** Set when the athlete closes the trip. Never deletes anything. */
  endedAt: string | null;
}

/**
 * One night's sleeping altitude, as the athlete reported it.
 *
 * `date` is THE DATE YOU WENT TO SLEEP, which is what the published ascent
 * guidance counts in. The screen says so in those words, because "last night"
 * is ambiguous at four in the morning and this is the figure the whole schedule
 * rests on.
 */
export interface TripNight {
  tripId: string;
  date: string;
  /** Metres. SELF-REPORTED, always. See the header. */
  sleptAtM: number;
  recordedAt: string;
}

/**
 * One filled-in Lake Louise form.
 *
 * WHAT IS STORED IS THE ANSWERS, NOT THE VERDICT. The escalation is re-derived
 * by `scoreLakeLouise` every time a check is displayed, so a correction to the
 * scoring rules corrects the history too rather than leaving a log of verdicts
 * from a version of the code nobody has any more. This is the Phase 3 posture —
 * `commitProposal` re-derives its outcome rather than trusting what it was
 * handed — applied to a safety log.
 */
export interface TripCheck {
  id: string;
  tripId: string;
  /** Calendar date of the check. */
  date: string;
  /** Full ISO timestamp, so two checks in one day stay in order. */
  at: string;
  /** Where you were when you filled it in. Self-reported; null when not given. */
  altitudeM: number | null;
  answers: LakeLouiseAnswers;
}

interface Stored {
  trips: Trip[];
  activeTripId: string | null;
  nights: TripNight[];
  checks: TripCheck[];
  /** Pre-trip timeline item id -> when it was ticked. Per trip: `${tripId}|${itemId}`. */
  ticks: Record<string, string>;
}

const EMPTY: Stored = { trips: [], activeTripId: null, nights: [], checks: [], ticks: {} };

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

const KEY = "icefall.trip.v1";

/**
 * Read, narrowing everything.
 *
 * A stored blob is JSON some other build wrote, and half of what this app does
 * with it is safety-adjacent. Anything that does not narrow is DROPPED rather
 * than coerced — a night with a non-numeric altitude is not a night at zero
 * metres, and a check whose answers did not survive is re-read through
 * `asAnswers`, which turns every unrecognised value into "not answered".
 */
function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Stored>;
    const trips = Array.isArray(p.trips) ? p.trips.filter(isTrip) : [];
    const ids = new Set(trips.map((t) => t.id));
    return {
      trips,
      activeTripId:
        typeof p.activeTripId === "string" && ids.has(p.activeTripId) ? p.activeTripId : null,
      nights: Array.isArray(p.nights) ? p.nights.filter((n) => isNight(n) && ids.has(n.tripId)) : [],
      checks: Array.isArray(p.checks)
        ? p.checks
            .filter((c) => isCheckShape(c) && ids.has(c.tripId))
            .map((c) => ({ ...c, answers: asAnswers(c.answers) }))
        : [],
      ticks:
        typeof p.ticks === "object" && p.ticks !== null
          ? Object.fromEntries(
              Object.entries(p.ticks).filter(([, v]) => typeof v === "string"),
            ) as Record<string, string>
          : {},
    };
  } catch {
    return EMPTY;
  }
}

function isTrip(t: unknown): t is Trip {
  if (typeof t !== "object" || t === null) return false;
  const r = t as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    isCalendarDate(r.startDate) &&
    isCalendarDate(r.endDate) &&
    (r.peakElevationM === null || typeof r.peakElevationM === "number")
  );
}

function isNight(n: unknown): n is TripNight {
  if (typeof n !== "object" || n === null) return false;
  const r = n as Record<string, unknown>;
  return (
    typeof r.tripId === "string" &&
    isCalendarDate(r.date) &&
    typeof r.sleptAtM === "number" &&
    Number.isFinite(r.sleptAtM)
  );
}

function isCheckShape(c: unknown): c is TripCheck {
  if (typeof c !== "object" || c === null) return false;
  const r = c as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.tripId === "string" && isCalendarDate(r.date);
}

let current: Stored = typeof localStorage === "undefined" ? EMPTY : read();
const listeners = new Set<(s: Stored) => void>();

function write(next: Stored) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Quota or private mode. The trip stays for this session — which on a
       mountain is the session that matters — and nothing else useful can be
       done about it here. The screen reports storage failure separately. */
  }
  listeners.forEach((l) => l(current));
}

/** Whether the last write actually reached the device. Reported, not assumed. */
export function storageWorks(): boolean {
  try {
    const probe = `${KEY}.probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export const tripState = (): Stored => current;

export function activeTrip(): Trip | null {
  return current.trips.find((t) => t.id === current.activeTripId) ?? null;
}

/** Nights for a trip, sorted by date, INSIDE the trip's own window. */
export function nightsFor(tripId: string, start: string, end: string): TripNight[] {
  return current.nights
    .filter((n) => n.tripId === tripId && n.date >= start && n.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Nights recorded against this trip that its window no longer contains.
 *
 * Absence carries its reason (house rule 2): shortening a trip does not delete
 * what somebody typed, and the screen says the night sits outside the trip
 * rather than the night quietly vanishing.
 */
export function nightsOutside(tripId: string, start: string, end: string): TripNight[] {
  return current.nights
    .filter((n) => n.tripId === tripId && (n.date < start || n.date > end))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Checks for a trip, newest first. */
export function checksFor(tripId: string): TripCheck[] {
  return current.checks.filter((c) => c.tripId === tripId).sort((a, b) => b.at.localeCompare(a.at));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

function id(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function startTrip(input: {
  name: string;
  goalId: string | null;
  peakName: string | null;
  peakElevationM: number | null;
  mountainId?: string | null;
  countryCode?: string | null;
  startDate: string;
  endDate: string;
}): Trip | { error: string } {
  const problem = tripLengthProblem(input.startDate, input.endDate);
  if (problem) return { error: problem };

  const trip: Trip = {
    id: id("trip"),
    name: input.name.trim() || input.peakName || "Trip",
    goalId: input.goalId,
    peakName: input.peakName,
    peakElevationM:
      typeof input.peakElevationM === "number" && Number.isFinite(input.peakElevationM)
        ? input.peakElevationM
        : null,
    mountainId: input.mountainId ?? null,
    countryCode: input.countryCode ?? null,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: new Date().toISOString(),
    endedAt: null,
  };
  write({ ...current, trips: [trip, ...current.trips], activeTripId: trip.id });
  return trip;
}

/** Close a trip. Keeps every night and every check — this is not a delete. */
export function endTrip(tripId: string) {
  write({
    ...current,
    trips: current.trips.map((t) =>
      t.id === tripId ? { ...t, endedAt: t.endedAt ?? new Date().toISOString() } : t,
    ),
    activeTripId: current.activeTripId === tripId ? null : current.activeTripId,
  });
}

/** Reopen a closed trip, because trips get extended. */
export function resumeTrip(tripId: string) {
  if (!current.trips.some((t) => t.id === tripId)) return;
  write({
    ...current,
    trips: current.trips.map((t) => (t.id === tripId ? { ...t, endedAt: null } : t)),
    activeTripId: tripId,
  });
}

/** Change the window. Records stay on their calendar dates — see the header. */
export function setTripDates(tripId: string, startDate: string, endDate: string): string | null {
  const problem = tripLengthProblem(startDate, endDate);
  if (problem) return problem;
  write({
    ...current,
    trips: current.trips.map((t) => (t.id === tripId ? { ...t, startDate, endDate } : t)),
  });
  return null;
}

/** Delete a trip and everything recorded against it. Only from an explicit tap. */
export function deleteTrip(tripId: string) {
  write({
    trips: current.trips.filter((t) => t.id !== tripId),
    activeTripId: current.activeTripId === tripId ? null : current.activeTripId,
    nights: current.nights.filter((n) => n.tripId !== tripId),
    checks: current.checks.filter((c) => c.tripId !== tripId),
    ticks: Object.fromEntries(
      Object.entries(current.ticks).filter(([k]) => !k.startsWith(`${tripId}|`)),
    ),
  });
}

/**
 * Record — or correct — the altitude slept at on one night.
 *
 * One record per (trip, date): a correction REPLACES rather than appends,
 * because two answers for one night would make the schedule's arithmetic
 * ambiguous and there is no version of that worth showing on a mountain.
 */
export function recordNight(tripId: string, date: string, sleptAtM: number) {
  if (!isCalendarDate(date) || !Number.isFinite(sleptAtM)) return;
  const night: TripNight = {
    tripId,
    date,
    sleptAtM: Math.round(sleptAtM),
    recordedAt: new Date().toISOString(),
  };
  write({
    ...current,
    nights: [...current.nights.filter((n) => !(n.tripId === tripId && n.date === date)), night],
  });
}

export function clearNight(tripId: string, date: string) {
  write({
    ...current,
    nights: current.nights.filter((n) => !(n.tripId === tripId && n.date === date)),
  });
}

export function addCheck(input: {
  tripId: string;
  answers: LakeLouiseAnswers;
  altitudeM: number | null;
  now?: Date;
}): TripCheck {
  const now = input.now ?? new Date();
  const check: TripCheck = {
    id: id("check"),
    tripId: input.tripId,
    date: todayISO(now),
    at: now.toISOString(),
    altitudeM:
      typeof input.altitudeM === "number" && Number.isFinite(input.altitudeM)
        ? Math.round(input.altitudeM)
        : null,
    answers: input.answers,
  };
  write({ ...current, checks: [check, ...current.checks] });
  return check;
}

/**
 * Remove a check.
 *
 * Offered because a form filled in by mistake should not sit in a safety log
 * forever, and refused nowhere else: ICEFALL does not keep a record the athlete
 * has asked it not to keep. Nothing about a removal is reported anywhere.
 */
export function removeCheck(checkId: string) {
  write({ ...current, checks: current.checks.filter((c) => c.id !== checkId) });
}

export function tickTimelineItem(tripId: string, itemId: string, on: boolean) {
  const key = `${tripId}|${itemId}`;
  const ticks = { ...current.ticks };
  if (on) ticks[key] = new Date().toISOString();
  else delete ticks[key];
  write({ ...current, ticks });
}

export function timelineTick(tripId: string, itemId: string): string | null {
  return current.ticks[`${tripId}|${itemId}`] ?? null;
}

/* -------------------------------------------------------------------------- */
/* React                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The store, as a hook. Same subscribe-and-copy shape as
 * `social/summitLog.ts` and `tracking/adjustments.ts`, so there is one pattern
 * in this codebase rather than three.
 */
export function useTrip() {
  const [state, setState] = useState<Stored>(current);

  useEffect(() => {
    const l = (s: Stored) => setState(s);
    listeners.add(l);
    /* A write between render and effect would otherwise be missed. */
    setState(current);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const trip = state.trips.find((t) => t.id === state.activeTripId) ?? null;

  return {
    trip,
    trips: state.trips,
    nights: trip ? nightsFor(trip.id, trip.startDate, trip.endDate) : [],
    nightsOutside: trip ? nightsOutside(trip.id, trip.startDate, trip.endDate) : [],
    checks: trip ? checksFor(trip.id) : [],
    ticks: state.ticks,
    startTrip: useCallback(startTrip, []),
    endTrip: useCallback(endTrip, []),
    resumeTrip: useCallback(resumeTrip, []),
    setTripDates: useCallback(setTripDates, []),
    deleteTrip: useCallback(deleteTrip, []),
    recordNight: useCallback(recordNight, []),
    clearNight: useCallback(clearNight, []),
    addCheck: useCallback(addCheck, []),
    removeCheck: useCallback(removeCheck, []),
    tickTimelineItem: useCallback(tickTimelineItem, []),
  };
}

/** TEST SEAM. Not used by the app; `src/trip/*.test.ts` resets between cases. */
export function __resetTripStoreForTests(next: Partial<Stored> = {}) {
  current = { ...EMPTY, ...next };
  listeners.forEach((l) => l(current));
}
