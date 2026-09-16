/**
 * MOUNTAIN MODE · COACH (brief M9).
 *
 * The same coach, asked from a mountain. Two differences and no others:
 *
 *   OFFLINE it answers immediately from `mountainCoach.ts` — the safety layer,
 *   then the stored mountain answers and the rules. Anything only the model can
 *   take goes on the sync queue and says so. Nothing spins, nothing times out,
 *   nothing waits on a radio.
 *
 *   ONLINE it is the normal coach, with the trip on this phone attached to the
 *   question so the answer knows where the athlete is standing.
 *
 * GLOVE-FIRST: one column, 17-20 px text, every control at least 64 px, the
 * box and the Send button at the bottom in thumb reach, and no animation of any
 * kind — so nothing here has a reduced-motion state to get wrong.
 *
 * `MountainCoachOutbox` is the same screen's sender with no screen attached.
 * Mounted once in App.tsx it lets a queued question send the moment the signal
 * check passes, whether or not the athlete is looking at this tab.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { remainingMicros } from "@/coach/budget";
import { useCoachContext } from "@/coach/context";
import { useReachability } from "@/connection/reachability";
import { cn } from "@/lib/utils";
import { askCoach } from "@/services/coach";
import { useApp } from "@/state/AppState";
import { useConnectivity } from "@/trip/connectivity";

import {
  EMPTY_MOUNTAIN_CONTEXT,
  QUEUED_SENTENCE,
  answerOffline,
  appendTranscript,
  describeTripForCoach,
  enqueueCoachQuestion,
  newTurnId,
  readTranscript,
  registerMountainCoachHandler,
  subscribeTranscript,
  type MountainCoachContext,
  type MountainCoachSend,
  type TranscriptTurn,
} from "./mountainCoach";
import { positionFreshness, useLastKnownPosition } from "./position";
import { confirmedOnline } from "./signal";
import { useMountainTrip } from "./trip";
import { SubHeader } from "./trip/chrome";
import { buttonClass } from "./ui";
import { readTurnaround } from "./turnaround";

const ROW = "w-full border-t border-hairline px-5 py-4 text-left";

/** What the coach may be asked without a signal, in the athlete's own words. */
const OPENERS = [
  "When should I turn around?",
  "Should we go down?",
  "We are off route in the cloud",
  "How do I call for help?",
];

/* -------------------------------------------------------------------------- */
/* The trip, as the coach is told it                                           */
/* -------------------------------------------------------------------------- */

/**
 * A GETTER, NOT A VALUE, and that is the point.
 *
 * ALTITUDE IS PASSED ONLY FROM A FIX UNDER FIVE MINUTES OLD (brief rule 2). Age
 * is a function of the clock, so it has to be read at the moment the question
 * is asked — a context computed at mount would still be handing over a fix that
 * went stale while the screen sat open. A stale one is left out altogether
 * rather than sent as "now": the coach then says nothing about altitude, which
 * is the honest outcome.
 *
 * Reading the turnaround time here rather than through `useTurnaround` also
 * keeps this screen off that hook's one-second tick, which on a mountain is a
 * re-render a second for a field that changes once a day.
 */
export function useMountainCoachContext(): () => MountainCoachContext {
  const { trip, day } = useMountainTrip();
  const pos = useLastKnownPosition();

  const live = useRef({ trip, day, pos });
  live.current = { trip, day, pos };

  return useCallback(() => {
    const { trip: t, day: d, pos: p } = live.current;
    const fresh = p ? positionFreshness(p) : null;
    const usable = fresh === "fresh" || fresh === "aged";
    return {
      ...EMPTY_MOUNTAIN_CONTEXT,
      tripName: t?.name ?? null,
      peakName: t?.peakName ?? null,
      routeName: t?.routeName ?? null,
      dayLine: d?.kind === "during" ? `Day ${d.dayNumber} of ${d.totalDays}` : null,
      turnaroundTime: readTurnaround(t?.id)?.time ?? null,
      sleepAt: null,
      altitudeM: usable ? (p?.altitudeM ?? null) : null,
    };
  }, []);
}

/* -------------------------------------------------------------------------- */
/* The sender                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The normal coach, wrapped so the sync queue can call it.
 *
 * The queue calls `beforeSend` — the second safety run — before this ever runs;
 * see `registerMountainCoachHandler`. Nothing here re-checks, because doing it
 * in two places is how one of them ends up being the one that drifts.
 */
