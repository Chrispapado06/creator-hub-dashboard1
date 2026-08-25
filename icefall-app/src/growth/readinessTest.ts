import type { CoachProfile } from "@/state/AppState";

/**
 * The free Readiness Test — questions, answers, and what they are allowed to
 * become.
 *
 * This module is the top of the funnel's data layer. The screen at
 * `src/screens/growth/ReadinessTest.tsx` collects the answers; the result
 * screen at `/readiness-result` reads them back. Both go through here so a band
 * cannot mean one thing on the way in and another on the way out.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: everything here is SELF-REPORTED. Not
 * one figure below was measured by ICEFALL — no session was recorded, no sensor
 * was read, nothing was verified. `mountainReadiness.selfReportedFitness`
 * already refuses to score a self-report above 70 for exactly this reason, and
 * every screen built on these answers must label them the same way. A number
 * derived from a stranger's own estimate, presented as though the app observed
 * it, would be the most consequential lie this product could tell.
 *
 * Two deliberate absences, both worth defending:
 *
 *   · WEEKLY ASCENT is not asked. `assessObjectiveReadiness` will take it, but
 *     the test is capped at ten questions and a weekly-vertical figure cannot be
 *     derived from weekly HOURS without inventing a climb rate. The requirement
 *     comes back as "Not answered", which is the truth, and the fitness score
 *     renormalises over what was answered rather than treating it as a zero.
 *   · TRAINING DAYS. The availability question asks how many days a week, not
 *     which ones, so nothing here may be written to `CoachProfile.trainingDays`
 *     — that field is a list of weekday indices, and filling it from a count
 *     would put sessions on days nobody named.
 */

/* -------------------------------------------------------------------------- */
/* Questions                                                                   */
/* -------------------------------------------------------------------------- */

export type ReadinessQuestionId =
  | "mountaineering"
  | "weeklyHours"
  | "running"
  | "hiking"
  | "biggestDayAscent"
  | "strength"
  | "longestDay"
  | "packWeight"
  | "altitude"
  | "availability";

/** The unit an option's `value` is expressed in. */
export type ReadinessUnit = "rung" | "hours" | "km" | "metres" | "sessions" | "kg" | "days";

/** The four rungs `CoachProfile.disciplineExperience` recognises. */
export type ExperienceRung = "beginner" | "intermediate" | "advanced" | "expert";

export interface ReadinessOption {
  id: string;
  label: string;
  /**
   * The LOWER BOUND of the band this option represents, in the question's unit.
   *
   * Lower bound, never a midpoint and never the top of the band: "1,000 – 1,500
   * m" is stored as 1000 because 1,000 m is the only thing the athlete has
   * actually told us they have done. Taking 1,250 would be inventing 250 m of
   * ascent nobody claimed.
   */
  value: number;
  /**
   * The experience rung this answer maps onto, where the question is a ladder
   * rather than a quantity. Declared here, beside the label, so the mapping is
   * auditable data rather than a judgement buried in a function.
   */
  rung?: ExperienceRung;
}

export interface ReadinessQuestion {
  id: ReadinessQuestionId;
  eyebrow: string;
  prompt: string;
  /** What ICEFALL does with the answer, or what it deliberately does not do. */
  note?: string;
  unit: ReadinessUnit;
  options: ReadinessOption[];
}

/**
 * Ten questions, multiple choice, no free text.
 *
 * Every question offers an answer that claims nothing — "None yet", "Not
 * running at the moment", "Under 500 m". That is not padding: a test that
 * forces someone to pick the lowest flattering option is a test that collects
 * overstatements, and an overstatement here becomes a readiness score against a
 * glaciated mountain.
 */
