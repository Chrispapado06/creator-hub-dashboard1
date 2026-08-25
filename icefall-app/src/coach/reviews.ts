import type { LoadTrend } from "@/coach/types";
import type { RecordedActivity } from "@/tracking/types";

/**
 * Weekly and monthly reviews.
 *
 * A review is a description of a period, not a verdict on the athlete. Every
 * line it produces is derived from a figure that appears somewhere in `stats`,
 * so a reader can always answer "where did that come from".
 *
 * Three rules shape almost every decision below:
 *
 *  1. A period with nothing in it is not a period of zeroes. When the previous
 *     week or month holds no activity we cannot tell a rest block apart from a
 *     fortnight of unrecorded training, so the comparison is dropped entirely
 *     rather than reported as "+100%" against an invented baseline.
 *  2. Fewer than two activities is not a pattern. Below that threshold the
 *     review says so and stops, instead of dressing a single outing up as a
 *     trend.
 *  3. When load has climbed sharply, nothing here suggests climbing further.
 *     Advice in that state is always "hold, repeat, make it consistent" — a
 *     review that told a ramping athlete to add volume would be doing damage
 *     with a friendly voice.
 *
 * This module reports training, not physiology. It never says an athlete is
 * overtrained, run down or at risk — only that the numbers moved, and by how
 * much.
 */

/* -------------------------------------------------------------------------- */
/* Public shape                                                                */
/* -------------------------------------------------------------------------- */

export interface ReviewStat {
  label: string;
  value: string;
  delta?: string;
  direction?: "up" | "down" | "flat";
}

export interface Review {
  /** "Week of 10 August" / "August 2026". */
  periodLabel: string;
  stats: ReviewStat[];
  wentWell: string[];
  toImprove: string[];
  nextFocus: string;
  /** Only for the monthly review. */
  verdict?: string;
  /** True when there is too little in the period to say anything honest. */
  sparse: boolean;
}

/* -------------------------------------------------------------------------- */
/* Tuning                                                                      */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Below this many activities a period cannot be described, only counted. */
const SPARSE_BELOW = 2;

/** At most this many observations per list — a review that lists everything says nothing. */
const MAX_OBSERVATIONS = 3;

/** A session at or beyond one of these counts as the period's long day. */
const LONG_SESSION_SEC: Record<PeriodKind, number> = { week: 90 * 60, month: 3 * 3600 };

/** Ascent below which "one day carried the period" is not worth remarking on. */
const CONCENTRATION_FLOOR_M = 500;

/* -------------------------------------------------------------------------- */
/* Periods                                                                     */
/* -------------------------------------------------------------------------- */

type PeriodKind = "week" | "month";

