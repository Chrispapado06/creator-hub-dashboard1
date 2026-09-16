/**
 * THE EXAMPLE TRIP — Mont Blanc by the Goûter route, "running today".
 *
 * Review builds only (dev, VITE_SHOW_DEMO=1, VITE_ICEFALL_OFFLINE=1,
 * VITE_ICEFALL_FORCE_MOUNTAIN=1), so the Now screen has something real to show.
 * It is never written into the athlete's trip store.
 *
 * NOTHING IN IT IS INVENTED. The mountain, its summit coordinates, the route
 * name and its "2 days" come from `data/mock/mountains.ts`; the hut and its
 * height from `data/mountainCamps.ts` (OpenStreetMap). The only authored thing
 * is which of those two days is today, and the notice says it is an example.
 * No turnaround time is set: unset is the honest default (plan §3.2).
 */

import { mountainById } from "@/data/mock/mountains";
import { campsFor } from "@/data/mountainCamps";
import { addDays, todayISO } from "@/trip/trip";

import type { MountainItineraryDay, MountainTrip } from "./tripModel";

export const EXAMPLE_TRIP_ID = "example:mont-blanc-gouter";

export const EXAMPLE_TRIP_NOTICE = "Example trip for review. Not a real booking and not a guide's plan.";

/**
 * Guarded BUILDER, and the `import.meta.env` reads are spelled out inline on
 * purpose — see "HOW TO USE IT, AND THE TRAP" in `lib/demoFlag.ts`.
 * Routing them through a shared constant stops the bundler proving the branch
 * dead, and the example would ship in production. Do not tidy this.
 */
export function buildExampleTrip(now: Date = new Date()): MountainTrip | null {
  if (
    !import.meta.env.DEV &&
    import.meta.env.VITE_SHOW_DEMO !== "1" &&
    import.meta.env.VITE_ICEFALL_OFFLINE !== "1" &&
    import.meta.env.VITE_ICEFALL_FORCE_MOUNTAIN !== "1"
  ) {
    return null;
  }

  const mountain = mountainById("mont-blanc");
  const route = mountain?.routes.find((r) => r.name === "Goûter Route");
  if (!mountain || !route) return null;

  const hut = campsFor("mont-blanc")?.camps.find((c) => c.name === "Refuge du Goûter") ?? null;

  // Today is the second of the route's two days: the summit day.
  const today = todayISO(now);
  const startDate = addDays(today, -1);

  const itinerary: MountainItineraryDay[] = [
    {
      date: startDate,
      dayNumber: 1,
      label: hut ? `Up to ${hut.name}` : "Up to the hut",
      sleepAt: hut,
      summitDay: false,
    },
    {
      date: today,
      dayNumber: 2,
      label: `Summit of ${mountain.name}, then down`,
      sleepAt: null,
      summitDay: true,
    },
  ];

  return {
    source: "example",
    id: EXAMPLE_TRIP_ID,
    name: `${mountain.name} · ${route.name}`,
    mountainId: mountain.id,
    peakName: mountain.name,
    peakElevationM: mountain.elevationM,
    summit: { lat: mountain.coords.lat, lon: mountain.coords.lon },
    routeName: route.name,
    startDate,
    endDate: today,
    record: null,
    itinerary,
    notice: EXAMPLE_TRIP_NOTICE,
  };
}
