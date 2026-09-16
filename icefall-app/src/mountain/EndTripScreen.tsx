/**
 * MOUNTAIN MODE · BACK DOWN / END TRIP (brief M3 "out").
 *
 * One screen, one big action at the bottom. Tapping it runs the four steps in
 * `endTrip.ts` — stop the recording, sync if the check confirmed a connection,
 * close the trip, open the post-trip debrief — and then says what actually
 * happened to each one.
 *
 * THE SCREEN IS THE CONFIRMATION. Everything the action will do is listed above
 * the button in the words it will use afterwards, so there is no second "are
 * you sure?" to tap through in gloves.
 *
 * WHAT IT DOES NOT DO OFFLINE, AND SAYS SO: it does not send (nothing to send
 * to), and it does not open the debrief, because that screen sits inside the
 * full app's shell whose login check can hang with a dead-but-present network
 * (plan §2.9). The debrief is written down on this phone instead and starts
 * when there is a signal.
 *
 * STOPPING THE RECORDING IS THE RECORDER'S OWN JOB. `<StopRecording>` mounts
 * only for the moment the athlete taps End trip, calls `useRecorder().finish()`
 * — the same call the live tracker makes — and hands the result to
 * `finalizeActivity`. Nothing about recording is re-implemented here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { reevaluateAppUpdate } from "@/offline/appUpdate";
import { runSyncQueue } from "@/device/syncQueue";
import { activeSessionSummary, loadActiveSession } from "@/tracking/activeSession";
import { finalizeActivity } from "@/tracking/finalize";
import { useRecorder, type GpsMode } from "@/tracking/useRecorder";
import type { ActivityTypeId } from "@/tracking/types";
import { endTrip as endTripRecord } from "@/trip/trip";

import {
  DEBRIEF_QUEUED_SENTENCE,
  NO_OBJECTIVE_SENTENCE,
  queuePendingDebrief,
  runEndTrip,
  TRIP_KEPT_SENTENCE,
  type EndTripResult,
} from "./endTrip";
import { endBreadcrumbTrack } from "./breadcrumbs";
import { durationLabel } from "./format";
import { leaveMountainMode } from "./mode";
import { MOUNTAIN_PATHS } from "./paths";
import { useMountainTrip } from "./trip";
import { useSignalPill } from "./useSignal";

/** A recorder that has not reported back by now is not going to. */
const STOP_TIMEOUT_MS = 8000;

const ROW = "border-t border-hairline px-5 py-4 text-[17px] leading-snug";
/* AZURE FILL, NOT WHITE (mockup spec §0). This screen was missed in the 16 Sep
   rebuild and still carried the old white slab, which is the exact thing the
   owner called out. Red is reserved for the emergency screen; ending a trip is
   an ordinary primary action. */
const BIG_BUTTON =
  "flex min-h-[88px] w-full items-center justify-center rounded-[12px] px-6 text-center text-[20px] font-medium";
const SECOND_BUTTON = "flex min-h-16 w-full items-center justify-center text-[17px] text-snow";

const km = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;

type StopOutcome = { ok: true; activityId: string } | { ok: false; reason: string };

/* -------------------------------------------------------------------------- */

