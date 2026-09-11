import { SAFETY_CATEGORIES, SAFETY_DISCLAIMER, SAFETY_MESSAGES } from "@/coach/safety";
import type { SafetyCategory, SafetyResponse } from "@/coach/safety";

/**
 * THE LANGUAGE THE COACH ANSWERS IN — and the one thing that is never
 * translated.
 *
 * Phase 2, step 3. The interface stays English. What changes is the coach's
 * prose: an athlete who reads Spanish should be able to ask their coach a
 * question and be answered in Spanish, on a screen whose tab bar still says
 * PLAN.
 *
 * ============================================================================
 * HOW THE LANGUAGE IS DECIDED, AND WHY IT IS NOT DETECTED
 * ============================================================================
 *
 * Three candidates were on the table: a stored preference, the browser, or the
 * language they wrote the message in. The order below uses the first two and
 * deliberately refuses the third.
 *
 *   1. A STORED PREFERENCE, set on Settings. Explicit, stable, and — the part
 *      that decides it — REVERSIBLE by the person it affects.
 *
 *   2. THE BROWSER, `navigator.language`, used only to seed the default when
 *      nobody has chosen. A phone set to Spanish is a real signal about its
 *      owner and it costs nothing to honour.
 *
 *   3. THE LANGUAGE OF THE MESSAGE — REJECTED. Chat messages here are short
 *      and full of proper nouns: "Mont Blanc?", "ok", "5km + 800m?", "Hörnli
 *      ridge". A detector fed those will guess, and it will guess differently
 *      on consecutive turns, so the coach would change language mid-thread for
 *      reasons the athlete cannot see and cannot switch off. Worse, the athlete
 *      has no way to correct it: a preference has a control, a detector has
 *      none. Mountaineering is also a code-switching trade — half the technical
 *      vocabulary in any European language is French or German — so the signal
 *      is noisy exactly where it looks strongest.
 *
 * ============================================================================
 * WHY THE LIST IS CLOSED
 * ============================================================================
 *
 * `navigator.language` could be turned into a language NAME for anything at
 * all with `Intl.DisplayNames`, and the model would then be asked to reply in
 * a language nobody at ICEFALL can read. On a product whose subject is what to
 * do on a mountain, an answer nobody can check is not a feature. So the list
 * below is explicit and short, every entry names itself in its own script so
 * the Settings row is legible to the person choosing it, and anything not on
 * it resolves to English.
 *
 * ============================================================================
 * THE PART THAT IS NEVER TRANSLATED
 * ============================================================================
 *
 * `@/coach/safety` holds eleven fixed messages. They are the app's answer to
 * somebody describing stroke signs, chest pain, a bleed, or the symptoms of
 * HACE at 4,200 m, and several of them contain an instruction to descend or to
 * call an emergency number. They are fixed, rather than generated, precisely
 * so that no model composes them.
 *
 * A translation produced at request time would put the model back in the
 * middle of exactly that sentence, in a language whose output nobody has read.
 * "Descend now" and "descend if it does not improve" differ by one clause and
 * by an outcome. So:
 *
 *   · Safety messages are looked up in `REVIEWED_SAFETY_TRANSLATIONS`, a table
 *     of translations a HUMAN has reviewed and signed.
 *   · THAT TABLE IS EMPTY TODAY. Nobody has reviewed one. So every category in
 *     every language falls back to the English message, byte for byte, and
 *     `coach/language.test.ts` asserts exactly that for all eleven categories
 *     across every language on the list.
 *   · An entry is IGNORED unless it carries `reviewedBy` and `reviewedOn`. A
 *     contributor cannot paste machine output in without writing a person's
 *     name next to it, which is the point: the guard is a signature, not a
 *     comment.
 *
 * `@/coach/safety` itself is NOT modified by any of this and keeps its zero
 * imports — the dependency runs one way, from here to there. `checkSafety`
 * still runs first, still decides alone, and this module can only choose which
 * already-written string is shown.
 */

/* -------------------------------------------------------------------------- */
/* The languages the coach may be asked to answer in                           */
/* -------------------------------------------------------------------------- */

export type ReplyLanguage = "en" | "es" | "fr" | "de" | "it" | "pt" | "nl" | "pl" | "ne" | "ja";

export interface ReplyLanguageInfo {
  code: ReplyLanguage;
  /** In English, for prompts and for anything the app logs. */
  englishName: string;
  /** In its own script, for the control the athlete actually uses. */
  nativeName: string;
}

/**
 * The closed list.
 *
 * Chosen for where ICEFALL's curated objectives are and who climbs there, not
 * by speaker count. Adding one is a deliberate act: it puts the model in front
 * of an athlete in a language the team should be able to spot-check.
 */
export const REPLY_LANGUAGES: readonly ReplyLanguageInfo[] = [
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "es", englishName: "Spanish", nativeName: "Español" },
  { code: "fr", englishName: "French", nativeName: "Français" },
  { code: "de", englishName: "German", nativeName: "Deutsch" },
  { code: "it", englishName: "Italian", nativeName: "Italiano" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português" },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands" },
  { code: "pl", englishName: "Polish", nativeName: "Polski" },
  { code: "ne", englishName: "Nepali", nativeName: "नेपाली" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語" },
] as const;

