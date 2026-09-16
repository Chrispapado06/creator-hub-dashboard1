/**
 * THE TURNAROUND ALARM'S DECISIONS, WITHOUT REACT (brief M7, plan §3.7).
 *
 * Which surface is on screen for a phase, when the screen lock is wanted, the
 * words on every surface, the setter's validation, and the two optional
 * figures on the alarm — time to the summit at current pace and daylight left.
 * Both figures return null rather than a guess: the alarm draws a line only
 * when this file can stand behind the number.
 *
 * The timing itself (phases, snooze, missed-while-hidden) lives in
 * `turnaround.ts`; this file never reads the clock on its own — `now` is
 * always passed in.
 */

import { haversine } from "@/tracking/filters";
import type { MountainTrip } from "./tripModel";
import type { TurnaroundPhase, TurnaroundSetting } from "./turnaround";
import { localMoment } from "./turnaround";
import { ageLabel, durationLabel } from "./format";
import { positionFreshness, type KnownPosition } from "./position";
import { daylightAt, solarDateISO, type DaylightNow } from "./daylight";
import { sunInputFor, type SunInput } from "./nowModel";

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export type AlarmLineTone = "countdown" | "snoozed" | "overdue" | "due" | "missed";

export type AlarmSurface =
  | { kind: "none" }
  /** Full-screen amber: the alarm itself, or "this alarm did not sound". */
  | { kind: "full"; reason: "due" | "missed" }
  /** One amber line; the screen underneath stays usable. */
  | { kind: "line"; tone: AlarmLineTone };

export interface SurfaceContext {
  /** The Now tab draws its own huge countdown; a second one would compete. */
  onNowTab: boolean;
  /**
   * On the SOS screen a due alarm is a line, never a full screen: covering the
   * rescue numbers and coordinates during an emergency would be the harm.
   */
  onSos: boolean;
}

export function alarmSurface(phase: TurnaroundPhase, ctx: SurfaceContext): AlarmSurface {
  switch (phase.kind) {
    case "unset":
    case "set":
    case "turned":
      return { kind: "none" };
    case "countdown":
      return ctx.onNowTab ? { kind: "none" } : { kind: "line", tone: "countdown" };
    case "due":
      return ctx.onSos ? { kind: "line", tone: "due" } : { kind: "full", reason: "due" };
    case "missed":
      return ctx.onSos ? { kind: "line", tone: "missed" } : { kind: "full", reason: "missed" };
    case "snoozed":
      return { kind: "line", tone: "snoozed" };
    case "overdue":
      return { kind: "line", tone: "overdue" };
  }
}

/**
 * Hold the screen on only from 30 minutes out until the athlete answers
 * (plan §9.1 point 4: scoped, never all day). Once it stops interrupting
 * after three snoozes the lock is let go — a flat phone has no SOS.
 */
export function wantsWakeLock(phase: TurnaroundPhase): boolean {
  return (
    phase.kind === "countdown" || phase.kind === "due" || phase.kind === "snoozed" || phase.kind === "missed"
  );
}

/** Sound and vibration only on the full-screen alarm. */
export function wantsAttention(surface: AlarmSurface): boolean {
  return surface.kind === "full";
}

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => `${n}`.padStart(2, "0");

/** 24-hour "HH:MM" on this phone's clock. */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The typed time, with its zone named when the phone has since moved zone (plan §9.1 point 11). */
export function setTimeLabel(setting: TurnaroundSetting, phoneZone: string): string {
  return setting.timeZone === phoneZone ? setting.time : `${setting.time} (${setting.timeZone} time)`;
}

export function zoneWarning(setting: TurnaroundSetting, phoneZone: string): string | null {
  if (setting.timeZone === phoneZone) return null;
  return `Set on ${setting.timeZone} time. This phone is now on ${phoneZone}. Check the phone's clock.`;
}

export function lineText(
  tone: AlarmLineTone,
  phase: TurnaroundPhase,
  setting: TurnaroundSetting,
  phoneZone: string,
): string {
  const time = setTimeLabel(setting, phoneZone);
  switch (tone) {
    case "countdown":
      return `Turn around in ${durationLabel(phase.kind === "countdown" ? phase.msLeft : 0)} · ${time}`;
    case "snoozed":
      return `Snoozed · again in ${durationLabel(phase.kind === "snoozed" ? phase.msUntilSnoozeEnds : 0)} · ${time}`;
    case "overdue":
      // Plan §3.7, word for word.
      return `You passed your turnaround time at ${time} — ${durationLabel(
        phase.kind === "overdue" ? phase.msOver : 0,
      )} ago`;
    case "due":
      return `Time to turn around · you set ${time}`;
    case "missed":
      return `This alarm did not sound · you set ${time}`;
  }
}

