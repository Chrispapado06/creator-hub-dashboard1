/**
 * MOUNTAIN MODE · COACH — the answering logic (brief M9).
 *
 * THE ORDER IS THE WHOLE POINT, and it is the same order on both paths:
 *
 *   1. `checkSafety` — plain code in `@/coach/safety`, no network, no model.
 *   2. the stored mountain answers and the rules below — written by hand,
 *      read against the trip on this phone.
 *   3. anything left over goes on the sync queue for the normal coach.
 *
 * A question that reaches step 3 is checked AGAIN before it is sent, in the
 * handler's `beforeSend`: a release between asking and sending can widen the
 * safety rules, and the widened rules must win. So the safety layer runs twice
 * on a queued question and never fewer than once on any question.
 *
 * NO NETWORK IS REACHABLE FROM THIS FILE. It imports the safety layer, two
 * copy constants and the sync queue — none of which can make a request. The
 * online coach is handed in from `CoachScreen.tsx` as a function, so a
 * Mountain-mode answer can never be waiting on an import that wants a server.
 *
 * NOTHING HERE INVENTS A FIGURE. The only numbers any answer prints are the
 * turnaround time the athlete typed and the trip's own name — everything else
 * is words, or a pointer to the screen that holds the measurement.
 */

import { SAFETY_DISCLAIMER, checkSafety, ALTITUDE_STANDING_LINE } from "@/coach/safety";
/* The queue's own store, read to count what is waiting. It talks to IndexedDB
   and to nothing else — the same import the journal uses for the same reason. */
import { deviceStore } from "@/device/db";
import { enqueueSync, registerSyncHandler, type SendContext, type SendOutcome } from "@/device/syncQueue";
import { DESCENT_IS_ALWAYS_AVAILABLE } from "@/trip/lakeLouise";

import { GUIDE_FIRST, TURNAROUND_UNSET } from "./turnaround";

/* -------------------------------------------------------------------------- */
/* What the coach is told about the trip                                       */
/* -------------------------------------------------------------------------- */

/**
 * The trip, as the answers and the queued question carry it.
 *
 * EVERY FIELD IS NULLABLE AND HONESTLY ABSENT. `altitudeM` in particular is
 * filled by the screen ONLY from a fix fresh enough to print (brief rule 2);
 * an aged fix arrives here as null rather than as a number that reads current.
 */
export interface MountainCoachContext {
  tripName: string | null;
  peakName: string | null;
  routeName: string | null;
  /** "Day 2 of 4", written by the screen from `tripDay`. */
  dayLine: string | null;
  /** HH:MM exactly as it was typed, or null when none is set. */
  turnaroundTime: string | null;
  /** Tonight's hut or camp, when the trip records one. */
  sleepAt: string | null;
  /** Metres, from a fresh fix only. Null otherwise — never an aged reading. */
  altitudeM: number | null;
}

export const EMPTY_MOUNTAIN_CONTEXT: MountainCoachContext = {
  tripName: null,
  peakName: null,
  routeName: null,
  dayLine: null,
  turnaroundTime: null,
  sleepAt: null,
  altitudeM: null,
};

/**
 * The trip block attached to a question the normal coach answers — on the spot
 * online, and again when a queued one is sent. Plain lines, nothing derived.
 * Empty string when the phone knows nothing about a trip, so no question ever
 * carries an invented heading.
 */
export function describeTripForCoach(ctx: MountainCoachContext): string {
  const lines = [
    ctx.tripName ? `Trip: ${ctx.tripName}` : null,
    ctx.peakName ? `Mountain: ${ctx.peakName}` : null,
    ctx.routeName ? `Route: ${ctx.routeName}` : null,
    ctx.dayLine ? `Trip day: ${ctx.dayLine}` : null,
    ctx.sleepAt ? `Sleeping tonight at: ${ctx.sleepAt}` : null,
    typeof ctx.altitudeM === "number" ? `Altitude now: ${Math.round(ctx.altitudeM)} m` : null,
    ctx.turnaroundTime ? `Turnaround time set for: ${ctx.turnaroundTime}` : "Turnaround time: not set",
  ].filter(Boolean);
  if (lines.length <= 1 && !ctx.tripName) return "";
  return `The athlete is on the mountain, in ICEFALL's Mountain mode, and may have no signal.\n${lines.join("\n")}`;
}