export const DEFAULT_REPLY_LANGUAGE: ReplyLanguage = "en";

export function languageInfo(code: ReplyLanguage): ReplyLanguageInfo {
  return REPLY_LANGUAGES.find((l) => l.code === code) ?? REPLY_LANGUAGES[0];
}

function isReplyLanguage(v: unknown): v is ReplyLanguage {
  return typeof v === "string" && REPLY_LANGUAGES.some((l) => l.code === v);
}

/**
 * A BCP-47 tag to one of ours, or null.
 *
 * Only the primary subtag is read: `es-419`, `es-AR` and `es` are the same
 * language to a coach writing three paragraphs about a training week, and
 * pretending to distinguish them would mean claiming a regional register this
 * app has not written.
 */
export function languageFromTag(tag: string | null | undefined): ReplyLanguage | null {
  const primary = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return isReplyLanguage(primary) ? primary : null;
}

/* -------------------------------------------------------------------------- */
/* Where the choice is kept                                                    */
/* -------------------------------------------------------------------------- */

/**
 * On the device, in its own key, and deliberately not in `AppState`.
 *
 * Same answer as `coach/conversations.ts`, `coach/notes.ts` and the adjustment
 * layer, for the same two reasons Phase 2 wrote down: there is no column for
 * this on the server, and a write to a missing table fails silently and looks
 * exactly like working. The second reason is the one that matters here — the
 * coach has to answer in the athlete's language on a mountain with no signal,
 * and a preference that needed the network would be English by the time it
 * mattered.
 */
const STORAGE_KEY = "icefall.coach.language.v1";

/** `null` when nobody has chosen; the caller then falls back to the browser. */
export function storedReplyLanguage(): ReplyLanguage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isReplyLanguage(raw) ? raw : null;
  } catch {
    // Private mode, or storage disabled. English, and nothing breaks.
    return null;
  }
}

export function setReplyLanguage(code: ReplyLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* A preference that cannot be saved is still honoured for this session by
       the caller's own state; there is nothing useful to report here. */
  }
}

/** The browser's own setting, if it is one we will answer in. */
export function browserReplyLanguage(): ReplyLanguage | null {
  if (typeof navigator === "undefined") return null;
  const tags =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  for (const tag of tags) {
    const hit = languageFromTag(tag);
    if (hit) return hit;
  }
  return null;
}

/**
 * The answer, in one call: stored choice, else the browser, else English.
 *
 * Pure apart from the two reads, and both of those are guarded, so this is
 * safe to call during render and safe to call in a test runner with no DOM.
 */
export function resolveReplyLanguage(): ReplyLanguage {
  return storedReplyLanguage() ?? browserReplyLanguage() ?? DEFAULT_REPLY_LANGUAGE;
}

/* -------------------------------------------------------------------------- */
/* What the model is told                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The language instruction for the system prompt.
 *
 * Empty for English, because the prompt already ends with "British English,
 * plain and direct" and a second sentence saying the same thing is tokens the
 * athlete pays for on every turn.
 *
 * THE SCREEN NAMES ARE NOT TRANSLATED, and that is the half of this that is
 * easy to lose. The coach says things like "Explore → Treks has the full
 * catalogue" and "check it on the Plan screen". Translated, those become
 * directions to controls that do not exist under those names, and the athlete
 * hunts for a tab that is not there. So the instruction is explicit: the prose
 * changes language, the app's own nouns do not.
 */
export function languageInstruction(code: ReplyLanguage): string {
  if (code === "en") return "";
  const { englishName } = languageInfo(code);
  return `
LANGUAGE
- Write your reply in ${englishName}. Everything you say to them, including any caveat or deferral, is in ${englishName}.
- The APP IS IN ENGLISH. Leave ICEFALL's own screen, tab and feature names exactly as they are — Plan, Coach, Explore, Treks, Fuel, Readiness, Settings, Activity — even mid-sentence. A translated tab name sends them looking for a control that does not exist.
- Units, dates and figures keep the form they were given to you in. Do not convert metres to feet, and do not re-order a date.
- If a technical term has no settled ${englishName} equivalent, give the English one and explain it rather than inventing a word.`;
}

/* -------------------------------------------------------------------------- */
/* The safety messages, and the table that is empty                            */
/* -------------------------------------------------------------------------- */

/**
 * A translation of one fixed safety message that a PERSON has read.
 *
 * `reviewedBy` and `reviewedOn` are required, and an entry missing either is
 * ignored by the resolver below. That is not bureaucracy: the failure this
 * guards against is somebody pasting machine output into the table because the
 * English card looked unfriendly, and the only reliable way to stop it is to
 * make the paste require a name.
 *
 * A reviewer is asserting one thing, and it is narrower than "this is good
 * Spanish": that the INSTRUCTION is the same instruction. Descend now versus
 * descend if it does not improve. Call an ambulance versus see a doctor.
 * Nothing to eat or drink versus keep them hydrated.
 */
export interface ReviewedSafetyMessage {
  body: string;
  reviewedBy: string;
  /** ISO date. */
  reviewedOn: string;
}

