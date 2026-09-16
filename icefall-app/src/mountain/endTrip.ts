/**
 * BACK DOWN / END TRIP — the order of operations (brief M3 "out").
 *
 * Four things happen, always in this order:
 *
 *   1. RECORDING   stop it and save it. First, because everything after this
 *                  can fail and the athlete's day must not be lost with it.
 *   2. SYNC        only when the reachability check has CONFIRMED a connection.
 *                  Never on `navigator.onLine`, and never offline: a request
 *                  with no network is a spinner, not a sync.
 *   3. TRIP        close the athlete's trip record.
 *   4. DEBRIEF     open the post-trip debrief, or — offline — write down that
 *                  it is owed and say so.
 *
 * NO STEP CAN STOP THE ONES AFTER IT. A failed sync must not leave the trip
 * open; a recording that would not save must not lose the debrief. Every step
 * reports what actually happened in its own words and the run continues.
 *
 * WHY THE DEBRIEF IS NOT STARTED OFFLINE: the debrief screen lives inside the
 * full app's shell, whose login check has no time limit with a dead-but-present
 * network (plan §2.1, §2.9). Navigating there off a mountain is a hang. So it
 * is written down on this phone instead, and the sentence says when it starts.
 *
 * This file has NO imports beyond the pending-debrief record below: it is pure
 * ordering, so `endTrip.test.ts` can drive every branch with fake ports.
 */

export type EndTripStepName = "recording" | "sync" | "trip" | "debrief";

/** `skipped` is a real outcome with a reason, never a silent nothing. */
export type EndTripStepState = "done" | "skipped" | "failed";

export interface EndTripStep {
  name: EndTripStepName;
  state: EndTripStepState;
  /** One plain sentence or fragment for the screen. Never blank. */
  detail: string;
}

export interface EndTripInput {
  /** The athlete's own trip record. Null for the example trip, or no trip. */
  tripRecordId: string | null;
  /** The objective this trip belongs to — the debrief is filed against it. */
  goalId: string | null;
  /** True ONLY when the reachability check confirmed a connection. */
  online: boolean;
  /** Something was recording when the screen opened. */
  recording: boolean;
}

export interface EndTripPorts {
  /** Stops and saves the recording. Resolves null when there was none left. */
  stopRecording: () => Promise<{ activityId: string } | null>;
  /** Runs the sync queue. Only ever called when `online` is true. */
  runSync: () => Promise<{ sent: number }>;
  /** Closes the trip record. */
  clearTrip: (tripRecordId: string) => void | Promise<void>;
  /** Writes down that a debrief is owed. False when this phone would not save it. */
  queueDebrief: (goalId: string) => boolean;
  /** Leaves Mountain mode and opens the debrief. Online only. */
  startDebrief: (goalId: string) => void;
}

export interface EndTripResult {
  steps: EndTripStep[];
  /** The step names that actually ran something, in the order they ran. */
  ran: EndTripStepName[];
  debrief: "started" | "queued" | "not-saved" | "none";
  /** The one line the screen leads with afterwards. */
  sentence: string;
}

export const DEBRIEF_QUEUED_SENTENCE = "Your debrief will start when you're back online.";
export const DEBRIEF_NOT_SAVED_SENTENCE =
  "This phone would not save that. Open the objective and tap “Been? Debrief the trip” when you're back.";
export const NO_OBJECTIVE_SENTENCE =
  "This trip isn't linked to an objective, so there's no debrief to open.";
export const TRIP_KEPT_SENTENCE = "Your trip, nights and checks stay on this phone.";
export const EXAMPLE_TRIP_SENTENCE = "This is the example trip. Nothing of yours is ended.";

function reason(e: unknown): string {
  const m = e instanceof Error ? e.message.trim() : "";
  return m || "it did not say why";
}

