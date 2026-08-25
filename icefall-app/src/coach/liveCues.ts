import type { RecorderSnapshot, ActivityType } from "@/tracking/types";
import type { SessionIntent } from "./sessionIntent";

/**
 * The coach that talks to you while you move.
 *
 * IT USES NO AI, AND THAT IS A DESIGN DECISION, NOT A COMPROMISE. Deciding
 * whether somebody is going too hard is a comparison between two numbers the
 * recorder already publishes. Routing that through a language model would add a
 * second or two of latency before it spoke, a network dependency at exactly the
 * moment the athlete is out of signal, a cost per sentence, and a different
 * answer to the same question on two identical runs. A rules engine answers
 * instantly, works in airplane mode, and is auditable — every cue below can be
 * traced to the comparison that produced it, which is the only reason it is
 * acceptable to say any of this out loud to somebody on a mountain.
 *
 * WHAT IT COMPARES YOU TO IS YOURSELF, WITHIN THIS SESSION.
 *
 * `sessions.ts` and `load.ts` refuse to print heart-rate zones or target paces,
 * because ICEFALL has never measured anyone's maximum, resting or threshold
 * heart rate. That refusal holds here. So a cue never says "you are above zone
 * two" — it says "you have drifted faster than the pace you settled into", which
 * is measured, is this athlete's own number, and needs no physiology ICEFALL
 * does not have.
 *
 * Nothing here is medical and nothing here is a safety instruction.
 */

export interface Cue {
  /** Stable id, so the same cue is never queued twice in a row. */
  id: string;
  /** What is spoken. Short — this is heard, not read, often while breathing hard. */
  say: string;
  /** The comparison that produced it, shown in the transcript. */
  why: string;
}

export interface CueState {
  /** Settled baseline, established after the warm-up window. */
  baselinePaceSecPerKm: number | null;
  baselineVerticalMPerH: number | null;
  /** When each cue id was last spoken, ms since session start. */
  lastSpokenAt: Record<string, number>;
  /** Any cue at all, so the coach cannot chatter. */
  lastAnyAt: number;
  /** Distance and ascent milestones already announced. */
  lastKm: number;
  lastAscent100: number;
  /** How many times each correction has gone unheeded. */
  saidCount: Record<string, number>;
}

export const initialCueState = (): CueState => ({
  baselinePaceSecPerKm: null,
  baselineVerticalMPerH: null,
  lastSpokenAt: {},
  lastAnyAt: 0,
  lastKm: 0,
  lastAscent100: 0,
  saidCount: {},
});

/** Nothing is said in the first four minutes; a settled pace does not exist yet. */
const WARMUP_MS = 4 * 60_000;
/** The coach may not speak more often than this, whatever it has noticed. */
const MIN_GAP_MS = 60_000;
/** The same observation is not repeated inside this window. */
const REPEAT_GAP_MS = 4 * 60_000;
/**
 * How many times a correction is offered before the coach drops it.
 *
 * The first version said "ease off" nine times in a forty-minute run, because
 * the athlete in the test never slowed down. Real people sometimes don't, and
 * they are allowed not to — deciding to push on is a decision, not an error.
 * After three unheeded corrections the coach stops raising that one and lets
 * them get on with it. Milestones are exempt; those are information, not advice.
 */
const MAX_REPEATS = 3;

/**
 * How far from the settled pace counts as drift.
 *
 * Twelve per cent, because GPS pace on a phone is noisy — a tighter threshold
 * would have the coach correcting the satellite rather than the athlete.
 */
const DRIFT = 0.12;

const VERTICAL_FAMILIES = new Set(["mountaineering", "climbing", "hiking", "winter"]);

/**
 * The next thing worth saying, or nothing.
 *
 * Pure: it takes the state and returns the new state, so the caller decides
 * whether to actually speak. That makes the whole engine testable without a
 * speech synthesiser or a moving phone.
 */
