/**
 * LAST KNOWN POSITION — one small record in the browser bucket (plan §2.4).
 *
 * It has to draw on the first frame of the SOS screen with no wait, so it is
 * localStorage, not a database, and it is about 150 bytes. Two writers:
 *
 *   · the live tracker, on every real fix (`tracking/useRecorder.ts`);
 *   · `useLivePosition`, for a screen that needs a position with no recording
 *     running — somebody walking to a hut has not pressed Start.
 *
 * Simulated fixes are never written. A position is only ever a real reading.
 *
 * Nothing here makes a network request; GPS only receives.
 */

import { useEffect, useRef, useState } from "react";

import { shouldUseFix, useGpsPlan, type GpsPurpose } from "./gpsPower";

export interface KnownPosition {
  lat: number;
  lon: number;
  /** Horizontal accuracy in metres, as the phone reported it. */
  accuracyM: number | null;
  /** GPS altitude in metres, or null when the fix carried none. */
  altitudeM: number | null;
  /** Vertical accuracy in metres. Null means the phone did not say. */
  altitudeAccuracyM: number | null;
  /** Epoch ms of the fix itself — not of when it was saved. */
  at: number;
}

const KEY = "icefall.mountain.position.v1";
/** GPS and phone clocks disagree by a little; beyond this a fix "from the future" is a clock change. */
const FUTURE_TOLERANCE_MS = 60_000;

function isPosition(p: unknown): p is KnownPosition {
  if (typeof p !== "object" || p === null) return false;
  const r = p as Record<string, unknown>;
  const numOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
  return (
    typeof r.lat === "number" &&
    Number.isFinite(r.lat) &&
    typeof r.lon === "number" &&
    Number.isFinite(r.lon) &&
    typeof r.at === "number" &&
    Number.isFinite(r.at) &&
    numOrNull(r.accuracyM) &&
    numOrNull(r.altitudeM) &&
    numOrNull(r.altitudeAccuracyM)
  );
}

function read(): KnownPosition | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    return isPosition(p) ? p : null;
  } catch {
    return null;
  }
}

let current: KnownPosition | null = typeof localStorage === "undefined" ? null : read();
const listeners = new Set<(p: KnownPosition | null) => void>();

/** The last known position, synchronously. Null when ICEFALL has never had one. */
export function readLastKnownPosition(): KnownPosition | null {
  return current;
}

/** Accepts a `GeoSample` from the tracker or a browser `GeolocationPosition`. */
export function recordPosition(
  fix:
    | {
        t: number;
        lat: number;
        lon: number;
        accuracy: number;
        altitude: number | null;
        altitudeAccuracy: number | null;
      }
    | GeolocationPosition,
): void {
  const next: KnownPosition =
    "coords" in fix
      ? {
          lat: fix.coords.latitude,
          lon: fix.coords.longitude,
          accuracyM: Number.isFinite(fix.coords.accuracy) ? fix.coords.accuracy : null,
          altitudeM: fix.coords.altitude ?? null,
          altitudeAccuracyM: fix.coords.altitudeAccuracy ?? null,
          at: fix.timestamp,
        }
      : {
          lat: fix.lat,
          lon: fix.lon,
          accuracyM: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
          altitudeM: fix.altitude,
          altitudeAccuracyM: fix.altitudeAccuracy,
          at: fix.t,
        };
  if (!isPosition(next)) return;
  // An older fix arriving late must not replace a newer one — unless the stored
  // one is dated in the future, which means the phone's clock was wrong then.
  if (current && current.at > next.at && current.at <= Date.now() + FUTURE_TOLERANCE_MS) return;
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage full: the position stays for this session. */
  }
  listeners.forEach((l) => l(current));
}

/**
 * How much a position can be trusted as "where you are now" (plan §3.0).
 *
 *   fresh    ≤ 30 s           show plainly
 *   aged     30 s – 5 min     show with its age
 *   stale    5 min – 1 h      greyed and labelled
 *   silent   > 1 h            withhold as "now" — EXCEPT on SOS, which always
 *                             shows the last known position with its full date
 */
