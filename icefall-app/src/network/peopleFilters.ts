import { useCallback, useMemo, useSyncExternalStore } from "react";

import { matchScore } from "./matching";
import { LOOKING_FOR_LABELS, type AthleteProfile, type LookingFor } from "./types";

/**
 * What the athlete is looking for on the People screen: the mountain, the
 * month, the place and the kind of company.
 *
 * WHY THIS IS A MODULE AND NOT COMPONENT STATE
 *
 * The filters have to survive navigation — open a profile, come back, and the
 * search you set up is still the search you set up. `People` unmounts on every
 * route change, so `useState` cannot hold them. They live here instead, in a
 * tiny store mirrored into `localStorage`, and the screen subscribes.
 *
 * WHAT A FILTER IS AND IS NOT, HERE
 *
 * ICEFALL has no server and no other athletes, so setting a filter never runs a
 * search: it changes what WOULD be looked for the day a directory exists. The
 * screen says that in as many words. Nothing in this module fetches people,
 * invents people, or counts people, and none of the predicates below can ever
 * return true for somebody who does not exist.
 *
 * TWO CONVENTIONS THE PREDICATES SHARE
 *
 *   1. AN UNKNOWN IS NOT A MATCH AND NOT A FAILURE. Someone who never named an
 *      objective is not "climbing a different mountain" — they are unmeasured,
 *      so they are simply not that filter's match. They are never scored down
 *      for it anywhere else in the app.
 *   2. THE ENGINE OWNS ITS THRESHOLDS. "Same mountain" is decided by
 *      `matchScore` in `./matching` (which resolves alternative names by
 *      coordinate) rather than by a second copy of the rule here that could
 *      drift away from it. See `objectiveProbe`.
 *
 * Location deserves its own note. `near-me` is the only filter that depends on
 * the athlete's own position, and it is unavailable until `locationOptIn` is
 * true — the UI cannot select it, and nothing in this module reads, requests or
 * infers a position. Country and city are free text compared against the words
 * other people wrote for their own area; ICEFALL does no geocoding, so it
 * genuinely cannot tell a city from the country around it, and the screen says
 * so rather than implying a lookup happened.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A mountain the athlete has picked to search on.
 *
 * `elevationM`, `lat` and `lon` are optional because a peak that could not be
 * resolved may still be searched for by name — the same rule the expedition
 * form follows. Nothing here is ever guessed to fill a gap.
 */
export interface ObjectivePick {
  name: string;
  elevationM?: number;
  lat?: number;
  lon?: number;
}

export type ObjectiveFilter = { kind: "any" } | { kind: "peak"; peak: ObjectivePick };

/**
 * A month, with a tolerance either side.
 *
 * Alpine plans move by weeks — weather, permits, a partner's leave — so an
 * exact-month filter would hide the person who is on the same mountain eight
 * days after you. The tolerance defaults to a month either side for that
 * reason, and it is visible and adjustable rather than a hidden fudge.
 *
 * `month` is 0-based, matching `Date.getMonth()`.
 */
export type DateFilter =
  | { kind: "any" }
  | { kind: "month"; year: number; month: number; flexMonths: number };

export type LocationFilterKind = "near-me" | "country" | "city" | "anywhere";

/**
 * `km` on `near-me` is the radius the athlete has widened to. It mirrors the
 * distance bands in `./privacy`, because a scope finer than the bands would
 * imply a precision the ~5 km coarsening grid cannot support.
 */
export type LocationFilter =
  | { kind: "near-me"; km: number }
  | { kind: "country"; place: string }
  | { kind: "city"; place: string }
  | { kind: "anywhere" };

export interface PeopleFilters {
  objective: ObjectiveFilter;
  date: DateFilter;
  location: LocationFilter;
  /** Empty means no restriction — never "nothing matches". */
  lookingFor: LookingFor[];
}

