import { useSyncExternalStore } from "react";

import {
  ALTITUDE_PLAUSIBLE_MAX_M,
  ALTITUDE_PLAUSIBLE_MIN_M,
} from "@/coach/mountainReadiness";
import { checkSafety, type SafetyCategory, type SafetyResponse } from "@/coach/safety";
import { SKILL_LABEL, type AthleteSkillId } from "@/objectives/requirements";

/**
 * THE POST-TRIP DEBRIEF — what actually happened on the mountain, and what the
 * app is allowed to do with it.
 *
 * ============================================================================
 * WHY THIS IS NOT `tracking/debrief.ts`
 * ============================================================================
 *
 * `tracking/debrief.ts` already exists, is shipped, is tested
 * (`npm run test:debrief`) and has live consequences in `debriefEffects.ts`. It
 * asks three questions about ONE SESSION — how hard it felt, how the body is
 * now, whether anything hurts — and its answers age in hours.
 *
 * This is a different object with a different lifetime. It is asked once, after
 * an attempt on an objective is over, and its answers are the only thing in the
 * app that ever changes the athlete's PROFILE from a form about a trip.
 * Overloading the per-session module would have put a permanent profile write
 * behind a form answered forty times a season. So: new module, new name, new
 * store, no shared record type.
 *
 * It shares one thing, and shares it deliberately: `checkSafety` runs on the
 * free-text note before anything else, exactly as the session debrief does.
 * This box is more likely than any other in ICEFALL to be typed into by
 * somebody who has just come down with a headache that will not lift, and the
 * box does not know which it is getting. `coach/safety.ts` is not reimplemented
 * here, not softened here, and not skipped when the device is offline — it is a
 * pure function over a string and it runs first.
 *
 * ============================================================================
 * IT PROPOSES. IT NEVER WRITES.
 * ============================================================================
 *
 * `buildObjectiveDebrief` returns a record plus a list of PROPOSED writes and a
 * list of WITHHELD ones. It touches no store, reads no clock it was not given,
 * and cannot reach `AppState`. The screen renders each proposal with its own
 * sentence, the athlete accepts the ones they want, and the screen performs
 * them. Nothing about a person's profile changes because they filled in a form
 * about their trip and did not read the small print.
 *
 * The withheld list is not an implementation detail — it is rendered. Rule 2:
 * absence carries its reason. "ICEFALL did not update your highest altitude"
 * and "ICEFALL will not update your highest altitude from a figure it recorded
 * itself, because the profile field holds self-reported figures and putting a
 * measurement in it would relabel the measurement" are different states, and
 * only the second one is honest.
 *
 * ============================================================================
 * THE ALTITUDE RULE — THE WHOLE POINT OF THIS FILE
 * ============================================================================
 *
 * There are two highest altitudes in ICEFALL and they are kept apart on
 * purpose (`coach/mountainReadiness.ts`, the merge at the bottom of that file):
 *
 *   RECORDED       `maxAltitudeM` off the activity feed. A measurement.
 *   SELF-REPORTED  `coachProfile.maxAltitudeM`. A sentence somebody typed.
 *
 * A trip debrief is a form. Everything it collects is therefore self-reported,
 * including a number the athlete copied off their own watch. So:
 *
 *   · A high point ICEFALL ALREADY RECORDED is NEVER written to the profile.
 *     It is already in the feed, `readEvidence` already finds it, and copying
 *     it into the self-reported field would convert a measurement into a claim
 *     and lose the provenance for ever. The debrief says so instead.
 *   · A high point the athlete TYPES is proposed for the profile, is stamped
 *     `self-reported`, and every surface that renders it says so — which they
 *     already do, because the merge rule and `compare.ts` carry `Provenance`
 *     all the way to the screen.
 *
 * ============================================================================
 * A SUMMIT IS NOT A CERTIFICATE
 * ============================================================================
 *
 * Rule 4, and the reason this feature is worth building at all. A competence
 * ticked in a debrief goes into `coachProfile.technicalSkills`, which is the
 * SAME field the onboarding questionnaire writes and is self-reported by
 * definition — and `compare.ts` answers every skill line with "Self-declared —
 * ICEFALL cannot verify it, and a guide will form their own view", for ever,
 * whether the tick arrived from a form on day one or from the summit of Denali.
 *
 * There is deliberately no separate "verified on an expedition" skill state and
 * there must never be one. Having used a fixed line once, under a guide, in
 * good weather, is not the same as being competent on it; nobody at ICEFALL
 * watched; and a second tier of tick would be read by an operator as exactly
 * the verification ICEFALL cannot do.
 */

