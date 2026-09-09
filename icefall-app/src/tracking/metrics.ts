import { fmtDuration, fmtPace } from "@/lib/format";
import type {
  MetricDef,
  MetricId,
  MetricReading,
  RecorderSnapshot,
  UnavailableReason,
} from "./types";

/**
 * The metric registry.
 *
 * One definition per metric, so a new activity profile is a list of ids rather
 * than new UI. Values are stored in SI-ish base units (metres, seconds, m/s)
 * and formatted only at the edge.
 */

const one = (v: number) => v.toFixed(1);
const int = (v: number) => Math.round(v).toLocaleString("en-GB");

export const METRICS: Record<MetricId, MetricDef> = {
  distance: {
    id: "distance",
    label: "Distance",
    unit: "km",
    format: (m) => (m / 1000).toFixed(2),
    higherIsBetter: true,
  },
  duration: { id: "duration", label: "Time", unit: "", format: (s) => fmtDuration(s) },
  movingTime: { id: "movingTime", label: "Moving", unit: "", format: (s) => fmtDuration(s) },
  pace: { id: "pace", label: "Pace", unit: "/km", format: (s) => fmtPace(s) },
  avgPace: { id: "avgPace", label: "Avg pace", unit: "/km", format: (s) => fmtPace(s) },
  speed: {
    id: "speed",
    label: "Speed",
    unit: "km/h",
    format: (mps) => one(mps * 3.6),
    higherIsBetter: true,
  },
  avgSpeed: {
    id: "avgSpeed",
    label: "Avg speed",
    unit: "km/h",
    format: (mps) => one(mps * 3.6),
    higherIsBetter: true,
  },
  elevationGain: {
    id: "elevationGain",
    label: "Ascent",
    unit: "m",
    format: int,
    higherIsBetter: true,
  },
  elevationLoss: { id: "elevationLoss", label: "Descent", unit: "m", format: int },
  altitude: { id: "altitude", label: "Altitude", unit: "m", format: int },
  maxAltitude: {
    id: "maxAltitude",
    label: "Highest",
    unit: "m",
    format: int,
    higherIsBetter: true,
  },
  verticalRate: {
    id: "verticalRate",
    label: "Vertical rate",
    unit: "m/h",
    format: int,
    higherIsBetter: true,
  },
  grade: { id: "grade", label: "Grade", unit: "%", format: one },
  heartRate: { id: "heartRate", label: "Heart rate", unit: "bpm", format: int },
  avgHeartRate: { id: "avgHeartRate", label: "Avg HR", unit: "bpm", format: int },
  cadence: { id: "cadence", label: "Cadence", unit: "spm", format: int },
  power: { id: "power", label: "Power", unit: "W", format: int, higherIsBetter: true },
  calories: { id: "calories", label: "Calories", unit: "kcal", format: int, higherIsBetter: true },
  temperature: {
    id: "temperature",
    label: "Temp",
    unit: "°C",
    format: (v) => Math.round(v).toString(),
  },
  verticalGain: {
    id: "verticalGain",
    label: "Vertical",
    unit: "m",
    format: int,
    higherIsBetter: true,
  },
  objectiveProgress: {
    id: "objectiveProgress",
    label: "Objective",
    unit: "%",
    format: int,
    higherIsBetter: true,
  },
};

export const UNAVAILABLE_COPY: Record<UnavailableReason, string> = {
  "no-sensor": "No sensor",
  "no-gps": "No GPS",
  indoor: "Indoor",
  "awaiting-signal": "Acquiring",
  "not-connected": "Not connected",
  "needs-permission": "Permission needed",
  "signal-lost": "Signal lost",
};

/**
 * Projects the recorder snapshot onto a metric id, carrying the reason when a
 * value genuinely is not measurable. Screens render the reason instead of a
 * zero — a fabricated number is worse than an honest dash.
 */
