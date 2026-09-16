/**
 * GOING IN — "Start today" from the full app (brief M3).
 *
 * Three doors lead into Mountain mode from the normal app: the objective's
 * command centre, Trip mode, and the activity start screen. They must not
 * each decide for themselves what "start today" means, so the decision is one
 * pure function here and the screens draw its answer.
 *
 * TWO THINGS IT WILL NOT DO, both for the same reason — an athlete's own trip
 * record is the thing the acclimatisation schedule and the SOS numbers are
 * built from, so this file never quietly rewrites it:
 *
 *   · it never repoints a trip that is already running at a different
 *     objective — it says which trip is running and opens that one;
 *   · it never shortens a trip window. A trip whose dates have passed gets a
 *     NEW trip; the old one stays in the list with its nights and its checks.
 *
 * Entering Mountain mode itself is instant and needs nothing: the pack
 * download is started afterwards, on a separate turn, and a failure there
 * cannot stop anybody getting to the Now screen or to SOS.
 */

import {
  isCalendarDate,
  setTripDates,
  startTrip,
  type Trip,
} from "@/trip/trip";

import { enterMountainMode } from "./mode";
import { tripDay } from "./tripModel";
import { localDayOf } from "@/objectives/primaryGoal";

/* -------------------------------------------------------------------------- */
/* The decision                                                               */
/* -------------------------------------------------------------------------- */

export type StartAction =
  /** A trip is already running today. Nothing is written. */
  | "enter"
  /** No usable trip: write a new one, starting today. */
  | "create"
  /** A trip starts later: move its start date to today, keeping its end. */
  | "bring-forward";

export interface StartGoal {
  id: string;
  name: string;
  /** May be a full ISO timestamp; only the calendar part is used. */
  targetDate?: string | null;
  elevationM?: number | null;
  mountainId?: string | null;
}

export interface StartInput {
  today: string;
  /** The athlete's own active trip record, or null. */
  trip: Pick<Trip, "id" | "name" | "goalId" | "startDate" | "endDate" | "endedAt"> | null;
  goal: StartGoal | null;
}

export interface StartPlan {
  action: StartAction;
  /** Button text. Short enough to read in a wind. */
  label: string;
  /** One line under it, saying exactly what the tap will do. */
  detail: string;
  /** The window the trip will have afterwards. For "enter", the one it has. */
  startDate: string;
  endDate: string;
  /** The trip being opened or moved. Null when one will be created. */
  tripId: string | null;
}

