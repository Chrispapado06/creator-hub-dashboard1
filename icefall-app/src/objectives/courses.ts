import { ATHLETE_SKILLS, SKILL_LABEL, type AthleteSkillId } from "@/objectives/requirements";

/**
 * WHAT KIND OF COURSE TEACHES A COMPETENCE — AND NOT ONE PLACE THAT RUNS ONE.
 *
 * ============================================================================
 * READ THIS BEFORE ADDING A PROVIDER, A PRICE OR A DATE
 * ============================================================================
 *
 * ICEFALL HAS NO COURSE CATALOGUE. There is no table of schools, no listing
 * feed, no partner, no commission agreement and no verified provider anywhere
 * in this codebase. That is the finished state of this file, not an unfinished
 * one, and `NO_LISTINGS_NOTICE` is what the app says instead of a list.
 *
 * The temptation here is obvious and it is the one the roadmap's rule 2 exists
 * to stop. "A missing skill leads to a course recommendation" reads like an
 * instruction to produce three cards with names on them, and a model asked to
 * fill this file would happily invent a plausible alpine school in Chamonix
 * with a plausible price. An athlete would ring it. Nothing in this file may
 * ever name a business, a school, a guide, a town, a price or a date.
 *
 * ============================================================================
 * WHAT IS SAFE TO SAY, AND WHY IT IS DIFFERENT
 * ============================================================================
 *
 * A COURSE TYPE IS NOT A PROVIDER. "A glacier travel and crevasse rescue
 * course" is the generic name of a thing that exists everywhere mountaineering
 * is taught — it is what an athlete types into a search box, and giving them
 * the right words is real help with no claim attached. The entries below are
 * those words, plus one sentence of what such a course covers.
 *
 * THERE ARE NO NUMBERS IN THIS FILE. No durations, no prices, no "typically
 * three days". Those vary by country, season and provider, and an approximate
 * figure in an app reads as a fact. The house line on who is qualified to teach
 * — an IFMGA/UIAGM-certified guide or a nationally qualified instructor — is
 * already the language `mountainReadiness` uses, and it names a STANDARD rather
 * than a person.
 *
 * ============================================================================
 * COVERAGE IS TOTAL, AND A TEST ENFORCES IT
 * ============================================================================
 *
 * Every one of the fifteen competences in `ATHLETE_SKILLS` maps to exactly one
 * course type. That is checked by `skillGaps.test.ts`, because the failure mode
 * of a gap is silent: a skill with no course type would render as "no course
 * type recorded for this", which reads as ICEFALL having nothing to say when in
 * fact somebody forgot a line.
 */

export const COURSE_TYPE_IDS = [
  "navigation",
  "scrambling",
  "winter-skills",
  "glacier-and-crevasse-rescue",
  "alpine-mountaineering",
  "expedition-skills",
  "mountain-first-aid",
] as const;

export type CourseTypeId = (typeof COURSE_TYPE_IDS)[number];

export interface CourseType {
  id: CourseTypeId;
  /** The generic name of the course. What you would search for. NOT a product. */
  name: string;
  /** Which of the fifteen competences it teaches. */
  covers: AthleteSkillId[];
  /** One sentence on what such a course covers. No durations, no prices. */
  what: string;
  /** Who is qualified to teach it, BY STANDARD. Never a named person or business. */
  taughtBy: string;
}

const GUIDE_OR_INSTRUCTOR =
  "an IFMGA/UIAGM-certified guide, or an instructor holding your country's national mountaineering qualification";

export const COURSE_TYPES: readonly CourseType[] = [
  {
    id: "navigation",
    name: "Navigation course",
    covers: ["navigation-poor-visibility"],
    what: "Map, compass and relocation when you cannot see, and knowing when the answer is to turn round rather than to navigate harder.",
    taughtBy: GUIDE_OR_INSTRUCTOR,
  },
  {
    id: "scrambling",
    name: "Scrambling course",
    covers: ["scrambling-i-ii", "comfort-with-exposure", "rockfall-awareness"],
    what: "Moving on easy rock with and without a rope, route finding on broken ground, and reading where rock comes down and who is underneath it.",
    taughtBy: GUIDE_OR_INSTRUCTOR,
  },
  {
    id: "winter-skills",
    name: "Winter skills course",
    covers: ["crampon-and-axe", "self-arrest"],
    what: "Walking in crampons, using an axe, cutting and kicking steps, and stopping yourself on steep snow before you are going fast.",
    taughtBy: GUIDE_OR_INSTRUCTOR,
  },
  {
    id: "glacier-and-crevasse-rescue",
    name: "Glacier travel and crevasse rescue course",
    covers: ["roped-glacier-travel", "crevasse-rescue"],
    what: "Rope systems for moving as a team on a glacier, holding a fall, building an anchor in snow, and hauling somebody out of a hole.",
    taughtBy: GUIDE_OR_INSTRUCTOR,
  },
  {
    id: "alpine-mountaineering",
    name: "Alpine mountaineering course",
    covers: ["rope-work-mixed", "snow-and-serac-hazard"],
    what: "Moving together and pitching on mixed ground fast enough to matter, plus judging snow stability and what is hanging above a line.",
    taughtBy: GUIDE_OR_INSTRUCTOR,
  },
  {
    id: "expedition-skills",
    name: "Expedition skills course",
    covers: ["staged-acclimatisation", "fixed-line", "supplementary-oxygen"],
    what: "Living and moving high: ascending and descending fixed line with jumar and rappel device, oxygen systems, and how a rotation schedule is built.",
    taughtBy: GUIDE_OR_INSTRUCTOR,
  },
  {
    id: "mountain-first-aid",
    name: "Mountain first aid and altitude medicine course",
    covers: ["recognising-ams", "cold-injury-prevention"],
    what: "Spotting altitude illness early and acting on it, preventing and treating cold injury, and casualty care where help is hours away.",
    taughtBy:
      "a recognised wilderness or mountain first aid provider; altitude medicine is usually taught by a doctor with expedition experience",
  },
];

/** The course type that teaches a competence, or undefined if none is mapped. */
export function courseTypeFor(skillId: AthleteSkillId): CourseType | undefined {
  return COURSE_TYPES.find((c) => c.covers.includes(skillId));
}

/** Every competence a course type covers, as the labels the athlete ticked. */
export function courseCoversLabels(course: CourseType): string[] {
  return course.covers.map((id) => SKILL_LABEL[id] ?? id);
}

/** Competences with no course type. Should always be empty — the test checks it. */
export function skillsWithoutCourseType(): AthleteSkillId[] {
  return ATHLETE_SKILLS.map((s) => s.id).filter((id) => courseTypeFor(id) === undefined);
}

/**
 * What the app says instead of a list of courses.
 *
 * This is the honest empty state the brief demands: name the kind of course,
 * say who is qualified to teach it, and say plainly that ICEFALL is not the one
 * telling you where to go.
 */
export const NO_LISTINGS_NOTICE =
  "ICEFALL does not list courses. There is no catalogue of schools, dates or prices in the app, and nothing here is a recommendation of any particular provider — this is the name of the kind of course that teaches this, so you know what to look for. Check the qualification of whoever is teaching it before you book.";

/** Shown once above the whole section, so the empty state is not a surprise. */
export const COURSE_SECTION_INTRO =
  "A competence is learned in person, from somebody qualified. No amount of training volume substitutes for it, and neither does an app.";