/**
 * Only the fields the athlete has actually set.
 *
 * Kept separate from the resolved filters so an untouched field keeps FOLLOWING
 * the athlete's active goal: change the objective in Goals and GOING TO changes
 * with it, rather than being pinned to whatever the goal happened to be the
 * first time this screen was opened.
 */
export interface PeopleFilterOverrides {
  objective?: ObjectiveFilter;
  date?: DateFilter;
  location?: LocationFilter;
  lookingFor?: LookingFor[];
}

/** What the defaults are derived from: the athlete's own active objective. */
export interface FilterDefaultsContext {
  peak: ObjectivePick | null;
  /** ISO date of the goal, when there is one. */
  targetDate?: string;
}

/* -------------------------------------------------------------------------- */
/* Radius ladder                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The rungs "Expand search" climbs, mirroring the distance bands in
 * `./privacy` so the scope the athlete sets and the distance they would read
 * are described in the same units.
 */
export const RADIUS_LADDER_KM = [25, 50, 100, 250, 500, 1000] as const;

export const DEFAULT_RADIUS_KM = 100;

/** The next rung up, or null at the top — where "Anywhere" takes over. */
export function nextRadiusKm(km: number): number | null {
  return RADIUS_LADDER_KM.find((rung) => rung > km) ?? null;
}

export const fmtKm = (km: number) => `${km.toLocaleString("en-GB")} km`;

/* -------------------------------------------------------------------------- */
/* Months                                                                      */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

/** How many months forward the picker offers. Two seasons of planning. */
export const MONTH_WINDOW_COUNT = 18;

/** A single index over months, so "either side" is arithmetic rather than dates. */
const monthIndex = (year: number, month: number) => year * 12 + month;

export const fmtMonth = (year: number, month: number) => `${MONTH_SHORT[month]} ${year}`;

export const fmtMonthLong = (year: number, month: number) => `${MONTH_NAMES[month]} ${year}`;

/**
 * The year and month of an ISO date, read from the STRING rather than through
 * `new Date(...)`.
 *
 * `new Date("2026-08-01")` is parsed as UTC midnight, which is 31 July in every
 * timezone west of Greenwich — enough to file a July objective under June, or
 * an August one under July, purely because of where the phone is. The month is
 * the whole unit this filter works in, so it is taken from the text.
 */
export function monthOf(iso: string | undefined): { year: number; month: number } | null {
  if (typeof iso !== "string") return null;
  const ymd = /^(\d{4})-(\d{2})/.exec(iso.trim());
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]) - 1;
    if (Number.isFinite(year) && month >= 0 && month <= 11) return { year, month };
  }
  // Anything else (a full timestamp, a locale string) falls back to the parser.
  const d = new Date(iso);
  const t = d.getTime();
  return Number.isFinite(t) ? { year: d.getFullYear(), month: d.getMonth() } : null;
}

export interface MonthOption {
  year: number;
  month: number;
  label: string;
}

/**
 * The months the picker offers: this month forward, plus the goal's month if it
 * falls outside that run.
 *
 * A goal further out than the window is the athlete's real objective, so it is
 * added rather than quietly unavailable — a picker that cannot express the plan
 * the app already knows about would be a strange thing to hand someone.
 */
export function monthOptions(
  now: Date,
  include?: { year: number; month: number } | null,
): MonthOption[] {
  const out: MonthOption[] = [];
  const startYear = now.getFullYear();
  const startMonth = now.getMonth();

  for (let i = 0; i < MONTH_WINDOW_COUNT; i++) {
    const idx = monthIndex(startYear, startMonth) + i;
    const year = Math.floor(idx / 12);
    const month = idx - year * 12;
    out.push({ year, month, label: fmtMonth(year, month) });
  }

  if (include) {
    const has = out.some((o) => o.year === include.year && o.month === include.month);
    if (!has) {
      out.push({ ...include, label: fmtMonth(include.year, include.month) });
      out.sort((a, b) => monthIndex(a.year, a.month) - monthIndex(b.year, b.month));
    }
  }

  return out;
}

