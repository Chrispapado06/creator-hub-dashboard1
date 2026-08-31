import { GpsFilter, Rolling, gpsQualityFor, haversine } from "./filters";
import { activityById } from "./activities";
import { energyModelFor, kcalFor, metFor } from "./energy";
import type {
  ActivityTypeId,
  Capabilities,
  GeoSample,
  HeartRateSample,
  LiveSplit,
  RecordedActivity,
  RecorderSnapshot,
  RecorderStatus,
  TrackPointLive,
} from "./types";

/**
 * ActivityRecorder — the tracking engine.
 *
 * Framework-free and sensor-agnostic: it consumes samples pushed in by sources
 * and exposes an immutable snapshot. The React layer only subscribes. That
 * separation is what lets the same engine later run behind a native background
 * service, or replay a Garmin FIT import, without touching a screen.
 */

const SPLIT_DISTANCE_M = 1000;
const AUTO_PAUSE_SPEED_MPS = 0.4;
const AUTO_PAUSE_AFTER_MS = 8_000;
const SIGNAL_LOST_AFTER_MS = 12_000;
/**
 * The longest gap between position samples that may be costed as effort.
 *
 * A backgrounded app or a lost fix can leave minutes between samples. Costing
 * that whole span at the pace of the sample that ENDED it would invent the
 * energy of everything in between — the classic way an activity comes back from
 * a tunnel with a personal best attached.
 */
const MAX_ENERGY_INTERVAL_S = 30;

const VERTICAL_WINDOW_MS = 30 * 60_000;

export interface RecorderOptions {
  autoPause?: boolean;
  /** Used only for the calorie estimate, which the UI labels as an estimate. */
  bodyMassKg?: number;
  simulated?: boolean;
}

/**
 * A crash-safe snapshot of the engine's accumulated state.
 *
 * Persisted continuously while recording so that if the OS suspends or kills the
 * app (backgrounded on a locked phone, low memory, a crash), the activity can be
 * RESUMED with nothing lost — the track, distance, ascent, splits and elapsed
 * time are all here. Only transient smoothing state (the rolling speed window,
 * the GPS filter, the vertical-rate history) is left out; it rebuilds from the
 * next few fixes and never affects the recorded data.
 */
export interface RecorderState {
  version: 1;
  activityTypeId: ActivityTypeId;
  simulated: boolean;
  autoPause: boolean;
  bodyMassKg: number;
  status: RecorderStatus;
  startedAt: number | null;
  elapsedMs: number;
  movingMs: number;
  distanceM: number;
  gainM: number;
  lossM: number;
  altitudeM: number | null;
  maxAltitudeM: number | null;
  minAltitudeM: number | null;
  points: TrackPointLive[];
  splits: LiveSplit[];
  splitAnchor: { distanceM: number; t: number; gain: number; hrSum: number; hrCount: number };
  hrSamples: number[];
  caps: Capabilities;
  /** Wall-clock of the serialisation, for staleness checks on resume. */
  savedAt: number;
}

export class ActivityRecorder {
  readonly activityTypeId: ActivityTypeId;

  private opts: Required<RecorderOptions>;
  private filter: GpsFilter;
  private listeners = new Set<(s: RecorderSnapshot) => void>();
  private ticker: ReturnType<typeof setInterval> | null = null;

  private status: RecorderStatus = "idle";
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private lastTickAt = 0;
  private elapsedMs = 0;
  private movingMs = 0;

  private distanceM = 0;
  private gainM = 0;
  private lossM = 0;
  private altitudeM: number | null = null;
  private maxAltitudeM: number | null = null;
  private minAltitudeM: number | null = null;

  private points: TrackPointLive[] = [];
  /** Kilocalories accumulated interval by interval. See `accrueEnergy`. */
  private kcalAccum = 0;
  /** When energy was last banked, so an interval is never counted twice. */
  private lastEnergyAt: number | null = null;
  private splits: LiveSplit[] = [];
  private splitAnchor = { distanceM: 0, t: 0, gain: 0, hrSum: 0, hrCount: 0 };

  private speed = new Rolling(20_000);
  private hrSamples: number[] = [];
  private heartRateBpm: number | null = null;
  private cadenceSpm: number | null = null;
  private powerW: number | null = null;
  private temperatureC: number | null = null;