/**
 * EMPTY, AND THAT IS THE CURRENT STATE OF THE WORLD RATHER THAN A STUB.
 *
 * Phase 0 noted that the symptom layer's non-English vocabulary is thin: it
 * matches a handful of loan words and little else, so a message describing
 * chest pain in Spanish may not even reach the gate. That is a separate,
 * known gap. What this table settles is the other half — that when the gate
 * DOES fire, the athlete gets a sentence somebody has read.
 *
 * Nobody has read one yet. So this stays `{}`, every lookup falls back to
 * English, and `language.test.ts` proves it for all eleven categories in every
 * language on the list. When a real translation arrives, it arrives here with
 * a name against it and nothing else in the app changes.
 */
export const REVIEWED_SAFETY_TRANSLATIONS: Partial<
  Record<ReplyLanguage, Partial<Record<SafetyCategory, ReviewedSafetyMessage>>>
> = {};

/** Same table, same rule, for the strip that hangs under every safety card. */
export const REVIEWED_SAFETY_DISCLAIMERS: Partial<Record<ReplyLanguage, ReviewedSafetyMessage>> =
  {};

function isSigned(entry: ReviewedSafetyMessage | undefined): entry is ReviewedSafetyMessage {
  return (
    entry !== undefined &&
    typeof entry.body === "string" &&
    entry.body.trim() !== "" &&
    typeof entry.reviewedBy === "string" &&
    entry.reviewedBy.trim() !== "" &&
    typeof entry.reviewedOn === "string" &&
    entry.reviewedOn.trim() !== ""
  );
}

export interface LocalisedSafety {
  body: string;
  disclaimer: string;
  /** The language the athlete is actually reading. `en` whenever we fell back. */
  shownIn: ReplyLanguage;
  /** True when their language was not English and no reviewed text existed. */
  fellBackToEnglish: boolean;
}

/**
 * The safety card's text in the athlete's language, or in English.
 *
 * Takes the `SafetyResponse` the gate already produced rather than a category,
 * so there is no path from here to a message the gate did not choose. This
 * function can pick between two strings; it cannot create one, cannot call
 * anything, and returns the gate's own body untouched whenever there is no
 * signed translation — which, today, is always.
 */
export function localiseSafety(
  safety: SafetyResponse,
  code: ReplyLanguage = resolveReplyLanguage(),
): LocalisedSafety {
  if (code === "en") {
    return {
      body: safety.body,
      disclaimer: safety.disclaimer,
      shownIn: "en",
      fellBackToEnglish: false,
    };
  }

  const body = REVIEWED_SAFETY_TRANSLATIONS[code]?.[safety.category];
  const disclaimer = REVIEWED_SAFETY_DISCLAIMERS[code];

  /*
   * BOTH OR NEITHER. A translated instruction under an English caution strip,
   * or the reverse, is a card half of which the reader cannot use — and the
   * strip is the part that says this is not a medical service. If either side
   * is unsigned, the whole card stays in the language it was written in.
   */
  if (!isSigned(body) || !isSigned(disclaimer)) {
    return {
      body: safety.body,
      disclaimer: safety.disclaimer,
      shownIn: "en",
      fellBackToEnglish: true,
    };
  }

  return { body: body.body, disclaimer: disclaimer.body, shownIn: code, fellBackToEnglish: false };
}

/**
 * Every category the gate can produce, for the test that walks all of them.
 *
 * Re-exported rather than re-listed: a category added to `safety.ts` must
 * appear in that test without anybody remembering to add it here.
 */
export { SAFETY_CATEGORIES, SAFETY_DISCLAIMER, SAFETY_MESSAGES };
export type { SafetyCategory, SafetyResponse };

/* -------------------------------------------------------------------------- */
/* The scripted coach only speaks English                                      */
/* -------------------------------------------------------------------------- */

/**
 * THE HONEST LABEL ON THE OFFLINE ANSWER.
 *
 * The scripted coach is a table of hand-written English replies in
 * `@/services/coach`. It answers when the device is offline, when the athlete
 * is signed out, when the allowance is spent and on a demo build — i.e. in
 * exactly the conditions this feature was justified by. There is no version of
 * it in any other language, and machine-translating those replies at request
 * time would hand the model the one path that was built to work without it.
 *
 * So a non-English athlete gets English there, and is TOLD so rather than left
 * to wonder whether the app forgot. The sentence itself is in English, which is
 * the least-bad option available and not a good one: it is the same table
 * above, with the same signature rule, and it will read in their language on
 * the day somebody reviews one.
 */
export const SCRIPTED_ENGLISH_ONLY_NOTE =
  "Answered offline, and the offline coach only writes English.";

export const REVIEWED_SCRIPTED_NOTES: Partial<Record<ReplyLanguage, ReviewedSafetyMessage>> = {};

export function scriptedEnglishOnlyNote(code: ReplyLanguage): string | null {
  if (code === "en") return null;
  const reviewed = REVIEWED_SCRIPTED_NOTES[code];
  return isSigned(reviewed) ? reviewed.body : SCRIPTED_ENGLISH_ONLY_NOTE;
}
