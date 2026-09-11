/**
 * THE LAKE LOUISE SELF-CHECK — A QUESTIONNAIRE, SCORED. NOT A DIAGNOSIS.
 *
 * ============================================================================
 * WHAT THIS IS, AND THE SENTENCE IT MAY NEVER SAY
 * ============================================================================
 *
 * The Lake Louise Acute Mountain Sickness Score is a self-assessment
 * questionnaire published by the Lake Louise consensus group and revised in
 * 2018. It is four questions, each scored 0-3, plus a separate functional
 * question that is NOT added to the total. That is the whole instrument.
 *
 * ICEFALL administers it, adds it up, and reports the total in the
 * questionnaire's own published terms. It does NOT tell anybody what is wrong
 * with them. "You have acute mountain sickness" is a sentence a doctor says
 * after examining a person; it is not a sentence a form says, and it is not a
 * sentence this app says. A headache at 4,200 m can be altitude, dehydration,
 * a bad night, a migraine, fumes from a stove in a closed tent, or a virus that
 * would have arrived at sea level. A four-question form cannot tell those
 * apart and neither can we.
 *
 * So every string below is a statement about the SCORE — "3 or more with a
 * headache is the threshold the questionnaire counts as positive; yours is 6"
 * — and never a statement about the body. `NOT_A_DIAGNOSIS` is exported and
 * carried on every single result, including the clear one.
 *
 * ============================================================================
 * WHY THE ESCALATION IS PLAIN CODE, AND WHY IT BORROWS ITS VOICE
 * ============================================================================
 *
 * House rule 5: SAFETY NEVER DEPENDS ON THE MODEL. `coach/safety.ts` already
 * established the shape — no imports, no network, no session, no tier — and
 * this module is its sibling rather than its replacement. `safety.ts` answers
 * "somebody typed a symptom into a chat box"; this file answers "somebody sat
 * down and filled in the form". Different doors, same building.
 *
 * THE ESCALATION ROUTES INTO `safety.ts` RATHER THAN AUTHORING A THIRD VOICE.
 * The two altitude cards there are already the right words, already red-teamed,
 * already passing their own corpus:
 *
 *   · `SAFETY_MESSAGES["altitude-severe"]` carries the unconditional descent
 *     instruction — "several hundred metres, tonight, not in the morning".
 *   · `SAFETY_MESSAGES["altitude-ams"]` carries "gain no more height, including
 *     sleeping height".
 *
 * An athlete who types "headache and I'm stumbling" into the coach and an
 * athlete who scores it on this form must be told the same thing in the same
 * words. Two wordings for one situation is how a person learns to shop around
 * for the gentler one.
 *
 * THIS FILE IMPORTS EXACTLY ONE MODULE, AND THAT MODULE IMPORTS NOTHING. So
 * the whole chain is unreachable by `fetch`, Supabase, React state, a
 * subscription tier or a network condition. There is no build, no plan, no
 * signed-out session and no aeroplane mode in which the descent advice below
 * fails to appear. `src/trip/offline.test.ts` walks the import graph and fails
 * if anybody ever adds a second import here.
 *
 * ============================================================================
 * UNANSWERED IS NOT ZERO. THIS IS THE HONESTY RULE THAT COSTS THE MOST CODE
 * ============================================================================
 *
 * A half-filled form does not have a total. Treating an unanswered item as 0
 * would let somebody with a severe headache and three blanks see "your score
 * is 3" when the real answer is "this form is not finished". So the scored
 * items are `LikertScore | null`, and any null puts the result into
 * `state: "incomplete"` with the missing items named.
 *
 * THE RED FLAGS DO NOT WAIT FOR THE FORM. They are checked first and they fire
 * on an incomplete form, because somebody who has ticked "I cannot walk a
 * straight line" has told us the only thing that matters and must not be asked
 * to finish a questionnaire before being told to go down.
 *
 * ============================================================================
 * WHAT IS NOT SCORED, AND WHY THAT IS DELIBERATE
 * ============================================================================
 *
 * SLEEP. The 1991 questionnaire had a fifth item, "difficulty sleeping". The
 * 2018 revision REMOVED it from the score — broken sleep at altitude is close
 * to universal, it is confounded by acetazolamide, and including it inflated
 * the total for people who were well. ICEFALL implements the 2018 instrument,
 * so there is no sleep item here. Do not add one back: it would silently make
 * every score in this app incomparable with every score in the literature and
 * with every score another party on the mountain is using.
 *
 * THE FUNCTIONAL SCORE IS NOT ADDED. The 2018 questionnaire asks, separately,
 * how much the symptoms interfered with activity. It is reported alongside the
 * total and never summed into it, exactly as published.
 */