/** "14 Oct". A bare date, because the rest of the sentence carries the meaning. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The calendar part of a goal's target date, or null when there isn't one. */
export function goalDate(goal: StartGoal | null): string | null {
  const raw = goal?.targetDate;
  if (typeof raw !== "string") return null;
  /* The LOCAL day, as `objectives/primaryGoal.ts` and Home read it. Slicing the
     instant gave the UTC day — a day early for anyone east of about UTC+6. */
  if (isCalendarDate(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = localDayOf(raw);
  return isCalendarDate(date) ? date : null;
}

/**
 * What "Start today" does on this screen, right now.
 *
 * Pure: every screen passes what it already holds and draws the answer.
 */
export function planStartToday(input: StartInput): StartPlan {
  const { today, goal } = input;
  const trip = input.trip && !input.trip.endedAt ? input.trip : null;
  const where = trip ? tripDay(trip, today) : null;

  if (trip && where?.kind === "during") {
    const mine = !goal || !trip.goalId || trip.goalId === goal.id;
    return {
      action: "enter",
      label: "Open Mountain mode",
      detail: mine
        ? `Day ${where.dayNumber} of ${trip.name}. Big text, SOS, and everything on it works with no signal.`
        : `${trip.name} is already running — day ${where.dayNumber}. Mountain mode opens that trip, not this objective.`,
      startDate: trip.startDate,
      endDate: trip.endDate,
      tripId: trip.id,
    };
  }

  if (trip && where?.kind === "before") {
    return {
      action: "bring-forward",
      label: "Start today",
      detail: `Moves ${trip.name} to start today. It still ends ${dayLabel(trip.endDate)}, and nothing you have recorded is changed.`,
      startDate: today,
      endDate: trip.endDate,
      tripId: trip.id,
    };
  }

  /* Create. Either there is no trip, or the one there is has run out of dates
     — and a finished trip is a record, not something to overwrite. */
  const target = goalDate(goal);
  const endDate = target && target > today ? target : today;
  const ended = trip && where?.kind === "after";

  return {
    action: "create",
    label: "Start today",
    detail: ended
      ? `${trip.name} ended ${dayLabel(trip.endDate)}. This starts a new trip from today, and keeps that one.`
      : endDate === today
        ? "Starts a trip today. You can set the end date in Trip mode. Kept on this phone."
        : `Today to ${dayLabel(endDate)}, from your ${goal?.name ?? "objective"} date. Kept on this phone.`,
    startDate: today,
    endDate,
    tripId: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Doing it                                                                   */
/* -------------------------------------------------------------------------- */

export type StartResult =
  | { ok: true; tripId: string | null }
  /** The trip could not be written. Mountain mode is NOT entered on a lie. */
  | { ok: false; error: string };

/**
 * Carry out a plan: write the trip if the plan says to, then enter Mountain
 * mode. The caller navigates to `MOUNTAIN_PATHS.now` on `ok`.
 *
 * `goalMountainId` is the curated mountain behind the objective, which is what
 * keys the rescue numbers, the camps and the season — copied into the trip at
 * creation so editing the goal later cannot move them under somebody.
 */
export function startMountainTrip(
  plan: StartPlan,
  deps: { goal?: StartGoal | null; goalMountainId?: string | null } = {},
): StartResult {
  const goal = deps.goal ?? null;
  const mountainId = deps.goalMountainId ?? goal?.mountainId ?? null;

  if (plan.action === "create") {
    const made = startTrip({
      name: goal?.name ?? "Trip",
      goalId: goal?.id ?? null,
      peakName: goal?.name ?? null,
      peakElevationM: typeof goal?.elevationM === "number" ? goal.elevationM : null,
      mountainId,
      startDate: plan.startDate,
      endDate: plan.endDate,
    });
    if ("error" in made) return { ok: false, error: made.error };
    enterMountainMode();
    startTripPackDownload(made.id, plan.startDate, mountainId);
    return { ok: true, tripId: made.id };
  }

  if (plan.action === "bring-forward" && plan.tripId) {
    const problem = setTripDates(plan.tripId, plan.startDate, plan.endDate);
    if (problem) return { ok: false, error: problem };
  }

  enterMountainMode();
  if (plan.tripId) startTripPackDownload(plan.tripId, plan.startDate, mountainId);
  return { ok: true, tripId: plan.tripId };
}

/** Enter Mountain mode for a hike that is not a trip. Writes nothing. */
export function startHikeInMountainMode(): void {
  enterMountainMode();
}

/* -------------------------------------------------------------------------- */
/* The trip pack                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Save what can be saved for this trip, in the background.
 *
 * Loaded on demand so that nothing on the tap path waits for it, and wrapped
 * whole: a phone with no database, no signal or no room still gets into
 * Mountain mode. What actually got saved is reported on the Trip tab, which
 * reads the same pack — this never claims anything on its own.
 */
export function startTripPackDownload(
  tripId: string,
  today: string,
  goalMountainId: string | null = null,
): void {
  void (async () => {
    try {
      const [{ refreshTripPack, subjectFromTrip }, { fromRecord }, { activeTrip }, reach] =
        await Promise.all([
          import("./tripPack"),
          import("./tripModel"),
          import("@/trip/trip"),
          import("@/connection/reachability"),
        ]);
      const record = activeTrip();
      if (!record || record.id !== tripId) return;
      const subject = subjectFromTrip(fromRecord(record, goalMountainId), { today });
      if (!subject) return;
      await refreshTripPack(subject, {
        confirmedOnline: reach.getReachability().state === "reachable",
      });
    } catch {
      /* A download that could not run changes nothing the athlete was told. */
    }
  })();
}
