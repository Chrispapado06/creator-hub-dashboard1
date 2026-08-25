import type { RecordedActivity } from "@/tracking/types";

/**
 * What the Coach remembers.
 *
 * The point of this module is that the Coach should not start from zero in
 * every conversation. It can say "over the last six weeks your elevation
 * endurance has improved" because it compared two real windows of recorded
 * work — not because it is being encouraging.
 *
 * Every string this module produces must be checkable against the activities
 * passed in. If a window is too thin to support a claim, the direction is
 * "unknown" and no claim is made. "Stable" is a finding, not a fallback for
 * having no data.
 */

export interface Trend {
  id: string;
  label: string;
  direction: "improving" | "declining" | "stable" | "unknown";
  detail: string;
  windowWeeks: number;
}

export interface CoachMemory {
  trends: Trend[];
  strengths: string[];
  weaknesses: string[];
  /** Statements of fact about the athlete's history, each derived from the data. */
  facts: string[];
}

const WINDOW_WEEKS = 6;
const DAY_MS = 86_400_000;

/** Enough sessions in BOTH windows that a comparison means something. */
const MIN_PER_WINDOW = 3;

/** Below this, two windows are indistinguishable given how noisy training is. */
const MEANINGFUL_CHANGE = 0.15;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inWindow(a: RecordedActivity, from: Date, to: Date): boolean {
  const t = new Date(a.startedAt).getTime();
  return t >= from.getTime() && t < to.getTime();
}

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

/**
 * Compare a recent window against the one immediately before it.
 *
 * Returns `unknown` unless both windows clear MIN_PER_WINDOW — a single big
 * weekend against an empty month is not a trend, and presenting it as one would
 * be the kind of confident-sounding nonsense this codebase exists to avoid.
 */
function compareWindows(args: {
  id: string;
  label: string;
  recent: RecordedActivity[];
  previous: RecordedActivity[];
  value: (a: RecordedActivity) => number;
  format: (n: number) => string;
  /** Some measures are better when lower; none currently, but be explicit. */
  higherIsBetter?: boolean;
}): Trend {
  const { id, label, recent, previous, value, format, higherIsBetter = true } = args;

  if (recent.length < MIN_PER_WINDOW || previous.length < MIN_PER_WINDOW) {
    return {
      id,
      label,
      direction: "unknown",
      detail: `Not enough recorded work in both ${WINDOW_WEEKS}-week windows to compare.`,
      windowWeeks: WINDOW_WEEKS,
    };
  }

  const now = sum(recent.map(value));
  const before = sum(previous.map(value));

  // A zero baseline makes a ratio meaningless rather than infinite.
  if (before <= 0) {
    return {
      id,
      label,
      direction: "unknown",
      detail: `No comparable ${label.toLowerCase()} in the previous window.`,
      windowWeeks: WINDOW_WEEKS,
    };
  }

  const change = (now - before) / before;
  const better = higherIsBetter ? change > 0 : change < 0;

  let direction: Trend["direction"] = "stable";
  if (Math.abs(change) >= MEANINGFUL_CHANGE) direction = better ? "improving" : "declining";

  const pct = Math.round(Math.abs(change) * 100);
  const detail =
    direction === "stable"
      ? `${format(now)} over the last ${WINDOW_WEEKS} weeks, in line with the ${WINDOW_WEEKS} before.`
      : `${format(now)} over the last ${WINDOW_WEEKS} weeks, ${pct}% ${change > 0 ? "more" : "less"} than the ${WINDOW_WEEKS} before (${format(before)}).`;

  return { id, label, direction, detail, windowWeeks: WINDOW_WEEKS };
}

export function buildMemory(args: {
  activities: RecordedActivity[];
  goals?: { name: string; status: string; elevationM?: number }[];
  now?: Date;
}): CoachMemory {
  const now = args.now ?? new Date();
  const today = startOfDay(now);
  const windowMs = WINDOW_WEEKS * 7 * DAY_MS;

  const recentFrom = new Date(today.getTime() - windowMs);
  const previousFrom = new Date(today.getTime() - windowMs * 2);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  // Simulated recordings are badged SIMULATED wherever they surface and must not
  // become "facts" about the athlete's history — briefing.ts promotes these
  // strings onto the home screen as the Coach's observation of the week.
  const real = args.activities.filter((a) => a.simulated !== true);
  const recent = real.filter((a) => inWindow(a, recentFrom, tomorrow));
  const previous = real.filter((a) => inWindow(a, previousFrom, recentFrom));

  const trends: Trend[] = [
    compareWindows({
      id: "vertical",
      label: "Elevation volume",
      recent,
      previous,
      value: (a) => a.elevationGainM,
      format: (n) => `${Math.round(n).toLocaleString("en-GB")} m of ascent`,
    }),
    compareWindows({
      id: "duration",
      label: "Training time",
      recent,
      previous,
      value: (a) => a.movingSec / 3600,
      format: (n) => `${n.toFixed(1)} hours`,
    }),
    compareWindows({
      id: "distance",
      label: "Distance",
      recent,
      previous,
      value: (a) => a.distanceM / 1000,
      format: (n) => `${n.toFixed(1)} km`,
    }),
    compareWindows({
      id: "frequency",
      label: "Session count",
      recent,
      previous,
      value: () => 1,
      format: (n) => `${Math.round(n)} sessions`,
    }),
  ];

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const t of trends) {
    if (t.direction === "improving") strengths.push(`${t.label.toLowerCase()} is trending up`);
    if (t.direction === "declining") weaknesses.push(`${t.label.toLowerCase()} has fallen off`);
  }

  // Consistency is measured as distinct active weeks, which is far more honest
  // than session count: six sessions in one weekend is not a consistent block.
  const activeWeeks = new Set(
    recent.map((a) => {
      const d = startOfDay(new Date(a.startedAt));
      return Math.floor((today.getTime() - d.getTime()) / (7 * DAY_MS));
    }),
  ).size;

  if (recent.length >= MIN_PER_WINDOW) {
    if (activeWeeks >= WINDOW_WEEKS - 1) strengths.push("training week to week without long gaps");
    else if (activeWeeks <= WINDOW_WEEKS / 2)
      weaknesses.push(
        `only ${activeWeeks} of the last ${WINDOW_WEEKS} weeks had a recorded session`,
      );
  }

  const facts: string[] = [];
  if (recent.length > 0) {
    const vertical = Math.round(sum(recent.map((a) => a.elevationGainM)));
    const hours = sum(recent.map((a) => a.movingSec)) / 3600;
    facts.push(
      `${recent.length} sessions recorded in the last ${WINDOW_WEEKS} weeks, totalling ${vertical.toLocaleString("en-GB")} m of ascent over ${hours.toFixed(1)} hours.`,
    );

    const biggest = recent.reduce((a, b) => (b.elevationGainM > a.elevationGainM ? b : a));
    if (biggest.elevationGainM > 0) {
      facts.push(
        `Largest single day in that period: ${Math.round(biggest.elevationGainM).toLocaleString("en-GB")} m of ascent on ${new Date(biggest.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`,
      );
    }
  } else {
    facts.push("No sessions recorded in the last six weeks.");
  }

  const active = (args.goals ?? []).filter((g) => g.status === "active");
  if (active.length > 0) {
    facts.push(`Currently working towards ${active.map((g) => g.name).join(", ")}.`);
  }

  return { trends, strengths, weaknesses, facts };
}