/* -------------------------------------------------------------------------- */
/* The answers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How the attempt ended. Closed, and not a scale.
 *
 * `turned-around` is not a failure state and is not worded as one: it is the
 * outcome of most attempts on most big mountains, and it is the one a debrief
 * most needs to be comfortable recording, because an athlete who feels the app
 * is scoring them will stop filling it in.
 *
 * `did-not-travel` exists because the trip that never happened is the case that
 * breaks everything downstream. No competence was used on it, no altitude was
 * reached on it, and nothing about it is evidence of anything — the only honest
 * write it produces is closing the objective.
 */
export type ObjectiveOutcome = "summited" | "turned-around" | "did-not-travel";

export const OUTCOME_LABEL: Record<ObjectiveOutcome, string> = {
  summited: "Stood on the summit",
  "turned-around": "Went, did not summit",
  "did-not-travel": "Did not travel",
};

export const OUTCOME_DETAIL: Record<ObjectiveOutcome, string> = {
  summited: "You reached the top.",
  "turned-around":
    "You were on the mountain and turned back — weather, conditions, time, the team, or your own call.",
  "did-not-travel":
    "The trip did not happen. ICEFALL closes the objective and claims nothing from it.",
};

/**
 * Where a high-point figure came from. A number with its source attached, never
 * a bare number.
 *
 * The four arms are four genuinely different things, and collapsing any two of
 * them would produce the exact laundering this module exists to prevent.
 */
export type HighPointSource =
  /** Nothing given. Not zero, not sea level — no answer. */
  | { kind: "not-given" }
  /** The athlete typed it. Self-reported, and stays that way. */
  | { kind: "typed"; metres: number }
  /**
   * The catalogue elevation of the objective, offered because the athlete said
   * they summited it. Still self-reported — the CLAIM is what is unverified —
   * but it carries a different sentence from a typed figure, because the number
   * itself came from ICEFALL's own record of the mountain rather than memory.
   */
  | { kind: "objective-elevation"; metres: number }
  /**
   * ICEFALL recorded it. NEVER proposed for the profile — see the header.
   * Carried so the debrief can say, on the screen, that it already has it.
   */
  | { kind: "recorded"; metres: number; activityId: string };

export interface ObjectiveDebriefAnswers {
  /** The objective this attempt was on — `Goal.id`. */
  goalId: string;
  objectiveName: string;
  /** ISO date (YYYY-MM-DD) the athlete left. Supplied; never inferred. */
  startedOn: string;
  /** ISO date (YYYY-MM-DD) the attempt ended. */
  endedOn: string;
  outcome: ObjectiveOutcome;
  highPoint: HighPointSource;
  /**
   * Competences the athlete says they used, from the closed vocabulary.
   * Self-reported on arrival and self-reported for ever.
   */
  skillsUsed: AthleteSkillId[];
  /** Free text. Goes through `checkSafety` before anything else happens to it. */
  note: string;
}

/**
 * What ICEFALL already holds, so the builder can decide what a debrief actually
 * adds. Passed in rather than read, for the same reason `compare.ts` takes
 * `AthleteFacts`: this module must not be able to re-derive a figure a second
 * way and put a disagreeing version of it on the screen.
 */
export interface DebriefContext {
  /** `coachProfile.maxAltitudeM` today, or null when never set. */
  profileMaxAltitudeM: number | null;
  /** The highest altitude the ACTIVITY FEED holds, or null. A measurement. */
  recordedHighestAltitudeM: number | null;
  /** The competence labels the profile already holds. */
  reportedSkillLabels: string[];
  /**
   * Whether this objective can actually be closed.
   *
   * False for the seeded DEV fixtures, which are not the athlete's to finish —
   * the same rule `canRemoveGoal` applies to deletion. A debrief on one still
   * works and still proposes the profile writes; it just says plainly that the
   * objective itself will not close.
   */
  objectiveCanClose: boolean;
}

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/** The note, after the safety layer has had it. */
export type DebriefNote =
  | { written: false }
  | {
      written: true;
      /** The athlete's own words, verbatim. Never shown in ICEFALL's voice. */
      text: string;
      /** Set when `checkSafety` fired. Routes to a doctor, not to a training tweak. */
      safety: SafetyCategory | null;
    };

