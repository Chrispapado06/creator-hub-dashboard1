import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityRecorder } from "./recorder";
import { clearActiveSession, loadActiveSession, saveActiveSession } from "./activeSession";
import { GeolocationSource } from "./sources/geolocation";
import { SimulatedGpsSource } from "./sources/simulator";
import { BluetoothHeartRateSource } from "./sources/heartRate";
import { buildLiveCue, type LiveCue } from "./insights";
import { DISPLAY_INTERVAL_MS, PERSIST_INTERVAL_MS, transitionKey } from "./display";
import type { BoundRoute } from "./follow";
import type { ActivityTypeId, RecordedActivity, RecorderSnapshot, SourceState } from "./types";
import { activityById } from "./activities";

/**
 * Binds the framework-free recorder to React.
 *
 * The engine owns all state; this hook only mirrors snapshots and wires
 * sources. Keeping it this thin is what makes the tracking logic testable and
 * portable to a native background service later.
 *
 * It is also the boundary between SENSOR RATE and DISPLAY RATE. The recorder
 * emits on every GPS fix and again on its own 1 s ticker; this hook used to
 * call `setSnapshot` on each of those, so the whole Activity screen — nine
 * metric tiles, the coach, the map — re-rendered at whatever rate the chipset
 * happened to produce fixes. See `./display.ts` for the thresholds and the
 * failure they answer. Nothing below drops or alters a measurement: the engine
 * underneath keeps full fidelity, and every snapshot handed to React is one the
 * engine actually produced, never a smoothed or held-over stand-in.
 */

export type GpsMode = "device" | "simulated";

export interface UseRecorderOptions {
  activityTypeId: ActivityTypeId;
  mode: GpsMode;
  autoPause?: boolean;
  /** From settings — the calorie estimate is meaningless without it. */
  bodyMassKg?: number;
  elevationTargetM?: number | null;
  /**
   * A route this activity is following, from the page that started it.
   *
   * Persisted with the session so it survives the app being killed — see
   * `ActiveSession.route`. Passing nothing while a saved session HAS one does
   * not clear it: that is the resume case, and it is the whole reason the
   * binding is stored rather than read off the URL every time.
   */
  route?: BoundRoute | null;
}

