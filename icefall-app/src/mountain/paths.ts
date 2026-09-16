/**
 * Mountain mode's route paths. Declared OUTSIDE the main AppShell in
 * `App.tsx`, so no screen here waits on the login check (plan §2.1, §2.8).
 *
 * `/mountain/:goalId` (the objective command centre) lives inside AppShell and
 * shares the prefix; the router ranks these static segments above that
 * parameter, and `isMountainModePath` names the exact set.
 */
export const MOUNTAIN_PATHS = {
  /** Decides: a trip running today opens Now; otherwise "nothing is running". */
  root: "/mountain",
  now: "/mountain/now",
  map: "/mountain/map",
  body: "/mountain/body",
  trip: "/mountain/trip",
  sos: "/mountain/sos",
  /** Asked offline first, from stored answers and rules; AI questions queue. */
  coach: "/mountain/coach",
  /** Battery saver, screen theme, large text — this phone's, not the account's. */
  settings: "/mountain/settings",
  /** "Back down / End trip": stop recording, sync, close the trip, debrief. */
  end: "/mountain/end",
  /** Retrace lives under the Map tab, which routes it itself. */
  retrace: "/mountain/map/retrace",
  /** The day-by-day plan, a sub-screen of its own since the mockup's Trip tab
      is seven rows and a button (mockup spec §8). */
  tripItinerary: "/mountain/trip/itinerary",
  tripDocuments: "/mountain/trip/documents",
  tripGear: "/mountain/trip/gear",
  tripContacts: "/mountain/trip/contacts",
  tripPhrasebook: "/mountain/trip/phrasebook",
  tripJournal: "/mountain/trip/journal",
} as const;

const SEGMENTS = new Set(["now", "map", "body", "trip", "sos", "coach", "settings", "end"]);

/** True for `/mountain` and anything under its five tabs/screens. */
export function isMountainModePath(pathname: string): boolean {
  if (pathname === "/mountain" || pathname === "/mountain/") return true;
  const m = /^\/mountain\/([^/]+)/.exec(pathname);
  return !!m && SEGMENTS.has(m[1]);
}

/** The live tracker, where the SOS button and the alarm are also mounted. */
export function isLiveTrackerPath(pathname: string): boolean {
  return /^\/activity\/live\/[^/]+/.test(pathname);
}
