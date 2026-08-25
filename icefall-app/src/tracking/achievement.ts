import { activityById } from "./activities";
import type { RecordedActivity } from "./types";

/**
 * "Your best today" — the one honest thing worth saying about a finished
 * activity, and the milestones and totals behind it.
 *
 * THE RULE THAT SHAPES EVERY FUNCTION HERE: this module is allowed to find
 * nothing. A completion screen that always announces a personal best is a
 * completion screen nobody believes by the third week, and the moment an
 * athlete catches one invented superlative every real one stops counting. So
 * `bestToday` searches genuine distinctions in descending order of weight and
 * returns null when none of them is true — at which point the screen falls
 * back to the thing that IS true, which is that the person went out.
 *
 * Consistency is not a consolation prize here. "Fourth session this week" is a
 * real fact about a real week, and for a mountain athlete it is a better
 * predictor than any single big day.
 *
 * SIMULATED ACTIVITIES EARN NOTHING. They are filtered at every entry point,
 * and a simulated activity's own completion screen says so instead.
 */

export type AchievementTone = "record" | "period" | "consistency";

export interface Achievement {
  tone: AchievementTone;
  /** The headline — short, specific, and true. */
  headline: string;
  /** The supporting line, where one adds anything. */
  detail?: string;
  /** Set only for a genuine all-time record. */
  isPersonalBest?: boolean;
}

const startOfWeek = (d = new Date()) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday-first
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
};

const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfYear = (d = new Date()) => new Date(d.getFullYear(), 0, 1);

const since = (list: RecordedActivity[], from: Date) =>
  list.filter((a) => new Date(a.startedAt) >= from);

/**
 * The single best true thing about this activity, or null.
 *
 * Order matters: an all-time record outranks a monthly one, which outranks a
 * weekly one. Only the top hit is returned — a screen that lists five
 * achievements has told the athlete that none of them mattered.
 */
export function bestToday(
  activity: RecordedActivity,
  all: RecordedActivity[],
): Achievement | null {
  if (activity.simulated) return null;

  const real = all.filter((a) => !a.simulated);
  const others = real.filter((a) => a.id !== activity.id);
  const type = activityById(activity.activityTypeId);

  /* ---- All-time records ------------------------------------------------ */
  const beats = (pick: (a: RecordedActivity) => number | null) => {
    const mine = pick(activity);
    if (mine === null || !Number.isFinite(mine) || mine <= 0) return false;
    // A record needs something to beat: the first activity ever is not a record.
    const rest = others.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
    return rest.length > 0 && mine > Math.max(...rest);
  };

  if (beats((a) => a.elevationGainM)) {
    return {
      tone: "record",
      isPersonalBest: true,
      headline: "Biggest elevation gain yet",
      detail: `${Math.round(activity.elevationGainM).toLocaleString("en-GB")} m climbed — more than any activity you have recorded.`,
    };
  }
  if (beats((a) => a.maxAltitudeM)) {
    return {
      tone: "record",
      isPersonalBest: true,
      headline: "Highest you have been",
      detail: `${Math.round(activity.maxAltitudeM!).toLocaleString("en-GB")} m.`,
    };
  }
  if (beats((a) => a.movingSec)) {
    const h = Math.floor(activity.movingSec / 3600);
    const m = Math.round((activity.movingSec % 3600) / 60);
    return {
      tone: "record",
      isPersonalBest: true,
      headline: "Longest day out yet",
      detail: `${h}h ${m}m moving.`,
    };
  }
  if (beats((a) => a.distanceM)) {
    return {
      tone: "record",
      isPersonalBest: true,
      headline: "Furthest you have gone",
      detail: `${(activity.distanceM / 1000).toFixed(1)} km.`,
    };
  }

  /* ---- Best of a period ------------------------------------------------ */
  const periods: { from: Date; word: string }[] = [
    { from: startOfMonth(), word: "this month" },
    { from: startOfYear(), word: "this year" },
    { from: startOfWeek(), word: "this week" },
  ];

  for (const { from, word } of periods) {
    const window = since(others, from);
    if (window.length === 0) continue;

    if (
      activity.elevationGainM > 0 &&
      activity.elevationGainM > Math.max(...window.map((a) => a.elevationGainM))
    ) {
      return {
        tone: "period",
        headline: `Biggest vertical day ${word}`,
        detail: `${Math.round(activity.elevationGainM).toLocaleString("en-GB")} m climbed.`,
      };
    }
    if (activity.movingSec > Math.max(...window.map((a) => a.movingSec))) {
      const h = Math.floor(activity.movingSec / 3600);
      const m = Math.round((activity.movingSec % 3600) / 60);
      return {
        tone: "period",
        headline: `Longest activity ${word}`,
        detail: `${h}h ${m}m moving.`,
      };
    }
  }

  /* ---- Consistency — true, and not a consolation ----------------------- */
  const thisWeek = since(real, startOfWeek());
  if (thisWeek.length >= 2) {
    return {
      tone: "consistency",
      headline: `${ordinal(thisWeek.length)} session this week`,
      detail:
        type.family === "other"
          ? "You showed up again."
          : "Consistency is what a mountain actually asks for.",
    };
  }

  return null;
}