export async function runEndTrip(input: EndTripInput, ports: EndTripPorts): Promise<EndTripResult> {
  const steps: EndTripStep[] = [];
  const ran: EndTripStepName[] = [];
  const step = (name: EndTripStepName, state: EndTripStepState, detail: string) => {
    steps.push({ name, state, detail });
    if (state !== "skipped") ran.push(name);
  };

  /* 1. Recording ---------------------------------------------------------- */
  if (input.recording) {
    try {
      const saved = await ports.stopRecording();
      if (saved) step("recording", "done", "Recording stopped and saved to this phone.");
      else step("recording", "skipped", "The recording had already finished.");
    } catch (e) {
      step("recording", "failed", `The recording did not stop — ${reason(e)}.`);
    }
  } else {
    step("recording", "skipped", "Nothing was recording.");
  }

  /* 2. Sync --------------------------------------------------------------- */
  if (input.online) {
    try {
      const result = await ports.runSync();
      step(
        "sync",
        "done",
        result.sent > 0
          ? `Synced ${result.sent} ${result.sent === 1 ? "item" : "items"}.`
          : "Nothing was waiting to sync.",
      );
    } catch (e) {
      step(
        "sync",
        "failed",
        `Sync did not finish — ${reason(e)}. It stays on this phone and tries again.`,
      );
    }
  } else {
    step("sync", "skipped", "No signal, so nothing was sent. It waits on this phone.");
  }

  /* 3. Trip --------------------------------------------------------------- */
  if (input.tripRecordId) {
    try {
      await ports.clearTrip(input.tripRecordId);
      step("trip", "done", TRIP_KEPT_SENTENCE);
    } catch (e) {
      step("trip", "failed", `The trip is still open — ${reason(e)}.`);
    }
  } else {
    step("trip", "skipped", EXAMPLE_TRIP_SENTENCE);
  }

  /* 4. Debrief ------------------------------------------------------------ */
  let debrief: EndTripResult["debrief"] = "none";
  if (!input.goalId) {
    step("debrief", "skipped", NO_OBJECTIVE_SENTENCE);
  } else if (input.online) {
    try {
      ports.startDebrief(input.goalId);
      debrief = "started";
      step("debrief", "done", "Opening your debrief.");
    } catch (e) {
      // The debrief could not be opened, so it is owed — write it down instead.
      debrief = ports.queueDebrief(input.goalId) ? "queued" : "not-saved";
      step("debrief", "failed", `The debrief did not open — ${reason(e)}.`);
    }
  } else {
    const written = ports.queueDebrief(input.goalId);
    debrief = written ? "queued" : "not-saved";
    step(
      "debrief",
      written ? "done" : "failed",
      written ? DEBRIEF_QUEUED_SENTENCE : DEBRIEF_NOT_SAVED_SENTENCE,
    );
  }

  const sentence =
    debrief === "started"
      ? "Opening your debrief."
      : debrief === "queued"
        ? DEBRIEF_QUEUED_SENTENCE
        : debrief === "not-saved"
          ? DEBRIEF_NOT_SAVED_SENTENCE
          : NO_OBJECTIVE_SENTENCE;

  return { steps, ran, debrief, sentence };
}

/* -------------------------------------------------------------------------- */
/* The debrief that is owed                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A DEBRIEF IS NEVER SENT ANYWHERE, so this is not a sync-queue item — the
 * queue's own `KEPT_ON_PHONE_KINDS` lists "debrief" for that reason. It is a
 * note on this phone saying one is owed, which the app acts on next time it has
 * a connection.
 *
 * localStorage, not the device database: it is two fields, it must be readable
 * the instant the app boots, and an IndexedDB open can take seconds or fail.
 */
const PENDING_KEY = "icefall.mountain.debrief.pending.v1";

export interface PendingDebrief {
  goalId: string;
  /** When the athlete came down, epoch ms. */
  at: number;
}

/** False when this phone would not save it — the screen then says so. */
export function queuePendingDebrief(goalId: string, now: number = Date.now()): boolean {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ goalId, at: now } satisfies PendingDebrief));
    return true;
  } catch {
    return false;
  }
}

export function readPendingDebrief(): PendingDebrief | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingDebrief>;
    if (typeof parsed?.goalId !== "string" || !parsed.goalId) return null;
    return { goalId: parsed.goalId, at: typeof parsed.at === "number" ? parsed.at : 0 };
  } catch {
    return null;
  }
}

export function clearPendingDebrief(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to do */
  }
}
