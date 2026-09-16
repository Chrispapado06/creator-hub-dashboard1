/**
 * The pure half of `./trip.ts`: types and date arithmetic, no React and no app
 * state, so the boot decision and the tests can import it on their own. Screens
 * import everything from `@/mountain/trip`, which re-exports this file.
 */

import { mountainById } from "@/data/mock/mountains";
import type { Camp } from "@/data/mountainCamps";
import { activeTrip, daysBetween, todayISO, type Trip } from "@/trip/trip";

export interface MountainItineraryDay {
  /** Calendar date, YYYY-MM-DD, local. */
  date: string;
  /** 1-based, from the trip's start date. */
  dayNumber: number;
  label: string;
  /** Where the night is spent, from `data/mountainCamps.ts`. Null when not a recorded hut. */
  sleepAt: Camp | null;
  summitDay: boolean;
}

export interface MountainTrip {
  source: "trip" | "example";
  /** Key for per-trip stores (turnaround). Real trips: `Trip.id`. */
  id: string;
  name: string;
  /**
   * The curated mountain id (`data/mock/mountains.ts`), which keys
   * `rescueFor`, `campsFor`, `seasonFor`, `factsFor`. Real trips: resolved
   * from the trip's goal. Null when the trip has no curated mountain — the
   * SOS screen then shows 112 with its note, never a neighbour's numbers.
   */
  mountainId: string | null;
  peakName: string | null;
  peakElevationM: number | null;
  /** Summit coordinates from the curated mountain, when there is one. */
  summit: { lat: number; lon: number } | null;
  routeName: string | null;
  startDate: string;
  endDate: string;
  /** The athlete's stored record. Null for the example trip. */
  record: Trip | null;
  /** Null for every real trip: ICEFALL holds no itinerary (plan §9.3). */
  itinerary: MountainItineraryDay[] | null;
  /** A line that must be shown with this trip (the example notice), or null. */
  notice: string | null;
}

export type TripDay =
  | { kind: "before"; daysToGo: number }
  | { kind: "during"; dayNumber: number; totalDays: number }
  | { kind: "after"; daysSinceEnd: number };

/** Where `today` sits against the trip window. Never a negative or overflowing day number. */
export function tripDay(trip: { startDate: string; endDate: string }, today: string): TripDay {
  if (today < trip.startDate) return { kind: "before", daysToGo: daysBetween(today, trip.startDate) };
  if (today > trip.endDate) return { kind: "after", daysSinceEnd: daysBetween(trip.endDate, today) };
  return {
    kind: "during",
    dayNumber: daysBetween(trip.startDate, today) + 1,
    totalDays: daysBetween(trip.startDate, trip.endDate) + 1,
  };
}

/** Inside its dates today, and not closed. */
export function tripRunningToday(
  trip: { startDate: string; endDate: string; record?: Trip | null; endedAt?: string | null },
  today: string,
): boolean {
  const ended = "endedAt" in trip ? trip.endedAt : (trip.record?.endedAt ?? null);
  return !ended && tripDay(trip, today).kind === "during";
}

/** Synchronous, store-only: the athlete's own trip running today, or null. Used by the boot decision. */
export function realTripRunningToday(today: string = todayISO()): Trip | null {
  const t = activeTrip();
  return t && tripRunningToday(t, today) ? t : null;
}

/** Today's itinerary day, or null when the trip has no itinerary or today is outside it. */
export function itineraryDayFor(trip: MountainTrip | null, today: string): MountainItineraryDay | null {
  return trip?.itinerary?.find((d) => d.date === today) ?? null;
}

/** A stored trip as a MountainTrip, with its curated mountain resolved from the goal. */
export function fromRecord(record: Trip, goalMountainId: string | null): MountainTrip {
  const id = record.mountainId ?? goalMountainId;
  const mountain = id ? mountainById(id) : undefined;
  return {
    source: "trip",
    id: record.id,
    name: record.name,
    mountainId: mountain?.id ?? null,
    peakName: record.peakName ?? mountain?.name ?? null,
    peakElevationM: record.peakElevationM,
    summit: mountain ? { lat: mountain.coords.lat, lon: mountain.coords.lon } : null,
    routeName: null,
    startDate: record.startDate,
    endDate: record.endDate,
    record,
    itinerary: null,
    notice: null,
  };
}

