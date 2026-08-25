import { useMemo } from "react";
import { isoDate, startOfWeek } from "@/data/mock/clock";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import { useActivityFeed } from "./feed";
import type {
  Activity,
  Difficulty,
  Goal,
  Mountain,
  TrainingDay,
  TrainingFocus,
  TrainingPlan,
  TrainingWeek,
} from "@/types";

/**
 * Goal-driven training.
 *
 * The plan used to be a single fixture hardcoded to Mont Blanc: choosing any
 * other objective — or writing your own — still produced a Mont Blanc block,
 * and nothing you recorded ever changed it. This module generates the plan from
 * the objective, marks sessions off against activities you actually did, and
 * derives goal preparation from both.
 */

const MS_WEEK = 7 * 86_400_000;
const MIN_WEEKS = 8;
const MAX_WEEKS = 52;
/** Sessions that must be observable before consistency is trusted fully. */
const MIN_OBSERVED_SESSIONS = 12;

/* -------------------------------------------------------------------------- */
/* Plan generation                                                             */
/* -------------------------------------------------------------------------- */

interface DayTemplate {
  focus: TrainingFocus;
  title: string;
  detail?: string;
  difficulty: Difficulty;
  distanceKm?: number;
  elevationM?: number;
  durationMin?: number;
}

/**
 * A week's shape. `load` scales volume with the block, `demand` with how serious
 * the objective is — a Toubkal build should not look like an Everest build.
 */
function weekTemplate(
  block: string,
  load: number,
  demand: number,
  verticalFocus: boolean,
): DayTemplate[] {
  const s = (n: number) => Math.max(1, Math.round(n * load * demand));
  const peaking = block.startsWith("Peak");

  return [
    {
      focus: "recovery",
      title: "Recovery",
      detail: "Easy movement, mobility",
      difficulty: 1,
      durationMin: 30,
    },
    {
      focus: "endurance",
      title: "Endurance Run",
      detail: "Zone 2 throughout",
      difficulty: 2,
      distanceKm: s(12),
      elevationM: s(420),
      durationMin: s(75),
    },
    {
      focus: "strength",
      title: "Strength — Lower Body",
      detail: "Split squats, step-ups, calf raises, core",
      difficulty: 3,
      durationMin: s(60),
    },
    { focus: "rest", title: "Rest", detail: "Full rest. Adaptation happens here.", difficulty: 1 },
    peaking
      ? {
          focus: "intervals",
          title: "Uphill Intervals",
          detail: "6 × 4 min hard uphill, 3 min easy",
          difficulty: 4,
          durationMin: s(70),
        }
      : {
          focus: verticalFocus ? "technical" : "endurance",
          title: verticalFocus ? "Technical Session" : "Tempo Run",
          detail: verticalFocus
            ? "Crampon and axe work, rope systems"
            : "Sustained threshold effort",
          difficulty: 4,
          durationMin: s(70),
        },
    {
      focus: "long-mountain",
      title: "Long Mountain Session",
      detail: "Sustained vertical with a loaded pack",
      difficulty: 4,
      distanceKm: s(18),
      elevationM: s(1200),
      durationMin: s(300),
    },
    {
      focus: "recovery",
      title: "Recovery Walk",
      detail: "Flat, conversational pace",
      difficulty: 1,
      distanceKm: s(6),
      durationMin: s(60),
    },
  ];
}

/** Base → Build → Peak → Taper, proportional to however long the plan is. */
function blockFor(week: number, total: number): { name: string; load: number } {
  const p = week / total;
  if (p <= 0.28) return { name: `Base ${Math.ceil(week / 3)}`, load: 0.8 };
  if (p <= 0.65) return { name: `Build ${Math.ceil((week - total * 0.28) / 4)}`, load: 1 };
  if (p <= 0.92) return { name: `Peak ${Math.ceil((week - total * 0.65) / 4)}`, load: 1.25 };
  return { name: "Taper", load: 0.55 };
}

/** How demanding the objective is, from the mountain or the goal's altitude. */
export function demandFor(goal: Goal, mountain?: Mountain): number {
  if (mountain) return 0.7 + mountain.difficulty * 0.13;
  if (goal.elevationM) return 0.7 + Math.min(5, goal.elevationM / 1600) * 0.13;
  return 1;
}

