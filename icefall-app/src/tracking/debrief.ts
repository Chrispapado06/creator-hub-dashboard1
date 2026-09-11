import { useSyncExternalStore } from "react";
import { checkSafety, type SafetyCategory, type SafetyResponse } from "@/coach/safety";
import { trainableAreaLabel } from "@/coach/sessions";

/**
 * THE POST-ACTIVITY DEBRIEF — three questions, and what each one reaches.
 *
 * ============================================================================
 * WHY THREE, AND WHY THESE
 * ============================================================================
 *
 * Everything ICEFALL records about a session is external: distance, ascent,
 * time, a heart rate if a strap was paired. None of it says whether the athlete
 * was fine, whether they were hanging on, or whether something hurt. Two
 * identical 900 m Saturdays — same route, same time, same average heart rate —
 * are a good week and a warning sign depending on an answer nobody has ever
 * been asked for.
 *
 *   1. HOW HARD DID IT FEEL, 1–10. The one question sports science has
 *      repeatedly found to carry more than its cost. It is a rating, not a
 *      measurement, and it stays labelled as one everywhere it surfaces.
 *   2. HOW DOES THE BODY FEEL NOW. Four states, not a scale: a scale invites
 *      the athlete to average "legs fine, back sore" into a 6, which is the
 *      one number that means nothing.
 *   3. ANY PAIN. Free text, and the only free-text field here, because the
 *      useful part of a pain answer is WHERE and the list of wheres is long.
 *
 * ============================================================================
 * VOICE NOTES: NOT SHIPPED, AND NOT STUBBED
 * ============================================================================
 *
 * The roadmap allows voice notes for this. This app has no recording path —
 * there is no `MediaRecorder`, no `getUserMedia` and no speech recognition
 * anywhere in `src/`, and no native shell to provide one (see Phase 4's
 * "native app wrapper" item, which is what would). A microphone button that
 * opened nothing, or that recorded into a blob nothing transcribes, would be a
 * control claiming a capability the app does not have — rule 2. So the debrief
 * is text, and when a recording path exists this is the module that grows a
 * second input, not a screen that grows a working button.
 *
 * ============================================================================
 * THE BOUNDARY WITH THE SAFETY LAYER — READ BEFORE CHANGING
 * ============================================================================
 *
 * A pain answer is TRAINING DATA. "Knee was grumbling on the descent" is not an
 * emergency, and treating it as one would teach athletes to stop answering.
 *
 * But the same box will one day be typed into by somebody who has just come off
 * a mountain with a head injury, and the box does not know which it is getting.
 * So the note goes through `checkSafety` — the SAME function, unchanged, that
 * gates the chat — before anything else happens to it. It runs first, it runs
 * offline, and this module neither reimplements nor softens a word of it.
 *
 * What this module adds is the ROUTING, and the routing is the load-bearing
 * part: a debrief whose note fired the safety layer is recorded with the
 * category on it, and `debriefEffects.ts` puts it in `medical` — never in
 * `trainAround`. The difference on screen is the difference between "ICEFALL
 * has taken the step-ups out of Thursday" and "a doctor before the next
 * session". Easing a session for a suspected fracture is worse than doing
 * nothing, because it looks like the app handled it.
 *
 * SAFETY LOGIC IS NOT DUPLICATED HERE. There is one `checkSafety`, it lives in
 * `coach/safety.ts`, and this file calls it.
 */

/* -------------------------------------------------------------------------- */
/* The answers                                                                 */
/* -------------------------------------------------------------------------- */

/** The RPE scale the athlete taps. Both ends are labelled on screen. */
export const DEBRIEF_EFFORT = { min: 1, max: 10 } as const;

/**
 * At or above this, the athlete has called the session hard.
 *
 * It is their verdict, not a threshold anybody measured, and it is used for
 * exactly one thing: `coach/hooks.ts` already asks "how long since a hard
 * session" and answers it from ascent and duration alone. A 45-minute session
 * the athlete rated 9 is a hard session; the old proxy could not see it.
 */
export const HARD_EFFORT = 8;

export type DebriefBodyId = "fresh" | "normal" | "worked" | "wrecked";

/**
 * Four states rather than a scale, in order.
 *
 * `detail` is what the athlete reads under the label — it exists so "Worked"
 * and "Wrecked" cannot be told apart by tone alone, which is how a screen ends
 * up recording the wrong one.
 */
export const DEBRIEF_BODY: { id: DebriefBodyId; label: string; detail: string }[] = [
  { id: "fresh", label: "Fresh", detail: "Could have done it again" },
  { id: "normal", label: "Normal", detail: "Tired in the way a session should leave you" },
  { id: "worked", label: "Worked", detail: "Properly emptied — it will take a day or two" },
  { id: "wrecked", label: "Wrecked", detail: "More than the session should have cost" },
];

export const DEBRIEF_BODY_LABEL: Record<DebriefBodyId, string> = Object.fromEntries(
  DEBRIEF_BODY.map((b) => [b.id, b.label]),
) as Record<DebriefBodyId, string>;

/**
 * The pain answer.
 *
 * A union rather than an optional string, so "asked and answered no" cannot be
 * confused with "never asked" — the first is information about the athlete and
 * the second is nothing at all. `safety` is the category the fixed safety layer
 * matched, or null; `area` is the engine's own name for a body area it can
 * actually train around, or null when it recognised none.
 */