export interface ObjectiveDebriefRecord {
  /** `Goal.id` — one debrief per objective, replaced if answered again. */
  goalId: string;
  objectiveName: string;
  startedOn: string;
  endedOn: string;
  outcome: ObjectiveOutcome;
  highPoint: HighPointSource;
  /** Ids, not labels: the record survives a copy edit to the wording. */
  skillsUsed: AthleteSkillId[];
  note: DebriefNote;
  /** ISO timestamp the form was answered. */
  answeredAt: string;
}

/* -------------------------------------------------------------------------- */
/* Proposals                                                                  */
/* -------------------------------------------------------------------------- */

export type ProposedWriteKind = "close-objective" | "max-altitude" | "skills" | "summit-log";

/**
 * A write the athlete may accept.
 *
 * `line` is the sentence rendered beside the switch, and it is the whole
 * consent. It names the field, the value and — where there is one — the label
 * the value will carry for ever.
 */
export type ProposedWrite =
  | {
      kind: "close-objective";
      goalId: string;
      /** ISO date the objective is marked finished on. */
      completedOn: string;
      line: string;
    }
  | {
      kind: "max-altitude";
      metres: number;
      /** What the profile says today, so the screen can show the change. */
      previousM: number | null;
      /** Always this. There is no other value it could take. */
      provenance: "self-reported";
      line: string;
    }
  | {
      kind: "skills";
      skillIds: AthleteSkillId[];
      labels: string[];
      line: string;
    }
  | {
      kind: "summit-log";
      peakName: string;
      elevationM: number | null;
      /** ISO date of the ascent. */
      date: string;
      line: string;
    };

/** A write that was NOT offered, and the reason, in the app's own words. */
export interface WithheldWrite {
  kind: ProposedWriteKind;
  line: string;
}

export interface BuiltObjectiveDebrief {
  record: ObjectiveDebriefRecord;
  /**
   * The safety layer's own answer, verbatim, when the note fired it.
   *
   * Returned rather than stored so the screen renders `coach/safety.ts`'s fixed
   * message, category and disclaimer instead of a debrief screen paraphrasing
   * an emergency. The proposals below are still built — somebody reporting a
   * symptom has not stopped having a trip to record — but the screen shows this
   * FIRST and above them.
   */
  safety: SafetyResponse | null;
  writes: ProposedWrite[];
  withheld: WithheldWrite[];
}

/* -------------------------------------------------------------------------- */
/* Building one                                                               */
/* -------------------------------------------------------------------------- */

const metres = (n: number) => `${Math.round(n).toLocaleString("en-GB")} m`;

/** ISO `YYYY-MM-DD`, or null when the string is not one. Never coerced. */
function isoDay(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const t = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(t) ? raw : null;
}

function highPointMetres(source: HighPointSource): number | null {
  return source.kind === "not-given" ? null : source.metres;
}

/**
 * Turn a filled-in debrief into a record and a set of proposals.
 *
 * PURE. No storage, no network, and the clock is an argument. Given the same
 * answers and the same context it returns the same proposals, which is what
 * lets a screen show the athlete exactly what accepting will do and then do
 * exactly that.
 */
