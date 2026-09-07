import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Discipline, ExperienceLevel, Goal, User } from "@/types";
import type { CheckIn as CoachCheckIn } from "@/coach/types";
import {
  FREE_COACH_INTERACTIONS_PER_MONTH,
  TRIAL_DAYS,
  hasFeature,
  type FeatureId,
  type TierId,
} from "@/growth/tiers";
import { USER } from "@/data/mock/athlete";
import { GOALS } from "@/data/mock/goals";
import { MOUNTAINS } from "@/data/mock/mountains";
import { monthsAhead } from "@/data/mock/clock";
import { LOCAL_ATHLETE_ID } from "@/network/types";
import type { AthleteProfile, ConnectionRequest, Expedition } from "@/network/types";
import { coarsen } from "@/network/privacy";
import type { GroupMessage, GroupStyle, GroupTrainingSession, RsvpStatus } from "@/network/groups";
import type { ItemStatus, PackItem } from "@/services/checklist";
import { normalise as normaliseBudget, type BudgetState } from "@/coach/budget";
import type { Sex } from "@/coach/fuelDay";
/* The fuel record's one public door. See `rememberSexForEnergyFromSignup`: the
   signup sex answer has to reach `icefall.fuel.v1`, because that record is the
   only sex input the daily energy estimate has, and this is the only sanctioned
   way to write it from outside the Fuel screen. */
import { rememberSexForEnergy } from "@/coach/fuelRecord";

/**
 * Personalisation is the product's central principle, so onboarding answers,
 * added goals and completed sessions survive a reload. Everything lives in one
 * versioned localStorage record; a schema change bumps the key.
 */
const STORAGE_KEY = "icefall.state.v1";

/** See `addHydration`: the demo athlete's day, in DEV only. Zero everywhere else. */
const SEEDED_HYDRATION_ML = import.meta.env.DEV ? 1850 : 0;

/** See the `goals` memo: the demo athlete's objectives, in DEV only. */
const SEEDED_GOALS: Goal[] = import.meta.env.DEV ? GOALS : [];

/**
 * The weight a calorie figure is computed against when the athlete has not
 * given one.
 *
 * Exported so the screens that SHOW a figure derived from it can name it in
 * their caveat. A default nobody can see is how "72 kg" quietly became a fact
 * about every user of this app.
 */
export const DEFAULT_BODY_MASS_KG = 72;

/**
 * A mountain the athlete is keeping an eye on. Holds enough to render a row
 * without a lookup, because discovered peaks aren't in any local table.
 */
export interface SavedObjective {
  id: string;
  name: string;
  elevationM: number;
  lat: number;
  lon: number;
  /** Set when this is one of the ten hand-written ICEFALL mountains. */
  curatedId?: string;
  photo?: string;
  /** OSM `wikipedia` tag — resolves the peak's photograph. */
  wikipedia?: string;
  addedAt: string;
  /** ISO date the summit was reached. Undefined until marked done. */
  summitedAt?: string;
}

/** First run starts from the curated objectives rather than an empty screen. */
function seedObjectives(): SavedObjective[] {
  return MOUNTAINS.map((m) => ({
    id: `curated:${m.id}`,
    name: m.name,
    elevationM: m.elevationM,
    lat: m.coords.lat,
    lon: m.coords.lon,
    curatedId: m.id,
    photo: m.photo,
    addedAt: new Date(0).toISOString(),
  }));
}

/**
 * Gender, as the athlete states it.
 *
 * THE FOUR VALUES ARE THE COLUMN'S FOUR VALUES. `20260903040000` puts a CHECK
 * on `athlete_profiles.gender` naming exactly these strings, so this union and
 * that constraint are one vocabulary written down twice. If one ever gains a
 * value the other does not, the write comes back `23514 check_violation` — a
 * code `pgErrors.ts` classifies as "unknown", which produces the vaguest
 * sentence this app owns. Change both, in the same commit, or neither.
 *
 * "prefer-not-to-say" IS A VALUE HERE, NOT AN ABSENCE, and that is the single
 * most important thing about this type. It is deliberately unlike the way this
 * same file records a declined height, which is a boolean flag beside a missing
 * number — a numeric column cannot hold the word "declined", so the flag is the
 * only place the answer can live. A text column can hold it, so it does, and
 * one column with one representation cannot be read wrongly by somebody who
 * never saw the flag. `undefined` here means the question was never put; it
 * does not mean somebody refused it, and the two must never collapse (§6ag).
 *
 * NOT SEX ASSIGNED AT BIRTH. They are different questions asked for different
 * reasons, and a woman may still need the male figure out of a resting-energy
 * equation. Nothing in ICEFALL reads this field, and nothing may start reading
 * it as the sex term of a metabolic formula — that needs its own question, its
 * own column, and its own honest explanation of what it is for.
 */
export type Gender = "woman" | "man" | "non-binary" | "prefer-not-to-say";

/**
 * Sex assigned at birth, as the athlete answered it.
 *
 * ── THIS IS NOT `Gender` AND IT IS NOT A WIDER `Gender` ────────────────────
 *
 * Read the comment above this one first. They are two questions, asked on two
 * screens, stored in two columns, for two unrelated reasons, and the owner
 * chose to ask both after being told exactly what the second one buys.
 *
 * GENDER IS IDENTITY. SEX IS A TERM IN AN EQUATION. Mifflin-St Jeor's sex term
 * is a constant — +5 kcal for male, -161 for female — so a woman may well need
 * the male figure out of it, and a man the female one. Collapsing these two
 * types into one hands her the wrong number and hands it to her SILENTLY, with
 * no screen saying which term was used. That is the failure this codebase
 * exists to refuse, which is why `Gender` was not widened to hold "female" and
 * "male" and why nothing here may ever read one field as the other.
 *
 * ── THREE VALUES STORED, TWO EXPOSED, AND THAT ASYMMETRY IS THE DESIGN ─────
 *
 * `athlete_profiles.sex_at_birth` has a CHECK naming exactly these three
 * strings, and NULL on top of them for "never asked" — four distinguishable
 * states in the database, because "eleven people declined" and "eleven people
 * were never asked" are different facts about ICEFALL and a schema that cannot
 * tell them apart can never be asked which it is looking at.
 *
 * The equation does not want four states. It wants a sex or nothing. So the
 * collapse happens once, here, in `sexTermFor`, where it is visible.
 *
 * The two real answers are BYTE-IDENTICAL to the two members of fuelDay's
 * `Sex`, on purpose: no lookup table, no mapping object, nothing for a
 * translation to drift out of step with. If `Sex` ever gains or renames a
 * member, `sexTermFor` stops compiling — which is the entire reason it is
 * typed against the imported union rather than against a copy of it.
 */
export type SexAtBirth = "female" | "male" | "prefer-not-to-say";

/**
 * The one place the four database states become the two the equation takes.
 *
 * IT FAILS CLOSED, AND THAT IS THE WHOLE POINT. Declined, never asked, and any
 * value this build does not recognise all become `undefined`. `fuelDay.ts`
 * treats `undefined` as its default path already: it evaluates the published
 * equation at BOTH sex terms and reports the span, and it says so on the screen
 * in words — "It spans both values of the equation's sex term, because ICEFALL
 * doesn't hold one." So the failure mode of this function is a WIDER band and a
 * sentence explaining why, never a guess. A version that defaulted to one sex
 * would be ICEFALL inventing somebody's metabolism, and it would look identical
 * on screen to a real answer.
 *
 * Nothing else in the app may branch on `SexAtBirth`. If a second reader ever
 * appears, it goes through this function too, or the two readers will disagree
 * about what a decline means on the day somebody edits only one of them.
 */
export function sexTermFor(answer: SexAtBirth | undefined | null): Sex | undefined {
  return answer === "female" || answer === "male" ? answer : undefined;
}

/**
 * The signup answer, translated into the two fields the energy estimate reads.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────
 *
 * The question shipped once collecting the answer and delivering nothing. It
 * was written to `athlete_profiles.sex_at_birth`, written to the `answers`
 * blob, and read by NOTHING — while the step, the payoff panel and the column
 * comment all told the athlete it narrowed their daily energy estimate. Somebody
 * handed over a private fact in exchange for a benefit that did not exist. That
 * is worse than never asking, and this function is the repair.
 *
 * ── WHERE THE ANSWER ACTUALLY HAS TO LAND ─────────────────────────────────
 *
 * `screens/Nutrition.tsx` passes `fuel.sexForEnergy` into `dailyEnergyFor`, and
 * `fuel` is the `icefall.fuel.v1` localStorage record. That record — not the
 * database column, not the answers blob — is the only sex input the estimate
 * has. So the answer has to reach it, and it has to arrive in the exact shape
 * the Fuel screen's own question writes, or the two halves of one question end
 * up meaning different things.
 *
 * `coach/fuelRecord.ts` owns that key and that shape; this file does not
 * re-type either. An earlier plan duplicated both here with a note apologising
 * for it, because the accessor was private to a screen. It is no longer: the
 * setter is exported, so a rename over there is a compile error here instead of
 * a silent stop to the narrowing.
 *
 * ── THE COLLAPSE HAPPENS ONCE, AND IT HAPPENS HERE ────────────────────────
 *
 * Four database states, two equation states. `sexTermFor` above is the only
 * place that narrowing is allowed to happen, and this is its caller — the
 * decline is recognised in the same function so there is still exactly ONE
 * reader of `SexAtBirth` in the app, as the comment on that type requires.
 *
 * IT FAILS CLOSED, TWICE OVER. `sexTermFor` returns undefined for anything that
 * is not "female" or "male", and the decline arm matches one exact string. That
 * matters more than it looks: sign-in on a second device restores the answers
 * blob straight out of `jsonb` and casts it, so this can be handed any string
 * at all. An unrecognised one stores nothing, the estimate keeps spanning both
 * terms, and the screen keeps saying why. Never a guess.
 *
 * NEVER CLOBBERS. `rememberSexForEnergy` refuses to overwrite an answer already
 * in the record — including a decline, which is an answer. Onboarding normally
 * runs first so the record is usually absent, but somebody re-running signup
 * after answering on the Fuel screen must not silently lose the later answer.
 * The Fuel screen stays the place to change it, so nothing is trapped.
 *
 * ── AND THE REFUSAL IS RETURNED, BECAUSE IT USED TO BE THROWN AWAY ─────────
 *
 * This function ignored what the accessor told it and returned `void`, so the
 * screen said "your daily energy estimate is computed at your own answer" in
 * every case — including the two where nothing of the sort had happened.
 *
 * The reachable case that decides this is a SHARED PHONE. `signOut` keeps
 * everything on the device on purpose, and `screens/auth/Auth.tsx` calls
 * `completeOnboarding` with the answers restored from the server, so a second
 * person signing in after a first meets a record that is already answered. A
 * woman signing in after a man would have had her day computed at the MALE
 * intercept — narrow, confident, with no screen saying which term was used, and
 * with his food log and hydration beside it. That is exactly the silent wrong
 * number the `SexAtBirth` comment above exists to refuse, and it became
 * reachable the day this field started being load-bearing.
 *
 * So the outcome is returned all the way up to the copy. Only `"narrowed"` may
 * be described as a narrowing.
 */