export function buildPlanForGoal(goal: Goal, mountain?: Mountain, now = new Date()): TrainingPlan {
  const target = new Date(goal.targetDate);
  const started = goal.trainingStartedAt ? new Date(goal.trainingStartedAt) : now;

  const spanWeeks = Math.round((target.getTime() - started.getTime()) / MS_WEEK);
  const totalWeeks = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, spanWeeks));

  // Week 1 begins on the Monday of the week training started.
  const planStart = startOfWeek(started);
  const elapsed = Math.floor((now.getTime() - planStart.getTime()) / MS_WEEK);
  const currentWeek = Math.min(totalWeeks, Math.max(1, elapsed + 1));

  const demand = demandFor(goal, mountain);
  const verticalFocus = (mountain?.difficulty ?? 3) >= 4 || (goal.elevationM ?? 0) >= 3500;

  const weeks: TrainingWeek[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const monday = new Date(planStart);
    monday.setDate(monday.getDate() + (w - 1) * 7);

    const { name, load } = blockFor(w, totalWeeks);
    const isDeload = w % 4 === 0 && w < totalWeeks - 3;
    const tpl = weekTemplate(name, isDeload ? load * 0.65 : load, demand, verticalFocus);

    const days: TrainingDay[] = tpl.map((d, i) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);
      return {
        date: isoDate(date),
        focus: d.focus,
        title: d.title,
        detail: d.detail,
        distanceKm: d.distanceKm,
        elevationM: d.elevationM,
        durationMin: d.durationMin,
        difficulty: d.difficulty,
        // Never pre-ticked. A session is done when an activity did the work or
        // the athlete says so — inventing completion inflated preparation for a
        // goal set five minutes ago.
        completed: false,
      };
    });

    weeks.push({
      index: w,
      block: isDeload ? `${name} · deload` : name,
      startDate: isoDate(monday),
      days,
    });
  }

  return {
    id: `plan-${goal.id}`,
    goalId: goal.id,
    title: `${goal.name} — ${totalWeeks} weeks`,
    totalWeeks,
    currentWeek,
    weeks,
  };
}

/* -------------------------------------------------------------------------- */
/* Did an activity satisfy the session?                                        */
/* -------------------------------------------------------------------------- */

/** A session counts as done at 60% of what was prescribed — training is not homework. */
const SATISFY = 0.6;

export function activitySatisfies(day: TrainingDay, acts: Activity[]): boolean {
  if (day.focus === "rest" || acts.length === 0) return false;

  const distanceKm = acts.reduce((a, x) => a + x.distanceKm, 0);
  const elevationM = acts.reduce((a, x) => a + x.elevationGainM, 0);
  const minutes = acts.reduce((a, x) => a + x.durationSec / 60, 0);

  if (day.elevationM) return elevationM >= day.elevationM * SATISFY;
  if (day.distanceKm) return distanceKm >= day.distanceKm * SATISFY;
  if (day.durationMin) return minutes >= day.durationMin * SATISFY;
  return true; // an untargeted session is satisfied by showing up
}

/* -------------------------------------------------------------------------- */
/* Preparation                                                                 */
/* -------------------------------------------------------------------------- */

export interface PreparationBreakdown {
  percent: number;
  /** Shown on the goal so the number is never a mystery. */
  parts: { label: string; percent: number; detail: string }[];
}

/**
 * Preparation is derived, not declared. Three components:
 *   consistency  — sessions completed out of those prescribed so far
 *   capability   — biggest single-day ascent against what the objective demands
 *   time         — how far through the build you are
 */