export function buildObjectiveDebrief(
  answers: ObjectiveDebriefAnswers,
  context: DebriefContext,
  now = new Date(),
): BuiltObjectiveDebrief {
  const text = answers.note.trim();

  /* FIRST, ALWAYS. Before the note is stored, before a single proposal is
     built, and with no network in the path. This is the same call the session
     debrief makes and the same function the chat is gated by. */
  const safety = text.length > 0 ? checkSafety(text) : null;

  const note: DebriefNote =
    text.length === 0
      ? { written: false }
      : { written: true, text, safety: safety ? safety.category : null };

  /* A trip that did not happen cannot have had competences used on it. This is
     not tidying: leaving the ticks on would let somebody claim a competence off
     a trip they have just told the app they did not take. */
  const claimed = dedupe(answers.skillsUsed);
  const skillsUsed = answers.outcome === "did-not-travel" ? [] : claimed;

  const endedOn = isoDay(answers.endedOn);
  const startedOn = isoDay(answers.startedOn);

  const record: ObjectiveDebriefRecord = {
    goalId: answers.goalId,
    objectiveName: answers.objectiveName,
    startedOn: startedOn ?? answers.startedOn,
    endedOn: endedOn ?? answers.endedOn,
    outcome: answers.outcome,
    highPoint: answers.outcome === "did-not-travel" ? { kind: "not-given" } : answers.highPoint,
    skillsUsed,
    note,
    answeredAt: now.toISOString(),
  };

  const writes: ProposedWrite[] = [];
  const withheld: WithheldWrite[] = [];

  /* ---- Close the objective --------------------------------------------- */

  if (endedOn === null) {
    withheld.push({
      kind: "close-objective",
      line: `"${answers.endedOn}" is not a date ICEFALL can read, so it will not stamp an objective with it. Give the day the attempt ended as YYYY-MM-DD.`,
    });
  } else if (!context.objectiveCanClose) {
    withheld.push({
      kind: "close-objective",
      line: "This objective is one of ICEFALL's seeded examples rather than one you created, so it is not yours to close. Everything else in this debrief still applies to your profile.",
    });
  } else {
    writes.push({
      kind: "close-objective",
      goalId: answers.goalId,
      completedOn: endedOn,
      line: `Mark "${answers.objectiveName}" finished on ${endedOn}. Its training plan stops being the plan; the record of what you did stays.`,
    });
  }

  /* ---- Highest altitude ------------------------------------------------- */

  pushAltitude(record.highPoint, context, writes, withheld);

  /* ---- Competences ------------------------------------------------------ */

  if (answers.outcome === "did-not-travel" && claimed.length > 0) {
    withheld.push({
      kind: "skills",
      line: "You marked competences as used, and then said the trip did not happen. ICEFALL has dropped them rather than file a claim against a trip you did not take.",
    });
  } else if (skillsUsed.length === 0) {
    withheld.push({
      kind: "skills",
      line: "You named no competences, so nothing is added. Not naming one is not a statement that you lack it — ICEFALL records only what you tell it.",
    });
  } else {
    const held = new Set(context.reportedSkillLabels.map((l) => l.trim().toLowerCase()));
    const labels = skillsUsed.map((id) => SKILL_LABEL[id] ?? id);
    const fresh = skillsUsed.filter((id) => !held.has((SKILL_LABEL[id] ?? id).toLowerCase()));

    if (fresh.length === 0) {
      withheld.push({
        kind: "skills",
        line: `Your profile already lists ${listOf(labels)}, so there is nothing to add. Using a competence again does not change what ICEFALL can say about it.`,
      });
    } else {
      const freshLabels = fresh.map((id) => SKILL_LABEL[id] ?? id);
      writes.push({
        kind: "skills",
        skillIds: fresh,
        labels: freshLabels,
        line: `Add ${listOf(freshLabels)} to your profile as SELF-REPORTED. Having used a competence on a trip is not a certificate: ICEFALL did not watch, cannot verify it, and every screen that shows it — including anything you send an operator — will say self-reported for as long as it is there.`,
      });
    }
  }

  /* ---- The summit log --------------------------------------------------- */

  if (answers.outcome === "summited" && endedOn !== null) {
    const m = highPointMetres(record.highPoint);
    writes.push({
      kind: "summit-log",
      peakName: answers.objectiveName,
      elevationM: m,
      date: endedOn,
      line: `Log ${answers.objectiveName} as a summit on ${endedOn}. Summit logs are marked by you and counted as self-logged wherever they are used — including against any "prior summits" line a guide ever writes for another mountain.`,
    });
  } else if (answers.outcome === "summited") {
    withheld.push({
      kind: "summit-log",
      line: "A summit log needs the day you stood on top, and the date given is not one ICEFALL can read.",
    });
  }

  return { record, safety, writes, withheld };
}

/**
 * The altitude decision, on its own, because it is the one with five outcomes
 * and only one of them is a write.
 */