/* -------------------------------------------------------------------------- */
/* An answer                                                                   */
/* -------------------------------------------------------------------------- */

export type MountainAnswerSource =
  /** The fixed safety card. Never varied, never personalised. */
  | "safety"
  /** A hand-written mountain answer. */
  | "stored"
  /** A hand-written answer that read the trip on this phone. */
  | "rule"
  /** Nothing here answers it; it is waiting for the normal coach. */
  | "queued"
  /** Nothing here answers it and the phone could not keep it either. */
  | "not-queued";

export interface MountainAnswer {
  source: MountainAnswerSource;
  /** `safety:stroke`, `stored:lost`, `rule:turnaround`, `queued`. For the tests and the red team. */
  id: string;
  body: string;
  disclaimer?: string;
}

/** Word for word from the brief. */
export const QUEUED_SENTENCE = "I'll answer when you're back online.";

export const NOT_KEPT_SENTENCE =
  "This phone could not keep your question, so it is not waiting for anything. Ask it again when you have a signal.";

/* -------------------------------------------------------------------------- */
/* The stored answers and the rules                                            */
/* -------------------------------------------------------------------------- */

interface MountainRule {
  id: string;
  /** `stored` reads nothing; `rule` reads the trip on this phone. */
  kind: "stored" | "rule";
  match: { test(q: string): boolean };
  reply: (ctx: MountainCoachContext) => string;
}

/**
 * Order matters the same way it does in the full app's scripted coach: the
 * narrow, high-consequence questions sit above the broad ones, so "how do I
 * call for help" is not swallowed by the altitude rule's "help".
 */