function useCoachSender(): MountainCoachSend {
  const ctx = useCoachContext();
  const { coachBudget, recordCoachSpend } = useApp();

  // Read through a ref: the queue holds this function for the life of the app
  // and must always use the CURRENT athlete state, not the state at mount.
  const live = useRef({ ctx, coachBudget, recordCoachSpend });
  live.current = { ctx, coachBudget, recordCoachSpend };

  return useCallback(async (payload) => {
    const trip = describeTripForCoach(payload.trip);
    const question = trip ? `${trip}\n\n${payload.question}` : payload.question;
    try {
      const { message, spentMicros } = await askCoach(
        question,
        live.current.ctx,
        [],
        remainingMicros(live.current.coachBudget),
      );
      if (spentMicros > 0) live.current.recordCoachSpend(spentMicros);
      appendTranscript({
        id: newTurnId(),
        at: Date.now(),
        role: "coach",
        body: message.body,
        source: "queued",
        disclaimer: message.disclaimer,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, retry: true, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);
}

/** Renders nothing. Mount once in App.tsx so queued questions can send. */
export function MountainCoachOutbox() {
  const send = useCoachSender();
  useEffect(() => registerMountainCoachHandler(send), [send]);
  return null;
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

function useTranscript(): TranscriptTurn[] {
  const [turns, setTurns] = useState<TranscriptTurn[]>(readTranscript);
  useEffect(() => {
    setTurns(readTranscript());
    return subscribeTranscript(setTurns);
  }, []);
  return turns;
}

export default function CoachScreen() {
  const signal = useConnectivity();
  const reach = useReachability();
  const online = confirmedOnline(reach, signal.state === "unreachable");

  const readTripCtx = useMountainCoachContext();
  const coachCtx = useCoachContext();
  const { coachBudget, recordCoachSpend } = useApp();

  const turns = useTranscript();
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [notKept, setNotKept] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  /*
   * THE SENDER IS NOT REGISTERED HERE, deliberately. The queue holds one
   * handler per kind; a second registration from this screen would take the
   * slot and then free it on unmount, leaving the app-wide one gone. So
   * `MountainCoachOutbox` owns it, mounted once in App.tsx, and queued
   * questions send whether or not this tab is open.
   */

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, asking]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || asking) return;
    const tripCtx = readTripCtx();
    setText("");
    setNotKept(
      !appendTranscript({ id: newTurnId(), at: Date.now(), role: "athlete", body: question }),
    );

    /*
     * THE OFFLINE ANSWER IS TRIED FIRST EVEN WITH A SIGNAL.
     *
     * Not to save a request: it is what puts the safety layer ahead of the
     * model on this screen as well as inside `askCoach`, and it means a
     * turnaround question is answered in one frame rather than in five seconds
     * of "Thinking…" — which on a ridge is the difference that matters.
     */
    const offline = answerOffline(question, tripCtx);
    if (offline) {
      appendTranscript({
        id: newTurnId(),
        at: Date.now(),
        role: "coach",
        body: offline.body,
        source: offline.source,
        disclaimer: offline.disclaimer,
      });
      return;
    }

    if (!online) {
      const queued = await enqueueCoachQuestion(question, tripCtx);
      appendTranscript({
        id: newTurnId(),
        at: Date.now(),
        role: "coach",
        body: queued.body,
        source: queued.source,
        disclaimer: queued.disclaimer,
      });
      return;
    }

    setAsking(true);
    try {
      const trip = describeTripForCoach(tripCtx);
      const { message, spentMicros } = await askCoach(
        trip ? `${trip}\n\n${question}` : question,
        coachCtx,
        [],
        remainingMicros(coachBudget),
      );
      if (spentMicros > 0) recordCoachSpend(spentMicros);
      appendTranscript({
        id: newTurnId(),
        at: Date.now(),
        role: "coach",
        body: message.body,
        source: "rule",
        disclaimer: message.disclaimer,
      });
    } catch {
      // The check said there was a signal and the request still failed. Queue it
      // rather than losing it, and say the same thing as if there had been none.
      const queued = await enqueueCoachQuestion(question, tripCtx);
      appendTranscript({
        id: newTurnId(),
        at: Date.now(),
        role: "coach",
        body: queued.body,
        source: queued.source,
      });
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* The same back arrow and centred caps title as every other screen under
          the Trip tab (mockup spec §8) — the coach is one of its rows. */}
      <SubHeader title="Coach" />
      <p className="px-5 pb-2 pt-1 m-text-label leading-snug text-mist">
        {online
          ? "Signal. Full coach, with your trip attached."
          : "No signal. I answer from what is on this phone, and I never guess."}
      </p>

      {turns.length === 0 && (
        <section className="mt-4" aria-label="Questions I can answer with no signal">
          {OPENERS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void ask(q)}
              className={cn(ROW, "min-h-16 m-text-body text-snow")}
            >
              {q}
            </button>
          ))}
        </section>
      )}

      <div className="flex-1 px-5 pb-4 pt-2">
        {turns.map((t) => (
          <div key={t.id} className="mt-6 first:mt-4">
            <p className={cn("section-label", t.source === "safety" && "text-alert")}>
              {t.role === "athlete" ? "You" : t.source === "safety" ? "Safety" : "Coach"}
            </p>
            <p
              className={cn(
                "mt-1 whitespace-pre-line m-text-body leading-snug",
                t.role === "athlete" ? "text-mist" : "text-snow",
              )}
            >
              {t.body}
            </p>
            {t.disclaimer && (
              <p className="mt-2 m-text-label leading-snug text-mist">{t.disclaimer}</p>
            )}
            {t.source === "queued" && t.body === QUEUED_SENTENCE && (
              <p className="mt-2 m-text-label leading-snug text-mist">
                It is waiting on this phone. ICEFALL sends it next time you open the app with a
                signal.
              </p>
            )}
          </div>
        ))}
        {asking && <p className="mt-6 m-text-body text-mist">Asking…</p>}
        {notKept && (
          <p className="mt-6 m-text-label leading-snug text-mist">
            This phone would not keep the conversation, so it will be gone if you reload.
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 shrink-0 border-t border-hairline bg-obsidian px-5 pb-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Ask the coach"
          aria-label="Ask the coach"
          className="min-h-16 w-full resize-none bg-transparent m-text-body leading-snug text-snow outline-none placeholder:text-mist-dim"
        />
        <button
          type="submit"
          disabled={!text.trim() || asking}
          className={cn(
            buttonClass(text.trim() && !asking ? "azure" : "azure-outline"),
            "mt-2",
            (!text.trim() || asking) && "opacity-45",
          )}
        >
          {asking ? "Asking…" : online ? "Ask" : "Ask · no signal"}
        </button>
      </form>
    </div>
  );
}
