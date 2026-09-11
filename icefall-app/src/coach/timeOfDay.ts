import { HARD_ASCENT_M, HARD_MOVING_SEC } from "@/coach/readiness";
import {
  ALPINE_START_BEFORE_HOUR,
  PART_OF_DAY_LABEL,
  describeHoursSince,
  exactLocalStart,
  formatLocalClock,
  hoursSince,
  partOfDay,
  startedInAnotherZone,
  type LocalStart,
  type PartOfDay,
  type StartTimeSource,
} from "@/tracking/timeOfDay";
import type { CheckIn } from "@/coach/types";
import type { RecordedActivity } from "@/tracking/types";

/**
 * WHEN THIS ATHLETE TRAINS — the coach's reading of the clock.
 *
 * ============================================================================
 * WHAT THE COACH COULD NOT SAY BEFORE
 * ============================================================================
 *
 * The prompt carried `startedAt.slice(0, 10)`. Ten characters: a date. So the
 * coach knew somebody trained on Tuesday and could not know any of this —
 *
 *   · that the hard day finished FOURTEEN HOURS AGO, not "yesterday", which is
 *     the difference between a body that can take another one and a body that
 *     cannot. "Yesterday" covers everything from four hours to thirty-two;
 *   · that they have been out before five in the morning four times this month,
 *     which is the only evidence in the whole app that somebody is practising
 *     the start their summit day will demand;
 *   · that every session they record lands between six and seven in the
 *     evening, so a plan that hands them a five-hour Saturday at "whenever" is
 *     handing it to somebody who trains after work;
 *   · that the days they actually train are not the days they said they could.
 *
 * All four are now answerable, and this module is where they are answered. It
 * produces FACTS, in the app's own words, for `context.ts` to put in the
 * prompt — it does not advise, and the model is not handed a habit and invited
 * to infer around it.
 *
 * ============================================================================
 * IT REFUSES TO GUESS, AND THAT IS THE LOAD-BEARING PART
 * ============================================================================
 *
 * A session only joins the pattern when its local clock is KNOWN — when the
 * offset was captured at the time (`tracking/timeOfDay.ts`). Three kinds of
 * session are therefore excluded, each for its own reason:
 *
 *   · one recorded before zone capture existed, because reading it in today's
 *     zone would be a guess dressed as a reading;
 *   · one whose start the APP inferred (`startTimeSource: "inferred"`), because
 *     a run of sessions the app placed at midday would otherwise become "you
 *     train at midday" — the app quoting itself back to the athlete as though
 *     it had observed something;
 *   · a simulated one, which the coach never counts as training anywhere.
 *
 * `timedSessions` beside `windowSessions` is the honest statement of how much
 * of the picture is visible, and the prompt prints it. A pattern is claimed
 * only from `MIN_PATTERN_SESSIONS` real starts that actually cluster; a spread
 * of starts across the day produces no claim at all, with a sentence saying
 * which of "not enough" and "no pattern" is true.
 *
 * ============================================================================
 * PRIVACY
 * ============================================================================
 *
 * Everything here is derived from the athlete's start times, which are private
 * by default (`START_TIME_PRIVACY`). It goes to the coach and to the athlete's
 * own screens. It does not go onto a post, a leaderboard or a share card, and
 * `social/posts.ts` is where that is enforced rather than merely intended.
 */

/** The pattern window. Four clean weeks, as everywhere else in Coach. */
const WINDOW_DAYS = 28;
const MS_DAY = 86_400_000;

/**
 * Fewer starts than this and there is no habit, only a handful of mornings.
 * Five is the point at which "you usually start around…" stops being a
 * sentence about three data points.
 */
export const MIN_PATTERN_SESSIONS = 5;

/**
 * How close to the middle a start has to be to count as part of the habit, and
 * how much of the sample has to be inside it before the habit is claimed.
 *
 * Ninety minutes either side of the median, three sessions in five. Somebody
 * who trains at 06:30 most days and twice at 19:00 has a morning habit with two
 * exceptions, and should be told so. Somebody scattered from dawn to dusk has
 * no habit, and the honest output there is nothing.
 */
const CLUSTER_MINUTES = 90;
const CLUSTER_SHARE = 0.6;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** One session, as the clock sees it. Only ever built from a KNOWN local start. */
export interface TimedSession {
  title: string;
  /** The calendar day where it happened, which abroad is not this device's. */
  dateKey: string;
  clock: string;
  part: PartOfDay;
  dayOfWeek: number;
  hoursAgo: number;
  hard: boolean;
  timeZone: string | null;
  source: StartTimeSource;
}

