import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  CircleHelp,
  Compass,
  EyeOff,
  Footprints,
  Loader2,
  MicVocal,
  MoreHorizontal,
  MountainSnow,
  Newspaper,
  Search,
  Snowflake,
  Users,
  Wind,
  X,
} from "lucide-react";
import { Button, Disclaimer } from "@/components/ui/primitives";
import { MountainThumb } from "@/components/domain/MountainImage";
import { PlatformMark, hasPlatformMark } from "@/components/ui/BrandMarks";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { monthsAhead } from "@/data/mock/clock";
import { sync } from "@/services/repository";
import { assessPeak } from "@/services/peakAssessment";
import { PEAK_ATTRIBUTION, searchPeaks, type Peak } from "@/services/peaks";
import { buildPlanForGoal } from "@/tracking/training";
import {
  useApp,
  type Gender,
  type HeardAboutChannel,
  type OnboardingAnswers,
  type SexAtBirth,
  type SexNarrowing,
} from "@/state/AppState";
import { syncOnboarding } from "@/auth/account";
import { saveSexAtBirth, saveSignupAnswers } from "@/settings/sync";
import type { Discipline, ExperienceLevel, Goal } from "@/types";
import type { Equipment } from "@/coach/exercises";
import { SESSION_INTENTS, type IntentId } from "@/coach/sessionIntent";
import { useSettings } from "@/settings/store";

/**
 * Screen 02 — personalisation.
 *
 * THE RULE THIS FILE IS BUILT ON: a question earns its screen only if the
 * answer changes what ICEFALL does. A questionnaire that collects preferences
 * and then ignores them is theatre, and the payoff screen at the end is the
 * proof — it states, per answer, what changed.
 *
 * Which means it also has to state what did NOT change. Two answers here are
 * currently stored on the profile and read by nothing:
 *
 *   · trainingDays      — buildPlanForGoal lays down a fixed seven-day week
 *                         (six sessions, one rest day) and does not consult it
 *   · typicalSessionMin — buildSession takes its length from the plan's day,
 *                         and SessionDetail passes equipment only
 *
 * They are asked because they belong on the profile and the athlete expects to
 * be asked, and the payoff says plainly that they do not yet move a session.
 * The moment either is wired up, delete the caveat — do not delete the answer.
 *
 * Everything else is genuinely consumed:
 *
 *   · availableEquipment  → SessionDetail → buildSession, which will not
 *                           prescribe a movement whose kit you don't have
 *   · technicalSkills     → mountainReadiness.technicalDimension, matched
 *                           against the competences the objective demands
 *   · maxAltitudeM        → mountainReadiness.bestAltitude, as a floor
 *   · disciplineExperience→ mountainReadiness.experienceDimension, surfaced
 *                           verbatim as context and deliberately not scored
 *   · the goal + timeline → addGoal, whose targetDate is what buildPlanForGoal
 *                           builds the whole plan backwards from
 *
 * The numbers on the payoff screen are not written by hand. It calls
 * buildPlanForGoal on the goal it just created and reads the week count and the
 * session count back out, so the screen cannot drift from the generator.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.38;

/* -------------------------------------------------------------------------- */
/* Answer vocabularies                                                         */
/* -------------------------------------------------------------------------- */

type Level = "beginner" | "intermediate" | "advanced" | "expert";

const LEVELS: { id: Level; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
  { id: "expert", label: "Expert" },
];

/**
 * Eight disciplines are offered; the app's `Discipline` union holds six.
 *
 * Mountain biking, alpine skiing and "other" have no member of that union, and
 * inventing one here would ripple through activity types and fixtures. They are
 * offered anyway — people do them — and they are not thrown away: every
 * selected discipline gets an experience row, and every row is written to
 * `disciplineExperience`, which is keyed by free-form string. Only the six the
 * union recognises reach `OnboardingAnswers.disciplines`.
 */
interface DisciplineOption {
  id: string;
  label: string;
  icon: typeof Footprints;
  /** Present when this maps onto the app's own `Discipline` union. */
  discipline?: Discipline;
}

const DISCIPLINES: DisciplineOption[] = [
  { id: "hiking", label: "Hiking", icon: Footprints, discipline: "hiking" },
  { id: "trail-running", label: "Trail running", icon: Wind, discipline: "trail-running" },
  {
    id: "mountaineering",
    label: "Mountaineering",
    icon: MountainSnow,
    discipline: "mountaineering",
  },
  { id: "climbing", label: "Climbing", icon: Anchor, discipline: "climbing" },
  { id: "ski-touring", label: "Ski touring", icon: Compass, discipline: "ski-touring" },
  { id: "mountain-biking", label: "Mountain biking", icon: Bike },
  { id: "alpine-skiing", label: "Alpine skiing", icon: Snowflake },
  { id: "other", label: "Something else", icon: MoreHorizontal },
];

/**
 * A display-level summary only.
 *
 * `User.experience` is a single value and this flow asks per discipline, so the
 * strongest level is taken. Note what this is NOT used for: sessions.ts refuses
 * to map mountain experience onto movement difficulty, and nothing here changes
 * that — an athlete who has climbed for twenty years still gets a conservative
 * first barbell session, which is the correct outcome.
 */
const LEVEL_TO_EXPERIENCE: Record<Level, ExperienceLevel> = {
  beginner: "new",
  intermediate: "developing",
  advanced: "experienced",
  expert: "advanced",
};

const SUGGESTED_MOUNTAIN_IDS = ["mont-blanc", "matterhorn", "everest", "mount-olympus"];

/** Curated objectives as peaks, so one picker handles suggestions and search alike. */
const SUGGESTIONS: Peak[] = SUGGESTED_MOUNTAIN_IDS.flatMap((id) => {
  const m = sync.mountainById(id);
  // A curated id that no longer resolves disappears rather than rendering an
  // empty tile — a blank suggestion is worse than one fewer suggestion.
  if (!m) return [];
  return [
    {
      id: `curated:${m.id}`,
      name: m.name,
      elevationM: m.elevationM,
      lat: m.coords.lat,
      lon: m.coords.lon,
      curatedId: m.id,
      country: m.country,
    },
  ];
});

const TIMELINES: { id: string; label: string; months: number; assumed?: boolean }[] = [
  { id: "6m", label: "Within 6 months", months: 6 },
  { id: "1y", label: "Within a year", months: 12 },
  { id: "2y", label: "Within two years", months: 24 },
  // A plan has to be built backwards from a date, so "not sure" still needs
  // one. Twelve months is used and the payoff screen says it was assumed.
  { id: "unsure", label: "Not sure yet", months: 12, assumed: true },
];

/** JS day indices, Monday first. `CoachProfile.trainingDays` is 0 = Sunday. */
const WEEK: { day: number; label: string; full: string }[] = [
  { day: 1, label: "Mon", full: "Monday" },
  { day: 2, label: "Tue", full: "Tuesday" },
  { day: 3, label: "Wed", full: "Wednesday" },
  { day: 4, label: "Thu", full: "Thursday" },
  { day: 5, label: "Fri", full: "Friday" },
  { day: 6, label: "Sat", full: "Saturday" },
  { day: 0, label: "Sun", full: "Sunday" },
];

/**
 * `Date` → bare `YYYY-MM-DD`, LOCAL. Never `toISOString().slice(0,10)`, which is
 * the UTC day and therefore tomorrow for anyone east of Greenwich in the
 * evening — the mirror of the bug fixed in `f2cb54c` at the render end.
 */
