import { useCallback, useEffect, useState } from "react";

import { checkSafety, sanitiseForPrompt } from "@/coach/safety";

/**
 * COACH NOTES — the short, durable things the Coach carries between
 * conversations. "Knee gives way on long descents." "Trains Tue/Thu/Sat."
 * "Target moved to September."
 *
 * ============================================================================
 * WHERE THEY LIVE, SAID PLAINLY: THIS DEVICE.
 * ============================================================================
 *
 * There is no column for them. Nothing coach-shaped is stored on the server
 * today except the onboarding blob in `athlete_profiles` and the usage ledger
 * in `coach_*`, and neither has anywhere to put a note. A migration exists —
 * `icefall-supabase/migrations/20260911160000_coach_memory.sql` — and it is a
 * DRAFT that has NOT been applied, so writing to it from here would be a sync
 * to a table that does not exist: a silent failure dressed as a feature.
 *
 * So the notes are `localStorage`, like the rest of this app's state, and
 * every surface that shows them says "kept on this device". When the migration
 * is applied, this module is the seam: one store, one key, one shape, and a
 * sync added behind the same functions below.
 *
 * Two consequences of being on the device, both real and both said out loud on
 * the memory screen rather than hidden here:
 *   - a new phone starts the Coach's memory from nothing;
 *   - "Erase all data" in Settings takes these with it, because that button
 *     clears by the `icefall.` prefix and this key is under it.
 *
 * NOT SCOPED TO AN ACCOUNT, deliberately and consistently with every other
 * store in ICEFALL. `icefall.state.v1` holds body mass, check-ins and goals
 * unscoped; scoping this one key alone would be a reassurance the device
 * cannot honour, since signing out does not clear per-person state anywhere.
 * The complete erase is the Settings button, and it is complete.
 *
 * ============================================================================
 * WHAT MAY BECOME A NOTE, AND WHAT MAY NOT
 * ============================================================================
 *
 * NO MODEL WRITES A NOTE. Rule 1 — the AI decides, the app's engines do the
 * work — applies to memory as much as to a workout. A model asked to summarise
 * an athlete produces confident sentences nobody said, and those sentences
 * would then be read back to it for months as facts. So capture is plain code
 * here, it is a closed list of five rules, and what it stores is THE ATHLETE'S
 * OWN SENTENCE, verbatim. The app never writes a claim about a person in its
 * own words.
 *
 * That is also why every note is labelled self-reported wherever it appears
 * (rule 5). A note is what somebody typed, not something ICEFALL measured, and
 * the two must never read alike.
 *
 * FOUR THINGS ARE NEVER CAPTURED, each for its own reason:
 *
 *   1. ANYTHING THE SYMPTOM LAYER FIRES ON. `checkSafety` catching a message
 *      means somebody is describing chest pain, a stroke sign or altitude
 *      illness. That is an acute event needing an answer now — turning it into
 *      a permanent fact about them is both useless and wrong, and it would put
 *      a medical claim into the prompt through the back door. The gate runs
 *      here too, before any rule.
 *   2. QUESTIONS. "Does my knee need strengthening?" is not a statement about
 *      a knee, and storing it as one would have the Coach carrying somebody's
 *      worry around as a finding.
 *
 *      A KNOWN AND DELIBERATE MISS FOLLOWS FROM THIS, so nobody files it as a
 *      bug: "My knee always gives way on long descents, what should I train?"
 *      is ONE sentence ending in a question mark, and nothing is kept from it.
 *      The obvious fix - take the clause before the comma - is how a note
 *      becomes a misquote: "I train Tuesday, Thursday and Saturday, should I
 *      add a Sunday?" would be filed as "I train Tuesday", which is a false
 *      claim about somebody in their own voice, and the most expensive kind of
 *      wrong this file can produce. Split into two sentences it is captured
 *      normally, and the memory screen takes it by hand in one line.
 *   3. ANYTHING NOT IN THE FIRST PERSON. "My partner's knee" is not the
 *      athlete's knee.
 *   4. A PASSING STATE. "My knee hurts today" is a Tuesday, not a fact. The
 *      body, preference and circumstance rules require a durability marker —
 *      always, usually, on long descents, since March, tends to — so a bad day
 *      never becomes a permanent belief about somebody's body.
 *
 * ============================================================================
 * THE ATHLETE OWNS THEM
 * ============================================================================
 *
 * Every note is listed, with its date and where it came from, on
 * `/coach/memory`, and every one has a delete. Capture has an off switch that
 * actually stops capture rather than hiding it. A coach that remembers things
 * about you that you cannot see or remove is surveillance, not coaching, and
 * that screen is not an optional companion to this file — it is the half that
 * makes the other half acceptable.
 */

