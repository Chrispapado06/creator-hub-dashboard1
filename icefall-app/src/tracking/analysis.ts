import { haversine } from "./filters";
import { activityById } from "./activities";
import type { RecordedActivity, TrackPointLive } from "./types";

/**
 * Everything derived from a finished recording: the series the charts draw,
 * the splits, the climbs, the personal bests and the matched routes.
 *
 * All of it is computed from `points`, which the recorder already produced —
 * nothing here re-measures anything, and nothing here invents a metric the
 * track cannot support. Where the data is absent the functions return null or
 * an empty array so the screens can say "—" and explain, rather than render a
 * confident zero.
 *
 * SIMULATED ACTIVITIES ARE NOT EXCLUDED HERE. They are excluded by the callers
 * that must exclude them — personal bests, training load, leaderboards — while
 * a simulated activity's own detail page still gets its charts, badged as
 * simulated. Filtering at the wrong layer is how a demo track quietly becomes
 * a personal record.
 */

/* -------------------------------------------------------------------------- */
/* Series                                                                      */
/* -------------------------------------------------------------------------- */

export interface SeriesPoint {
  /** Metres from the start, so every chart shares one x-axis. */
  distanceM: number;
  /** Seconds from the start. */
  elapsedSec: number;
  value: number;
  lat: number;
  lon: number;
}

export type SeriesKind = "elevation" | "pace" | "heartRate" | "gradient";

export const SERIES_LABEL: Record<SeriesKind, string> = {
  elevation: "Elevation",
  pace: "Pace",
  heartRate: "Heart rate",
  gradient: "Gradient",
};

export const SERIES_UNIT: Record<SeriesKind, string> = {
  elevation: "m",
  pace: "/km",
  heartRate: "bpm",
  gradient: "%",
};

/** Points usable for geometry — a fix with no altitude cannot carry elevation. */
const usable = (p: TrackPointLive) => Number.isFinite(p.lat) && Number.isFinite(p.lon);

export function seriesFor(activity: RecordedActivity, kind: SeriesKind): SeriesPoint[] {
  const pts = activity.points.filter(usable);
  if (pts.length < 2) return [];
  const t0 = pts[0].t;

  const out: SeriesPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let value: number | null = null;

    switch (kind) {
      case "elevation":
        value = p.altitudeSmoothed ?? p.altitude;
        break;
      case "pace": {
        // Seconds per kilometre. Below 0.3 m/s the athlete is effectively
        // stopped and the reciprocal explodes, so it is left out rather than
        // drawn as a spike that dominates the chart.
        const v = p.derivedSpeed ?? p.speed;
        value = v && v > 0.3 ? 1000 / v : null;
        break;
      }
      case "heartRate":
        // The recorder carries HR on the sample when a monitor supplied it.
        value = (p as TrackPointLive & { heartRate?: number }).heartRate ?? null;
        break;
      case "gradient": {
        // Over a window, never point-to-point: consecutive GPS fixes are metres
        // apart and their altitude noise turns into ±40% gradients that mean
        // nothing.
        const back = pts[Math.max(0, i - 5)];
        const run = p.distanceM - back.distanceM;
        const rise = (p.altitudeSmoothed ?? 0) - (back.altitudeSmoothed ?? 0);
        value = run > 20 ? (rise / run) * 100 : null;
        break;
      }
    }

    if (value === null || !Number.isFinite(value)) continue;
    out.push({
      distanceM: p.distanceM,
      elapsedSec: Math.max(0, (p.t - t0) / 1000),
      value,
      lat: p.lat,
      lon: p.lon,
    });
  }
  return out;
}

/** Which series this recording can actually draw. */
export function availableSeries(activity: RecordedActivity): SeriesKind[] {
  return (["elevation", "pace", "heartRate", "gradient"] as SeriesKind[]).filter(
    (k) => seriesFor(activity, k).length >= 2,
  );
}

