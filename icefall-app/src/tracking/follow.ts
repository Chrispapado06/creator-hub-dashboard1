import { haversine } from "./filters";
import { simplifyIndices, type LatLon } from "@/services/trails";
import type { UnavailableReason } from "./types";

/**
 * FOLLOWING A KNOWN LINE. NOT ROUTING, AND NOT TURN-BY-TURN.
 *
 * ── THE DISTINCTION, BECAUSE IT DECIDES WHAT THIS FILE MAY SAY ──────────────
 * Routing is "find me a path from here to there". It needs a routing service,
 * this app has none, and nothing here invents one: no line is ever drawn
 * between where the walker is and where the route is.
 *
 * Turn-by-turn is "turn left at the junction". OpenStreetMap route relations
 * hold an ordered set of coordinates and nothing else — no junction names, no
 * manoeuvres, no instructions. There is nothing here to turn into a spoken
 * direction, so this file produces none, and every label it exports says
 * "point" rather than "turn".
 *
 * What is left is what is genuinely measurable against a line the app already
 * holds, and it is useful: where you are relative to it, how far off it you
 * are, which way the next mapped point lies, and how much line is left. Every
 * figure below is a measurement between two coordinates. Nothing is modelled,
 * so nothing needs the "estimated" label the app puts on its DIN 33466 times.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 * No ETA. An arrival time needs an assumed pace, which would make it a model,
 * and a model of when somebody gets off a mountain is the last figure this app
 * should invent. `ActivitySummary` already shows what a modelled time looks
 * like when there is a published standard behind it; there is none here.
 *
 * No "you have arrived". Reaching the end of a mapped line is not the same as
 * finishing a walk, and the line's end is wherever the OSM relation stops.
 * `atEnd` says the walker is within a stated distance of the line's last point
 * and the UI words it exactly that way.
 */

/* -------------------------------------------------------------------------- */
/* Constants, each with the reason it is the number it is                      */
/* -------------------------------------------------------------------------- */

/**
 * How far off the line counts as off the line, before GPS accuracy is added.
 *
 * A hiking path in OSM is surveyed to somewhere around 5–15 m, and a walker
 * legitimately steps off the mapped centreline to pass, to filter round a bog,
 * or because the path on the ground has moved. Fifty metres is comfortably
 * outside all of that and comfortably inside "you are on a different path".
 */
export const OFF_ROUTE_M = 50;

/**
 * Simplification tolerance used to pick the SHAPE points — the points offered
 * as "the next point on the line".
 *
 * Raw OSM nodes are frequently five to twenty metres apart, so "the next point"
 * taken literally would be a target a walker passes every four seconds with a
 * bearing that swings wildly and says nothing. The points RDP keeps at this
 * tolerance are the ones that carry the route's shape: the places the line
 * actually changes direction by more than about forty metres of deviation.
 * Those are real points on the real line — nothing is invented — and they are
 * the ones worth pointing at. The same 0.0004° the map draws with.
 */
export const SHAPE_TOLERANCE = 0.0004;

/**
 * How far along the line the walker must have moved before this file will say
 * which way they are going.
 *
 * Direction is MEASURED, never assumed: two projections of the athlete's own
 * track onto the line, far enough apart that GPS noise cannot account for the
 * difference. Below this, direction is `null` and the UI shows the distance to
 * BOTH ends rather than picking one — which is the honest answer to "which way
 * is this person walking?" for the first minute of a walk.
 */
export const DIRECTION_MIN_M = 40;

/**
 * A change in along-line position larger than this between two nearby fixes is
 * not movement — it is the projection jumping to a different part of the route.
 *
 * Circuits and out-and-backs pass close to themselves. On the Tour du Mont
 * Blanc the line returns to within a few hundred metres of its own start, so a
 * fix near the join can project 160 km from where the previous one did. Nobody
 * walked that in forty metres, so it is discarded rather than read as a
 * direction.
 */