interface Period {
  kind: PeriodKind;
  label: string;
  /** Local midnight the period opens. */
  start: Date;
  /** Local midnight the period closes, exclusive. */
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

/**
 * Monday-first weeks and local midnights, matching how the training plan anchors
 * its weeks. Deliberately computed here rather than imported from the fixture
 * clock: the coach modules must keep working when the mock data layer is gone.
 */
function startOfWeekLocal(ref: Date): Date {
  const d = new Date(ref);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(ref: Date, n: number): Date {
  const d = new Date(ref);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfMonthLocal(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(ref: Date, n: number): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + n, 1, 0, 0, 0, 0);
}

/**
 * Whole local days between two instants. Goes via the calendar date rather than
 * dividing milliseconds so a daylight-saving change cannot shift a day boundary.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / DAY_MS);
}

function periodFor(kind: PeriodKind, now: Date): Period {
  if (kind === "week") {
    const start = startOfWeekLocal(now);
    return {
      kind,
      label: `Week of ${start.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`,
      start,
      end: addDays(start, 7),
      previousStart: addDays(start, -7),
      previousEnd: start,
    };
  }

  const start = startOfMonthLocal(now);
  return {
    kind,
    label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    start,
    end: addMonths(start, 1),
    previousStart: addMonths(start, -1),
    previousEnd: start,
  };
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

interface Totals {
  activities: number;
  distanceM: number;
  elevationGainM: number;
  /** Summed only over activities that actually reported time on the move. */
  movingSec: number;
  /** How many of the activities contributed to `movingSec`. */
  timedActivities: number;
  /** Distinct local calendar days holding at least one activity. */
  activeDays: number;
  /** Recordings produced by the labelled simulator rather than real sensors. */
  simulated: number;
  longestMovingSec: number;
  biggestAscentM: number;
  /** Ascent of the single largest day — spots a period carried by one outing. */
  biggestDayAscentM: number;
  /** The period's longest session by time on the move, for naming it in copy. */
  longest: RecordedActivity | null;
}

const EMPTY_TOTALS: Totals = {
  activities: 0,
  distanceM: 0,
  elevationGainM: 0,
  movingSec: 0,
  timedActivities: 0,
  activeDays: 0,
  simulated: 0,
  longestMovingSec: 0,
  biggestAscentM: 0,
  biggestDayAscentM: 0,
  longest: null,
};

function totalsFor(acts: RecordedActivity[], from: Date, to: Date): Totals {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const ascentByDay = new Map<string, number>();
  const totals: Totals = { ...EMPTY_TOTALS };

  for (const a of acts) {
    const started = new Date(a.startedAt);
    const t = started.getTime();
    if (!Number.isFinite(t) || t < fromMs || t >= toMs) continue;

    totals.activities += 1;
    totals.distanceM += a.distanceM;
    totals.elevationGainM += a.elevationGainM;
    if (a.simulated) totals.simulated += 1;

    // Moving time is the honest measure of a session; elapsed includes pauses.
    // A recording that never reported motion contributes nothing here and is
    // counted as untimed instead, so the total is never quietly padded.
    if (a.movingSec > 0) {
      totals.movingSec += a.movingSec;
      totals.timedActivities += 1;
      if (a.movingSec > totals.longestMovingSec) {
        totals.longestMovingSec = a.movingSec;
        totals.longest = a;
      }
    }

    if (a.elevationGainM > totals.biggestAscentM) totals.biggestAscentM = a.elevationGainM;

    const key = `${started.getFullYear()}-${started.getMonth()}-${started.getDate()}`;
    ascentByDay.set(key, (ascentByDay.get(key) ?? 0) + a.elevationGainM);
  }

  totals.activeDays = ascentByDay.size;
  for (const gain of ascentByDay.values()) {
    if (gain > totals.biggestDayAscentM) totals.biggestDayAscentM = gain;
  }
  return totals;
}

/**
 * One comparable figure for a period: minutes on the move plus ascent, weighted
 * so 100 m of climbing counts about like ten minutes of movement. Vertical is
 * weighted deliberately — an hour of climbing is not an hour of flat running,
 * and the same view of load is taken in src/tracking/points.ts.
 */
function loadOf(t: Totals): number {
  return t.movingSec / 60 + t.elevationGainM / 10;
}

/**
 * How this period's load sits against the last. Returns "insufficient-data"
 * rather than a trend whenever the previous period holds nothing to divide by:
 * a ratio against zero is not a large increase, it is an unknown one.
 */
function classifyLoad(current: Totals, previous: Totals | null): LoadTrend {
  if (!previous || previous.activities === 0) return "insufficient-data";
  const before = loadOf(previous);
  if (before <= 0) return "insufficient-data";

  const ratio = loadOf(current) / before;
  if (ratio >= 1.5) return "spike";
  if (ratio >= 1.15) return "ramping";
  if (ratio >= 0.75) return "steady";
  return "detraining";
}

/** True when advice must not add volume. */
function isRamping(trend: LoadTrend): boolean {
  return trend === "spike" || trend === "ramping";
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

function formatDistance(metres: number): string {
  const km = metres / 1000;
  return `${km >= 100 ? Math.round(km).toLocaleString("en-GB") : km.toFixed(1)} km`;
}

function formatMetres(metres: number): string {
  return `${Math.round(metres).toLocaleString("en-GB")} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatCount(n: number, singular: string, plural = `${singular}s`): string {
  const rounded = Math.round(n);
  return `${rounded} ${Math.abs(rounded) === 1 ? singular : plural}`;
}

function signed(diff: number, format: (v: number) => string): string {
  return `${diff > 0 ? "+" : "-"}${format(Math.abs(diff))}`;
}

/**
 * A delta, or nothing at all.
 *
 * `previous` is null when the previous period held no activity. That is the
 * case this function exists for: comparing against a period we never observed
 * produces confident nonsense, so the stat simply carries no delta and the UI
 * shows the value alone.
 */
function deltaOf(
  current: number,
  previous: number | null,
  format: (v: number) => string,
  epsilon: number,
): Pick<ReviewStat, "delta" | "direction"> {
  if (previous === null) return {};
  const diff = current - previous;
  if (Math.abs(diff) <= epsilon) return { delta: "no change", direction: "flat" };
  return { delta: signed(diff, format), direction: diff > 0 ? "up" : "down" };
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

interface Frame {
  period: Period;
  current: Totals;
  /** Null when the previous equivalent period held no activity. */
  previous: Totals | null;
  trend: LoadTrend;
  /** Calendar days of the period that have happened, 1..fullDays. */
  elapsedDays: number;
  fullDays: number;
  remainingDays: number;
  /** "week" / "month", for copy. */
  noun: PeriodKind;
  /** "last week" / "last month", for copy. */
  lastNoun: string;
}

function buildStats(frame: Frame): ReviewStat[] {
  const { current, previous, elapsedDays, fullDays } = frame;
  const partial = elapsedDays < fullDays;

  const stats: ReviewStat[] = [
    {
      label: "Activities",
      value: formatCount(current.activities, "activity").replace("activitys", "activities"),
      ...deltaOf(
        current.activities,
        previous?.activities ?? null,
        (v) => formatCount(v, "session"),
        0,
      ),
    },
    {
      label: "Distance",
      value: formatDistance(current.distanceM),
      ...deltaOf(current.distanceM, previous?.distanceM ?? null, formatDistance, 50),
    },
    {
      label: "Ascent",
      value: formatMetres(current.elevationGainM),
      ...deltaOf(current.elevationGainM, previous?.elevationGainM ?? null, formatMetres, 10),
    },
  ];

  // Training time is reported only over the activities that recorded movement.
  // With none of them timed there is no figure to give, and the stat says that
  // rather than showing a confident zero.
  const untimed = current.activities - current.timedActivities;
  if (current.activities > 0 && current.timedActivities === 0) {
    stats.push({ label: "Training time", value: "Not recorded" });
  } else {
    stats.push({
      label:
        untimed > 0
          ? `Training time (${current.timedActivities} of ${current.activities} timed)`
          : "Training time",
      value: formatDuration(current.movingSec),
      ...deltaOf(
        current.movingSec,
        previous && previous.timedActivities > 0 ? previous.movingSec : null,
        formatDuration,
        60,
      ),
    });
  }

  stats.push({
    label: "Consistency",
    value: `${current.activeDays} of ${elapsedDays} days${partial ? " so far" : ""}`,
    ...deltaOf(current.activeDays, previous?.activeDays ?? null, (v) => formatCount(v, "day"), 0),
  });

  // Simulated recordings come from the labelled route simulator, not from
  // sensors. They are counted like any other session, but a review that folded
  // them silently into the totals would be overstating what was actually done.
  if (current.simulated > 0) {
    stats.push({
      label: "Simulated recordings",
      value: `${current.simulated} of ${current.activities}`,
    });
  }

  return stats;
}

/* -------------------------------------------------------------------------- */
/* Observations                                                                */
/* -------------------------------------------------------------------------- */

function sparseObservations(frame: Frame): Pick<Review, "wentWell" | "toImprove" | "nextFocus"> {
  const { current, noun, period } = frame;

  if (current.activities === 0) {
    return {
      wentWell: [`No activities recorded in ${period.label}. There is nothing here to assess.`],
      toImprove: [
        `A review needs at least ${SPARSE_BELOW} recorded sessions in a ${noun} before it can say anything that is actually true of your training.`,
      ],
      nextFocus: `Record the next session you do, whatever its size. Everything this review reports is built from what you log.`,
    };
  }

  const only = current.longest;
  const detail = only
    ? `${formatDistance(current.distanceM)}, ${formatMetres(current.elevationGainM)} of ascent, ${formatDuration(current.movingSec)}`
    : `${formatDistance(current.distanceM)}, ${formatMetres(current.elevationGainM)} of ascent`;

  return {
    wentWell: [
      `One activity recorded: ${detail}. A single session is not a pattern, so there is nothing to read into it yet.`,
    ],
    toImprove: [
      `With one activity in the ${noun} any observation would be invention. Two or more give this review something to compare.`,
    ],
    nextFocus: `Keep recording. Once a ${noun} holds two or more sessions the review can compare it with the one before.`,
  };
}

function wentWellFor(frame: Frame): string[] {
  const { current, previous, trend, elapsedDays, noun } = frame;
  const out: string[] = [];

  const consistencyRate = elapsedDays > 0 ? current.activeDays / elapsedDays : 0;
  if (consistencyRate >= 0.5) {
    out.push(
      `You trained on ${current.activeDays} of ${elapsedDays} days. Frequency at that level is what makes a ${noun} repeatable.`,
    );
  }

  // Growth is worth naming — but not while load is spiking, where the honest
  // reading is "that was a large jump", not "well done for jumping".
  if (previous && trend !== "spike" && current.elevationGainM > previous.elevationGainM * 1.1) {
    out.push(
      `Ascent rose from ${formatMetres(previous.elevationGainM)} to ${formatMetres(current.elevationGainM)} without the ${noun} becoming a jump.`,
    );
  }

  if (current.longest && current.longestMovingSec >= LONG_SESSION_SEC[noun]) {
    out.push(
      `Longest session: ${formatDuration(current.longestMovingSec)} with ${formatMetres(current.longest.elevationGainM)} of ascent. That is the session the mountain days are built on.`,
    );
  }

  if (previous && current.timedActivities > 0 && previous.timedActivities > 0) {
    const diff = current.movingSec - previous.movingSec;
    if (trend === "steady" && Math.abs(diff) <= previous.movingSec * 0.15) {
      out.push(
        `Training time held at ${formatDuration(current.movingSec)} against ${formatDuration(previous.movingSec)}. Steady is the point.`,
      );
    }
  }

  if (out.length === 0) {
    out.push(
      `${current.activities} activities recorded: ${formatDistance(current.distanceM)} and ${formatMetres(current.elevationGainM)} of ascent across ${current.activeDays} days.`,
    );
  }

  return out.slice(0, MAX_OBSERVATIONS);
}

function toImproveFor(frame: Frame): string[] {
  const { current, previous, trend, elapsedDays, noun, lastNoun } = frame;
  const out: string[] = [];

  // Ramp guard comes first and, where it fires, nothing after it is allowed to
  // ask for more volume. This is the one rule in the module that exists purely
  // for the athlete's safety.
  if (previous && trend === "spike") {
    out.push(
      `Load is well above ${lastNoun}: ${formatDuration(previous.movingSec)} and ${formatMetres(previous.elevationGainM)} became ${formatDuration(current.movingSec)} and ${formatMetres(current.elevationGainM)}. Hold this volume rather than adding to it, and make the long session the part that repeats.`,
    );
  } else if (previous && trend === "ramping") {
    out.push(
      `Ascent is up from ${formatMetres(previous.elevationGainM)} to ${formatMetres(current.elevationGainM)}. Keep the increase where it is for another ${noun} before it grows again.`,
    );
  }

  if (!isRamping(trend)) {
    if (current.timedActivities > 0 && current.longestMovingSec < LONG_SESSION_SEC[noun]) {
      out.push(
        `No session ran past ${formatDuration(current.longestMovingSec)}. Mountain days are decided by one long, steady session — make one of these longer rather than adding another.`,
      );
    }

    const concentrated =
      current.activeDays >= 2 &&
      current.elevationGainM >= CONCENTRATION_FLOOR_M &&
      current.biggestDayAscentM >= current.elevationGainM * 0.7;
    if (concentrated) {
      out.push(
        `${formatMetres(current.biggestDayAscentM)} of the ${formatMetres(current.elevationGainM)} climbed came from a single day. Spread across two or three days it is a ${noun} you can repeat.`,
      );
    }

    if (current.activities >= SPARSE_BELOW && current.elevationGainM < 100) {
      out.push(
        `Recorded ascent for the ${noun} was ${formatMetres(current.elevationGainM)}. Vertical is the specific demand a mountain objective makes, and it is the thing missing here.`,
      );
    }

    const consistencyRate = elapsedDays > 0 ? current.activeDays / elapsedDays : 0;
    if (consistencyRate < 0.3 && current.activities >= SPARSE_BELOW) {
      out.push(
        `The ${noun}'s work sat on ${current.activeDays} of ${elapsedDays} days. Three moderate days do more for a build than one large one.`,
      );
    }
  }

  if (previous && trend === "detraining") {
    out.push(
      `Training time fell from ${formatDuration(previous.movingSec)} to ${formatDuration(current.movingSec)}. If that was planned rest, illness or life, there is nothing here to fix — do not try to win the time back in one session.`,
    );
  }

  // Being explicit that this is a baseline rather than a comparison matters more
  // than any observation we could make in its place.
  if (!previous) {
    out.push(
      `Nothing was recorded in the ${lastNoun.replace("last ", "previous ")}, so none of these figures are comparisons. Treat this ${noun} as the baseline.`,
    );
  }

  if (out.length === 0) {
    out.push(
      `Nothing in the numbers stands out as a gap. Repeat this ${noun} before changing anything in it.`,
    );
  }

  return out.slice(0, MAX_OBSERVATIONS);
}

