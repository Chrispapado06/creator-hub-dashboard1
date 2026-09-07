import { GpsFilter, Rolling, gpsQualityFor, haversine, type FilterResult } from "./filters";
import {
  MIN_DISPLAY_AVG_SPEED_MPS,
  MIN_DISPLAY_SPEED_MPS,
  SPEED_WINDOW_MS,
  movementConfigFor,
  type MovementConfig,
} from "./config";
import { MovementMachine, trustedDeviceSpeed, type MovementUpdate } from "./movement";
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
  /** Handed-out copies of the two growing arrays. See `snapshot`. */
  private pointsView: TrackPointLive[] | null = null;
  private splitsView: LiveSplit[] | null = null;
  /** Kilocalories accumulated interval by interval. See `accrueEnergy`. */
  private kcalAccum = 0;
  /** When energy was last banked, so an interval is never counted twice. */
  private lastEnergyAt: number | null = null;
  private splits: LiveSplit[] = [];
  private splitAnchor = { distanceM: 0, t: 0, gain: 0, hrSum: 0, hrCount: 0 };

  private speed = new Rolling(SPEED_WINDOW_MS);
  /** When a speed was last pushed into the window above. See `snapshot`. */
  private lastSpeedAt = 0;
  private hrSamples: number[] = [];
  private heartRateBpm: number | null = null;
  private cadenceSpm: number | null = null;
  private powerW: number | null = null;
  private temperatureC: number | null = null;

  private gainHistory: { t: number; gain: number }[] = [];
  private lastFixAt = 0;
  private gpsAccuracyM: number | null = null;

  /**
   * Whether the athlete is moving — decided by evidence, not by one boolean.
   *
   * This replaces `still && slow`, recomputed from scratch every second against
   * the SAME threshold in both directions, which is what made the state rattle
   * at every traffic light and gear stop. The machine holds four states with
   * two candidate stages between the two real ones, and needs different
   * thresholds, different dwells and different KINDS of evidence to enter a
   * stop than to leave one. It is pure: no timers, no clock, no side effects.
   */
  private movement: MovementMachine;
  /**
   * The same thresholds the machine reasons with, so the number on the SCREEN
   * and the number the machine votes on come from one rule. See
   * `trustedDeviceSpeed` — they used to disagree.
   */
  private movementCfg: MovementConfig;
  /** Timestamp of the previous fix handed to the machine, for its `dtSec`. */
  private prevSampleT: number | null = null;
  /** Newest position seen, so a stop can be anchored where it happened. */
  private lastFixPos: { lat: number; lon: number } | null = null;
  /**
   * Where the athlete was when the current auto-pause was declared.
   *
   * The machine reasons in distances and never sees a position, so it cannot
   * work out that a phone drifting on a rock keeps returning to the same spot.
   * This is the one thing it needs a position for: straight-line displacement
   * from the stop. See `netFromStopM` in movement.ts.
   */
  private stopAnchor: { lat: number; lon: number } | null = null;
  /** Mirror of the machine's verdict, gated by the `autoPause` option. */
  private autoPaused = false;
  /**
   * When `autoPaused` last CHANGED, epoch ms.
   *
   * Moving time is reconciled on that edge and only back to this instant, so a
   * correction can never reach into a span that was already accounted for. See
   * `applyMovement`.
   */
  private autoPauseEdgeAt = 0;

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
    // Thresholds come from the activity: a cyclist's slowest real movement is
    // faster than a runner's, and a mountaineer stands still for minutes as
    // part of the activity. See MOVEMENT_OVERRIDES in config.ts.
    this.movement = new MovementMachine({ activityTypeId });
    this.movementCfg = movementConfigFor(activityTypeId);
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
    this.clearMovementEvidence(now);
    this.startTicker();
    this.emit();
  }

  pause() {
    if (this.status !== "recording") return;
    this.accrue();
    this.status = "paused";
    // A manual pause supersedes an auto-pause: the athlete has said they have
    // stopped, so the machine's guess about it is no longer interesting, and
    // leaving the flag set would keep the "Auto-paused" banner armed underneath
    // a screen that already says Paused.
    this.autoPaused = false;
    this.autoPauseEdgeAt = Date.now();
    this.emit();
  }

  resume() {
    if (this.status !== "paused") return;
    this.status = "recording";
    const now = Date.now();
    this.lastTickAt = now;
    this.clearMovementEvidence(now);
    this.emit();
  }

  /**
   * Forget everything the movement machine believed.
   *
   * Called whenever the athlete themselves declares the state — pressing Start,
   * or Resume after a manual pause. Without it the quiet run banked while they
   * were parked at a hut is still in the window when they set off again, and
   * they are auto-paused within a second of restarting: a stop confirmed from
   * evidence gathered before they told us they had stopped.
   */
  private clearMovementEvidence(now: number) {
    this.movement.reset("moving");
    this.prevSampleT = null;
    this.stopAnchor = null;
    this.autoPaused = false;
    this.autoPauseEdgeAt = now;
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
    r.autoPauseEdgeAt = Date.now();
    // The rolling speed window, GPS filter, vertical-rate history and movement
    // machine are transient smoothing state — they rebuild from the next few
    // fixes and never affect the recorded track, so they are intentionally not
    // restored. The machine in particular MUST NOT be: it would otherwise wake
    // holding a verdict about a moment that may be hours in the past. It starts
    // from nothing and, until a fix arrives, holds `moving` and auto-pauses
    // nobody, which is the honest position when you know nothing.
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

    // The machine sees EVERY fix, including the ones the filter threw away.
    // A rejected fix used to reach the auto-pause logic as `stepM: 0`, which is
    // indistinguishable from stillness; the machine classifies it as inert, so
    // it votes on nothing and extends no quiet run. Fed before the early return
    // below for exactly that reason — silence from a broken sensor must not be
    // read as a measurement of stillness.
    if (this.status === "recording") this.observeMovement(sample, res);

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

    // Banking distance is banking distance and nothing more. It used to also
    // clear `autoPaused` on the spot, so ONE fix that happened to clear the
    // noise floor resumed the recording — a single GPS wobble against a phone
    // on a rock was enough. Resuming is the machine's decision now, and it
    // wants independent fixes and integrated metres before it will make it.
    if (res.stepM > 0) this.distanceM += res.stepM;

    // The filtered track first; the device's own figure only when the fix is
    // good enough to believe it. That second clause used to be a bare `??`,
    // which let a chipset's flat `speed: 0` placeholder into the rolling mean
    // on every held frame — a measured 1.20 m/s walker was displayed at
    // 0.17 m/s on a 32 m fix. `trustedDeviceSpeed` is the SAME rule the
    // movement machine applies, imported rather than restated.
    const derived =
      res.derivedSpeed ?? trustedDeviceSpeed(sample.speed, sample.accuracy, this.movementCfg);
    if (derived !== null && Number.isFinite(derived)) {
      this.speed.push(sample.t, derived);
      this.lastSpeedAt = sample.t;
    }

    this.points.push({
      ...sample,
      distanceM: this.distanceM,
      altitudeSmoothed: res.altitudeSmoothed,
      derivedSpeed: derived,
    });
    this.pointsView = null;

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
  /* Movement state                                                          */
  /* ---------------------------------------------------------------------- */

  /** Hand one fix to the movement machine and act on its verdict. */
  private observeMovement(sample: GeoSample, res: FilterResult) {
    if (!this.opts.autoPause) return;

    const previousT = this.prevSampleT;
    this.prevSampleT = sample.t;
    const anchor = this.stopAnchor;
    this.lastFixPos = { lat: sample.lat, lon: sample.lon };

    this.applyMovement(
      this.movement.push({
        t: sample.t,
        stepM: res.stepM,
        // The machine uses this only to spot duplicates and reordering. The
        // first fix of a recording has no predecessor, and an infinite interval
        // says exactly that — inventing a plausible one would hand the machine
        // a measurement nobody took.
        dtSec: previousT === null ? Number.POSITIVE_INFINITY : (sample.t - previousT) / 1000,
        accuracy: sample.accuracy,
        // Both stay null when they are null. `GpsFilter` returns a null derived
        // speed on a held frame ON PURPOSE — it means "unknown yet", not zero —
        // and the old `(speed.mean ?? 0)` turned exactly that null into a
        // stationary reading. Nothing here coerces either of them.
        derivedSpeed: res.derivedSpeed,
        reportedSpeed: sample.speed,
        accepted: res.accepted,
        // Measured from where the stop was DECLARED, not from the last fix.
        // Drift accumulates path length indefinitely but cannot accumulate
        // displacement, and that is the only difference between a phone on a
        // rock and a slow walker over any span the machine can see.
        netFromStopM: anchor === null ? null : haversine(anchor, sample),
      }),
      sample.t,
    );
  }

  /**
   * Reconcile moving time with a verdict from the movement machine.
   *
   * MOVING TIME ACCRUES IN `moving` AND IN `possibly-stopped`, and not in the
   * two states the machine reports as auto-paused. That choice is deliberate:
   * `possibly-stopped` is a SUSPICION, and withholding time on a suspicion
   * means holding a debt to be repaid if the suspicion is wrong, which is the
   * kind of bookkeeping that quietly loses minutes. Crediting it and settling
   * up is exact, because the machine reports `quietSinceT` — the instant the
   * quiet run began — so on a confirmed stop the over-credit is removed to the
   * millisecond rather than estimated.
   *
   * The same argument runs the other way. A resume takes seconds to confirm,
   * and those seconds were real movement; the machine reports `movingSinceT`,
   * the earliest fix the resume rests on, and the time is credited back. Left
   * uncorrected, every restart would shave a few seconds off moving time, and
   * since pace is distance over MOVING time, that shortfall makes the athlete
   * look faster than they were. Flattering is still wrong.
   *
   * Corrections only ever apply on an edge, and only back as far as that edge,
   * so no span can be counted or removed twice. ELAPSED time is never touched
   * by any of this: it is wall-clock from the moment Start was pressed and it
   * keeps running through every stop.
   */
  private applyMovement(update: MovementUpdate, t: number) {
    const paused = update.autoPaused;
    if (paused === this.autoPaused) return;

    if (paused) {
      // The quiet span was credited as moving time while the stop was only
      // suspected. Take it back — but never further back than the moment
      // accrual began, and never below zero.
      const from = Math.max(update.quietSinceT ?? t, this.autoPauseEdgeAt);
      this.movingMs -= Math.max(0, Math.min(t - from, this.movingMs));
    } else {
      // Movement was proven to have started at `movingSinceT`; the confirmation
      // latency after it was withheld. Give it back, capped by the elapsed time
      // that is still unaccounted for so moving can never exceed elapsed.
      const from = Math.max(update.movingSinceT ?? t, this.autoPauseEdgeAt);
      this.movingMs += Math.max(0, Math.min(t - from, this.elapsedMs - this.movingMs));
    }

    // Anchor the stop where it happened, and drop the anchor on resume so the
    // next stop measures from its own position rather than an old one.
    this.stopAnchor = paused ? this.lastFixPos : null;

    this.autoPaused = paused;
    this.autoPauseEdgeAt = t;
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
      this.splitsView = null;
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
      const now = Date.now();
      // Accrue FIRST, so any correction below applies to time already banked
      // rather than to time that has not been counted yet.
      this.accrue();

      // Let a dwell that is already satisfied on evidence complete on the
      // clock. This can never CREATE evidence: with no usable fix inside its
      // staleness bound the machine refuses to transition at all, so a phone
      // that has lost the sky holds its state instead of pausing on silence.
      if (this.opts.autoPause && this.status === "recording") {
        this.applyMovement(this.movement.evaluateAt(now), now);
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
    const now = Date.now();
    const movingSec = this.movingMs / 1000;

    /**
     * The live speed, or null when there is no measurement to report.
     *
     * Two ways it can be absent, and both used to publish a number anyway.
     *
     * Auto-paused: the machine has established that displacement is below the
     * noise floor. That is a BOUND, not a speed of zero — we have not measured
     * how fast the athlete is not moving — so the honest output is an em dash,
     * which is what this app's null means. The rolling mean would otherwise
     * keep showing the pace they were walking at before they stopped.
     *
     * Stale: a rolling window only prunes when something is pushed into it, so
     * with no bankable steps arriving the mean never ages. Once the newest
     * sample is older than the window, the figure is a memory of the past
     * twenty seconds of a minute ago.
     */
    const speedFresh = this.lastSpeedAt > 0 && now - this.lastSpeedAt <= SPEED_WINDOW_MS;
    const speedMps = this.autoPaused || !speedFresh ? null : this.speed.mean;

    const avgSpeedMps = movingSec > 0 && this.distanceM > 0 ? this.distanceM / movingSec : null;
    const signalLost =
      this.status === "recording" &&
      this.caps.gps &&
      this.lastFixAt > 0 &&
      now - this.lastFixAt > SIGNAL_LOST_AFTER_MS;

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
      // Pace is 1/speed, so with no trustworthy speed there is no pace. Null,
      // never a fabricated figure and never a frozen one: the screen shows an
      // em dash beside the "Auto-paused" badge, which together say exactly
      // what is true — we are not moving, and we are not measuring a pace.
      paceSecPerKm: speedMps && speedMps > MIN_DISPLAY_SPEED_MPS ? 1000 / speedMps : null,
      avgPaceSecPerKm:
        avgSpeedMps && avgSpeedMps > MIN_DISPLAY_AVG_SPEED_MPS ? 1000 / avgSpeedMps : null,
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
      // COPIES, not the live arrays — but the SAME copy until the contents
      // change.
      //
      // `points` and `splits` are appended to in place, so handing out the
      // internal reference gave every snapshot the same array identity. Any
      // consumer memoising on it — the live map's route and athlete marker do
      // exactly that — compared identical references and never recomputed, so
      // the map stayed blank for the whole session while the numbers climbed.
      //
      // Slicing afresh on every snapshot fixed that and introduced the mirror
      // image of it: a new identity on every fix and every tick even when
      // nothing had been appended, so every memo downstream recomputed off a
      // copy identical to the one it already held — and on a six-hour day out
      // that is a copy of a several-thousand-point array, several times a
      // second. Caching until the array is actually written to makes the
      // contract exact: the identity changes if and only if the contents did.
      points: (this.pointsView ??= this.points.slice()),
      splits: (this.splitsView ??= this.splits.slice()),
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

  /**
   * Notify subscribers. Called at SENSOR rate, on purpose.
   *
   * The engine publishes every change it makes and does not decide how often
   * anyone should look. Rate-limiting the display is a display concern and
   * lives at the React boundary — `useRecorder` throttles `setSnapshot` to
   * `DISPLAY_INTERVAL_MS` and lets transitions through immediately, with the
   * reasoning in `display.ts`. Throttling here as well would put two limiters
   * in series on one stream, and would also slow the crash-safety writes, which
   * deliberately run at their own faster cadence off this same subscription.
   *
   * What this method does owe the display is cheapness, which is why the two
   * growing arrays below are copied only when they change. See `snapshot`.
   */
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
      origin: { kind: "icefall" },

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