const RULES: MountainRule[] = [
  {
    id: "help",
    kind: "stored",
    match: /\b(?:call (?:for )?help|get help|rescue|emergency number|mountain rescue|call (?:someone|anyone)|sos)\b/i,
    reply: () =>
      "SOS is at the top of every screen in Mountain mode. It holds the emergency numbers ICEFALL has for where you are, each with the date it was last checked, and your last known position written out so you can read it to an operator.\n\n" +
      "ICEFALL cannot dial and cannot send anything without a signal. It will not pretend otherwise. If your phone shows nothing, the usual thing that works is moving to more open ground or higher, and staying put once somebody knows where you are.",
  },
  {
    id: "turnaround",
    kind: "rule",
    match:
      /\bturn ?around\b|\bturnaround\b|\bhow late\b|\blatest (?:i|we) can\b|\bwhen (?:should|do|must) (?:i|we) turn\b|\bcut ?off time\b/i,
    reply: (ctx) => {
      if (ctx.turnaroundTime) {
        return (
          `Your turnaround time is ${ctx.turnaroundTime}.\n\n` +
          "You set it rested, in the daylight, with the whole day in front of you. You are now tired, close to something, and the worst possible person to renegotiate it. Keep it.\n\n" +
          `${GUIDE_FIRST} ICEFALL's alarm only sounds while this app is open on the screen — set the same time on your watch or your phone's own clock.`
        );
      }
      return (
        `${TURNAROUND_UNSET}\n\n` +
        "Set one on Now before you go any higher. A time decided now, while you can still think clearly, is worth more than a decision made later in the afternoon with the summit in sight.\n\n" +
        `${GUIDE_FIRST} Set it on your watch or your phone's own clock as well — ICEFALL's alarm only sounds while this app is open on the screen.`
      );
    },
  },
  {
    id: "descend",
    kind: "stored",
    match:
      /\b(?:go(?:ing)? down|head down|descend|descent|bail|retreat|give up|call it|abandon|turn back)\b/i,
    reply: () =>
      `${DESCENT_IS_ALWAYS_AVAILABLE}\n\n` +
      "If you are asking, you are already most of the way to the answer. Going down costs you a day and a plane ticket. The other way costs more, and it is the one decision on a mountain that cannot be taken back.\n\n" +
      "Nobody goes down alone. Tell whoever you are with, agree the way, and go while you still have light.",
  },
  {
    id: "lost",
    kind: "stored",
    match:
      /\b(?:lost|off ?route|wrong way|can'?t (?:see|find)|whiteout|white ?out|cloud(?:ed)? in|no visibility|which way|where am i)\b/i,
    reply: () =>
      "Stop moving. Working out where you are while still walking is how a small error turns into a long one.\n\n" +
      "Map · Retrace my route follows your own GPS breadcrumbs back, and gives the distance and bearing to where you started and to your last camp. The route lines on the map are illustrative and not for navigation — the ground in front of you is your own map and compass.\n\n" +
      "If the cloud is down and you are not certain, sitting it out is a real option and often the cheapest one.",
  },
  {
    id: "dark",
    kind: "rule",
    match: /\b(?:dark|darkness|night ?fall|benighted|head ?torch|head ?lamp|daylight|light left|sunset)\b/i,
    reply: (ctx) =>
      "Now shows the light left where you are, worked out from your position rather than from a clock.\n\n" +
      "Walking into the dark is not itself an emergency if you have a head torch, spare layers and a party that is still moving well. It becomes one when it is a surprise. Decide now which of those three you are short of.\n\n" +
      (ctx.turnaroundTime
        ? `Your turnaround time is ${ctx.turnaroundTime}. Getting down in the light is what it is for.`
        : "No turnaround time is set. If there is any doubt about the light, set one on Now."),
  },
  {
    id: "cold",
    kind: "stored",
    match: /\b(?:cold|freezing|can'?t get warm|warm up|shiver\w*|numb|wind ?chill|layers?)\b/i,
    reply: () =>
      "Get out of the wind first — a rock, a lee slope, a group shelter. Wind takes far more heat than still air at the same temperature.\n\n" +
      "Then: something to eat, a dry layer next to the skin if you have one, and the hood and gloves on before you think you need them. Cold is mostly a food and wind problem.\n\n" +
      "If somebody is shivering violently, clumsy, slurring, or has stopped shivering while still cold, that is past cold. Open Body · self-check and treat it as the emergency it is.",
  },
  {
    id: "altitude",
    kind: "stored",
    match: /\b(?:altitude|acclimat\w*|thin air|oxygen|ams|hypox\w*|sleeping height|go(?:ing)? higher)\b/i,
    reply: () =>
      `${ALTITUDE_STANDING_LINE}\n\n` +
      "Body · self-check asks the Lake Louise questions and scores them in the questionnaire's own terms. It works with no signal and it is not behind anything.\n\n" +
      `${DESCENT_IS_ALWAYS_AVAILABLE}`,
  },
  {
    id: "fuel",
    kind: "stored",
    match: /\b(?:eat|eating|food|drink\w*|water|thirsty|hydrat\w*|fuel\w*|snack|hungry|bonk\w*)\b/i,
    reply: () =>
      "Drink before you are thirsty and eat before you are empty. At altitude and in the cold both feelings arrive late, and by the time you notice you are already behind.\n\n" +
      "Body logs your last drink and your last food with the time, so you can see the gap rather than guess at it.\n\n" +
      "Eat what you already know you can eat. A long day on the hill is the worst place to find out that something does not agree with you.",
  },
  {
    id: "weather",
    kind: "rule",
    match: /\b(?:weather|forecast|wind|storm|snow(?:ing)?|rain(?:ing)?|conditions|window)\b/i,
    reply: () =>
      "Any forecast on this phone was downloaded before you lost signal, and every screen showing one says how old it is. ICEFALL will not refresh it without a signal and will not guess at it.\n\n" +
      "Read the sky, the wind on your face and what the cloud is doing, and treat the saved forecast as what somebody thought some hours ago.\n\n" +
      "A forecast that has aged past useful is not a reason to push on. It is a reason to hold your turnaround time exactly.",
  },
  {
    id: "progress",
    kind: "rule",
    match:
      /\b(?:make it|going to summit|will (?:i|we) get|behind schedule|on time|too slow|fast enough|how (?:far|long) (?:to|until))\b/i,
    reply: (ctx) =>
      "ICEFALL will not tell you whether you will make it. It cannot see the snow, the queue on the ridge or how the slowest person in the party is actually moving.\n\n" +
      (ctx.turnaroundTime
        ? `The number that decides is your turnaround time, ${ctx.turnaroundTime}. Where you are at that moment is the answer.`
        : "The number that decides is a turnaround time, and none is set. Set one on Now, then judge where you are against it.") +
      "\n\nNow shows what ICEFALL can actually measure — the countdown, the light left, and your altitude when the fix is fresh enough to print. It leaves the rest blank rather than filling it in.",
  },
];

/* -------------------------------------------------------------------------- */
/* Answering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The offline answer, or null when only the model can take it.
 *
 * SAFETY IS FIRST AND CANNOT BE SKIPPED. It is the first statement in the
 * function, above the rules table, and it returns before anything else can
 * look at the question.
 */
export function answerOffline(question: string, ctx: MountainCoachContext): MountainAnswer | null {
  const safety = checkSafety(question);
  if (safety) {
    return {
      source: "safety",
      id: `safety:${safety.category}`,
      body: safety.body,
      disclaimer: safety.disclaimer,
    };
  }

  const rule = RULES.find((r) => r.match.test(question));
  if (!rule) return null;
  return { source: rule.kind, id: `${rule.kind}:${rule.id}`, body: rule.reply(ctx) };
}

/** Everything the safety layer would have said about this text, for the red team. */
export function safetyAnswer(question: string): MountainAnswer | null {
  const s = checkSafety(question);
  return s
    ? { source: "safety", id: `safety:${s.category}`, body: s.body, disclaimer: s.disclaimer }
    : null;
}

/* -------------------------------------------------------------------------- */
/* The queue                                                                   */
/* -------------------------------------------------------------------------- */

/** Not one of `KEPT_ON_PHONE_KINDS`: a coach question does have somewhere to go. */
export const MOUNTAIN_COACH_KIND = "coach.question";

export interface QueuedCoachQuestion {
  question: string;
  askedAt: number;
  trip: MountainCoachContext;
}

/** The reason recorded against an item the second safety run refused to send. */
export const SAFETY_BLOCKED = "Safety layer answered this instead";

/**
 * Put a question to the normal coach, later.
 *
 * SAFETY RUNS HERE TOO, before anything is written. A message with a red flag
 * in it is answered on the spot and NEVER queued: an emergency does not wait
 * for a signal, and nothing about it should be sitting in an outbox.
 */
export async function enqueueCoachQuestion(
  question: string,
  ctx: MountainCoachContext,
  now: number = Date.now(),
): Promise<MountainAnswer> {
  const safety = safetyAnswer(question);
  if (safety) return safety;

  const payload: QueuedCoachQuestion = { question, askedAt: now, trip: ctx };
  try {
    const result = await enqueueSync<QueuedCoachQuestion>(
      { kind: MOUNTAIN_COACH_KIND, payload, dedupeKey: dedupeKeyFor(question) },
      now,
    );
    if (result.status === "kept-on-phone") {
      return { source: "not-queued", id: "not-queued", body: NOT_KEPT_SENTENCE };
    }
    return { source: "queued", id: "queued", body: QUEUED_SENTENCE };
  } catch {
    // `DeviceStorageError`: the phone has no database. Said plainly rather than
    // shown as "waiting" for something that will never be sent.
    return { source: "not-queued", id: "not-queued", body: NOT_KEPT_SENTENCE };
  }
}

/**
 * How many questions are still waiting for a signal — the real number behind
 * the Trip tab's COACH row (mockup spec §8). Counted from the queue's own rows
 * rather than from the transcript: the transcript remembers that a question was
 * asked, the queue knows whether it is still to go. One that has been given up
 * on or refused is not waiting, so it is not counted here.
 */
export async function countQueuedCoachQuestions(): Promise<number> {
  try {
    const rows = await deviceStore("syncQueue").getAll();
    return rows.filter(
      (item) => item.kind === MOUNTAIN_COACH_KIND && (item.state === "waiting" || item.state === "sending"),
    ).length;
  } catch {
    // No database on this phone. Nothing is queued, because nothing could be.
    return 0;
  }
}

/** The same question asked twice while waiting is one question, not two. */
export function dedupeKeyFor(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

export type MountainCoachSend = (
  payload: QueuedCoachQuestion,
  ctx: SendContext,
) => Promise<SendOutcome>;

/**
 * Register the sender for queued coach questions.
 *
 * `beforeSend` IS THE SECOND SAFETY RUN and it is not optional. The queue calls
 * it immediately before the request, so a question that was ordinary when it
 * was typed and is a red flag under today's rules is stopped here — kept and
 * shown, never sent, and never billed.
 *
 * The sender is passed in rather than imported so this file keeps no path to
 * the network. `CoachScreen.tsx` supplies one that calls `askCoach`.
 */
export function registerMountainCoachHandler(send: MountainCoachSend): () => void {
  return registerSyncHandler<QueuedCoachQuestion>(MOUNTAIN_COACH_KIND, {
    beforeSend: (payload) => {
      const s = checkSafety(payload?.question ?? "");
      return s ? `${SAFETY_BLOCKED} (${s.category})` : null;
    },
    send,
  });
}

/* -------------------------------------------------------------------------- */
/* The transcript                                                              */
/* -------------------------------------------------------------------------- */

/**
 * localStorage, like the Body tab's log and the turnaround time: it has to draw
 * on the first frame with no signal, and a conversation that empties on a
 * reload halfway up a mountain is a conversation nobody trusts.
 *
 * It is kept on this phone and goes nowhere. `coach.conversation` is one of the
 * sync queue's kept-on-phone kinds, which is the same decision written down in
 * the other direction.
 */
export const TRANSCRIPT_KEY = "icefall.mountain.coach.v1";

/** How many turns are kept. Older ones are dropped rather than growing forever. */
export const TRANSCRIPT_MAX = 40;

export interface TranscriptTurn {
  id: string;
  at: number;
  role: "athlete" | "coach";
  body: string;
  /** Coach turns only. Absent on an athlete turn. */
  source?: MountainAnswerSource;
  disclaimer?: string;
}

interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Anything unreadable becomes an empty conversation — never a half-parsed one. */
export function parseTranscript(raw: string | null): TranscriptTurn[] {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (r): r is TranscriptTurn =>
        !!r &&
        typeof r === "object" &&
        typeof (r as TranscriptTurn).body === "string" &&
        typeof (r as TranscriptTurn).at === "number" &&
        ((r as TranscriptTurn).role === "athlete" || (r as TranscriptTurn).role === "coach"),
    );
  } catch {
    return [];
  }
}

export function readTranscript(store: KeyValueStore | null = defaultStore()): TranscriptTurn[] {
  try {
    return parseTranscript(store?.getItem(TRANSCRIPT_KEY) ?? null);
  } catch {
    return [];
  }
}

/** Returns false when the phone refused to keep it, so the screen can say so. */
export function writeTranscript(
  turns: TranscriptTurn[],
  store: KeyValueStore | null = defaultStore(),
): boolean {
  try {
    if (!store) return false;
    store.setItem(TRANSCRIPT_KEY, JSON.stringify(turns.slice(-TRANSCRIPT_MAX)));
    return true;
  } catch {
    return false;
  }
}

const transcriptListeners = new Set<(turns: TranscriptTurn[]) => void>();

export function subscribeTranscript(fn: (turns: TranscriptTurn[]) => void): () => void {
  transcriptListeners.add(fn);
  return () => void transcriptListeners.delete(fn);
}

/**
 * Add turns and tell every open screen.
 *
 * Used by the screen for the athlete's own question and by the queue's sender
 * for an answer that arrives hours later, possibly while the athlete is looking
 * at a different tab. Returns false when the phone refused to keep it.
 */
export function appendTranscript(...turns: TranscriptTurn[]): boolean {
  const next = [...readTranscript(), ...turns].slice(-TRANSCRIPT_MAX);
  const kept = writeTranscript(next);
  transcriptListeners.forEach((l) => l(next));
  return kept;
}

let turnCounter = 0;

/** A turn id that is unique within this session without needing crypto. */
export function newTurnId(now: number = Date.now()): string {
  turnCounter += 1;
  return `t${now.toString(36)}-${turnCounter}`;
}

/** What the transcript shows beside an item the second safety run stopped. */
export function blockedTranscriptAnswer(question: string): MountainAnswer {
  return (
    safetyAnswer(question) ?? {
      source: "not-queued",
      id: "not-queued",
      body: NOT_KEPT_SENTENCE,
      disclaimer: SAFETY_DISCLAIMER,
    }
  );
}