const DIRECTION_MAX_JUMP_M = 3_000;

/** Within this of the line's last point, the walker is at the line's end. */
export const AT_END_M = 60;

/**
 * How far away the next point has to be before a bearing to it means anything.
 *
 * ⚠ MEASURED 2026-09-09, standing on the last point of a 5.16 km trail: the
 * next shape point ahead WAS the point underfoot, so the screen read "NEXT
 * POINT ON THE LINE — 0 m, 0° true". The distance was honest and the bearing
 * was not: the angle between a point and itself is zero by convention, not by
 * measurement, and it was being printed in the same type as a real one.
 *
 * The floor is the fix's own accuracy where that is the larger, on the same
 * reasoning `GpsFilter` uses for its noise floor: a bearing across less ground
 * than the fix can resolve is a bearing to the error, not to the point.
 */
const NEXT_POINT_MIN_M = 5;

/* -------------------------------------------------------------------------- */
/* The route, indexed once                                                     */
/* -------------------------------------------------------------------------- */

interface FollowPath {
  points: LatLon[];
  /** Cumulative metres from this path's first point, one per point. */
  cum: number[];
  /** Where this path begins along the whole route, metres. */
  offsetM: number;
  lengthM: number;
  /** Indices into `points` that carry the route's shape. See SHAPE_TOLERANCE. */
  shape: number[];
}

export interface FollowRoute {
  paths: FollowPath[];
  /** Sum of the pieces. NOT the distance walked between them — see `pieces`. */
  totalM: number;
  /**
   * How many separate pieces OSM holds this route in.
   *
   * More than one is normal and is not damage: `joinWays` joins only where two
   * ways share a node, because that is the only place OSM says they meet. The
   * Snowman Trek is 63 pieces. Where they do not meet, the ground between them
   * is not mapped, this file measures nothing across it, and the UI says the
   * route is held in pieces rather than quietly summing over the gaps.
   */
  pieces: number;
  /**
   * True when the route returns to where it started — one piece whose first and
   * last points are the same place.
   *
   * MEASURED ON THE TOUR DU MONT BLANC, 2026-09-09, standing on the last point
   * of the line: the projection lands at 0 m along, because the nearest segment
   * really is the first one. So "to the start" reads 0 m and "to the end" reads
   * 166 km, both correct and, side by side, baffling — until the page says the
   * two ends are one place, which is the whole meaning of the word circuit.
   *
   * The app CANNOT tell arriving from setting off here, and does not try:
   * position alone does not carry that difference on a closed loop, and the
   * distance walked is a different claim from the distance remaining.
   */
  closed: boolean;
}

/** Two points within this of each other are, for a route, the same place. */
const CLOSED_LOOP_M = 60;

/** Indexes the paths for following. Returns null when there is no line yet. */
export function buildFollowRoute(paths: LatLon[][]): FollowRoute | null {
  const usable = paths.filter((p) => p.length > 1);
  if (usable.length === 0) return null;

  let offsetM = 0;
  const built: FollowPath[] = usable.map((points) => {
    const cum = new Array<number>(points.length);
    cum[0] = 0;
    for (let i = 1; i < points.length; i++) {
      cum[i] = cum[i - 1] + haversine(points[i - 1], points[i]);
    }
    const lengthM = cum[cum.length - 1];
    const path: FollowPath = {
      points,
      cum,
      offsetM,
      lengthM,
      shape: simplifyIndices(points, SHAPE_TOLERANCE),
    };
    offsetM += lengthM;
    return path;
  });

  const only = built.length === 1 ? built[0].points : null;
  const closed =
    only !== null && haversine(only[0], only[only.length - 1]) <= CLOSED_LOOP_M;

  return { paths: built, totalM: offsetM, pieces: built.length, closed };
}

/* -------------------------------------------------------------------------- */
/* Projection                                                                  */
/* -------------------------------------------------------------------------- */