export type SexNarrowing =
  /** A sex reached the record. The estimate is now computed at that term. */
  | "narrowed"
  /** A decline reached the record. The estimate stays wide, and Fuel won't re-ask. */
  | "decline-recorded"
  /** The device already held an answer. This tap changed NOTHING. */
  | "already-answered"
  /** Storage refused the write. The answer is not on this device at all. */
  | "not-kept"
  /** No answer to store. Nothing was written and nothing may be claimed. */
  | "not-asked";

function rememberSexForEnergyFromSignup(answer: SexAtBirth | undefined | null): SexNarrowing {
  const sex = sexTermFor(answer);
  if (sex !== undefined) {
    // `sexForEnergyDeclined: false` is passed so this call reads identically to
    // the Fuel screen's own (`screens/Nutrition.tsx`, the sex ChoiceField). The
    // accessor stores the flag only when it is true, so the record ends up
    // `{ sexForEnergy: "male" }` rather than carrying a false — which every
    // reader treats the same, since all of them test `!== true`.
    const outcome = rememberSexForEnergy({ sexForEnergy: sex, sexForEnergyDeclined: false });
    /* `"nothing-to-store"` cannot mean "you passed me nothing" here — a sex was
       passed. On this branch it can only be the write being refused: full
       storage, or private mode. The answer is genuinely lost, and the screen has
       to say so rather than round it up to success. */
    return outcome === "stored"
      ? "narrowed"
      : outcome === "already-answered"
        ? "already-answered"
        : "not-kept";
  }
  // "Prefer not to say" is an ANSWER and has to land as one. The Fuel screen's
  // own decline writes exactly this, and matching it means the estimate widens
  // honestly AND the Fuel screen does not put the same question again to
  // somebody who has already said no to it.
  if (answer === "prefer-not-to-say") {
    const outcome = rememberSexForEnergy({ sexForEnergyDeclined: true });
    /* A stored decline and a lost decline look IDENTICAL on the estimate — both
       leave it spanning both terms — and they are still different facts. The
       stored one means the Fuel screen will not ask again; the lost one means it
       will. Reporting them as one would make the next question a surprise. */
    return outcome === "stored"
      ? "decline-recorded"
      : outcome === "already-answered"
        ? "already-answered"
        : "not-kept";
  }
  // Anything else — undefined, null, a string this build does not know — is
  // "never asked". Nothing is written, because writing something would be this
  // file answering a question about somebody's body on their behalf.
  return "not-asked";
}

/**
 * Where somebody says they found ICEFALL.
 *
 * A CLOSED SET, matching the `heard_about_channels` rows that `20260903040000`
 * seeds, because `athlete_profiles.heard_about` carries a real foreign key to
 * that table. Free text was rejected upstream for the reason that matters:
 * "Instagram / instagram / IG / insta" is one channel and five rows, and the
 * failure is silent — the report renders, the bars have heights, and the
 * biggest real channel is smeared across a tail that reads like noise.
 *
 * SELF-REPORTED AND UNVERIFIED. Nothing checks any of it. There is no analytics
 * package in this app, no UTM capture and no install referrer, so a chart of
 * this field is a chart of what people remembered, and any screen that ever
 * draws one has to say so — a bar chart is the most convincing shape an
 * unverifiable number can be given.
 *
 * The last three name no place. They are answers all the same: somebody who
 * cannot remember has told ICEFALL something true, and it is not the same thing
 * as never having been asked.
 */
export type HeardAboutChannel =
  | "friend"
  | "guide-or-operator"
  | "instagram"
  | "youtube"
  | "tiktok"
  | "reddit"
  | "podcast"
  | "search"
  | "article"
  | "somewhere-else"
  | "dont-remember"
  | "prefer-not-to-say";

/**
 * What "none" was actually answered to.
 *
 * Owner ruling 2026-09-01: every onboarding question must be answered, and
 * "none" is a legitimate answer to several of them. An empty array cannot say
 * whether the question was asked — so these flags carry it. Absent and "none"
 * must not collapse into one value (§6ag).
 */
export interface OnboardingDeclined {
  noDisciplines: boolean;
  noFixedTrainingDays: boolean;
  noTechnicalSkills: boolean;
  heightDeclined: boolean;
  birthYearDeclined: boolean;
  noObjectiveYet: boolean;
  /** "Nothing right now" to the train-around question. */
  noLimitations: boolean;
}

export interface OnboardingAnswers {
  /** Optional only for records written before this flow existed. */
  declined?: OnboardingDeclined;
  /**
   * What sessions must train AROUND — category ids, plus the athlete's own
   * words verbatim.
   *
   * A CONSTRAINT LIST, never clinical context. The coach may decline to load a
   * declared knee; it may not say what is wrong with it, whether it is healing,
   * or when to return. ICEFALL is not a doctor and this field does not make it
   * one — it only narrows what may be prescribed.
   */
  limitations?: string[];
  limitationsNote?: string;
  /** Constrains ascent-rate guidance. Diagnoses nothing. */
  altitudeIllness?: string | null;
  /** Where training starts FROM, so a plan is not built for a body at rest. */
  trainingBaseline?: string | null;
  /**
   * Gender, as given on the signup flow's "A few numbers about you." screen.
   *
   * READ BY NOTHING. It changes no session, no plan, no readiness figure and no
   * calorie estimate, and the screen that asks it says exactly that before the
   * answer is given. It is here because it belongs on a profile and because the
   * owner asked for it, not because something downstream is waiting on it. The
   * day anything does read it, the note on the step and the line on the payoff
   * screen both stop being true and have to change with it.
   *
   * Optional, like everything else on this interface, so records written before
   * the question existed load unchanged and read as never-asked — which is what
   * they are. There is no backfill and there must not be one: a default here
   * would be ICEFALL answering a question on somebody's behalf.
   */
  gender?: Gender;
  /**
   * Sex assigned at birth, as given on its own step in the signup flow.
   *
   * THE ONLY ANSWER ON THIS INTERFACE THAT NARROWS A LIVE NUMBER RATHER THAN
   * BEING RECORDED AND LEFT ALONE, and `completeOnboarding` below is what makes
   * that true — it hands this field to `rememberSexForEnergyFromSignup`, which
   * is the whole path from the tap to the estimate. Delete that call and every
   * sentence in this comment becomes a lie again.
   *
   * WHAT IT NARROWS, AND WHY NO SCREEN QUOTES A FIGURE FOR IT. Three screens
   * used to say "166 kcal". 166 is real but it is not that number: it is the
   * gap between the two sex intercepts of Mifflin-St Jeor, +5 and -161, inside
   * the RESTING term. What the athlete actually sees narrow is the DAY, and the
   * day puts the resting band through a ±10% individual spread and then a
   * physical-activity multiplier.
   *
   * "50 TO 600 KCAL" REPLACED THAT FIGURE AND WAS WRONG IN ITS TURN, which is
   * why what follows names its domain instead of quoting one range. Re-measured
   * 2026-09-03 by running the real `narrowingWorth` from `coach/fuelDay.ts`
   * over every combination the app will do arithmetic with, stepping 1 kg,
   * 1 cm and 1 year:
   *
   *   · Height and birth year also given — the ordinary case, since signup asks
   *     both on the very next step: 200 kcal, or 250 ONLY when everyday movement
   *     is answered `physical`. `seated` and `on-feet` both leave it at 200 —
   *     the same as never answering — so two of that question's three answers
   *     move this figure not at all. (Mechanism at `fuelDay.ts:355-357`: the PAL
   *     bands are seated 1.25-1.4, on-feet 1.4-1.55, physical 1.55-1.75, and
   *     only the last widens the multiplier enough to push the rounded gain over
   *     a 50 kcal step.) Those two figures are FLAT across the whole accepted
   *     body — 30-250 kg, 100-250 cm, ages 10-100 — over 12.1M combinations
   *     with no exceptions.
   *   · Height declined, birth year given, adult of 45-120 kg, AGES 18-100:
   *     50 to 600 kcal. The 600 needs `physical`; with movement unanswered,
   *     which is its state throughout signup, it is 50 to 500. Sixteen- and
   *     seventeen-year-olds are real users (signup accepts anyone born up to
   *     `currentYear - 5`) and reach 650, which is why the age bound is stated
   *     rather than left to the word "adult".
   *   · Both declined, adult of 45-120 kg: 250 to 600 kcal.
   *   · Across the entire accepted domain: 50 to 1,450 kcal — and for the
   *     lightest, oldest athletes who declined a height it is worth nothing at
   *     all, where `narrowingWorth` returns null rather than a figure.
   *
   * The old range therefore understated the ceiling by more than half AND
   * described nobody's ordinary case. A bare range is what went stale twice, so
   * any figure repeated from here carries the domain it was measured on.
   * `narrowingWorth` computes the athlete's own figure and the Fuel screen
   * prints it; a fixed number belongs nowhere else. It is NOT a body-composition
   * field —
   * `coach/nutrition.ts` is explicit that ICEFALL sets no weight target and no
   * body-composition target, and this field does not weaken that sentence.
   *
   * A DIFFERENT QUESTION FROM `gender`, which sits immediately above it here
   * and immediately before it in the flow. Never read one as the other. See
   * `SexAtBirth` and `sexTermFor` for why, at length.
   *
   * `"prefer-not-to-say"` is a value, not an absence. Undefined means the
   * question was never put — which is every record written before 2026-09-03,
   * and there is no backfill because a default here would be ICEFALL answering
   * a question about somebody's body on their behalf.
   */
  sexAtBirth?: SexAtBirth;
  /**
   * Where they say they found ICEFALL.
   *
   * THE ONE ANSWER IN THIS FLOW THAT IS FOR ICEFALL RATHER THAN FOR THE ATHLETE,
   * and the step says so in those words. It buys them nothing, so it is the one
   * question whose "I'd rather not say" costs the person answering it nothing
   * at all.
   *
   * Undefined means never asked. That distinction is the whole value of the
   * field: everybody who signed up before this question existed will read as
   * undefined forever, and a report that counted them as "didn't say" would be
   * describing ICEFALL's own rollout while claiming to describe its audience.
   */
  heardAbout?: HeardAboutChannel;
  name: string;
  disciplines: Discipline[];
  experience: ExperienceLevel;
  goalName: string;
  goalMountainId?: string;
  goalElevationM?: number;
}

