import type { GuideRequestCriteria } from "@/guides/matching";
import type { Availability, Guide, Speciality } from "@/guides/types";
import type { ExperienceLevel } from "@/network/types";
import type { SearchObjective } from "./useSearchObjective";

/**
 * The directory's filters.
 *
 * Two kinds of control live here and the difference matters:
 *
 *   NARROWING     mountain, country, speciality, language, rate and "taking
 *                 work" remove guides from the list. Each one is shown as a
 *                 removable chip, because a filter that excludes people
 *                 invisibly is indistinguishable from a marketplace with nobody
 *                 in it.
 *   DESCRIBING    dates, party size and experience change what the comparison
 *                 is made against rather than who is in it. ICEFALL holds no
 *                 diary for any guide — `Availability` is a standing status,
 *                 not a calendar — so a date range CANNOT honestly exclude
 *                 anybody, and saying it could would have someone book flights
 *                 around a flag. Party size feeds the matcher's ratio factor,
 *                 which compares the party against ICEFALL's own guidance for
 *                 the ground and never against a ratio the guide has given,
 *                 because no guide has given one. Experience likewise adjusts
 *                 the depth the matcher expects; it never decides who is
 *                 allowed to take you.
 *
 * Rate is deliberately narrowing but forgiving: every guide in this model
 * publishes a day rate, so there is no unknown to protect, and a rate above the
 * ceiling still surfaces through the matcher's own budget factor when the
 * athlete has not set one.
 *
 * Years guiding narrows on the same terms. It is a figure the guide records and
 * nobody has checked — invented outright on a demo guide — so every surface
 * that offers it as a control has to say so rather than let a slider imply the
 * number was audited.
 */

export interface GuideFilters {
  /** Mountain name, or "" for any. */
  mountain: string;
  /** ISO dates the athlete is asking about, or "" when unset. */
  fromIso: string;
  toIso: string;
  /** How many are climbing, or null when the athlete has not said. */
  groupSize: number | null;
  /** Country the guide works from, or "" for anywhere. */
  country: string;
  specialities: Speciality[];
  languages: string[];
  /**
   * The day-rate window, EUR. Null on either end means the athlete has not
   * moved that handle, so nothing is excluded from it and the matcher is told
   * nothing about a budget it would otherwise score against.
   */
  minDailyRateEur: number | null;
  maxDailyRateEur: number | null;
  /** The years-guiding window. Null ends mean the same as above. */
  minYearsGuiding: number | null;
  maxYearsGuiding: number | null;
  /**
   * The standing the comparison is made against. Defaults to what the athlete
   * told ICEFALL at onboarding, and changing it never hides a guide.
   */
  experience: ExperienceLevel | null;
  /** Drops guides whose standing status says they are not taking work. */
  takingWorkOnly: boolean;
}

export const EXPERIENCE_IDS: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "expert"];

/** The largest party the group-size control offers. Beyond it, ask two guides. */
export const MAX_GROUP_SIZE = 12;

export function defaultGuideFilters(objective?: { peakName?: string }): GuideFilters {
  return {
    // Pre-set from the mountain the athlete arrived with — that is the whole
    // point of arriving from a mountain page. Everything else starts open: a
    // filter nobody chose should not be quietly excluding people.
    mountain: objective?.peakName ?? "",
    fromIso: "",
    toIso: "",
    groupSize: null,
    country: "",
    specialities: [],
    languages: [],
    minDailyRateEur: null,
    maxDailyRateEur: null,
    minYearsGuiding: null,
    maxYearsGuiding: null,
    experience: null,
    takingWorkOnly: false,
  };
}

/** How many choices the athlete has actually made. Drives the filter count. */
export function activeFilterCount(f: GuideFilters): number {
  let n = 0;
  if (f.mountain) n++;
  if (f.fromIso || f.toIso) n++;
  if (f.groupSize !== null) n++;
  if (f.country) n++;
  if (f.specialities.length > 0) n++;
  if (f.languages.length > 0) n++;
  // A window counts once however many of its two handles have been moved.
  if (f.minDailyRateEur !== null || f.maxDailyRateEur !== null) n++;
  if (f.minYearsGuiding !== null || f.maxYearsGuiding !== null) n++;
  if (f.experience !== null) n++;
  if (f.takingWorkOnly) n++;
  return n;
}

/* -------------------------------------------------------------------------- */
/* Reading a guide                                                             */
/* -------------------------------------------------------------------------- */

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The country a guide works from.
 *
 * `basedIn` is professional and free text — "Chamonix-Mont-Blanc, France",
 * "Talkeetna, Alaska, United States" — so the country is the last segment. A
 * town alone yields no country and the guide is simply absent from the country
 * filter's options rather than being filed under a guess.
 */