export interface Projection {
  pathIndex: number;
  /** Index of the segment's FIRST point within that path. */
  segIndex: number;
  /** Perpendicular distance from the fix to the line, metres. Measured. */
  offM: number;
  /** Distance from the start of the whole route to the projected point. */
  alongM: number;
  /** The point on the line itself — not the walker's position. */
  at: LatLon;
}

/**
 * The nearest point on the route to a position, found by testing every segment.
 *
 * Deliberately exhaustive rather than seeded from the last projection. A search
 * that only looks near where the walker was last cannot find them again once
 * they have been away — carried in a car to a different trailhead, or off the
 * line for an hour — and "cannot find you" reported as "you are on route" is
 * exactly the failure this screen must not have.
 *
 * The cost is one pass over the line's points per fix. Measured 2026-09-09 on
 * a line the size of the Tour du Mont Blanc's own geometry — 17,001 points,
 * which is what `trailPaths` returns for it — a projection takes 0.25 ms and a
 * whole reading, which takes two of them, 0.14 ms. The screen asks for one a
 * second.
 */
export function project(route: FollowRoute, p: LatLon): Projection {
  let best: Projection | null = null;
  let bestD2 = Infinity;

  for (let pi = 0; pi < route.paths.length; pi++) {
    const path = route.paths[pi];
    const pts = path.points;
    /* Longitude degrees shrink with latitude, so the flat frame below is scaled
       by the cosine at the fix. Over the tens of metres this measures, a plane
       and a sphere differ by far less than any GPS fix can resolve. */
    const k = Math.cos((p.lat * Math.PI) / 180);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ax = (a.lon - p.lon) * k;
      const ay = a.lat - p.lat;
      const bx = (b.lon - p.lon) * k;
      const by = b.lat - p.lat;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const d2 = cx * cx + cy * cy;
      if (best !== null && d2 >= bestD2) continue;
      bestD2 = d2;
      const at = { lat: p.lat + cy, lon: p.lon + cx / (k === 0 ? 1 : k) };
      best = {
        pathIndex: pi,
        segIndex: i,
        offM: haversine(p, at),
        alongM: path.offsetM + path.cum[i] + t * (path.cum[i + 1] - path.cum[i]),
        at,
      };
    }
  }

  // `buildFollowRoute` guarantees at least one path of at least two points, so
  // at least one segment was tested and `best` is set.
  return best as Projection;
}

/* -------------------------------------------------------------------------- */
/* The reading                                                                 */
/* -------------------------------------------------------------------------- */

export interface NextPoint {
  /** Straight-line distance from the walker to that point, metres. Measured. */
  distanceM: number;
  /** TRUE bearing, degrees. Not magnetic — see `bearing`. */
  bearingDeg: number;
  at: LatLon;
}

export interface FollowReading {
  /** Perpendicular distance to the mapped line, metres. */
  offM: number;
  /**
   * True when `offM` is further from the line than the fix's own accuracy can
   * account for. A 60 m reading from a fix accurate to ±80 m is not evidence of
   * anything, and this app does not raise an alarm on it.
   */
  offRoute: boolean;
  /** The accuracy that judgement was made with, metres, or null if unreported. */
  accuracyM: number | null;
  /** Distance along the mapped line from its first point to the walker. */
  alongM: number;
  /** Line remaining towards its last point. */
  toEndM: number;
  /** Line back towards its first point. */
  toStartM: number;
  /** Measured from the walker's own movement along the line. Null until known. */
  direction: "forwards" | "backwards" | null;
  /** `toEndM` or `toStartM` — only once `direction` has been measured. */
  remainingM: number | null;
  /** The next shape point ahead, in the measured direction. */
  next: NextPoint | null;
  /** Within `AT_END_M` of whichever end the walker is heading for. */
  atEnd: boolean;
  /** The point on the line nearest the walker — where to go back to. */
  nearest: NextPoint;
  pieces: number;
  totalM: number;
  /** The line returns to its own start — see `FollowRoute.closed`. */
  closed: boolean;
}

