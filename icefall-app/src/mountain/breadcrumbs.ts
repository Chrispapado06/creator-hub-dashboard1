/**
 * BREADCRUMBS (brief M5, plan §3.3) — GPS fixes dropped into the on-phone
 * database while Mountain mode or a recording is running, so there is a track
 * to walk back along.
 *
 * Nothing here goes anywhere. Crumbs are written to this phone's database and
 * are never uploaded (plan §2.6, and `device/types.ts`).
 *
 * THE GAPS ARE NOT HIDDEN. GPS stops when the phone is locked or goes in a
 * pocket, so the recorder stores each fix with its own time and nothing joins
 * them up. `geo.ts` decides where the breaks are when the track is read.
 *
 * ONE TRACK PER WALK, not per recording. Somebody walking to a hut has not
 * pressed Start, and a recording begun halfway up must not cut the walk-in off
 * the retrace line — so the track id is kept on the phone and only rolls over
 * after a long idle gap or when the trip is ended.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { deviceStore, type Breadcrumb } from "@/device/db";
import { useBatterySaver } from "@/settings/useMountainSettings";

import { gpsPlan, phoneReportsOffline } from "./gpsPower";
import { loadActiveSession } from "@/tracking/activeSession";

import { CRUMB_RULE, CRUMB_RULE_SAVER, crumbDecision, type ThinningRule } from "./geo";
import { useMountainModeActive } from "./mode";
import { recordPosition } from "./position";

const TRACK_KEY = "icefall.mountain.track.v1";

/** A track this long idle is over. Reopening the app the next morning starts a new one. */
export const TRACK_IDLE_MS = 12 * 60 * 60_000;

export interface TrackRecord {
  id: string;
  startedAt: number;
  /** The newest crumb written to it. */
  lastAt: number;
}

/** Plain copy for a phone that will not keep the track. */
export const NO_TRACK_STORAGE_SENTENCE =
  "This phone is not saving your track, so there is nothing to retrace. Your position still works.";

