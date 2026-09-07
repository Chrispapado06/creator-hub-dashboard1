import { activityById } from "./activities";
import type { RecordedActivity, TrackPointLive } from "./types";
import type { Activity, SportMode, TrackPoint } from "@/types";
import { WATCH_PROVIDER_NAME } from "@/watch/types";

/** The provenance line for an imported activity's `Activity.location`. */
function importedLabel(origin: Extract<RecordedActivity["origin"], { kind: "imported" }>): string {
  return origin.deviceName
    ? `Imported from ${WATCH_PROVIDER_NAME[origin.provider]} ${origin.deviceName}`
    : `Imported from ${WATCH_PROVIDER_NAME[origin.provider]}`;
}

/**
 * Bridges a recorded activity into the app's display `Activity` shape, so the
 * history list, summary screen, route map and elevation profile all work on
 * real recordings without a second set of components.
 *
 * Lat/lon are projected into the normalised 0–1 space `RouteMap` already uses.
 */

const FAMILY_TO_MODE: Record<string, SportMode> = {
  running: "running",
  hiking: "hiking",
  cycling: "cycling",
  mountaineering: "mountaineering",
  climbing: "climbing",
  winter: "ski-touring",
  water: "hiking",
  other: "hiking",
};

/** Projects the track into a square 0–1 box, preserving aspect ratio. */
export function projectTrack(points: TrackPointLive[]): TrackPoint[] {
  if (!points.length) return [];

  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }

  // Longitude degrees are shorter than latitude degrees away from the equator.
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonScale = Math.cos(midLat) || 1;

  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLon = Math.max((maxLon - minLon) * lonScale, 1e-6);
  const span = Math.max(spanLat, spanLon);

  // Centre the smaller axis so the route isn't stretched.
  const padLat = (span - spanLat) / 2;
  const padLon = (span - spanLon) / 2;

  const t0 = points[0].t;

  return points.map((p) => ({
    x: (padLon + (p.lon - minLon) * lonScale) / span,
    // Screen y grows downward; north should be up.
    y: 1 - (padLat + (p.lat - minLat)) / span,
    ele: Math.round(p.altitudeSmoothed ?? p.altitude ?? 0),
    t: Math.round((p.t - t0) / 1000),
    hr: undefined,
  }));
}

export function recordedToActivity(r: RecordedActivity): Activity {
  const type = activityById(r.activityTypeId);
  const track = projectTrack(r.points);

  return {
    id: r.id,
    // Carried, not dropped: every total, record and load figure downstream
    // needs to be able to exclude a simulated session.
    simulated: r.simulated,
    // Carried the same way, and for the same reason — a ranking or a records
    // check must be able to exclude an imported activity too, and it must read
    // this, never the display type's `location` string, to decide that.
    origin: r.origin,
    mode: FAMILY_TO_MODE[type.family] ?? "hiking",
    title: r.title,
    location:
      r.location ??
      (r.simulated
        ? "Simulated route"
        : r.origin.kind === "imported"
          ? importedLabel(r.origin)
          : "Recorded activity"),
    startedAt: r.startedAt,
    durationSec: r.durationSec,
    distanceKm: r.distanceM / 1000,
    elevationGainM: Math.round(r.elevationGainM),
    elevationLossM: Math.round(r.elevationLossM),
    // Left undefined rather than 0 — the summary renders a dash instead of
    //  claiming a 0:00 pace that was never measured.
    avgPaceSecPerKm: r.avgPaceSecPerKm != null ? Math.round(r.avgPaceSecPerKm) : undefined,
    avgHr: r.avgHeartRateBpm ?? undefined,
    maxHr: r.maxHeartRateBpm ?? undefined,
    calories: r.calories ? Math.round(r.calories) : undefined,
    // Only present when a sensor actually reported it — and only the reading
    // that sensor actually took. Wind is left off entirely (no phone measures
    // it, and the `windKph: 0` that used to sit here was printed as "0 km/h"),
    // and the icon says the figure came off the device rather than drawing a
    // cloud nobody looked at.
    conditions:
      r.temperatureC != null
        ? {
            tempC: Math.round(r.temperatureC),
            summary: "Recorded on device",
            icon: "device" as const,
          }
        : undefined,
    track,
    splits: r.splits.map((s) => ({
      km: s.index,
      durationSec: Math.round(s.durationSec),
      elevationGainM: s.elevationGainM,
      hr: s.avgHr ?? undefined,
    })),
    insight: r.insight,
  };
}