/**
 * A reading, or the reason there is not one.
 *
 * The same shape `readMetric` uses, for the same reason: a position the phone
 * has not fixed is an ABSENCE WITH A REASON, and the UI renders the reason. The
 * alternative — the last known dot left on the map while the walker keeps
 * moving — is a screen that says "you are here" about a place the walker left
 * ten minutes ago, and on a mountain that is the failure that matters.
 */
/**
 * Why there is no reading — the sensor reasons, plus the two that are about the
 * LINE rather than the phone.
 *
 * ⚠ THE REASON HAS TO BE THE TRUE ONE. Caught driving the app on 9 Sep 2026,
 * opening the Snowman Trek: Overpass had not answered yet, so there was no
 * route to measure against, and this file reported `awaiting-signal` — "waiting
 * for the first fix" — over a phone with an excellent fix. It named the wrong
 * missing thing, and a walker would have gone looking at the sky.
 *
 * The two line states are kept apart for the same reason `gpxBlocked` keeps
 * them apart: "still coming" and "not coming" are not the same news, and a
 * route whose geometry has genuinely failed must not sit under a permanent,
 * false "loading".
 */
export type FollowUnavailable = UnavailableReason | "line-loading" | "line-failed";

export type FollowReadout = { value: FollowReading } | { value: null; reason: FollowUnavailable };

export interface FollowInput {
  /** The recorded track so far, oldest first. The recorder's own points. */
  track: readonly { lat: number; lon: number; accuracy?: number | null }[];
  /** Horizontal accuracy of the newest fix, metres. */
  accuracyM: number | null;
  /** True when the recorder has not had a fix for long enough to matter. */
  signalLost: boolean;
  /** The recorder's `capabilities.gps`. */
  gpsAvailable: boolean;
  /** True when the browser refused the location permission. */
  permissionDenied: boolean;
  /** True when the geometry request came back with nothing. See the note on
   *  `FollowUnavailable` — "still coming" and "not coming" are different news. */
  lineFailed?: boolean;
}

export function followReadout(route: FollowRoute | null, input: FollowInput): FollowReadout {
  if (input.permissionDenied) return { value: null, reason: "needs-permission" };
  if (!input.gpsAvailable) return { value: null, reason: "no-gps" };
  /* STALE IS AN ABSENCE, NOT A VALUE. The last fix is still in `track` and
     still perfectly good history; what it is not is where the walker is now. */
  if (input.signalLost) return { value: null, reason: "signal-lost" };
  /* THE LINE BEFORE THE FIX. A missing route is a different absence from a
     missing position, and reporting one as the other sends a walker looking for
     the wrong problem. */
  if (route === null) {
    return { value: null, reason: input.lineFailed ? "line-failed" : "line-loading" };
  }
  if (input.track.length === 0) return { value: null, reason: "awaiting-signal" };

  const here = input.track[input.track.length - 1];
  const now = project(route, here);

  /* ---- Direction, measured from the athlete's own track ------------------ */
  let direction: FollowReading["direction"] = null;
  const earlier = trackPointBack(input.track, DIRECTION_MIN_M);
  if (earlier) {
    const then = project(route, earlier);
    const delta = now.alongM - then.alongM;
    if (Math.abs(delta) >= DIRECTION_MIN_M / 2 && Math.abs(delta) <= DIRECTION_MAX_JUMP_M) {
      direction = delta > 0 ? "forwards" : "backwards";
    }
  }

  const toEndM = Math.max(0, route.totalM - now.alongM);
  const toStartM = Math.max(0, now.alongM);
  const remainingM =
    direction === "forwards" ? toEndM : direction === "backwards" ? toStartM : null;

  const accuracyM =
    input.accuracyM !== null && Number.isFinite(input.accuracyM) ? input.accuracyM : null;

  const nextAt = nextShapePoint(route, now, direction ?? "forwards");
  const nextDistanceM = nextAt === null ? 0 : haversine(here, nextAt);
  /* NO POINT, rather than a point you are standing on. See NEXT_POINT_MIN_M. */
  const next =
    nextAt !== null && nextDistanceM >= Math.max(NEXT_POINT_MIN_M, (accuracyM ?? 0) / 2)
      ? { distanceM: nextDistanceM, bearingDeg: bearing(here, nextAt), at: nextAt }
      : null;

  return {
    value: {
      offM: now.offM,
      offRoute: now.offM > OFF_ROUTE_M + Math.max(0, accuracyM ?? 0),
      accuracyM,
      alongM: now.alongM,
      toEndM,
      toStartM,
      direction,
      remainingM,
      next,
      atEnd: remainingM !== null && remainingM <= AT_END_M,
      nearest: {
        distanceM: now.offM,
        bearingDeg: bearing(here, now.at),
        at: now.at,
      },
      pieces: route.pieces,
      totalM: route.totalM,
      closed: route.closed,
    },
  };
}

