import type { GeoSample, GpsQuality } from "./types";

/**
 * GPS processing.
 *
 * Consumer GPS is noisy: a stationary phone drifts several metres a second, and
 * naive summation of raw fixes inflates distance and elevation badly. This
 * module is the whole defence — accuracy gating, speed sanity, a minimum step,
 * altitude smoothing and hysteresis on elevation.
 *
 * These are pragmatic filters, not survey-grade processing, and the UI says so.
 */

const EARTH_R = 6_371_008.8;

export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function gpsQualityFor(accuracy: number | null): GpsQuality {
  if (accuracy === null || !Number.isFinite(accuracy)) return "none";
  if (accuracy <= 8) return "excellent";
  if (accuracy <= 20) return "good";
  return "weak";
}

export interface FilterConfig {
  /** Fixes worse than this are discarded outright, metres. */
  maxAccuracyM: number;
  /** Implied speeds above this are treated as GPS jumps, m/s. */
  maxSpeedMps: number;
  /** Steps shorter than this are treated as jitter, metres. */
  minStepM: number;
  /** Altitude must move this far from the anchor before it counts, metres. */
  elevationThresholdM: number;
  /** Exponential smoothing factor for altitude, 0–1. */
  altitudeAlpha: number;
}

export const DEFAULT_FILTER: FilterConfig = {
  maxAccuracyM: 40,
  maxSpeedMps: 8,
  minStepM: 2.5,
  elevationThresholdM: 3,
  altitudeAlpha: 0.2,
};

export type RejectReason = "accuracy" | "speed-jump" | "duplicate" | "jitter" | null;

export interface FilterResult {
  accepted: boolean;
  reason: RejectReason;
  /** Distance added by this fix, metres (0 when rejected or below the step). */
  stepM: number;
  altitudeSmoothed: number | null;
  gainM: number;
  lossM: number;
  derivedSpeed: number | null;
}

/**
 * Stateful per-activity filter. One instance per recording.
 */
export class GpsFilter {
  private cfg: FilterConfig;
  private last: GeoSample | null = null;
  private smoothedAlt: number | null = null;
  /** Reference altitude for hysteresis — only moves once a real change lands. */
  private anchorAlt: number | null = null;
  private consecutiveRejects = 0;

  constructor(cfg: Partial<FilterConfig> = {}) {
    this.cfg = { ...DEFAULT_FILTER, ...cfg };
  }

  reset() {
    this.last = null;
    this.smoothedAlt = null;
    this.anchorAlt = null;
    this.consecutiveRejects = 0;
  }

  /** True when enough fixes in a row have been rejected to warn the user. */
  get struggling() {
    return this.consecutiveRejects >= 4;
  }

  push(s: GeoSample): FilterResult {
    const empty: FilterResult = {
      accepted: false,
      reason: null,
      stepM: 0,
      altitudeSmoothed: this.smoothedAlt,
      gainM: 0,
      lossM: 0,
      derivedSpeed: null,
    };

    // 1. Accuracy gate. A 100 m fix tells you almost nothing.
    if (!Number.isFinite(s.accuracy) || s.accuracy > this.cfg.maxAccuracyM) {
      this.consecutiveRejects++;
      return { ...empty, reason: "accuracy" };
    }

    // Altitude smoothing runs on every accepted-accuracy fix, even the first.
    let gainM = 0;
    let lossM = 0;
    if (s.altitude !== null && Number.isFinite(s.altitude)) {
      this.smoothedAlt =
        this.smoothedAlt === null
          ? s.altitude
          : this.smoothedAlt + this.cfg.altitudeAlpha * (s.altitude - this.smoothedAlt);

      if (this.anchorAlt === null) {
        this.anchorAlt = this.smoothedAlt;
      } else {
        // 2. Hysteresis: only commit a change once it clears the threshold, then
        //    re-anchor. Without this, ±1 m noise accumulates into hundreds of
        //    phantom metres over an hour.
        const delta = this.smoothedAlt - this.anchorAlt;
        if (delta >= this.cfg.elevationThresholdM) {
          gainM = delta;
          this.anchorAlt = this.smoothedAlt;
        } else if (delta <= -this.cfg.elevationThresholdM) {
          lossM = -delta;
          this.anchorAlt = this.smoothedAlt;
        }
      }
    }

    if (!this.last) {
      this.last = s;
      this.consecutiveRejects = 0;
      return { ...empty, accepted: true, altitudeSmoothed: this.smoothedAlt, gainM, lossM };
    }

    const dtSec = (s.t - this.last.t) / 1000;
    if (dtSec <= 0) {
      this.consecutiveRejects++;
      return { ...empty, reason: "duplicate", altitudeSmoothed: this.smoothedAlt };
    }

    const dist = haversine(this.last, s);
    const implied = dist / dtSec;

    // 3. Speed sanity. Teleports are the classic urban-canyon failure.
    if (implied > this.cfg.maxSpeedMps * 1.8) {
      this.consecutiveRejects++;
      return { ...empty, reason: "speed-jump", altitudeSmoothed: this.smoothedAlt };
    }

    this.consecutiveRejects = 0;

    // 4. Minimum step. Below the noise floor a "move" is drift, not travel, so
    //    nothing is banked — but `last` is deliberately NOT advanced, so real
    //    slow movement keeps accumulating against the same anchor and commits
    //    in full once it clears the floor.
    //
    //    Speed is reported as null rather than 0: a held frame means "unknown
    //    yet", and feeding zeroes into the rolling mean halves the displayed
    //    pace for any athlete slower than the noise floor per sample.
    const noiseFloor = Math.max(this.cfg.minStepM, s.accuracy * 0.5);
    if (dist < noiseFloor) {
      return {
        accepted: true,
        reason: "jitter",
        stepM: 0,
        altitudeSmoothed: this.smoothedAlt,
        gainM,
        lossM,
        derivedSpeed: null,
      };
    }

    this.last = s;
    return {
      accepted: true,
      reason: null,
      stepM: dist,
      altitudeSmoothed: this.smoothedAlt,
      gainM,
      lossM,
      derivedSpeed: implied,
    };
  }
}

/** Rolling mean over a fixed window — used for pace and vertical rate. */
export class Rolling {
  private buf: { t: number; v: number }[] = [];
  constructor(private windowMs: number) {}

  push(t: number, v: number) {
    this.buf.push({ t, v });
    const cutoff = t - this.windowMs;
    while (this.buf.length && this.buf[0].t < cutoff) this.buf.shift();
  }

  get mean(): number | null {
    if (!this.buf.length) return null;
    return this.buf.reduce((a, b) => a + b.v, 0) / this.buf.length;
  }

  get span(): number {
    if (this.buf.length < 2) return 0;
    return this.buf[this.buf.length - 1].t - this.buf[0].t;
  }

  reset() {
    this.buf = [];
  }
}