export type PositionFreshness = "fresh" | "aged" | "stale" | "silent";

export function positionFreshness(pos: KnownPosition, now: number = Date.now()): PositionFreshness {
  // Dated in the future: the clock moved, so its real age is unknown — never "fresh".
  if (pos.at - now > FUTURE_TOLERANCE_MS) return "silent";
  const age = Math.max(0, now - pos.at);
  if (age <= 30_000) return "fresh";
  if (age <= 5 * 60_000) return "aged";
  if (age <= 60 * 60_000) return "stale";
  return "silent";
}

/** The last known position, kept current across tabs and writers. */
export function useLastKnownPosition(): KnownPosition | null {
  const [pos, setPos] = useState<KnownPosition | null>(current);
  useEffect(() => {
    const l = (p: KnownPosition | null) => setPos(p);
    listeners.add(l);
    setPos(current);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      current = read();
      listeners.forEach((x) => x(current));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return pos;
}

export type LivePositionStatus = "off" | "unsupported" | "searching" | "live" | "denied" | "error";

export interface LivePosition {
  status: LivePositionStatus;
  /** The newest fix from THIS watch, or null before the first one. */
  fix: KnownPosition | null;
  /** When the watch started, epoch ms — so a screen can show elapsed seconds. */
  startedAt: number | null;
}

/**
 * Watch GPS while `enabled`, writing every fix to the last known position.
 *
 * The settings come from `gpsPower.ts`, which is the only place that decides
 * them. Pass `"sos"` on the SOS screen: high accuracy is then on whatever the
 * battery saver says. The default, `"screen"`, follows the saver — and the
 * saver itself already stands aside with no signal (plan §6.2).
 *
 * EVERY FIX IS STORED, saver or not. What the saver changes is how often the
 * screen redraws for one. So a throttled screen can show a fix a few seconds
 * old — and it shows it with its age, never as "now" (`positionFreshness`).
 */
export function useLivePosition(enabled: boolean, purpose: GpsPurpose = "screen"): LivePosition {
  const [state, setState] = useState<LivePosition>({ status: "off", fix: null, startedAt: null });
  const plan = useGpsPlan(purpose);
  /* Read inside the effect, so the effect depends on `plan.key` — a string
     that a theme or text-size change cannot alter — and not on the object,
     which is new on every render and would restart the watch. */
  const planRef = useRef(plan);
  planRef.current = plan;
  const planKey = plan.key;

  useEffect(() => {
    if (!enabled) {
      setState({ status: "off", fix: null, startedAt: null });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported", fix: null, startedAt: null });
      return;
    }
    const { options, minFixGapMs, pauseWhenHidden } = planRef.current;
    const startedAt = Date.now();
    setState({ status: "searching", fix: null, startedAt });
    let live = true;
    let watchId: number | null = null;
    let lastUsedAt: number | null = null;

    const onFix = (p: GeolocationPosition) => {
      if (!live) return;
      // Stored first and always: SOS and the Now tab read the last known
      // position, and the battery setting must never hold a fix back from them.
      recordPosition(p);
      if (!shouldUseFix(lastUsedAt, p.timestamp, minFixGapMs)) return;
      lastUsedAt = p.timestamp;
      setState({ status: "live", fix: readLastKnownPosition(), startedAt });
    };
    const onError = (err: GeolocationPositionError) => {
      if (!live) return;
      setState((s) => ({
        ...s,
        status: err.code === err.PERMISSION_DENIED ? "denied" : s.fix ? s.status : "error",
      }));
    };
    const start = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(onFix, onError, options);
    };
    const stop = () => {
      if (watchId === null) return;
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    /* Battery saver, and only off the safety screens: no GPS behind a hidden
       page. The last fix stays on screen with its age; nobody is looking at it
       while the page is hidden, and coming back restarts the watch at once. */
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    start();
    if (pauseWhenHidden) document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      stop();
      if (pauseWhenHidden) document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, planKey]);

  return state;
}

/** TEST SEAM. */
export function __resetPositionForTests(next: KnownPosition | null = null) {
  current = next;
  listeners.forEach((l) => l(current));
}