/**
 * The most recent track point at least `minM` of walked ground behind the
 * newest one, or null when the walk is younger than that.
 *
 * Walked ground, not straight-line distance from the end: somebody who has gone
 * out and come back is metres from where they were an hour ago, and taking the
 * straight line would call an hour of walking "no movement".
 */
function trackPointBack(
  track: FollowInput["track"],
  minM: number,
): { lat: number; lon: number } | null {
  let walked = 0;
  /* HOW FAR BACK IT IS WORTH LOOKING. A walker standing still never
     accumulates the forty metres, so without a bound this rescans the whole
     track on every reading — and on a ten-hour day out the track is tens of
     thousands of fixes. Somebody who has not covered forty metres in three
     thousand fixes is not walking in a direction, which is the answer this
     function would have arrived at anyway after the long way round. */
  const floor = Math.max(0, track.length - 3_000);
  for (let i = track.length - 1; i > floor; i--) {
    walked += haversine(track[i], track[i - 1]);
    if (walked >= minM) return track[i - 1];
  }
  return null;
}

/**
 * The next shape point along the line from the projection, in a direction.
 *
 * Crosses into the next piece where the route is held in pieces, because the
 * shape points are the route's and not a single path's. Nothing is measured
 * across the gap — see `FollowRoute.pieces` — but the point beyond it is still
 * a real point on the real route, and pointing at it is a true statement about
 * where the mapped line resumes.
 */
