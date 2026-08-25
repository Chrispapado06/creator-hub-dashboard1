import type { Split, TrackPoint } from "@/types";

/**
 * Deterministic synthetic GPS.
 *
 * The reference design leans on a route trace and an elevation profile on
 * several screens. Rather than ship a map vendor, ICEFALL renders its own
 * topographic trace from a seeded generator — stable across re-renders,
 * no network, no API key, and styled entirely in brand.
 *
 * `RouteMap` consumes `TrackPoint.x/y` (normalised 0..1) so a real provider
 * can later project lat/lon into the same space without touching callers.
 */

/** mulberry32 — small, fast, stable PRNG so a given seed always looks the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface TrackOptions {
  seed: string;
  points?: number;
  distanceKm: number;
  durationSec: number;
  startEleM: number;
  gainM: number;
  /** true = summit-and-return (mountaineering), false = point-to-point loop. */
  outAndBack?: boolean;
  withHr?: boolean;
}

/**
 * Builds a plausible mountain route: a meandering path across the frame with a
 * matching elevation curve that climbs to a summit and (optionally) returns.
 */
export function generateTrack({
  seed,
  points = 160,
  distanceKm,
  durationSec,
  startEleM,
  gainM,
  outAndBack = true,
  withHr = true,
}: TrackOptions): TrackPoint[] {
  const rand = rng(hashSeed(seed));

  // Three low-frequency wanders give the path an organic, non-repeating shape.
  const waves = Array.from({ length: 3 }, () => ({
    amp: 0.06 + rand() * 0.16,
    freq: 1 + rand() * 3.2,
    phase: rand() * Math.PI * 2,
  }));

  const drift = { x: 0.1 + rand() * 0.12, y: 0.12 + rand() * 0.1 };
  const out: TrackPoint[] = [];

  // Geometry and elevation first; time is distributed afterwards, because a
  // kilometre of ascent costs far more than a kilometre of descent. Spreading
  // duration evenly made every split identical, which is not what a mountain
  // day looks like.
  const raw: { x: number; y: number; ele: number; eased: number }[] = [];

  for (let i = 0; i < points; i++) {
    const p = i / (points - 1);

    // Progress along the climb: rises to 1 at the summit, returns if out-and-back.
    const climb = outAndBack ? 1 - Math.abs(p * 2 - 1) : p;

    // Path meanders left-right while advancing up the frame.
    let x = 0.14 + p * 0.72;
    let y = 0.86 - climb * 0.66;
    for (const w of waves) {
      x += Math.sin(p * Math.PI * w.freq + w.phase) * w.amp * 0.42;
      y += Math.cos(p * Math.PI * w.freq * 0.8 + w.phase) * w.amp * 0.3;
    }
    x += (rand() - 0.5) * 0.012 + drift.x * 0.04;
    y += (rand() - 0.5) * 0.012 - drift.y * 0.03;

    // Elevation: eased climb plus small terrain noise, never below start.
    const eased = climb < 0.5 ? 2 * climb * climb : 1 - Math.pow(-2 * climb + 2, 2) / 2;
    const terrain = Math.sin(p * Math.PI * 6.4 + waves[0].phase) * gainM * 0.035;
    const ele = startEleM + eased * gainM + terrain;

    raw.push({ x: clamp01(x), y: clamp01(y), ele, eased });
  }

  // Effort-weighted time. Cost per step rises with gradient going up and falls
  // going down, normalised so the whole track still totals `durationSec`.
  const avgUpStep = Math.max(1, gainM / Math.max(1, points / 2));
  const upFactor = 1.4 / avgUpStep;
  const downFactor = 0.5 / avgUpStep;

  const costs: number[] = [0];
  for (let i = 1; i < raw.length; i++) {
    const d = raw[i].ele - raw[i - 1].ele;
    const up = Math.max(0, d);
    const down = Math.max(0, -d);
    costs.push(Math.min(4, Math.max(0.3, 1 + up * upFactor - down * downFactor)));
  }

  const totalCost = costs.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;

  for (let i = 0; i < raw.length; i++) {
    acc += costs[i];
    const p = i / (points - 1);
    // Heart rate tracks effort: climbing costs more than descending.
    const hr = withHr
      ? Math.round(122 + raw[i].eased * 42 + Math.sin(p * Math.PI * 9) * 4 + (rand() - 0.5) * 5)
      : undefined;

    out.push({
      x: raw[i].x,
      y: raw[i].y,
      ele: Math.round(raw[i].ele),
      t: Math.round((acc / totalCost) * durationSec),
      hr,
    });
  }

  return out;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Per-kilometre splits derived from a track, for the summary screen. */
export function deriveSplits(track: TrackPoint[], distanceKm: number): Split[] {
  const whole = Math.max(1, Math.floor(distanceKm));
  const splits: Split[] = [];

  for (let k = 0; k < whole; k++) {
    const from = Math.floor((k / distanceKm) * (track.length - 1));
    const to = Math.floor(((k + 1) / distanceKm) * (track.length - 1));
    const seg = track.slice(from, Math.max(from + 1, to + 1));

    let gain = 0;
    for (let i = 1; i < seg.length; i++) {
      const d = seg[i].ele - seg[i - 1].ele;
      if (d > 0) gain += d;
    }

    const durationSec = Math.max(1, (seg[seg.length - 1]?.t ?? 0) - (seg[0]?.t ?? 0));
    const hrs = seg.map((p) => p.hr).filter((h): h is number => typeof h === "number");

    splits.push({
      km: k + 1,
      durationSec,
      elevationGainM: Math.round(gain),
      hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined,
    });
  }

  return splits;
}

/** Builds an SVG path string from normalised points, fitted to a viewbox. */
export function trackToPath(track: TrackPoint[], width: number, height: number, pad = 0) {
  if (!track.length) return "";
  const w = width - pad * 2;
  const h = height - pad * 2;
  return track
    .map(
      (p, i) => `${i === 0 ? "M" : "L"}${(pad + p.x * w).toFixed(2)} ${(pad + p.y * h).toFixed(2)}`,
    )
    .join(" ");
}

/** Smooth area path for the elevation profile. */
export function elevationPath(track: TrackPoint[], width: number, height: number) {
  if (track.length < 2) return { line: "", area: "", min: 0, max: 0 };

  const eles = track.map((p) => p.ele);
  const min = Math.min(...eles);
  const max = Math.max(...eles);
  const range = Math.max(1, max - min);

  const pts = track.map((p, i) => {
    const x = (i / (track.length - 1)) * width;
    const y = height - ((p.ele - min) / range) * height;
    return [x, y] as const;
  });

  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return { line, area, min, max };
}