export function computePreparation(
  goal: Goal,
  plan: TrainingPlan,
  completedByDate: Map<string, boolean>,
  feed: Activity[],
  mountain?: Mountain,
): PreparationBreakdown {
  if (goal.status === "completed") {
    return {
      percent: 100,
      parts: [{ label: "Completed", percent: 100, detail: "Objective achieved" }],
    };
  }

  // Only judge consistency over the window ICEFALL could actually observe.
  // Counting sessions from before there was any activity data would score the
  // athlete on a period nothing was measured.
  const firstSeen = feed.reduce<string | null>((min, a) => {
    const d = isoDate(new Date(a.startedAt));
    return min === null || d < min ? d : min;
  }, null);
  const todayKey = isoDate(new Date());

  let prescribed = 0;
  let done = 0;
  for (const w of plan.weeks) {
    if (w.index > plan.currentWeek) break;
    for (const d of w.days) {
      if (d.focus === "rest") continue;
      if (d.date > todayKey) continue;
      if (firstSeen && d.date < firstSeen) continue;
      prescribed++;
      if (completedByDate.get(d.date) ?? d.completed) done++;
    }
  }
  const consistency = prescribed ? done / prescribed : 0;

  // Consistency needs a sample before it means anything. Without this, a goal
  // set this morning scored 60% off three sessions and outranked an eight-month
  // build.
  const confidence = Math.min(1, prescribed / MIN_OBSERVED_SESSIONS);
  const consistencyScore = consistency * confidence;

  // Capability is limited by the weaker of two dimensions: can you climb the
  // vertical in a day, and have you been anywhere near the altitude. Judging
  // Everest on ascent alone rated it easier than Mont Blanc.
  const requiredAscent =
    mountain?.routes.reduce((m, r) => Math.max(m, r.elevationGainM), 0) ||
    (goal.elevationM ? goal.elevationM * 0.45 : 1000);
  const bestAscent = feed.reduce((m, a) => Math.max(m, a.elevationGainM), 0);
  const ascentReadiness = Math.min(1, requiredAscent ? bestAscent / requiredAscent : 0);

  const requiredAltitude = goal.elevationM ?? mountain?.elevationM ?? 0;
  const bestAltitude = feed.reduce(
    (m, a) =>
      Math.max(
        m,
        a.track.reduce((t, p) => Math.max(t, p.ele), 0),
      ),
    0,
  );
  const altitudeReadiness = requiredAltitude ? Math.min(1, bestAltitude / requiredAltitude) : 1;

  const capability = Math.min(ascentReadiness, altitudeReadiness);

  const time = Math.min(1, plan.currentWeek / plan.totalWeeks);

  const percent = Math.round(100 * (0.6 * consistencyScore + 0.25 * capability + 0.15 * time));

  return {
    percent: Math.max(0, Math.min(100, percent)),
    parts: [
      {
        label: "Consistency",
        percent: Math.round(consistencyScore * 100),
        detail:
          confidence < 1
            ? `${done} of ${prescribed} sessions — too few yet to judge`
            : `${done} of ${prescribed} prescribed sessions completed`,
      },
      {
        label: "Capability",
        percent: Math.round(capability * 100),
        detail:
          altitudeReadiness < ascentReadiness
            ? `Highest reached ${Math.round(bestAltitude).toLocaleString("en-GB")} m of ${Math.round(requiredAltitude).toLocaleString("en-GB")} m`
            : `Best single ascent ${Math.round(bestAscent).toLocaleString("en-GB")} m of ${Math.round(requiredAscent).toLocaleString("en-GB")} m needed`,
      },
      {
        label: "Time in the build",
        percent: Math.round(time * 100),
        detail: `Week ${plan.currentWeek} of ${plan.totalWeeks}`,
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

/** Activities grouped by local calendar date. */
function byDate(feed: Activity[]) {
  const m = new Map<string, Activity[]>();
  for (const a of feed) {
    const k = isoDate(new Date(a.startedAt));
    const list = m.get(k);
    if (list) list.push(a);
    else m.set(k, [a]);
  }
  return m;
}

export interface TrainingState {
  plan: TrainingPlan | null;
  goal?: Goal;
  mountain?: Mountain;
  /** Effective completion per date: manual override → activity → seeded history. */
  completedByDate: Map<string, boolean>;
  /** Dates where a recorded activity did the work. */
  satisfiedByActivity: Set<string>;
  preparation: PreparationBreakdown | null;
  today?: TrainingDay;
  currentWeek: TrainingWeek | null;
}

export function useTraining(goalOverride?: Goal): TrainingState {
  const { goals, isSessionComplete } = useApp();
  const feed = useActivityFeed();

  const goal = useMemo(
    () =>
      goalOverride ??
      goals
        .filter((g) => g.status === "active")
        .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0],
    [goalOverride, goals],
  );

  return useMemo(() => {
    if (!goal) {
      return {
        plan: null,
        completedByDate: new Map(),
        satisfiedByActivity: new Set(),
        preparation: null,
        currentWeek: null,
      };
    }

    const mountain = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
    const plan = buildPlanForGoal(goal, mountain);
    const activityDays = byDate(feed);

    const completedByDate = new Map<string, boolean>();
    const satisfiedByActivity = new Set<string>();

    for (const w of plan.weeks) {
      for (const d of w.days) {
        const acts = activityDays.get(d.date) ?? [];
        const auto = activitySatisfies(d, acts);
        if (auto) satisfiedByActivity.add(d.date);
        // A manual tick always wins; otherwise a real activity counts, and
        // failing both we fall back to the athlete's seeded history.
        completedByDate.set(d.date, isSessionComplete(w.index, d.date, auto || d.completed));
      }
    }

    const preparation = computePreparation(goal, plan, completedByDate, feed, mountain);
    const todayKey = isoDate(new Date());
    const today = plan.weeks.flatMap((w) => w.days).find((d) => d.date === todayKey);

    return {
      plan,
      goal,
      mountain,
      completedByDate,
      satisfiedByActivity,
      preparation,
      today,
      currentWeek: plan.weeks.find((w) => w.index === plan.currentWeek) ?? plan.weeks[0],
    };
  }, [goal, feed, isSessionComplete]);
}

/** Goals with derived preparation, for anywhere a goal is rendered. */
export function useGoalsWithProgress(): Goal[] {
  const { goals } = useApp();
  const feed = useActivityFeed();
  const { isSessionComplete } = useApp();

  return useMemo(
    () =>
      goals.map((goal) => {
        if (goal.status === "completed") return { ...goal, preparation: 100 };
        const mountain = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
        const plan = buildPlanForGoal(goal, mountain);
        const activityDays = byDate(feed);
        const completedByDate = new Map<string, boolean>();
        for (const w of plan.weeks) {
          for (const d of w.days) {
            const auto = activitySatisfies(d, activityDays.get(d.date) ?? []);
            completedByDate.set(d.date, isSessionComplete(w.index, d.date, auto || d.completed));
          }
        }
        return {
          ...goal,
          preparation: computePreparation(goal, plan, completedByDate, feed, mountain).percent,
        };
      }),
    [goals, feed, isSessionComplete],
  );
}

export function usePrimaryGoalWithProgress(): Goal | undefined {
  const goals = useGoalsWithProgress();
  return useMemo(
    () =>
      goals
        .filter((g) => g.status === "active")
        .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0],
    [goals],
  );
}