interface Persisted {
  onboarded: boolean;
  /**
   * ISO date this install first ran.
   *
   * Written once and never rewritten. The demo fixture's `memberSince` is
   * computed as "three years before now" at module load, so anything seeded from
   * it changed value every calendar day — the passport's Record no. is hashed
   * from it and was different each morning, and the cover claimed a membership
   * that predated the install by three years.
   */
  memberSince?: string;
  name?: string;
  disciplines?: Discipline[];
  experience?: ExperienceLevel;
  customGoals: Goal[];
  /** `${weekIndex}:${isoDate}` → completed. Overrides the generated plan. */
  sessionOverrides: Record<string, boolean>;
  hydrationMl?: number;
  kudos: string[];
  /**
   * Drives the calorie estimate. Was hardcoded to 72 kg for everyone.
   *
   * Optional on purpose: undefined means the athlete has never told us, which
   * is a different thing from weighing 72 kg. Read it through `bodyMassKgSet`
   * wherever that difference matters.
   */
  bodyMassKg?: number;
  autoPause?: boolean;
  objectives?: SavedObjective[];
  threads?: EnquiryThread[];
  /** Newest first. One entry per day at most. */
  account?: Account;
  /** Written by installs that predate tiers, so `tier` may be missing at runtime. */
  subscription?: Partial<Subscription>;
  coachUsage?: CoachUsage;
  checkIns?: CoachCheckIn[];
  coachProfile?: CoachProfile;
  /** Coach AI spend this month. See @/coach/budget — the REAL cap is server-side. */
  coachBudget?: BudgetState;
  notifications?: NotificationPrefs;
  /* ---- Expedition Network (see the block above `AppStateValue`) ----------- */
  // All optional, so records written before the network existed load unchanged
  // and read as opted out — which is the correct default for anyone who has
  // never been asked. No storage-key bump is needed to add an optional field.
  networkOptIn?: boolean;
  locationOptIn?: boolean;
  myProfile?: AthleteProfile;
  expeditions?: Expedition[];
  connectionRequests?: ConnectionRequest[];
  blockedIds?: string[];
  /* ---- Group planning (see the block above `groupSessions`) --------------- */
  // Keyed to an expedition id, and optional for the same reason as everything
  // above: records written before groups had a workspace load unchanged and
  // read as a group nobody has planned anything in yet.
  groupSessions?: GroupTrainingSession[];
  groupMessages?: GroupMessage[];
  groupNotes?: Record<string, string>;
  groupChecklistShared?: Record<string, boolean>;
  groupStyle?: Record<string, GroupStyle>;
  /* ---- Equipment checklist (see the block above `checklistStatuses`) ------ */
  // Optional for the same reason as the network fields: records written before
  // the checklist existed load unchanged and read as an untouched list.
  checklistStatuses?: Record<string, Record<string, ItemStatus>>;
  packItems?: Record<string, PackItem[]>;
  packTargetGrams?: Record<string, number>;
}

/**
 * Deliberately empty. A profile that pretends the athlete owns a full gym or
 * has climbed at altitude would feed fabricated inputs straight into readiness.
 */
const EMPTY_COACH_PROFILE: CoachProfile = {
  disciplineExperience: {},
  availableEquipment: [],
  trainingDays: [],
  typicalSessionMin: 60,
  technicalSkills: [],
};

const EMPTY: Persisted = {
  onboarded: false,
  customGoals: [],
  sessionOverrides: {},
  kudos: [],
};

/** Today, as an ISO date. Stamped once, the first time the app runs. */
const todayIso = () => new Date().toISOString();

function load(): Persisted {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY, memberSince: todayIso(), objectives: seedObjectives() };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    // Existing installs predate the objectives list — seed it once.
    return {
      ...EMPTY,
      ...parsed,
      objectives: parsed.objectives ?? seedObjectives(),
      // Installs that predate this field get stamped now rather than inheriting
      // the fixture's rolling date. Once written it never moves again.
      memberSince: parsed.memberSince ?? todayIso(),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * A local id that cannot collide with the one issued a moment before it.
 *
 * `Date.now()` alone is not enough for records the athlete can create in quick
 * succession — two messages posted inside the same millisecond would share an
 * id, and both React keys and every by-id lookup (RSVPs, deletion) would then
 * act on the wrong row. The counter is per session, which is all that is needed:
 * the timestamp separates sessions and the counter separates within one.
 */
let idSeq = 0;
const localId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/**
 * An enquiry the athlete has written to an expedition operator.
 *
 * Held on the device. ICEFALL has no operator network connected, so nothing is
 * transmitted and no reply will ever arrive — the compose screen says so before
 * you write a word. The shape is the one a real backend would use, so wiring it
 * up later doesn't touch the screens.
 */
export interface EnquiryMessage {
  id: string;
  from: "you" | "operator";
  body: string;
  at: string;
}

export interface EnquiryThread {
  id: string;
  operatorId: string;
  operatorName: string;
  peakName: string;
  elevationM?: number;
  /** The goal this enquiry came from, for the link back. */
  goalId?: string;
  messages: EnquiryMessage[];
  createdAt: string;
}

/**
 * What the athlete has told ICEFALL about themselves, as opposed to what it
 * measured. Kept separate from recorded data on purpose: the Coach must always
 * be able to tell the difference between "we observed this" and "they said so",
 * and technical and altitude experience can only ever be the latter.
 */
export interface CoachProfile {
  /** Discipline id → experience level, e.g. { hiking: "advanced" }. */
  disciplineExperience: Record<string, "beginner" | "intermediate" | "advanced" | "expert">;
  /** Equipment ids from `@/coach/exercises`. Drives session generation. */
  availableEquipment: string[];
  /** 0 = Sunday … 6 = Saturday. Days the athlete can normally train. */
  trainingDays: number[];
  typicalSessionMin: number;
  /** Technical competences the athlete claims. Never inferred from activity. */
  technicalSkills: string[];
  /** Highest altitude actually reached, self-reported. */
  maxAltitudeM?: number;
  /**
   * What sessions must train AROUND. Category ids plus the athlete's own words.
   *
   * A PRESCRIPTION CONSTRAINT, not clinical context. Everything downstream of
   * this field may narrow what it offers; nothing downstream may interpret it.
   */
  limitations?: string[];
  limitationsNote?: string;
  /** Constrains ascent-rate guidance only. */
  altitudeIllness?: string | null;
  /** Days a week currently trained, at signup. */
  trainingBaseline?: string | null;
}

/**
 * The athlete's ICEFALL account.
 *
 * ICEFALL has no auth backend, so this is a profile on this device and nothing
 * more. That is stated in the sign-up flow rather than implied, and it is why
 * NO PASSWORD IS STORED here: the sign-up form validates one so the rules are
 * real, then discards it. Persisting a credential that gates nothing would be
 * security theatre and a genuine liability if the device were shared.
 */
export interface Account {
  name: string;
  email: string;
  createdAt: string;
  /** Always true today. A server-backed account would be false. */
  local: true;
}

/**
 * The athlete's ICEFALL plan.
 *
 * IMPORTANT: no payment is taken and no card is ever collected. ICEFALL has no
 * payment processor wired up, so `startTrial` begins a LOCAL trial and nothing
 * is charged when it ends — the paywall states that plainly rather than
 * implying a silent renewal. When billing lands, this is the seam: swap the
 * local dates for the processor's subscription record and the screens above it
 * do not change.
 *
 * The prices live in `@/growth/tiers` and are NOT repeated here — this comment
 * used to list them ("Pro €14.99 … Elite €29.99") and was wrong on every figure
 * within a day of the plans changing. There is one paid plan now. Whatever that
 * file says, it is what the plan WILL cost when subscriptions go live: nothing
 * has ever been charged to anyone, and every surface that shows a price says so.
 *
 * Do not "complete" this by adding a card form. Collecting payment details into
 * a prototype with no processor is both useless and unsafe.
 */
export interface Subscription {
  /**
   * `active` exists for the day billing lands. NOTHING IN THIS BUILD SETS IT —
   * there is no processor to confirm a payment, so an app that could mark
   * itself paid would be marking itself paid on nothing.
   */
  status: "none" | "trialing" | "active" | "expired";
  /** The plan bought. Defaults to `free`; the trial grants `pro` for its length. */
  tier: TierId;
  /** ISO. Set when the trial begins. */
  startedAt?: string;
  /** ISO. `TRIAL_DAYS` after `startedAt`. */
  endsAt?: string;
}

/**
 * Prices, plans and gating live in `@/growth/tiers` — one table, so a price
 * change cannot leave stale copy behind on a screen nobody re-read.
 *
 * Re-exported here because screens already reach for the subscription through
 * this module, and two import paths for the same constant is how the two drift.
 */
export { TRIAL_DAYS };

/**
 * Coach interactions used in one calendar month.
 *
 * The free allowance is metered rather than described: a limit that is written
 * on the plan card and enforced nowhere is a claim the app cannot keep, and one
 * that is enforced without being visible is worse.
 */
export interface CoachUsage {
  /** `YYYY-MM`, from LOCAL date components — see `monthKey`. */
  month: string;
  count: number;
}

/**
 * The current month, built from local date components.
 *
 * NEVER toISOString() here: a UTC key rolls the month over early for anyone
 * west of Greenwich, so on the last evening of the month their allowance would
 * silently reset — or, on the first evening, be counted against the month they
 * have already left. The same bug already bit the training week strip.
 */
function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface NotificationPrefs {
  training: boolean;
  recovery: boolean;
  goal: boolean;
  conditions: boolean;
}

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  training: true,
  recovery: true,
  goal: true,
  conditions: false,
};