  private gainHistory: { t: number; gain: number }[] = [];
  private lastFixAt = 0;
  private lastMovementAt = 0;
  private autoPaused = false;
  private gpsAccuracyM: number | null = null;

  private caps: Capabilities = {
    gps: false,
    barometricAltitude: false,
    heartRate: false,
    cadence: false,
    power: false,
    temperature: false,
  };

  constructor(activityTypeId: ActivityTypeId, opts: RecorderOptions = {}) {
    this.activityTypeId = activityTypeId;
    this.opts = {
      autoPause: opts.autoPause ?? true,
      bodyMassKg: opts.bodyMassKg ?? 72,
      simulated: opts.simulated ?? false,
    };
    const type = activityById(activityTypeId);
    this.filter = new GpsFilter({ maxSpeedMps: type.maxSpeedMps });
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                              */
  /* ---------------------------------------------------------------------- */

  start() {
    if (this.status === "recording") return;
    const now = Date.now();
    if (this.status === "idle") {
      this.startedAt = now;
      this.splitAnchor = { distanceM: 0, t: now, gain: 0, hrSum: 0, hrCount: 0 };
    }
    this.status = "recording";
    this.lastTickAt = now;
    this.lastMovementAt = now;
    this.startTicker();
    this.emit();
  }

  pause() {
    if (this.status !== "recording") return;
    this.accrue();
    this.status = "paused";
    this.emit();
  }

  resume() {
    if (this.status !== "paused") return;
    this.status = "recording";
    this.lastTickAt = Date.now();
    this.lastMovementAt = Date.now();
    this.autoPaused = false;
    this.emit();
  }

  finish(): RecordedActivity {
    this.accrue();
    this.status = "finished";
    this.endedAt = Date.now();
    this.stopTicker();
    this.emit();
    return this.toRecord();
  }

  destroy() {
    this.stopTicker();
    this.listeners.clear();
  }

  /* ---------------------------------------------------------------------- */
  /* Crash-safe persistence — survive a suspend/kill mid-activity            */
  /* ---------------------------------------------------------------------- */

  /** A plain-object snapshot of everything needed to resume with no data loss. */
  serialize(): RecorderState {
    return {
      version: 1,
      activityTypeId: this.activityTypeId,
      simulated: this.opts.simulated,
      autoPause: this.opts.autoPause,
      bodyMassKg: this.opts.bodyMassKg,
      status: this.status,
      startedAt: this.startedAt,
      elapsedMs: this.elapsedMs,
      movingMs: this.movingMs,
      distanceM: this.distanceM,
      gainM: this.gainM,
      lossM: this.lossM,
      altitudeM: this.altitudeM,
      maxAltitudeM: this.maxAltitudeM,
      minAltitudeM: this.minAltitudeM,
      points: this.points.slice(),
      splits: this.splits.slice(),
      splitAnchor: { ...this.splitAnchor },
      hrSamples: this.hrSamples.slice(),
      caps: { ...this.caps },
      savedAt: Date.now(),
    };
  }

  /** Rebuild a recorder from a persisted state. Resumes PAUSED — the athlete
   *  taps to continue, so a crash never silently accrues time nobody moved. */
  static restore(state: RecorderState): ActivityRecorder {
    const r = new ActivityRecorder(state.activityTypeId, {
      autoPause: state.autoPause,
      bodyMassKg: state.bodyMassKg,
      simulated: state.simulated,
    });
    r.status = state.status === "finished" ? "finished" : "paused";
    r.startedAt = state.startedAt;
    r.elapsedMs = state.elapsedMs;
    r.movingMs = state.movingMs;
    r.distanceM = state.distanceM;
    r.gainM = state.gainM;
    r.lossM = state.lossM;
    r.altitudeM = state.altitudeM;
    r.maxAltitudeM = state.maxAltitudeM;
    r.minAltitudeM = state.minAltitudeM;
    r.points = state.points.slice();
    r.splits = state.splits.slice();
    r.splitAnchor = { ...state.splitAnchor };
    r.hrSamples = state.hrSamples.slice();
    r.caps = { ...state.caps };
    r.lastTickAt = Date.now();
    // The rolling speed window, GPS filter and vertical-rate history are
    // transient smoothing state — they rebuild from the next few fixes and
    // never affect the recorded track, so they are intentionally not restored.
    return r;
  }

  /* ---------------------------------------------------------------------- */
  /* Capability declaration — sources tell the recorder what exists           */
  /* ---------------------------------------------------------------------- */

  setCapability<K extends keyof Capabilities>(key: K, value: boolean) {
    if (this.caps[key] === value) return;
    this.caps = { ...this.caps, [key]: value };
    this.emit();
  }

  /* ---------------------------------------------------------------------- */
  /* Sample ingestion                                                        */
  /* ---------------------------------------------------------------------- */

  pushGeo(sample: GeoSample) {
    if (this.status !== "recording" && this.status !== "paused") return;

    this.lastFixAt = sample.t;
    this.gpsAccuracyM = sample.accuracy;
    if (sample.altitude !== null) this.caps.barometricAltitude = true;

    const res = this.filter.push(sample);
    if (!res.accepted) {
      this.emit();
      return;
    }

    if (res.altitudeSmoothed !== null) {
      this.altitudeM = res.altitudeSmoothed;
      this.maxAltitudeM =
        this.maxAltitudeM === null ? this.altitudeM : Math.max(this.maxAltitudeM, this.altitudeM);
      this.minAltitudeM =
        this.minAltitudeM === null ? this.altitudeM : Math.min(this.minAltitudeM, this.altitudeM);
    }

    // A paused recorder still tracks position and altitude, but banks nothing.
    if (this.status === "paused") {
      this.emit();
      return;
    }

    this.gainM += res.gainM;
    this.lossM += res.lossM;
    this.gainHistory.push({ t: sample.t, gain: this.gainM });
    const cutoff = sample.t - VERTICAL_WINDOW_MS;
    while (this.gainHistory.length && this.gainHistory[0].t < cutoff) this.gainHistory.shift();

    if (res.stepM > 0) {
      this.distanceM += res.stepM;
      this.lastMovementAt = sample.t;
      this.autoPaused = false;
    }

    const derived = res.derivedSpeed ?? sample.speed;
    if (derived !== null && Number.isFinite(derived)) this.speed.push(sample.t, derived);

    this.points.push({
      ...sample,
      distanceM: this.distanceM,
      altitudeSmoothed: res.altitudeSmoothed,
      derivedSpeed: derived,
    });

    this.accrueEnergy(sample.t, derived);

    this.maybeCloseSplit(sample.t);
    this.emit();
  }

  pushHeartRate(sample: HeartRateSample) {
    this.caps.heartRate = true;
    this.heartRateBpm = sample.bpm;
    if (this.status === "recording") {
      this.hrSamples.push(sample.bpm);
      this.splitAnchor.hrSum += sample.bpm;
      this.splitAnchor.hrCount++;
    }
    this.emit();
  }

  pushCadence(spm: number | null) {
    this.caps.cadence = spm !== null;
    this.cadenceSpm = spm;
    this.emit();
  }

  pushPower(watts: number | null) {
    this.caps.power = watts !== null;
    this.powerW = watts;
    this.emit();
  }

  pushTemperature(c: number | null) {
    this.caps.temperature = c !== null;
    this.temperatureC = c;
    this.emit();
  }

  setGpsAvailable(available: boolean) {
    this.setCapability("gps", available);
  }

  /**
   * Marks the recording as simulated. Set when the source is chosen, which is
   * after construction — the flag drives the SIMULATED badge and is written
   * into the saved activity, so it must never be stale.
   */
  setSimulated(simulated: boolean) {
    if (this.opts.simulated === simulated) return;
    this.opts = { ...this.opts, simulated };
    this.emit();
  }

  /* ---------------------------------------------------------------------- */
  /* Derived values                                                          */
  /* ---------------------------------------------------------------------- */

  private maybeCloseSplit(t: number) {
    while (this.distanceM - this.splitAnchor.distanceM >= SPLIT_DISTANCE_M) {
      const durationSec = (t - this.splitAnchor.t) / 1000;
      this.splits.push({
        index: this.splits.length + 1,
        distanceM: SPLIT_DISTANCE_M,
        durationSec,
        elevationGainM: Math.round(this.gainM - this.splitAnchor.gain),
        avgHr: this.splitAnchor.hrCount
          ? Math.round(this.splitAnchor.hrSum / this.splitAnchor.hrCount)
          : null,
      });
      this.splitAnchor = {
        distanceM: this.splitAnchor.distanceM + SPLIT_DISTANCE_M,
        t,
        gain: this.gainM,
        hrSum: 0,
        hrCount: 0,
      };
    }
  }

  private get verticalRate(): number | null {
    if (this.gainHistory.length < 2) return null;
    const first = this.gainHistory[0];
    const last = this.gainHistory[this.gainHistory.length - 1];
    const hours = (last.t - first.t) / 3_600_000;
    if (hours < 1 / 120) return null; // need at least ~30 s of history
    return (last.gain - first.gain) / hours;
  }

  private get grade(): number | null {
    const n = this.points.length;
    if (n < 2) return null;
    // Look back roughly 100 m of travel for a stable gradient.
    let i = n - 1;
    while (i > 0 && this.points[n - 1].distanceM - this.points[i].distanceM < 100) i--;
    const a = this.points[i];
    const b = this.points[n - 1];
    const run = b.distanceM - a.distanceM;
    if (run < 20 || a.altitudeSmoothed === null || b.altitudeSmoothed === null) return null;
    return ((b.altitudeSmoothed - a.altitudeSmoothed) / run) * 100;
  }

  /**
   * Kilocalories, integrated over the activity rather than assumed from it.
   *
   * For running and walking families this is `kcalAccum` — the sum of many
   * short intervals, each costed at the MET its own pace and gradient imply.
   * That is what makes the figure move with effort, which is the complaint that
   * prompted it: a fixed MET returned the same number for a flat jog and a hill
   * sprint of equal length.
   *
   * Everything else keeps the fixed MET, because the ACSM equations describe
   * running and walking and applying them to a bike would borrow a published
   * equation's authority for a number it was never fitted to.
   *
   * The fallback also catches indoor work — a treadmill run has no GPS, so
   * nothing accumulates, and its fixed MET is the best honest figure available
   * rather than a null pretending the session did not happen.
   */
  private get calories(): number | null {
    if (this.movingMs <= 0) return null;

    if (this.kcalAccum > 0) return this.kcalAccum;

    const met = activityById(this.activityTypeId).metEstimate;
    const hours = this.movingMs / 3_600_000;
    return met * this.opts.bodyMassKg * hours;
  }

  /**
   * Bank the energy cost of the interval that just elapsed.
   *
   * Called per position sample, so the MET is recomputed against the pace and
   * gradient of that moment instead of an average that would flatten the hills
   * back out again.
   */
  private accrueEnergy(t: number, speedMps: number | null): void {
    const model = energyModelFor(activityById(this.activityTypeId).family);
    const previous = this.lastEnergyAt;
    this.lastEnergyAt = t;

    if (model === "none" || previous === null) return;
    if (this.status !== "recording" || this.autoPaused) return;
    if (speedMps === null) return;

    const seconds = (t - previous) / 1000;
    // A gap is not effort. A backgrounded app or a lost fix can leave minutes
    // between samples, and costing that whole span at the pace of the sample
    // that ended it would invent the energy of everything in between.
    if (seconds <= 0 || seconds > MAX_ENERGY_INTERVAL_S) return;

    // `grade` is a percentage; the equations take a fraction.
    const grade = this.grade;
    const met = metFor(model, speedMps, grade === null ? null : grade / 100);
    if (met === null) return;

    this.kcalAccum += kcalFor(met, this.opts.bodyMassKg, seconds);
  }

  private accrue() {
    const now = Date.now();
    if (this.status === "recording" && this.startedAt) {
      const dt = now - this.lastTickAt;
      this.elapsedMs += dt;
      if (!this.autoPaused) this.movingMs += dt;
    }
    this.lastTickAt = now;
  }

  private startTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      this.accrue();

      // Auto-pause: no qualifying movement for a while.
      if (this.opts.autoPause && this.status === "recording") {
        const still = Date.now() - this.lastMovementAt > AUTO_PAUSE_AFTER_MS;
        const slow = (this.speed.mean ?? 0) < AUTO_PAUSE_SPEED_MPS;
        this.autoPaused = still && slow;
      }

      this.emit();
    }, 1000);
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /* ---------------------------------------------------------------------- */
  /* Snapshot                                                                */
  /* ---------------------------------------------------------------------- */

  snapshot(): RecorderSnapshot {
    const movingSec = this.movingMs / 1000;
    const speedMps = this.speed.mean;
    const avgSpeedMps = movingSec > 0 && this.distanceM > 0 ? this.distanceM / movingSec : null;
    const signalLost =
      this.status === "recording" &&
      this.caps.gps &&
      this.lastFixAt > 0 &&
      Date.now() - this.lastFixAt > SIGNAL_LOST_AFTER_MS;

    return {
      status: this.status,
      activityTypeId: this.activityTypeId,
      simulated: this.opts.simulated,

      startedAt: this.startedAt,
      elapsedMs: this.elapsedMs,
      movingMs: this.movingMs,

      distanceM: this.distanceM,
      elevationGainM: this.gainM,
      elevationLossM: this.lossM,

      altitudeM: this.altitudeM,
      maxAltitudeM: this.maxAltitudeM,
      minAltitudeM: this.minAltitudeM,

      speedMps,
      avgSpeedMps,
      paceSecPerKm: speedMps && speedMps > 0.3 ? 1000 / speedMps : null,
      avgPaceSecPerKm: avgSpeedMps && avgSpeedMps > 0.1 ? 1000 / avgSpeedMps : null,
      verticalRateMPerH: this.verticalRate,
      gradePct: this.grade,

      heartRateBpm: this.heartRateBpm,
      avgHeartRateBpm: this.hrSamples.length
        ? Math.round(this.hrSamples.reduce((a, b) => a + b, 0) / this.hrSamples.length)
        : null,
      cadenceSpm: this.cadenceSpm,
      powerW: this.powerW,
      temperatureC: this.temperatureC,
      calories: this.calories,

      gpsQuality: signalLost ? "none" : gpsQualityFor(this.gpsAccuracyM),
      gpsAccuracyM: this.gpsAccuracyM,
      signalLost,

      autoPaused: this.autoPaused,
      // COPIES, not the live arrays.
      //
      // `points` and `splits` are appended to in place, so handing out the
      // internal reference gave every snapshot the same array identity. Any
      // consumer memoising on it — the live map's route and athlete marker do
      // exactly that — compared identical references and never recomputed, so
      // the map stayed blank for the whole session while the numbers climbed.
      // The snapshot is a value object everywhere it is used; these make it one.
      points: this.points.slice(),
      splits: this.splits.slice(),
      capabilities: this.caps,
    };
  }

  subscribe(fn: (s: RecorderSnapshot) => void) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  /* ---------------------------------------------------------------------- */
  /* Export                                                                  */
  /* ---------------------------------------------------------------------- */

  private toRecord(): RecordedActivity {
    const s = this.snapshot();
    const type = activityById(this.activityTypeId);
    return {
      id: `act-${this.startedAt ?? Date.now()}`,
      activityTypeId: this.activityTypeId,
      title: type.label,
      startedAt: new Date(this.startedAt ?? Date.now()).toISOString(),
      endedAt: new Date(this.endedAt ?? Date.now()).toISOString(),
      simulated: this.opts.simulated,

      durationSec: Math.round(s.elapsedMs / 1000),
      movingSec: Math.round(s.movingMs / 1000),
      distanceM: s.distanceM,
      elevationGainM: s.elevationGainM,
      elevationLossM: s.elevationLossM,
      maxAltitudeM: s.maxAltitudeM,
      minAltitudeM: s.minAltitudeM,
      avgSpeedMps: s.avgSpeedMps,
      avgPaceSecPerKm: s.avgPaceSecPerKm,
      avgHeartRateBpm: s.avgHeartRateBpm,
      maxHeartRateBpm: this.hrSamples.length ? Math.max(...this.hrSamples) : null,
      avgCadenceSpm: s.cadenceSpm,
      calories: s.calories,
      caloriesForKg: s.calories !== null ? this.opts.bodyMassKg : undefined,
      verticalRateMPerH: s.verticalRateMPerH,
      temperatureC: s.temperatureC,

      points: s.points,
      splits: s.splits,
      capabilities: s.capabilities,
    };
  }
}

/** Total straight-line span of a track — used for map framing. */
export function trackBounds(points: { lat: number; lon: number }[]) {
  if (!points.length) return null;
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
  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
    spanM: haversine({ lat: minLat, lon: minLon }, { lat: maxLat, lon: maxLon }),
  };
}