function nextShapePoint(
  route: FollowRoute,
  from: Projection,
  direction: "forwards" | "backwards",
): LatLon | null {
  const step = direction === "forwards" ? 1 : -1;
  for (
    let pi = from.pathIndex;
    pi >= 0 && pi < route.paths.length;
    pi += step
  ) {
    const path = route.paths[pi];
    const shape = path.shape;
    if (pi === from.pathIndex) {
      if (direction === "forwards") {
        const hit = shape.find((i) => i > from.segIndex);
        if (hit !== undefined) return path.points[hit];
      } else {
        for (let k = shape.length - 1; k >= 0; k--) {
          if (shape[k] <= from.segIndex) return path.points[shape[k]];
        }
      }
      continue;
    }
    if (shape.length > 0) {
      return path.points[direction === "forwards" ? shape[0] : shape[shape.length - 1]];
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Bearings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Initial great-circle bearing, degrees clockwise from TRUE north.
 *
 * TRUE, not magnetic, and the UI says so beside every figure. Magnetic
 * declination is a published correction that varies by place and by year; this
 * app does not carry the model, so it does not apply one and does not let a
 * walker assume it did. On a compass, the number below needs that correction.
 */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** The 16-point compass name for a true bearing. */
export const compassPoint = (deg: number) => POINTS[Math.round((deg % 360) / 22.5) % 16];

/* -------------------------------------------------------------------------- */
/* What this is bound to                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The route an activity is following.
 *
 * Carried in the tracker's URL and persisted with the in-progress activity, so
 * an app killed on a locked phone resumes still following the same line rather
 * than as a plain recording — the geometry is re-fetched from the one id, the
 * same way every other screen gets it.
 */
export interface BoundRoute {
  /** OSM relation id. The only geometry source this app has. */
  osmId: number;
  /** The route's name as the page that started the walk shows it. */
  name: string;
  /*
   * NO LINK BACK TO THE PAGE THIS STARTED FROM, and the absence is deliberate.
   *
   * It was carried here for one build, and nothing could use it: leaving
   * `/activity/live` unmounts the recorder and stops the location watch, so a
   * tap on "back to the route" would put a hole in the track of somebody who
   * thought they were still being recorded. Until this app records in the
   * background, the only ways off this screen are Finish and Pause, and a field
   * no screen may act on is one more thing to keep true for nothing.
   */
}

export function encodeBoundRoute(r: BoundRoute): string {
  return new URLSearchParams({ route: String(r.osmId), routeName: r.name }).toString();
}

export function decodeBoundRoute(params: URLSearchParams): BoundRoute | null {
  const osmId = Number(params.get("route"));
  if (!Number.isFinite(osmId) || osmId <= 0) return null;
  return { osmId, name: params.get("routeName") ?? `OpenStreetMap relation ${osmId}` };
}

/**
 * Where "Start Route" goes: the tracker, armed, bound to this line.
 *
 * `go=1` is the existing "start means start" flag — the walker has already
 * pressed a button that says Start Route, and asking again behind a permissions
 * explainer is the two-start-buttons problem `LiveTracker` was fixed for.
 */
export function followHref(activityTypeId: string, route: BoundRoute): string {
  return `/activity/live/${activityTypeId}?go=1&${encodeBoundRoute(route)}`;
}

/**
 * WHY THERE IS NOTHING TO FOLLOW, OR NULL WHEN THERE IS.
 *
 * A Start control that cannot start is the dead control this app keeps being
 * warned about, and the two ways to have no line are not the same news: it is
 * still coming, or it is not coming. Worded here, once, so the trek page and
 * the trail page cannot give a walker two different accounts of the same
 * silence — which is exactly what happened to the GPX button's copy before
 * `gpxBlocked` existed.
 */
export const FOLLOW_STILL_LOADING = "The line is still loading";
export const FOLLOW_NEVER_ARRIVED =
  "OpenStreetMap didn't send the line, so there is nothing to follow. This is a connection problem.";

export function followBlocked(points: number, waiting: boolean): string | null {
  if (points > 1) return null;
  return waiting ? FOLLOW_STILL_LOADING : FOLLOW_NEVER_ARRIVED;
}

/* -------------------------------------------------------------------------- */
/* The limits, worded once                                                     */
/* -------------------------------------------------------------------------- */

/**
 * WHAT THIS FEATURE IS NOT, IN ONE PLACE.
 *
 * Three screens offer it — a trek, a trail, and the tracker itself — and the
 * GPX button's history in this codebase is the argument for a single constant:
 * the same sentence was written three times, corrected once, and the other two
 * went on being wrong. A limit that is wrong on one screen is worse than no
 * limit at all, because the walker who read the good one thinks they have been
 * told everything.
 */
export const FOLLOW_ONE_LINE =
  "Follows the mapped line and shows where you are against it. No turn instructions, and not a safety device.";

export const FOLLOW_LIMITS = [
  "It follows a line. OpenStreetMap route data holds coordinates and no instructions, so there are no turns to call and ICEFALL does not invent any.",
  "The line is OpenStreetMap data, surveyed by volunteers. It can be wrong, incomplete or years out of date, and it says nothing about whether the route is open or passable today.",
  "GPS drifts, and it fails outright under cliffs, in gorges and in trees. Phone batteries die, and cold flattens them faster.",
  "It is not a substitute for a map and a compass, and it is not a substitute for a guide on glaciated, technical or high ground.",
];