interface AppStateValue {
  user: User;
  goals: Goal[];
  onboarded: boolean;
  /**
   * Returns what actually happened to the sex answer — see `SexNarrowing`.
   *
   * A caller is free to ignore it (sign-in restore does), but no caller may
   * report the answer as narrowing anything without reading it first: on a phone
   * that already holds an answer the write is refused, and the older `void`
   * signature is what let the payoff screen claim a narrowing that never
   * happened.
   */
  completeOnboarding: (a: OnboardingAnswers) => SexNarrowing;
  resetAll: () => void;
  isSessionComplete: (weekIndex: number, date: string, fallback: boolean) => boolean;
  toggleSession: (weekIndex: number, date: string, fallback: boolean) => void;
  hydrationMl: number;
  addHydration: (ml: number) => void;
  /**
   * The athlete's weight, defaulted to 72 kg when they have never given one.
   *
   * Every consumer that needs a number can use this. Any consumer that needs to
   * know whether the number is REAL must use `bodyMassKgSet` — the default is
   * indistinguishable from a genuine 72 kg answer, and that ambiguity has
   * already put an invented body into the AI coach's prompt once.
   */
  bodyMassKg: number;
  /**
   * The weight as actually stored: `null` where the athlete has never set one.
   *
   * Not a boolean, for the reason recorded as §6ag — a boolean is a cached
   * parse, and the value itself answers both "is it set" and "what is it".
   */
  bodyMassKgSet: number | null;
  setBodyMassKg: (kg: number) => void;
  autoPause: boolean;
  setAutoPause: (on: boolean) => void;
  hasKudos: (postId: string) => boolean;
  toggleKudos: (postId: string) => void;
  addGoal: (g: Omit<Goal, "id" | "status" | "preparation">) => void;
  /** Only goals the athlete created can be removed; the seeded ones are fixtures. */
  removeGoal: (id: string) => void;
  canRemoveGoal: (id: string) => boolean;
  objectives: SavedObjective[];
  addObjective: (o: Omit<SavedObjective, "addedAt">) => void;
  removeObjective: (id: string) => void;
  toggleSummited: (id: string) => void;
  hasObjective: (id: string) => boolean;
  threads: EnquiryThread[];
  startEnquiry: (t: Omit<EnquiryThread, "id" | "messages" | "createdAt">, body: string) => string;
  replyToThread: (threadId: string, body: string) => void;
  removeThread: (threadId: string) => void;
  account: Account | undefined;
  createAccount: (a: { name: string; email: string }) => void;
  subscription: Subscription;
  /** Days left in the trial, or null when no trial is running. */
  trialDaysLeft: number | null;
  /** Starts a local `TRIAL_DAYS` trial of Pro. Takes no payment — there is none to take. */
  startTrial: () => void;
  /** What the athlete can use today: `pro` while trialing, otherwise the plan they hold. */
  currentTier: TierId;
  /**
   * Whether the current tier includes a feature. Gates growth surfaces only —
   * never an athlete's own recorded training, and never something they had
   * yesterday.
   */
  can: (id: FeatureId) => boolean;
  /** This month's Coach usage. Resets on the local month boundary. */
  coachUsage: CoachUsage;
  /** Interactions left this month, or null when the tier is unlimited. */
  coachInteractionsLeft: number | null;
  /** Call once per answered Coach question. Only counts on a metered tier. */
  recordCoachInteraction: () => void;
  signOut: () => void;
  checkIns: CoachCheckIn[];
  /** Today's check-in, or undefined when it hasn't been done. Never a default. */
  todaysCheckIn: CoachCheckIn | undefined;
  saveCheckIn: (c: Omit<CoachCheckIn, "date">) => void;
  coachProfile: CoachProfile;
  updateCoachProfile: (patch: Partial<CoachProfile>) => void;
  /** This month's Coach AI spend, in micro-dollars. Resets on the month boundary. */
  coachBudget: BudgetState;
  /** Bank one credit and what the exchange actually cost. */
  recordCoachSpend: (micros: number) => void;
  notifications: NotificationPrefs;
  setNotification: (k: keyof NotificationPrefs, v: boolean) => void;

  /* ---- Expedition Network ------------------------------------------------ */

  /**
   * Whether the athlete has opted into the Expedition Network at all.
   *
   * FALSE until they say otherwise. Nothing about them is compared, matched or
   * held as a network profile before that — not that it could go anywhere:
   * there is no server and there are no other members, so every list in this
   * feature is empty and must render its empty state rather than sample people.
   */
  networkOptIn: boolean;
  setNetworkOptIn: (on: boolean) => void;
  /**
   * A SEPARATE and likewise FALSE-by-default opt-in for approximate location.
   *
   * Joining the network is not consent to be located, so the two are distinct
   * switches. Nothing may read the device's position until this is true, and
   * `updateMyProfile` refuses to store an area while it is false. Turning it
   * off deletes the stored area rather than hiding it.
   */
  locationOptIn: boolean;
  setLocationOptIn: (on: boolean) => void;
  /** Null until the athlete fills anything in. Never a pre-populated example. */
  myProfile: AthleteProfile | null;
  /**
   * Patches the local profile, creating it on first write.
   *
   * Two rules are enforced here rather than trusted to callers: `verified` is
   * always false, and any location is coarsened before it is stored.
   */
  updateMyProfile: (patch: Partial<AthleteProfile>) => void;
  /**
   * Expeditions THIS athlete created, on THIS device. Real, local and the only
   * ones that exist — there is no directory of other people's trips to browse.
   */
  expeditions: Expedition[];
  createExpedition: (e: Omit<Expedition, "id" | "createdAt" | "createdBy" | "memberIds">) => string;
  leaveExpedition: (id: string) => void;
  /**
   * Messages written to other athletes. Every one is `queued` and stays queued:
   * nothing is transmitted and no reply can arrive. See `NETWORK_NOT_CONNECTED_NOTICE`.
   */
  connectionRequests: ConnectionRequest[];
  /** Returns the local id of the queued request. Refuses anyone blocked. */
  queueConnection: (toAthleteId: string, message: string) => string;
  blockedIds: string[];
  blockAthlete: (id: string) => void;
  /** Blocking must be reversible; an irreversible one-tap block is a trap. */
  unblockAthlete: (id: string) => void;

  /* ---- Group planning ----------------------------------------------------

     The planning surface behind a group — sessions, notes, messages and how the
     party intends to climb. All of it is keyed to an expedition id, all of it is
     held on this device, and none of it goes anywhere: there is no server and no
     other members, so an RSVP tells nobody, a message reaches nobody, and
     sharing the checklist shares with nobody. Every screen below says so before
     the athlete writes rather than after.

     A group deleted through `leaveExpedition` takes all of it with it, so
     nothing is left keyed to a party that no longer exists.                    */

  /** Every planned session, across every group. Empty until one is planned. */
  groupSessions: GroupTrainingSession[];
  addGroupSession: (
    groupId: string,
    session: { title: string; dayKey: string; time?: string; place?: string; note?: string },
  ) => string;
  removeGroupSession: (sessionId: string) => void;
  /**
   * The local athlete's own RSVP. `null` clears it back to no reply, which is
   * a distinct state from "not going" and has to stay recoverable.
   */
  setSessionRsvp: (sessionId: string, status: RsvpStatus | null) => void;
  /**
   * Messages written in a group. Held here, delivered nowhere — the model
   * carries no delivery status on purpose. See `GROUP_CHAT_NOTICE`.
   */
  groupMessages: GroupMessage[];
  postGroupMessage: (groupId: string, body: string) => string;
  removeGroupMessage: (messageId: string) => void;
  /** Free planning text per group id. */
  groupNotes: Record<string, string>;
  setGroupNote: (groupId: string, text: string) => void;
  /**
   * Whether the athlete has chosen to share their own checklist statuses with
   * a group. FALSE by default: what somebody has and has not sorted is theirs,
   * and it is never shared by omission. Recording it changes nothing today.
   */
  groupChecklistShared: Record<string, boolean>;
  setGroupChecklistShared: (groupId: string, shared: boolean) => void;
  /**
   * Guided or independent, per group id. ABSENT means not recorded — never
   * "independent", which would be ICEFALL deciding on someone's behalf that
   * they are climbing without a guide.
   */
  groupStyle: Record<string, GroupStyle>;
  setGroupStyle: (groupId: string, style: GroupStyle | null) => void;

