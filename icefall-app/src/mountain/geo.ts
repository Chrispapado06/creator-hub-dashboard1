/**
 * RETRACE MATHS (plan §3.3 CORRECTED) — pure functions, no React, no clock,
 * no network. Everything the retrace screen needs to be honest about a
 * breadcrumb track: where the gaps are, what was actually walked, which
 * recorded place the track last went past, and what a phone compass reading
 * is worth.
 *
 * Distance, bearing and compass points are NOT redefined here. The app already
 * has one implementation of each and two would be free to drift, so they are
 * re-exported from where they live.
 */

import { haversine } from "@/tracking/filters";

import { compassPoint, trueBearing } from "./nowModel";

export { compassPoint, haversine, trueBearing };

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** A point that knows when it was recorded. Epoch ms. */
export interface TimedPoint extends GeoPoint {
  t: number;
}

export const normaliseDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/** The way you came: the reverse of a bearing. */
export const backBearing = (deg: number): number => normaliseDeg(deg + 180);

/** Signed −180…180: how far, and which way, to turn from one bearing to another. */
export function turnBetween(fromDeg: number, toDeg: number): number {
  const d = normaliseDeg(toDeg - fromDeg);
  return d > 180 ? d - 360 : d;
}

/**
 * A bearing expressed relative to where the phone is pointing.
 *
 * ONLY EVER FOR DRAWING A SECOND MARKER, never for turning the main arrow: a
 * phone heading may be measured from magnetic north, and the difference from
 * true north is about 15° in Alaska (plan §3.3). The main arrow stays north-up.
 */
export const relativeBearing = (bearingDeg: number, headingDeg: number): number =>
  normaliseDeg(bearingDeg - headingDeg);

/* -------------------------------------------------------------------------- */
/* The track                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Further apart in time than this and the two crumbs are NOT joined.
 *
 * GPS stops when the phone is locked or in a pocket, so a line drawn through a
 * gap cuts a corner across terrain nobody walked — in poor visibility that is a
 * line pointing at a drop (plan §3.3 CORRECTED, change 1).
 */
export const CRUMB_GAP_MS = 5 * 60_000;

/** Plan §3.3 CORRECTED, change 2 — word for word. */
export const TRACK_GAPS_SENTENCE =
  "This is only where ICEFALL was open and watching. If your phone was in your pocket there are gaps, and this line does not go round them.";

/** Split a track wherever the time between two points exceeds `gapMs`. */
export function splitTrack<T extends TimedPoint>(
  points: readonly T[],
  gapMs: number = CRUMB_GAP_MS,
): T[][] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const segments: T[][] = [];
  let current: T[] = [];
  for (const p of sorted) {
    const prev = current[current.length - 1];
    if (prev && p.t - prev.t > gapMs) {
      segments.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length) segments.push(current);
  return segments;
}

export interface TrackShape<T extends TimedPoint> {
  /** Unbroken runs, oldest first. A gap between two of them is a hole, not a line. */
  segments: T[][];
  points: number;
  /** How many breaks the track has. */
  gaps: number;
  /** Metres along the segments ONLY. Never across a gap, so it is a floor, not a total. */
  walkedM: number;
  first: T | null;
  last: T | null;
  /** First crumb to last, in ms. */
  spanMs: number;
}

export function trackShape<T extends TimedPoint>(
  points: readonly T[],
  gapMs: number = CRUMB_GAP_MS,
): TrackShape<T> {
  const segments = splitTrack(points, gapMs);
  let walkedM = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) walkedM += haversine(seg[i - 1], seg[i]);
  }
  const first = segments[0]?.[0] ?? null;
  const lastSeg = segments[segments.length - 1];
  const last = lastSeg ? lastSeg[lastSeg.length - 1] : null;
  return {
    segments,
    points: segments.reduce((n, s) => n + s.length, 0),
    gaps: Math.max(0, segments.length - 1),
    walkedM,
    first,
    last,
    spanMs: first && last ? Math.max(0, last.t - first.t) : 0,
  };
}

/** The closest the track ever came to a place, and when. Null for an empty track. */
export function nearestApproach<T extends TimedPoint>(
  points: readonly T[],
  place: GeoPoint,
): { point: T; distanceM: number } | null {
  let best: { point: T; distanceM: number } | null = null;
  for (const p of points) {
    const distanceM = haversine(p, place);
    if (!best || distanceM < best.distanceM) best = { point: p, distanceM };
  }
  return best;
}

/**
 * Within this of a recorded camp or hut, ICEFALL counts the track as having
 * been there. Wide enough for a GPS fix at a hut, tight enough that walking
 * past on the path below does not claim you were at it.
 */
export const AT_PLACE_RADIUS_M = 150;

