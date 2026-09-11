/**
 * THE ANSWER VOCABULARIES — one list per question, read by every screen that
 * asks it or shows it back.
 *
 * ── WHY THESE MOVED OUT OF `screens/Onboarding.tsx` ─────────────────────────
 *
 * They lived there because the signup questionnaire was the only place that
 * asked. It is not any more: `screens/settings/CoachingProfile.tsx` lets an
 * athlete change an answer afterwards, and the two screens have to be asking
 * the SAME question — the same options, the same ids, the same notes under
 * them. A second copy of `EQUIPMENT` or `ALTITUDE_BANDS` in the edit screen
 * would be a vocabulary that drifts silently: the ids are what the engines read
 * (`coach/sessions.ts` reads the equipment union, `mountainReadiness` reads the
 * altitude floor, `services/acclimatisation.ts` reads the illness id), so a
 * label edited in one place and not the other is two different questions
 * writing one field.
 *
 * NOTHING WAS REWRITTEN IN THE MOVE. Every list, every id and every comment
 * below is the one that was in the signup file; the arguments they make are
 * still the arguments for the shape they have, and they now apply to both
 * screens rather than to one.
 *
 * WHAT IS NOT HERE, AND WHY: the objective picker's curated suggestions
 * (`SUGGESTIONS`), which read the mountain repository at module scope and are
 * signup's alone, and the gender / sex-at-birth / heard-about lists, which the
 * edit screen deliberately does not offer — see that file for the reason each
 * one is not editable.
 */
import {
  Anchor,
  Bike,
  Compass,
  Footprints,
  MoreHorizontal,
  MountainSnow,
  Snowflake,
  Wind,
} from "lucide-react";

import type { Equipment } from "@/coach/exercises";
import type { MovementExperience } from "@/coach/sessions";
import type { Discipline, ExperienceLevel } from "@/types";

export type Level = "beginner" | "intermediate" | "advanced" | "expert";