function readTrack(): TrackRecord | null {
  try {
    const raw = localStorage.getItem(TRACK_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Partial<TrackRecord>;
    if (
      typeof t?.id !== "string" ||
      typeof t.startedAt !== "number" ||
      typeof t.lastAt !== "number"
    )
      return null;
    return { id: t.id, startedAt: t.startedAt, lastAt: t.lastAt };
  } catch {
    return null;
  }
}

function writeTrack(t: TrackRecord | null): void {
  try {
    if (t) localStorage.setItem(TRACK_KEY, JSON.stringify(t));
    else localStorage.removeItem(TRACK_KEY);
  } catch {
    /* the track stays in memory for this session */
  }
}

let track: TrackRecord | null = typeof localStorage === "undefined" ? null : readTrack();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Which track a fix at `now` belongs to: the open one, or a new one.
 *
 * Pure, so the roll-over rule can be tested without a clock or a phone.
 */
export function nextTrackRecord(
  stored: TrackRecord | null,
  now: number,
  idleMs: number = TRACK_IDLE_MS,
): TrackRecord {
  // A stored time in the future means the phone's clock moved; start again
  // rather than keep a track whose age cannot be worked out.
  const usable = stored && now - stored.lastAt >= 0 && now - stored.lastAt <= idleMs;
  return usable
    ? { ...(stored as TrackRecord), lastAt: now }
    : { id: `track-${now}`, startedAt: now, lastAt: now };
}

/** The track being walked now, or null when none is open. Never creates one. */
export function currentTrack(): TrackRecord | null {
  return track;
}

/** Ends the track. Wire this to "Back down / End trip". Crumbs are kept. */
export function endBreadcrumbTrack(): void {
  track = null;
  writeTrack(null);
  notify();
}

export function onBreadcrumbsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Every crumb on a track, oldest first. Empty when the phone has no database. */
export async function readTrackCrumbs(trackId: string | null): Promise<Breadcrumb[]> {
  if (!trackId) return [];
  try {
    const rows = await deviceStore("breadcrumbs").byIndex("trackId", trackId);
    return rows.sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

/** Removes one track's crumbs. Nothing calls it yet; it is what "forget this track" needs. */
export async function clearTrackCrumbs(trackId: string): Promise<void> {
  const rows = await readTrackCrumbs(trackId);
  await deviceStore("breadcrumbs").deleteAll(rows.map((r) => [r.trackId, r.t]));
  notify();
}

/* -------------------------------------------------------------------------- */
/* Recording                                                                   */
/* -------------------------------------------------------------------------- */

export type BreadcrumbStatus =
  | "off"
  | "unsupported"
  | "searching"
  | "recording"
  | "denied"
  | "error";

export interface BreadcrumbRecorder {
  status: BreadcrumbStatus;
  trackId: string | null;
  /** Crumbs written by THIS session. The track may hold more from earlier. */
  stored: number;
  lastAt: number | null;
  /** Set once when the phone refuses to keep the track. Plain words, for the screen. */
  storageError: string | null;
}

/** True while a recording is in progress, checked without touching the recorder. */
function recordingNow(): boolean {
  try {
    return loadActiveSession() !== null;
  } catch {
    return false;
  }
}

const EMPTY_RECORDER: BreadcrumbRecorder = {
  status: "off",
  trackId: null,
  stored: 0,
  lastAt: null,
  storageError: null,
};

/**
 * ONE STATE, SHARED. Two screens may both ask for the recorder — the shell and
 * the retrace page — and two GPS watches would double the writes and halve
 * nothing. The first mount owns the watch; every other one reads what it wrote.
 */
let recorderState: BreadcrumbRecorder = EMPTY_RECORDER;
const recorderListeners = new Set<(s: BreadcrumbRecorder) => void>();
let watchOwner: symbol | null = null;

/**
 * Mounts that wanted the watch and found it taken.
 *
 * Without this the track stops for good when the owner unmounts: the other
 * screens' effects have no reason to run again, so nobody picks the watch back
 * up and the line quietly stops growing while it still looks like it is
 * recording. They are woken instead, and one of them takes over.
 */
const watchWaiters = new Set<() => void>();

function releaseWatch(me: symbol): void {
  if (watchOwner !== me) return;
  watchOwner = null;
  const waiting = [...watchWaiters];
  watchWaiters.clear();
  waiting.forEach((wake) => wake());
}

function setRecorderState(patch: Partial<BreadcrumbRecorder>): void {
  recorderState = { ...recorderState, ...patch };
  recorderListeners.forEach((l) => l(recorderState));
}

function useRecorderState(): BreadcrumbRecorder {
  const [state, setState] = useState(recorderState);
  useEffect(() => {
    recorderListeners.add(setState);
    setState(recorderState);
    return () => {
      recorderListeners.delete(setState);
    };
  }, []);
  return state;
}

/** What the recorder is doing, without starting one. */
export function useBreadcrumbState(): BreadcrumbRecorder {
  return useRecorderState();
}

export interface UseBreadcrumbRecorderOptions {
  /** Defaults to: Mountain mode is on, or a recording is in progress. */
  enabled?: boolean;
}

/**
 * Watches GPS and drops thinned crumbs into the database.
 *
 * Safe to call from more than one screen: only the first watch runs.
 *
 * Battery saver only widens the thinning and lets the phone hand back an older
 * fix; it never turns the track off (plan §6.2).
 */
export function useBreadcrumbRecorder(opts: UseBreadcrumbRecorderOptions = {}): BreadcrumbRecorder {
  const mountainOn = useMountainModeActive();
  const saver = useBatterySaver();
  const [recording, setRecording] = useState(recordingNow);
  const state = useRecorderState();

  // A recording can start or stop on another screen; there is no event for it.
  useEffect(() => {
    const check = () => setRecording(recordingNow());
    const t = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  const enabled = opts.enabled ?? (mountainOn || recording);
  const rule: ThinningRule = saver.gps ? CRUMB_RULE_SAVER : CRUMB_RULE;
  const ruleRef = useRef(rule);
  ruleRef.current = rule;
  const lastCrumb = useRef<Breadcrumb | null>(null);
  const saverGps = saver.gps;
  /* NOT `gpsOptions(saver)` DIRECTLY: `gpsPlan` is the one place that decides
     GPS settings, and it is the only one that knows the no-signal override —
     with no signal the receiver stays at full accuracy whatever the battery
     saver says, because the track is what "Retrace my route" retraces. The
     plan's `key` changes when that decision changes, so the watch restarts. */
  const plan = gpsPlan("track", { saverGps, offline: phoneReportsOffline() });
  const planKey = plan.key;
  const planRef = useRef(plan);
  planRef.current = plan;
  const [claimTry, setClaimTry] = useState(0);

  useEffect(() => {
    const me = Symbol("breadcrumbs");
    if (watchOwner === null) watchOwner = me;
    const release = () => releaseWatch(me);

    if (watchOwner !== me) {
      const wake = () => setClaimTry((n) => n + 1);
      watchWaiters.add(wake);
      return () => {
        watchWaiters.delete(wake);
      };
    }

    if (!enabled) {
      setRecorderState({ status: "off" });
      // Let go at once rather than on unmount, so a screen that does want the
      // track can start it.
      release();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setRecorderState({ status: "unsupported" });
      return release;
    }
    setRecorderState({ status: "searching" });
    let live = true;

    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!live) return;
        // The last known position is shared with SOS and the Now tab, and a fix
        // is a fix whether or not it survives the thinning rule.
        recordPosition(p);

        const next = nextTrackRecord(track, p.timestamp);
        const fresh = track?.id !== next.id;
        track = next;
        writeTrack(next);
        if (fresh) lastCrumb.current = null;

        const crumb: Breadcrumb = {
          trackId: next.id,
          t: p.timestamp,
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          altitudeM: p.coords.altitude ?? null,
          accuracyM: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          altitudeAccuracyM: p.coords.altitudeAccuracy ?? null,
        };
        setRecorderState({ status: "recording", trackId: next.id });
        if (fresh) notify();
        if (crumbDecision(lastCrumb.current, crumb, ruleRef.current) !== "keep") return;
        lastCrumb.current = crumb;
        void deviceStore("breadcrumbs")
          .put(crumb)
          .then(() => {
            if (!live) return;
            setRecorderState({ stored: recorderState.stored + 1, lastAt: crumb.t });
            notify();
          })
          .catch(() => {
            if (!live) return;
            setRecorderState({ storageError: NO_TRACK_STORAGE_SENTENCE });
          });
      },
      (err) => {
        if (!live) return;
        setRecorderState({
          status:
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : recorderState.stored
                ? recorderState.status
                : "error",
        });
      },
      planRef.current.options,
    );

    return () => {
      live = false;
      navigator.geolocation.clearWatch(id);
      release();
    };
  }, [enabled, planKey, claimTry]);

  return state;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export interface UseTrackCrumbs {
  crumbs: Breadcrumb[];
  trackId: string | null;
  loading: boolean;
  reload: () => void;
}

/** The crumbs of a track, kept current as the recorder writes. */
export function useTrackCrumbs(trackId?: string | null): UseTrackCrumbs {
  const [id, setId] = useState<string | null>(trackId ?? track?.id ?? null);
  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const wanted = trackId ?? track?.id ?? null;
    setId(wanted);
    if (!wanted) {
      setCrumbs([]);
      setLoading(false);
      return;
    }
    void readTrackCrumbs(wanted).then((rows) => {
      setCrumbs(rows);
      setLoading(false);
    });
  }, [trackId]);

  useEffect(() => {
    load();
    return onBreadcrumbsChange(load);
  }, [load]);

  return { crumbs, trackId: id, loading, reload: load };
}
