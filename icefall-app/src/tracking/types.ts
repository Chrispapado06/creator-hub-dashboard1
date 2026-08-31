/**
 * Tracking domain model.
 *
 * Deliberately framework-free: nothing here imports React. The recorder is a
 * plain class so the same logic can later run in a service worker, a native
 * shell, or against a Garmin/Apple Health import without rewriting the UI.
 */

/* -------------------------------------------------------------------------- */
/* Activities                                                                  */
/* -------------------------------------------------------------------------- */

export type ActivityFamily =
  | "running"
  | "hiking"
  | "cycling"
  | "mountaineering"
  | "climbing"
  | "winter"
  | "water"
  | "other";

export type ActivityTypeId =
  // running
  | "outdoor-run"
  | "trail-run"
  | "treadmill-run"
  | "track-run"
  // hiking
  | "hiking"
  | "fast-hiking"
  | "trekking"
  | "backpacking"
  // cycling
  | "road-cycling"
  | "mountain-biking"
  | "gravel-cycling"
  | "indoor-cycling"
  // mountaineering
  | "mountaineering"
  | "alpine-climbing"
  | "scrambling"
  | "ski-mountaineering"
  // climbing
  | "rock-climbing"
  | "indoor-climbing"
  | "bouldering"
  // winter
  | "skiing"
  | "ski-touring"
  | "snowboarding"
  | "snowshoeing"
  // water
  | "kayaking"
  | "paddleboarding"
  | "swimming"
  // other
  | "other";

export interface ActivityType {
  id: ActivityTypeId;
  family: ActivityFamily;
  label: string;
  /** Shown under the label on the selection screen. */
  hint: string;
  /** Indoor activities get no GPS — the UI must say so rather than show zeroes. */
  indoor: boolean;
  /** Sanity ceiling for GPS speed filtering, metres per second. */
  maxSpeedMps: number;
  /** Metric ids in display order. First three are the primary readout. */
  metrics: MetricId[];
  /** Vertical-first activities reshape the live screen around ascent. */
  verticalFocus: boolean;
  /** Rough kcal per kg per hour at moderate effort — used only if no sensor. */
  metEstimate: number;
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                     */
/* -------------------------------------------------------------------------- */

export type MetricId =
  | "distance"
  | "duration"
  | "movingTime"
  | "pace"
  | "avgPace"
  | "speed"
  | "avgSpeed"
  | "elevationGain"
  | "elevationLoss"
  | "altitude"
  | "maxAltitude"
  | "verticalRate"
  | "grade"
  | "heartRate"
  | "avgHeartRate"
  | "cadence"
  | "power"
  | "calories"
  | "temperature"
  | "verticalGain"
  | "objectiveProgress";

/**
 * Why a metric has no value. The UI renders the reason rather than a zero —
 * "do not fabricate measurements" is a product requirement, not a nicety.
 */
export type UnavailableReason =
  | "no-sensor"
  | "no-gps"
  | "indoor"
  | "awaiting-signal"
  | "not-connected"
  | "needs-permission";

export interface MetricReading {
  value: number | null;
  reason?: UnavailableReason;
}

export interface MetricDef {
  id: MetricId;
  label: string;
  /** Short unit shown beside the value. */
  unit: string;
  /** Formats the raw SI-ish value for display. */
  format: (v: number) => string;
  /** Larger is better — used by personal-record detection. */
  higherIsBetter?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Sensor sources                                                              */
/* -------------------------------------------------------------------------- */

export type SourceStatus = "unsupported" | "denied" | "idle" | "connecting" | "live" | "error";

export interface SourceState {
  status: SourceStatus;
  /** Human-readable detail, shown in the permissions sheet. */
  detail?: string;
}

/**
 * A sensor source feeds the recorder. Geolocation and Bluetooth heart rate are
 * implemented against real browser APIs; Apple Health, Garmin and ANT+ adapters
 * implement this same interface when a native shell exists.
 */
export interface SensorSource<T> {
  readonly id: string;
  readonly label: string;
  /** Which metrics this source can supply. */
  readonly provides: MetricId[];
  getState(): SourceState;
  start(onSample: (sample: T) => void, onState: (s: SourceState) => void): Promise<void>;
  stop(): void;
}

/* -------------------------------------------------------------------------- */
/* Samples                                                                     */
/* -------------------------------------------------------------------------- */

export interface GeoSample {
  /** Epoch milliseconds. */
  t: number;
  lat: number;
  lon: number;
  /** Horizontal accuracy in metres — lower is better. */
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  /** Device-reported ground speed, m/s. */
  speed: number | null;
  heading: number | null;
  /** True when produced by the labelled simulator rather than a real fix. */
  simulated?: boolean;
}

export interface HeartRateSample {
  t: number;
  bpm: number;
  /** Some straps report cadence/RR; kept for future use. */
  rr?: number[];
}

/** A GPS fix that survived filtering and contributed to the recorded track. */
export interface TrackPointLive extends GeoSample {
  /** Cumulative distance at this point, metres. */
  distanceM: number;
  /** Smoothed altitude, metres. */
  altitudeSmoothed: number | null;
  /** Instantaneous speed derived from the filtered track, m/s. */
  derivedSpeed: number | null;
}

/* -------------------------------------------------------------------------- */
/* Recorder                                                                    */
/* -------------------------------------------------------------------------- */

export type RecorderStatus = "idle" | "arming" | "recording" | "paused" | "finished";

export type GpsQuality = "excellent" | "good" | "weak" | "none";

export interface LiveSplit {
  index: number;
  distanceM: number;
  durationSec: number;
  elevationGainM: number;
  avgHr: number | null;
}

export interface Capabilities {
  gps: boolean;
  barometricAltitude: boolean;
  heartRate: boolean;
  cadence: boolean;
  power: boolean;
  temperature: boolean;
}

export interface RecorderSnapshot {
  status: RecorderStatus;
  activityTypeId: ActivityTypeId;
  simulated: boolean;