export type DebriefPain =
  | { reported: false }
  | {
      reported: true;
      /** The athlete's own words, stored verbatim. Never shown in ICEFALL's voice. */
      note: string;
      /** Set when `checkSafety` fired on the note. Routes to a doctor, not a lighter session. */
      safety: SafetyCategory | null;
      /** The area the session engine can work around, if it recognised one. */
      area: string | null;
    };

export interface ActivityDebrief {
  activityId: string;
  /** ISO timestamp the answers were given. */
  answeredAt: string;
  /**
   * The activity's own start, copied in.
   *
   * Denormalised on purpose: recovery ages a debrief in hours, and it must not
   * have to go and find an activity that may have been deleted, imported from a
   * watch, or trimmed out of local storage to do it.
   */
  activityStartedAt: string;
  /** 1–10, the athlete's own rating. Self-reported, and labelled as such. */
  effort: number;
  body: DebriefBodyId;
  pain: DebriefPain;
}

/* -------------------------------------------------------------------------- */
/* Building one                                                                */
/* -------------------------------------------------------------------------- */

export interface DebriefAnswers {
  activityId: string;
  activityStartedAt: string;
  effort: number;
  body: DebriefBodyId;
  /** Empty or whitespace means "no pain reported". */
  painNote: string;
}

export interface BuiltDebrief {
  debrief: ActivityDebrief;
  /**
   * The fixed safety answer, when the note fired the safety layer.
   *
   * Returned rather than stored so the screen shows the layer's own words
   * verbatim — the message, the category and the disclaimer — instead of the
   * debrief screen paraphrasing an emergency.
   */
  safety: SafetyResponse | null;
}

/** Clamp without inventing: the UI only offers 1–10, this guards a bad caller. */
function clampEffort(n: number): number {
  if (!Number.isFinite(n)) return DEBRIEF_EFFORT.min;
  return Math.min(DEBRIEF_EFFORT.max, Math.max(DEBRIEF_EFFORT.min, Math.round(n)));
}

/**
 * Turn three answers into a record. PURE — no storage, no clock of its own.
 *
 * The order inside is the boundary rule made mechanical: `checkSafety` runs on
 * the note before the note is classified as an area, so a description of
 * something acute can never come out the far end labelled "knee".
 */
export function buildDebrief(answers: DebriefAnswers, now = new Date()): BuiltDebrief {
  const note = answers.painNote.trim();

  if (note.length === 0) {
    return {
      debrief: {
        activityId: answers.activityId,
        activityStartedAt: answers.activityStartedAt,
        answeredAt: now.toISOString(),
        effort: clampEffort(answers.effort),
        body: answers.body,
        pain: { reported: false },
      },
      safety: null,
    };
  }

  // FIRST, ALWAYS. See the header.
  const safety = checkSafety(note);

  return {
    debrief: {
      activityId: answers.activityId,
      activityStartedAt: answers.activityStartedAt,
      answeredAt: now.toISOString(),
      effort: clampEffort(answers.effort),
      body: answers.body,
      pain: {
        reported: true,
        note,
        safety: safety ? safety.category : null,
        /* An acute report gets NO area, even when the words contain one. "I fell
           and my ankle is deformed" contains "ankle", and an area on that record
           is an invitation for something downstream to quietly ease Thursday's
           step-ups and consider it handled. */
        area: safety ? null : trainableAreaLabel(note),
      },
    },
    safety,
  };
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

const KEY = "icefall.debriefs.v1";

/** Debriefs kept. Older ones answer nothing anybody asks. */
const MAX_STORED = 200;

export function loadDebriefs(): ActivityDebrief[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityDebrief[];
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped rather than defaulted. A debrief with an
    // invented effort would be an opinion this app attributed to somebody.
    return parsed.filter(
      (d) =>
        typeof d?.activityId === "string" &&
        typeof d?.answeredAt === "string" &&
        typeof d?.effort === "number" &&
        typeof d?.body === "string" &&
        typeof d?.pain === "object",
    );
  } catch {
    return [];
  }
}

let cached: ActivityDebrief[] | null = null;
const listeners = new Set<() => void>();

function read(): ActivityDebrief[] {
  if (cached === null) cached = loadDebriefs();
  return cached;
}

/** Call after writing, so every mounted screen re-reads. Mirrors `feed.ts`. */
export function invalidateDebriefs() {
  cached = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function saveDebrief(d: ActivityDebrief): ActivityDebrief[] {
  // One debrief per activity: answering again replaces the earlier answer
  // rather than stacking two verdicts on one session.
  const next = [d, ...loadDebriefs().filter((x) => x.activityId !== d.activityId)].slice(
    0,
    MAX_STORED,
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Quota. The debrief is still in memory for this session; nothing here is
       important enough to evict an activity for. */
  }
  invalidateDebriefs();
  return next;
}

export function deleteDebrief(activityId: string): ActivityDebrief[] {
  const next = loadDebriefs().filter((d) => d.activityId !== activityId);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  invalidateDebriefs();
  return next;
}

export function useDebriefs(): ActivityDebrief[] {
  return useSyncExternalStore(subscribe, read, () => []);
}

export function useDebriefFor(activityId: string | undefined): ActivityDebrief | undefined {
  const all = useDebriefs();
  return activityId ? all.find((d) => d.activityId === activityId) : undefined;
}