/** Plan §3.7's missed screen. "Closed" alone would be untrue for a locked screen. */
export function missedLines(setting: TurnaroundSetting, phoneZone: string, now: number): string[] {
  return [
    "This alarm did not sound.",
    "ICEFALL was closed or the screen was off.",
    `You set it for ${setTimeLabel(setting, phoneZone)}. It is now ${clockLabel(now)}.`,
  ];
}

export function snoozeLabel(setting: TurnaroundSetting, maxSnoozes: number): string {
  const left = maxSnoozes - setting.snoozeCount;
  return left <= 1 ? "Snooze 15 min · last one" : `Snooze 15 min · ${left} left`;
}

/* -------------------------------------------------------------------------- */
/* Setting the time                                                            */
/* -------------------------------------------------------------------------- */

export interface DayOption {
  date: string;
  label: string;
  summitDay: boolean;
}

const MAX_DAY_OPTIONS = 21;

function addDaysISO(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * The days a turnaround can be set for: the trip's days from today on, with
 * the itinerary's label and summit flag where there is an itinerary. A trip
 * that has ended, or no trip, offers today only.
 */
export function dayOptions(trip: Pick<MountainTrip, "startDate" | "endDate" | "itinerary"> | null, today: string): DayOption[] {
  const out: DayOption[] = [];
  if (trip && trip.endDate >= today) {
    let date = trip.startDate > today ? trip.startDate : today;
    let dayNumber = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86_400_000) + 1;
    while (date <= trip.endDate && out.length < MAX_DAY_OPTIONS) {
      const it = trip.itinerary?.find((d) => d.date === date) ?? null;
      out.push({ date, label: it ? `Day ${dayNumber} · ${it.label}` : `Day ${dayNumber}`, summitDay: !!it?.summitDay });
      date = addDaysISO(date, 1);
      dayNumber++;
    }
  }
  if (out.length === 0) out.push({ date: today, label: "Today", summitDay: false });
  return out;
}

/** The itinerary's summit day when one is offered, else the first day offered. */
export function defaultDay(options: DayOption[]): string {
  return (options.find((o) => o.summitDay) ?? options[0]).date;
}

export type TurnaroundCheck = { ok: true; msAhead: number } | { ok: false; error: string };

/** Nothing is ever pre-filled: an empty time is "type one", not a default. */
export function checkTurnaroundInput(date: string, time: string, now: number): TurnaroundCheck {
  if (!time) return { ok: false, error: "Type the time you turn around, like 13:00." };
  const m = localMoment(date, time);
  if (!m) return { ok: false, error: "That is not a time ICEFALL can read." };
  const ahead = m.getTime() - now;
  if (ahead <= 0) return { ok: false, error: "That time has already passed. Pick a later one." };
  return { ok: true, msAhead: ahead };
}

/* -------------------------------------------------------------------------- */
/* Time to the summit at current pace                                          */
/* -------------------------------------------------------------------------- */

export interface PacePoint {
  t: number;
  lat: number;
  lon: number;
  altitudeM: number | null;
}

export const PACE_WINDOW_MS = 30 * 60_000;
export const PACE_MIN_SPAN_MS = 20 * 60_000;
export const PACE_MIN_POINTS = 10;
export const PACE_MAX_LAST_POINT_AGE_MS = 5 * 60_000;
/** Below this net gain over the window, GPS altitude noise could be the "pace". */
export const PACE_MIN_GAIN_M = 60;
export const PACE_MIN_RATE_M_PER_H = 50;
/** A recording far from this trip's summit is not a climb of it. */
export const PACE_MAX_SUMMIT_DISTANCE_M = 30_000;
export const PACE_MAX_ETA_MS = 24 * 3_600_000;

export interface SummitEta {
  msToSummit: number;
  rateMPerH: number;
  remainingM: number;
}

/**
 * Only when there is a real target (the summit's height and place) AND a live
 * climbing pace from a recording running now. Anything short of that is null,
 * and the alarm leaves the line out — never zero, never a guess.
 */