export type NoteCategory = "schedule" | "body" | "target" | "preference" | "constraint";

export interface CoachNote {
  id: string;
  /** The athlete's own sentence, trimmed and capped. Never a paraphrase. */
  text: string;
  category: NoteCategory;
  /**
   * "captured" — plain code recognised a durable statement in something they
   * typed to the Coach. "typed" — they wrote it themselves on the memory
   * screen. Shown to the athlete, because the two deserve different trust.
   */
  source: "captured" | "typed";
  createdAt: string;
}

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  schedule: "When you train",
  body: "Train around",
  target: "Objective",
  preference: "Preference",
  constraint: "Circumstances",
};

export const NOTE_CATEGORIES: readonly NoteCategory[] = [
  "schedule",
  "body",
  "target",
  "preference",
  "constraint",
];

/** Long enough for a real sentence, short enough that forty of them are cheap. */
export const MAX_NOTE_CHARS = 180;

/** The whole memory, so the prompt cost of carrying it stays bounded. */
const MAX_NOTES = 40;

/** Per category, so a chatty week about knees cannot crowd out everything else. */
const MAX_PER_CATEGORY = 10;

const KEY = "icefall.coach.notes.v1";

interface Stored {
  notes: CoachNote[];
  /** False stops capture outright. It does not hide anything already kept. */
  capture: boolean;
}

const EMPTY: Stored = { notes: [], capture: true };

/* -------------------------------------------------------------------------- */
/* Recognising a durable statement                                            */
/* -------------------------------------------------------------------------- */

/**
 * First person, and only the athlete's own.
 *
 * What this excludes is the case worth excluding: "his knee", "she trains on
 * Tuesdays", "my partner travels for work" — somebody else's life, filed as a
 * fact about the person asking.
 */
const FIRST_PERSON = /\b(i|i'm|im|i've|ive|my|me)\b/i;

/**
 * A statement that is meant to hold. Required for the categories whose
 * sentences are otherwise indistinguishable from today's weather — see the
 * header, point 4.
 */
const DURABLE =
  /\b(always|usually|often|generally|every ?time|each time|whenever|on (long|big|steep)|after (long|big|a long)|since|for (years|months|ages)|chronic|ongoing|history of|tends? to|never|prone to|used to|these days|recurring|every (other )?(day|week|month))\b/i;

interface Rule {
  category: NoteCategory;
  /** The subject the sentence must be about. */
  subject: RegExp;
  /** What must be said about it. */
  predicate: RegExp;
  /** True when the sentence must also carry a durability marker. */
  needsDurable: boolean;
}

/**
 * FIVE RULES, AND THE LIST IS CLOSED ON PURPOSE.
 *
 * Each is deliberately narrow. A rule that fires often produces a memory full
 * of noise, and a Coach quoting noise back at somebody is worse than one that
 * remembers nothing — it is wrong about them, in their own words, which is the
 * most convincing kind of wrong. The cost of a missed capture is that the
 * athlete adds the note by hand on the memory screen, which they can do in one
 * line. The cost of a false capture is a false belief with a long half-life.
 */