export function useRecorder({
  activityTypeId,
  mode,
  autoPause = true,
  bodyMassKg = 72,
  elevationTargetM,
  route = null,
}: UseRecorderOptions) {
  const type = useMemo(() => activityById(activityTypeId), [activityTypeId]);

  const recorderRef = useRef<ActivityRecorder | null>(null);
  const resumedRef = useRef(false);
  /** The binding in force: the caller's, or the resumed session's own. */
  const routeRef = useRef<BoundRoute | null>(route);
  if (!recorderRef.current) {
    // Reopened with an activity still in progress? Restore it — the track,
    // distance, ascent, splits and time all survive the app having closed.
    const saved = loadActiveSession();
    if (saved && saved.state.activityTypeId === activityTypeId) {
      recorderRef.current = ActivityRecorder.restore(saved.state);
      resumedRef.current = true;
      // A resume with no route in the URL keeps the one the walk started with.
      if (!routeRef.current && saved.route) routeRef.current = saved.route;
    } else {
      recorderRef.current = new ActivityRecorder(activityTypeId, {
        autoPause,
        bodyMassKg,
        simulated: mode === "simulated",
      });
    }
  }
  const recorder = recorderRef.current;

  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(() => recorder.snapshot());
  const [gpsState, setGpsState] = useState<SourceState>({ status: "idle" });
  const [hrState, setHrState] = useState<SourceState>({ status: "idle" });
  const [cue, setCue] = useState<LiveCue | null>(null);
  const lastCueId = useRef<string | null>(null);

  const gpsRef = useRef<GeolocationSource | SimulatedGpsSource | null>(null);
  const hrRef = useRef<BluetoothHeartRateSource | null>(null);

  /* ------------------------------------------------------------------ */
  /* Sensor rate in, display rate out                                    */
  /* ------------------------------------------------------------------ */

  /** The snapshot React is currently showing — the identity comparison basis. */
  const shownRef = useRef<RecorderSnapshot>(snapshot);
  /** The newest snapshot that has not been painted yet, if any. */
  const pendingRef = useRef<RecorderSnapshot | null>(null);
  const shownAtRef = useRef(0);
  const keyRef = useRef(transitionKey(snapshot));
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistRef = useRef(0);

  useEffect(() => {
    const clearFlush = () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };

    const paint = (snap: RecorderSnapshot) => {
      clearFlush();
      pendingRef.current = null;
      shownAtRef.current = Date.now();
      keyRef.current = transitionKey(snap);

      const next = stabilise(shownRef.current, snap);
      // `stabilise` returns the PREVIOUS object when nothing a consumer can
      // observe has changed — while paused with no fixes, every field is
      // identical and handing React a fresh object would re-render the screen
      // to draw exactly what is already on it.
      if (next === shownRef.current) return;
      shownRef.current = next;
      setSnapshot(next);
    };

    const unsubscribe = recorder.subscribe((snap) => {
      // PERSISTENCE STAYS ON THE SENSOR SIDE.
      //
      // Crash safety must not inherit the display cadence: an activity killed
      // by iOS should lose the same three seconds whether the screen is being
      // repainted or not. This runs on every emit, throttled on its own clock.
      if ((snap.status === "recording" || snap.status === "paused") && snap.startedAt) {
        const at = Date.now();
        if (at - lastPersistRef.current > PERSIST_INTERVAL_MS) {
          lastPersistRef.current = at;
          saveActiveSession({ mode, state: recorder.serialize(), route: routeRef.current ?? undefined });
        }
      }

      const now = Date.now();
      // A transition (pause, auto-pause, lost signal, a capability appearing)
      // jumps the queue. Waiting up to a second to darken the screen after a
      // tap is the difference between a calm app and a broken-feeling one.
      const transition = transitionKey(snap) !== keyRef.current;
      if (transition || now - shownAtRef.current >= DISPLAY_INTERVAL_MS) {
        paint(snap);
        return;
      }

      // Not this snapshot's slot yet. Keep the NEWEST one and paint it when the
      // slot opens — a trailing edge, so the last reading of a burst is never
      // the one that gets dropped, and the screen always settles on the truth.
      pendingRef.current = snap;
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(
          () => {
            flushTimerRef.current = null;
            const held = pendingRef.current;
            if (held) paint(held);
          },
          Math.max(0, DISPLAY_INTERVAL_MS - (now - shownAtRef.current)),
        );
      }
    });

    return () => {
      clearFlush();
      unsubscribe();
    };
  }, [recorder, mode]);

  // Write the latest state the instant the app is backgrounded — iOS suspends a
  // hidden tab within seconds, and the throttle above might not have just fired.
  useEffect(() => {
    const persistNow = () => {
      const snap = recorder.snapshot();
      if ((snap.status === "recording" || snap.status === "paused") && snap.startedAt) {
        saveActiveSession({ mode, state: recorder.serialize(), route: routeRef.current ?? undefined });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [recorder, mode]);

  /* ------------------------------------------------------------------ */
  /* Sources                                                            */
  /* ------------------------------------------------------------------ */

  const startLocation = useCallback(async () => {
    if (type.indoor) {
      // Indoor activities don't ask for location at all — requesting a
      // permission you have no use for is how apps lose trust.
      recorder.setGpsAvailable(false);
      setGpsState({ status: "idle", detail: "Indoor activity — no location needed." });
      return;
    }

    gpsRef.current?.stop();
    const src =
      mode === "simulated" ? new SimulatedGpsSource(activityTypeId) : new GeolocationSource();
    gpsRef.current = src;

    await src.start(
      (sample) => recorder.pushGeo(sample),
      (state) => {
        setGpsState(state);
        recorder.setGpsAvailable(state.status === "live" || state.status === "connecting");
      },
    );
  }, [activityTypeId, mode, recorder, type.indoor]);

  const connectHeartRate = useCallback(async () => {
    hrRef.current?.stop();
    const src = new BluetoothHeartRateSource();
    hrRef.current = src;
    await src.start((s) => recorder.pushHeartRate(s), setHrState);
  }, [recorder]);

  const disconnectHeartRate = useCallback(() => {
    hrRef.current?.stop();
    hrRef.current = null;
    setHrState({ status: "idle" });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Screen wake lock — the screen going dark mid-climb is a real problem */
  /* ------------------------------------------------------------------ */

  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as unknown as {
        wakeLock?: { request(type: "screen"): Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      /* not fatal — tracking continues without it */
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* A recording with no live source is a recording of nothing            */
  /* ------------------------------------------------------------------ */

  /*
   * ⚠ TWO WAYS TO END UP RECORDING AGAINST SILENCE, BOTH MEASURED 2026-09-09.
   *
   * 1. A RESUMED SESSION. `ActiveSession` brings the recorder back with its
   *    track, distance, ascent and clock intact — and with nothing feeding it,
   *    because the source was a live object that died with the page. `resume()`
   *    already re-acquires, and its comment says why, but it only runs when the
   *    athlete presses Resume — and a session restored in the RECORDING state
   *    never shows that button. The way back from a crash depended on first
   *    pausing an activity you had no reason to think was broken.
   *
   * 2. STRICTMODE, IN DEVELOPMENT. React mounts, tears down and re-mounts every
   *    component on purpose, to catch exactly this. The teardown ran the
   *    cleanup below — `gpsRef.current?.stop()`, which calls `clearWatch` — and
   *    the re-mount did not start location again, because `LiveTracker` guards
   *    its auto-start on a ref that says "I have already started once". Driving
   *    the app on 9 Sep 2026, with the Geolocation API instrumented to record
   *    its own calls, showed one `watchPosition`, one `clearWatch` immediately
   *    after it, and no second watch — so the tracker sat on a running clock, an
   *    empty track and "No GPS", waiting for fixes nothing was going to send.
   *
   * THE GUARD IS THE STATE OF THE SOURCE, NOT A MEMORY OF HAVING STARTED ONE.
   * "Have I ever started?" cannot recover from a source that has since died;
   * "is one live?" can, and it is the same question in every case. It will not
   * re-prompt a refusal: a declined or unsupported source reports `denied` /
   * `unsupported`, never `idle`, so only a source that is absent or stopped is
   * re-acquired.
   */
  useEffect(() => {
    if (type.indoor) return;
    const status = recorder.snapshot().status;
    if (status !== "recording" && status !== "paused") return;
    if (gpsRef.current && gpsRef.current.getState().status !== "idle") return;
    void (async () => {
      await startLocation();
      await requestWakeLock();
    })();
  }, [recorder, startLocation, requestWakeLock, type.indoor, snapshot.status]);

  /* ------------------------------------------------------------------ */
  /* Controls                                                           */
  /* ------------------------------------------------------------------ */

  const start = useCallback(async () => {
    // The source is picked after the recorder is constructed, so the simulated
    // flag is set here rather than in the constructor.
    recorder.setSimulated(mode === "simulated");
    await startLocation();
    await requestWakeLock();
    recorder.start();
  }, [mode, recorder, requestWakeLock, startLocation]);

  const pause = useCallback(() => recorder.pause(), [recorder]);

  const resume = useCallback(async () => {
    // A session resumed after the app closed has no live GPS source yet —
    // re-acquire location (and the wake lock) before continuing.
    if (!gpsRef.current) {
      await startLocation();
      await requestWakeLock();
    }
    recorder.resume();
  }, [recorder, startLocation, requestWakeLock]);

  const finish = useCallback((): RecordedActivity => {
    const rec = recorder.finish();
    clearActiveSession();
    gpsRef.current?.stop();
    hrRef.current?.stop();
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    return rec;
  }, [recorder]);

  /** Abandon the activity without saving it — clears the persisted session. */
  const discard = useCallback(() => {
    clearActiveSession();
    gpsRef.current?.stop();
    hrRef.current?.stop();
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  /* ------------------------------------------------------------------ */
  /* Live cues                                                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (snapshot.status !== "recording") return;
    const next = buildLiveCue({
      distanceM: snapshot.distanceM,
      elevationGainM: snapshot.elevationGainM,
      verticalRateMPerH: snapshot.verticalRateMPerH,
      paceSecPerKm: snapshot.paceSecPerKm,
      elevationTargetM,
      lastCueId: lastCueId.current,
    });
    if (next && next.id !== lastCueId.current) {
      lastCueId.current = next.id;
      setCue(next);
    }
  }, [snapshot, elevationTargetM]);

  /**
   * Auto-dismiss, in its own effect keyed on the cue.
   *
   * This used to live in the effect above, whose dependency is the 1 Hz
   * snapshot: the returned cleanup fired on the very next tick and cleared the
   * timer about a second after it was set, so a cue that appeared never went
   * away. Keyed on `cue`, the timer only resets when the cue itself changes.
   */
  useEffect(() => {
    if (!cue) return;
    const t = setTimeout(() => setCue(null), 6000);
    return () => clearTimeout(t);
  }, [cue]);

  /* ------------------------------------------------------------------ */

  useEffect(
    () => () => {
      gpsRef.current?.stop();
      hrRef.current?.stop();
      recorder.destroy();
      wakeLockRef.current?.release().catch(() => {});
    },
    [recorder],
  );

  return {
    snapshot,
    type,
    gpsState,
    hrState,
    cue,
    dismissCue: () => setCue(null),
    /** True when this mount restored an activity that was still in progress. */
    resumed: resumedRef.current,
    /** The route being followed — the caller's, or a resumed session's own. */
    route: routeRef.current,
    start,
    pause,
    resume,
    finish,
    discard,
    connectHeartRate,
    disconnectHeartRate,
    bluetoothSupported: BluetoothHeartRateSource.supported,
  };
}

/* -------------------------------------------------------------------------- */
/* Snapshot identity                                                           */
/* -------------------------------------------------------------------------- */

/**
 * True when two append-only arrays hold the same elements.
 *
 * `points` and `splits` are only ever appended to, and every element is an
 * object pushed once and never mutated. So equal length plus an identical last
 * element is a complete test — cheap enough to run at display rate on a track
 * with thousands of points, where a element-by-element comparison would not be.
 */
function sameTail<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && (a.length === 0 || a[a.length - 1] === b[b.length - 1]);
}

/** True when no field of the snapshot has changed identity. */
function identical(a: RecorderSnapshot, b: RecorderSnapshot): boolean {
  for (const key of Object.keys(a) as (keyof RecorderSnapshot)[]) {
    if (a[key] !== b[key]) return false;
  }
  // Written as a loop over the live keys rather than a hand-listed set so a
  // field added to RecorderSnapshot later is compared automatically. Missing
  // one would mean a real change never reaching the screen, which is the one
  // failure mode this whole file must not introduce.
  return true;
}

/**
 * Keep object identity stable across snapshots that carry the same values.
 *
 * `ActivityRecorder.snapshot()` builds a fresh object every emit, and copies
 * `points` and `splits` (correctly — see the comment there; handing out the
 * live arrays broke the live map). But that means the arrays change identity
 * once a second even when no fix has landed, and every consumer memoising on
 * them recomputes: `projectTrack(s.points)` walks the whole track, and the
 * map's route/marker effect re-runs `setData` with the full coordinate list.
 *
 * Reusing the previous array when its contents are unchanged makes those memos
 * do what they were written to do. No value is withheld: if a point landed, the
 * new array is passed straight through.
 */
function stabilise(prev: RecorderSnapshot, next: RecorderSnapshot): RecorderSnapshot {
  const points = sameTail(prev.points, next.points) ? prev.points : next.points;
  const splits = sameTail(prev.splits, next.splits) ? prev.splits : next.splits;
  const merged =
    points === next.points && splits === next.splits ? next : { ...next, points, splits };
  return identical(prev, merged) ? prev : merged;
}