export const LEVELS: { id: Level; label: string }[] = [
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
export interface DisciplineOption {
  id: string;
  label: string;
  icon: typeof Footprints;
  /** Present when this maps onto the app's own `Discipline` union. */
  discipline?: Discipline;
}

export const DISCIPLINES: DisciplineOption[] = [
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
export const LEVEL_TO_EXPERIENCE: Record<Level, ExperienceLevel> = {
  beginner: "new",
  intermediate: "developing",
  advanced: "experienced",
  expert: "advanced",
};

export const TIMELINES: { id: string; label: string; months: number; assumed?: boolean }[] = [
  { id: "6m", label: "Within 6 months", months: 6 },
  { id: "1y", label: "Within a year", months: 12 },
  { id: "2y", label: "Within two years", months: 24 },
  // A plan has to be built backwards from a date, so "not sure" still needs
  // one. Twelve months is used and the payoff screen says it was assumed.
  { id: "unsure", label: "Not sure yet", months: 12, assumed: true },
];

/** JS day indices, Monday first. `CoachProfile.trainingDays` is 0 = Sunday. */
export const WEEK: { day: number; label: string; full: string }[] = [
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
export function isoDayKey(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bare `YYYY-MM-DD` → local `Date`, or null. Strict: rejects 2027-02-31. */
export function parseIsoDayLocal(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export const SESSION_LENGTHS = [30, 45, 60, 90, 120];

/** Labels for the real `Equipment` union — see src/coach/exercises.ts. */
/*
 * `LIMITATIONS` — what ICEFALL must train AROUND, owner addition 2026-09-01 —
 * moved to @/coach/limitations on 2026-09-11, when the session engine started
 * reading the same ids. The boundary it enforces, and why these categories are
 * deliberately broad, is written at the top of that file.
 */

/** Where the athlete is starting FROM, not where they are going. */
export const BASELINES: { id: string; label: string; note: string }[] = [
  { id: "none", label: "Not training right now", note: "The plan starts from here, and builds." },
  { id: "occasional", label: "Occasionally", note: "Less than once a week." },
  { id: "1-2", label: "1–2 days a week", note: "" },
  { id: "3-4", label: "3–4 days a week", note: "" },
  { id: "5-plus", label: "5+ days a week", note: "" },
];

/**
 * Strength and gym experience — the one answer that moves the difficulty
 * ceiling in a prescribed session.
 *
 * WHY THIS IS NOT THE EXPERIENCE STEP ABOVE. That one asks how experienced the
 * athlete is at hiking, climbing, ski touring; `coach/sessions.ts` has always
 * refused to read it, because "twenty years on alpine ground" says nothing
 * about whether somebody has ever held a barbell, and treating it as if it did
 * is how a confident mountaineer gets handed a Nordic curl in week one. The
 * two are different claims and ICEFALL keeps them apart.
 *
 * THE IDS ARE THE ENGINE'S OWN UNION, not a local vocabulary mapped onto it —
 * `MovementExperience` in `coach/sessions.ts`. A mapping table here is the
 * exact thing this question exists to remove.
 *
 * "unstated" is the decline, and it is a real answer rather than a skip: the
 * generator caps difficulty at moderate when nothing was said and puts that
 * cap in the session's own cautions, so nobody is worse off for giving it. It
 * needs no flag in `OnboardingDeclined` — the answers blob carries `null`,
 * which is already distinct from the field being absent (§6ag).
 */
export const MOVEMENT_LEVELS: {
  id: MovementExperience | "unstated";
  label: string;
  note: string;
}[] = [
  {
    id: "beginner",
    label: "Little or none",
    note: "New to it, or coming back after a long time away.",
  },
  {
    id: "intermediate",
    label: "Some, on and off",
    note: "You can follow a session without being coached through every movement.",
  },
  {
    id: "advanced",
    label: "Regularly, and confidently",
    note: "Squatting, hinging, pressing and pulling under load are all familiar.",
  },
  {
    id: "expert",
    label: "Years of structured strength work",
    note: "Programmed training is already part of how you train.",
  },
  {
    id: "unstated",
    label: "Rather not say",
    note: "An answer, not a gap. Sessions stay capped at moderate difficulty and say so on the day.",
  },
];

/**
 * Altitude illness history. Constrains ascent-rate guidance; diagnoses nothing.
 *
 * "Never been high enough to know" is a real and common answer, and collapsing
 * it into "never" would turn an absence of exposure into a clean record.
 */
export const ALTITUDE_ILLNESS: { id: string; label: string; note: string }[] = [
  { id: "never", label: "Never", note: "Been to altitude and had no trouble." },
  { id: "mild", label: "Mild", note: "Headache, poor sleep, loss of appetite." },
  { id: "serious", label: "Serious", note: "HAPE or HACE, or a descent for symptoms." },
  { id: "unknown", label: "Never been high enough to know", note: "Not the same as never." },
];

/**
 * "Bodyweight only" against everything else.
 *
 * The other tiles are a list of things you own and any of them can be true at
 * once. "Bodyweight only" is not another item on that list — it is a statement
 * that the list is empty, so it cannot be true beside a barbell. Until this
 * function it could: the tile was a plain toggle, and `["none", "barbell"]`
 * sailed through the gate. The engine reads "none" as a no-op when other kit is
 * listed (`kitAvailable` in `coach/sessions.ts`), so that athlete was prescribed
 * barbell work under a plan-building screen saying "Nothing that needs kit you
 * do not have" — a screen contradicting the session it just built.
 *
 * The rule is enforced HERE, in the handler, rather than left to the copy
 * beneath the tiles. Three other steps in this flow already do it this way:
 * the days step, the skills step and the train-around step all clear the other
 * side when their "none" is picked. Copy that discourages a tap is not a rule.
 */
export function pickEquipment(current: Equipment[], id: Equipment): Equipment[] {
  if (id === "none") return current.includes("none") ? [] : ["none"];
  const real = current.filter((e) => e !== "none");
  return real.includes(id) ? real.filter((e) => e !== id) : [...real, id];
}

export const EQUIPMENT: { id: Equipment; label: string; note?: string }[] = [
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
export const SKILL_GROUPS: { title: string; skills: string[] }[] = [
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
export const ALTITUDE_BANDS: { id: string; label: string; lowerM: number }[] = [
  { id: "b0", label: "Under 1,000 m", lowerM: 0 },
  { id: "b1", label: "1,000 – 3,000 m", lowerM: 1000 },
  { id: "b2", label: "3,000 – 4,500 m", lowerM: 3000 },
  { id: "b3", label: "4,500 – 6,000 m", lowerM: 4500 },
  { id: "b4", label: "Above 6,000 m", lowerM: 6000 },
];