export function nextCue(
  snapshot: RecorderSnapshot,
  intent: SessionIntent | null,
  activity: ActivityType,
  state: CueState,
): { cue: Cue | null; state: CueState } {
  const t = snapshot.movingMs;
  const vertical = VERTICAL_FAMILIES.has(activity.family) || activity.verticalFocus;
  let next = { ...state };

  // ---- Establish the baseline once the athlete has settled ----------------
  if (t >= WARMUP_MS) {
    if (!vertical && next.baselinePaceSecPerKm === null && snapshot.avgPaceSecPerKm) {
      next = { ...next, baselinePaceSecPerKm: snapshot.avgPaceSecPerKm };
    }
    if (vertical && next.baselineVerticalMPerH === null && snapshot.elevationGainM > 0) {
      const hours = t / 3_600_000;
      if (hours > 0) {
        next = { ...next, baselineVerticalMPerH: snapshot.elevationGainM / hours };
      }
    }
  }

  const canSpeak = (id: string) =>
    t - next.lastAnyAt >= MIN_GAP_MS &&
    t - (next.lastSpokenAt[id] ?? -Infinity) >= REPEAT_GAP_MS &&
    (CORRECTIONS.has(id) ? (next.saidCount[id] ?? 0) < MAX_REPEATS : true);

  const emit = (cue: Cue) => ({
    cue,
    state: {
      ...next,
      lastAnyAt: t,
      lastSpokenAt: { ...next.lastSpokenAt, [cue.id]: t },
      saidCount: { ...next.saidCount, [cue.id]: (next.saidCount[cue.id] ?? 0) + 1 },
    },
  });

  // ---- Milestones — always welcome, never a judgement ---------------------
  const km = Math.floor(snapshot.distanceM / 1000);
  if (!vertical && km > next.lastKm && km > 0) {
    next = { ...next, lastKm: km };
    if (canSpeak("km")) {
      return emit({
        id: "km",
        say: `${km} kilometre${km === 1 ? "" : "s"}.`,
        why: `Distance passed ${km} km.`,
      });
    }
  }

  const ascent100 = Math.floor(snapshot.elevationGainM / 100);
  if (vertical && ascent100 > next.lastAscent100 && ascent100 > 0) {
    next = { ...next, lastAscent100: ascent100 };
    if (canSpeak("ascent")) {
      return emit({
        id: "ascent",
        say: `${ascent100 * 100} metres climbed.`,
        why: `Ascent passed ${ascent100 * 100} m.`,
      });
    }
  }

  if (t < WARMUP_MS || !intent) return { cue: null, state: next };

  // ---- Drift from the athlete's own settled effort ------------------------
  if (!vertical && next.baselinePaceSecPerKm && snapshot.paceSecPerKm) {
    const base = next.baselinePaceSecPerKm;
    const now = snapshot.paceSecPerKm;
    // Lower sec/km is FASTER.
    const faster = (base - now) / base;

    if (faster > DRIFT && EASES_OFF.has(intent.id) && canSpeak("too-fast")) {
      return emit({
        id: "too-fast",
        say: SAY_EASE[intent.id] ?? "Ease off. This is meant to be easy.",
        why: `Pace is ${Math.round(faster * 100)}% faster than the pace you settled into.`,
      });
    }
    if (faster < -DRIFT && PUSHES.has(intent.id) && canSpeak("too-slow")) {
      return emit({
        id: "too-slow",
        say: "Pick it up — you have drifted off your pace.",
        why: `Pace is ${Math.round(-faster * 100)}% slower than the pace you settled into.`,
      });
    }
  }

  if (vertical && next.baselineVerticalMPerH && t > 0) {
    const hours = t / 3_600_000;
    const now = hours > 0 ? snapshot.elevationGainM / hours : 0;
    const base = next.baselineVerticalMPerH;
    const faster = (now - base) / base;

    if (faster > DRIFT && EASES_OFF.has(intent.id) && canSpeak("too-fast")) {
      return emit({
        id: "too-fast",
        say: "Ease off — settle back into a rhythm you can hold to the top.",
        why: `Climbing at ${Math.round(now)} m per hour against the ${Math.round(base)} you settled into.`,
      });
    }
  }

  return { cue: null, state: next };
}

/** Cues that tell the athlete to change something, as opposed to informing them. */
const CORRECTIONS = new Set(["too-fast", "too-slow"]);

/** Intents where going faster than settled is the mistake. */
const EASES_OFF = new Set(["fat-burn", "endurance", "recovery", "vertical"]);
/** Intents where drifting slower is the mistake. */
const PUSHES = new Set(["cardio", "speed"]);

const SAY_EASE: Record<string, string> = {
  "fat-burn": "Ease off. Long and easy — you should be able to talk.",
  endurance: "Ease off. Save it — this is a long one.",
  recovery: "Slow down. This one is meant to feel like less than enough.",
  vertical: "Ease off. Find a rhythm you can hold all the way up.",
};