/** The point nearest a distance — what a chart drag resolves to on the map. */
export function pointAtDistance(
  activity: RecordedActivity,
  distanceM: number,
): TrackPointLive | null {
  const pts = activity.points.filter(usable);
  if (pts.length === 0) return null;
  let best = pts[0];
  let bestGap = Infinity;
  for (const p of pts) {
    const gap = Math.abs(p.distanceM - distanceM);
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Splits — by distance for running, by VERTICAL for the mountain              */
/* -------------------------------------------------------------------------- */

export interface Split {
  label: string;
  /** Metres covered in this split. */
  distanceM: number;
  elevationGainM: number;
  durationSec: number;
  /** Seconds per km across the split, when it moved far enough to mean anything. */
  paceSecPerKm: number | null;
}

export type SplitMode = "1km" | "5km" | "vertical500" | "vertical100";

export const SPLIT_MODE_LABEL: Record<SplitMode, string> = {
  "1km": "1 km",
  "5km": "5 km",
  vertical500: "Elev. 500 m",
  vertical100: "Elev. 100 m",
};

/**
 * The default split for an activity type.
 *
 * A mountaineering day split into kilometres is close to useless — the
 * kilometres are all different lengths in effort and the interesting boundary
 * is vertical, not horizontal. So vertical disciplines default to 500 m of
 * climb per split and running defaults to the kilometre.
 */
export function defaultSplitMode(activity: RecordedActivity): SplitMode {
  const type = activityById(activity.activityTypeId);
  const vertical =
    type.verticalFocus ||
    ["mountaineering", "climbing", "hiking", "winter"].includes(type.family);
  if (!vertical) return "1km";
  // A short day would produce one split at 500 m; 100 m keeps it readable.
  return activity.elevationGainM >= 1200 ? "vertical500" : "vertical100";
}

export function splitsFor(activity: RecordedActivity, mode: SplitMode): Split[] {
  const pts = activity.points.filter(usable);
  if (pts.length < 2) return [];
  const t0 = pts[0].t;

  const byVertical = mode.startsWith("vertical");
  const step = mode === "1km" ? 1000 : mode === "5km" ? 5000 : mode === "vertical500" ? 500 : 100;

  const out: Split[] = [];
  let bucket = 1;
  let startIdx = 0;
  let climb = 0;
  let lastAlt = pts[0].altitudeSmoothed ?? pts[0].altitude ?? 0;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const alt = p.altitudeSmoothed ?? p.altitude ?? lastAlt;
    // Only rises count as gain, and only rises past the noise floor.
    if (alt - lastAlt > 1) climb += alt - lastAlt;
    lastAlt = alt;

    const measure = byVertical ? climb : p.distanceM;
    if (measure >= step * bucket || i === pts.length - 1) {
      const from = pts[startIdx];
      const distanceM = p.distanceM - from.distanceM;
      const durationSec = (p.t - from.t) / 1000;
      const gain = byVertical
        ? Math.min(step, climb - step * (bucket - 1))
        : Math.round(elevationBetween(pts, startIdx, i));

      out.push({
        label: byVertical
          ? `${step * (bucket - 1)}–${step * bucket} m`
          : `${((step * bucket) / 1000).toFixed(0)} km`,
        distanceM: Math.round(distanceM),
        elevationGainM: Math.round(gain),
        durationSec: Math.round(durationSec),
        paceSecPerKm: distanceM > 100 ? Math.round(durationSec / (distanceM / 1000)) : null,
      });

      bucket++;
      startIdx = i;
      if (i === pts.length - 1) break;
    }
  }

  // The first bucket is labelled from zero; the tail is whatever remained.
  if (out.length > 0 && !byVertical) {
    out[out.length - 1] = { ...out[out.length - 1], label: "Final" };
  }
  void t0;
  return out;
}

function elevationBetween(pts: TrackPointLive[], from: number, to: number): number {
  let gain = 0;
  let last = pts[from].altitudeSmoothed ?? pts[from].altitude ?? 0;
  for (let i = from + 1; i <= to; i++) {
    const alt = pts[i].altitudeSmoothed ?? pts[i].altitude ?? last;
    if (alt - last > 1) gain += alt - last;
    last = alt;
  }
  return gain;
}

/* -------------------------------------------------------------------------- */
/* Climbs — the sections that actually happened                                */
/* -------------------------------------------------------------------------- */

export interface ClimbSection {
  startDistanceM: number;
  endDistanceM: number;
  gainM: number;
  durationSec: number;
  /** Average gradient across the climb, per cent. */
  gradientPct: number;
}

/** A rise has to be worth this much to be called a climb rather than a bump. */
const MIN_CLIMB_M = 80;

/**
 * Sustained climbs, detected from the track.
 *
 * Deliberately NOT named "Trailhead → Refuge → Ridge → Summit": ICEFALL does
 * not know where the refuge is, and inventing section names for a track is
 * exactly the fabrication the mockup makes tempting. What it can honestly say
 * is "this is where you climbed 620 m at 14%", which is also the more useful
 * sentence.
 */
export function climbsFor(activity: RecordedActivity): ClimbSection[] {
  const pts = activity.points.filter(usable);
  if (pts.length < 3) return [];

  const out: ClimbSection[] = [];
  let start: TrackPointLive | null = null;
  let lowest = pts[0].altitudeSmoothed ?? 0;
  let peak = lowest;
  let peakPoint = pts[0];

  for (const p of pts) {
    const alt = p.altitudeSmoothed ?? p.altitude ?? lowest;
    if (!start) {
      if (alt > lowest + 5) {
        start = p;
        peak = alt;
        peakPoint = p;
      } else if (alt < lowest) {
        lowest = alt;
      }
      continue;
    }
    if (alt > peak) {
      peak = alt;
      peakPoint = p;
    }
    // A 25 m drop from the high point ends the climb.
    if (alt < peak - 25) {
      const gain = peak - (start.altitudeSmoothed ?? 0);
      if (gain >= MIN_CLIMB_M) {
        const run = peakPoint.distanceM - start.distanceM;
        out.push({
          startDistanceM: Math.round(start.distanceM),
          endDistanceM: Math.round(peakPoint.distanceM),
          gainM: Math.round(gain),
          durationSec: Math.round((peakPoint.t - start.t) / 1000),
          gradientPct: run > 50 ? Math.round((gain / run) * 1000) / 10 : 0,
        });
      }
      start = null;
      lowest = alt;
      peak = alt;
    }
  }

  // A climb still running at the end of the track is a real climb.
  if (start) {
    const gain = peak - (start.altitudeSmoothed ?? 0);
    if (gain >= MIN_CLIMB_M) {
      const run = peakPoint.distanceM - start.distanceM;
      out.push({
        startDistanceM: Math.round(start.distanceM),
        endDistanceM: Math.round(peakPoint.distanceM),
        gainM: Math.round(gain),
        durationSec: Math.round((peakPoint.t - start.t) / 1000),
        gradientPct: run > 50 ? Math.round((gain / run) * 1000) / 10 : 0,
      });
    }
  }
  return out;
}

/** The steepest sustained stretch, for the replay's callout. */
export function steepestPct(activity: RecordedActivity): number | null {
  const grades = seriesFor(activity, "gradient");
  if (grades.length === 0) return null;
  const max = Math.max(...grades.map((g) => g.value));
  return Number.isFinite(max) ? Math.round(max * 10) / 10 : null;
}

/* -------------------------------------------------------------------------- */
/* Personal bests                                                              */
/* -------------------------------------------------------------------------- */

export interface PersonalBest {
  id: string;
  label: string;
  value: string;
  activityId: string;
  achievedAt: string;
}

/**
 * Records, from real recordings only.
 *
 * Simulated activities are filtered here, at the boundary, because a personal
 * best is a claim about the athlete and a simulated track is a claim about
 * nothing. The mountain records come first — they are the ones this app is for.
 */
export function personalBests(activities: RecordedActivity[]): PersonalBest[] {
  const real = activities.filter((a) => !a.simulated);
  if (real.length === 0) return [];

  const best = <T,>(
    id: string,
    label: string,
    pick: (a: RecordedActivity) => number | null,
    format: (v: number, a: RecordedActivity) => string,
  ): PersonalBest | null => {
    let top: { v: number; a: RecordedActivity } | null = null;
    for (const a of real) {
      const v = pick(a);
      if (v === null || !Number.isFinite(v) || v <= 0) continue;
      if (!top || v > top.v) top = { v, a };
    }
    return top
      ? {
          id,
          label,
          value: format(top.v, top.a),
          activityId: top.a.id,
          achievedAt: top.a.startedAt,
        }
      : null;
  };

  return [
    best("altitude", "Highest altitude", (a) => a.maxAltitudeM, (v) => `${Math.round(v).toLocaleString("en-GB")} m`),
    best("gain", "Biggest elevation gain", (a) => a.elevationGainM, (v) => `${Math.round(v).toLocaleString("en-GB")} m`),
    best("day", "Longest mountain day", (a) => a.movingSec, (v) => `${Math.floor(v / 3600)}h ${Math.round((v % 3600) / 60)}m`),
    best("distance", "Longest distance", (a) => a.distanceM, (v) => `${(v / 1000).toFixed(1)} km`),
  ].filter((b): b is PersonalBest => b !== null);
}

/* -------------------------------------------------------------------------- */
/* Matched activities                                                          */
/* -------------------------------------------------------------------------- */

export interface RouteMatch {
  activities: RecordedActivity[];
  /** Fastest of the matched set, by moving time. */
  bestId: string;
}

/** Start and finish must both land within this to count as the same route. */
const MATCH_RADIUS_M = 250;
/** And the distances must agree within this fraction. */
const MATCH_DISTANCE_TOLERANCE = 0.15;

/**
 * Other recordings of the same route.
 *
 * Matched on start point, end point, direction and distance — all four,
 * because any one alone produces false matches: two different routes from the
 * same car park share a start, and an out-and-back matches its own reverse on
 * endpoints alone. A false match is worse than no match, because it produces a
 * "12 minutes faster" that compares two different days out.
 */
export function matchesFor(
  activity: RecordedActivity,
  all: RecordedActivity[],
): RouteMatch | null {
  const pts = activity.points.filter(usable);
  if (pts.length < 2 || activity.simulated) return null;
  const start = pts[0];
  const end = pts[pts.length - 1];

  const matched = all.filter((other) => {
    if (other.simulated || other.id === activity.id) return false;
    const op = other.points.filter(usable);
    if (op.length < 2) return false;
    if (other.activityTypeId !== activity.activityTypeId) return false;

    const dist = Math.abs(other.distanceM - activity.distanceM) / Math.max(activity.distanceM, 1);
    if (dist > MATCH_DISTANCE_TOLERANCE) return false;

    return (
      haversine(start, op[0]) <= MATCH_RADIUS_M &&
      haversine(end, op[op.length - 1]) <= MATCH_RADIUS_M
    );
  });

  if (matched.length === 0) return null;
  const set = [activity, ...matched].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const fastest = set.reduce((f, a) => (a.movingSec < f.movingSec ? a : f), set[0]);
  return { activities: set, bestId: fastest.id };
}

/* -------------------------------------------------------------------------- */
/* Mountain load — a stimulus estimate, and labelled as one                    */
/* -------------------------------------------------------------------------- */

export type LoadLevel = "low" | "moderate" | "high";

export interface LoadFacet {
  label: string;
  level: LoadLevel;
  /** 1–5, for the bars. Derived from the same figure as `level`. */
  score: number;
  /** Why it landed there, in the athlete's terms. */
  why: string;
}

export const LOAD_DISCLAIMER =
  "A training-stimulus estimate read off the recorded activity — distance, climb, time and pack. It is not a physiological measurement, and ICEFALL has never measured your thresholds.";

export function mountainLoad(activity: RecordedActivity, packKg?: number): LoadFacet[] {
  const hours = activity.movingSec / 3600;
  const gain = activity.elevationGainM;
  const km = activity.distanceM / 1000;

  const level = (v: number, mid: number, high: number): LoadLevel =>
    v >= high ? "high" : v >= mid ? "moderate" : "low";

  /*
   * A 1–5 score on the same thresholds, so the bar and the word can never
   * disagree: `high` starts at 4, `moderate` at 3, and anything below the
   * middle threshold scales between 1 and 2 rather than collapsing to a
   * uniform "low" bar that tells the athlete nothing.
   */
  const score = (v: number, mid: number, high: number): number => {
    if (v >= high * 1.5) return 5;
    if (v >= high) return 4;
    if (v >= mid) return 3;
    if (v >= mid / 2) return 2;
    return 1;
  };

  const facets: LoadFacet[] = [
    {
      label: "Vertical endurance",
      level: level(gain, 500, 1000),
      score: score(gain, 500, 1000),
      why: `${Math.round(gain).toLocaleString("en-GB")} m climbed.`,
    },
    {
      label: "Aerobic endurance",
      level: level(hours, 1.5, 3),
      score: score(hours, 1.5, 3),
      why: `${hours.toFixed(1)} hours moving.`,
    },
    {
      label: "Long-distance movement",
      level: level(km, 10, 20),
      score: score(km, 10, 20),
      why: `${km.toFixed(1)} km covered.`,
    },
  ];

  if (packKg && packKg > 0) {
    facets.push({
      label: "Pack endurance",
      level: level(packKg, 8, 14),
      score: score(packKg, 8, 14),
      why: `${packKg} kg carried.`,
    });
  }

  return facets;
}