/** The tolerances offered beside the month. */
export const FLEX_OPTIONS: { months: number; label: string }[] = [
  { months: 0, label: "That month" },
  { months: 1, label: "± 1 month" },
  { months: 2, label: "± 2 months" },
];

/** Alpine plans move by weeks, so a month either side is the honest default. */
export const DEFAULT_FLEX_MONTHS = 1;

/* -------------------------------------------------------------------------- */
/* Defaults                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The filters an athlete who has set nothing sees.
 *
 * GOING TO and DATE come from their own active goal, because this network is
 * organised around mountains rather than people and their mountain is the one
 * ICEFALL already knows about. LOCATION defaults to `anywhere` — never
 * `near-me`, which would imply a position ICEFALL has not been given and must
 * not ask for until the athlete opts in.
 */
export function defaultFilters(ctx: FilterDefaultsContext): PeopleFilters {
  const goalMonth = monthOf(ctx.targetDate);

  return {
    objective: ctx.peak ? { kind: "peak", peak: ctx.peak } : { kind: "any" },
    date: goalMonth
      ? { kind: "month", ...goalMonth, flexMonths: DEFAULT_FLEX_MONTHS }
      : { kind: "any" },
    location: { kind: "anywhere" },
    lookingFor: [],
  };
}

export function resolveFilters(
  overrides: PeopleFilterOverrides,
  ctx: FilterDefaultsContext,
): PeopleFilters {
  const base = defaultFilters(ctx);
  return {
    objective: overrides.objective ?? base.objective,
    date: overrides.date ?? base.date,
    location: overrides.location ?? base.location,
    lookingFor: overrides.lookingFor ?? base.lookingFor,
  };
}

/* -------------------------------------------------------------------------- */
/* Predicates                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A comparison key, and emphatically NOT a person.
 *
 * It exists so "is this athlete going to the mountain I filtered on" is decided
 * by the matching engine — which resolves Denali and Mount McKinley by
 * coordinate — instead of by a second copy of that rule here. It is never
 * rendered, never listed, never stored and never counted: it has no name, and
 * the only thing read back out of it is one factor's score.
 */
function objectiveProbe(peak: ObjectivePick): AthleteProfile {
  return {
    id: "filter:objective-probe",
    displayName: "",
    objective: {
      peakName: peak.name,
      // A name-only peak has no elevation. The engine compares mountains by
      // coordinate and name, never by height, so nothing is guessed to fill it.
      elevationM: peak.elevationM ?? 0,
      targetDate: "",
      lat: peak.lat,
      lon: peak.lon,
    },
    previousObjectives: [],
    lookingFor: [],
    verified: false,
  };
}

/** The engine's score for the SAME mountain. A shared massif scores 40. */
const SAME_MOUNTAIN_SCORE = 100;

export function matchesObjective(filter: ObjectiveFilter, them: AthleteProfile): boolean {
  if (filter.kind === "any") return true;
  if (!them.objective) return false; // unknown: not this filter's match, not a fault
  const objective = matchScore(objectiveProbe(filter.peak), them).factors.find(
    (f) => f.id === "objective",
  );
  return objective !== undefined && objective.weight > 0 && objective.score === SAME_MOUNTAIN_SCORE;
}

export function matchesDate(filter: DateFilter, them: AthleteProfile): boolean {
  if (filter.kind === "any") return true;
  const theirs = monthOf(them.objective?.targetDate);
  if (!theirs) return false; // no date set: unmeasured, so not this filter's match
  const gap = Math.abs(
    monthIndex(theirs.year, theirs.month) - monthIndex(filter.year, filter.month),
  );
  return gap <= filter.flexMonths;
}

/**
 * `distanceKm` is passed in rather than computed here: the caller already holds
 * it, and it comes from positions coarsened to a ~5 km grid. It is used to
 * include or exclude and is never returned, formatted or rendered — the only
 * distance string this feature may show comes from `approxDistanceLabel`.
 */
