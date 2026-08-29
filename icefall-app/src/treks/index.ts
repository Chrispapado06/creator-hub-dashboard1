import { MOUNTAINS } from "@/data/mock/mountains";
import { TREK_RECORDS } from "./records";
import {
  TREK_DIFFICULTY_ORDER,
  TREK_REGIONS,
  type Trek,
  type TrekDifficulty,
  type TrekRegion,
  type TrekStyle,
} from "./model";

/**
 * TREKS IN THE PHONE APP.
 *
 * The catalogue itself — 252 routes across 22 regions — is the same data the
 * web app carries, copied rather than re-authored: durations, high points and
 * seasons are published facts about real routes and there is only one right
 * answer for each. `records.ts` and `credits.ts` are generated files and are
 * regenerated on the web side, then copied here. Do not hand-edit either.
 *
 * WHAT IS NOT COPIED IS THE UI. The web app's trek screens are built for a
 * three-column desktop grid with a filter rail; this app is a phone, and its
 * screens are written in its own idiom against `Screen`, `Rise` and `Card`.
 * Porting the components rather than the data would have dragged a layout
 * nobody can use on a 390 px screen into an app that already knows how to
 * present a list.
 *
 * ── THE MOUNTAIN LINK IS NARROWER HERE, DELIBERATELY ────────────────────────
 * The web app holds 52 peaks; this app holds 10 curated objectives with real
 * route descriptions. A trek's `mountainIds` therefore resolves against far
 * fewer mountains, and most resolve to none — which is the same rule the data
 * already states: the association exists only where a human made it, and a
 * trek with no mountain in this catalogue reaches you through its region, the
 * index and search instead. It is NOT padded out by matching on country.
 */

export type { Trek, TrekDifficulty, TrekRegion, TrekStyle };
export { TREK_DIFFICULTY_ORDER, TREK_REGIONS };
export { trekDuration, trekAltitude, trekRegion, trekSlug } from "./model";

export const TREKS: readonly Trek[] = TREK_RECORDS;

const BY_ID = new Map(TREKS.map((t) => [t.id, t]));
export const trekById = (id: string): Trek | undefined => BY_ID.get(id);

/** The ids this app actually has a mountain page for. */
const LOCAL_PEAKS = new Set(MOUNTAINS.map((m) => m.id));

/**
 * The mountains a trek visits THAT THIS APP HOLDS.
 *
 * Returns ids, not names, so the caller links to a page that exists. A trek to
 * Kangchenjunga returns nothing here and that is correct — this app has no
 * Kangchenjunga page to send anyone to.
 */
export const peaksForTrek = (t: Trek): string[] =>
  t.mountainIds.filter((id) => LOCAL_PEAKS.has(id));

/** Treks that visit a given mountain, longest-established first by name. */
export const treksForMountain = (mountainId: string): Trek[] =>
  TREKS.filter((t) => t.mountainIds.includes(mountainId));

export const treksInRegion = (regionId: string): Trek[] =>
  TREKS.filter((t) => t.regionId === regionId);

/** Regions that actually contain something, with their counts. */
export const REGIONS_WITH_COUNTS: readonly (TrekRegion & { count: number })[] =
  TREK_REGIONS.map((r) => ({ ...r, count: treksInRegion(r.id).length })).filter((r) => r.count > 0);

/** Length buckets, phrased the way a walker thinks about a trip. */
export const LENGTH_BANDS = [
  { id: "short", label: "Up to a week", test: (d: number) => d <= 7 },
  { id: "medium", label: "One to two weeks", test: (d: number) => d > 7 && d <= 14 },
  { id: "long", label: "Over two weeks", test: (d: number) => d > 14 },
] as const;

export type LengthBandId = (typeof LENGTH_BANDS)[number]["id"];

export interface TrekFilter {
  query?: string;
  regionId?: string | null;
  difficulty?: TrekDifficulty | null;
  length?: LengthBandId | null;
}

/**
 * Filtering.
 *
 * A trek with no published duration is NOT dropped by a length filter that it
 * cannot be tested against — it is dropped, because the reader asked for walks
 * of a certain length and "unknown" is not an answer to that. The count on
 * screen says how many of the whole catalogue survived, so the omission is
 * visible rather than silent.
 */
export function filterTreks(all: readonly Trek[], f: TrekFilter): Trek[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return all.filter((t) => {
    if (f.regionId && t.regionId !== f.regionId) return false;
    if (f.difficulty && t.difficulty !== f.difficulty) return false;
    if (f.length) {
      const band = LENGTH_BANDS.find((b) => b.id === f.length);
      if (!band) return false;
      if (!t.durationDays) return false;
      // Tested on the shorter end: an 8–14 day route is a one-to-two week walk.
      if (!band.test(t.durationDays[0])) return false;
    }
    if (q && !`${t.name} ${t.country} ${t.style} ${t.summary}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
