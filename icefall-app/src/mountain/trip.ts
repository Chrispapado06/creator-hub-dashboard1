/**
 * THE TRIP MOUNTAIN MODE IS ABOUT — one answer, used everywhere (plan §2.2).
 *
 * `trip/trip.ts` answers "is there an active trip" with a flag and no date
 * check, so it reports a trip that ended in June ("Trip · day 92"). Mountain
 * mode never reads that flag alone: every screen goes through `tripDay` and
 * `tripRunningToday` here, so no two screens can disagree about what day it is.
 *
 * Which trip, in order:
 *   1. the athlete's own active trip, when it is running today;
 *   2. the example trip, in review builds only (`exampleTrip.ts`);
 *   3. the athlete's own active trip on any other date (it starts later, or
 *      its dates have passed) — shown with that said, never as today;
 *   4. nothing.
 */

import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/state/AppState";
import { todayISO, useTrip } from "@/trip/trip";

import { buildExampleTrip } from "./exampleTrip";
import {
  fromRecord,
  itineraryDayFor,
  tripDay,
  tripRunningToday,
  type MountainItineraryDay,
  type MountainTrip,
  type TripDay,
} from "./tripModel";

export * from "./tripModel";

/** Today's local date, re-read every minute and on every return to the foreground. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const update = () => setToday(todayISO());
    const t = setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return today;
}

export interface UseMountainTrip {
  trip: MountainTrip | null;
  today: string;
  /** Null only when there is no trip. */
  day: TripDay | null;
  runningToday: boolean;
  itineraryDay: MountainItineraryDay | null;
}

export function useMountainTrip(): UseMountainTrip {
  const today = useToday();
  const { trip: record } = useTrip();
  const { goals } = useApp();

  const goalMountainId = record?.goalId
    ? (goals.find((g) => g.id === record.goalId)?.mountainId ?? null)
    : null;

  // Rebuilt when the date turns, so the example stays "today".
  const example = useMemo(() => (today ? buildExampleTrip() : null), [today]);

  const trip = useMemo<MountainTrip | null>(() => {
    const own = record ? fromRecord(record, goalMountainId) : null;
    if (own && tripRunningToday(own, today)) return own;
    if (example) return example;
    return own;
  }, [record, goalMountainId, example, today]);

  return {
    trip,
    today,
    day: trip ? tripDay(trip, today) : null,
    runningToday: trip ? tripRunningToday(trip, today) : false,
    itineraryDay: itineraryDayFor(trip, today),
  };
}
