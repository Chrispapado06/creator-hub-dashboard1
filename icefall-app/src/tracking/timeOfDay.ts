/**
 * WHEN A SESSION STARTED, AND IN WHOSE MORNING.
 *
 * ============================================================================
 * WHY A TIMESTAMP WAS NOT ENOUGH
 * ============================================================================
 *
 * Every recording already carried `startedAt`, a UTC instant. An instant fixes
 * a point on the world's clock and says nothing about the athlete's — and the
 * athlete's is the only one that matters to a coach. "06:00" is an alpine start
 * in Chamonix and a lie-in in Kathmandu, and the difference is not a rounding
 * error: it decides whether somebody is practising the start a summit day will
 * demand of them or going out after work.
 *
 * `new Date(startedAt).getHours()` reads the instant in the zone THE PHONE IS
 * IN NOW, which is correct exactly while the athlete never travels. The moment
 * they fly to Nepal, every session they recorded at home is re-read five and
 * three-quarter hours out, and the sessions they record on the trip are re-read
 * wrong again when they land back in Larnaca. A training history that shifts
 * its own start times when its owner gets on a plane is not a history.
 *
 * So the zone is stored WITH the activity, at the moment it is written:
 *
 *   · `startUtcOffsetMin` — minutes east of UTC at that instant. Exact, needs
 *     no timezone database to read back, and survives a DST change because it
 *     was recorded on the day rather than derived later.
 *   · `startTimeZone` — the IANA name ("Asia/Kathmandu"), when the platform
 *     will say. It is what lets a screen name the place; the offset is what
 *     lets it do the arithmetic.
 *   · `startTimeSource` — measured, reported, or inferred. See below.
 *
 * ============================================================================
 * UNKNOWN IS A REAL ANSWER HERE, TOO
 * ============================================================================
 *
 * Activities written before this existed carry no offset, and NOTHING IN HERE
 * invents one for them. `exactLocalStart` returns null and every caller that
 * makes a claim about when somebody trains is required to drop that session
 * rather than guess it — which is the same rule the rest of the coach follows:
 * a missing figure resolves to a reason, never to a default.
 *
 * `readableLocalStart` is the one deliberate exception and is documented at its
 * own definition: a screen showing the athlete their own record on their own
 * phone may fall back to the device clock, because that is what it displayed
 * yesterday and it is right for everyone who has not travelled. It says which
 * of the two it did, so nothing downstream can mistake a fallback for a fact.
 *
 * ============================================================================
 * PRIVACY — READ THIS BEFORE PUTTING A START TIME ON A SCREEN
 * ============================================================================
 *
 * When somebody trains is one of the most revealing things this app holds.
 * Times plus a route describe a routine — which door, which hour, how
 * regularly, and therefore when a flat is empty. Start times are PRIVATE BY
 * DEFAULT: they belong to the athlete's own screens and to their coach, and
 * they do not go onto anything anybody else can read unless the athlete puts
 * them there themselves. `social/posts.ts` enforces that at the type level;
 * `START_TIME_PRIVACY` below is the sentence that rule exists to serve.
 */

/** Why start times stay off shared surfaces. Quoted where the rule is enforced. */
export const START_TIME_PRIVACY =
  "Start times stay private. When you train, repeated over weeks and read next to where you train, describes your routine — so ICEFALL keeps it to your own screens and your coach unless you choose otherwise.";

/* -------------------------------------------------------------------------- */
/* Stamping a start                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where a start time came from.
 *
 *  - `measured`  the device was running and stamped the clock itself.
 *  - `reported`  the athlete said it ("I went out at six"), typed or spoken to
 *                the coach and transcribed. Their figure, not a reading.
 *  - `inferred`  nobody said. The app placed the session and MUST say so
 *                wherever it shows the time — see `tracking/manual.ts`.
 */
export type StartTimeSource = "measured" | "reported" | "inferred";

export const START_TIME_SOURCE_LABEL: Record<StartTimeSource, string> = {
  measured: "Recorded",
  reported: "As you reported it",
  inferred: "Time not given",
};