function isoDayKey(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bare `YYYY-MM-DD` → local `Date`, or null. Strict: rejects 2027-02-31. */
function parseIsoDayLocal(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

const SESSION_LENGTHS = [30, 45, 60, 90, 120];

/** Labels for the real `Equipment` union — see src/coach/exercises.ts. */
/**
 * What ICEFALL must train AROUND — owner addition, 2026-09-01.
 *
 * THE BOUNDARY, AND WHY IT IS THE WHOLE POINT OF THIS QUESTION.
 *
 * The coach's system prompt already says "You are NOT a doctor. Defer anything
 * medical." That instruction stays, and this answer does not soften it. What
 * this list does is CONSTRAIN WHAT MAY BE PRESCRIBED — it must never invite
 * diagnosis, interpretation or reassurance.
 *
 * So: the coach may avoid loading a declared knee. It may not say what is wrong
 * with the knee, may not suggest it is healing, and may not adjust "because of"
 * a condition in a way that reads as a medical judgement. The answer travels as
 * a hard constraint list, never as clinical context — §6am's closed world in a
 * new place: the coach chooses from what it may prescribe rather than reasoning
 * about a body it has never examined.
 *
 * These are broad categories on purpose. A finer list would invite people to
 * describe a diagnosis, which is exactly the thing this must not collect.
 */
const LIMITATIONS: { id: string; label: string }[] = [
  { id: "knee", label: "Knee" },
  { id: "back", label: "Back" },
  { id: "shoulder", label: "Shoulder" },
  { id: "ankle-foot", label: "Ankle or foot" },
  { id: "breathing", label: "Asthma or breathing" },
  { id: "heart", label: "Heart" },
  { id: "recent-surgery", label: "Recent surgery" },
  { id: "other", label: "Something else" },
];

/** Where the athlete is starting FROM, not where they are going. */
const BASELINES: { id: string; label: string; note: string }[] = [
  { id: "none", label: "Not training right now", note: "The plan starts from here, and builds." },
  { id: "occasional", label: "Occasionally", note: "Less than once a week." },
  { id: "1-2", label: "1–2 days a week", note: "" },
  { id: "3-4", label: "3–4 days a week", note: "" },
  { id: "5-plus", label: "5+ days a week", note: "" },
];

/**
 * Altitude illness history. Constrains ascent-rate guidance; diagnoses nothing.
 *
 * "Never been high enough to know" is a real and common answer, and collapsing
 * it into "never" would turn an absence of exposure into a clean record.
 */
const ALTITUDE_ILLNESS: { id: string; label: string; note: string }[] = [
  { id: "never", label: "Never", note: "Been to altitude and had no trouble." },
  { id: "mild", label: "Mild", note: "Headache, poor sleep, loss of appetite." },
  { id: "serious", label: "Serious", note: "HAPE or HACE, or a descent for symptoms." },
  { id: "unknown", label: "Never been high enough to know", note: "Not the same as never." },
];

const EQUIPMENT: { id: Equipment; label: string; note?: string }[] = [
  { id: "none", label: "Bodyweight only", note: "No kit at all" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "barbell", label: "Barbell" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "pull-up-bar", label: "Pull-up bar" },
  { id: "bench", label: "Bench" },
  { id: "step", label: "Step or box" },
  { id: "resistance-band", label: "Resistance band" },
  { id: "treadmill", label: "Treadmill" },
  { id: "stairs", label: "Stairs" },
  { id: "pack", label: "Weighted pack" },
  { id: "hangboard", label: "Hangboard" },
];

/**
 * The technical competences ICEFALL can actually check an objective against.
 *
 * Every string here is one of the skills `peakAssessment` lists for a band, so
 * `mountainReadiness.skillClaimed` matches it and the requirement is marked as
 * reported. That constraint is the whole point: offering "lead rock" — which no
 * band asks for — would look thorough and do nothing but drag the technical
 * score down, because any claim at all switches that dimension from "withheld"
 * to scored. A tile that cannot be credited is not offered.
 */
const SKILL_GROUPS: { title: string; skills: string[] }[] = [
  {
    title: "Hill and scrambling ground",
    skills: [
      "Navigation in poor visibility",
      "Grade I–II scrambling",
      "Comfort with exposure",
      "Rockfall awareness",
    ],
  },
  {
    title: "Snow, ice and glacier",
    skills: [
      "Crampon and ice-axe technique",
      "Self-arrest on steep snow",
      "Roped glacier travel",
      "Crevasse rescue",
      "Efficient rope work on mixed ground",
      "Reading snow and serac hazard",
    ],
  },
  {
    title: "Altitude and expedition",
    skills: [
      "Staged acclimatisation",
      "Recognising acute mountain sickness",
      "Cold-injury prevention",
      "Fixed-line ascent and descent",
      "Supplementary oxygen systems",
    ],
  },
];

/**
 * Bands, stored as the lower bound.
 *
 * The bottom band stores 0, which `bestAltitude` ignores because it requires a
 * value above zero. That is correct: "I have never been above 1,000 m" is an
 * answer, but it is not an altitude floor worth reasoning from.
 */
const ALTITUDE_BANDS: { id: string; label: string; lowerM: number }[] = [
  { id: "b0", label: "Under 1,000 m", lowerM: 0 },
  { id: "b1", label: "1,000 – 3,000 m", lowerM: 1000 },
  { id: "b2", label: "3,000 – 4,500 m", lowerM: 3000 },
  { id: "b3", label: "4,500 – 6,000 m", lowerM: 4500 },
  { id: "b4", label: "Above 6,000 m", lowerM: 6000 },
];

/**
 * Gender.
 *
 * ALPHABETICAL FOR THE FIRST THREE, then the decline. No ordering of these is
 * neutral, and alphabetical is the only one that is not somebody's decision
 * about who gets named first.
 *
 * "Prefer not to say" is the fourth OPTION, at the same visual weight as the
 * other three — not a skip link, not a small grey "skip" under the list, and
 * not a Continue button that advances on nothing. Choosing it is an answer, it
 * is stored as `"prefer-not-to-say"`, and it satisfies the gate. A step nobody
 * touched is unanswered; a step answered "prefer not to say" is answered, and
 * those two must never look the same (§6ag).
 *
 * That is a DIFFERENT MECHANISM from the one Height and Year of birth use two
 * fields above, and the difference is not an inconsistency. Those are numeric,
 * so their decline has nowhere to live inside the value and rides on a separate
 * boolean; `athlete_profiles.gender` is a text column whose CHECK names this
 * string, so the answer lives in the answer. One representation cannot be
 * misread by somebody who never saw the flag.
 *
 * The ids are the four the migration's CHECK accepts. They are a vocabulary
 * written down twice — here and in `20260903040000` — and if the two ever
 * disagree the write comes back `23514` with the vaguest sentence this app
 * owns. Change both or neither.
 */
const GENDERS: { id: Gender; label: string }[] = [
  { id: "man", label: "Man" },
  { id: "non-binary", label: "Non-binary" },
  { id: "woman", label: "Woman" },
  { id: "prefer-not-to-say", label: "Prefer not to say" },
];

/**
 * Sex assigned at birth.
 *
 * ── WHY THIS IS A SECOND QUESTION AND NOT A WIDER `GENDERS` ────────────────
 *
 * The owner was offered gender alone, was told what asking both would buy, and
 * chose both. So two questions, two adjacent steps, two columns, and the second
 * step opens by saying it is not a re-ask of the first.
 *
 * GENDER IS IDENTITY. SEX IS A TERM IN AN EQUATION. Mifflin-St Jeor's sex term
 * is a constant — +5 kcal for male, -161 for female — so a woman may need the
 * male figure out of it and a man the female one. One list serving both
 * questions hands somebody the wrong number and hands it to them SILENTLY, with
 * no screen saying which term was used. That is the exact failure this app is
 * built to refuse, so `GENDERS` was not widened and `Gender` was not reused.
 *
 * ── THE ORDER, WHICH IS NOT ALPHABETICAL AND IS NOT A PREFERENCE ───────────
 *
 * `GENDERS` is alphabetical because no ordering of an identity list is neutral.
 * This list is not an identity list: it is the two terms of a published
 * equation, and they are in the order that equation is always written in
 * (female first, the -161 term). The decline is third and last, at the same
 * visual weight, because it is an ANSWER — it satisfies the gate, it is stored
 * as `"prefer-not-to-say"`, and a step answered that way must never look like a
 * step nobody touched (§6ag).
 *
 * ── THE NOTES SAY WHAT THE ANSWER DOES, INCLUDING THE DECLINE ──────────────
 *
 * Each row names the consequence of picking it, and the decline's note is the
 * most important of the three: it says the estimate spans both terms and says
 * so on screen. That is true — `fuelDay.ts` evaluates the equation at both
 * values when it holds no sex and prints "It spans both values of the
 * equation's sex term, because ICEFALL doesn't hold one." So declining is not
 * punished with a silently worse number; it is answered with a wider band that
 * explains itself. Somebody deciding whether to answer deserves to know that
 * before they decide, not after.
 *
 * NOTHING HERE MAY MENTION WEIGHT, BODY FAT, LEANNESS OR A TARGET.
 * `coach/nutrition.ts` is explicit that ICEFALL sets no weight target and no
 * body-composition target, and that one sentence is the reason the fuel screen
 * is not another calorie app. One term of a resting-energy equation is the
 * entire claim this question is allowed to make.
 *
 * ── THE NOTES SAY "USES", AND THAT WORD HAD TO BE EARNED ───────────────────
 *
 * It was not, for one release. The answer was written to the database and to
 * the answers blob and read by nothing, while these three notes and two other
 * screens described a narrowing that never happened. It is wired now:
 * `AppState.completeOnboarding` passes it to `rememberSexForEnergyFromSignup`,
 * which puts it in the `icefall.fuel.v1` record that `screens/Nutrition.tsx`
 * feeds to `dailyEnergyFor`. If that call ever goes, these notes go with it.
 *
 * ── AND WHY NO NOTE HERE QUOTES 166 KCAL ANY MORE ──────────────────────────
 *
 * Because it was the wrong number for the thing it was attached to. 166 kcal is
 * the gap between Mifflin-St Jeor's two sex intercepts, +5 and -161, in the
 * RESTING term only. The daily estimate widens the resting band by ±10% for
 * individual variation and then multiplies it by an activity range, so the
 * width an answer removes is a different figure again.
 *
 * The replacement said "50 to 600 kcal" and was wrong in its turn, so here is
 * the measurement instead of a range — `narrowingWorth` in `coach/fuelDay.ts`,
 * run 2026-09-03 over every combination the app accepts, stepping 1 kg / 1 cm /
 * 1 year. For somebody who ALSO gives a height and a birth year — which the very
 * next step asks for — it is 200 kcal, or 250 ONLY where everyday movement is
 * answered `physical`; `seated` and `on-feet` leave it at 200, exactly as not
 * answering does. Those two figures hold across the whole accepted body
 * (30-250 kg, 100-250 cm, ages 10-100) without exception. Decline the height
 * and it opens right up: 50 to 600 kcal for an adult of 45-120 kg aged 18-100
 * (600 needs `physical`; movement is unanswered throughout signup, so 50 to 500
 * is the common case), and 50 to 1,450 kcal across the entire accepted domain.
 *
 * So there is no one figure to print on this step, and there was never a single
 * honest range either. Nothing here prints one. The Fuel screen computes the
 * athlete's own and shows it, which is the honest place for a number that is
 * different for everybody.
 *
 * The ids are the three the migration's CHECK accepts, and the first two are
 * byte-identical to the two members of `Sex` in `coach/fuelDay.ts`. That is the
 * design, not a coincidence: `sexTermFor` narrows without a lookup table, so
 * there is nowhere for a translation to drift.
 *
 * ── WHY EVERY NOTE CARRIES A CONDITION, WHICH READS FUSSY AND IS NOT ───────
 *
 * These notes said "Uses the female term of the resting-energy equation", flat,
 * present tense. Two reachable states make that false, and neither is exotic:
 *
 *   1. THE PHONE ALREADY HOLDS AN ANSWER. `rememberSexForEnergy` refuses to
 *      overwrite one, deliberately — an answer given on the Fuel screen, beside
 *      the number it changes, is the more considered of the two. It is also what
 *      happens to the SECOND PERSON on a shared phone, because signing out keeps
 *      everything on the device on purpose. Their tap here changes nothing, and
 *      a flat "uses the female term" would be telling a woman her estimate had
 *      moved to her own answer while it sat at the previous owner's.
 *   2. STORAGE REFUSES THE WRITE. Private mode, or a full quota. The answer is
 *      simply lost, and the estimate stays as wide as it was.
 *
 * This screen cannot tell which state it is in — `coach/fuelRecord.ts` exposes a
 * setter and no getter, on purpose, so that nothing outside the Fuel screen can
 * read somebody's answers or race the write. So the notes describe the request
 * honestly, condition and all, and the payoff panel — which DOES know, because
 * `completeOnboarding` returns it — says what actually happened.
 */
const SEXES: { id: SexAtBirth; label: string; note: string }[] = [
  {
    id: "female",
    label: "Female",
    note: "The female term of the resting-energy equation — if this phone holds no answer yet and can store this one.",
  },
  {
    id: "male",
    label: "Male",
    note: "The male term of the resting-energy equation — if this phone holds no answer yet and can store this one.",
  },
  {
    id: "prefer-not-to-say",
    label: "Prefer not to say",
    note: "A recorded answer, not a blank — again, if this phone holds no answer yet and can store this one. If so, your daily estimate stays a wider band covering both terms and says on screen that ICEFALL doesn't hold one. If the phone does already hold an answer, your estimate keeps following that one, and the Fuel screen shows which it is.",
  },
];

/**
 * What the payoff panel says happened to the sex answer, one sentence per state.
 *
 * A `Record<SexNarrowing, string>` rather than a chain of ternaries, so that a
 * sixth state added to `SexNarrowing` is a COMPILE ERROR here rather than a
 * silent fall-through to whichever branch happened to be last. The last time
 * this line was wrong it was wrong by omission — three outcomes existed and one
 * sentence covered all of them — and the type is what stops that recurring.
 *
 * Each sentence has to be true on its own, with no help from the others:
 *
 *   narrowed          the write landed; the estimate moved to their answer.
 *   decline-recorded  the decline landed; the estimate stays wide ON PURPOSE and
 *                     the fuel screen will not ask again.
 *   already-answered  the phone held an answer, so their tap changed NOTHING. It
 *                     does not say WHICH answer is held, because nothing here can
 *                     read it — `coach/fuelRecord.ts` exposes a setter and no
 *                     getter — so it names the screen that can show them.
 *   not-kept          storage refused. The answer is gone, not queued, not
 *                     retried later. Saying anything softer would be an outbox
 *                     this app does not have.
 *   not-asked         nothing was written and nothing may be claimed.
 *
 * Every one of them ends at the fuel screen, which is where an answer already on
 * the phone is changed and where a lost one can be given again.
 */
const SEX_PAYOFF: Record<SexNarrowing, string> = {
  narrowed:
    "Used as the sex term of the resting-energy equation, so your daily energy estimate is computed at your answer instead of spanning both. That is the only thing it is used for, and the Fuel screen is where you change it.",
  "decline-recorded":
    "Kept as an answer rather than a blank, so nothing asks you again. Your daily energy estimate spans both values of the equation's sex term, and the Fuel screen says so rather than picking one.",
  "already-answered":
    "This phone already held an answer to this — from the Fuel screen, or from whoever used it before you — and ICEFALL does not overwrite one, so what you chose here changed nothing. Your estimate follows the answer already stored. The fuel screen shows which answer that is, and is the only place it can be changed.",
  "not-kept":
    "This phone refused to store it, so the answer reached nothing and is not saved anywhere on here. Your daily energy estimate still spans both values of the equation's sex term. Giving it again on the Fuel screen is the only way it is kept.",
  "not-asked":
    "Nothing was stored from this answer. If this phone holds no earlier answer, your daily energy estimate spans both values of its sex term and the Fuel screen says so rather than picking one; if it does hold one, the estimate follows that, and the Fuel screen shows which.",
};

/**
 * Where people found ICEFALL.
 *
 * ── THE RULE THAT DECIDED WHAT IS ON THIS LIST ──────────────────────────────
 *
 * AN OPTION IS DISHONEST TO OFFER WHEN ICEFALL HAS NO PRESENCE ON THAT CHANNEL,
 * because then it is not measuring where somebody came from — it is inviting
 * them to guess, and every guess reads afterwards as a channel that worked.
 *
 * So these are deliberately absent, and each has a reason rather than an
 * oversight:
 *
 *   · The App Store    — this is a web build. There is no listing, so nobody
 *                        can have found ICEFALL there, and the answers would be
 *                        pure noise from people picking the nearest familiar
 *                        thing. Add it the day there is a listing.
 *   · Facebook, X,
 *     Threads          — `PlatformMark` holds accurate marks for all three, and
 *                        a mark is not a reason. Offer one only once ICEFALL
 *                        actually posts there; until then every such answer is
 *                        somebody's friend's post, which "A friend" already
 *                        covers, and the bar would read as a marketing success
 *                        ICEFALL never had.
 *   · Strava           — REMOVED ENTIRELY on 2026-09-03 at the owner's
 *                        instruction, mark and all, not merely left unoffered.
 *                        It was also the odd row out in Settings › Devices &
 *                        apps, where every other entry is a watch or a health
 *                        store — a place data is measured or kept. Strava is
 *                        another training app and a social network, so listing
 *                        it invited "ICEFALL will import my Strava history"
 *                        from a page that only ever meant "your watch could
 *                        feed this". If an import is ever built, it belongs
 *                        where accounts are connected, not on either list.
 *   · An ICEFALL ad    — there is no ad account and nothing is running.
 *   · A referral link  — there is no referral system, no link and no code. The
 *                        moment one exists this becomes the most valuable
 *                        option on the list, because it is the only one that
 *                        could ever be CHECKED rather than self-reported.
 *
 * ── WHY THE FIRST TWO ARE SPLIT ─────────────────────────────────────────────
 *
 * "A friend" is named first because it is the likeliest true answer for a niche
 * training app, and a list that buries it under six social platforms teaches
 * people which answer is wanted. "A guide, a club, or an expedition company" is
 * kept separate from it rather than folded into word of mouth: ICEFALL has an
 * operator side, so an athlete arriving through a company is a completely
 * different event commercially from one arriving through a mate, and collapsing
 * them destroys the only distinction that would change what ICEFALL does next.
 *
 * ── THE LAST THREE NAME NO PLACE, AND ARE STILL ANSWERS ─────────────────────
 *
 * "Somewhere else" is required: without it everyone whose real route is missing
 * picks the nearest wrong option, which is worse than an unclassified answer.
 * "I don't remember" is required because it is very often the true answer, in
 * the same way "Never been high enough to know" is a true answer on the
 * altitude step. And "I'd rather not say" is here because this is the one
 * question in the flow that is for ICEFALL rather than for the athlete, so it
 * is the one they must be able to decline at no cost to themselves.
 *
 * ── ICONS ───────────────────────────────────────────────────────────────────
 *
 * `mark` is a real, officially-sourced brand glyph and appears only where
 * `PlatformMark` actually holds one. Everything else carries an ordinary lucide
 * pictogram, which is UI furniture and not a claim about anybody's logo — the
 * newspaper beside "A blog, forum, or news article" names no publication. Every
 * row has one or the other, so the column has no empty notch in it; that was
 * the alternative and it looks like a bug rather than a decision.
 *
 * The `id`s are the slugs `heard_about_channels` is seeded with, and the column
 * carries a real foreign key to that table, so an id that is not a row there is
 * refused outright with `23503`.
 */
interface HeardAboutOption {
  id: HeardAboutChannel;
  label: string;
  /** A neutral lucide pictogram, used where there is no brand mark to use. */
  icon?: typeof Users;
}

const HEARD_ABOUT: HeardAboutOption[] = [
  { id: "friend", label: "A friend, or someone I climb with", icon: Users },
  { id: "guide-or-operator", label: "A guide, a club, or an expedition company", icon: MountainSnow },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "reddit", label: "Reddit" },
  { id: "podcast", label: "A podcast", icon: MicVocal },
  // "A search engine", never "Google". Somebody who found ICEFALL by searching
  // may have used Bing, DuckDuckGo or whatever Safari is set to, and putting
  // Google's name or its G on this row would invent which one.
  { id: "search", label: "A search engine", icon: Search },
  { id: "article", label: "A blog, forum, or news article", icon: Newspaper },
  { id: "somewhere-else", label: "Somewhere else", icon: MoreHorizontal },
  { id: "dont-remember", label: "I don't remember", icon: CircleHelp },
  { id: "prefer-not-to-say", label: "I'd rather not say", icon: EyeOff },
];

/* -------------------------------------------------------------------------- */
/* Shared chrome — the visual language of the auth screens                     */
/* -------------------------------------------------------------------------- */

function StepHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string | string[];
  subtitle?: string;
}) {
  const lines = Array.isArray(title) ? title : [title];
  return (
    <header>
      <p className="section-label text-azure/85">{eyebrow}</p>
      <h1 className="display mt-3 text-[30px] leading-[1.08] text-snow">
        {lines.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </h1>
      {subtitle && <p className="mt-3 text-[13px] leading-relaxed text-mist">{subtitle}</p>}
    </header>
  );
}

/** The azure check badge that marks a chosen tile. */
function Ticked() {
  return (
    <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-azure text-obsidian">
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

function Tile({
  selected,
  onClick,
  className,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        "relative rounded-tile border text-left transition-colors duration-200",
        selected
          ? "border-azure/60 bg-azure/[0.07]"
          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
        className,
      )}
    >
      {children}
      {selected && <Ticked />}
    </button>
  );
}

/** A one-line row of mutually exclusive choices. */
function ChoiceRow({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-tile border px-4 py-3 text-left transition-colors duration-200",
        selected
          ? "border-azure/60 bg-azure/[0.07]"
          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
      )}
    >
      {/* Aligned to the first line, not the block: a row carrying a second line
          of detail would otherwise float its marker into the gap between them. */}
      <span
        className={cn(
          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
          selected ? "bg-azure" : "bg-white/20",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-snow">{label}</span>
        {detail && <span className="mt-0.5 block text-[11px] text-mist-dim">{detail}</span>}
      </span>
    </button>
  );
}

/** What a blank answer means, said rather than enforced. */
function EmptyMeaning({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 border-l border-hairline pl-3 text-[11px] leading-relaxed text-mist-dim">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Peak search                                                                 */
/* -------------------------------------------------------------------------- */

function PeakSearch({ onPick }: { onPick: (p: Peak) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Peak[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    // Debounced: the geocoder behind searchPeaks allows roughly one request a
    // second, and typing "matterhorn" would otherwise fire ten.
    const t = setTimeout(() => {
      searchPeaks(q, ctrl.signal)
        .then((r) => {
          setResults(r.slice(0, 8));
          setSearched(true);
        })
        .finally(() => setSearching(false));
    }, 550);
    return () => {
      clearTimeout(t);
      ctrl.abort();
      setSearching(false);
    };
  }, [query]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search for a mountain</span>
        <Search
          size={16}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any peak on earth"
          spellCheck={false}
          className="h-12 w-full rounded-tile border border-hairline bg-elevated/40 pl-10 pr-10 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
        />
        {searching && (
          <Loader2
            size={16}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
          />
        )}
        {!searching && query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-mist-dim transition-colors hover:text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </label>

      {results.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 rounded-tile border border-hairline bg-elevated/40 p-2.5 text-left transition-colors hover:border-azure/50"
              >
                <MountainThumb peak={p} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-snow">{p.name}</span>
                  <span className="tnum block text-[11px] text-mist-dim">
                    {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !searching && results.length === 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          Nothing found. Search runs against OpenStreetMap and needs a connection; peaks without a
          recorded elevation are left out, because elevation is what every assessment is derived
          from.
        </p>
      )}

      <p className="mt-3 text-[10px] text-mist-dim">{PEAK_ATTRIBUTION}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The flow                                                                    */
/* -------------------------------------------------------------------------- */

type StepKey =
  | "intro"
  | "disciplines"
  | "experience"
  | "goal"
  | "timeline"
  | "days"
  | "length"
  | "equipment"
  | "skills"
  | "altitude"
  | "altitudeIllness"
  | "baseline"
  | "limitations"
  | "gender"
  | "sexAtBirth"
  | "body"
  | "heardAbout"
  | "name"
  | "building"
  | "payoff";

/**
 * Every question the flow can ask.
 *
 * The live total shrinks when a step doesn't apply, so the intro quotes this
 * ceiling rather than the current count — promising "eight questions" and then
 * asking ten because they picked an objective is exactly the small dishonesty
 * this screen exists to avoid.
 */
const ALL_QUESTION_STEPS: StepKey[] = [
  "disciplines",
  "experience",
  "goal",
  "timeline",
  "days",
  "length",
  "equipment",
  "skills",
  "altitude",
  "altitudeIllness",
  "baseline",
  "limitations",
  "gender",
  "sexAtBirth",
  "body",
  "heardAbout",
  "name",
];

/** What was actually written, so the payoff reports facts rather than intent. */
interface CreatedGoal {
  peak: Peak;
  targetDate: string;
  trainingStartedAt: string;
  /** True when the athlete said "not sure" and the date was chosen for them. */
  dateAssumed: boolean;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { account, completeOnboarding, updateCoachProfile, addGoal, setBodyMassKg } = useApp();
  const { patch: patchSettings } = useSettings();

  const [index, setIndex] = useState(0);

  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [goalPeak, setGoalPeak] = useState<Peak | null>(null);
  const [noGoal, setNoGoal] = useState(false);

  /*
   * The explicit "none" answers — owner ruling 2026-09-01: every question must
   * be ANSWERED, and required-to-answer is not required-to-have-a-value. Each
   * of these is a real selectable option stored as the answer given, so a
   * beginner is never forced to invent a discipline, a training day or a
   * qualification to get past a gate. They are mutually exclusive with real
   * selections: picking one clears the other side.
   */
  const [noneDisciplines, setNoneDisciplines] = useState(false);
  const [noFixedDays, setNoFixedDays] = useState(false);
  const [noSkills, setNoSkills] = useState(false);
  /** "Prefer not to say", per measurement — an answer, not an omission. */
  const [heightPrivate, setHeightPrivate] = useState(false);
  const [birthYearPrivate, setBirthYearPrivate] = useState(false);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  /**
   * A named target date, when the athlete has one — owner addition 2026-09-01.
   *
   * Bare `YYYY-MM-DD` while it lives on this screen, because that is what a
   * calendar day IS and what `DateField` speaks. It becomes a local-time
   * instant at the write, matching `monthsAhead` — see `targetDateIso`.
   */
  const [customDate, setCustomDate] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [sessionMin, setSessionMin] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [altitudeId, setAltitudeId] = useState<string | null>(null);
  const [name, setName] = useState(account?.name ?? "");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [birthYear, setBirthYear] = useState("");
  /*
   * The three questions added 2026-09-01.
   *
   * `limitations` constrains what may be PRESCRIBED and nothing else — see the
   * note on `LIMITATIONS`. `noLimitations` is its explicit "nothing right now",
   * because an empty list cannot say whether the question was put.
   */
  const [altitudeIllness, setAltitudeIllness] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [limitationsNote, setLimitationsNote] = useState("");
  const [noLimitations, setNoLimitations] = useState(false);
  /*
   * The three questions added 2026-09-03. All three are `null` until answered,
   * never a default, because every one of them has a "prefer not to say" that
   * IS an answer — so `null` can mean exactly one thing here: nobody has
   * touched this step yet. That is what the gate below reads.
   *
   * `gender` and `sexAtBirth` are two separate pieces of state on purpose and
   * must never be merged. See `SEXES` above: gender is identity, sex is one
   * constant in a resting-energy equation, and collapsing them hands somebody
   * the wrong figure with nothing on screen saying so.
   */
  const [gender, setGender] = useState<Gender | null>(null);
  const [sexAtBirth, setSexAtBirth] = useState<SexAtBirth | null>(null);
  /**
   * WHAT THE TAP ON THE SEX STEP ACTUALLY DID, as opposed to what it asked for.
   *
   * The pick above is the athlete's REQUEST. This is the RESULT, and they are
   * not the same thing on a phone that already holds an answer — from the Fuel
   * screen, or from whoever used the phone before this person, since signing out
   * deliberately keeps everything. `rememberSexForEnergy` refuses to overwrite
   * an existing answer, and the payoff panel used to describe a narrowing
   * regardless. It reads this instead.
   *
   * Starts at "not-asked" because until `finish` runs nothing has been written,
   * and the panel is only ever drawn after it.
   */
  const [sexNarrowing, setSexNarrowing] = useState<SexNarrowing>("not-asked");
  const [heardAbout, setHeardAbout] = useState<HeardAboutChannel | null>(null);
  const [created, setCreated] = useState<CreatedGoal | null>(null);

  /**
   * Steps that have something to ask. Two drop out: the experience step when no
   * discipline was chosen, and the timeline when there is no objective to date.
   * A screen that asks nothing still costs a tap and still counts against "N of
   * N", which makes the flow feel longer than it is.
   */
  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = ["intro", "disciplines"];
    if (disciplines.length > 0) s.push("experience");
    s.push("goal");
    if (goalPeak) s.push("timeline");
    // "body" and "intent" sit BEFORE "name" deliberately: `finish()` runs on
    // leaving the name step, so anything asked after it would be written after
    // the answers were already saved.
    /*
     * "gender" and "sexAtBirth" sit immediately BEFORE "body", in that order,
     * and the placement is the argument.
     *
     * Adjacent, because the second screen's first sentence is "this is not the
     * question you just answered". A reader meets them together and sees the
     * split was deliberate; separated by four screens, the second reads as the
     * flow having forgotten it already asked.
     *
     * Before "body", because "body" is weight, height and year of birth — the
     * other three inputs to the same resting-energy estimate. Sex is a term in
     * that equation, so it belongs against those numbers and not, say, next to
     * the altitude questions. It is NOT folded INTO the body step: that step's
     * head is "A few numbers about you", sex is not a number, and a step's
     * promise about what it is asking for has to stay true.
     *
     * "heardAbout" sits after "body" and before "name", which is the only
     * constraint that is not aesthetic: `finish()` runs on LEAVING "name", so
     * every question that must be saved has to be asked before it. A question
     * placed after "name" is answered, collected into state, and silently
     * discarded.
     */
    s.push(
      "days",
      "length",
      "equipment",
      "skills",
      "altitude",
      "altitudeIllness",
      "baseline",
      "limitations",
      "gender",
      "sexAtBirth",
      "body",
      "heardAbout",
      "name",
      "building",
      "payoff",
    );
    return s;
  }, [disciplines.length, goalPeak]);

  const step = steps[Math.min(index, steps.length - 1)];

  // The intro and the payoff are not questions, so they are outside the count.
  const questions: StepKey[] = steps.filter(
    (s) => s !== "intro" && s !== "building" && s !== "payoff",
  );
  const questionNumber = questions.indexOf(step) + 1;

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  /* ---- Persistence ------------------------------------------------------- */

  // completeOnboarding and addGoal both append, so running finish twice would
  // create two goals. It is called once, on leaving the name step.
  const saved = useRef(false);

  const finish = useCallback(() => {
    if (saved.current) return;
    saved.current = true;

    updateCoachProfile({
      limitations: noLimitations ? [] : limitations,
      limitationsNote: noLimitations ? "" : limitationsNote.trim(),
      altitudeIllness,
      trainingBaseline: baseline,
      disciplineExperience: levels,
      availableEquipment: equipment,
      trainingDays: days,
      // The stored default is 60; an unanswered step must not silently claim a
      // different one, so the same 60 is written back.
      typicalSessionMin: sessionMin ?? 60,
      technicalSkills: skills,
      maxAltitudeM: ALTITUDE_BANDS.find((b) => b.id === altitudeId)?.lowerM,
    });

    /**
     * The athlete's objective is always created, even when a goal of the same
     * name already exists.
     *
     * The four suggestions are also four of the demo fixtures in
     * data/mock/goals.ts, so picking one leaves two "Mont Blanc" rows on the
     * Goals screen. That is ugly and worth fixing — but the alternative is
     * worse. Adopting the fixture would silently discard the timeline answer and
     * hand a brand-new athlete a goal that claims they began training eleven
     * weeks ago and are 41% prepared for a summit they mentioned a minute ago.
     * Inventing a measurement is a far more serious fault than a duplicate row.
     *
     * The real fix is upstream — the fixtures should not ship as the athlete's
     * own goals, or AppState needs a way to retarget an existing one. Neither
     * belongs in this file.
     */
    if (goalPeak) {
      const timeline = TIMELINES.find((t) => t.id === timelineId) ?? TIMELINES[1];
      const curated = goalPeak.curatedId ? sync.mountainById(goalPeak.curatedId) : undefined;

      /*
       * A named date wins over the preset it replaced.
       *
       * STORED AS A LOCAL-TIME INSTANT, not a bare calendar day — deliberately,
       * and this is a considered deviation from "store the bare date". Existing
       * goals hold full ISO instants written by `monthsAhead`, and
       * `buildPlanForGoal` parses `goal.targetDate` with `new Date(...)`. A bare
       * day in that same field would be read as UTC midnight and land a day
       * early west of Greenwich — reintroducing at the WRITE end precisely the
       * bug `f2cb54c` removed at the render end. Two shapes in one field is
       * also how the next reader gets it wrong.
       *
       * So the bare day is parsed with the LOCAL constructor and anchored at
       * 06:00 local, exactly as `monthsAhead` does. One shape, no UTC anywhere.
       */
      const picked = parseIsoDayLocal(customDate);
      const targetDate = picked
        ? (picked.setHours(6, 0, 0, 0), picked.toISOString())
        : monthsAhead(timeline.months);
      const trainingStartedAt = new Date().toISOString();

      addGoal({
        name: goalPeak.name,
        subtitle:
          curated?.difficultyLabel ??
          assessPeak(goalPeak.elevationM, goalPeak.lat, goalPeak.lon).label,
        elevationM: goalPeak.elevationM,
        mountainId: goalPeak.curatedId,
        wikipedia: goalPeak.wikipedia,
        lat: goalPeak.lat,
        lon: goalPeak.lon,
        country: goalPeak.country,
        targetDate,
        trainingStartedAt,
        photo: curated?.photo,
        gaps: [
          "Training plan just created — complete sessions to build preparation",
          "Baseline fitness assessment outstanding",
        ],
      });

      setCreated({
        peak: goalPeak,
        targetDate,
        trainingStartedAt,
        // Nothing is assumed once they named the day. The payoff's caveat is
        // driven by this flag, so it has to fall here too — not just on the
        // step where the preset was offered.
        dateAssumed: !picked && Boolean(timeline.assumed),
      });
    }

    const strongest = LEVELS.map((l) => l.id)
      .filter((id) => Object.values(levels).includes(id))
      .at(-1);

    /*
     * The declined answers, written as ANSWERS.
     *
     * `disciplines: []` on its own is indistinguishable from a person who was
     * never asked — and this flow now guarantees everyone WAS asked, so that
     * ambiguity would throw away the only new fact. Each flag records that the
     * question was put and answered "none", which is a different thing from
     * silence and must stay a different thing (§6ag).
     *
     * They travel to the server inside the same `answers` blob, so a person who
     * signs up on the phone is not re-asked on the web.
     */
    const declined = {
      noLimitations,
      noDisciplines: noneDisciplines,
      noFixedTrainingDays: noFixedDays,
      noTechnicalSkills: noSkills,
      heightDeclined: heightPrivate,
      birthYearDeclined: birthYearPrivate,
      noObjectiveYet: noGoal,
    };

    const answers: OnboardingAnswers = {
      declined,
      // Constraints on what may be PRESCRIBED. Never clinical context — the
      // coach may avoid loading a declared knee and may not reason about it.
      limitations,
      limitationsNote: limitationsNote.trim(),
      altitudeIllness,
      trainingBaseline: baseline,
      /*
       * `?? undefined`, never `?? null` and never a fallback value. The
       * gate above cannot be passed without answering, so these are only
       * null on a path that never reaches here — but if one ever does, the
       * record must read as NEVER ASKED rather than as a decline. Those are
       * different facts and this file does not blur them.
       *
       * `gender` and `sexAtBirth` are two fields for the reason given at
       * `SEXES`. Never write one from the other.
       */
      gender: gender ?? undefined,
      sexAtBirth: sexAtBirth ?? undefined,
      heardAbout: heardAbout ?? undefined,
      name,
      disciplines: disciplines
        .map((id) => DISCIPLINES.find((d) => d.id === id)?.discipline)
        .filter((d): d is Discipline => d !== undefined),
      // Conservative when nothing was said. "new" is the only value that cannot
      // overstate what the athlete has done.
      experience: strongest ? LEVEL_TO_EXPERIENCE[strongest] : "new",
      // Deliberately blank: completeOnboarding would otherwise create a second
      // goal on a hardcoded ten-month horizon, ignoring the timeline answer.
      goalName: "",
    };
    /*
     * The body answers, written where each is actually read.
     *
     * Weight goes to `setBodyMassKg` because that is the value the recorder
     * passes into the calorie estimate — it defaulted to 72 kg for everyone, so
     * this is the first session whose energy figure describes this athlete.
     * Height, birth year and the training intent go to settings, which is where
     * the rest of the profile lives.
     */
    const derivedIntent: IntentId = goalPeak
      ? "vertical"
      : disciplines.includes("trail-running")
        ? "endurance"
        : disciplines.includes("mountaineering") || disciplines.includes("ski-touring")
          ? "vertical"
          : "endurance";

    const kg = Number(weightKg.replace(",", "."));
    if (Number.isFinite(kg) && kg > 0) setBodyMassKg(kg);

    const cm = Number(heightCm.replace(",", "."));
    const year = Number(birthYear);
    patchSettings({
      // `undefined` here means "not held". The DECLINED flags above are what
      // carry "asked, and they chose not to say" — the settings field cannot
      // express that, and must not be made to look as though it does.
      heightCm: !heightPrivate && Number.isFinite(cm) && cm > 0 ? Math.round(cm) : undefined,
      birthYear:
        !birthYearPrivate && Number.isFinite(year) && year > 1900 ? Math.round(year) : undefined,
      /*
       * DERIVED, not asked — the "what are you training for?" step was removed
       * 2026-09-01 as already answered by disciplines and the objective.
       *
       * The SETTING is preserved rather than dropped: a session still defaults
       * to something, and that default is now inferred from what they told us
       * elsewhere. An objective is a mountain, so vertical; otherwise the
       * strongest signal in their disciplines; endurance when they named none,
       * which is the least specific default and therefore the safest one to
       * assume on someone's behalf.
       */
      trainingIntent: derivedIntent,
      sessionGoal: derivedIntent,
    });

    /*
     * THE RETURN VALUE IS THE POINT OF THIS LINE, not a nicety.
     *
     * `completeOnboarding` is what carries the sex answer into the fuel record,
     * and the write can be REFUSED: the record may already hold an answer, or
     * storage may reject it outright. Both used to be discarded here, and the
     * payoff panel then told the athlete their estimate had narrowed when it had
     * not. Captured, the panel can say which of the three actually happened.
     */
    setSexNarrowing(completeOnboarding(answers));

    /*
     * Tell the server they are done, so signing in on another device does not
     * ask all the questions again. Not awaited — see `syncOnboarding`.
     *
     * THE TYPED COLUMNS ARE WRITTEN AFTER IT SETTLES, AND THE ORDER IS NOT
     * OPTIONAL. `syncOnboarding` UPSERTS the athlete's row; both calls below
     * are UPDATEs, so they match no row until it exists. Fired in parallel they
     * would race the insert and report `SYNC_NO_ROW` on a signup that worked.
     * `syncOnboarding` returns `Promise<void>` and swallows its own errors, so
     * `.then` runs whether the upsert succeeded or not — which is correct: if
     * it failed, these two report "no profile matched" rather than pretending.
     *
     * TWO CALLS FOR THREE COLUMNS ON ONE TABLE, WHICH IS NOT THE SHAPE ANYBODY
     * WOULD CHOOSE. `settings/sync.ts` explains it at the function: its signup
     * half is uncommitted work being edited by several sessions at once, so
     * `sexAtBirth` was APPENDED as its own function rather than folded into
     * `saveSignupAnswers`, whose type and column list would both have had to be
     * rewritten. Merge them into one call — and one `await` here — the day that
     * file is committed and nothing is racing it.
     *
     * NOT AWAITED AND NOT REPORTED. The results carry a per-field sentence, and
     * there is deliberately nowhere on this screen to show one: the next thing
     * that happens is the plan being built, and a person finishing signup must
     * not be stopped by a message about a column. The honest consequence is
     * written down in the migration and in `sync.ts` — a failed send is a LOST
     * answer, there is no outbox on this path, and nothing here may ever say it
     * will be sent later.
     *
     * ONE CORRECTION TO THAT, AND IT ONLY APPLIES TO `sexAtBirth`. What a
     * failed send loses is the SERVER's copy, which is what a new phone would
     * have restored. It no longer costs this athlete their narrowed estimate:
     * `completeOnboarding` above already tried the local fuel record,
     * synchronously, before any of this network work started. So offline signup
     * keeps the benefit here and loses it on the next device — and `sync.ts`
     * still carries an older paragraph saying otherwise, with a correction
     * appended under it.
     *
     * "TRIED", NOT "WROTE", AND THE WORD IS DELIBERATE. The local write is
     * refused when the phone already holds an answer, and refused again when
     * storage itself refuses. `sexNarrowing` above holds which happened, and the
     * payoff panel reports it — this paragraph may not promise a benefit the
     * panel is about to have to walk back.
     */
    void syncOnboarding({ ...answers }).then(() => {
      void saveSignupAnswers({
        gender: gender ?? undefined,
        heardAbout: heardAbout ?? undefined,
      });
      void saveSexAtBirth({ sexAtBirth: sexAtBirth ?? undefined });
    });
  }, [
    addGoal,
    altitudeId,
    altitudeIllness,
    customDate,
    baseline,
    birthYearPrivate,
    limitations,
    limitationsNote,
    noLimitations,
    completeOnboarding,
    heightPrivate,
    noFixedDays,
    noGoal,
    noSkills,
    noneDisciplines,
    days,
    disciplines,
    equipment,
    gender,
    goalPeak,
    heardAbout,
    levels,
    name,
    sessionMin,
    sexAtBirth,
    skills,
    timelineId,
    updateCoachProfile,
  ]);

  /*
   * The building-your-plan lines — owner addition, 2026-09-01.
   *
   * EVERY LINE IS DERIVED FROM AN ANSWER THEY GAVE, and a line whose answer is
   * absent simply does not appear. That is the whole difference between this
   * and a spinner with rotating copy: someone who declared no injuries never
   * sees "working around", and someone with no kit never sees the kit line.
   *
   * Nothing here claims work that is not happening. No "comparing you to
   * thousands of climbers", no "consulting expedition data" — each line either
   * repeats something they typed or names a step the generator actually runs.
   */
  const buildingLines = useMemo(() => {
    const out: string[] = [];
    const answered = questions.length;
    out.push(`Reading your ${answered} answers`);

    if (goalPeak) {
      // The DATE if they named one, the band if they took a preset — the
      // reveal must say back what they actually chose, not what the step
      // offered. A person who typed 14 May 2027 seeing "within a year" would
      // reasonably wonder whether their date had been taken at all.
      const picked = parseIsoDayLocal(customDate);
      const t = TIMELINES.find((x) => x.id === timelineId);
      const when = picked
        ? picked.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : t
          ? t.label.toLowerCase()
          : "";
      out.push(
        `${goalPeak.name} · ${goalPeak.elevationM.toLocaleString("en-GB")} m` +
          (when ? ` — ${when}` : ""),
      );
    } else {
      out.push("No objective yet — building general mountain fitness");
    }

    if (days.length > 0) {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      out.push(`${days.map((d) => names[d]).join(", ")} — your days`);
    } else if (noFixedDays) {
      out.push("No fixed days — the week stays flexible");
    }

    if (sessionMin !== null) out.push(`Sessions at ${sessionMin} minutes`);

    if (baseline) {
      const b = BASELINES.find((x) => x.id === baseline);
      if (b) out.push(`Starting from: ${b.label.toLowerCase()}`);
    }

    if (limitations.length > 0) {
      const labels = limitations
        .map((id) => LIMITATIONS.find((l) => l.id === id)?.label.toLowerCase())
        .filter(Boolean);
      out.push(`Working around your ${labels.join(", ")}`);
    }

    if (equipment.includes("none")) {
      out.push("Nothing that needs kit you do not have");
    } else if (equipment.length > 0) {
      out.push(`Built for the ${equipment.length} pieces of kit you have`);
    }

    if (altitudeIllness === "mild" || altitudeIllness === "serious") {
      out.push("Conservative ascent rates, as you asked");
    }

    return out;
  }, [
    altitudeIllness,
    baseline,
    customDate,
    days,
    equipment,
    goalPeak,
    limitations,
    noFixedDays,
    questions.length,
    sessionMin,
    timelineId,
  ]);

  /*
   * The date this step actually resolves to, as a bare calendar day.
   *
   * A preset is a span from today; a picked date is itself. Either way the
   * step shows the RESULT, because "within six months" is not a date and the
   * plan is built backwards from a date.
   */
  const resolvedTargetKey = ((): string => {
    if (customDate) return customDate;
    const t = TIMELINES.find((x) => x.id === timelineId);
    if (!t) return "";
    const d = new Date();
    d.setMonth(d.getMonth() + t.months);
    return isoDayKey(d);
  })();

  /**
   * How long the plan will actually run — the same arithmetic `buildPlanForGoal`
   * does, including its 8–52 week clamp.
   *
   * The CLAMPED number is shown, not the raw span, because the clamp is what
   * the athlete will actually get: promising "3 weeks" for a date a fortnight
   * away when the generator will build eight is the sort of small lie this
   * screen exists to avoid.
   */
  const resolvedWeeks = ((): number | null => {
    const d = parseIsoDayLocal(resolvedTargetKey);
    if (!d) return null;
    const raw = Math.round((d.getTime() - Date.now()) / 604_800_000);
    return Math.min(52, Math.max(8, raw));
  })();

  /* ---- Gating ------------------------------------------------------------ */

  // EVERY question blocks until answered — owner ruling 2026-09-01. No step
  // asks anything unreasonable, because every step offers an answer every
  // athlete can truthfully give: "none of these yet", "no fixed days",
  // "bodyweight only", "prefer not to say". Requiring an answer is not the
  // same as requiring a value, and the difference is what keeps this gate from
  // manufacturing a false history for a beginner.
  const validWeight = ((): boolean => {
    const kg = Number(weightKg.replace(",", "."));
    return Number.isFinite(kg) && kg >= 30 && kg <= 200;
  })();
  const validHeight = ((): boolean => {
    const cm = Number(heightCm.replace(",", "."));
    return Number.isFinite(cm) && cm >= 100 && cm <= 250;
  })();
  const validBirthYear = ((): boolean => {
    const y = Number(birthYear);
    return Number.isFinite(y) && y > 1900 && y <= new Date().getFullYear() - 5;
  })();

  const canAdvance = ((): boolean => {
    switch (step) {
      case "disciplines":
        return disciplines.length > 0 || noneDisciplines;
      case "experience":
        return disciplines.every((id) => levels[id] !== undefined);
      case "goal":
        return Boolean(goalPeak) || noGoal;
      case "timeline":
        return timelineId !== null || customDate !== "";
      case "days":
        return days.length > 0 || noFixedDays;
      case "length":
        return sessionMin !== null;
      case "equipment":
        // "Bodyweight only" is in the list as a real option, so non-empty IS
        // answered — no extra tile needed here.
        return equipment.length > 0;
      case "skills":
        return skills.length > 0 || noSkills;
      case "altitude":
        return altitudeId !== null;
      case "body":
        // Weight is genuinely required — it is the calorie estimate's only
        // input. Height and year accept "prefer not to say" as the answer.
        return validWeight && (validHeight || heightPrivate) && (validBirthYear || birthYearPrivate);
      case "altitudeIllness":
        return altitudeIllness !== null;
      case "baseline":
        return baseline !== null;
      case "limitations":
        return limitations.length > 0 || noLimitations;
      // All three block until answered, and all three offer a decline that IS
      // an answer — so requiring one costs nobody anything. A `null` here can
      // only mean the step was never touched, which is exactly what should
      // block. If any of these ever gained a default value, this gate would
      // silently stop gating.
      case "gender":
        return gender !== null;
      case "sexAtBirth":
        return sexAtBirth !== null;
      case "heardAbout":
        return heardAbout !== null;
      case "name":
        return name.trim().length > 0;
      default:
        return true;
    }
  })();

  function next() {
    if (!canAdvance) return;
    if (step === "name") finish();
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  return (
    <div className="flex h-full flex-col bg-obsidian">
      {/* ---- Progress ---------------------------------------------------- */}
      <div
        className="flex shrink-0 items-center gap-3 px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
      >
        {index > 0 && step !== "payoff" && step !== "building" ? (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            aria-label="Back"
            className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={18} strokeWidth={1.6} />
          </button>
        ) : (
          <span className="h-9 w-0 shrink-0" />
        )}

        <div className="flex flex-1 gap-1">
          {questions.map((key, i) => {
            const reached = questionNumber > 0 && i < questionNumber;
            const done = step === "payoff" || step === "building";
            return (
              <span key={key} className="h-px flex-1 overflow-hidden bg-hairline">
                <motion.span
                  className="block h-full bg-azure"
                  initial={false}
                  animate={{ width: reached || done ? "100%" : "0%" }}
                  transition={{ duration: 0.45, ease: EASE }}
                />
              </span>
            );
          })}
        </div>

        <span className="section-label tnum shrink-0">
          {step === "intro"
            ? "INTRO"
            : step === "building"
              ? "BUILDING"
              : step === "payoff"
                ? "DONE"
                : `${questionNumber} OF ${questions.length}`}
        </span>
      </div>

      {/* ---- Body -------------------------------------------------------- */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5">
        {/* NOT mode="wait". That mode holds the incoming step until the outgoing
            one finishes exiting, and framer-motion drives exits with
            requestAnimationFrame — which the browser pauses whenever the page is
            hidden. Background the app mid-step and the exit never completes, so
            the next question never mounts and the athlete comes back to a dead
            screen part-way through signing up. Overlapping the transition costs
            a little polish and cannot strand anyone. */}
        <AnimatePresence initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: DURATION, ease: EASE }}
            className="pb-10 pt-6"
          >
            {step === "intro" && <IntroStep count={ALL_QUESTION_STEPS.length} />}

            {step === "disciplines" && (
              <>
                <StepHead
                  eyebrow="Disciplines"
                  title={["What do you", "actually do?"]}
                  subtitle="Choose everything that applies. This decides which experience questions ICEFALL asks you next, and those go to the readiness assessment as context."
                />
                <div className="mt-7 grid grid-cols-2 gap-2.5">
                  {DISCIPLINES.map((d) => {
                    const on = disciplines.includes(d.id);
                    const Icon = d.icon;
                    return (
                      <Tile
                        key={d.id}
                        selected={on}
                        className="p-4"
                        onClick={() => {
                          setNoneDisciplines(false);
                          setDisciplines((s) => toggle(s, d.id));
                          // Dropping a discipline drops its experience answer —
                          // keeping it would write a level for something the
                          // athlete no longer says they do.
                          setLevels((s) => {
                            if (!(d.id in s)) return s;
                            const rest = { ...s };
                            delete rest[d.id];
                            return rest;
                          });
                        }}
                      >
                        <Icon
                          size={19}
                          strokeWidth={1.5}
                          className={on ? "text-azure" : "text-mist"}
                        />
                        <span className="mt-6 block pr-5 text-[13px] leading-snug text-snow">
                          {d.label}
                        </span>
                      </Tile>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNoneDisciplines((v) => !v);
                    setDisciplines([]);
                  }}
                  aria-pressed={noneDisciplines}
                  className={cn(
                    "relative mt-4 w-full rounded-tile border p-4 text-left transition-colors duration-200",
                    noneDisciplines
                      ? "border-azure/60 bg-azure/[0.07]"
                      : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                  )}
                >
                  <span className="block text-[13px] text-snow">None of these yet</span>
                  <span className="mt-1 block pr-6 text-[11px] leading-relaxed text-mist-dim">
                    A real answer, recorded as such. ICEFALL skips the experience question — a
                    question it declined to ask, not one you skipped — and never invents a
                    discipline for you.
                  </span>
                  {noneDisciplines && <Ticked />}
                </button>
              </>
            )}

            {step === "experience" && (
              <>
                <StepHead
                  eyebrow="Experience"
                  title="How far in are you?"
                  subtitle="One answer per discipline. ICEFALL records these as your own words and never scores them — a claim is a claim, and it will say so."
                />
                <div className="mt-7 space-y-5">
                  {disciplines.map((id) => {
                    const option = DISCIPLINES.find((d) => d.id === id);
                    if (!option) return null;
                    return (
                      <div key={id}>
                        <p className="section-label text-mist-dim">{option.label}</p>
                        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                          {LEVELS.map((l) => {
                            const on = levels[id] === l.id;
                            return (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => setLevels((s) => ({ ...s, [id]: l.id }))}
                                aria-pressed={on}
                                className={cn(
                                  "rounded-tile border px-1 py-2.5 text-[11px] transition-colors duration-200",
                                  on
                                    ? "border-azure/60 bg-azure/[0.07] text-snow"
                                    : "border-hairline bg-elevated/40 text-mist hover:border-hairline-strong",
                                )}
                              >
                                {l.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {step === "goal" && (
              <>
                <StepHead
                  eyebrow="Next goal"
                  title="What are you building towards?"
                  subtitle="The objective and its date are what the whole training plan is generated backwards from."
                />

                {goalPeak ? (
                  <div className="mt-7 flex items-center gap-3 rounded-tile border border-azure/60 bg-azure/[0.07] p-3">
                    <MountainThumb peak={goalPeak} size={46} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-snow">{goalPeak.name}</p>
                      <p className="tnum text-[11px] text-mist-dim">
                        {fmtElevation(goalPeak.elevationM)} m ·{" "}
                        {assessPeak(goalPeak.elevationM, goalPeak.lat, goalPeak.lon).label}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoalPeak(null)}
                      aria-label="Choose a different objective"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-7 space-y-2">
                      {SUGGESTIONS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setGoalPeak(p);
                            setNoGoal(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-tile border border-hairline bg-elevated/40 p-2.5 text-left transition-colors hover:border-azure/50"
                        >
                          <MountainThumb peak={p} size={46} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-snow">{p.name}</span>
                            <span className="tnum block text-[11px] text-mist-dim">
                              {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>

                    <p className="section-label mt-8 text-mist-dim">Or find your own</p>
                    <div className="mt-2.5">
                      <PeakSearch
                        onPick={(p) => {
                          setGoalPeak(p);
                          setNoGoal(false);
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setNoGoal((v) => !v)}
                      aria-pressed={noGoal}
                      className={cn(
                        "relative mt-6 w-full rounded-tile border p-4 text-left transition-colors duration-200",
                        noGoal
                          ? "border-azure/60 bg-azure/[0.07]"
                          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                      )}
                    >
                      <span className="block text-[13px] text-snow">I don't have one yet</span>
                      <span className="mt-1 block pr-6 text-[11px] leading-relaxed text-mist-dim">
                        A perfectly good answer, and nothing is withheld for it. ICEFALL simply
                        won't invent a summit to point you at.
                      </span>
                      {noGoal && <Ticked />}
                    </button>
                  </>
                )}
              </>
            )}

            {step === "timeline" && goalPeak && (
              <>
                <StepHead
                  eyebrow="Timeline"
                  title={["When do you want", "to be standing on it?"]}
                  subtitle={`The plan for ${goalPeak.name} is built backwards from this date — how many weeks it runs, and where Base, Build, Peak and Taper fall.`}
                />
                <div className="mt-7 space-y-2">
                  {TIMELINES.map((t) => (
                    <ChoiceRow
                      key={t.id}
                      label={t.label}
                      detail={
                        // The caveat belongs to the ASSUMPTION and dies with it.
                        // Once a real date is named there is nothing assumed, and
                        // a sentence explaining an assumption that no longer
                        // exists is the §6aa failure in miniature.
                        t.assumed && !customDate
                          ? "ICEFALL will assume twelve months so a plan can exist, and will say so"
                          : undefined
                      }
                      selected={!customDate && timelineId === t.id}
                      onClick={() => {
                        setTimelineId(t.id);
                        // Choosing a preset replaces a picked date, so the two
                        // can never both look chosen.
                        setCustomDate("");
                      }}
                    />
                  ))}
                </div>

                {/* The "adjust it" half, and the more important one: whatever
                    was chosen, the DATE IT RESOLVES TO is shown and is itself
                    the control. Tapping it opens the picker on that month, so
                    preset-then-adjust is one continuous motion rather than a
                    mode switch. */}
                {(timelineId !== null || customDate) && (
                  <div className="mt-5">
                    <p className="section-label text-mist-dim">
                      {customDate ? "Your date" : "Which works out as"}
                    </p>
                    <DateField
                      label="Target date"
                      value={resolvedTargetKey}
                      min={isoDayKey(new Date())}
                      onChange={(iso) => setCustomDate(iso)}
                      className="mt-2"
                    />
                    {resolvedWeeks !== null && (
                      <p className="tnum mt-2 text-[11.5px] leading-relaxed text-mist-dim">
                        {resolvedWeeks} weeks from today.
                        {resolvedWeeks === 8 ? " The shortest plan ICEFALL will build." : ""}
                        {resolvedWeeks === 52 ? " The longest plan ICEFALL will build." : ""}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {step === "days" && (
              <>
                <StepHead
                  eyebrow="Training days"
                  title="Which days are yours?"
                  subtitle="The days you can normally train, saved to your profile."
                />
                <div className="mt-7 grid grid-cols-4 gap-2">
                  {WEEK.map((d) => {
                    const on = days.includes(d.day);
                    return (
                      <button
                        key={d.day}
                        type="button"
                        onClick={() => {
                          setNoFixedDays(false);
                          setDays((s) => toggle(s, d.day));
                        }}
                        aria-pressed={on}
                        aria-label={d.full}
                        className={cn(
                          "rounded-tile border py-3 text-[12px] transition-colors duration-200",
                          on
                            ? "border-azure/60 bg-azure/[0.07] text-snow"
                            : "border-hairline bg-elevated/40 text-mist hover:border-hairline-strong",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNoFixedDays((v) => !v);
                    setDays([]);
                  }}
                  aria-pressed={noFixedDays}
                  className={cn(
                    "relative mt-4 w-full rounded-tile border p-4 text-left transition-colors duration-200",
                    noFixedDays
                      ? "border-azure/60 bg-azure/[0.07]"
                      : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                  )}
                >
                  <span className="block text-[13px] text-snow">No fixed days — it varies</span>
                  <span className="mt-1 block pr-6 text-[11px] leading-relaxed text-mist-dim">
                    Recorded on your profile as its own answer. Either way, the generated week is
                    currently a fixed six sessions and one rest day — ICEFALL does not yet move
                    sessions onto the days you pick.
                  </span>
                  {noFixedDays && <Ticked />}
                </button>
              </>
            )}

            {step === "length" && (
              <>
                <StepHead
                  eyebrow="Session length"
                  title="How long is a normal session?"
                  subtitle="Roughly, on a day you are not doing something long in the mountains."
                />
                <div className="mt-7 space-y-2">
                  {SESSION_LENGTHS.map((m) => (
                    <ChoiceRow
                      key={m}
                      label={m === 120 ? "120 minutes or more" : `${m} minutes`}
                      selected={sessionMin === m}
                      onClick={() => setSessionMin(m)}
                    />
                  ))}
                </div>
                <EmptyMeaning>
                  Recorded on your profile. Sessions are still prescribed at the length the plan
                  sets for that kind of day — ICEFALL does not yet cut them to this number. When one
                  does not fit, the session screen will rebuild it around the time you actually
                  have.
                </EmptyMeaning>
              </>
            )}

            {step === "equipment" && (
              <>
                <StepHead
                  eyebrow="Equipment"
                  title="What can you train with?"
                  subtitle="This one changes your sessions directly: ICEFALL will not prescribe a movement that needs kit you don't have."
                />
                <div className="mt-7 grid grid-cols-2 gap-2.5">
                  {EQUIPMENT.map((e) => {
                    const on = equipment.includes(e.id);
                    return (
                      <Tile
                        key={e.id}
                        selected={on}
                        className="p-3.5"
                        onClick={() => setEquipment((s) => toggle(s, e.id))}
                      >
                        <span className="block pr-5 text-[13px] leading-snug text-snow">
                          {e.label}
                        </span>
                        {e.note && (
                          <span className="mt-0.5 block text-[11px] text-mist-dim">{e.note}</span>
                        )}
                      </Tile>
                    );
                  })}
                </div>
                <EmptyMeaning>
                  Choosing nothing is different from choosing "bodyweight only". Nothing means you
                  have not told ICEFALL, so sessions are built as normal with a note that they
                  assume the movements are available. "Bodyweight only" is a statement, and sessions
                  are then built without equipment at all.
                </EmptyMeaning>
              </>
            )}

            {step === "skills" && (
              <>
                <StepHead
                  eyebrow="Technical skills"
                  title="What have you been taught?"
                  subtitle="Only competences ICEFALL can check an objective against are listed. Nothing here is verified — it is your word, and every screen that uses it says so."
                />
                <div className="mt-7 space-y-6">
                  {SKILL_GROUPS.map((g) => (
                    <div key={g.title}>
                      <p className="section-label text-mist-dim">{g.title}</p>
                      <div className="mt-2.5 space-y-2">
                        {g.skills.map((s) => {
                          const on = skills.includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                setNoSkills(false);
                                setSkills((v) => toggle(v, s));
                              }}
                              aria-pressed={on}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-tile border px-3.5 py-3 text-left transition-colors duration-200",
                                on
                                  ? "border-azure/60 bg-azure/[0.07]"
                                  : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                              )}
                            >
                              <span
                                className={cn(
                                  "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                                  on
                                    ? "border-azure bg-azure/15 text-azure"
                                    : "border-hairline text-transparent",
                                )}
                              >
                                <Check size={10} strokeWidth={3} />
                              </span>
                              <span className="text-[13px] text-snow">{s}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setNoSkills((v) => !v);
                    setSkills([]);
                  }}
                  aria-pressed={noSkills}
                  className={cn(
                    "relative mt-5 w-full rounded-tile border p-4 text-left transition-colors duration-200",
                    noSkills
                      ? "border-azure/60 bg-azure/[0.07]"
                      : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                  )}
                >
                  <span className="block text-[13px] text-snow">None of these yet</span>
                  {noSkills && <Ticked />}
                </button>

                <EmptyMeaning>
                  None of these yet is a normal place to be, and it is the honest answer if you have
                  not been taught them. ICEFALL then withholds a technical readiness score rather
                  than guessing one. These are learned in person from a qualified instructor, never
                  from an app.
                </EmptyMeaning>
              </>
            )}

            {step === "altitude" && (
              <>
                <StepHead
                  eyebrow="Altitude"
                  title="How high have you been?"
                  subtitle="The highest you have actually stood, on any trip. This becomes the floor ICEFALL reasons from — it will never assume one."
                />
                <div className="mt-7 space-y-2">
                  {ALTITUDE_BANDS.map((b) => (
                    <ChoiceRow
                      key={b.id}
                      label={b.label}
                      selected={altitudeId === b.id}
                      onClick={() => setAltitudeId(b.id)}
                    />
                  ))}
                </div>
                <EmptyMeaning>
                  Having reached an altitude once is not the same as being acclimatised for it —
                  acclimatisation is lost within a few weeks back down low. ICEFALL treats this as
                  history, not as current state.
                </EmptyMeaning>
              </>
            )}

            {step === "name" && (
              <>
                <StepHead
                  eyebrow="Your name"
                  title="Last one."
                  // Not "you can change it later in Settings" — no screen edits
                  // the name today, and promising one would be a small lie.
                  subtitle="What ICEFALL should call you. It stays on this device; there is no account server behind it."
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") next();
                  }}
                  placeholder="Your full name"
                  autoComplete="name"
                  autoFocus
                  className="mt-7 h-14 w-full rounded-tile border border-hairline bg-elevated/40 px-4 text-[17px] font-light text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
                />
              </>
            )}

            {step === "gender" && (
              <>
                <StepHead
                  eyebrow="You"
                  title="How do you describe yourself?"
                  subtitle="Recorded on your account and read by nothing. It changes no session, no plan, no readiness figure and no calorie estimate — it is here because it belongs on a profile, not because something downstream is waiting on it. The next question asks about sex at birth, which is a different question and the only one of the two that changes a number."
                />
                <div className="mt-7 space-y-2.5">
                  {GENDERS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setGender(o.id)}
                      aria-pressed={gender === o.id}
                      className={cn(
                        "w-full rounded-tile border px-4 py-3.5 text-left transition-colors",
                        gender === o.id
                          ? "border-azure/55 bg-azure/[0.08]"
                          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                      )}
                    >
                      <span className="block text-[15px] text-snow">{o.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "sexAtBirth" && (
              <>
                {/*
                  THE SUBTITLE IS THE FEATURE ON THIS STEP, and every clause of
                  it is load-bearing.

                  It opens by saying this is NOT the previous question, because
                  the second of two adjacent questions about the same broad
                  subject reads as a form that forgot what it just asked, and a
                  person who reads it that way answers it carelessly or resents
                  it. Then it says exactly what the answer buys — one term of
                  one estimate — because that is the entire measurable benefit
                  and a vaguer promise ("helps us personalise your nutrition")
                  would be a larger claim than the code can pay.

                  IT USED TO QUOTE "166 kcal" AND THAT WAS WRONG TWICE OVER.
                  Wrong first because the answer reached nothing: it went to the
                  database and into the answers blob, and the estimate read
                  neither, so this sentence sold a narrowing that did not exist.
                  That is fixed — `AppState.completeOnboarding` now puts the
                  answer in the fuel record the estimate actually reads. Wrong
                  second because 166 was never the daily figure even in
                  principle: it is the gap between Mifflin-St Jeor's two sex
                  intercepts, +5 and -161, inside the RESTING term, and the day
                  widens that band by ±10% for individual variation and then
                  multiplies it by an activity range.

                  ITS REPLACEMENT, "50 to 600 kcal", WAS WRONG AS WELL, which is
                  the reason this step quotes nothing at all. Re-measured
                  2026-09-03 with the real `narrowingWorth` over every
                  combination the app accepts, stepping 1 kg / 1 cm / 1 year: an
                  athlete who also gives height and birth year — the next step
                  asks for both — gets 200 kcal back, or 250 ONLY where everyday
                  movement is answered `physical` (`seated` and `on-feet` leave
                  it at 200, as not answering does), flat across the whole
                  accepted body (30-250 kg, 100-250 cm, ages 10-100). Decline the
                  height and it runs 50 to 600 for an adult of 45-120 kg aged
                  18-100 — 600 needs `physical`, so 50 to 500 is the common case
                  — and 50 to 1,450 across everything the app accepts. So the
                  subtitle
                  names the mechanism, says the size depends on their other
                  answers, and quotes no figure — which is the only version of it
                  that survives somebody checking the arithmetic.

                  AND IT NO LONGER SAYS ICEFALL "HOLDS NO SEX FOR YOU". It said
                  that, and then "Answering picks one and the range narrows",
                  and this screen has no way to know either is true. The phone
                  may already hold an answer — from the Fuel screen, or from
                  whoever used it before, since signing out keeps everything on
                  the device on purpose — and `rememberSexForEnergy` refuses to
                  overwrite one. Storage can also simply refuse the write. So the
                  subtitle states the condition instead of asserting the state,
                  points at the Fuel screen as the place an existing answer is
                  changed, and promises that the next screen will say what
                  actually happened. That promise is kept by the payoff panel,
                  which reads the outcome `completeOnboarding` returns.

                  Then it says what declining does, in the same breath rather
                  than in small grey text underneath: the band widens and says
                  so. Declining is an ANSWER here, it satisfies the gate, and it
                  is stored as a value. Somebody weighing it up deserves to know
                  the cost before they choose, not to discover it afterwards.

                  WHAT IT DOES NOT SAY, AND MUST NEVER SAY: anything about
                  weight, body fat, leanness, or a target of any kind.
                  `coach/nutrition.ts` states that ICEFALL sets no weight target
                  and no body-composition target, and that single sentence is
                  the reason the fuel screen is not another calorie app. A sex
                  question framed anywhere near body composition would break it
                  on the first screen a new athlete ever sees.
                */}
                <StepHead
                  eyebrow="You"
                  title="Sex assigned at birth?"
                  subtitle="A different question from the last one, not a re-ask. Gender is who you are; this is one term in a published equation. ICEFALL estimates what your body uses at rest, and without a sex that estimate spans both terms and is wider for it. Unless this phone already holds an answer — from the Fuel screen, or from whoever used it before you — what you pick here becomes the term, as long as this phone will store it: choosing one narrows the estimate to it, and Prefer not to say keeps the wider band covering both and says on screen why rather than guessing. If it does already hold one, that answer stands and the Fuel screen is where it changes. How much a sex narrows the estimate depends on the rest of your numbers, so no single figure would be honest here. Nothing else reads this. The summary at the end says what was actually stored."
                />
                <div className="mt-7 space-y-2.5">
                  {SEXES.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSexAtBirth(o.id)}
                      aria-pressed={sexAtBirth === o.id}
                      className={cn(
                        "w-full rounded-tile border px-4 py-3.5 text-left transition-colors",
                        sexAtBirth === o.id
                          ? "border-azure/55 bg-azure/[0.08]"
                          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                      )}
                    >
                      <span className="block text-[15px] text-snow">{o.label}</span>
                      <span className="mt-0.5 block text-[12px] text-mist-dim">{o.note}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "body" && (
              <>
                <StepHead
                  eyebrow="You"
                  title="A few numbers about you."
                  subtitle="Weight is required — the calorie estimate has no other input, and without it every figure would describe an assumed 72 kg body instead of yours. The other two take 'prefer not to say'."
                />
                <div className="mt-7 space-y-3">
                  <NumberField
                    label="Weight"
                    unit="kg"
                    value={weightKg}
                    onChange={setWeightKg}
                    placeholder="72"
                    note={
                      weightKg.trim() !== "" && !validWeight
                        ? "Between 30 and 200 kg — outside that the estimate would be describing a typo."
                        : "Used for the calorie estimate on every session."
                    }
                  />
                  <NumberField
                    label="Height"
                    unit="cm"
                    value={heightCm}
                    onChange={(v) => {
                      setHeightPrivate(false);
                      setHeightCm(v);
                    }}
                    placeholder="178"
                    note="Recorded only. Nothing in ICEFALL uses it yet."
                    privacy={{
                      on: heightPrivate,
                      toggle: () => {
                        setHeightPrivate((v) => !v);
                        setHeightCm("");
                      },
                    }}
                  />
                  <NumberField
                    label="Year of birth"
                    unit=""
                    value={birthYear}
                    onChange={(v) => {
                      setBirthYearPrivate(false);
                      setBirthYear(v);
                    }}
                    placeholder="1994"
                    note="Recorded only. ICEFALL will not turn your age into a heart-rate zone — that formula is a population average, not a measurement of you."
                    privacy={{
                      on: birthYearPrivate,
                      toggle: () => {
                        setBirthYearPrivate((v) => !v);
                        setBirthYear("");
                      },
                    }}
                  />
                </div>
              </>
            )}

            {step === "heardAbout" && (
              <>
                <StepHead
                  eyebrow="ICEFALL"
                  title="Where did you find ICEFALL?"
                  subtitle="The one question here that is for ICEFALL rather than for you — it changes nothing about your plan. One person reads these answers and decides where to spend their time. Nothing checks it, so 'I don't remember' and 'I'd rather not say' are real answers and cost you nothing."
                />
                <div className="mt-7 space-y-2.5">
                  {HEARD_ABOUT.map((o) => {
                    /*
                      A real brand mark where BrandMarks.tsx holds accurate
                      geometry, an ordinary lucide pictogram otherwise, and one
                      or the other on EVERY row — a fixed icon column with a gap
                      in it reads as a rendering fault rather than as a decision.

                      `hasPlatformMark` is asked rather than assumed because the
                      answer list is deliberately wider than the set of marks:
                      "A search engine" must never get Google's G (this file has
                      no idea which engine it was, and BrandMarks holds a real G
                      twenty lines from here, which is what makes that tempting)
                      and a friend, a guide and a podcast are not brands.

                      `tone="current"` on the selected row: a Reddit orange
                      sitting inside a row that has gone azure looks like a bug
                      rather than a brand colour.
                    */
                    const Pictogram = o.icon;
                    const selected = heardAbout === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setHeardAbout(o.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-tile border px-4 py-3.5 text-left transition-colors",
                          selected
                            ? "border-azure/55 bg-azure/[0.08] text-azure"
                            : "border-hairline bg-elevated/40 text-mist hover:border-hairline-strong",
                        )}
                      >
                        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center">
                          {hasPlatformMark(o.id) ? (
                            <PlatformMark
                              platform={o.id}
                              size={18}
                              tone={selected ? "current" : "brand"}
                            />
                          ) : Pictogram ? (
                            <Pictogram size={18} strokeWidth={1.6} />
                          ) : null}
                        </span>
                        <span className="text-[15px] text-snow">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {step === "altitudeIllness" && (
              <>
                <StepHead
                  eyebrow="Altitude"
                  title="Have you had altitude sickness?"
                  subtitle="This constrains how fast ICEFALL is willing to suggest you go up. It is not a diagnosis and ICEFALL will not offer one — altitude illness is a medical matter for a doctor who can see you."
                />
                <div className="mt-7 space-y-2.5">
                  {ALTITUDE_ILLNESS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setAltitudeIllness(o.id)}
                      aria-pressed={altitudeIllness === o.id}
                      className={cn(
                        "w-full rounded-tile border px-4 py-3.5 text-left transition-colors",
                        altitudeIllness === o.id
                          ? "border-azure/55 bg-azure/[0.08]"
                          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                      )}
                    >
                      <span className="block text-[15px] text-snow">{o.label}</span>
                      <span className="mt-0.5 block text-[12px] text-mist-dim">{o.note}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "baseline" && (
              <>
                <StepHead
                  eyebrow="Right now"
                  title="How much are you training at the moment?"
                  subtitle="Where you are starting FROM. Without it a plan is built backwards from your date alone, and a beginner gets the same week as somebody already training five days — which is how people arrive at the mountain injured."
                />
                <div className="mt-7 space-y-2.5">
                  {BASELINES.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setBaseline(o.id)}
                      aria-pressed={baseline === o.id}
                      className={cn(
                        "w-full rounded-tile border px-4 py-3.5 text-left transition-colors",
                        baseline === o.id
                          ? "border-azure/55 bg-azure/[0.08]"
                          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                      )}
                    >
                      <span className="block text-[15px] text-snow">{o.label}</span>
                      {o.note && (
                        <span className="mt-0.5 block text-[12px] text-mist-dim">{o.note}</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "limitations" && (
              <>
                <StepHead
                  eyebrow="Training around"
                  title="Anything ICEFALL should train around?"
                  subtitle="So sessions stop loading something that should not be loaded. ICEFALL will not tell you what is wrong, whether it is healing, or when to return — that belongs with a doctor or a physiotherapist who can examine you."
                />
                <div className="mt-7 grid grid-cols-2 gap-2.5">
                  {LIMITATIONS.map((l) => {
                    const on = limitations.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setNoLimitations(false);
                          setLimitations((v) => toggle(v, l.id));
                        }}
                        aria-pressed={on}
                        className={cn(
                          "rounded-tile border px-3.5 py-3 text-left text-[13px] transition-colors",
                          on
                            ? "border-azure/60 bg-azure/[0.07] text-snow"
                            : "border-hairline bg-elevated/40 text-mist hover:border-hairline-strong",
                        )}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>

                {/* Verbatim to the constraint list, never parsed into a
                    category: "left knee ACL 2024" is more useful to a human
                    reading the row than any bucket this app could guess, and
                    guessing would be the app interpreting a medical statement. */}
                {(limitations.length > 0 || limitationsNote.trim() !== "") && (
                  <textarea
                    value={limitationsNote}
                    onChange={(e) => {
                      setNoLimitations(false);
                      setLimitationsNote(e.target.value.slice(0, 300));
                    }}
                    rows={3}
                    placeholder="Anything worth adding, in your own words — optional"
                    aria-label="Anything worth adding"
                    className="mt-3 w-full resize-none rounded-tile border border-hairline bg-elevated/40 p-3.5 text-[13px] leading-relaxed text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
                  />
                )}

                <button
                  type="button"
                  onClick={() => {
                    setNoLimitations((v) => !v);
                    setLimitations([]);
                    setLimitationsNote("");
                  }}
                  aria-pressed={noLimitations}
                  className={cn(
                    "relative mt-4 w-full rounded-tile border p-4 text-left transition-colors duration-200",
                    noLimitations
                      ? "border-azure/60 bg-azure/[0.07]"
                      : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                  )}
                >
                  <span className="block text-[13px] text-snow">Nothing right now</span>
                  {noLimitations && <Ticked />}
                </button>

                <EmptyMeaning>
                  ICEFALL never asks you to train through pain, whatever is recorded here. If
                  something hurts during a session, stop — that instruction does not depend on this
                  answer, and no answer here removes it.
                </EmptyMeaning>
              </>
            )}

            {step === "building" && (
              <BuildingPlan
                lines={buildingLines}
                onDone={() => setIndex((i) => Math.min(i + 1, steps.length - 1))}
              />
            )}

            {step === "payoff" && (
              <Payoff
                created={created}
                disciplines={disciplines}
                levels={levels}
                days={days}
                sessionMin={sessionMin ?? 60}
                equipment={equipment}
                skills={skills}
                altitudeId={altitudeId}
                gender={gender}
                sexAtBirth={sexAtBirth}
                sexNarrowing={sexNarrowing}
                heardAbout={heardAbout}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- Footer ------------------------------------------------------ */}
      <div
        className="shrink-0 border-t border-hairline bg-obsidian px-5 pt-4"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {step === "building" ? (
          // No control: the reveal advances itself. A button here would invite
          // someone to skip the one moment that exists to be watched, and a
          // disabled one would just look broken.
          <span className="block h-[52px]" />
        ) : step === "payoff" ? (
          /* → the "Connect your accounts" page (owner, 2026-09-07), which
             leads on to the trial offer itself. */
          <Button size="lg" className="w-full" onClick={() => navigate("/connect")}>
            Continue
            <ArrowRight size={16} strokeWidth={1.8} />
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!canAdvance} onClick={next}>
            {step === "intro" ? "Begin" : step === "name" ? "Build my plan" : "Continue"}
            <ArrowRight size={16} strokeWidth={1.8} />
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 01 — Intro                                                                  */
/* -------------------------------------------------------------------------- */

function IntroStep({ count }: { count: number }) {
  return (
    <>
      <StepHead
        eyebrow="Personalisation"
        title={["Let's build", "your mountain."]}
        // The count comes from `ALL_QUESTION_STEPS`, so it cannot drift from
        // the flow. The sentence after it can, and did — "two are recorded for
        // later" described height and year before they became declinable and
        // before three questions were added that all change something. A
        // promise about the questions has to be re-read every time the
        // questions change.
        subtitle={`${count} questions at most — a couple drop out if they don't apply to you. About a minute. Every one is answerable: where a truthful answer is "none" or "prefer not to say", that is offered as a real option. They change which movements your sessions prescribe, how fast ICEFALL is willing to suggest you go up, and what it will train around.`}
      />

      <div className="mt-9 space-y-px overflow-hidden rounded-card border border-hairline">
        {[
          ["Your objective", "Sets the target date the whole plan is built backwards from."],
          ["Your equipment", "Decides which exercises can appear in a session at all."],
          [
            "Your skills and altitude",
            "The two things ICEFALL cannot observe, and will not guess.",
          ],
        ].map(([t, d]) => (
          <div key={t} className="bg-graphite px-4 py-3.5">
            <p className="text-[13px] text-snow">{t}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">{d}</p>
          </div>
        ))}
      </div>

      <Disclaimer className="mt-7">
        Where an answer does not yet change anything, the summary at the end says so rather than
        implying otherwise. ICEFALL is a training tool, not medical advice, and it defers to a
        certified guide on anything glaciated, technical or high.
      </Disclaimer>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 12 — Payoff                                                                 */
/* -------------------------------------------------------------------------- */

function Line({ label, value, effect }: { label: string; value: string; effect: React.ReactNode }) {
  return (
    <div className="border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="section-label text-mist-dim">{label}</span>
        <span className="tnum min-w-0 text-right text-[13px] text-snow">{value}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist">{effect}</p>
    </div>
  );
}

/**
 * The 10–12 second moment before the plan appears.
 *
 * WHY THIS IS NOT A PROGRESS BAR.
 *
 * Generating the plan is near-instant. A progress track or a percentage would
 * be drawing a measurement of remaining work that nobody is measuring — the
 * same fabrication as any other invented figure, just wearing a loading
 * animation. So this is a PACED REVEAL: the timing is honest about being
 * presentation, and every line it shows is something the athlete typed.
 *
 * The lines arrive from `buildingLines`, which omits any line whose answer is
 * absent. Somebody who declared no injuries never sees an injury line. A line
 * that appeared for everyone regardless of their answers would be the generic
 * version wearing this one's clothes.
 *
 * `prefers-reduced-motion` skips the whole thing — the plan is already built,
 * so there is nothing to wait for and nothing is lost.
 */
function BuildingPlan({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  // Fewer answers means fewer lines, so the pace stretches to fill the same
  // window rather than the screen being padded with generic filler.
  const stepMs = Math.min(1600, Math.max(950, Math.round(10_500 / Math.max(1, lines.length))));

  useEffect(() => {
    if (reduce) {
      onDone();
      return;
    }
    if (shown >= lines.length) {
      // A beat after the last line lands, so it is read rather than glimpsed.
      const t = window.setTimeout(onDone, 900);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 350 : stepMs);
    return () => window.clearTimeout(t);
  }, [shown, lines.length, reduce, stepMs, onDone]);

  if (reduce) return null;

  return (
    <div className="flex min-h-[60vh] flex-col justify-center py-10">
      <p className="section-label text-azure">Building your plan</p>

      <div className="mt-6 space-y-3.5">
        {lines.slice(0, shown).map((line, i) => (
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: i === shown - 1 ? 1 : 0.45, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-[17px] font-light leading-snug text-snow"
          >
            {line}
          </motion.p>
        ))}
      </div>

      {/* A breathing dot, not a progress track: it says "working", and claims
          no knowledge of how much is left, because nothing measures that. */}
      <motion.span
        aria-hidden
        animate={{ opacity: [0.25, 1, 0.25] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="mt-8 h-1.5 w-1.5 rounded-full bg-azure"
      />
    </div>
  );
}

function Payoff({
  created,
  disciplines,
  levels,
  days,
  sessionMin,
  equipment,
  skills,
  altitudeId,
  gender,
  sexAtBirth,
  sexNarrowing,
  heardAbout,
}: {
  created: CreatedGoal | null;
  disciplines: string[];
  levels: Record<string, Level>;
  days: number[];
  sessionMin: number;
  equipment: Equipment[];
  skills: string[];
  altitudeId: string | null;
  gender: Gender | null;
  sexAtBirth: SexAtBirth | null;
  /**
   * What the sex answer DID, which is not the same as what it said.
   *
   * This panel is titled "what your answers changed", so for the one answer that
   * changes a live number it has to report the outcome rather than the input.
   * See the Line below, and `SexNarrowing` in `state/AppState.tsx`.
   */
  sexNarrowing: SexNarrowing;
  heardAbout: HeardAboutChannel | null;
}) {
  /**
   * The plan's real shape, read back out of the generator.
   *
   * These numbers are not written by hand and cannot drift: buildPlanForGoal is
   * the function the Coach uses, run here against the goal that was just
   * created, so the week count and the session count on this screen are the
   * ones the athlete will actually see.
   */
  const plan = useMemo(() => {
    if (!created) return null;
    const curated = created.peak.curatedId ? sync.mountainById(created.peak.curatedId) : undefined;
    const preview: Goal = {
      id: "onboarding-preview",
      name: created.peak.name,
      elevationM: created.peak.elevationM,
      mountainId: created.peak.curatedId,
      targetDate: created.targetDate,
      trainingStartedAt: created.trainingStartedAt,
      preparation: 0,
      status: "active",
    };
    const built = buildPlanForGoal(preview, curated);
    const week = built.weeks[0];
    return {
      totalWeeks: built.totalWeeks,
      sessionsPerWeek: week ? week.days.filter((d) => d.focus !== "rest").length : 0,
      restDays: week ? week.days.filter((d) => d.focus === "rest").length : 0,
    };
  }, [created]);

  const assessment = created
    ? assessPeak(created.peak.elevationM, created.peak.lat, created.peak.lon)
    : null;

  const dayNames = WEEK.filter((w) => days.includes(w.day)).map((w) => w.label);
  const equipmentLabels = EQUIPMENT.filter((e) => equipment.includes(e.id)).map((e) => e.label);
  const band = ALTITUDE_BANDS.find((b) => b.id === altitudeId);
  const disciplineCount = disciplines.length;
  const namedLevels = disciplines
    .map((id) => {
      const option = DISCIPLINES.find((d) => d.id === id);
      const level = levels[id];
      return option && level
        ? `${option.label} · ${LEVELS.find((l) => l.id === level)?.label}`
        : "";
    })
    .filter(Boolean);

  return (
    <>
      <StepHead
        eyebrow="Your setup"
        title={["Here's what", "we built for you."]}
        subtitle="A starting plan, assembled from what you told us. It changes as you record sessions — nothing below is a prediction about a summit."
      />

      <div className="mt-8 rounded-card border border-hairline bg-graphite p-4">
        <p className="section-label text-azure/85">What your answers changed</p>

        <div className="mt-4">
          {created && plan && assessment ? (
            <>
              <Line
                label="Objective"
                value={`${created.peak.name} · ${fmtElevation(created.peak.elevationM)} m`}
                effect={`Created as an active goal and classed as ${assessment.label.toLowerCase()} from its elevation. That class is what your readiness is measured against.`}
              />
              <Line
                label="Target date"
                value={fmtDate(created.targetDate)}
                effect={
                  created.dateAssumed
                    ? "You said you were not sure, so ICEFALL assumed twelve months in order to have something to build backwards from. Replace the objective from Goals when the date firms up."
                    : "Everything below is built backwards from this date."
                }
              />
              <Line
                label="Plan length"
                value={`${plan.totalWeeks} weeks`}
                effect="Base, Build, Peak and Taper, laid out proportionally across those weeks, with a lighter week every fourth."
              />
              <Line
                label="Each week"
                value={`${plan.sessionsPerWeek} sessions · ${plan.restDays} rest`}
                effect="The shape of the generated week. The rest day is part of the plan, not a gap in it."
              />
            </>
          ) : (
            <Line
              label="Objective"
              value="None yet"
              effect="Nothing is withheld for this. Without a date there is nothing to build a plan backwards from, so ICEFALL has not invented one — add an objective in Goals whenever you have one, and everything else you told us still applies to it."
            />
          )}

          <Line
            label="Session length"
            value={`${sessionMin} min`}
            effect="Saved to your profile. It does not yet shorten a prescribed session — the session screen is where you rebuild one around the time you have."
          />

          <Line
            label="Training days"
            value={dayNames.length > 0 ? dayNames.join(", ") : "Not stated"}
            effect={
              dayNames.length > 0
                ? "Saved to your profile. The generated week is not yet cut to these days. If the plan asks for more days than you have, move what you can and leave the rest — a missed session is not a debt."
                : "Nothing recorded, and nothing is lost by it — the generated week is the same either way."
            }
          />

          <Line
            label="Equipment"
            value={equipmentLabels.length > 0 ? equipmentLabels.join(", ") : "Not stated"}
            effect={
              equipmentLabels.length > 0
                ? "Your sessions will only prescribe movements this kit can do. Anything needing something else is substituted or left out."
                : "You told us nothing, so sessions are built as normal and carry a note that they assume the movements are available. That is the honest reading of silence — not that you own nothing."
            }
          />

          <Line
            label="Technical skills"
            value={skills.length > 0 ? `${skills.length} reported` : "None reported"}
            effect={
              skills.length > 0
                ? "Checked one by one against what your objective's class of ground demands. Self-declared, so the score is capped well short of full marks — and a guide will form their own view regardless."
                : "Technical readiness stays unscored rather than guessed. Nothing is marked against you for it; it is simply not something ICEFALL can see."
            }
          />

          <Line
            label="Highest altitude"
            value={band ? band.label : "Not stated"}
            effect={
              band && band.lowerM > 0
                ? `Used as a floor of ${fmtElevation(band.lowerM)} m for altitude readiness — never as a claim that you are acclimatised now.`
                : "No altitude floor is recorded, so altitude readiness stays unreported until a recorded session or a logged summit gives ICEFALL one."
            }
          />

          <Line
            label="Disciplines"
            value={disciplineCount > 0 ? `${disciplineCount} selected` : "None"}
            effect={
              namedLevels.length > 0
                ? `${namedLevels.join(" · ")}. Shown alongside your readiness as context in your own words, and deliberately not turned into a number.`
                : "Nothing recorded, and nothing downstream depends on it."
            }
          />

          {/*
            THE THREE LINES BELOW EXIST BECAUSE THIS PANEL IS TITLED "WHAT YOUR
            ANSWERS CHANGED", AND TWO OF THEM CHANGED NOTHING.

            Leaving them off would let the panel read as though every question
            fed the plan. Two of these did not, and the honest thing is to say
            so on the same screen and in the same shape as the answers that did
            — a question whose payoff line is "nothing" is a question whose
            screen already told you that, and this is where it is proved rather
            than promised.

            `sexAtBirth` is the exception among the three, and its line is the
            one that has to be exact: the sex term of the resting-energy
            equation, and nothing else. No weight, no body composition, no
            target — see `coach/nutrition.ts`.

            ITS LINE IS PRESENT TENSE AND NOW EARNS IT. The panel is titled
            "what your answers changed", and for one release this line said the
            answer narrowed the estimate by 166 kcal while nothing carried it to
            the estimate at all — the panel's own promise, broken on the panel.
            `AppState.completeOnboarding` writes it to the fuel record now, so
            the sentence describes something that happens. The figure is gone
            for the separate reason given at the step above: 166 is Mifflin-St
            Jeor's resting intercept gap, not the width the day loses, and the
            real width is different for every athlete.

            AND IT BRANCHES ON THE OUTCOME, NOT ON THE ANSWER, which is the
            second half of the same repair. Writing the answer can be REFUSED —
            the phone may already hold one (`rememberSexForEnergy` will not
            overwrite it) or storage may reject the write — and this line read
            `sexAtBirth`, the tap, so it announced a narrowing in both of those
            cases too. The one that made it urgent is a shared phone: signing out
            keeps everything on the device by design, so the second person to
            sign in meets the first person's answer, and a woman signing in after
            a man was being told her estimate had moved to her own answer while
            it sat at the male intercept. `completeOnboarding` returns which of
            the five states happened and the panel reports that instead.

            EVERY BRANCH POINTS AT THE FUEL SCREEN, because that is the only
            place an answer already on the phone can be changed, and a person
            told "this changed nothing" without being told where to go has been
            informed and stranded.
          */}
          <Line
            label="Gender"
            value={GENDERS.find((g) => g.id === gender)?.label ?? "Not asked"}
            effect="Recorded on your account and read by nothing — no session, no plan, no readiness figure, no estimate. If that ever changes, this line changes with it."
          />

          <Line
            label="Sex at birth"
            value={SEXES.find((s) => s.id === sexAtBirth)?.label ?? "Not asked"}
            effect={SEX_PAYOFF[sexNarrowing]}
          />

          <Line
            label="Where you found ICEFALL"
            value={HEARD_ABOUT.find((h) => h.id === heardAbout)?.label ?? "Not asked"}
            effect="Nothing about your plan depends on this. It is counted, alongside everyone else's answer, so one person can decide where to spend their time — and it is never checked against anything, so it is a record of what people remembered."
          />
        </div>
      </div>

      <div className="mt-5 rounded-card border border-hairline bg-graphite p-4">
        <p className="section-label text-azure/85">Why the skills and altitude questions mattered</p>
        <p className="mt-3 text-[12px] leading-relaxed text-mist">
          Nothing in a training feed says whether you can move on crampons, travel roped on a
          glacier or get a partner out of a crevasse — and no amount of volume implies it. The same
          is true of altitude. So when ICEFALL is not told, it withholds those parts of a mountain
          readiness assessment rather than filling them in, and it says which part is missing. Your
          answers are what let it give you a whole assessment instead of a hole in one.
        </p>
      </div>

      <Disclaimer className="mt-6">
        This is a starting point, not a guarantee, and it adapts as you record real sessions.
        ICEFALL does not give medical advice and never asks you to train through pain.
        {assessment?.requiresGuide
          ? ` ${created?.peak.name} is glaciated or technical ground: engage a certified guide (IFMGA/UIAGM) or a reputable operator, and learn the skills in person.`
          : ""}
      </Disclaimer>
    </>
  );
}

/**
 * One measurement.
 *
 * Every field says what it is used for, including the ones that are used for
 * nothing yet — asking for a number and not saying why is how an onboarding
 * flow starts feeling like a form.
 *
 * `privacy`, where offered, renders "Prefer not to say" as a control INSIDE the
 * field: an explicit answer, mutually exclusive with typing a number, stored as
 * the answer given. A field left blank is unanswered and blocks Next; a field
 * declined is answered. The two must never look the same (§6ag).
 */
function NumberField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  note,
  privacy,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  note: string;
  privacy?: { on: boolean; toggle: () => void };
}) {
  return (
    <label
      className={cn(
        "block rounded-tile border px-4 py-3 transition-colors focus-within:border-azure/50",
        privacy?.on ? "border-azure/40 bg-azure/[0.05]" : "border-hairline bg-elevated/40",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] uppercase tracking-[0.1em] text-mist-dim">{label}</span>
        <span className="flex items-baseline gap-1.5">
          <input
            inputMode="numeric"
            value={value}
            disabled={privacy?.on === true}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder={privacy?.on ? "—" : placeholder}
            className="w-[74px] bg-transparent text-right text-[19px] font-light text-snow outline-none placeholder:text-mist-dim/60 disabled:opacity-50"
          />
          {unit && <span className="text-[12px] text-mist-dim">{unit}</span>}
        </span>
      </span>
      <span className="mt-1.5 block text-[11px] leading-relaxed text-mist-dim">{note}</span>
      {privacy && (
        <button
          type="button"
          onClick={privacy.toggle}
          aria-pressed={privacy.on}
          className={cn(
            "mt-2.5 rounded-full border px-3 py-1 text-[11px] transition-colors",
            privacy.on
              ? "border-azure/60 bg-azure/10 text-azure"
              : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
          )}
        >
          {privacy.on ? "Prefer not to say — your answer" : "Prefer not to say"}
        </button>
      )}
    </label>
  );
}