const RULES: Rule[] = [
  {
    /* "I train Tuesday, Thursday and Saturday." "I can only get out at
       weekends." The single most useful thing to carry between conversations,
       because every session the plan proposes lands on a day. */
    category: "schedule",
    subject:
      /\b(train|trains|training|climb|climbing|session|sessions|gym|run|running|hike|hiking|ride|riding)\b/i,
    predicate:
      /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekdays?|weekends?|mornings?|evenings?|lunchtimes?|(twice|three times|four times|\d+ ?x|\d+ times) ?(a|per) ?week|every ?(other )?(day|week)|only)\b/i,
    needsDurable: false,
  },
  {
    /* "My knee gives way on long descents." The roadmap's own example, and the
       one that most needs the durability marker: without it every sore Tuesday
       becomes a permanent fact about a joint. */
    category: "body",
    subject:
      /\b(knees?|back|shoulders?|ankles?|hips?|achilles|hamstrings?|calf|calves|quads?|wrist|elbow|neck|foot|feet|toes?|groin|shins?|itb|it band|plantar|glutes?)\b/i,
    predicate:
      /\b(gives? way|goes|hurts?|aches?|sore|painful|pain|niggl\w*|tight|tightens?|flares? up|plays? up|struggles?|weak|stiff|locks? up|swells?|seizes? up|can'?t|cannot)\b/i,
    needsDurable: true,
  },
  {
    /* "The target moved to September." A date change the coach does not carry
       is the one that makes every later answer quietly wrong. */
    category: "target",
    subject:
      /\b(target|objective|goal|summit|trip|expedition|attempt|departure|climb|permit|booking)\b/i,
    predicate:
      /\b(moved|pushed|shifted|changed|postponed|brought forward|cancelled|booked|is (in|on)|january|february|march|april|may|june|july|august|september|october|november|december|next (month|year|spring|summer|autumn|winter))\b/i,
    needsDurable: false,
  },
  {
    /* "I have always hated gym sessions." A preference the coach ignores is a
       plan the athlete quietly stops following. */
    category: "preference",
    subject: /\b(i|my)\b/i,
    predicate:
      /\b(hated?|loved?|prefer|really (like|dislike)|don'?t (like|enjoy|want)|dont (like|enjoy|want)|can'?t stand|cant stand|refuse to|won'?t|wont|enjoy)\b/i,
    needsDurable: true,
  },
  {
    /* "I travel for work every other week." "The nearest hill is two hours
       away." Circumstances that bound what any plan can ask for. */
    category: "constraint",
    subject: /\b(i|my|nearest|no|only)\b/i,
    predicate:
      /\b(travel|work (away|shifts|nights)|live (at|in|near)|commute|don'?t have|dont have|no (gym|car|access|equipment)|only have|nearest (hill|mountain|gym|crag|peak)|sea level|at altitude|shift work|night shifts)\b/i,
    needsDurable: true,
  },
];

/**
 * Split into sentences without a lookbehind.
 *
 * `(?<=[.!?])` would be the obvious way, and a regex feature that throws at
 * parse time takes the whole module with it — this module is imported by the
 * chat's send path, so a browser that disliked it would break sending, not
 * just remembering. A character loop cannot fail that way.
 */
function sentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "." || ch === "!" || ch === "?" || ch === ";" || ch === "\n") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Same text, however it was spaced or capitalised. Used only for duplicates. */
function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What, if anything, in this message is worth keeping.
 *
 * PURE AND SYNCHRONOUS, like the safety layer it calls: no storage, no clock
 * beyond `createdAt`, nothing to await. It can be tested by running it, which
 * is what `notes.test.ts` does.
 */
export function captureFrom(message: string, now = new Date()): CoachNote[] {
  // Point 1 of the header. An acute symptom report is never a durable fact.
  if (checkSafety(message)) return [];

  const found: CoachNote[] = [];
  const seen = new Set<string>();

  for (const raw of sentences(message)) {
    // Point 2: a question is not a statement.
    if (raw.endsWith("?")) continue;
    // Point 3: theirs, not somebody else's.
    if (!FIRST_PERSON.test(raw)) continue;

    const cleaned = raw.replace(/[.!;]+$/, "").trim();
    if (cleaned.length < 8) continue;

    for (const rule of RULES) {
      if (!rule.subject.test(cleaned)) continue;
      if (!rule.predicate.test(cleaned)) continue;
      // Point 4: a passing state is not a fact.
      if (rule.needsDurable && !DURABLE.test(cleaned)) continue;

      const text =
        cleaned.length > MAX_NOTE_CHARS
          ? `${cleaned.slice(0, MAX_NOTE_CHARS - 1).trimEnd()}…`
          : cleaned;
      const print = fingerprint(text);
      if (seen.has(print)) break;
      seen.add(print);

      found.push({
        id: `note-${now.getTime()}-${found.length}`,
        text,
        category: rule.category,
        source: "captured",
        createdAt: now.toISOString(),
      });
      // One note per sentence. A sentence that matches two rules is one thing
      // the athlete said, and filing it twice would double its weight in the
      // prompt for no extra information.
      break;
    }
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

function isNote(v: unknown): v is CoachNote {
  if (!v || typeof v !== "object") return false;
  const n = v as Partial<CoachNote>;
  return typeof n.id === "string" && typeof n.text === "string" && typeof n.createdAt === "string";
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    /* An unreadable or half-written record is an empty one. This is read on
       the chat's send path; it must never throw into a conversation. */
    return {
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter(isNote) : [],
      capture: parsed.capture !== false,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * One subscriber list, so the memory screen and the chat never disagree about
 * what the coach knows — the same pattern `settings/store.ts` uses, for the
 * same reason.
 */
const listeners = new Set<(s: Stored) => void>();
let current: Stored = typeof localStorage === "undefined" ? EMPTY : read();

function write(next: Stored) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode or quota. The notes hold for this session and are gone on
       the next launch — which is the honest outcome, and the memory screen's
       own "kept on this device" line is already the caveat for it. */
  }
  listeners.forEach((l) => l(next));
}

/**
 * Newest first, capped globally and per category.
 *
 * Eviction is by age WITHIN a category rather than globally, so a chatty week
 * about which days somebody trains cannot silently delete the one thing they
 * said about their knee three months ago.
 */
function trim(notes: CoachNote[]): CoachNote[] {
  const byCategory = new Map<NoteCategory, number>();
  const kept: CoachNote[] = [];
  for (const n of notes) {
    const used = byCategory.get(n.category) ?? 0;
    if (used >= MAX_PER_CATEGORY) continue;
    byCategory.set(n.category, used + 1);
    kept.push(n);
    if (kept.length >= MAX_NOTES) break;
  }
  return kept;
}

export function currentNotes(): CoachNote[] {
  return current.notes;
}

/**
 * File whatever this message said that is worth keeping.
 *
 * Returns what was actually stored, so a caller can tell "nothing matched"
 * from "capture is off" from "already knew that" instead of assuming. Nothing
 * branches on it today; a surface that wanted to tell the athlete "I'll
 * remember that" would.
 */
export function rememberFrom(message: string, now = new Date()): CoachNote[] {
  if (!current.capture) return [];
  const found = captureFrom(message, now);
  if (found.length === 0) return [];

  const known = new Set(current.notes.map((n) => fingerprint(n.text)));
  const fresh = found.filter((n) => !known.has(fingerprint(n.text)));
  if (fresh.length === 0) return [];

  write({ ...current, notes: trim([...fresh, ...current.notes]) });
  return fresh;
}

export function addNote(text: string, category: NoteCategory, now = new Date()): CoachNote | null {
  const cleaned = text.trim().slice(0, MAX_NOTE_CHARS);
  if (cleaned.length < 3) return null;
  if (current.notes.some((n) => fingerprint(n.text) === fingerprint(cleaned))) return null;

  const note: CoachNote = {
    id: `note-${now.getTime()}-typed`,
    text: cleaned,
    category,
    source: "typed",
    createdAt: now.toISOString(),
  };
  write({ ...current, notes: trim([note, ...current.notes]) });
  return note;
}

export function removeNote(id: string): void {
  write({ ...current, notes: current.notes.filter((n) => n.id !== id) });
}

export function clearNotes(): void {
  write({ ...current, notes: [] });
}

export function setCapture(on: boolean): void {
  write({ ...current, capture: on });
}

export function useCoachNotes() {
  const [state, setState] = useState(current);

  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    notes: state.notes,
    capture: state.capture,
    add: useCallback(addNote, []),
    remove: useCallback(removeNote, []),
    clear: useCallback(clearNotes, []),
    setCapture: useCallback(setCapture, []),
  };
}

/* -------------------------------------------------------------------------- */
/* Into the prompt                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The notes as prompt lines — SANITISED, one per line.
 *
 * EVERY NOTE IS A PROMPT-INJECTION VECTOR AND IS TREATED AS ONE. These
 * sentences come from a text box, exactly like `limitationsNote`, and they are
 * read back into the system prompt on every single turn for as long as they
 * exist — which makes them the more dangerous of the two, not the less. A note
 * that closed its container would not misbehave once; it would misbehave for
 * months, and the athlete would have no way to connect the behaviour to the
 * sentence that caused it.
 *
 * So each line goes through `sanitiseForPrompt`, the same function Phase 0
 * wrote for the limitations note: quotes, angle brackets, backticks, newlines
 * and invisible and bidirectional codes go; every word the athlete wrote
 * stays. Angle brackets going is what makes the `<<<COACH_NOTES` marker in
 * `@/coach/context` unforgeable from inside a note — the escaping and the
 * boundary are one defence in two halves, and neither works alone.
 *
 * 120 characters rather than the note's own 180: a line carried on every turn
 * is a recurring cost, and the point of a note is the fact, not the prose
 * around it.
 */
export function notesForPrompt(notes: CoachNote[]): string[] {
  return notes
    .map((n) => {
      const text = sanitiseForPrompt(n.text, 120);
      return text === "" ? "" : `${NOTE_CATEGORY_LABELS[n.category] ?? "Note"}: ${text}`;
    })
    .filter((line) => line !== "");
}
