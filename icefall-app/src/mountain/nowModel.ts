/**
 * The Now tab's wording and arithmetic, pure so it can be tested (plan §3.2).
 * The screen (`NowTab.tsx`) only lays these out.
 */

import type { Camp } from "@/data/mountainCamps";
import { haversine } from "@/tracking/filters";

import type { BreadcrumbStatus } from "./breadcrumbs";
import type { KnownPosition, PositionFreshness } from "./position";
import type { MountainItineraryDay, MountainTrip, TripDay } from "./tripModel";

/* -------------------------------------------------------------------------- */
/* Day label                                                                   */
/* -------------------------------------------------------------------------- */

export const NO_TRIP_OPEN = "No trip open.";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "Day 2 · Summit · Mont Blanc", "Day 3 of 9 · Denali", "Mont Blanc · starts in
 * 6 days". Never a negative or overflowing day number: the day comes from
 * `tripDay`, which already applies the date window.
 */
export function dayLabel(
  trip: MountainTrip | null,
  day: TripDay | null,
  itineraryDay: MountainItineraryDay | null,
  runningToday: boolean,
): string {
  if (!trip || !day) return NO_TRIP_OPEN;
  const name = trip.peakName ?? trip.name;
  if (day.kind === "before") return `${name} · starts in ${plural(day.daysToGo, "day")}`;
  if (day.kind === "after") return `${name} · dates have passed`;
  if (!runningToday) return `${name} · trip ended`;
  const parts = [
    itineraryDay ? `Day ${day.dayNumber}` : `Day ${day.dayNumber} of ${day.totalDays}`,
  ];
  if (itineraryDay?.summitDay) parts.push("Summit");
  parts.push(name);
  return parts.join(" · ");
}

/* -------------------------------------------------------------------------- */
/* A number and its unit                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Splits "4,180 m" into "4,180" and "m", so the screen can set the unit a step
 * lighter than the number it belongs to (mockup §3: "the unit renders in a
 * lighter grey than its number").
 *
 * IT ONLY SPLITS WHEN THE NUMBER PART CARRIES NO LETTERS OF ITS OWN. A duration
 * like "9 h 10 min" would otherwise be read as "9 h 10" plus a unit "min",
 * which is not what either half means. When there is nothing safe to split off,
 * the whole string comes back as the value and the unit is null — the caller
 * then renders it in one ink, which is always correct.
 *
 * Pure string handling. It never rounds, converts or invents anything: whatever
 * produced the text decided what it says.
 */
export function splitUnit(text: string): { value: string; unit: string | null } {
  const m = /^([^A-Za-z]*\d)\s+([A-Za-z°µ/]{1,4})$/.exec(text.trim());
  return m ? { value: m[1], unit: m[2] } : { value: text, unit: null };
}

/* -------------------------------------------------------------------------- */
/* Countdown digits                                                            */
/* -------------------------------------------------------------------------- */

/** "4:12" (hours:minutes) above an hour, "28:05" (minutes:seconds) below it. */
export function countdownDigits(ms: number): { digits: string; unit: string } {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return { digits: `${h}:${String(m).padStart(2, "0")}`, unit: "hours : minutes" };
  }
  const m = Math.floor(s / 60);
  return { digits: `${m}:${String(s % 60).padStart(2, "0")}`, unit: "minutes : seconds" };
}

/* -------------------------------------------------------------------------- */
/* Altitude                                                                    */
/* -------------------------------------------------------------------------- */

const metres = (n: number) => `${Math.round(n).toLocaleString("en-GB")} m`;

export type AltitudeReading =
  | { kind: "none"; reason: string }
  | {
      kind: "reading";
      /** "4,120 m" or "≈4,100 m". */
      figure: string;
      /** "± 12 m · GPS" or "GPS, this phone did not say how accurate". */
      qualifier: string;
      /** False when the phone gave no vertical accuracy: nothing may be subtracted from it. */
      subtractable: boolean;
    };

/**
 * Plan §3.2 CORRECTED: with an accuracy, `4,120 m ± 12 m · GPS`. Without one,
 * rounded to the nearest 50 m and said so — and ascent remaining is withheld,
 * because a difference involving a number of unknown error is not a number.
 */
