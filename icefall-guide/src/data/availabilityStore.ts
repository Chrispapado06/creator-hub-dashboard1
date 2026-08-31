/**
 * THE GUIDE'S OWN CALENDAR — edited here, stored on this device.
 *
 * WHY THIS PERSISTS RATHER THAN LIVING IN REACT STATE. A calendar the guide taps
 * that forgets everything on reload is a control that writes into nothing, which
 * is owner decision 14's exact failure: indistinguishable, to the person using
 * it, from one that works. Either it saves or it says it cannot. It saves.
 *
 * WHAT IT DOES NOT DO, and the screen says so in one line: publish. There is no
 * table in `icefall-supabase` for a guide's dated availability —
 * `guide_profiles.availability` is a single enum for the whole person and
 * `product_departures` belongs to a company — so this reaches nobody until that
 * lands. Filed to the backend owner. "Saved on your phone" and "athletes can see
 * it" are different claims and only the first one is true.
 *
 * A DAY WITH NO ENTRY IS "NOT SET", WHICH IS NOT "UNAVAILABLE". Clearing a day
 * DELETES the key rather than writing a default — the same rule the athlete
 * app's `setDayAvailability` follows, because "I have not said" and "I am busy"
 * are different statements and a guide who has said nothing has not turned work
 * down.
 *
 * BOOKED DAYS ARE NOT STORED HERE AND CANNOT BE EDITED. They are derived from
 * the bookings themselves, so the calendar cannot disagree with the trips, and a
 * guide cannot mark themselves free on a day a client has paid for.
 */

import { DAY_STATES, type DayState } from "./demo";
import { sampleAllowed } from "@/domain/sampleGate";
import { OFFLINE } from "@/offline/offline";

/**
 * AN OFFLINE DEMO GETS ITS OWN DRAWER. It runs on the same origin as the real
 * app, and a demo that overwrote a working guide's own calendar on their own
 * device would be sample data doing real damage. Unset, this is the string it
 * has always been. Same reasoning as `listingStore.ts`.
 */
const KEY = OFFLINE ? "icefall-guide:offline-demo:availability:v1" : "icefall-guide:availability:v1";

/** What the guide may set. `booked` is derived and deliberately absent. */
export type SettableState = Exclude<DayState, "booked">;

type Stored = Record<string, SettableState>;

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Stored;
  } catch {
    // A corrupt or unavailable store is an empty one, never a crash. The guide
    // loses their marks; they do not lose the app in a car park.
    return {};
  }
}

function write(v: Stored): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

/**
 * The seed is the STARTING POINT, not a floor.
 *
 * On a device that has never been used, the demo calendar is what the guide
 * sees. The moment they touch it, their own entries are what count — and a day
 * they CLEAR must not silently come back from the seed on the next reload, so
 * cleared days are recorded as tombstones rather than as absences.
 */
const TOMBSTONE = "__cleared__";
type StoredWithTombstones = Record<string, SettableState | typeof TOMBSTONE>;

export function loadStates(): Record<string, SettableState> {
  /* Same leak as the listing store: the stored calendar in this browser was
     seeded from the sample and belongs to it, so a signed-in account must not
     inherit it. Their real calendar arrives with the `guide_availability`
     migration. */
  if (!sampleAllowed()) return {};
  const own = read() as StoredWithTombstones;
  const merged: Record<string, SettableState> = {};
  for (const [day, s] of Object.entries(DAY_STATES)) {
    if (s !== "booked") merged[day] = s as SettableState;
  }
  for (const [day, s] of Object.entries(own)) {
    if (s === TOMBSTONE) delete merged[day];
    else merged[day] = s;
  }
  return merged;
}

export function setDay(day: string, state: SettableState): boolean {
  const own = read() as StoredWithTombstones;
  own[day] = state;
  return write(own as Stored);
}

/** Clearing is a DELETION, not a write of "unavailable". */
export function clearDay(day: string): boolean {
  const own = read() as StoredWithTombstones;
  own[day] = TOMBSTONE;
  return write(own as Stored);
}