function nextFocusFor(frame: Frame): string {
  const { current, trend, elapsedDays, remainingDays, noun, lastNoun } = frame;

  const consistencyRate = elapsedDays > 0 ? current.activeDays / elapsedDays : 0;

  let advice: string;
  switch (trend) {
    case "spike":
      advice = `Hold volume where it is next ${noun}. Repeat the long session at the same size rather than extending it.`;
      break;
    case "ramping":
      advice = `One more ${noun} at this volume before anything grows. Consistency at the new level is the work now.`;
      break;
    case "detraining":
      advice = `Return to your recent normal before building on it. Frequency first, session size later.`;
      break;
    case "insufficient-data":
      advice = `Record consistently through the next ${noun} so this review has a period to compare against.`;
      break;
    case "steady":
    default:
      advice =
        consistencyRate < 0.4
          ? `Prioritise frequency over session size: an extra moderate day does more here than a longer one.`
          : `Keep the shape of the ${noun} and add a little vertical to the long session. Leave the rest alone.`;
      break;
  }

  // A period still in progress gets the remaining days named, so the advice is
  // read as something to act on rather than a post-mortem.
  if (remainingDays >= 1) {
    return `${formatCount(remainingDays, "day")} remain in the ${noun}. ${advice}`;
  }
  return advice;
}