export function matchesLocation(
  filter: LocationFilter,
  them: AthleteProfile,
  distanceKm: number | null,
  locationOptIn: boolean,
): boolean {
  switch (filter.kind) {
    case "anywhere":
      return true;

    case "near-me":
      // Without an area of your own there is no "near", and ICEFALL will not
      // invent one. Nobody is near an athlete who is not sharing a position.
      if (!locationOptIn || distanceKm === null) return false;
      return distanceKm <= filter.km;

    case "country":
    case "city": {
      const place = filter.place.trim().toLowerCase();
      if (place.length === 0) return true; // nothing typed yet: no restriction
      const label = them.approxLocation?.label;
      if (typeof label !== "string") return false;
      // Text against text. ICEFALL does not geocode, so this compares what
      // somebody wrote for their own area — never a resolved place.
      return label.toLowerCase().includes(place);
    }
  }
}

export function matchesLookingFor(wanted: readonly LookingFor[], them: AthleteProfile): boolean {
  if (wanted.length === 0) return true;
  return them.lookingFor.some((l) => wanted.includes(l));
}

export function matchesFilters(
  them: AthleteProfile,
  filters: PeopleFilters,
  distanceKm: number | null,
  locationOptIn: boolean,
): boolean {
  return (
    matchesObjective(filters.objective, them) &&
    matchesDate(filters.date, them) &&
    matchesLocation(filters.location, them, distanceKm, locationOptIn) &&
    matchesLookingFor(filters.lookingFor, them)
  );
}

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export const objectiveSummary = (f: ObjectiveFilter) =>
  f.kind === "any" ? "Any mountain" : f.peak.name;

export const dateSummary = (f: DateFilter) =>
  f.kind === "any"
    ? "Any month"
    : f.flexMonths === 0
      ? fmtMonth(f.year, f.month)
      : `${fmtMonth(f.year, f.month)} ± ${f.flexMonths}`;

export function locationSummary(f: LocationFilter): string {
  switch (f.kind) {
    case "near-me":
      return `Near me · ${fmtKm(f.km)}`;
    case "anywhere":
      return "Anywhere";
    case "country":
      return f.place.trim().length > 0 ? f.place.trim() : "Country";
    case "city":
      return f.place.trim().length > 0 ? f.place.trim() : "City";
  }
}