/** The zone and offset fields every written activity carries. */
export interface StartTimeStamp {
  startTimeZone: string | null;
  startUtcOffsetMin: number;
  startTimeSource: StartTimeSource;
}

/**
 * The device's IANA zone, or null when the platform will not name one.
 *
 * Wrapped in a try because `resolvedOptions()` is one of the few Intl calls
 * that can throw on a stripped-down runtime, and a recording must never fail
 * to save because a clock could not name itself.
 */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Minutes EAST of UTC on the device at `at`. Kathmandu is +345, Los Angeles
 * −480.
 *
 * `getTimezoneOffset()` returns the opposite sign to everything a human writes,
 * which is exactly the kind of detail that produces a six-hour bug a year after
 * it is written, so it is negated here once and never read raw elsewhere.
 */
export function deviceUtcOffsetMin(at: Date): number {
  return -at.getTimezoneOffset();
}

/** Stamp a start with the device's own zone. The single way these are written. */
export function stampStartTime(at: Date, source: StartTimeSource): StartTimeStamp {
  return {
    startTimeZone: deviceTimeZone(),
    startUtcOffsetMin: deviceUtcOffsetMin(at),
    startTimeSource: source,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading one back                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A part of the day, named the way a mountaineer names it.
 *
 * `alpine-start` is not a mood — it is the same threshold the Alpine Start
 * achievement has always used, exported from here so there is one definition of
 * "before five" in the app rather than two that can drift.
 */
export type PartOfDay =
  | "alpine-start"
  | "early-morning"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

export const ALPINE_START_BEFORE_HOUR = 5;

export const PART_OF_DAY_LABEL: Record<PartOfDay, string> = {
  "alpine-start": "alpine start",
  "early-morning": "early morning",
  morning: "morning",
  midday: "midday",
  afternoon: "afternoon",
  evening: "evening",
  night: "night",
};

export function partOfDay(hour: number): PartOfDay {
  if (hour < ALPINE_START_BEFORE_HOUR) return "alpine-start";
  if (hour < 8) return "early-morning";
  if (hour < 12) return "morning";
  if (hour < 14) return "midday";
  if (hour < 18) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

/** A clock reading in the zone the athlete was actually standing in. */
export interface LocalStart {
  hour: number;
  minute: number;
  /** "05:40", zero-padded, 24-hour. */
  clock: string;
  part: PartOfDay;
  /** Minutes since local midnight. The figure the pattern maths works on. */
  minuteOfDay: number;
  /** 0 = Sunday … 6 = Saturday, in the zone it happened in, not this one. */
  dayOfWeek: number;
  /** "2026-09-11" — the calendar day THERE. Abroad this is not always the one
      the device would name, which is the entire reason it is computed here. */
  dateKey: string;
}

/** Anything carrying a start. Written so a test fixture need not be a full record. */
export interface HasStart {
  startedAt: string;
  startUtcOffsetMin?: number | null;
  startTimeZone?: string | null;
  startTimeSource?: StartTimeSource;
}

function clockFrom(instantMs: number, offsetMin: number): LocalStart {
  // Shift the instant by the offset and then read it in UTC: `getUTC*` is the
  // only reader on Date that is not silently relative to wherever this code
  // happens to be running, which is the whole point of the exercise.
  const shifted = new Date(instantMs + offsetMin * 60_000);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return {
    hour,
    minute,
    clock: `${p(hour)}:${p(minute)}`,
    part: partOfDay(hour),
    minuteOfDay: hour * 60 + minute,
    dayOfWeek: shifted.getUTCDay(),
    dateKey: `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`,
  };
}

/**
 * The local clock this session started on, or NULL because nobody recorded one.
 *
 * The strict reader. Everything that makes a CLAIM about when this athlete
 * trains — the coach's prompt, the habit pattern, the alpine-start count — uses
 * this one and simply has fewer sessions to work with when the answer is null.
 * Fewer real sessions beats more invented ones.
 */
export function exactLocalStart(a: HasStart): LocalStart | null {
  if (a.startUtcOffsetMin === undefined || a.startUtcOffsetMin === null) return null;
  const ms = new Date(a.startedAt).getTime();
  if (!Number.isFinite(ms)) return null;
  return clockFrom(ms, a.startUtcOffsetMin);
}

/**
 * The local clock for DISPLAY, with a flag saying whether it is the real one.
 *
 * `exact: false` means the record predates zone capture and this is the
 * device's current zone — which is right for an athlete who has not travelled
 * since, and is what these screens already showed before any of this existed.
 * It is offered only to the athlete's own view of their own activity, and the
 * flag exists so a screen can qualify it. Nothing that reasons may use it.
 */
export function readableLocalStart(a: HasStart): (LocalStart & { exact: boolean }) | null {
  const ms = new Date(a.startedAt).getTime();
  if (!Number.isFinite(ms)) return null;
  const exact = exactLocalStart(a);
  if (exact) return { ...exact, exact: true };
  return { ...clockFrom(ms, deviceUtcOffsetMin(new Date(ms))), exact: false };
}

/**
 * True when this session's start was recorded in a different zone from the one
 * the phone is in now — the trip-abroad case, and the only time a screen needs
 * to name the zone beside the clock.
 */
export function startedInAnotherZone(a: HasStart, now = new Date()): boolean {
  if (a.startUtcOffsetMin === undefined || a.startUtcOffsetMin === null) return false;
  return a.startUtcOffsetMin !== deviceUtcOffsetMin(now);
}

/**
 * The start time for the athlete's OWN screens: a clock, and whatever
 * qualification it needs to be honest.
 *
 *   "06:10"                          recorded here, and true
 *   "04:45 · Asia/Kathmandu"         recorded in another zone — the clock is
 *                                    that morning's, not this device's
 *   "12:00 · time not given"         nobody said when; ICEFALL placed it
 *
 * The zone is named only when it differs from the one the phone is in now,
 * because on every ordinary day naming it is noise, and on the one day it
 * matters — reading a Nepal session back in Cyprus — leaving it out turns a
 * true clock into a confusing one.
 */
export function startClockLabel(a: HasStart, now = new Date()): string | null {
  const local = readableLocalStart(a);
  if (!local) return null;
  if (a.startTimeSource === "inferred") return `${local.clock} · time not given`;
  if (!local.exact || !startedInAnotherZone(a, now)) return local.clock;
  const zone = a.startTimeZone ? a.startTimeZone.split("/").pop()?.replace(/_/g, " ") : null;
  return `${local.clock} · ${zone ?? formatUtcOffset(a.startUtcOffsetMin ?? 0)}`;
}

/** "UTC+05:45" — the fallback name for a zone a vendor gave only as an offset. */
export function formatUtcOffset(offsetMin: number): string {
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `UTC${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

/* -------------------------------------------------------------------------- */
/* Elapsed                                                                     */
/* -------------------------------------------------------------------------- */

const MS_HOUR = 3_600_000;

/** Hours between an instant and now. Needs no zone — an interval has none. */
export function hoursSince(iso: string, now: Date): number | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, (now.getTime() - then) / MS_HOUR);
}

/**
 * "14 hours ago" — the sentence this whole step exists to make possible.
 *
 * Hours all the way to two days, because the gap between a hard session and the
 * next one is the thing a coach actually reasons about and "yesterday" covers
 * everything from four hours to thirty-two. Past two days nobody is counting in
 * hours any more and the days read better.
 */
export function describeHoursSince(hours: number): string {
  if (hours < 1) return "less than an hour ago";
  if (hours < 2) return "an hour ago";
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/* -------------------------------------------------------------------------- */
/* A time the athlete typed or said                                            */
/* -------------------------------------------------------------------------- */

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * "07:45" → 465 minutes, or null.
 *
 * Strict on purpose: this parses the one field on the coach's `log_activity`
 * tool that a model fills in, and the house rule at that boundary is that
 * anything not matching exactly is refused rather than guessed. "7am",
 * "morning" and "07:60" all come back null and the app then infers a time and
 * says that it did.
 */
export function parseLocalClock(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = CLOCK.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes since midnight → "07:45". */
export function formatLocalClock(minuteOfDay: number): string {
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${p(Math.floor(m / 60))}:${p(m % 60)}`;
}