export function readMetric(
  id: MetricId,
  s: RecorderSnapshot,
  ctx: { indoor: boolean; objectiveProgressPct?: number | null } = { indoor: false },
): MetricReading {
  const gpsGone: UnavailableReason = ctx.indoor
    ? "indoor"
    : s.capabilities.gps
      ? "awaiting-signal"
      : "no-gps";
  const hasFix = s.points.length > 0;

  const geo = (v: number | null): MetricReading =>
    v === null || (!hasFix && !ctx.indoor) ? { value: null, reason: gpsGone } : { value: v };

  switch (id) {
    case "distance":
      return ctx.indoor ? { value: null, reason: "indoor" } : geo(s.distanceM);
    case "duration":
      return { value: s.elapsedMs / 1000 };
    case "movingTime":
      return { value: s.movingMs / 1000 };
    case "pace":
      return s.paceSecPerKm === null
        ? { value: null, reason: ctx.indoor ? "indoor" : gpsGone }
        : { value: s.paceSecPerKm };
    case "avgPace":
      return s.avgPaceSecPerKm === null
        ? { value: null, reason: ctx.indoor ? "indoor" : gpsGone }
        : { value: s.avgPaceSecPerKm };
    case "speed":
      return s.speedMps === null
        ? { value: null, reason: ctx.indoor ? "indoor" : gpsGone }
        : { value: s.speedMps };
    case "avgSpeed":
      return s.avgSpeedMps === null
        ? { value: null, reason: ctx.indoor ? "indoor" : gpsGone }
        : { value: s.avgSpeedMps };
    case "elevationGain":
    case "verticalGain":
      return ctx.indoor ? { value: null, reason: "indoor" } : geo(s.elevationGainM);
    case "elevationLoss":
      return ctx.indoor ? { value: null, reason: "indoor" } : geo(s.elevationLossM);
    case "altitude":
      return s.altitudeM === null
        ? { value: null, reason: ctx.indoor ? "indoor" : "no-sensor" }
        : { value: s.altitudeM };
    case "maxAltitude":
      return s.maxAltitudeM === null
        ? { value: null, reason: ctx.indoor ? "indoor" : "no-sensor" }
        : { value: s.maxAltitudeM };
    case "verticalRate":
      return s.verticalRateMPerH === null
        ? { value: null, reason: ctx.indoor ? "indoor" : gpsGone }
        : { value: s.verticalRateMPerH };
    case "grade":
      return s.gradePct === null
        ? { value: null, reason: ctx.indoor ? "indoor" : gpsGone }
        : { value: s.gradePct };
    case "heartRate":
      return s.heartRateBpm === null
        ? { value: null, reason: "not-connected" }
        : { value: s.heartRateBpm };
    case "avgHeartRate":
      return s.avgHeartRateBpm === null
        ? { value: null, reason: "not-connected" }
        : { value: s.avgHeartRateBpm };
    case "cadence":
      return s.cadenceSpm === null ? { value: null, reason: "no-sensor" } : { value: s.cadenceSpm };
    case "power":
      return s.powerW === null ? { value: null, reason: "no-sensor" } : { value: s.powerW };
    case "temperature":
      return s.temperatureC === null
        ? { value: null, reason: "no-sensor" }
        : { value: s.temperatureC };
    case "calories":
      return s.calories === null ? { value: null, reason: "no-sensor" } : { value: s.calories };
    case "objectiveProgress":
      return ctx.objectiveProgressPct == null
        ? { value: null, reason: "no-gps" }
        : { value: ctx.objectiveProgressPct };
    default:
      return { value: null, reason: "no-sensor" };
  }
}

/** Renders a reading as display text, never inventing a number. */
export function formatReading(
  id: MetricId,
  r: MetricReading,
): { text: string; unit: string; muted: boolean } {
  const def = METRICS[id];
  if (r.value === null || !Number.isFinite(r.value)) {
    return { text: "—", unit: r.reason ? UNAVAILABLE_COPY[r.reason] : "", muted: true };
  }
  return { text: def.format(r.value), unit: def.unit, muted: false };
}