export function lookingForSummary(wanted: readonly LookingFor[]): string {
  if (wanted.length === 0) return "Anything";
  if (wanted.length === 1) return LOOKING_FOR_LABELS[wanted[0]];
  return `${wanted.length} kinds`;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Versioned and separate from `icefall.state.v1`.
 *
 * A search intent is not part of the athlete's record, and it must not be able
 * to corrupt one. What is kept is what they typed and tapped on this screen; it
 * never leaves the device, for the same reason nothing else here does — there
 * is nowhere for it to go.
 */
const STORAGE_KEY = "icefall.people-filters.v1";

const EMPTY_OVERRIDES: PeopleFilterOverrides = {};

let overrides: PeopleFilterOverrides = EMPTY_OVERRIDES;
let hydrated = false;
const listeners = new Set<() => void>();

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Parses stored JSON back into filters, dropping anything malformed.
 *
 * Every field is checked rather than cast. This is written by an older build of
 * the app and edited by anyone with a devtools console, and a bad shape here
 * would crash the screen or — worse — resurrect a `near-me` filter with a
 * radius nobody chose.
 */
function parseObjective(v: unknown): ObjectiveFilter | undefined {
  if (!isRecord(v)) return undefined;
  if (v.kind === "any") return { kind: "any" };
  if (v.kind === "peak" && isRecord(v.peak)) {
    const name = str(v.peak.name)?.trim();
    if (!name) return undefined;
    return {
      kind: "peak",
      peak: {
        name,
        elevationM: finite(v.peak.elevationM),
        lat: finite(v.peak.lat),
        lon: finite(v.peak.lon),
      },
    };
  }
  return undefined;
}

function parseDate(v: unknown): DateFilter | undefined {
  if (!isRecord(v)) return undefined;
  if (v.kind === "any") return { kind: "any" };
  if (v.kind !== "month") return undefined;
  const year = finite(v.year);
  const month = finite(v.month);
  const flex = finite(v.flexMonths);
  if (year === undefined || month === undefined || month < 0 || month > 11) return undefined;
  return {
    kind: "month",
    year: Math.trunc(year),
    month: Math.trunc(month),
    flexMonths:
      flex === undefined ? DEFAULT_FLEX_MONTHS : Math.min(12, Math.max(0, Math.trunc(flex))),
  };
}

function parseLocation(v: unknown): LocationFilter | undefined {
  if (!isRecord(v)) return undefined;
  switch (v.kind) {
    case "anywhere":
      return { kind: "anywhere" };
    case "near-me": {
      const km = finite(v.km);
      return { kind: "near-me", km: km === undefined ? DEFAULT_RADIUS_KM : km };
    }
    case "country":
    case "city":
      return { kind: v.kind, place: str(v.place) ?? "" };
    default:
      return undefined;
  }
}

function parseLookingFor(v: unknown): LookingFor[] | undefined {
  if (!Array.isArray(v)) return undefined;
  // The label table is the single source of truth for what the model accepts,
  // so a value retired from the union cannot survive in storage.
  const known = new Set<string>(Object.keys(LOOKING_FOR_LABELS));
  return v.filter((x): x is LookingFor => typeof x === "string" && known.has(x));
}

function readStored(): PeopleFilterOverrides {
  if (typeof localStorage === "undefined") return EMPTY_OVERRIDES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_OVERRIDES;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY_OVERRIDES;
    const next: PeopleFilterOverrides = {};
    const objective = parseObjective(parsed.objective);
    if (objective) next.objective = objective;
    const date = parseDate(parsed.date);
    if (date) next.date = date;
    const location = parseLocation(parsed.location);
    if (location) next.location = location;
    const lookingFor = parseLookingFor(parsed.lookingFor);
    if (lookingFor) next.lookingFor = lookingFor;
    return next;
  } catch {
    // Corrupt or unreadable storage falls back to the defaults, which follow
    // the athlete's own goal. Never to a half-parsed filter.
    return EMPTY_OVERRIDES;
  }
}

function snapshot(): PeopleFilterOverrides {
  if (!hydrated) {
    overrides = readStored();
    hydrated = true;
  }
  return overrides;
}

function emit() {
  for (const listener of listeners) listener();
}

function write(next: PeopleFilterOverrides) {
  overrides = next;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode, or the quota is full. The filters still work for this
      // session; only their survival across a reload is lost.
    }
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The screen's handle on the filters.
 *
 * Returns the RESOLVED filters (overrides layered over defaults derived from
 * the goal), the setters, and whether the athlete has changed anything — so the
 * bar can offer to reset only when there is something to reset.
 */
export function usePeopleFilters(ctx: FilterDefaultsContext) {
  const stored = useSyncExternalStore(subscribe, snapshot, snapshot);

  const filters = useMemo(() => resolveFilters(stored, ctx), [stored, ctx]);

  const setObjective = useCallback((objective: ObjectiveFilter) => {
    write({ ...snapshot(), objective });
  }, []);

  const setDate = useCallback((date: DateFilter) => {
    write({ ...snapshot(), date });
  }, []);

  const setLocation = useCallback((location: LocationFilter) => {
    write({ ...snapshot(), location });
  }, []);

  const setLookingFor = useCallback((lookingFor: LookingFor[]) => {
    write({ ...snapshot(), lookingFor });
  }, []);

  /** Back to following the athlete's goal, not to an empty search. */
  const reset = useCallback(() => write(EMPTY_OVERRIDES), []);

  const touched = Object.keys(stored).length > 0;

  return { filters, touched, setObjective, setDate, setLocation, setLookingFor, reset };
}