import { SAFETY_DISCLAIMER, SAFETY_MESSAGES } from "@/coach/safety";

/* -------------------------------------------------------------------------- */
/* The instrument                                                              */
/* -------------------------------------------------------------------------- */

/** Every item on this form is scored 0-3. Nothing here is a free scale. */
export type LikertScore = 0 | 1 | 2 | 3;

/** The four items that make the total. Ids are persisted — do not rename. */
export type LakeLouiseItemId = "headache" | "gastrointestinal" | "fatigue" | "dizziness";

/** Display and scoring order, as published. */
export const LAKE_LOUISE_ITEMS: readonly LakeLouiseItemId[] = [
  "headache",
  "gastrointestinal",
  "fatigue",
  "dizziness",
];

export interface LakeLouiseItem {
  id: LakeLouiseItemId;
  /** The question as the questionnaire asks it. */
  question: string;
  /** The four options, index = score. Published wording, not paraphrased. */
  options: readonly [string, string, string, string];
}

/**
 * THE QUESTIONNAIRE, VERBATIM.
 *
 * These are the 2018 Lake Louise AMS Score items and their published answer
 * options. They are not ICEFALL's words and must not be "improved" — a score
 * is only comparable with anybody else's score if the question that produced
 * it was the same question. If a wording here ever has to change, the change
 * belongs in a revision of the instrument, not in a tidy-up.
 */
export const LAKE_LOUISE_QUESTIONS: Record<LakeLouiseItemId, LakeLouiseItem> = {
  headache: {
    id: "headache",
    question: "Headache",
    options: [
      "No headache",
      "Mild headache",
      "Moderate headache",
      "Severe headache, incapacitating",
    ],
  },
  gastrointestinal: {
    id: "gastrointestinal",
    question: "Gastrointestinal symptoms",
    options: [
      "Good appetite",
      "Poor appetite or nausea",
      "Moderate nausea or vomiting",
      "Severe nausea and vomiting, incapacitating",
    ],
  },
  fatigue: {
    id: "fatigue",
    question: "Fatigue and/or weakness",
    options: [
      "Not tired or weak",
      "Mild fatigue/weakness",
      "Moderate fatigue/weakness",
      "Severe fatigue/weakness, incapacitating",
    ],
  },
  dizziness: {
    id: "dizziness",
    question: "Dizziness/lightheadedness",
    options: [
      "No dizziness/lightheadedness",
      "Mild dizziness/lightheadedness",
      "Moderate dizziness/lightheadedness",
      "Severe dizziness/lightheadedness, incapacitating",
    ],
  },
};

/**
 * The fifth question. ASKED, REPORTED, NEVER ADDED.
 *
 * The published item asks about "AMS symptoms". ICEFALL asks about "these
 * symptoms" instead, pointing at the four questions above — the only change
 * made to any wording on this form, and it is made in the one direction the
 * house rules allow: the published phrasing would have the form assert, in the
 * question itself, that the athlete has the thing being asked about.
 */
export const FUNCTIONAL_QUESTION =
  "Overall, if you had any of the symptoms above, how did they affect your activity?";

export const FUNCTIONAL_OPTIONS: readonly [string, string, string, string] = [
  "Not at all",
  "Symptoms present, but did not force any change in activity or itinerary",
  "My symptoms forced me to stop the ascent or to go down on my own power",
  "Had to be evacuated to a lower altitude",
];

/* -------------------------------------------------------------------------- */
/* The red flags — NOT part of the score                                       */
/* -------------------------------------------------------------------------- */