function verdictFor(frame: Frame, sparse: boolean): string {
  const { current, trend, elapsedDays, period } = frame;

  if (sparse) {
    return `Too little recorded in ${period.label} for a verdict: ${current.activities === 1 ? "one activity" : "no activities"}.`;
  }

  const figures = `${current.activities} activities, ${formatDistance(current.distanceM)} and ${formatMetres(current.elevationGainM)} of ascent across ${current.activeDays} active days.`;
  const consistencyRate = elapsedDays > 0 ? current.activeDays / elapsedDays : 0;

  let character: string;
  if (trend === "spike") {
    character =
      "A large month against your recent normal. The value now is in repeating it, not exceeding it.";
  } else if (trend === "detraining") {
    character = "A lighter month than the one before it.";
  } else if (consistencyRate >= 0.45) {
    character = "A consistent month, and consistency is what carries a build.";
  } else {
    character = "The volume is there; the frequency is not yet.";
  }

  return `${figures} ${character}`;
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

function buildReview(kind: PeriodKind, acts: RecordedActivity[], now: Date): Review {
  const period = periodFor(kind, now);

  // Totals run to now, not to the end of the period: a review opened on
  // Wednesday describes Monday to Wednesday, not a week that has not happened.
  const windowEnd = now.getTime() < period.end.getTime() ? now : period.end;
  const elapsedMs = Math.max(0, windowEnd.getTime() - period.start.getTime());

  // The previous period is cut to the same elapsed length. Without this, every
  // review run mid-period would report a collapse in training against a full
  // period that had simply had more time to happen.
  const previousWindowEnd = new Date(
    Math.min(period.previousStart.getTime() + elapsedMs, period.previousEnd.getTime()),
  );

  const current = totalsFor(acts, period.start, windowEnd);
  const previousRaw = totalsFor(acts, period.previousStart, previousWindowEnd);
  const previous = previousRaw.activities > 0 ? previousRaw : null;

  const fullDays = Math.round(calendarDaysBetween(period.start, period.end));
  const elapsedDays = Math.min(fullDays, calendarDaysBetween(period.start, windowEnd) + 1);

  const frame: Frame = {
    period,
    current,
    previous,
    trend: classifyLoad(current, previous),
    elapsedDays,
    fullDays,
    remainingDays: Math.max(0, fullDays - elapsedDays),
    noun: kind,
    lastNoun: kind === "week" ? "last week" : "last month",
  };

  const sparse = current.activities < SPARSE_BELOW;
  const observations = sparse
    ? sparseObservations(frame)
    : {
        wentWell: wentWellFor(frame),
        toImprove: toImproveFor(frame),
        nextFocus: nextFocusFor(frame),
      };

  return {
    periodLabel: period.label,
    stats: buildStats(frame),
    wentWell: observations.wentWell,
    toImprove: observations.toImprove,
    nextFocus: observations.nextFocus,
    verdict: kind === "month" ? verdictFor(frame, sparse) : undefined,
    sparse,
  };
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

/** Review of the ISO week containing `now`, compared with the week before it. */
export function weeklyReview(acts: RecordedActivity[], now: Date = new Date()): Review {
  return buildReview("week", acts, now);
}

/** Review of the calendar month containing `now`, compared with the month before it. */
export function monthlyReview(acts: RecordedActivity[], now: Date = new Date()): Review {
  return buildReview("month", acts, now);
}