export interface PassedPlace<P> {
  place: P;
  /** The last crumb inside the radius — when the track was last there. */
  at: number;
  distanceM: number;
}

/**
 * The recorded place the track was at most recently.
 *
 * DERIVED, NEVER ASSUMED: "the last camp" is the camp this phone's own
 * breadcrumbs went inside `radiusM` of, latest first. A camp the track never
 * reached is not offered as somewhere to walk back to.
 */
export function lastPlacePassed<P extends GeoPoint, T extends TimedPoint>(
  points: readonly T[],
  places: readonly P[],
  radiusM: number = AT_PLACE_RADIUS_M,
): PassedPlace<P> | null {
  let best: PassedPlace<P> | null = null;
  for (const place of places) {
    for (const p of points) {
      const distanceM = haversine(p, place);
      if (distanceM > radiusM) continue;
      if (!best || p.t > best.at) best = { place, at: p.t, distanceM };
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Thinning                                                                    */
/* -------------------------------------------------------------------------- */

export interface ThinningRule {
  /** Never store two crumbs closer together in time than this. */
  minIntervalMs: number;
  /** …unless the phone has moved at least this far. */
  minDistanceM: number;
  /** A fix vaguer than this is a mast or a wifi guess, not a position. */
  worstAccuracyM: number;
}

/** Normal walking. About one crumb a minute, or every 25 m, whichever comes first. */
export const CRUMB_RULE: ThinningRule = {
  minIntervalMs: 60_000,
  minDistanceM: 25,
  worstAccuracyM: 200,
};

/** Battery saver: a quarter of the writes, and the same line to look at. */
export const CRUMB_RULE_SAVER: ThinningRule = {
  minIntervalMs: 240_000,
  minDistanceM: 60,
  worstAccuracyM: 200,
};

export type CrumbDecision = "keep" | "too-soon" | "too-vague" | "out-of-order";

/**
 * Whether a fix is worth storing. Pure, so the rule is testable without GPS.
 *
 * `prev` is the newest crumb already stored on this track.
 */
export function crumbDecision(
  prev: (TimedPoint & { accuracyM?: number | null }) | null,
  next: TimedPoint & { accuracyM?: number | null },
  rule: ThinningRule = CRUMB_RULE,
): CrumbDecision {
  const acc = next.accuracyM;
  if (typeof acc === "number" && Number.isFinite(acc) && acc > rule.worstAccuracyM)
    return "too-vague";
  if (!prev) return "keep";
  if (next.t <= prev.t) return "out-of-order";
  if (next.t - prev.t >= rule.minIntervalMs) return "keep";
  return haversine(prev, next) >= rule.minDistanceM ? "keep" : "too-soon";
}

/* -------------------------------------------------------------------------- */
/* The phone's compass                                                         */
/* -------------------------------------------------------------------------- */

export interface OrientationLike {
  alpha?: number | null;
  absolute?: boolean;
  /** iOS only. Degrees clockwise from north. */
  webkitCompassHeading?: number | null;
  /** iOS only. Negative means the reading cannot be trusted. */
  webkitCompassAccuracy?: number | null;
}

export interface CompassHeading {
  /** Degrees clockwise from whichever north the phone used. */
  headingDeg: number;
  source: "ios" | "absolute";
  /** Degrees, iOS only. Null when the phone did not say. */
  accuracyDeg: number | null;
}

/**
 * Plan §3.3: WHICH north a browser reports is not defined by the standard, and
 * the two platforms get there differently. So this returns the number and where
 * it came from, and never claims it is true north. The screen says so in words
 * and the main arrow is not turned by it.
 */
export const HEADING_NORTH_UNKNOWN =
  "Your phone's compass may be measured from magnetic north, not true north. ICEFALL cannot tell the difference here — it is nothing in Nepal and about 15° in Alaska. The arrow above is a bearing from the map, with north at the top.";

export function headingFromOrientation(
  e: OrientationLike | null | undefined,
): CompassHeading | null {
  if (!e) return null;
  const ios = e.webkitCompassHeading;
  if (typeof ios === "number" && Number.isFinite(ios)) {
    const acc = e.webkitCompassAccuracy;
    // Apple reports a negative accuracy when the compass is not calibrated.
    if (typeof acc === "number" && acc < 0) return null;
    return {
      headingDeg: normaliseDeg(ios),
      source: "ios",
      accuracyDeg: typeof acc === "number" && Number.isFinite(acc) ? acc : null,
    };
  }
  // A relative alpha is a number the phone made up when the page opened.
  if (e.absolute !== true) return null;
  const alpha = e.alpha;
  if (typeof alpha !== "number" || !Number.isFinite(alpha)) return null;
  return { headingDeg: normaliseDeg(360 - alpha), source: "absolute", accuracyDeg: null };
}