/**
 * WHAT THE AMS SCORE DOES NOT MEASURE, AND WHY IT IS ASKED FIRST.
 *
 * The Lake Louise consensus defines high-altitude cerebral oedema as AMS plus
 * ataxia or altered mental status, and high-altitude pulmonary oedema by its
 * own separate criteria. NEITHER IS IN THE FOUR-QUESTION SCORE. A person can
 * therefore be stumbling, confused, or coughing pink froth and still total
 * fewer than 3 on the form — and a screen that only added up the four items
 * would show them a reassuring number on the worst night of their life.
 *
 * So these are asked first, they are yes/no, they are never scored, and any
 * one of them answered yes goes straight to the descent card WITHOUT waiting
 * for the rest of the form. They are written in the plainest words available,
 * because the person reading them may not be reading well.
 *
 * THEY ARE ASKED ABOUT THE PARTY, NOT ONLY THE READER. Confusion and drowsiness
 * are the two signs the person who has them is least able to report, which is
 * exactly why the wording says "anyone".
 */
export type RedFlagId =
  | "ataxia"
  | "confusion"
  | "breathless-at-rest"
  | "frothy-cough"
  | "not-rousable";

export const RED_FLAG_ORDER: readonly RedFlagId[] = [
  "ataxia",
  "confusion",
  "breathless-at-rest",
  "frothy-cough",
  "not-rousable",
];

export const RED_FLAG_QUESTIONS: Record<RedFlagId, string> = {
  ataxia:
    "Is anyone unsteady on their feet — stumbling, or unable to walk a straight line heel to toe?",
  confusion: "Is anyone confused, behaving oddly, or not making sense?",
  "breathless-at-rest": "Is anyone short of breath while sitting still, doing nothing?",
  "frothy-cough": "Is anyone coughing up froth, or spit with pink in it?",
  "not-rousable": "Is anyone drowsy and hard to wake, or not waking properly?",
};

/**
 * The heel-to-toe walk is the field test the consensus definition rests on, so
 * the screen says how to do it rather than leaving "unsteady" to interpretation.
 */
export const ATAXIA_TEST_NOTE =
  "Walk a straight line heel to toe for a few steps, with somebody watching and ready to catch you. Not being able to do it is the single most important sign on this page.";

/* -------------------------------------------------------------------------- */
/* Answers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the athlete has filled in so far.
 *
 * `null` is NOT ANSWERED and is never read as 0. See the header. Red flags are
 * `boolean | null` for the same reason: "I have not been asked" and "no" are
 * different states and the result says which it had.
 */
export interface LakeLouiseAnswers {
  items: Record<LakeLouiseItemId, LikertScore | null>;
  functional: LikertScore | null;
  redFlags: Record<RedFlagId, boolean | null>;
}

/** An empty form. Exported so no screen has to build the null shape by hand. */
export function emptyAnswers(): LakeLouiseAnswers {
  return {
    items: { headache: null, gastrointestinal: null, fatigue: null, dizziness: null },
    functional: null,
    redFlags: {
      ataxia: null,
      confusion: null,
      "breathless-at-rest": null,
      "frothy-cough": null,
      "not-rousable": null,
    },
  };
}

/**
 * Narrow whatever came back out of storage into a form this module will score.
 *
 * A stored record is JSON somebody else's build wrote. Anything unrecognised
 * becomes `null` — NOT ANSWERED — because a stale or corrupted value silently
 * read as 0 is how a stored check turns into a reassuring one.
 */
export function asAnswers(raw: unknown): LakeLouiseAnswers {
  const out = emptyAnswers();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;

  const items = typeof r.items === "object" && r.items !== null ? (r.items as Record<string, unknown>) : {};
  for (const id of LAKE_LOUISE_ITEMS) out.items[id] = asLikert(items[id]);

  out.functional = asLikert(r.functional);

  const flags =
    typeof r.redFlags === "object" && r.redFlags !== null
      ? (r.redFlags as Record<string, unknown>)
      : {};
  for (const id of RED_FLAG_ORDER) {
    out.redFlags[id] = typeof flags[id] === "boolean" ? (flags[id] as boolean) : null;
  }

  return out;
}

function asLikert(v: unknown): LikertScore | null {
  return v === 0 || v === 1 || v === 2 || v === 3 ? (v as LikertScore) : null;
}

