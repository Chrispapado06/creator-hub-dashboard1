import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityRecorder } from "./recorder";
import { clearActiveSession, loadActiveSession, saveActiveSession } from "./activeSession";
import { GeolocationSource } from "./sources/geolocation";
import { SimulatedGpsSource } from "./sources/simulator";
import { BluetoothHeartRateSource } from "./sources/heartRate";
import { buildLiveCue, type LiveCue } from "./insights";
import type { ActivityTypeId, RecordedActivity, RecorderSnapshot, SourceState } from "./types";
import { activityById } from "./activities";

/**
 * Binds the framework-free recorder to React.
 *
 * The engine owns all state; this hook only mirrors snapshots and wires
 * sources. Keeping it this thin is what makes the tracking logic testable and
 * portable to a native background service later.
 */

export type GpsMode = "device" | "simulated";

export interface UseRecorderOptions {
  activityTypeId: ActivityTypeId;
  mode: GpsMode;
  autoPause?: boolean;
  /** From settings — the calorie estimate is meaningless without it. */
  bodyMassKg?: number;
  elevationTargetM?: number | null;
}

export function useRecorder({
  activityTypeId,
  mode,
  autoPause = true,
  bodyMassKg = 72,
  elevationTargetM,
}: UseRecorderOptions) {
  const type = useMemo(() => activityById(activityTypeId), [activityTypeId]);

  const recorderRef = useRef<ActivityRecorder | null>(null);
  const resumedRef = useRef(false);
  if (!recorderRef.current) {
    // Reopened with an activity still in progress? Restore it — the track,
    // distance, ascent, splits and time all survive the app having closed.
    const saved = loadActiveSession();
    if (saved && saved.state.activityTypeId === activityTypeId) {
      recorderRef.current = ActivityRecorder.restore(saved.state);
      resumedRef.current = true;
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

  // Mirror snapshots to React, and persist the in-progress activity (throttled)
  // so it survives the app closing.
  const lastPersistRef = useRef(0);
  useEffect(
    () =>
      recorder.subscribe((snap) => {
        setSnapshot(snap);
        if ((snap.status === "recording" || snap.status === "paused") && snap.startedAt) {
          const now = Date.now();
          if (now - lastPersistRef.current > 3000) {
            lastPersistRef.current = now;
            saveActiveSession({ mode, state: recorder.serialize() });
          }
        }
      }),
    [recorder, mode],
  );

  // Write the latest state the instant the app is backgrounded — iOS suspends a
  // hidden tab within seconds, and the throttle above might not have just fired.
  useEffect(() => {
    const persistNow = () => {
      const snap = recorder.snapshot();
      if ((snap.status === "recording" || snap.status === "paused") && snap.startedAt) {
        saveActiveSession({ mode, state: recorder.serialize() });
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
