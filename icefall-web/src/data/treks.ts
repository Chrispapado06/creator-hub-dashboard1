import { COMPANIES, type Company } from "./companies";
import { TREK_RECORDS } from "./trekRecords";
import { TREK_REGIONS, type Trek, type TrekDifficulty } from "./trekTypes";

/**
 * The trek catalogue and its relations.
 *
 * `TREK_RECORDS` is pure data — a generated array, one object per route — and
 * everything relational is computed here rather than duplicated into it. That
 * is the whole scalability requirement: adding a trek is adding one object to
 * that file, and its mountain, region, operator and search relations all follow
 * without another edit.
 *
 * UNLIKE the guides, companies and social feed, TREKS ARE NOT DEMO-GATED. They
 * are real routes with published facts — the Everest Base Camp Trek exists
 * whether or not ICEFALL has a partner running it — so they ship. What IS gated
 * is the operator relation below, because which company runs a route is a
 * commercial claim and ours are invented.
 */

export const TREKS: Trek[] = TREK_RECORDS;

export const trekById = (id: string): Trek | undefined => TREKS.find((t) => t.id === id);

export const treksInRegion = (regionId: string): Trek[] =>
  TREKS.filter((t) => t.regionId === regionId);

/** Every trek that goes to, around or over this peak. */
export const treksForMountain = (peakId: string): Trek[] =>
  TREKS.filter((t) => t.mountainIds.includes(peakId));

/** Regions that actually have routes, for the index page's filter. */
export const populatedRegions = () =>
  TREK_REGIONS.map((r) => ({ region: r, count: treksInRegion(r.id).length })).filter(
    (x) => x.count > 0,
  );

/**
 * Which invented companies run a route.
 *
 * ASSIGNED BY WHERE THEY WORK, and only for the invented three. Elite Exped is
 * a REAL business and is excluded: attaching it to trekking routes it has not
 * told us it runs would be inventing a commercial offering in its name, which
 * is the thing `realBusiness` exists to prevent.
 */
const OPERATOR_REGIONS: Record<string, string[]> = {
  "solukhumbu-expeditions": ["khumbu", "annapurna", "langtang", "nepal-remote", "bhutan"],
  "cordillera-ascents": ["cusco", "cordillera", "patagonia", "andes-north"],
  "chamonix-alpine-guides": ["alps", "dolomites", "iberia", "iceland", "uk-ireland", "atlas"],
};

export function operatorsForTrek(trekId: string): Company[] {
  const trek = trekById(trekId);
  if (!trek) return [];
  return COMPANIES.filter(
    (c) => !c.realBusiness && (OPERATOR_REGIONS[c.id] ?? []).includes(trek.regionId),
  );
}

export function treksForOperator(companyId: string): Trek[] {
  const regions = OPERATOR_REGIONS[companyId] ?? [];
  return TREKS.filter((t) => regions.includes(t.regionId));
}

export interface TrekFilters {
  q?: string;
  regionId?: string;
  difficulty?: TrekDifficulty | "";
  /** "Up to a week" | "One to two weeks" | "Over two weeks" */
  duration?: string;
}

export const DURATION_BANDS = ["Up to a week", "One to two weeks", "Over two weeks"] as const;

function inDurationBand(t: Trek, band: string): boolean {
  if (!band) return true;
  if (!t.durationDays) return false;
  const days = t.durationDays[1];
  if (band === "Up to a week") return days <= 7;
  if (band === "One to two weeks") return days > 7 && days <= 14;
  return days > 14;
}

export function filterTreks(f: TrekFilters): Trek[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return TREKS.filter(
    (t) =>
      (!q ||
        `${t.name} ${t.country} ${t.style} ${t.summary}`.toLowerCase().includes(q)) &&
      (!f.regionId || t.regionId === f.regionId) &&
      (!f.difficulty || t.difficulty === f.difficulty) &&
      inDurationBand(t, f.duration ?? ""),
  );
}