export const READINESS_QUESTIONS: ReadinessQuestion[] = [
  {
    id: "mountaineering",
    eyebrow: "Mountaineering",
    prompt: "How much mountaineering have you done?",
    note: "Recorded as your own words. ICEFALL holds it as context and never scores it.",
    unit: "rung",
    options: [
      // No rung. "None yet" is an answer, but it is not experience to declare,
      // and writing "beginner" onto the profile would put a claim on the record
      // that the athlete did not make.
      { id: "none", label: "None yet", value: 0 },
      { id: "hills", label: "Hill walking on marked paths", value: 1, rung: "beginner" },
      {
        id: "scrambling",
        label: "Scrambling and non-glaciated summits",
        value: 2,
        rung: "intermediate",
      },
      {
        id: "guided",
        label: "Glaciated or alpine routes, with a guide",
        value: 3,
        rung: "intermediate",
      },
      { id: "independent", label: "Independent alpine routes", value: 4, rung: "advanced" },
      { id: "leading", label: "Leading technical alpine ground", value: 5, rung: "expert" },
    ],
  },
  {
    id: "weeklyHours",
    eyebrow: "Training now",
    prompt: "How many hours a week are you training at the moment?",
    unit: "hours",
    options: [
      { id: "h0", label: "Under 2 hours", value: 0 },
      { id: "h2", label: "2 – 4 hours", value: 2 },
      { id: "h4", label: "4 – 6 hours", value: 4 },
      { id: "h6", label: "6 – 10 hours", value: 6 },
      { id: "h10", label: "More than 10 hours", value: 10 },
    ],
  },
  {
    id: "running",
    eyebrow: "Running",
    prompt: "The furthest you could run today, without stopping.",
    unit: "km",
    options: [
      { id: "r0", label: "Not running at the moment", value: 0 },
      { id: "r5", label: "5 km", value: 5 },
      { id: "r10", label: "10 km", value: 10 },
      { id: "r21", label: "Half marathon", value: 21 },
      { id: "r42", label: "Marathon or beyond", value: 42 },
    ],
  },
  {
    id: "hiking",
    eyebrow: "Hiking",
    prompt: "The longest hill walk you could do comfortably this weekend.",
    unit: "km",
    options: [
      { id: "w0", label: "Not hiking at the moment", value: 0 },
      { id: "w5", label: "5 km", value: 5 },
      { id: "w10", label: "10 km", value: 10 },
      { id: "w20", label: "20 km", value: 20 },
      { id: "w30", label: "30 km or more", value: 30 },
    ],
  },
  {
    id: "biggestDayAscent",
    eyebrow: "Vertical",
    prompt: "The most ascent you have ever climbed in a single day.",
    note: "Compared against ICEFALL's training benchmark for the class of mountain you chose — not against the route, which ICEFALL does not hold.",
    unit: "metres",
    options: [
      { id: "a0", label: "Under 500 m", value: 0 },
      { id: "a500", label: "500 – 1,000 m", value: 500 },
      { id: "a1000", label: "1,000 – 1,500 m", value: 1000 },
      { id: "a1500", label: "1,500 – 2,000 m", value: 1500 },
      { id: "a2000", label: "Over 2,000 m", value: 2000 },
    ],
  },
  {
    id: "strength",
    eyebrow: "Strength",
    prompt: "Strength sessions in a normal week.",
    unit: "sessions",
    options: [
      { id: "s0", label: "None", value: 0 },
      { id: "s1", label: "One", value: 1 },
      { id: "s2", label: "Two", value: 2 },
      { id: "s3", label: "Three or more", value: 3 },
    ],
  },
  {
    id: "longestDay",
    eyebrow: "Longest day",
    prompt: "The longest you have kept moving in the mountains in one day.",
    unit: "hours",
    options: [
      { id: "d0", label: "Under 3 hours", value: 0 },
      { id: "d3", label: "3 – 6 hours", value: 3 },
      { id: "d6", label: "6 – 9 hours", value: 6 },
      { id: "d9", label: "9 – 12 hours", value: 9 },
      { id: "d12", label: "More than 12 hours", value: 12 },
    ],
  },
  {
    id: "packWeight",
    eyebrow: "Load",
    prompt: "The heaviest pack you have carried for a full day.",
    unit: "kg",
    options: [
      { id: "p0", label: "Under 5 kg", value: 0 },
      { id: "p5", label: "5 – 10 kg", value: 5 },
      { id: "p10", label: "10 – 15 kg", value: 10 },
      { id: "p15", label: "15 – 20 kg", value: 15 },
      { id: "p20", label: "Over 20 kg", value: 20 },
    ],
  },
  {
    id: "altitude",
    eyebrow: "Altitude",
    prompt: "The highest altitude you have been to.",
    note: "Held as history, not as a clearance. Acclimatisation is lost within weeks, and how a body responds to altitude changes from one trip to the next.",
    unit: "metres",
    options: [
      // The bottom band stores 0, which mountainReadiness ignores because it
      // requires an altitude above zero. That is correct: "never been above
      // 1,000 m" is an answer, but it is not a floor worth reasoning from.
      { id: "e0", label: "Under 1,000 m", value: 0 },
      { id: "e1000", label: "1,000 – 3,000 m", value: 1000 },
      { id: "e3000", label: "3,000 – 4,500 m", value: 3000 },
      { id: "e4500", label: "4,500 – 6,000 m", value: 4500 },
      { id: "e6000", label: "Above 6,000 m", value: 6000 },
    ],
  },
  {
    id: "availability",
    eyebrow: "Availability",
    prompt: "Days a week you can realistically train.",
    note: "How many days, not which days — ICEFALL will not assume a Tuesday you never named.",
    unit: "days",
    options: [
      { id: "v1", label: "One or two", value: 1 },
      { id: "v3", label: "Three", value: 3 },
      { id: "v4", label: "Four", value: 4 },
      { id: "v5", label: "Five", value: 5 },
      { id: "v6", label: "Six or more", value: 6 },
    ],
  },
];