function ordinal(n: number): string {
  const words = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh"];
  return words[n] ?? `${n}th`;
}

/* -------------------------------------------------------------------------- */
/* The journey — today, this week, this month, total                           */
/* -------------------------------------------------------------------------- */

export interface JourneyTotals {
  todayVerticalM: number;
  weekActivities: number;
  weekVerticalM: number;
  monthActivities: number;
  monthVerticalM: number;
  totalVerticalM: number;
}

export function journeyTotals(all: RecordedActivity[]): JourneyTotals {
  const real = all.filter((a) => !a.simulated);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sum = (list: RecordedActivity[]) =>
    Math.round(list.reduce((m, a) => m + a.elevationGainM, 0));

  const week = since(real, startOfWeek());
  const month = since(real, startOfMonth());

  return {
    todayVerticalM: sum(since(real, today)),
    weekActivities: week.length,
    weekVerticalM: sum(week),
    monthActivities: month.length,
    monthVerticalM: sum(month),
    totalVerticalM: sum(real),
  };
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                  */
/* -------------------------------------------------------------------------- */

export interface Milestone {
  id: string;
  label: string;
  targetM: number;
  reached: boolean;
}

/**
 * Cumulative vertical, in the steps a mountain athlete actually thinks in.
 *
 * Deliberately few and deliberately large. A milestone every 500 m would be a
 * loyalty card; these are the numbers that take seasons.
 */
const VERTICAL_MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];

export function milestonesFor(totalVerticalM: number): Milestone[] {
  return VERTICAL_MILESTONES.map((m) => ({
    id: `vertical-${m}`,
    label: `${m.toLocaleString("en-GB")} m vertical`,
    targetM: m,
    reached: totalVerticalM >= m,
  }));
}

/** The next one still ahead, for the "what's next" line. */
export function nextMilestone(totalVerticalM: number): { label: string; remainingM: number } | null {
  const next = VERTICAL_MILESTONES.find((m) => totalVerticalM < m);
  return next
    ? { label: `${next.toLocaleString("en-GB")} m vertical`, remainingM: next - totalVerticalM }
    : null;
}

/**
 * Did this activity carry the athlete past a milestone?
 *
 * Compares the total before and after, so the moment is announced exactly once
 * — on the activity that crossed the line, and never again.
 */
export function milestoneCrossed(
  activity: RecordedActivity,
  all: RecordedActivity[],
): Milestone | null {
  if (activity.simulated) return null;
  const after = journeyTotals(all).totalVerticalM;
  const before = after - activity.elevationGainM;
  const crossed = VERTICAL_MILESTONES.find((m) => before < m && after >= m);
  return crossed
    ? { id: `vertical-${crossed}`, label: `${crossed.toLocaleString("en-GB")} m vertical`, targetM: crossed, reached: true }
    : null;
}

/* -------------------------------------------------------------------------- */
/* Why it mattered                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One sentence on what the session did, chosen by discipline and shape.
 *
 * Not a medical claim and not a promise — a description of the stimulus, in the
 * words a coach would use. The wording is picked from what was recorded, so a
 * flat hour and a 1,400 m climb never get the same sentence.
 */
export function whyItMattered(activity: RecordedActivity): string {
  const type = activityById(activity.activityTypeId);
  const gain = activity.elevationGainM;
  const hours = activity.movingSec / 3600;

  if (type.family === "other" || type.indoor) {
    return "Supported the strength and movement quality that long days on the mountain depend on.";
  }
  if (hours < 1 && gain < 200) {
    return "An easy session — this is the work that lets the hard days repeat.";
  }
  if (gain >= 1000) {
    return "A strong uphill stimulus, and the closest training there is to a summit day.";
  }
  if (gain >= 400) {
    return "Solid vertical work — the stimulus that mountain days are built on.";
  }
  if (hours >= 3) {
    return "Long, steady movement — the endurance a full day out asks for.";
  }
  return "Aerobic work that supports sustained movement in the mountains.";
}