/* -------------------------------------------------------------------------- */
/* Published thresholds                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The published positive threshold: a headache scoring at least 1, together
 * with a total of 3 or more across the four items, after a recent gain in
 * altitude. Both halves are required — a total of 3 made of fatigue and nausea
 * with no headache at all does NOT meet it, and the form says so rather than
 * rounding up.
 */
export const HEADACHE_MINIMUM = 1;
export const POSITIVE_TOTAL = 3;

/** The published severity bands, which apply only once the threshold is met. */
export const BANDS = [
  { id: "mild", from: 3, to: 5 },
  { id: "moderate", from: 6, to: 9 },
  { id: "severe", from: 10, to: 12 },
] as const;

export type BandId = (typeof BANDS)[number]["id"];

/**
 * The precondition the questionnaire itself carries and this app cannot check.
 *
 * The instrument is only meaningful in somebody who has recently gained
 * altitude. ICEFALL does not know whether you have — a trip record holds the
 * altitudes you typed in, which is not a measurement — so it states the
 * precondition rather than quietly assuming it.
 */
export const RECENT_ASCENT_PRECONDITION =
  "This questionnaire is written for somebody who has recently gone higher. At sea level the same four questions describe an ordinary bad morning, and the threshold below means nothing.";

/** Carried on EVERY result, including "clear". */
export const NOT_A_DIAGNOSIS =
  "This is a questionnaire, not an examination. It reports what you ticked and nothing else. ICEFALL cannot tell altitude illness apart from dehydration, a bad night, a migraine, fumes in a tent or a virus you brought with you — a doctor can. Nobody should be told they are fine by a form, and this form has never told anybody that.";

/**
 * THE LINE THAT IS ON EVERY RESULT AT EVERY SCORE.
 *
 * Including zero. Including an unfinished form. Descending is the one response
 * that always works at altitude, it costs nothing to state, and the moment it
 * is shown only above a threshold it becomes a thing the app has decided you
 * are allowed to hear.
 */
export const DESCENT_IS_ALWAYS_AVAILABLE =
  "Going down is always available to you, whatever this form says. It needs no score, no permission, no subscription and no signal, and it is the one thing that reliably makes altitude illness better.";

/** Said on every result too. The form is a moment, not a night. */
export const A_SCORE_IS_A_MOMENT =
  "This is one moment. Altitude illness gets worse in the hours after it starts, and most often overnight — a low score now says nothing about three o'clock this morning. Check again if anything changes, and tell somebody either way.";

/* -------------------------------------------------------------------------- */
/* The result                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What the app does next, in order of urgency. PLAIN CODE DECIDES THIS.
 *
 *   descend-now       a red flag, or a severe total, or an evacuation already
 *                     under way. Routes to the `altitude-severe` card.
 *   stop-ascending    the published positive threshold is met. Routes to the
 *                     `altitude-ams` card.
 *   tell-someone      symptoms are present but below the threshold.
 *   nothing-recorded  the form came back all zeroes.
 *   incomplete        the form is not finished and no red flag fired.
 */
export type Escalation =
  | "descend-now"
  | "stop-ascending"
  | "tell-someone"
  | "nothing-recorded"
  | "incomplete";

/** How loudly the screen draws it. Never used to decide WHAT is said. */
export const ESCALATION_RANK: Record<Escalation, number> = {
  "descend-now": 0,
  "stop-ascending": 1,
  "tell-someone": 2,
  "nothing-recorded": 3,
  incomplete: 3,
};