function pushAltitude(
  source: HighPointSource,
  context: DebriefContext,
  writes: ProposedWrite[],
  withheld: WithheldWrite[],
): void {
  if (source.kind === "not-given") {
    withheld.push({
      kind: "max-altitude",
      line: "No high point given, so your highest altitude is unchanged. A blank is not a zero and ICEFALL has not read it as one.",
    });
    return;
  }

  /* The rule this module exists for. See the header. */
  if (source.kind === "recorded") {
    withheld.push({
      kind: "max-altitude",
      line: `ICEFALL recorded ${metres(source.metres)} on this trip itself, and it already counts: the readiness engine reads the highest altitude in your activity feed directly. It is NOT copied into your profile, because that field holds what you have told ICEFALL — putting a measurement in it would turn a measurement into a claim and lose the difference for ever.`,
    });
    return;
  }

  const m = Math.round(source.metres);

  if (!Number.isFinite(m) || m <= ALTITUDE_PLAUSIBLE_MIN_M || m >= ALTITUDE_PLAUSIBLE_MAX_M) {
    withheld.push({
      kind: "max-altitude",
      line: `${metres(source.metres)} is outside the range ICEFALL treats as an altitude on this planet (above ${metres(ALTITUDE_PLAUSIBLE_MIN_M)} and below ${metres(ALTITUDE_PLAUSIBLE_MAX_M)}), so it has not been written anywhere.`,
    });
    return;
  }

  const profile = context.profileMaxAltitudeM;
  const recorded = context.recordedHighestAltitudeM;

  if (profile !== null && m <= profile) {
    withheld.push({
      kind: "max-altitude",
      line: `Your profile already says ${metres(profile)}, which is at or above the ${metres(m)} you have given, so it is unchanged. ICEFALL never lowers a height you have reached: reaching it once is a fact about the past.`,
    });
    return;
  }

  if (recorded !== null && m <= recorded) {
    withheld.push({
      kind: "max-altitude",
      line: `ICEFALL has already recorded ${metres(recorded)} from your activity feed, which is at or above the ${metres(m)} you have given. The recorded figure stands and nothing is written to your profile — a measurement is not improved by a smaller estimate beside it.`,
    });
    return;
  }

  const reason =
    source.kind === "objective-elevation"
      ? "That is this objective's elevation in ICEFALL's catalogue, offered because you said you stood on top. It is self-reported all the same: what ICEFALL cannot verify is that you were there."
      : "You typed it, so it is self-reported.";

  writes.push({
    kind: "max-altitude",
    metres: m,
    previousM: profile,
    provenance: "self-reported",
    line: `Set your highest altitude to ${metres(m)}${profile !== null ? `, up from ${metres(profile)}` : ""}. ${reason} It will carry the words "self-reported, not verified" on every screen and in anything you send an operator, for as long as it is there.`,
  });
}

function dedupe(ids: readonly AthleteSkillId[]): AthleteSkillId[] {
  return [...new Set(ids)];
}

function listOf(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return `"${items[0]}"`;
  const quoted = items.map((i) => `"${i}"`);
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `localStorage`, one record per objective, for the reasons
 * `tracking/adjustments.ts` sets out at length: the table does not exist, a
 * client that upserted into a missing one would fail silently, and the
 * athlete's world is on the device anyway. Nothing here claims it synced.
 *
 * Cleared by "Erase all data" in Settings, which clears by the `icefall.`
 * prefix.
 */
const KEY = "icefall.objective-debriefs.v1";

function read(): ObjectiveDebriefRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ObjectiveDebriefRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let current: ObjectiveDebriefRecord[] = typeof localStorage === "undefined" ? [] : read();
const listeners = new Set<() => void>();

function write(next: ObjectiveDebriefRecord[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Quota. The record stands for this session; there is nothing else useful
       to do, and throwing here would lose a form the athlete has just spent
       five minutes filling in. */
  }
  listeners.forEach((l) => l());
}

export function objectiveDebriefs(): readonly ObjectiveDebriefRecord[] {
  return current;
}

export function objectiveDebriefFor(
  goalId: string | undefined,
): ObjectiveDebriefRecord | undefined {
  if (!goalId) return undefined;
  return current.find((d) => d.goalId === goalId);
}

/** Save, replacing any earlier debrief for the same objective. One per trip. */
export function saveObjectiveDebrief(record: ObjectiveDebriefRecord): ObjectiveDebriefRecord {
  write([record, ...current.filter((d) => d.goalId !== record.goalId)]);
  return record;
}

export function forgetObjectiveDebrief(goalId: string): void {
  write(current.filter((d) => d.goalId !== goalId));
}

export function useObjectiveDebriefs(): readonly ObjectiveDebriefRecord[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => current,
  );
}

export function useObjectiveDebrief(
  goalId: string | undefined,
): ObjectiveDebriefRecord | undefined {
  const all = useObjectiveDebriefs();
  return goalId ? all.find((d) => d.goalId === goalId) : undefined;
}

/** Said wherever a debrief is stored, because it is true. */
export const DEBRIEF_LOCAL_NOTICE =
  "This debrief lives on this device. ICEFALL has no table for it yet, so it does not sync, and a new phone starts without it. The profile changes you accept are a different thing and do follow your account.";