  /* ---- Equipment checklist ----------------------------------------------- */

  /**
   * What the athlete has recorded against each generated kit item, keyed
   * goalId → itemId.
   *
   * ABSENT is not "need": an item with no entry has simply not been reviewed,
   * and the completion figure counts it as outstanding rather than claiming the
   * athlete said anything about it. Nothing is ever pre-filled — a checklist
   * that starts half-ticked would be packing someone's bag for them.
   */
  checklistStatuses: Record<string, Record<string, ItemStatus>>;
  setChecklistStatus: (goalId: string, itemId: string, status: ItemStatus) => void;
  /** Undoes a mis-tap. Returns the row to "not reviewed", not to "need". */
  clearChecklistStatus: (goalId: string, itemId: string) => void;
  /**
   * Itemised pack weights the athlete entered, keyed goalId.
   *
   * Every gram here was typed in by them. ICEFALL never seeds this from a
   * catalogue weight or an average — see `PackItem.grams`, which is null until
   * something is actually weighed.
   */
  packItems: Record<string, PackItem[]>;
  addPackItem: (goalId: string, item: Omit<PackItem, "id">) => void;
  removePackItem: (goalId: string, itemId: string) => void;
  /** The athlete's own target, or their operator's. ICEFALL sets no default. */
  packTargetGrams: Record<string, number>;
  setPackTarget: (goalId: string, grams: number | null) => void;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode or quota — the app still works, it just won't remember.
    }
  }, [state]);

  const user = useMemo<User>(
    () => ({
      ...USER,
      name: state.name ?? USER.name,
      disciplines: state.disciplines ?? USER.disciplines,
      experience: state.experience ?? USER.experience,
      onboarded: state.onboarded,
      /**
       * PERSONAL CLAIMS ARE NOT INHERITED FROM THE FIXTURE.
       *
       * Spreading `USER` brought the demo athlete's invented history with it:
       * four summits they never climbed and five achievements they never earned,
       * rendered as their own on the Profile, and printed on the Mountain
       * Passport and the Mountain CV — a document whose entire framing is that
       * it is a record of what this person has actually done. In DEV the fixture
       * is still useful for seeing a populated passport, so it is kept there and
       * nowhere else.
       */
      summits: import.meta.env.DEV ? USER.summits : [],
      achievements: import.meta.env.DEV ? USER.achievements : [],
      /* Level / XP are gone from the model entirely — PH-22. The earlier fix
         zeroed them in production but left the DEV fixture rendering Level 24,
         and once points were removed (D5) that fixture was the only
         progression figure left in any build. The sentence that used to close
         this comment — "the Profile shows points instead" — had itself gone
         stale: points were removed after it was written. A fake number behind
         a DEV flag is still a fake number in every screenshot and review. */
      // A real date for this install, not "three years before whenever you
      // happen to open the app".
      memberSince: state.memberSince ?? USER.memberSince,
    }),
    [state.name, state.disciplines, state.experience, state.onboarded, state.memberSince],
  );

  /**
   * THE OBJECTIVE IS THE ATHLETE'S, OR THERE ISN'T ONE.
   *
   * The three fixture goals were merged in unconditionally, so a production
   * install carried Mont Blanc via the Goûter Route, the Matterhorn and Everest
   * as this person's own active objectives — with `trainingStartedAt` eleven
   * weeks ago, `preparation: 62`, and a gap list making direct claims about what
   * they had and had not done: *"Altitude exposure above 4,000 m — one rotation
   * completed of three"*, *"Crevasse rescue refresher outstanding"*, *"Loaded
   * carries at 15 kg not yet started"*.
   *
   * Worse than a stray card, because `usePrimaryGoal` sorts by SOONEST target
   * date rather than preferring the athlete's own. Mont Blanc sits eight months
   * out, so an athlete who finished onboarding naming an objective further away
   * had the fixture's mountain promoted over their own — and Home, the Coach,
   * the kit checklist, the conditions band and the benchmark all orient on the
   * primary goal. The whole app pointed at a mountain they never chose and told
   * them they were twelve weeks into training for it.
   *
   * Same rule as the summits, the achievements and the level above: in DEV the
   * fixture is worth having so a populated app can be judged, and nowhere else.
   */
  const goals = useMemo<Goal[]>(() => [...state.customGoals, ...SEEDED_GOALS], [state.customGoals]);

  const completeOnboarding = useCallback((a: OnboardingAnswers): SexNarrowing => {
    /**
     * THE ONE ANSWER ON THIS OBJECT THAT CHANGES A LIVE NUMBER, SENT WHERE THAT
     * NUMBER IS COMPUTED.
     *
     * This function used to persist five things — onboarded, name, disciplines,
     * experience and any goal — and drop the rest, `sexAtBirth` included. That
     * was fine for gender and for where they heard about ICEFALL, which are
     * recorded and read by nothing and whose screens say so. It was not fine for
     * this one: three screens promised it narrowed the daily energy estimate,
     * and nothing carried it to the estimate.
     *
     * DELIBERATELY OUTSIDE `setState`. The updater below is invoked twice under
     * StrictMode; a localStorage write in there would run twice and, worse,
     * would put an effect inside a function React is entitled to treat as pure.
     *
     * THIS ALSO COVERS SIGN-IN ON A SECOND DEVICE, which is why it belongs here
     * and not in the signup screen. `screens/auth/Auth.tsx` restores the answers
     * blob from the server and calls this function with it, so a new phone gets
     * the narrowed estimate without re-asking a question already answered. That
     * path hands over raw `jsonb`, so the validation is not decorative — see
     * `rememberSexForEnergyFromSignup`, which fails closed on anything it does
     * not recognise.
     *
     * THE RESULT IS RETURNED, NOT SWALLOWED. Three things can happen — the
     * answer lands, the device already holds one, or storage refuses the write —
     * and only the first is a narrowing. The caller that draws the "what your
     * answers changed" panel needs to know which, so the outcome is handed back
     * rather than inferred from the absence of an exception. `screens/auth/
     * Auth.tsx` restores a blob and has no panel to draw, so it ignores this
     * return value; that is fine, and it is not the same thing as claiming a
     * success it never checked.
     */
    const sexNarrowing = rememberSexForEnergyFromSignup(a.sexAtBirth);

    setState((s) => {
      /**
       * Only create a goal when the athlete named one we don't already track —
       * and "already track" has to mean the list they will actually see.
       *
       * This read `GOALS` directly. Once the fixture became DEV-only that was a
       * bypass with teeth: in production an athlete who typed "Mont Blanc",
       * "Matterhorn" or "Everest" during onboarding would match a fixture goal
       * that is no longer in `goals`, so no objective was created and they
       * finished onboarding with none at all — having just named one. Matching
       * against `SEEDED_GOALS` keeps the dedupe honest in DEV and inert in
       * production, which is what the check was for.
       */
      const existing = SEEDED_GOALS.find(
        (g) =>
          g.mountainId === a.goalMountainId ||
          g.name.toLowerCase() === a.goalName.trim().toLowerCase(),
      );

      const customGoals =
        existing || !a.goalName.trim()
          ? s.customGoals
          : [
              {
                id: `goal-custom-${Date.now()}`,
                name: a.goalName.trim(),
                subtitle: "Custom objective",
                elevationM: a.goalElevationM,
                mountainId: a.goalMountainId,
                trainingStartedAt: new Date().toISOString(),
                targetDate: monthsAhead(10),
                preparation: 5,
                status: "active" as const,
                gaps: [
                  "Training plan not yet generated",
                  "Baseline fitness assessment outstanding",
                ],
              },
              ...s.customGoals,
            ];

      return {
        ...s,
        onboarded: true,
        name: a.name.trim() || USER.name,
        disciplines: a.disciplines,
        experience: a.experience,
        customGoals,
      };
    });

    return sexNarrowing;
  }, []);

  /*
   * "ERASE ALL DATA" — BY PREFIX, BECAUSE A LIST GOES STALE AND A PROMISE DOES NOT.
   *
   * This removed exactly two keys. The app writes THIRTY-SIX. So the button
   * labelled "Erase all data and replay onboarding" left behind the food log and
   * hydration, the sex answer, posts, comments, summit logs, the profile — name,
   * bio, avatar and banner — the block list, the follow list, filed reports and
   * the queue of reports not yet sent, readiness history, and a half-finished
   * recording. On a shared, sold or returned phone the next person inherited all
   * of it, and on this app that includes health data and somebody's answer to a
   * question about their body.
   *
   * It was not wrong when it was written; it was written when two stores existed
   * and every store added since was a key nobody came back to add. That is the
   * failure mode a list has and a rule does not, which is why this now clears by
   * PREFIX: everything under `icefall.` goes, including keys that do not exist
   * yet. A store added tomorrow is erased by this function without anybody
   * remembering to come here.
   *
   * ANYTHING THAT MUST SURVIVE GOES IN `KEEP`, WITH ITS REASON. The list is empty
   * on purpose. A device-display preference is a weak reason to survive a reset,
   * and a reset that keeps something the person was not told about is the same
   * broken promise in miniature.
   *
   * The real fix for the shared-phone case is sign-out clearing per-person state,
   * which it deliberately does not do (see `signOut`) — this button is the only
   * complete erase the app has, so it has to actually be complete.
   */
  const resetAll = useCallback(() => {
    setState(EMPTY);
    const KEEP = new Set<string>();
    try {
      /* Collected before removing: mutating localStorage while iterating its
         index re-numbers the remaining keys and silently skips every other one. */
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith("icefall.") && !KEEP.has(k)) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* private mode — nothing to clear */
    }
  }, []);

  const threads = useMemo(() => state.threads ?? [], [state.threads]);

  const startEnquiry = useCallback(
    (thread: Omit<EnquiryThread, "id" | "messages" | "createdAt">, body: string) => {
      const now = new Date().toISOString();
      const id = `thread-${Date.now()}`;
      setState((s) => ({
        ...s,
        threads: [
          {
            ...thread,
            id,
            createdAt: now,
            messages: [{ id: `msg-${Date.now()}`, from: "you", body, at: now }],
          },
          ...(s.threads ?? []),
        ],
      }));
      return id;
    },
    [],
  );

  const replyToThread = useCallback((threadId: string, body: string) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      threads: (s.threads ?? []).map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, { id: `msg-${Date.now()}`, from: "you", body, at: now }],
            }
          : t,
      ),
    }));
  }, []);

  const removeThread = useCallback((threadId: string) => {
    setState((s) => ({ ...s, threads: (s.threads ?? []).filter((t) => t.id !== threadId) }));
  }, []);

  /* ---- Account ----------------------------------------------------------- */

  const account = state.account;

  const createAccount = useCallback((a: { name: string; email: string }) => {
    setState((s) => ({
      ...s,
      account: {
        name: a.name.trim(),
        email: a.email.trim().toLowerCase(),
        createdAt: new Date().toISOString(),
        local: true,
      },
      /*
       * `name` IS SET HERE TOO, and that is not redundant.
       *
       * `user.name` reads `state.name ?? USER.name`, where USER is the demo
       * fixture. Before accounts existed, `state.name` was only ever set by the
       * onboarding question, so anybody who had not answered it rendered as the
       * fixture athlete. That was survivable when nothing else on the screen was
       * real.
       *
       * It is not survivable now: the Profile renders the SERVER handle directly
       * under this name, so an unset name puts the demo athlete's name above a
       * real person's @handle — two identities in one heading, which is worse
       * than either being wrong alone. Seen on screen during testing.
       *
       * The account name wins only where the athlete has not chosen one; a name
       * they typed in onboarding is theirs and is never overwritten.
       */
      name: s.name ?? a.name.trim(),
    }));
  }, []);

  const subscription = useMemo<Subscription>(() => {
    const stored = state.subscription;
    const sub: Subscription = {
      status: stored?.status ?? "none",
      // Installs from before tiers existed have no `tier`. Free is the honest
      // default: holding a paid plan is something that has to have happened,
      // not something we assume because a record is old.
      tier: stored?.tier ?? "free",
      startedAt: stored?.startedAt,
      endsAt: stored?.endsAt,
    };

    // Expiry is derived on read rather than written by a timer — a stored
    // "trialing" flag would keep claiming an active trial for anyone who left
    // the app closed for a week, and no timer runs in a closed app.
    const lapsed =
      (sub.status === "trialing" || sub.status === "active") &&
      sub.endsAt !== undefined &&
      new Date(sub.endsAt) <= new Date();

    // A lapsed trial leaves no plan behind. Nothing was charged, so nothing was
    // bought — the tier falls back to free and the screens say what that means.
    if (lapsed) return { ...sub, status: "expired", tier: "free" };
    return sub;
  }, [state.subscription]);

  const trialDaysLeft = useMemo(() => {
    if (subscription.status !== "trialing" || !subscription.endsAt) return null;
    const ms = new Date(subscription.endsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }, [subscription]);

  const startTrial = useCallback(() => {
    setState((s) => {
      // A second tap must not quietly extend a trial that is already running.
      const running =
        s.subscription?.status === "trialing" &&
        s.subscription.endsAt !== undefined &&
        new Date(s.subscription.endsAt) > new Date();
      if (running) return s;

      const now = new Date();
      const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
      return {
        ...s,
        // Tier `pro`, because that is what the trial opens. No payment method is
        // taken to start it and nothing is charged when it ends.
        subscription: {
          status: "trialing",
          tier: "pro",
          startedAt: now.toISOString(),
          endsAt: ends.toISOString(),
        },
      };
    });
  }, []);

  /**
   * The tier in force right now.
   *
   * Pro for the length of the trial, then whatever plan is actually held —
   * which, with no processor connected, is free for everyone.
   */
  const currentTier = useMemo<TierId>(
    () => (subscription.status === "trialing" ? "pro" : subscription.tier),
    [subscription],
  );

  const can = useCallback((id: FeatureId) => hasFeature(currentTier, id), [currentTier]);

  /* ---- Coach usage ------------------------------------------------------ */

  // Read against the current month rather than trusting the stored key: a month
  // that has rolled over reads as zero used, without needing a write to make it
  // true. The reset lands on the athlete's own calendar, not UTC's.
  const coachUsage = useMemo<CoachUsage>(() => {
    const month = monthKey();
    const stored = state.coachUsage;
    return stored && stored.month === month ? stored : { month, count: 0 };
  }, [state.coachUsage]);

  const coachInteractionsLeft = useMemo<number | null>(() => {
    if (hasFeature(currentTier, "coach.unlimited")) return null;
    return Math.max(0, FREE_COACH_INTERACTIONS_PER_MONTH - coachUsage.count);
  }, [currentTier, coachUsage]);

  const recordCoachInteraction = useCallback(() => {
    // Unlimited tiers are not counted. If a trial's usage were logged, the free
    // allowance would already be spent the moment the trial lapsed — the athlete
    // would be told they have three questions a month and be given none.
    if (hasFeature(currentTier, "coach.unlimited")) return;
    setState((s) => {
      const month = monthKey();
      const prev = s.coachUsage?.month === month ? s.coachUsage.count : 0;
      return { ...s, coachUsage: { month, count: prev + 1 } };
    });
  }, [currentTier]);

  // Signing out clears the account but deliberately keeps recorded activity and
  // goals — losing an athlete's training history because they tapped sign out
  // would be unforgivable, and there is no server to restore it from.
  const signOut = useCallback(() => {
    setState((s) => ({ ...s, account: undefined }));
  }, []);

  /* ---- Coach ------------------------------------------------------------ */

  const checkIns = useMemo(() => state.checkIns ?? [], [state.checkIns]);

  // Local date components, never toISOString(): a UTC date string shifts the
  // day for anyone west of Greenwich after mid-afternoon, which already caused
  // a real bug in the training week strip.
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const todaysCheckIn = useMemo(() => checkIns.find((c) => c.date === todayKey()), [checkIns]);

  const saveCheckIn = useCallback((c: Omit<CoachCheckIn, "date">) => {
    const date = todayKey();
    setState((s) => {
      const rest = (s.checkIns ?? []).filter((x) => x.date !== date);
      return { ...s, checkIns: [{ ...c, date }, ...rest].slice(0, 180) };
    });
  }, []);

  const coachProfile = useMemo<CoachProfile>(
    () => ({ ...EMPTY_COACH_PROFILE, ...(state.coachProfile ?? {}) }),
    [state.coachProfile],
  );

  const coachBudget = useMemo(() => normaliseBudget(state.coachBudget), [state.coachBudget]);

  const recordCoachSpend = useCallback((micros: number) => {
    setState((s) => {
      const current = normaliseBudget(s.coachBudget);
      return {
        ...s,
        coachBudget: {
          ...current,
          // One reply, one credit — whatever it happened to cost.
          creditsUsed: current.creditsUsed + 1,
          spentMicros: current.spentMicros + Math.max(0, Math.ceil(micros) || 0),
        },
      };
    });
  }, []);

  const updateCoachProfile = useCallback((patch: Partial<CoachProfile>) => {
    setState((s) => ({
      ...s,
      coachProfile: { ...EMPTY_COACH_PROFILE, ...(s.coachProfile ?? {}), ...patch },
    }));
  }, []);

  const notifications = useMemo<NotificationPrefs>(
    () => ({ ...DEFAULT_NOTIFICATIONS, ...(state.notifications ?? {}) }),
    [state.notifications],
  );

  const setNotification = useCallback((k: keyof NotificationPrefs, v: boolean) => {
    setState((s) => ({
      ...s,
      notifications: { ...DEFAULT_NOTIFICATIONS, ...(s.notifications ?? {}), [k]: v },
    }));
  }, []);

  /* ---- Expedition Network ------------------------------------------------ */

  /**
   * ICEFALL has no server, no user database and no other users, and none of the
   * state below changes that. It holds what the athlete wrote on this device.
   *
   * So: nothing here is ever seeded with an example person, a demo profile or a
   * sample expedition. Every collection starts empty and stays empty until the
   * athlete puts something in it, because at zero users the empty state is the
   * truth. A fabricated partner in this store would reach the screens as a real
   * person to plan a mountain around.
   */

  const networkOptIn = state.networkOptIn === true;
  const locationOptIn = state.locationOptIn === true;
  const myProfile = state.myProfile ?? null;

  const setNetworkOptIn = useCallback((on: boolean) => {
    // Leaving the network does not delete the profile: there is nowhere it was
    // published to, and silently destroying what someone wrote would be worse
    // than keeping it on their own device. Location is the exception below,
    // because a stored position is the one field that stays sensitive.
    setState((s) => ({ ...s, networkOptIn: on }));
  }, []);

  const setLocationOptIn = useCallback((on: boolean) => {
    setState((s) => {
      if (on) return { ...s, locationOptIn: true };
      // Off means gone, not hidden. A position kept "just in case" after
      // someone withdrew consent is a position they no longer know exists.
      const profile = s.myProfile;
      if (!profile || profile.approxLocation === undefined) {
        return { ...s, locationOptIn: false };
      }
      const cleared: AthleteProfile = { ...profile };
      delete cleared.approxLocation;
      return { ...s, locationOptIn: false, myProfile: cleared };
    });
  }, []);

  const updateMyProfile = useCallback((patch: Partial<AthleteProfile>) => {
    setState((s) => {
      const base: AthleteProfile = s.myProfile ?? {
        // One athlete per device, one constant id — see LOCAL_ATHLETE_ID.
        id: LOCAL_ATHLETE_ID,
        displayName: s.name ?? s.account?.name ?? "",
        previousObjectives: [],
        lookingFor: [],
        verified: false,
      };

      const next: AthleteProfile = {
        ...base,
        ...patch,
        id: base.id,
        // Not negotiable and not settable. There is no verification system, so
        // there is no state of the world in which this is true.
        verified: false,
      };

      // Location is handled after the spread so a patch cannot smuggle a
      // precise position past the opt-in or past the coarsening grid. This is
      // the single write boundary for location in the app: everything
      // downstream — matching, display, export — reads a value that is already
      // quantised, so no future caller can leak what was never stored.
      const wantsLocation = patch.approxLocation;
      if (wantsLocation !== undefined && s.locationOptIn === true) {
        const c = coarsen(wantsLocation.lat, wantsLocation.lon);
        next.approxLocation = { label: wantsLocation.label, lat: c.lat, lon: c.lon };
      } else if (wantsLocation === undefined && "approxLocation" in patch) {
        delete next.approxLocation;
      } else if (s.locationOptIn !== true) {
        delete next.approxLocation;
      }

      return { ...s, myProfile: next };
    });
  }, []);

  const expeditions = useMemo(() => state.expeditions ?? [], [state.expeditions]);

  const createExpedition = useCallback(
    (e: Omit<Expedition, "id" | "createdAt" | "createdBy" | "memberIds">) => {
      const id = `expedition-${Date.now()}`;
      setState((s) => ({
        ...s,
        expeditions: [
          {
            ...e,
            id,
            createdBy: s.myProfile?.id ?? LOCAL_ATHLETE_ID,
            // One member, because one member is who exists. The party is never
            // padded towards `sizeMin` to make the group look populated.
            memberIds: [s.myProfile?.id ?? LOCAL_ATHLETE_ID],
            createdAt: new Date().toISOString(),
          },
          ...(s.expeditions ?? []),
        ],
      }));
      return id;
    },
    [],
  );

  const leaveExpedition = useCallback((id: string) => {
    setState((s) => {
      const meId = s.myProfile?.id ?? LOCAL_ATHLETE_ID;
      const next = (s.expeditions ?? [])
        .map((e) => (e.id === id ? { ...e, memberIds: e.memberIds.filter((m) => m !== meId) } : e))
        // An expedition nobody is on is not a group waiting for members: with
        // no backend there is no one who could ever join it, so it is dropped
        // rather than left as an empty record implying a trip still stands.
        .filter((e) => e.memberIds.length > 0);

      // Everything the workspace holds is keyed to a group id, so a group that
      // has gone must take its sessions, messages, notes and preferences with
      // it. Orphaned rows would otherwise sit in storage keyed to a party that
      // no longer exists — and would reattach to any future id that matched.
      const surviving = new Set(next.map((e) => e.id));
      const gone = (s.expeditions ?? [])
        .map((e) => e.id)
        .filter((expeditionId) => !surviving.has(expeditionId));
      if (gone.length === 0) return { ...s, expeditions: next };

      const notes = { ...(s.groupNotes ?? {}) };
      const shared = { ...(s.groupChecklistShared ?? {}) };
      const styles = { ...(s.groupStyle ?? {}) };
      for (const groupId of gone) {
        delete notes[groupId];
        delete shared[groupId];
        delete styles[groupId];
      }

      return {
        ...s,
        expeditions: next,
        groupSessions: (s.groupSessions ?? []).filter((x) => surviving.has(x.groupId)),
        groupMessages: (s.groupMessages ?? []).filter((x) => surviving.has(x.groupId)),
        groupNotes: notes,
        groupChecklistShared: shared,
        groupStyle: styles,
      };
    });
  }, []);

  const connectionRequests = useMemo(
    () => state.connectionRequests ?? [],
    [state.connectionRequests],
  );

  const queueConnection = useCallback((toAthleteId: string, message: string) => {
    const id = `connection-${Date.now()}`;
    setState((s) => {
      // Blocking someone must actually stop messages going to them, even from a
      // screen that forgot to check.
      if ((s.blockedIds ?? []).includes(toAthleteId)) return s;
      return {
        ...s,
        connectionRequests: [
          {
            id,
            toAthleteId,
            message,
            sentAt: new Date().toISOString(),
            // The only status there is. Nothing was sent; see the type.
            status: "queued",
          },
          ...(s.connectionRequests ?? []),
        ],
      };
    });
    return id;
  }, []);

  const blockedIds = useMemo(() => state.blockedIds ?? [], [state.blockedIds]);

  const blockAthlete = useCallback((id: string) => {
    setState((s) => {
      const blocked = s.blockedIds ?? [];
      return {
        ...s,
        blockedIds: blocked.includes(id) ? blocked : [...blocked, id],
        // Anything already written to them goes with the block. Leaving a
        // queued message addressed to someone the athlete has just blocked is
        // the app holding open a channel they closed.
        connectionRequests: (s.connectionRequests ?? []).filter((r) => r.toAthleteId !== id),
      };
    });
  }, []);

  const unblockAthlete = useCallback((id: string) => {
    setState((s) => ({ ...s, blockedIds: (s.blockedIds ?? []).filter((b) => b !== id) }));
  }, []);

  /* ---- Group planning ----------------------------------------------------- */

  const groupSessions = useMemo(() => state.groupSessions ?? [], [state.groupSessions]);

  const addGroupSession = useCallback(
    (
      groupId: string,
      session: { title: string; dayKey: string; time?: string; place?: string; note?: string },
    ) => {
      const id = localId("group-session");
      setState((s) => ({
        ...s,
        groupSessions: [
          {
            ...session,
            id,
            groupId,
            // No RSVP is recorded on creation. Planning a session is not the
            // same as committing to it, and a pre-filled "going" would be the
            // app answering on the athlete's behalf.
            rsvps: {},
            createdAt: new Date().toISOString(),
          },
          ...(s.groupSessions ?? []),
        ],
      }));
      return id;
    },
    [],
  );

  const removeGroupSession = useCallback((sessionId: string) => {
    setState((s) => ({
      ...s,
      groupSessions: (s.groupSessions ?? []).filter((x) => x.id !== sessionId),
    }));
  }, []);

  const setSessionRsvp = useCallback((sessionId: string, status: RsvpStatus | null) => {
    setState((s) => {
      const meId = s.myProfile?.id ?? LOCAL_ATHLETE_ID;
      return {
        ...s,
        groupSessions: (s.groupSessions ?? []).map((session) => {
          if (session.id !== sessionId) return session;
          const rsvps = { ...session.rsvps };
          // Null deletes the entry rather than storing a placeholder: "has not
          // replied" and "is not coming" are different facts about a session,
          // and a mis-tap has to be recoverable to the first of them.
          if (status === null) delete rsvps[meId];
          else rsvps[meId] = status;
          return { ...session, rsvps };
        }),
      };
    });
  }, []);

  const groupMessages = useMemo(() => state.groupMessages ?? [], [state.groupMessages]);

  const postGroupMessage = useCallback((groupId: string, body: string) => {
    const id = localId("group-message");
    setState((s) => ({
      ...s,
      groupMessages: [
        ...(s.groupMessages ?? []),
        {
          id,
          groupId,
          authorId: s.myProfile?.id ?? LOCAL_ATHLETE_ID,
          body,
          at: new Date().toISOString(),
        },
      ],
    }));
    return id;
  }, []);

  const removeGroupMessage = useCallback((messageId: string) => {
    setState((s) => ({
      ...s,
      groupMessages: (s.groupMessages ?? []).filter((m) => m.id !== messageId),
    }));
  }, []);

  const groupNotes = useMemo(() => state.groupNotes ?? {}, [state.groupNotes]);

  const setGroupNote = useCallback((groupId: string, text: string) => {
    setState((s) => {
      const all = { ...(s.groupNotes ?? {}) };
      // An emptied note is removed rather than stored as "", so a group with
      // nothing written in it renders its empty state instead of a blank box
      // that looks like something failed to load.
      if (text.trim() === "") delete all[groupId];
      else all[groupId] = text;
      return { ...s, groupNotes: all };
    });
  }, []);

  const groupChecklistShared = useMemo(
    () => state.groupChecklistShared ?? {},
    [state.groupChecklistShared],
  );

  const setGroupChecklistShared = useCallback((groupId: string, shared: boolean) => {
    setState((s) => ({
      ...s,
      groupChecklistShared: { ...(s.groupChecklistShared ?? {}), [groupId]: shared },
    }));
  }, []);

  const groupStyle = useMemo(() => state.groupStyle ?? {}, [state.groupStyle]);

  const setGroupStyle = useCallback((groupId: string, style: GroupStyle | null) => {
    setState((s) => {
      const all = { ...(s.groupStyle ?? {}) };
      // Cleared means NOT RECORDED again, not "independent". Leaving a default
      // behind would have ICEFALL asserting that a party is climbing without a
      // guide when all the athlete did was change their mind.
      if (style === null) delete all[groupId];
      else all[groupId] = style;
      return { ...s, groupStyle: all };
    });
  }, []);

  /* ---- Equipment checklist ----------------------------------------------- */

  const checklistStatuses = useMemo(() => state.checklistStatuses ?? {}, [state.checklistStatuses]);

  const setChecklistStatus = useCallback((goalId: string, itemId: string, status: ItemStatus) => {
    setState((s) => {
      const all = s.checklistStatuses ?? {};
      return {
        ...s,
        checklistStatuses: {
          ...all,
          [goalId]: { ...(all[goalId] ?? {}), [itemId]: status },
        },
      };
    });
  }, []);

  const clearChecklistStatus = useCallback((goalId: string, itemId: string) => {
    setState((s) => {
      const all = s.checklistStatuses ?? {};
      const forGoal = all[goalId];
      if (!forGoal || !(itemId in forGoal)) return s;
      // Deleted rather than set to a placeholder value: "not reviewed" has to
      // be recoverable, or an accidental tap becomes a permanent claim about
      // equipment the athlete never looked at.
      const next = { ...forGoal };
      delete next[itemId];
      return { ...s, checklistStatuses: { ...all, [goalId]: next } };
    });
  }, []);

  const packItems = useMemo(() => state.packItems ?? {}, [state.packItems]);

  const addPackItem = useCallback((goalId: string, item: Omit<PackItem, "id">) => {
    setState((s) => {
      const all = s.packItems ?? {};
      return {
        ...s,
        packItems: {
          ...all,
          [goalId]: [...(all[goalId] ?? []), { ...item, id: `pack-${Date.now()}` }],
        },
      };
    });
  }, []);

  const removePackItem = useCallback((goalId: string, itemId: string) => {
    setState((s) => {
      const all = s.packItems ?? {};
      return {
        ...s,
        packItems: { ...all, [goalId]: (all[goalId] ?? []).filter((p) => p.id !== itemId) },
      };
    });
  }, []);

  const packTargetGrams = useMemo(() => state.packTargetGrams ?? {}, [state.packTargetGrams]);

  const setPackTarget = useCallback((goalId: string, grams: number | null) => {
    setState((s) => {
      const all = s.packTargetGrams ?? {};
      // Null clears the target outright. A cleared target must not linger as a
      // zero, which would render as a 0 kg goal nobody set.
      if (grams === null || !Number.isFinite(grams) || grams <= 0) {
        const next = { ...all };
        delete next[goalId];
        return { ...s, packTargetGrams: next };
      }
      return { ...s, packTargetGrams: { ...all, [goalId]: Math.round(grams) } };
    });
  }, []);

  const sessionKey = (w: number, d: string) => `${w}:${d}`;

  const isSessionComplete = useCallback(
    (w: number, d: string, fallback: boolean) =>
      state.sessionOverrides[sessionKey(w, d)] ?? fallback,
    [state.sessionOverrides],
  );

  const toggleSession = useCallback((w: number, d: string, fallback: boolean) => {
    setState((s) => {
      const k = sessionKey(w, d);
      const current = s.sessionOverrides[k] ?? fallback;
      return { ...s, sessionOverrides: { ...s.sessionOverrides, [k]: !current } };
    });
  }, []);

  /**
   * A FRESH INSTALL HAS DRUNK NOTHING.
   *
   * The default here was 1,850 ml, inherited from the demo athlete's day, so
   * the nutrition screen opened claiming the athlete had already drunk 1.8 L
   * before they touched it — the same fixture-as-personal-record mistake as the
   * summits below, in a place nobody was looking. In DEV the seeded figure is
   * still useful for judging a populated screen; everywhere else it starts at
   * nothing and only their own taps move it.
   */
  const addHydration = useCallback((ml: number) => {
    setState((s) => ({ ...s, hydrationMl: Math.max(0, (s.hydrationMl ?? SEEDED_HYDRATION_ML) + ml) }));
  }, []);

  const setBodyMassKg = useCallback((kg: number) => {
    setState((s) => ({ ...s, bodyMassKg: Math.max(30, Math.min(200, Math.round(kg))) }));
  }, []);

  const setAutoPause = useCallback((on: boolean) => {
    setState((s) => ({ ...s, autoPause: on }));
  }, []);

  const hasKudos = useCallback((id: string) => state.kudos.includes(id), [state.kudos]);

  const toggleKudos = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      kudos: s.kudos.includes(id) ? s.kudos.filter((k) => k !== id) : [...s.kudos, id],
    }));
  }, []);

  const addGoal = useCallback((g: Omit<Goal, "id" | "status" | "preparation">) => {
    setState((s) => ({
      ...s,
      customGoals: [
        {
          ...g,
          id: `goal-custom-${Date.now()}`,
          status: "active",
          preparation: 5,
          trainingStartedAt: g.trainingStartedAt ?? new Date().toISOString(),
        },
        ...s.customGoals,
      ],
    }));
  }, []);

  const removeGoal = useCallback((id: string) => {
    setState((s) => ({ ...s, customGoals: s.customGoals.filter((g) => g.id !== id) }));
  }, []);

  const canRemoveGoal = useCallback(
    (id: string) => state.customGoals.some((g) => g.id === id),
    [state.customGoals],
  );

  const objectives = useMemo(() => state.objectives ?? [], [state.objectives]);

  const addObjective = useCallback((o: Omit<SavedObjective, "addedAt">) => {
    setState((s) => {
      if ((s.objectives ?? []).some((x) => x.id === o.id)) return s;
      return {
        ...s,
        objectives: [{ ...o, addedAt: new Date().toISOString() }, ...(s.objectives ?? [])],
      };
    });
  }, []);

  const removeObjective = useCallback((id: string) => {
    setState((s) => ({ ...s, objectives: (s.objectives ?? []).filter((o) => o.id !== id) }));
  }, []);

  const toggleSummited = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      objectives: (s.objectives ?? []).map((o) =>
        o.id === id ? { ...o, summitedAt: o.summitedAt ? undefined : new Date().toISOString() } : o,
      ),
    }));
  }, []);

  const hasObjective = useCallback(
    (id: string) => (state.objectives ?? []).some((o) => o.id === id),
    [state.objectives],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      user,
      goals,
      onboarded: state.onboarded,
      completeOnboarding,
      resetAll,
      isSessionComplete,
      toggleSession,
      hydrationMl: state.hydrationMl ?? SEEDED_HYDRATION_ML,
      addHydration,
      bodyMassKg: state.bodyMassKg ?? DEFAULT_BODY_MASS_KG,
      bodyMassKgSet: typeof state.bodyMassKg === "number" ? state.bodyMassKg : null,
      setBodyMassKg,
      autoPause: state.autoPause ?? true,
      setAutoPause,
      hasKudos,
      toggleKudos,
      addGoal,
      removeGoal,
      canRemoveGoal,
      objectives,
      addObjective,
      removeObjective,
      toggleSummited,
      hasObjective,
      threads,
      startEnquiry,
      replyToThread,
      removeThread,
      account,
      createAccount,
      signOut,
      subscription,
      trialDaysLeft,
      startTrial,
      currentTier,
      can,
      coachUsage,
      coachInteractionsLeft,
      recordCoachInteraction,
      checkIns,
      todaysCheckIn,
      saveCheckIn,
      coachProfile,
      updateCoachProfile,
      coachBudget,
      recordCoachSpend,
      notifications,
      setNotification,
      networkOptIn,
      setNetworkOptIn,
      locationOptIn,
      setLocationOptIn,
      myProfile,
      updateMyProfile,
      expeditions,
      createExpedition,
      leaveExpedition,
      connectionRequests,
      queueConnection,
      blockedIds,
      blockAthlete,
      unblockAthlete,
      groupSessions,
      addGroupSession,
      removeGroupSession,
      setSessionRsvp,
      groupMessages,
      postGroupMessage,
      removeGroupMessage,
      groupNotes,
      setGroupNote,
      groupChecklistShared,
      setGroupChecklistShared,
      groupStyle,
      setGroupStyle,
      checklistStatuses,
      setChecklistStatus,
      clearChecklistStatus,
      packItems,
      addPackItem,
      removePackItem,
      packTargetGrams,
      setPackTarget,
    }),
    [
      user,
      goals,
      state.onboarded,
      state.hydrationMl,
      state.bodyMassKg,
      state.autoPause,
      completeOnboarding,
      resetAll,
      isSessionComplete,
      toggleSession,
      addHydration,
      setBodyMassKg,
      setAutoPause,
      hasKudos,
      toggleKudos,
      addGoal,
      removeGoal,
      canRemoveGoal,
      objectives,
      addObjective,
      removeObjective,
      toggleSummited,
      hasObjective,
      threads,
      startEnquiry,
      replyToThread,
      removeThread,
      account,
      createAccount,
      signOut,
      subscription,
      trialDaysLeft,
      startTrial,
      currentTier,
      can,
      coachUsage,
      coachInteractionsLeft,
      recordCoachInteraction,
      checkIns,
      todaysCheckIn,
      saveCheckIn,
      coachProfile,
      updateCoachProfile,
      coachBudget,
      recordCoachSpend,
      notifications,
      setNotification,
      networkOptIn,
      setNetworkOptIn,
      locationOptIn,
      setLocationOptIn,
      myProfile,
      updateMyProfile,
      expeditions,
      createExpedition,
      leaveExpedition,
      connectionRequests,
      queueConnection,
      blockedIds,
      blockAthlete,
      unblockAthlete,
      groupSessions,
      addGroupSession,
      removeGroupSession,
      setSessionRsvp,
      groupMessages,
      postGroupMessage,
      removeGroupMessage,
      groupNotes,
      setGroupNote,
      groupChecklistShared,
      setGroupChecklistShared,
      groupStyle,
      setGroupStyle,
      checklistStatuses,
      setChecklistStatus,
      clearChecklistStatus,
      packItems,
      addPackItem,
      removePackItem,
      packTargetGrams,
      setPackTarget,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppStateProvider");
  return v;
}

/** The soonest active objective — drives NEXT GOAL and the coach's context. */
export function usePrimaryGoal() {
  const { goals } = useApp();
  return useMemo(
    () =>
      goals
        .filter((g) => g.status === "active")
        .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0],
    [goals],
  );
}