export interface LakeLouiseResult {
  escalation: Escalation;
  /**
   * The total across the four items, or null when the form is unfinished.
   * NEVER a partial sum presented as a total — see the header.
   */
  total: number | null;
  /** Which of the four items are still blank. Empty when the form is done. */
  missing: LakeLouiseItemId[];
  /**
   * The functional answer, reported separately and never added to `total`.
   * Null when unanswered.
   */
  functional: LikertScore | null;
  /** Red flags answered yes. Empty is not the same as all-answered-no. */
  redFlags: RedFlagId[];
  /** True when every red flag has an explicit yes or no. */
  redFlagsAnswered: boolean;
  /** The published band, only when the threshold is met. Null otherwise. */
  band: BandId | null;
  /** True only when headache >= 1 AND total >= 3. */
  thresholdReached: boolean;
  /**
   * The headline instruction. For the two escalating outcomes this is BYTE
   * IDENTICAL to the matching `coach/safety.ts` card — see the header.
   */
  body: string;
  /**
   * What the score is, in the questionnaire's own published terms. A statement
   * about the form. Never a statement about the person.
   */
  scoreReading: string;
  /** Always `NOT_A_DIAGNOSIS`. A field rather than a constant the screen may
   *  forget: it travels with the result, the way Phase 2's caveat does. */
  notADiagnosis: string;
  /** Always `DESCENT_IS_ALWAYS_AVAILABLE`. Present at every score. */
  descent: string;
  /** Always `A_SCORE_IS_A_MOMENT`. */
  moment: string;
  /** Always `SAFETY_DISCLAIMER`, the same strip the symptom layer carries. */
  disclaimer: string;
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

function bandFor(total: number): BandId | null {
  for (const b of BANDS) if (total >= b.from && total <= b.to) return b.id;
  return null;
}

/** The questionnaire's own name for a band, used only where a band exists. */
const BAND_WORD: Record<BandId, string> = {
  mild: "mild",
  moderate: "moderate",
  severe: "severe",
};

/**
 * WHAT THE FORM SAYS, ABOUT THE FORM.
 *
 * Every sentence this builds has the score as its subject. Read them aloud and
 * check: the moment the subject becomes "you", it has become a diagnosis.
 */
function readingFor(
  total: number | null,
  headache: LikertScore | null,
  thresholdReached: boolean,
  band: BandId | null,
  missing: LakeLouiseItemId[],
  thresholdAlreadyUnavoidable: boolean,
): string {
  if (total === null) {
    const n = missing.length;
    const stem = `The four scored questions are not all answered, so there is no total — ${n} ${
      n === 1 ? "is" : "are"
    } still blank. ICEFALL will not add up part of this form and call it a score.`;
    if (thresholdAlreadyUnavoidable) {
      return `${stem} It does not need one. The questionnaire's positive threshold is a headache scoring at least 1 together with a total of 3 or more, and the answers already given reach both halves of it — a blank can only add to a total, never take away from it, so finishing the form cannot bring it back under the threshold. That is arithmetic about the form, not a finding about your body.`;
    }
    return stem;
  }

  const stem = `Your answers total ${total} out of 12.`;

  if (thresholdReached && band) {
    return `${stem} The Lake Louise questionnaire's published positive threshold is a headache scoring at least 1 together with a total of 3 or more, after a recent gain in altitude. This total meets it, and the questionnaire places a total of ${total} in the band it calls ${BAND_WORD[band]}. That is where the form's arithmetic ends: it is a number from four questions, not a finding about your body.`;
  }

  if (headache !== null && headache < HEADACHE_MINIMUM && total >= POSITIVE_TOTAL) {
    return `${stem} The questionnaire's positive threshold needs a headache scoring at least 1 as well as a total of 3 or more, and you recorded no headache — so the total is 3 or more without the threshold being met. ICEFALL is not rounding that up, and it is not rounding it down either: you have recorded real symptoms and they are worth telling somebody about.`;
  }

  if (total === 0) {
    return `${stem} Nothing on the four scored questions was reported. The questionnaire has no comment to make on a zero beyond that, and neither has ICEFALL.`;
  }

  return `${stem} That is below the questionnaire's published positive threshold, which is a headache scoring at least 1 together with a total of 3 or more. Below the threshold the form says nothing further — it does not grade a 1 or a 2, and it does not call them safe.`;
}

/**
 * SCORE THE FORM.
 *
 * Pure, total, and takes exactly one argument. There is deliberately nowhere to
 * pass a subscription tier, a connectivity state, a locale, a plan, a model
 * response or an athlete profile: the moment this function could be given one,
 * somebody could withhold the descent card on the strength of it.
 *
 * Order of decisions, and it is the order for a reason:
 *
 *   1. RED FLAGS FIRST, before the form is even looked at for completeness.
 *   2. Then completeness — but only to decide whether a TOTAL exists.
 *   3. Then the published threshold.
 *
 * The severe card also fires on a complete severe total (10-12) and on a
 * functional score of 3 ("had to be evacuated to a lower altitude"), neither of
 * which is a red-flag question but both of which describe somebody already past
 * the point where "stop going up" is the useful sentence.
 */
export function scoreLakeLouise(answers: LakeLouiseAnswers): LakeLouiseResult {
  const redFlags = RED_FLAG_ORDER.filter((id) => answers.redFlags[id] === true);
  const redFlagsAnswered = RED_FLAG_ORDER.every((id) => answers.redFlags[id] !== null);

  const missing = LAKE_LOUISE_ITEMS.filter((id) => answers.items[id] === null);
  const complete = missing.length === 0;
  const total = complete
    ? LAKE_LOUISE_ITEMS.reduce((sum, id) => sum + (answers.items[id] as LikertScore), 0)
    : null;

  const headache = answers.items.headache;
  const thresholdReached =
    total !== null && headache !== null && headache >= HEADACHE_MINIMUM && total >= POSITIVE_TOTAL;
  const band = thresholdReached && total !== null ? bandFor(total) : null;

  /* AN UNFINISHED FORM CAN ALREADY HAVE MET THE THRESHOLD, AND MUST SAY SO.
     Every item scores 0-3, so a blank can only ADD to a total and can never
     take one away. If the answers already given carry a headache of at least
     1 and already sum to 3 or more, the published positive threshold is met
     no matter what the remaining questions turn out to be — finishing the
     form cannot undo it.

     This is the case the form gets wrong by being tidy: somebody ticks
     "severe headache, incapacitating", is interrupted, and a screen that
     waits for all four answers tells them the form is unfinished and that
     nothing so far reaches the threshold. The second half of that sentence is
     false, and it is false in the reassuring direction. So the escalation
     fires on the answers in hand, exactly as the red flags do.

     NOTE THE ASYMMETRY, AND KEEP IT. This may only ever ESCALATE on a partial
     form. There is deliberately no mirrored "the threshold can no longer be
     reached, you are below it" short-circuit: a low partial says nothing,
     because the blanks can still add. Descending early is recoverable; being
     told early that you are under the line is not.

     It still produces NO TOTAL. `total` stays null and nothing prints a
     partial sum as a score — see the header. What it produces is the
     instruction, which never needed a total in the first place. */
  const answeredSum = LAKE_LOUISE_ITEMS.reduce(
    (sum, id) => sum + (answers.items[id] ?? 0),
    0,
  );
  const thresholdAlreadyUnavoidable =
    total === null &&
    headache !== null &&
    headache >= HEADACHE_MINIMUM &&
    answeredSum >= POSITIVE_TOTAL;

  const base = {
    total,
    missing,
    functional: answers.functional,
    redFlags,
    redFlagsAnswered,
    band,
    thresholdReached,
    scoreReading: readingFor(
      total,
      headache,
      thresholdReached,
      band,
      missing,
      thresholdAlreadyUnavoidable,
    ),
    notADiagnosis: NOT_A_DIAGNOSIS,
    descent: DESCENT_IS_ALWAYS_AVAILABLE,
    moment: A_SCORE_IS_A_MOMENT,
    disclaimer: SAFETY_DISCLAIMER,
  };

  /* 1 — THE RED FLAGS. Checked before completeness, before the total, before
     anything. A form with one tick here and four blanks is answered. */
  if (redFlags.length > 0) {
    return { ...base, escalation: "descend-now", body: SAFETY_MESSAGES["altitude-severe"] };
  }

  /* Already evacuated, or the symptoms forced the ascent to stop — the
     questionnaire's own functional score 3. Not a red-flag question, not part
     of the total, and not something to answer with "tell your guide". */
  if (answers.functional === 3) {
    return { ...base, escalation: "descend-now", body: SAFETY_MESSAGES["altitude-severe"] };
  }

  /* 2 — A SEVERE TOTAL. The questionnaire's own top band. */
  if (thresholdReached && band === "severe") {
    return { ...base, escalation: "descend-now", body: SAFETY_MESSAGES["altitude-severe"] };
  }

  /* 3 — THE PUBLISHED POSITIVE THRESHOLD. */
  if (thresholdReached) {
    return { ...base, escalation: "stop-ascending", body: SAFETY_MESSAGES["altitude-ams"] };
  }

  /* 3b — THE THRESHOLD IS ALREADY MET ON AN UNFINISHED FORM. Same instruction
     as a finished one that meets it, in the same words, because it is the same
     situation: the remaining questions cannot change it. No total is claimed. */
  if (thresholdAlreadyUnavoidable) {
    return { ...base, escalation: "stop-ascending", body: SAFETY_MESSAGES["altitude-ams"] };
  }

  /* 4 — UNFINISHED. No red flag fired, the threshold is not already met, and
     there is no total. It still carries the descent line, because an unfinished
     form is not a reason to withhold it.

     The body says which of the two unfinished cases this is, because they are
     different states (house rule 2) and one of them is a dead end: once a
     headache is answered 0 the published threshold can never be met, however
     the rest of the form goes. Neither is a clearance and the wording says so.
     What it must never say is the old line, "no answer given so far reaches the
     questionnaire's threshold" — unconditionally false on a form that already
     had a headache and three points on it. */
  if (total === null) {
    const headacheRulesItOut = headache !== null && headache < HEADACHE_MINIMUM;
    const tail = headacheRulesItOut
      ? "You have recorded no headache, and the questionnaire's positive threshold needs one — so however the blanks are answered, this form will not reach it. That is a fact about the threshold and not a clearance: the warning signs above are not scored and do not care about it, and going down is still available to you."
      : "What is answered so far does not reach the questionnaire's positive threshold, which is a headache scoring at least 1 together with a total of 3 or more. The questions still blank could take it there, so that is a statement about the form as it stands and not about how it ends.";
    return {
      ...base,
      escalation: "incomplete",
      body: `Finish the four questions and this will have a score.\n\nNone of the warning signs above has been ticked. ${tail}\n\nIf anything changes while you are filling it in, stop filling it in.`,
    };
  }

  /* 5 — BELOW THE THRESHOLD, WITH SOMETHING RECORDED. */
  if (total > 0) {
    return {
      ...base,
      escalation: "tell-someone",
      body: "Tell your guide, or whoever you are with, and gain height slowly today.\n\nThe questionnaire's positive threshold has not been reached. That is a statement about the form and not a clearance. Symptoms that are there at all are worth somebody else knowing about, because the person best placed to notice you getting worse is not you.\n\nDrink, eat, and do not sleep higher than you have to. Check again this evening, and again if anything changes.",
    };
  }

  /* 6 — NOTHING RECORDED. */
  return {
    ...base,
    escalation: "nothing-recorded",
    body: "Nothing to report on this check.\n\nThat is what the form says right now, and it is not a forecast. Fill it in again this evening, and again if you or anybody in the party starts to feel different.",
  };
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The short heading above the body on the result screen.
 *
 * Deliberately imperative, and deliberately not a severity word. "Moderate" as
 * a heading reads as a verdict on a person; "Stop going up" reads as an
 * instruction, which is what it is.
 */
export const ESCALATION_HEADING: Record<Escalation, string> = {
  "descend-now": "Go down now",
  "stop-ascending": "Stop going up",
  "tell-someone": "Tell somebody",
  "nothing-recorded": "Nothing recorded",
  incomplete: "Not finished",
};

/**
 * One line for a history row. Names the score, never the person.
 *
 * Returns the same words on a phone with no signal as on one with five bars,
 * because there is no branch in here that could do otherwise.
 */
export function summariseCheck(result: LakeLouiseResult): string {
  const score = result.total === null ? "no total (unfinished)" : `${result.total}/12`;
  if (result.redFlags.length > 0) return `${score} · warning sign ticked · go down`;
  if (result.escalation === "descend-now") return `${score} · go down`;
  if (result.escalation === "stop-ascending")
    return `${score} · at or above the questionnaire's threshold`;
  if (result.escalation === "tell-someone") return `${score} · below the threshold`;
  if (result.escalation === "incomplete") return score;
  return `${score} · nothing reported`;
}