export default function EndTripScreen() {
  const navigate = useNavigate();
  const { trip, day } = useMountainTrip();
  const pill = useSignalPill();

  const [session] = useState(() => activeSessionSummary());
  const [phase, setPhase] = useState<"confirm" | "working" | "done">("confirm");
  const [result, setResult] = useState<EndTripResult | null>(null);
  /** Mounts the recorder for the one moment it is needed. */
  const [stopping, setStopping] = useState<{
    activityTypeId: ActivityTypeId;
    mode: GpsMode;
  } | null>(null);

  const pending = useRef<{ settle: (o: StopOutcome) => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /*
   * Ask once, on opening, whether there is really a connection. Everything this
   * screen does differently online turns on that answer, and a verdict from an
   * hour ago at a tea house is not one. It never runs a request when the phone
   * says the interface is down, so opening this screen in a storm costs nothing.
   */
  const check = useRef(pill.check);
  check.current = pill.check;
  useEffect(() => {
    check.current();
  }, []);

  const onStopped = useCallback((outcome: StopOutcome) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setStopping(null);
    const waiting = pending.current;
    pending.current = null;
    waiting?.settle(outcome);
  }, []);

  const stopRecording = useCallback(() => {
    const saved = loadActiveSession();
    if (!saved) return Promise.resolve(null);
    return new Promise<{ activityId: string } | null>((resolve, reject) => {
      pending.current = {
        settle: (o) => (o.ok ? resolve({ activityId: o.activityId }) : reject(new Error(o.reason))),
      };
      setStopping({ activityTypeId: saved.state.activityTypeId, mode: saved.mode });
      timer.current = setTimeout(() => {
        timer.current = null;
        const waiting = pending.current;
        pending.current = null;
        setStopping(null);
        waiting?.settle({ ok: false, reason: "the recorder did not answer" });
      }, STOP_TIMEOUT_MS);
    });
  }, []);

  const goalId = trip?.record?.goalId ?? null;

  const end = useCallback(async () => {
    setPhase("working");
    const outcome = await runEndTrip(
      {
        tripRecordId: trip?.record?.id ?? null,
        goalId,
        online: pill.online,
        recording: !!loadActiveSession(),
      },
      {
        stopRecording,
        runSync: async () => ({ sent: (await runSyncQueue()).sent }),
        clearTrip: (id) => endTripRecord(id),
        queueDebrief: (g) => queuePendingDebrief(g),
        startDebrief: (g) => {
          leaveMountainMode();
          navigate(`/objective/${encodeURIComponent(g)}/debrief`, { replace: true });
        },
      },
    );
    /* The walk is over, so the breadcrumb track is closed and the next one
       starts fresh. THE CRUMBS ARE KEPT — this ends the track, it does not
       delete it, so the line walked today is still there to look at. */
    endBreadcrumbTrack();
    // A held app update may install now: nothing is being recorded any more.
    reevaluateAppUpdate();
    setResult(outcome);
    setPhase("done");
  }, [goalId, navigate, pill.online, stopRecording, trip?.record?.id]);

  /* ---------------------------------------------------------------- */

  const title = phase === "done" ? "Back down" : "Back down / End trip";

  return (
    <div className="flex min-h-full flex-col pb-10">
      {stopping && (
        <StopRecording
          activityTypeId={stopping.activityTypeId}
          mode={stopping.mode}
          onDone={onStopped}
        />
      )}

      <div className="px-5 pt-5">
        <h1 className="text-[28px] font-light text-snow">{title}</h1>
        {trip && (
          <p className="mt-1 text-[17px] text-mist">
            {trip.name}
            {day?.kind === "during" ? ` · day ${day.dayNumber}` : ""}
          </p>
        )}
        {trip?.notice && <p className="mt-2 text-[15px] leading-snug text-mist">{trip.notice}</p>}
      </div>

      {phase === "done" && result ? (
        <Done result={result} />
      ) : (
        <WillHappen
          hasTrip={!!trip}
          isRecord={!!trip?.record}
          session={session}
          online={pill.online}
          waiting={pill.waiting}
          goalId={goalId}
        />
      )}

      <div className="mt-auto px-5 pt-8">
        {phase === "done" ? (
          <button
            type="button"
            onClick={() => navigate(MOUNTAIN_PATHS.root, { replace: true })}
            className={cn(BIG_BUTTON, "bg-azure text-obsidian")}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void end()}
              disabled={phase === "working" || !trip}
              className={cn(
                BIG_BUTTON,
                phase === "working" || !trip
                  ? "border border-hairline text-mist-dim"
                  : "bg-azure text-obsidian",
              )}
            >
              {phase === "working" ? "Ending…" : "End trip"}
            </button>
            <button
              type="button"
              // Not `navigate(-1)`: opened from a notification or a cold link
              // there is nothing behind this screen, and "Not now" must never
              // be the tap that closes ICEFALL on a mountain.
              onClick={() => navigate(MOUNTAIN_PATHS.root, { replace: true })}
              disabled={phase === "working"}
              className={cn(SECOND_BUTTON, "mt-2")}
            >
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Before                                                                      */
/* -------------------------------------------------------------------------- */

function WillHappen({
  hasTrip,
  isRecord,
  session,
  online,
  waiting,
  goalId,
}: {
  hasTrip: boolean;
  isRecord: boolean;
  session: ReturnType<typeof activeSessionSummary>;
  online: boolean;
  waiting: number;
  goalId: string | null;
}) {
  return (
    <section aria-label="What ending the trip does" className="mt-6">
      <p className={cn(ROW, "text-snow")}>
        {session ? (
          <>
            Your recording stops and is saved.
            <span className="mt-1 block text-[15px] text-mist">
              {km(session.distanceM)} · {durationLabel(session.elapsedMs)} ·{" "}
              {Math.round(session.elevationGainM)} m up
            </span>
          </>
        ) : (
          "Nothing is recording."
        )}
      </p>

      <p className={cn(ROW, online ? "text-snow" : "text-mist")}>
        {online
          ? waiting > 0
            ? `${waiting} ${waiting === 1 ? "item" : "items"} waiting will be sent.`
            : "Signal. Nothing is waiting to send."
          : "No signal, so nothing is sent. It waits on this phone."}
      </p>

      <p className={cn(ROW, "text-snow")}>
        {!hasTrip
          ? "No trip is running."
          : isRecord
            ? `Your trip is closed. ${TRIP_KEPT_SENTENCE}`
            : "This is the example trip. Nothing of yours is ended."}
      </p>

      <p className={cn(ROW, "text-snow")}>
        {!goalId
          ? NO_OBJECTIVE_SENTENCE
          : online
            ? "Your debrief opens next."
            : DEBRIEF_QUEUED_SENTENCE}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* After                                                                       */
/* -------------------------------------------------------------------------- */

function Done({ result }: { result: EndTripResult }) {
  return (
    <section aria-label="What happened" className="mt-6" role="status" aria-live="polite">
      <p className="px-5 text-[22px] leading-snug text-snow">{result.sentence}</p>
      <div className="mt-5">
        {result.steps.map((s) => (
          <p
            key={s.name}
            className={cn(
              ROW,
              s.state === "failed" ? "text-alert" : s.state === "done" ? "text-snow" : "text-mist",
            )}
          >
            {s.detail}
          </p>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The recorder, for one moment                                                */
/* -------------------------------------------------------------------------- */

/**
 * Mounted only while the trip is being ended. `useRecorder` restores the
 * activity that was still running — the same restore a reopened app does — and
 * `finish()` stops it, clears the saved session and releases the wake lock.
 * Unmounting immediately after stops the location source it re-acquires.
 */
function StopRecording({
  activityTypeId,
  mode,
  onDone,
}: {
  activityTypeId: ActivityTypeId;
  mode: GpsMode;
  onDone: (o: StopOutcome) => void;
}) {
  const rec = useRecorder({ activityTypeId, mode });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    try {
      const { activity } = finalizeActivity(rec.finish());
      onDone({ ok: true, activityId: activity.id });
    } catch (e) {
      onDone({ ok: false, reason: e instanceof Error ? e.message : "it did not say why" });
    }
  }, [rec, onDone]);

  return null;
}