export interface UsualStartWindow {
  /** How many known starts it was built from. Never below MIN_PATTERN_SESSIONS. */
  sessions: number;
  /** The middle one, as a clock. */
  typical: string;
  /** The band the cluster actually occupies. */
  earliest: string;
  latest: string;
  part: PartOfDay;
  /** Sessions inside the band, out of `sessions`. */
  inBand: number;
}

export interface TrainingClock {
  /** Real sessions in the window, whatever ICEFALL knows about their clocks. */
  windowSessions: number;
  /** Of those, the ones whose local start is actually known. */
  timedSessions: number;
  /** Of those, the ones whose start the app placed rather than anybody stating. */
  inferredSessions: number;
  usual: UsualStartWindow | null;
  /** Why there is no usual window. Empty exactly when `usual` is set. */
  usualMissing: string;
  /** Starts before 05:00 in the window — summit-day practice, counted. */
  alpineStarts: number;
  lastAlpineStart: TimedSession | null;
  /** The most recent session of any kind, and the most recent hard one. */
  last: TimedSession | null;
  lastHard: TimedSession | null;
  /**
   * Hours since those, WHICH DO NOT NEED A ZONE. An interval between two
   * instants is the same interval everywhere, so these are answerable for every
   * session including the ones with no local clock — and they are the figures
   * the recovery sentence is made of.
   */
  hoursSinceLast: number | null;
  hoursSinceLastHard: number | null;
  /** Distinct zones seen in the window. Two or more means they have travelled. */
  zones: string[];
  /** True when the most recent session's offset is not the device's now. */
  awayFromUsualZone: boolean;
  /** 0 = Sunday … 6 = Saturday, as the athlete answered in onboarding. */
  statedDays: number[];
  /** Days they actually recorded on, in the window. */
  trainedDays: number[];
  /** Stated and never used, and used though never stated. */
  statedDaysUnused: number[];
  unstatedDaysTrained: number[];
  /** Today's check-in, when they made one and ICEFALL knows when. */
  checkIn: { clock: string; part: PartOfDay; hoursAgo: number } | null;
  /** True when a check-in exists but predates the clock being recorded. */
  checkInUntimed: boolean;
}

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dayName = (dow: number): string => DAY_NAME[((dow % 7) + 7) % 7];

/* -------------------------------------------------------------------------- */
/* Reading the clock                                                           */
/* -------------------------------------------------------------------------- */

/** The same proxy for "hard" the rest of Coach uses. Imported, not re-decided. */
const isHard = (a: RecordedActivity): boolean =>
  a.elevationGainM >= HARD_ASCENT_M || a.movingSec >= HARD_MOVING_SEC;