  startedAt: number | null;
  /** Wall-clock elapsed since start, excluding nothing. */
  elapsedMs: number;
  /** Time spent actually moving (auto-pause and manual pause excluded). */
  movingMs: number;

  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;

  altitudeM: number | null;
  maxAltitudeM: number | null;
  minAltitudeM: number | null;

  speedMps: number | null;
  avgSpeedMps: number | null;
  paceSecPerKm: number | null;
  avgPaceSecPerKm: number | null;
  verticalRateMPerH: number | null;
  gradePct: number | null;

  heartRateBpm: number | null;
  avgHeartRateBpm: number | null;
  cadenceSpm: number | null;
  powerW: number | null;
  temperatureC: number | null;
  calories: number | null;

  gpsQuality: GpsQuality;
  gpsAccuracyM: number | null;
  /** Set while a fix has been missing long enough to matter. */
  signalLost: boolean;

  autoPaused: boolean;
  points: TrackPointLive[];
  splits: LiveSplit[];
  capabilities: Capabilities;
}

/** The immutable record written when an activity finishes. */
export interface RecordedActivity {
  id: string;
  activityTypeId: ActivityTypeId;
  title: string;
  startedAt: string;
  endedAt: string;
  simulated: boolean;

  durationSec: number;
  movingSec: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  maxAltitudeM: number | null;
  minAltitudeM: number | null;
  avgSpeedMps: number | null;
  avgPaceSecPerKm: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  avgCadenceSpm: number | null;
  calories: number | null;
  /**
   * The body mass the calorie figure was computed WITH. Stored so the summary
   * can say "estimated for 72 kg" instead of presenting a modelled number as a
   * measurement — the estimate is MET × mass × hours and nothing more.
   */
  caloriesForKg?: number;
  verticalRateMPerH: number | null;
  temperatureC: number | null;

  points: TrackPointLive[];
  splits: LiveSplit[];
  capabilities: Capabilities;

  /* PH-01 — `points_awarded` and `pointsBreakdown` are gone with the points
     system. NOTE `points` above is the GPS TRACK and is untouched. Records
     already on a device still carry the old fields; `loadActivities` strips
     them on read — see `store.ts`. */
  records?: string[];
  achievements?: string[];
  insight?: string;
  location?: string;
}
