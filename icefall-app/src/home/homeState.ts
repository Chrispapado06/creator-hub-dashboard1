/**
 * Which of the eight Home layouts an athlete is in.
 *
 * The owner's mockup boards (2026-09-16) draw Home in eight states. This file
 * decides between them from real records only, and is pure so the decision can
 * be tested without a browser. Order matters and is the order below: a running
 * trip outranks everything, then a trip just finished, then the objective.
 */

import {
  pickPrimaryGoal,
  RECENT_OBJECTIVE_DAYS,
  TRIP_PREP_WINDOW_DAYS,
} from "@/objectives/primaryGoal";

export type HomeStateId =
  | "default"
  | "done"
  | "rest"
  | "no-objective"
  | "two-weeks"
  | "on-trip"
  | "just-back"
  | "new";

export const HOME_STATE_IDS: readonly HomeStateId[] = [
  "default",
  "done",
  "rest",
  "no-objective",
  "two-weeks",
  "on-trip",
  "just-back",
  "new",
];

/** Days before the objective date at which Home switches to trip prep. */
export const TRIP_PREP_DAYS = TRIP_PREP_WINDOW_DAYS;

/** Days after a trip ends that Home keeps the "just back" layout. */
export const JUST_BACK_DAYS = RECENT_OBJECTIVE_DAYS;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A local calendar day (YYYY-MM-DD) from either a day key or an ISO instant. */
export function localDay(value: string): string {
  if (DAY.test(value)) return value;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole calendar days from `from` to `to`, both day keys. Negative when `to` is earlier. */
export function dayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * What ICEFALL actually knows about the return. Only the athlete's own debrief
 * can say "summited" or "turned around"; a trip they closed after it began says
 * they went; a date that simply passed says nothing about whether they did.
 */
export type ReturnKind = "summited" | "turned-around" | "travelled" | "date-passed";

export interface JustBack {
  goalId: string;
  name: string;
  /** The day the trip ended, or the objective date when nothing else is held. */
  endedOn: string;
  kind: ReturnKind;
  /** True once the athlete has filed the debrief for this objective. */
  debriefed: boolean;
  /** The goal is marked completed (only the debrief does that). */
  completed: boolean;
}

export interface JustBackInput {
  today: string;
  trips: readonly {
    goalId: string | null;
    peakName: string | null;
    name: string;
    startDate: string;
    endDate: string;
    endedAt: string | null;
    /** When the record was made — tells a correction apart from an abandoned trip. */
    createdAt: string;
  }[];
  goals: readonly {
    id: string;
    name: string;
    status: string;
    targetDate: string;
    completedAt?: string;
  }[];
  debriefs: readonly { goalId: string; endedOn: string; outcome: string }[];
}

/**
 * The objective the athlete has just come back from, if any.
 *
 * Signals, newest wins, each held for `JUST_BACK_DAYS`:
 *   - a trip record whose dates are over (closed after it began = travelled;
 *     a trip closed BEFORE it began never happened and is ignored);
 *   - a goal the debrief marked completed;
 *   - an objective date that passed with no trip covering it.
 *
 * Home moves on when the objective no longer exists, when the debrief says the
 * trip did not happen, or once the debrief is filed and another objective is
 * active.
 */
export function findJustBack(input: JustBackInput): JustBack | null {
  const { today, trips, goals, debriefs } = input;
  const goalIds = new Set(goals.map((g) => g.id));
  const candidates: { goalId: string; name: string; endedOn: string; travelled: boolean }[] = [];

  /* A trip that never happened: closed before its first day — or made AND closed
     on its first day while its objective's date is still ahead, which is what
     fixing a mistyped date looks like (the trip form's start defaults to today).
     A trip planned ahead and abandoned on day one still happened, and a one-day
     trip on the objective's own date still counts. */
  const targetOf = (goalId: string | null) => {
    const g = goals.find((x) => x.id === goalId);
    return g ? localDay(g.targetDate) : null;
  };
  const closedBeforeStart = (t: JustBackInput["trips"][number]) => {
    if (t.endedAt === null) return false;
    const closed = localDay(t.endedAt);
    if (closed < t.startDate) return true;
    const target = targetOf(t.goalId);
    return (
      closed === t.startDate &&
      localDay(t.createdAt) === t.startDate &&
      target !== null &&
      target > closed
    );
  };

  for (const t of trips) {
    if (!t.goalId || !goalIds.has(t.goalId) || closedBeforeStart(t)) continue;
    /* A trip that ends before its objective's date, while that date is still
       ahead, is a practice or warm-up trip — not the return from the objective.
       It becomes eligible once the objective's date has passed, after the same
       day of grace the date itself gets (or at once, if they debriefed). */
    const target = targetOf(t.goalId);
    const debriefed = debriefs.some((d) => d.goalId === t.goalId);
    if (
      target !== null &&
      t.endDate < target &&
      (target >= today || (dayDiff(target, today) < 2 && !debriefed))
    ) {
      continue;
    }
    const name = t.peakName ?? t.name;
    if (t.endedAt) {
      const closed = localDay(t.endedAt);
      candidates.push({
        goalId: t.goalId,
        name,
        endedOn: closed < t.endDate ? closed : t.endDate,
        travelled: true,
      });
    } else if (t.endDate < today) {
      candidates.push({ goalId: t.goalId, name, endedOn: t.endDate, travelled: false });
    }
  }
  for (const g of goals) {
    if (g.status === "completed" && g.completedAt) {
      candidates.push({ goalId: g.id, name: g.name, endedOn: localDay(g.completedAt), travelled: false });
    } else if (g.status === "active") {
      const target = localDay(g.targetDate);
      // A trip for this objective that runs to (or past) its date is the better signal.
      const covered = trips.some(
        (t) => t.goalId === g.id && !closedBeforeStart(t) && t.endDate >= target,
      );
      /* The same day of grace as the objective rule: the day after a date that
         merely passed is not yet a return (it may still be the summit day for
         an athlete west of where the date was set) — unless they debriefed. */
      const passedLongEnough =
        dayDiff(target, today) >= 2 || debriefs.some((d) => d.goalId === g.id);
      if (target < today && !covered && passedLongEnough) {
        candidates.push({ goalId: g.id, name: g.name, endedOn: target, travelled: false });
      }
    }
  }

  const recent = candidates
    .filter((c) => {
      const since = dayDiff(c.endedOn, today);
      return since >= 0 && since <= JUST_BACK_DAYS;
    })
    .sort((a, b) => (a.endedOn < b.endedOn ? 1 : a.endedOn > b.endedOn ? -1 : 0));

  for (const first of recent) {
    /* One objective can have several candidates (its trip and its date). Kind
       is decided per objective: a trip the athlete actually closed after it
       began outranks a date that merely passed. */
    const c = recent.find((x) => x.goalId === first.goalId && x.travelled) ?? first;
    const debrief = debriefs.find((d) => d.goalId === c.goalId);
    if (debrief?.outcome === "did-not-travel") continue;
    const goal = goals.find((g) => g.id === c.goalId);
    const movedOn =
      debrief !== undefined &&
      goals.some((g) => g.id !== c.goalId && g.status === "active" && localDay(g.targetDate) >= today);
    if (movedOn) continue;
    const kind: ReturnKind =
      debrief?.outcome === "summited"
        ? "summited"
        : debrief?.outcome === "turned-around"
          ? "turned-around"
          : c.travelled
            ? "travelled"
            : "date-passed";
    return {
      goalId: c.goalId,
      name: goal?.name ?? c.name,
      endedOn: debrief?.endedOn ?? c.endedOn,
      kind,
      debriefed: debrief !== undefined,
      completed: goal?.status === "completed",
    };
  }
  return null;
}

/**
 * The objective Home is about — the app-wide rule in `objectives/primaryGoal.ts`
 * (upcoming first, a passed date only when nothing is upcoming), taking a day
 * key so it can be tested.
 */
export function pickHomeGoal<G extends { id: string; status: string; targetDate: string }>(
  goals: readonly G[],
  today: string,
  debriefedGoalIds?: ReadonlySet<string>,
): G | undefined {
  const [y, m, d] = today.split("-").map(Number);
  return pickPrimaryGoal(goals, new Date(y, m - 1, d, 12), debriefedGoalIds);
}

export interface HomeStateInput {
  today: string;
  /** The primary active objective's date as a day key, or null with none. */
  goalTargetDay: string | null;
  runningTrip: boolean;
  /** What is known about a recent return, or null when there is none. */
  justBack: ReturnKind | null;
  /** Today's planned day, when the plan has one. */
  todaySession: { rest: boolean; done: boolean } | null;
  /** Anything recorded on this device: goals, activities, trips, a readiness test. */
  hasHistory: boolean;
}

export function detectHomeState(i: HomeStateInput): HomeStateId {
  if (i.runningTrip) return "on-trip";
  const days = i.goalTargetDay === null ? null : dayDiff(i.today, i.goalTargetDay);
  const prepDue = days !== null && days >= 0 && days <= TRIP_PREP_DAYS;
  /* A date that merely passed says nothing about a trip, so it does not hide the
     NEXT objective's trip prep; a real return (a trip or a debrief) does. */
  if (i.justBack !== null && !(i.justBack === "date-passed" && prepDue)) return "just-back";
  if (i.goalTargetDay === null) return i.hasHistory ? "no-objective" : "new";
  if (prepDue) return "two-weeks";
  if (i.todaySession?.rest) return "rest";
  if (i.todaySession?.done) return "done";
  return "default";
}
