import type { WatchProvider } from "@/watch/types";
import type { StartTimeSource } from "./timeOfDay";

/**
 * Tracking domain model.
 *
 * Deliberately framework-free: nothing here imports React. The recorder is a
 * plain class so the same logic can later run in a service worker, a native
 * shell, or against a Garmin/Apple Health import without rewriting the UI.
 */

/* -------------------------------------------------------------------------- */
/* Provenance                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where a `RecordedActivity` actually came from.
 *
 * REQUIRED, not optional — an optional field defaults to `undefined` on every
 * existing record and on every new writer that forgets it, which is the same
 * silence a missing field would be. Without this, an activity imported from a
 * watch account and written with `simulated: false` would be indistinguishable
 * from one ICEFALL actually recorded, and would silently count as verified
 * effort on a leaderboard — see `src/social/leaderboard.ts`.
 *
 * `"icefall"` is the only origin `ActivityRecorder.toRecord()` may ever write.
 * `"imported"` is written only by `watchActivityToRecorded` (`src/watch/map.ts`)
 * and carries exactly what a leaderboard, a records check and an activity
 * screen each need to tell the two apart without re-deriving it:
 *   - `provider` / `providerActivityId` — which watch account, and its own id
 *     for the activity, so a re-import can be de-duped.
 *   - `deviceName` — the watch model as the vendor named it, for on-screen
 *     attribution (required above the fold for Garmin's own brand guidelines,
 *     and just honest for the other three).
 *   - `importedAt` — when ICEFALL brought it across, not when it happened.
 *   - `vendorEntered` — true only when the vendor itself flagged the activity
 *     as manually entered or edited rather than sensor-recorded; null when the
 *     vendor did not say. Never inferred.
 *   - `movingSecMeasured` — false when the vendor gave one duration only, so
 *     `RecordedActivity.movingSec` (which then equals `durationSec`) is never
 *     displayed as if a pause had actually been measured.
 *   - `vendorSport` — the vendor's own word for the sport, kept so an
 *     `"other"` that is really "ICEFALL has no mapping for this yet" can say
 *     so instead of looking like a shrug.
 */
export type ActivityOrigin =
  | { kind: "icefall" }
  /**
   * THE ATHLETE TOLD US. Nothing measured it.
   *
   * Added with the coach's `log_activity` tool: an athlete can now say "I did
   * two hours with 600 up this morning" in the chat and have it recorded. That
   * is real training and it belongs in their feed, their load curve and their
   * preparation — but it is a SENTENCE, not a recording, and calling it
   * `{ kind: "icefall" }` would be the app claiming it measured something
   * nobody measured.
   *
   * The distinction is not cosmetic. `finalizeActivity` bars a manual entry
   * from personal bests and achievements for the same reason it bars an
   * import, `social/leaderboard.ts` counts only `icefall` toward a standing,
   * and `SendToStrava` will not offer to publish one. An athlete choosing a
   * mountain deserves their own records to be things that happened as stated.
   *
   * `source` says who typed it, so the summary can be honest about which. The
   * coach path is the only one today; the field exists because a manual-entry
   * SCREEN is the obvious next caller and it must not inherit the coach's
   * wording.
   */
  | { kind: "manual"; enteredAt: string; source: "coach" | "athlete" }
  | {
      kind: "imported";
      provider: WatchProvider;
      providerActivityId: string;
      deviceName: string | null;
      importedAt: string;
      vendorEntered: boolean | null;
      movingSecMeasured: boolean;
      /**
       * WHAT THE WATCH SERVICE CALLED THIS, VERBATIM.
       *
       * Optional because every record written before this field existed has
       * no answer for it, and inventing one from the ICEFALL type would be
       * backwards — the vendor's word is the evidence, the ICEFALL type is
       * the interpretation. Null when the vendor sent no sport at all.
       *
       * It is kept for one reason: `activityTypeId` may be `"other"` simply
       * because `SPORT_TO_TYPE` has no entry for this value yet, and an
       * athlete looking at a mountaineering day filed as "Other" deserves to
       * see that their watch did say "Mountaineering" and ICEFALL did not
       * know the word. Without this, an unmapped sport is indistinguishable
       * from a genuinely uncategorised one.
       */
      vendorSport?: string | null;
    };

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
  | "needs-permission"
  /**
   * A fix the phone HAD and has since lost — distinct from never having had
   * one. It matters because the app is holding a real position that is no
   * longer where the walker is, and route following is the screen where the
   * difference between "acquiring" and "this dot is stale" decides whether a
   * number on screen is a measurement or a memory.
   */
  | "signal-lost";

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
  /**
   * THE ZONE THE ATHLETE WAS STANDING IN WHEN THIS STARTED.
   *
   * `startedAt` is a UTC instant and therefore says nothing about whether this
   * was an alpine start or an evening session. Reading it with the phone's
   * CURRENT zone is right only until somebody flies somewhere — after which
   * every session they recorded at home shifts, and the sessions they record on
   * the trip shift back when they land. So the offset is captured on the day.
   *
   * Optional because records written before this existed do not have it, and
   * NOTHING backfills them: `exactLocalStart` returns null for those and the
   * coach works from fewer sessions rather than from invented ones. See
   * `tracking/timeOfDay.ts`, which is the only place these are read.
   *
   *  - `startUtcOffsetMin` minutes EAST of UTC at the start instant (+345 in
   *    Kathmandu). Exact, and needs no timezone database to read back.
   *  - `startTimeZone` the IANA name, when the platform would give one. Null is
   *    normal — a watch import carries an offset and no zone.
   *  - `startTimeSource` measured / reported / inferred. An inferred time is one
   *    NOBODY gave, placed by the app, and every surface that shows it says so.
   */
  startUtcOffsetMin?: number | null;
  startTimeZone?: string | null;
  startTimeSource?: StartTimeSource;
  simulated: boolean;
  origin: ActivityOrigin;

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