function toTimed(a: RecordedActivity, local: LocalStart, now: Date): TimedSession {
  return {
    title: a.title,
    dateKey: local.dateKey,
    clock: local.clock,
    part: local.part,
    dayOfWeek: local.dayOfWeek,
    hoursAgo: hoursSince(a.startedAt, now) ?? 0,
    hard: isHard(a),
    timeZone: a.startTimeZone ?? null,
    source: a.startTimeSource ?? "measured",
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * The habitual start, or null and the reason there isn't one.
 *
 * Clock arithmetic here is LINEAR, not circular: a sample split between 03:00
 * and 22:00 has a median in the afternoon that describes nothing. That is not a
 * bug being tolerated — such a sample fails the cluster test below and produces
 * no claim, which is the right answer for somebody whose starts are scattered.
 */
function usualWindow(starts: LocalStart[]): {
  usual: UsualStartWindow | null;
  missing: string;
} {
  if (starts.length < MIN_PATTERN_SESSIONS) {
    return {
      usual: null,
      missing: `only ${starts.length} of their sessions have a recorded start time, which is too few to call a pattern`,
    };
  }
  const minutes = starts.map((s) => s.minuteOfDay);
  const mid = median(minutes);
  const inBand = minutes.filter((m) => Math.abs(m - mid) <= CLUSTER_MINUTES);
  if (inBand.length / minutes.length < CLUSTER_SHARE) {
    return {
      usual: null,
      missing: "their start times are spread across the day, so there is no usual one",
    };
  }
  return {
    usual: {
      sessions: minutes.length,
      typical: formatLocalClock(mid),
      earliest: formatLocalClock(Math.min(...inBand)),
      latest: formatLocalClock(Math.max(...inBand)),
      part: partOfDay(Math.floor(mid / 60)),
      inBand: inBand.length,
    },
    missing: "",
  };
}

export interface TrainingClockInput {
  /** Real activities only — the caller has already dropped simulated ones. */
  activities: RecordedActivity[];
  /** Every stored check-in, newest first or not; only today's is read. */
  checkIns: readonly CheckIn[];
  /** Today, as the app keys days. Used to find today's check-in. */
  todayKey: string;
  /** Onboarding: the days they said they could train. */
  statedDays: number[];
  now: Date;
}

/** Pure, clock-injected, and the single place any of this is worked out. */
export function readTrainingClock(input: TrainingClockInput): TrainingClock {
  const { activities, checkIns, todayKey, statedDays, now } = input;
  const cutoff = now.getTime() - WINDOW_DAYS * MS_DAY;

  const window = activities
    .filter((a) => {
      const t = new Date(a.startedAt).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime();
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const timed: TimedSession[] = [];
  const patternStarts: LocalStart[] = [];
  const zones = new Set<string>();
  for (const a of window) {
    const local = exactLocalStart(a);
    if (!local) continue;
    const session = toTimed(a, local, now);
    timed.push(session);
    if (a.startTimeZone) zones.add(a.startTimeZone);
    // An inferred start is the APP'S placement. It is reported, and it is never
    // allowed to become evidence of a habit.
    if (session.source !== "inferred") patternStarts.push(local);
  }

  const { usual, missing } = usualWindow(patternStarts);

  const alpine = timed.filter((s) => s.source !== "inferred" && s.part === "alpine-start");

  /* The last session and the last hard one are taken from the WHOLE window, not
     from the timed subset: how long ago something happened is answerable
     without a zone, and dropping an untimed session here would make the coach
     say "no hard session on record" about one that is plainly on record. */
  const last = window.length ? window[window.length - 1] : null;
  const hardOnes = window.filter(isHard);
  const lastHard = hardOnes.length ? hardOnes[hardOnes.length - 1] : null;

  const timedFor = (a: RecordedActivity | null): TimedSession | null => {
    if (!a) return null;
    const local = exactLocalStart(a);
    return local ? toTimed(a, local, now) : null;
  };

  const trainedDays = [
    ...new Set(
      window.map((a) => exactLocalStart(a)?.dayOfWeek ?? new Date(a.startedAt).getDay()),
    ),
  ].sort();

  const stated = [...new Set(statedDays)].sort();

  const today = checkIns.find((c) => c.date === todayKey);
  const checkInLocal =
    today?.at !== undefined
      ? exactLocalStart({ startedAt: today.at, startUtcOffsetMin: today.utcOffsetMin })
      : null;

  return {
    windowSessions: window.length,
    timedSessions: timed.length,
    inferredSessions: timed.filter((s) => s.source === "inferred").length,
    usual,
    usualMissing: missing,
    alpineStarts: alpine.length,
    lastAlpineStart: alpine.length ? alpine[alpine.length - 1] : null,
    last: timedFor(last),
    lastHard: timedFor(lastHard),
    hoursSinceLast: last ? hoursSince(last.startedAt, now) : null,
    hoursSinceLastHard: lastHard ? hoursSince(lastHard.startedAt, now) : null,
    zones: [...zones].sort(),
    awayFromUsualZone: last !== null && startedInAnotherZone(last, now),
    statedDays: stated,
    trainedDays,
    statedDaysUnused: stated.filter((d) => !trainedDays.includes(d)),
    unstatedDaysTrained: trainedDays.filter((d) => !stated.includes(d)),
    checkIn: checkInLocal
      ? {
          clock: checkInLocal.clock,
          part: checkInLocal.part,
          hoursAgo: hoursSince(today?.at ?? "", now) ?? 0,
        }
      : null,
    checkInUntimed: today !== undefined && checkInLocal === null,
  };
}

/* -------------------------------------------------------------------------- */
/* The prompt's sentences                                                      */
/* -------------------------------------------------------------------------- */

const list = (days: number[]): string => days.map(dayName).join(", ");

/**
 * The clock, as lines for the system prompt.
 *
 * FACTS AND THE LIMITS OF THOSE FACTS, nothing else. Each line either states
 * something ICEFALL observed or states plainly that it did not observe it —
 * there is no line here that tells the model what to conclude about training at
 * six in the evening, because that conclusion is the coach's job and the facts
 * are the app's.
 *
 * The one place an instruction does appear is the coverage line, and it is a
 * prohibition rather than advice: a model shown four start times out of twelve
 * sessions will describe a routine, and it must not.
 */
export function describeTrainingClock(c: TrainingClock): string[] {
  const lines: string[] = [];

  if (c.hoursSinceLast !== null) {
    const when = describeHoursSince(c.hoursSinceLast);
    lines.push(
      `Last session: ${when}${c.last ? ` (started ${c.last.clock} local, ${PART_OF_DAY_LABEL[c.last.part]})` : ""}.` +
        (c.last?.source === "inferred"
          ? " That start time was NOT given by the athlete — ICEFALL placed the session because nobody said when it was. Do not quote it back as their start time."
          : ""),
    );
  } else {
    lines.push("Last session: nothing recorded in the past four weeks.");
  }

  if (c.hoursSinceLastHard !== null) {
    lines.push(
      `Last hard session (600 m of ascent or three hours moving): ${describeHoursSince(c.hoursSinceLastHard)}` +
        `${c.lastHard ? `, started ${c.lastHard.clock} local` : ""}. Reason about recovery in HOURS, not days — this figure is the gap.`,
    );
  } else {
    lines.push(
      "Last hard session: none on record in the past four weeks. Say that rather than implying a recent one.",
    );
  }

  /* Coverage BEFORE the pattern, so the model reads the limit before it reads
     the claim. */
  lines.push(
    `Start times known for ${c.timedSessions} of ${c.windowSessions} sessions in the last four weeks` +
      (c.inferredSessions > 0
        ? `, ${c.inferredSessions} of which ICEFALL placed itself because nobody gave a time`
        : "") +
      ". You know nothing about when the rest happened, and must not generalise from the ones you can see as though they were all of them.",
  );

  if (c.usual) {
    lines.push(
      `Usual start: around ${c.usual.typical} local (${PART_OF_DAY_LABEL[c.usual.part]}), ` +
        `${c.usual.inBand} of ${c.usual.sessions} timed sessions between ${c.usual.earliest} and ${c.usual.latest}.`,
    );
  } else {
    lines.push(`Usual start: not established — ${c.usualMissing}. Ask rather than assume one.`);
  }

  if (c.alpineStarts > 0) {
    lines.push(
      `Alpine starts (before ${ALPINE_START_BEFORE_HOUR}:00 local): ${c.alpineStarts} in the last four weeks` +
        `${c.lastAlpineStart ? `, most recently ${c.lastAlpineStart.clock} on ${c.lastAlpineStart.dateKey}` : ""}. ` +
        "This is the only evidence ICEFALL holds that they have practised a summit-day start.",
    );
  } else if (c.timedSessions > 0) {
    lines.push(
      `Alpine starts: none recorded. Every timed session began after ${ALPINE_START_BEFORE_HOUR}:00 local. ` +
        "A summit day typically starts between midnight and 03:00, so this is a gap worth raising — as practice, never as a verdict on their readiness.",
    );
  }

  if (c.statedDays.length) {
    lines.push(
      `Days they said they could train: ${list(c.statedDays)}. Days they actually recorded on in the last four weeks: ` +
        `${c.trainedDays.length ? list(c.trainedDays) : "none"}.` +
        (c.statedDaysUnused.length
          ? ` Said but unused: ${list(c.statedDaysUnused)}.`
          : "") +
        (c.unstatedDaysTrained.length
          ? ` Trained though not offered: ${list(c.unstatedDaysTrained)}.`
          : ""),
    );
  }

  if (c.zones.length > 1) {
    lines.push(
      `Time zones in this period: ${c.zones.join(", ")}. They have trained in more than one, so every clock time above is local to where they were, not to one place.`,
    );
  }
  if (c.awayFromUsualZone) {
    lines.push(
      "Their most recent session was recorded in a different time zone from the one their phone is in now — they are travelling, or have just come back.",
    );
  }

  if (c.checkIn) {
    lines.push(
      `Today's check-in was filled in at ${c.checkIn.clock} local (${PART_OF_DAY_LABEL[c.checkIn.part]}), ${describeHoursSince(c.checkIn.hoursAgo)}. ` +
        "A morning check-in reports on the night; an evening one reports on the day's training. Read it as what it is.",
    );
  } else if (c.checkInUntimed) {
    lines.push(
      "Today's check-in has no recorded time — it predates ICEFALL storing one. Do not assume when it was made.",
    );
  }

  return lines;
}