export function summitEtaAtPace(input: {
  points: PacePoint[] | null;
  now: number;
  summit: { lat: number; lon: number } | null;
  summitElevationM: number | null;
}): SummitEta | null {
  const { points, now, summit, summitElevationM } = input;
  if (!points || !summit || summitElevationM == null || !Number.isFinite(summitElevationM)) return null;
  const usable = points.filter((p) => p.altitudeM != null && Number.isFinite(p.altitudeM) && p.t <= now);
  if (usable.length === 0) return null;
  const last = usable[usable.length - 1];
  if (now - last.t > PACE_MAX_LAST_POINT_AGE_MS) return null;
  const inWindow = usable.filter((p) => p.t >= last.t - PACE_WINDOW_MS);
  if (inWindow.length < PACE_MIN_POINTS) return null;
  const first = inWindow[0];
  const span = last.t - first.t;
  if (span < PACE_MIN_SPAN_MS) return null;
  if (haversine(last, summit) > PACE_MAX_SUMMIT_DISTANCE_M) return null;
  const gain = (last.altitudeM as number) - (first.altitudeM as number);
  if (gain < PACE_MIN_GAIN_M) return null;
  const rateMPerH = gain / (span / 3_600_000);
  if (rateMPerH < PACE_MIN_RATE_M_PER_H) return null;
  const remainingM = summitElevationM - (last.altitudeM as number);
  if (remainingM <= 0) return null;
  const msToSummit = (remainingM / rateMPerH) * 3_600_000;
  if (msToSummit > PACE_MAX_ETA_MS) return null;
  return { msToSummit, rateMPerH, remainingM };
}

/* -------------------------------------------------------------------------- */
/* Daylight left                                                               */
/* -------------------------------------------------------------------------- */

export type DaylightView =
  /** The same sun as the Now tab: `daylight.ts` on the inputs `sunInputFor` picks. */
  | { kind: "sun"; light: DaylightNow; input: SunInput }
  /** The position is too old and the trip has no summit coordinate (plan §3.0). */
  | { kind: "silent" };

export function daylightView(args: {
  now: number;
  position: KnownPosition | null;
  summit: { lat: number; lon: number } | null;
  peakName: string | null;
}): DaylightView {
  const { now, position, summit, peakName } = args;
  const freshness = position ? positionFreshness(position, now) : null;
  const input = sunInputFor(position, freshness, summit, peakName, now);
  if (!input) return { kind: "silent" };
  const today = solarDateISO(now, input.lon);
  const light = daylightAt(now, today, addDaysISO(today, 1), input.lat, input.lon, input.altitudeM);
  return { kind: "sun", light, input };
}

export function daylightSourceLabel(input: SunInput): string {
  if (input.from.kind === "summit") return input.from.peakName ? `the summit of ${input.from.peakName}` : "the summit";
  const age = ageLabel(input.from.ageMs);
  return age === "just now" ? "your position just now" : `your position from ${age}`;
}

/** Headline and small print for the alarm, or null when silent. */
export function daylightLines(view: DaylightView): { big: string; small: string } | null {
  if (view.kind === "silent") return null;
  const basis = `Flat horizon at ${daylightSourceLabel(view.input)}, by this phone's clock. Ridges bring dusk sooner.`;
  const l = view.light;
  switch (l.kind) {
    case "day":
      return {
        big: `${durationLabel(l.msToSunset)} of daylight`,
        small: `Sunset ${clockLabel(l.sunset)}${l.civilDusk !== null ? `, dark by ${clockLabel(l.civilDusk)}` : ""}. ${basis}`,
      };
    case "twilight":
      return { big: `${durationLabel(l.msToDark)} of usable light`, small: `The sun has set. Dark by ${clockLabel(l.civilDusk)}. ${basis}` };
    case "before-sunrise":
      return { big: `Sunrise in ${durationLabel(l.msToSunrise)}`, small: `Sunrise ${clockLabel(l.sunrise)}. ${basis}` };
    case "dark":
      return {
        big: "Dark",
        small: `${l.nextSunrise !== null ? `Sunrise ${clockLabel(l.nextSunrise)}. ` : ""}${basis}`,
      };
    case "midnight-sun":
      return { big: "The sun does not set today", small: basis };
    case "polar-night":
      return { big: "The sun does not rise today", small: basis };
  }
}