export function basedCountry(guide: Guide): string | null {
  const parts = guide.basedIn
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

/** Every mountain a guide names, whether or not they record an ascent of it. */
export function mountainsOf(guide: Guide): string[] {
  const seen = new Map<string, string>();
  for (const m of guide.mountains) seen.set(normalise(m), m);
  for (const m of Object.keys(guide.ascentsByMountain)) seen.set(normalise(m), m);
  return [...seen.values()];
}

export const ascentsOf = (guide: Guide, mountain: string): number => {
  const wanted = normalise(mountain);
  for (const [name, count] of Object.entries(guide.ascentsByMountain)) {
    if (normalise(name) === wanted) return Number.isFinite(count) ? Math.trunc(count) : 0;
  }
  return 0;
};

export const worksMountain = (guide: Guide, mountain: string): boolean =>
  mountainsOf(guide).some((m) => normalise(m) === normalise(mountain));

/* -------------------------------------------------------------------------- */
/* Option lists                                                                */
/* -------------------------------------------------------------------------- */

const byName = (a: string, b: string) => a.localeCompare(b, "en-GB");

export function allMountains(pool: Guide[]): string[] {
  const seen = new Map<string, string>();
  for (const g of pool) for (const m of mountainsOf(g)) seen.set(normalise(m), m);
  return [...seen.values()].sort(byName);
}

export function allCountries(pool: Guide[]): string[] {
  const set = new Set<string>();
  for (const g of pool) {
    const c = basedCountry(g);
    if (c) set.add(c);
  }
  return [...set].sort(byName);
}

export function allLanguages(pool: Guide[]): string[] {
  const set = new Set<string>();
  for (const g of pool) for (const l of g.languages) set.add(l);
  return [...set].sort(byName);
}

export function allSpecialities(pool: Guide[]): Speciality[] {
  const set = new Set<Speciality>();
  for (const g of pool) for (const s of g.specialities) set.add(s);
  return [...set];
}

/** A window, inclusive at both ends. */
export interface Bound {
  min: number;
  max: number;
}

export interface GuideBounds {
  rateEur: Bound;
  yearsGuiding: Bound;
}

/** Rounds a window outwards so a slider's printed ends are round numbers. */
function widen(values: number[], step: number, fallback: Bound): Bound {
  if (values.length === 0) return fallback;
  const min = Math.floor(Math.min(...values) / step) * step;
  const max = Math.ceil(Math.max(...values) / step) * step;
  // A single-valued catalogue would otherwise produce a zero-width slider that
  // cannot be moved in either direction.
  return max > min ? { min, max } : { min, max: min + step };
}

/**
 * The ends of the two range controls, taken from the catalogue itself.
 *
 * Read off the guides who are actually listed rather than hard-coded, so the
 * sliders never offer a band nobody occupies — a control whose ends promise
 * guides that are not there is the same lie as an invented listing. The
 * fallbacks apply only to an empty catalogue, where the screen renders its
 * empty state and no slider is reachable.
 */
export function guideBounds(pool: Guide[]): GuideBounds {
  return {
    rateEur: widen(
      pool.map((g) => g.dailyRateEur).filter((n) => Number.isFinite(n)),
      50,
      { min: 0, max: 1000 },
    ),
    yearsGuiding: widen(
      pool.map((g) => g.yearsGuiding).filter((n) => Number.isFinite(n)),
      1,
      { min: 0, max: 40 },
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                    */
/* -------------------------------------------------------------------------- */

const TAKING_WORK: Availability[] = ["available", "limited"];

export function matchesGuideFilters(guide: Guide, f: GuideFilters): boolean {
  if (f.mountain && !worksMountain(guide, f.mountain)) return false;
  if (f.country && basedCountry(guide) !== f.country) return false;
  if (f.specialities.length > 0 && !f.specialities.some((s) => guide.specialities.includes(s))) {
    return false;
  }
  if (f.languages.length > 0 && !f.languages.some((l) => guide.languages.includes(l))) return false;
  if (f.minDailyRateEur !== null && guide.dailyRateEur < f.minDailyRateEur) return false;
  if (f.maxDailyRateEur !== null && guide.dailyRateEur > f.maxDailyRateEur) return false;
  if (f.minYearsGuiding !== null && guide.yearsGuiding < f.minYearsGuiding) return false;
  if (f.maxYearsGuiding !== null && guide.yearsGuiding > f.maxYearsGuiding) return false;
  if (f.takingWorkOnly && !TAKING_WORK.includes(guide.availability)) return false;

  // Dates and party size deliberately do not exclude anyone — see the note at
  // the top of this file. They are carried into the criteria instead, where the
  // availability factor states plainly that a standing status is not a diary,
  // and the ratio factor states that no guide's ratio is held at all.
  return true;
}

/**
 * What the matcher is asked to compare against.
 *
 * The athlete's own onboarding standing is used unless they have overridden it
 * in the filters. It is what they told ICEFALL about themselves and nothing was
 * inferred from their recorded training — no session says what someone can lead.
 */
export function criteriaFrom(
  objective: SearchObjective | null,
  filters: GuideFilters,
  athleteExperience: ExperienceLevel,
): GuideRequestCriteria {
  return {
    peakName: objective?.peakName ?? "",
    // Zero is the matcher's own "no height recorded" signal: `bandFor` drops the
    // technical factor rather than scoring an objective it cannot size.
    elevationM: objective?.elevationM ?? 0,
    fromIso: filters.fromIso || objective?.targetDate || undefined,
    toIso: filters.toIso || undefined,
    // Undefined rather than a default of one: the matcher drops the ratio
    // factor when the party is unknown, which is honest, where assuming a solo
    // client would score every guide against a party nobody described.
    groupSize: filters.groupSize ?? undefined,
    experience: filters.experience ?? athleteExperience,
    languages: filters.languages.length > 0 ? filters.languages : undefined,
    maxDailyRateEur: filters.maxDailyRateEur ?? undefined,
  };
}