export const READINESS_QUESTION_COUNT = READINESS_QUESTIONS.length;

export function questionById(id: ReadinessQuestionId): ReadinessQuestion {
  const q = READINESS_QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown readiness question: ${id}`);
  return q;
}

/* -------------------------------------------------------------------------- */
/* Answers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The objective, carried whole.
 *
 * Elevation and coordinates come from the curated ICEFALL table or from
 * OpenStreetMap via `searchPeaks` — never typed in by hand. Every downstream
 * assessment is derived from the elevation, so a plausible-looking guess here
 * would propagate into a readiness score, a class of mountain and a list of
 * skills, none of which would be about the mountain the athlete named.
 */
export interface ReadinessObjective {
  id: string;
  name: string;
  elevationM: number;
  lat: number;
  lon: number;
  /** Set when this is one of the curated ICEFALL mountains. */
  curatedId?: string;
  /** OSM `wikipedia` tag — resolves the peak's photograph. */
  wikipedia?: string;
  country?: string;
}

export const READINESS_TEST_VERSION = 1;

export interface ReadinessTestAnswers {
  version: number;
  objective: ReadinessObjective;
  /** LOCAL calendar date, YYYY-MM-DD. Never an ISO instant — see `daysUntil`. */
  targetDate: string;
  /** Question id → chosen option id. Bands only; there is no free text. */
  choices: Partial<Record<ReadinessQuestionId, string>>;
  /** ISO instant the test was completed. */
  completedAt: string;
}

/** Router state carried from the test to the result. */
export interface ReadinessResultNavState {
  answers: ReadinessTestAnswers;
}

export const READINESS_TEST_ROUTE = "/readiness-test";
export const READINESS_RESULT_ROUTE = "/readiness-result";

/**
 * Shown wherever a figure derived from this test appears.
 *
 * Not a footnote. The whole test is only defensible alongside it.
 */
export const READINESS_SELF_REPORT_NOTICE =
  "Every answer in this test is your own estimate. ICEFALL has measured nothing: no session has been recorded, no sensor has been read, and nothing has been verified. The result describes what you told it, and it is labelled self-reported wherever it appears.";

/** The planning-aid framing for the test itself. The result carries its own. */
export const READINESS_TEST_DISCLAIMER =
  "This is a planning aid, not a verdict on whether you are competent or safe to attempt a mountain, and it does not clear you to go. It is not medical advice. For anything glaciated, technical or at altitude, the assessment that counts is made in person by an IFMGA/UIAGM-certified guide.";

/* -------------------------------------------------------------------------- */
/* Reading an answer                                                           */
/* -------------------------------------------------------------------------- */

export function chosenOption(
  answers: ReadinessTestAnswers,
  id: ReadinessQuestionId,
): ReadinessOption | undefined {
  const optionId = answers.choices[id];
  if (optionId === undefined) return undefined;
  return questionById(id).options.find((o) => o.id === optionId);
}

/** The band's lower bound, or undefined when the question was not answered. */
export function bandValue(
  answers: ReadinessTestAnswers,
  id: ReadinessQuestionId,
): number | undefined {
  return chosenOption(answers, id)?.value;
}

export function isComplete(choices: Partial<Record<ReadinessQuestionId, string>>): boolean {
  return READINESS_QUESTIONS.every((q) => {
    const chosen = choices[q.id];
    return chosen !== undefined && q.options.some((o) => o.id === chosen);
  });
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date key from LOCAL date components.
 *
 * NEVER toISOString(): west of Greenwich it returns the previous day for most
 * of the evening, so an objective picked on the 3rd would be stored as the 2nd
 * and the countdown would read one day short. The same bug has already been
 * fixed twice in this codebase — see AppState's `monthKey` and `todayKey`.
 */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDateKey(key: string): Date | null {
  if (!DATE_KEY.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // Rejects 2027-02-31, which the Date constructor would silently roll into March.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Whole days from today to the target, both taken as LOCAL midnights.
 *
 * Rounded rather than floored or ceiled: both ends are local midnight, so the
 * only difference between them that is not a whole day is the one hour a
 * daylight-saving change adds or removes somewhere in the middle. Rounding
 * absorbs it; flooring would drop a day every spring for anyone in a DST zone.
 *
 * Negative when the date has passed. Callers decide what to say about that —
 * this function does not clamp, because clamping would present a date in the
 * past as "0 days to go".
 */
export function daysUntil(targetDate: string, now: Date = new Date()): number | null {
  const target = parseDateKey(targetDate);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "347 DAYS TO GO" — the countdown, stated as the fact it is. */
export function countdownLabel(days: number): string {
  if (days < 0) return "DATE PASSED";
  if (days === 0) return "TODAY";
  return `${days.toLocaleString("en-GB")} ${days === 1 ? "DAY" : "DAYS"} TO GO`;
}

/* -------------------------------------------------------------------------- */
/* Feeding the readiness assessment                                            */
/* -------------------------------------------------------------------------- */

/**
 * Matches the `selfReported` argument of `assessObjectiveReadiness`.
 *
 * Kept structurally identical on purpose: if that signature changes, the result
 * screen fails to compile rather than quietly passing a field nobody reads.
 */
export interface ReadinessSelfReport {
  technicalSkills?: string[];
  maxAltitudeM?: number;
  disciplineExperience?: Record<string, string>;
  fitness?: {
    weeklyAscentM?: number;
    biggestDayAscentM?: number;
    longestDayHours?: number;
  };
}

/**
 * The fitness half of the self-report.
 *
 * Only positive figures are passed. A band whose lower bound is zero says "less
 * than the smallest band", which is not a measurement of anything —
 * `mountainReadiness` treats an omitted figure as unanswered and renormalises,
 * whereas a zero would be scored as a genuine nil and drag the mean down as if
 * it had been measured.
 */
export function fitnessSelfReportFrom(
  answers: ReadinessTestAnswers,
): NonNullable<ReadinessSelfReport["fitness"]> {
  const ascent = bandValue(answers, "biggestDayAscent");
  const hours = bandValue(answers, "longestDay");
  return {
    ...(typeof ascent === "number" && ascent > 0 ? { biggestDayAscentM: ascent } : {}),
    ...(typeof hours === "number" && hours > 0 ? { longestDayHours: hours } : {}),
    // weeklyAscentM is deliberately absent — see the file header.
  };
}

/**
 * Everything this test can honestly hand to `assessObjectiveReadiness`.
 *
 * `profile` is the athlete's stored CoachProfile, when there is one: technical
 * skills are never asked here, so they can only come from onboarding, and
 * dropping them would make an experienced athlete's technical dimension vanish
 * because they took a free test.
 */
export function selfReportFrom(
  answers: ReadinessTestAnswers,
  profile?: Pick<CoachProfile, "technicalSkills" | "disciplineExperience" | "maxAltitudeM">,
): ReadinessSelfReport {
  const altitude = bandValue(answers, "altitude");
  const rung = chosenOption(answers, "mountaineering")?.rung;

  const disciplineExperience: Record<string, string> = { ...(profile?.disciplineExperience ?? {}) };
  if (rung) disciplineExperience.mountaineering = rung;
  else delete disciplineExperience.mountaineering;

  return {
    technicalSkills: profile?.technicalSkills,
    // The test's own answer wins over a stored one: it is the more recent
    // self-report, and a stale figure is not more trustworthy for being older.
    maxAltitudeM: typeof altitude === "number" ? altitude : profile?.maxAltitudeM,
    disciplineExperience,
    fitness: fitnessSelfReportFrom(answers),
  };
}

/**
 * The patch written to `CoachProfile` when the test completes.
 *
 * Only two fields, and both are things the athlete actually answered. NOTE what
 * is not here: `technicalSkills`, `availableEquipment` and `trainingDays` are
 * omitted entirely rather than set to empty — `updateCoachProfile` merges by
 * key, so passing an empty array would erase claims made during onboarding, and
 * a free test must never cost an athlete data they already gave.
 */
export function coachProfilePatchFrom(
  answers: ReadinessTestAnswers,
  existing: Pick<CoachProfile, "disciplineExperience">,
): Partial<CoachProfile> {
  const rung = chosenOption(answers, "mountaineering")?.rung;
  const disciplineExperience = { ...existing.disciplineExperience };

  if (rung) disciplineExperience.mountaineering = rung;
  // "None yet" removes a stored claim rather than leaving it standing. The
  // latest self-report is the one that counts, in both directions.
  else delete disciplineExperience.mountaineering;

  const altitude = bandValue(answers, "altitude");

  return {
    disciplineExperience,
    ...(typeof altitude === "number" ? { maxAltitudeM: altitude } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Its own record, not AppState.
 *
 * The test is taken before there is an account, before onboarding and possibly
 * before the athlete has decided anything. It gets a key of its own so a
 * refresh on the result screen loses nothing, and so clearing it later does not
 * touch a single thing the athlete has recorded.
 */
const STORAGE_KEY = "icefall.readiness-test.v1";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseObjective(v: unknown): ReadinessObjective | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const name = str(v.name);
  const elevationM = num(v.elevationM);
  const lat = num(v.lat);
  const lon = num(v.lon);
  // No defaults. A peak missing its elevation or position cannot be assessed,
  // and substituting a number would fabricate the mountain.
  if (!id || !name || elevationM === undefined || lat === undefined || lon === undefined) {
    return null;
  }
  return {
    id,
    name,
    elevationM,
    lat,
    lon,
    curatedId: str(v.curatedId),
    wikipedia: str(v.wikipedia),
    country: str(v.country),
  };
}

function parseChoices(v: unknown): Partial<Record<ReadinessQuestionId, string>> {
  const out: Partial<Record<ReadinessQuestionId, string>> = {};
  if (!isRecord(v)) return out;
  for (const q of READINESS_QUESTIONS) {
    const chosen = v[q.id];
    // An option id this build no longer offers is dropped rather than kept —
    // it would resolve to undefined at every read site anyway.
    if (typeof chosen === "string" && q.options.some((o) => o.id === chosen)) {
      out[q.id] = chosen;
    }
  }
  return out;
}

export function loadReadinessTest(): ReadinessTestAnswers | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    const objective = parseObjective(parsed.objective);
    const targetDate = str(parsed.targetDate);
    if (!objective || !targetDate || !parseDateKey(targetDate)) return null;

    return {
      version: num(parsed.version) ?? READINESS_TEST_VERSION,
      objective,
      targetDate,
      choices: parseChoices(parsed.choices),
      completedAt: str(parsed.completedAt) ?? new Date().toISOString(),
    };
  } catch {
    // Corrupt or unreadable — the caller shows the test again rather than a
    // result built on half a record.
    return null;
  }
}

export function saveReadinessTest(answers: ReadinessTestAnswers): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Private mode or quota. The flow still completes — the answers travel in
    // router state as well, so only a refresh loses them.
  }
}

export function clearReadinessTest(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Narrows `useLocation().state`, which is typed `unknown` by the router. */
export function isReadinessResultNavState(v: unknown): v is ReadinessResultNavState {
  if (!isRecord(v)) return false;
  const answers = v.answers;
  if (!isRecord(answers)) return false;
  const targetDate = str(answers.targetDate);
  return parseObjective(answers.objective) !== null && targetDate !== undefined;
}