export function altitudeReading(
  pos: KnownPosition | null,
  freshness: PositionFreshness | null,
): AltitudeReading {
  if (!pos || !freshness) return { kind: "none", reason: "No GPS reading on this phone yet." };
  if (freshness === "silent") return { kind: "none", reason: "No GPS reading in the last hour." };
  if (pos.altitudeM === null)
    return { kind: "none", reason: "The last GPS reading carried no altitude." };
  const acc = pos.altitudeAccuracyM;
  if (acc === null || !Number.isFinite(acc) || acc <= 0) {
    return {
      kind: "reading",
      figure: `≈${metres(Math.round(pos.altitudeM / 50) * 50)}`,
      qualifier: "GPS, this phone did not say how accurate",
      subtractable: false,
    };
  }
  return {
    kind: "reading",
    figure: metres(pos.altitudeM),
    qualifier: `± ${Math.max(1, Math.round(acc))} m · GPS`,
    subtractable: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Where daylight is worked out from                                           */
/* -------------------------------------------------------------------------- */

export interface SunInput {
  lat: number;
  lon: number;
  /** For the horizon dip. Null for the summit: a sea-level horizon gives the earlier sunset. */
  altitudeM: number | null;
  from:
    | { kind: "position"; ageMs: number; altitudeM: number | null }
    | { kind: "summit"; peakName: string | null };
}

/**
 * ONE rule for the Now tab and the turnaround alarm, so the two can never show
 * different sunsets: a GPS position from the last hour, else the trip's summit,
 * else nothing (plan §3.0, daylight row).
 */
export function sunInputFor(
  pos: KnownPosition | null,
  freshness: PositionFreshness | null,
  summit: { lat: number; lon: number } | null,
  peakName: string | null,
  now: number,
): SunInput | null {
  if (pos && freshness && freshness !== "silent") {
    const altitudeM = pos.altitudeM !== null && pos.altitudeM > 0 ? pos.altitudeM : null;
    return {
      lat: pos.lat,
      lon: pos.lon,
      altitudeM,
      from: { kind: "position", ageMs: Math.max(0, now - pos.at), altitudeM },
    };
  }
  if (summit)
    return {
      lat: summit.lat,
      lon: summit.lon,
      altitudeM: null,
      from: { kind: "summit", peakName },
    };
  return null;
}

/* -------------------------------------------------------------------------- */
/* Distance to a place                                                         */
/* -------------------------------------------------------------------------- */

/*
 * Great-circle bearing and compass point, the same maths as `tracking/follow.ts`
 * (tested there). Copied rather than imported because follow.ts imports
 * `services/trails.ts`, which makes network requests, and Now is on the
 * offline safety path that loads with the main file.
 */
const POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

export function trueBearing(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const compassPoint = (deg: number) => POINTS[Math.round((deg % 360) / 22.5) % 16];

export function distanceLabel(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export interface PlaceReading {
  name: string;
  /** Straight-line metres. */
  distanceM: number;
  /** "NW". Null when the fix is too old to point a direction from (plan §9.1 point 9). */
  direction: string | null;
  /** Height of the place minus your height. Null unless both heights exist and yours has a stated accuracy. */
  ascentM: number | null;
  /** Why ascent is absent, when it is. */
  ascentMissing: string | null;
}

/**
 * Straight-line distance, direction and ascent from a position to a place.
 * Null when there is no usable position: a distance from an hour-old fix is
 * not a distance from here.
 */
export function placeReading(
  place: { name: string; lat: number; lon: number; elevationM: number | null },
  pos: KnownPosition | null,
  freshness: PositionFreshness | null,
): PlaceReading | null {
  if (!pos || !freshness || freshness === "silent") return null;
  const here = { lat: pos.lat, lon: pos.lon };
  const distanceM = haversine(here, place);
  const direction =
    freshness === "stale" || distanceM < 30 ? null : compassPoint(trueBearing(here, place));

  const alt = altitudeReading(pos, freshness);
  let ascentM: number | null = null;
  let ascentMissing: string | null = null;
  if (place.elevationM === null) ascentMissing = "No recorded height for this place.";
  else if (alt.kind === "none") ascentMissing = alt.reason;
  else if (!alt.subtractable) ascentMissing = "Your GPS height has no stated accuracy.";
  else ascentM = Math.round(place.elevationM - (pos.altitudeM as number));

  return { name: place.name, distanceM, direction, ascentM, ascentMissing };
}

/** The recorded camp closest to a position, straight-line. */
export function nearestCamp(camps: readonly Camp[], pos: KnownPosition): Camp | null {
  let best: Camp | null = null;
  let bestD = Infinity;
  for (const c of camps) {
    const d = haversine({ lat: pos.lat, lon: pos.lon }, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** "Climb 280 m" / "280 m below you" / "About level". */
export function ascentLabel(ascentM: number): string {
  if (Math.abs(ascentM) < 10) return "About level with you";
  return ascentM > 0 ? `${metres(ascentM)} to climb` : `${metres(-ascentM)} below you`;
}

/* -------------------------------------------------------------------------- */
/* Which places the Now tab draws, and on what grounds                         */
/* -------------------------------------------------------------------------- */

export interface PlaceLike {
  name: string;
  lat: number;
  lon: number;
  elevationM: number | null;
}

export interface PlaceRowSpec {
  heading: string;
  place: PlaceLike;
  /** Where the claim comes from, or what ICEFALL does not know. Null when the heading says it all. */
  basis: string | null;
  /** Camps and huts come from OpenStreetMap and carry its attribution; the summit does not. */
  source: "camp" | "summit";
}

/** Plan §9.3: no peak in the app carries an ordered route, so "next" cannot be derived. */
export const NO_ROUTE_ORDER =
  "ICEFALL holds no route order for this mountain, so it cannot say which camp comes next. This is the nearest recorded one.";
export const NEXT_FROM_ITINERARY = "From this trip's own itinerary.";
export const STRAIGHT_LINE_NOTE =
  "Straight-line, not along a path. Directions are from true north.";

/**
 * The rows for "From here", in the order they are read.
 *
 * The next camp is only ever the one THIS TRIP's itinerary names. Where there is
 * no itinerary the nearest recorded hut takes its place and says so — a camp
 * called "next" because it happens to be closest is a claim the data does not
 * support (plan §9.3).
 */
export function placeRowSpecs(input: {
  summit: { lat: number; lon: number } | null;
  peakName: string | null;
  peakElevationM: number | null;
  /** Where this trip's itinerary puts tonight, when it has one. */
  itinerarySleep: PlaceLike | null;
  /** The recorded camps for this mountain. Null when ICEFALL holds no record for it. */
  camps: readonly Camp[] | null;
  /** A position fresh enough to measure from, or null. */
  pos: KnownPosition | null;
}): PlaceRowSpec[] {
  const { summit, peakName, peakElevationM, itinerarySleep, camps, pos } = input;
  if (!pos) return [];

  const rows: PlaceRowSpec[] = [];

  if (itinerarySleep) {
    rows.push({
      heading: "Next camp",
      place: itinerarySleep,
      basis: NEXT_FROM_ITINERARY,
      source: "camp",
    });
  }

  if (summit) {
    rows.push({
      heading: "Summit",
      place: {
        name: peakName ?? "Summit",
        lat: summit.lat,
        lon: summit.lon,
        elevationM: peakElevationM,
      },
      basis: null,
      source: "summit",
    });
  }

  const hut = camps && camps.length ? nearestCamp(camps, pos) : null;
  if (hut && hut.name !== itinerarySleep?.name) {
    rows.push({
      heading: "Nearest recorded hut",
      place: hut,
      basis: NO_ROUTE_ORDER,
      source: "camp",
    });
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Pace over the last hour                                                     */
/* -------------------------------------------------------------------------- */

export const PACE_WINDOW_MS = 60 * 60_000;
/** Less watched time than this in the window and there is no pace worth printing. */
export const PACE_MIN_WATCHED_MS = 5 * 60_000;

/** Plan §9.3: nothing in the app carries planned times, so there is no "vs plan". */
export const NO_PLAN_TIMES =
  "ICEFALL holds no planned times for this trip, so there is nothing to compare this against.";

/**
 * THE PLAN-STATUS SLOT (mockup §3, spec §9 case 1).
 *
 * The mockup's last line before the button is `ON PLAN · 20 min ahead` in azure
 * or `BEHIND PLAN · summit ~40 min after turnaround` in amber. Neither can be
 * computed: no itinerary in ICEFALL carries timed splits for any route, so
 * there is no planned time for this athlete, today, to be ahead of or behind.
 *
 * The slot is built anyway, in the same place, with the truth in it. It is not
 * amber: being unable to measure something is not a caution, and amber on this
 * screen means "act now".
 */
export const PLAN_STATUS_LABEL = "Against plan";
export const NO_PLAN_STATUS =
  "Not known. ICEFALL holds no planned times for this trip, so it cannot say whether you are ahead of it or behind it.";
export const PACE_FLOOR_NOTE =
  "Only where ICEFALL was open and watching, and GPS stops when the phone is in a pocket. This is a floor, not a total.";
export const NO_TRACK_IN_WINDOW = "No track from the last hour on this phone.";
export const NOT_ENOUGH_WATCHED =
  "ICEFALL watched less than five minutes of the last hour. That is not enough for a pace.";

/** A fix a pace can be worked out from. A stored breadcrumb is one. */
export interface PacePoint {
  /** Epoch ms of the fix. */
  t: number;
  lat: number;
  lon: number;
  altitudeM: number | null;
  /** Horizontal accuracy in metres, as the phone reported it. Null when it did not. */
  accuracyM: number | null;
  altitudeAccuracyM: number | null;
}

export type PaceAscent =
  | { kind: "gain" | "loss"; netM: number; plusMinusM: number }
  /** The height moved less than the two fixes' own error. That is not a climb. */
  | { kind: "within-error"; plusMinusM: number }
  | { kind: "none"; reason: string };

export type PaceReading =
  | { kind: "none"; reason: string }
  | {
      kind: "pace";
      windowMs: number;
      /** Ms actually covered by unbroken runs inside the window — never the whole hour. */
      watchedMs: number;
      /** Metres along those runs, with legs inside the GPS error dropped. */
      walkedM: number;
      metresPerHour: number;
      ascent: PaceAscent;
      /** Net height change per hour, when the height moved further than the error. */
      verticalMPerHour: number | null;
      /** Breaks in the track inside the window. */
      gaps: number;
    };

/** With no accuracy from the phone, a leg shorter than this is treated as scatter. */
const ASSUMED_FIX_ERROR_M = 10;

/**
 * Distance walked and height gained over the last hour.
 *
 * `segments` must be the UNBROKEN RUNS from `geo.ts`'s `splitTrack` — never the
 * raw crumb list. A line drawn across a gap crosses ground nobody walked, and
 * the same is true of a distance added across one.
 *
 * TWO DELIBERATE UNDERCOUNTS. Time is counted only inside runs, so an hour with
 * forty minutes of pocket in it reports twenty minutes watched, not an hour. And
 * a leg shorter than the worse of its two fixes' stated accuracy is dropped: GPS
 * scatter at a rest stop otherwise adds up to a walk nobody took.
 */
export function paceOverWindow(
  segments: readonly (readonly PacePoint[])[],
  now: number,
  windowMs: number = PACE_WINDOW_MS,
): PaceReading {
  const from = now - windowMs;
  const runs = segments
    .map((s) => s.filter((p) => p.t >= from && p.t <= now).sort((a, b) => a.t - b.t))
    .filter((s) => s.length > 0);
  if (!runs.length) return { kind: "none", reason: NO_TRACK_IN_WINDOW };

  let watchedMs = 0;
  let walkedM = 0;
  for (const run of runs) {
    watchedMs += run[run.length - 1].t - run[0].t;
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1];
      const b = run[i];
      const d = haversine(a, b);
      const noise = Math.max(
        a.accuracyM ?? ASSUMED_FIX_ERROR_M,
        b.accuracyM ?? ASSUMED_FIX_ERROR_M,
      );
      if (d >= noise) walkedM += d;
    }
  }
  if (watchedMs < PACE_MIN_WATCHED_MS) return { kind: "none", reason: NOT_ENOUGH_WATCHED };

  return {
    kind: "pace",
    windowMs,
    watchedMs,
    walkedM,
    metresPerHour: (walkedM * 3_600_000) / watchedMs,
    gaps: Math.max(0, runs.length - 1),
    ...verticalOver(runs),
  };
}

/**
 * Net height change across the window — measured first usable fix to last, and
 * legitimately measured ACROSS a gap: both ends are real readings of where the
 * athlete was, however little was watched in between.
 *
 * Never a running total of every wobble. GPS height noise accumulates into
 * hundreds of metres of invented climbing over an hour, and the same rule as the
 * altitude row applies: a fix with no stated accuracy cannot be subtracted from.
 */
function verticalOver(runs: readonly (readonly PacePoint[])[]): {
  ascent: PaceAscent;
  verticalMPerHour: number | null;
} {
  const usable = runs
    .flat()
    .filter(
      (p) =>
        p.altitudeM !== null &&
        p.altitudeAccuracyM !== null &&
        Number.isFinite(p.altitudeAccuracyM) &&
        (p.altitudeAccuracyM as number) > 0,
    );
  if (usable.length < 2) {
    return {
      ascent: {
        kind: "none",
        reason:
          usable.length === 0
            ? "No GPS height with a stated accuracy in the last hour."
            : "Only one GPS height with a stated accuracy in the last hour.",
      },
      verticalMPerHour: null,
    };
  }

  const first = usable[0];
  const last = usable[usable.length - 1];
  const netM = Math.round((last.altitudeM as number) - (first.altitudeM as number));
  const plusMinusM = Math.max(
    1,
    Math.round((first.altitudeAccuracyM as number) + (last.altitudeAccuracyM as number)),
  );
  if (Math.abs(netM) <= plusMinusM) {
    return { ascent: { kind: "within-error", plusMinusM }, verticalMPerHour: null };
  }

  const spanMs = last.t - first.t;
  return {
    ascent: { kind: netM > 0 ? "gain" : "loss", netM: Math.abs(netM), plusMinusM },
    verticalMPerHour:
      spanMs >= PACE_MIN_WATCHED_MS ? Math.round((netM * 3_600_000) / spanMs) : null,
  };
}

/**
 * Why there is no pace, when the reason is the phone rather than the walk.
 * Null means the pace reading's own reason is the true one.
 */
export function paceUnavailable(
  status: BreadcrumbStatus,
  storageError: string | null,
): string | null {
  if (storageError) return storageError;
  if (status === "denied") return "Location is off for ICEFALL, so there is no track to measure.";
  if (status === "unsupported")
    return "This browser gives ICEFALL no GPS, so there is no track to measure.";
  return null;
}

/** "2.4 km/h", "12 km/h", "under 0.1 km/h". */
export function speedLabel(metresPerHour: number): string {
  const kph = metresPerHour / 1000;
  if (kph < 0.1) return "under 0.1 km/h";
  return `${kph < 10 ? kph.toFixed(1) : Math.round(kph)} km/h`;
}

/** "310 m an hour up" / "180 m an hour down". */
export function verticalRateLabel(mPerHour: number): string {
  return `${metres(Math.abs(mPerHour))} an hour ${mPerHour > 0 ? "up" : "down"}`;
}

/** "220 m up · ± 18 m", or the reason there is no figure. */
export function paceAscentLabel(a: PaceAscent): string {
  if (a.kind === "none") return a.reason;
  if (a.kind === "within-error")
    return `No clear height change — less than the ± ${a.plusMinusM} m these fixes are worth.`;
  return `${metres(a.netM)} ${a.kind === "gain" ? "up" : "down"} · ± ${a.plusMinusM} m`;
}

/* -------------------------------------------------------------------------- */
/* The forecast row                                                            */
/* -------------------------------------------------------------------------- */

/** Everything a forecast needs before it can be asked for. */
export interface ForecastSubject {
  peakName: string;
  elevationM: number;
  lat: number;
  lon: number;
}

export const FORECAST_NO_COORDS =
  "ICEFALL has no coordinates for this trip, so it cannot ask for a forecast.";
export const FORECAST_NO_SIGNAL =
  "No forecast on this phone. A forecast needs a signal — nothing newer can arrive without one.";
export const FORECAST_FAILED =
  "The forecast did not come back. Nothing newer has reached this phone.";
export const FORECAST_EMPTY = "The forecast came back with no readings in it.";

/** What a trip can be asked about, or null when it carries no coordinates. */
export function forecastSubject(
  trip: {
    peakName: string | null;
    name: string;
    peakElevationM: number | null;
    summit: { lat: number; lon: number } | null;
  } | null,
): ForecastSubject | null {
  if (!trip?.summit) return null;
  return {
    peakName: trip.peakName ?? trip.name,
    // The elevation only downscales the request; the summit height is the right ask.
    elevationM: trip.peakElevationM ?? 0,
    lat: trip.summit.lat,
    lon: trip.summit.lon,
  };
}

/**
 * The shape of `MountainConditions` this screen reads. Structural on purpose:
 * `services/conditions.ts` can make a request, and nothing in this file may
 * reach a module that can (plan §8.1 #1).
 */
export interface NowConditions {
  current: {
    temperatureC: { value: number | null };
    feelsLikeC: { value: number | null };
    windKph: { value: number | null };
    windDirectionDeg: { value: number | null };
    freezingLevelM: { value: number | null };
    visibilityM: { value: number | null };
  };
}

export interface ForecastFigure {
  label: string;
  value: string;
}

/** Everything the provider actually sent, and nothing it did not. */
export function forecastFigures(c: NowConditions): ForecastFigure[] {
  const out: ForecastFigure[] = [];
  const cur = c.current;
  const wind = cur.windKph.value;
  if (wind !== null) {
    const dir = cur.windDirectionDeg.value;
    out.push({
      label: "Wind",
      value: `${Math.round(wind)} km/h${dir === null ? "" : ` ${compassPoint(dir)}`}`,
    });
  }
  if (cur.freezingLevelM.value !== null)
    out.push({ label: "Freezing level", value: metres(cur.freezingLevelM.value) });
  if (cur.visibilityM.value !== null)
    out.push({ label: "Visibility", value: distanceLabel(cur.visibilityM.value) });
  return out;
}

/** The big number, when there is one: "−7 °C", with "feels like −14 °C" under it. */
export function forecastHeadline(c: NowConditions): { figure: string; caption: string } | null {
  const t = c.current.temperatureC.value;
  if (t === null) return null;
  const feels = c.current.feelsLikeC.value;
  const captions: string[] = [];
  if (feels !== null && Math.round(feels) !== Math.round(t))
    captions.push(`feels like ${Math.round(feels)} °C`);
  return { figure: `${Math.round(t)} °C`, caption: captions.join(" · ") };
}

/** The freshness band `services/conditions.ts` works out for the readings now. */
export type ConditionsBand = "fresh" | "aged" | "stale" | "silent";

export type ForecastView =
  | { kind: "none"; reason: string }
  | { kind: "loading" }
  | {
      kind: "reading";
      headline: { figure: string; caption: string } | null;
      figures: ForecastFigure[];
      conditionWord: string | null;
      /** Greyed: old enough that it is no longer the weather now. */
      grey: boolean;
      /** Its age, whenever it is not fresh. */
      ageSentence: string | null;
    };

/**
 * What the forecast row shows. RULE 2 LIVES HERE: a reading past the silent
 * threshold is withheld and its age given as the reason, never drawn as now.
 * Offline this says so plainly and asks for nothing.
 */
export function forecastView(input: {
  hasCoords: boolean;
  conditions: NowConditions | null;
  conditionWord: string | null;
  band: ConditionsBand | null;
  /** From `currentAgeSentence`, so one rule states every age in the app. */
  ageSentence: string | null;
  loading: boolean;
  /** The reachability check CONFIRMED a connection. Never `navigator.onLine`. */
  online: boolean;
  /** A request that came back with nothing, or a build with no real forecast. */
  failure: string | null;
}): ForecastView {
  if (!input.hasCoords) return { kind: "none", reason: FORECAST_NO_COORDS };

  if (input.conditions) {
    if (input.band === "silent")
      return { kind: "none", reason: input.ageSentence ?? FORECAST_NO_SIGNAL };
    return {
      kind: "reading",
      headline: forecastHeadline(input.conditions),
      figures: forecastFigures(input.conditions),
      conditionWord: input.conditionWord,
      grey: input.band === "stale",
      ageSentence: input.band === "fresh" ? null : input.ageSentence,
    };
  }

  if (input.loading) return { kind: "loading" };
  if (input.failure) return { kind: "none", reason: input.failure };
  return { kind: "none", reason: input.online ? FORECAST_FAILED : FORECAST_NO_SIGNAL };
}
