import { MOUNTAINS } from "@/data/mock/mountains";
import type {
  ObjectiveRequirementSet,
  RequirementReview,
  StructuredRequirement,
} from "@/objectives/requirements";
import type { Mountain } from "@/types";

/**
 * THE FOURTEEN, AND WHAT IS ACTUALLY KNOWN ABOUT WHAT THEY ASK.
 *
 * ============================================================================
 * READ THIS BEFORE ADDING A NUMBER TO THIS FILE
 * ============================================================================
 *
 * Every record below is `reviewed: false` with an empty requirement list, and
 * that is the finished state of this step, not an unfinished one.
 *
 * `objectives/requirements.ts` gives the app a shape that can say "this
 * mountain asks for a 1,400 m day" or "this route asks for AD-". Filling that
 * shape in is a MOUNTAINEERING judgement. Nobody on the build side of ICEFALL
 * is qualified to make it, a language model is less qualified still, and the
 * roadmap's own answer — "have 2–3 certified guides review them" — names people
 * who have not yet been appointed. So the shape ships empty and readiness keeps
 * doing exactly what it did before: assessing against the class of mountain the
 * elevation puts a peak in, and saying so.
 *
 * If you are about to add a threshold here because it "looks about right", stop.
 * A wrong figure in this file is not a display bug. Too low, and the app tells
 * somebody they are ready for the Matterhorn. Too high, and it tells a
 * competent climber to stay at home. The type will not stop you — but
 * `validateRequirementSet` will refuse a structured requirement on an unsigned
 * set, and `requirements.test.ts` runs it over all fourteen.
 *
 * ============================================================================
 * WHY THERE IS NO PROSE IN THIS FILE
 * ============================================================================
 *
 * The migration the roadmap asks for — carry the existing free text across
 * unchanged — is done by READING it off the `Mountain` record at the bottom of
 * this file, not by copying it here. A copy would be a second version of the
 * same sentences, and the two would drift the first time somebody edited the
 * mountain page. Reading it means `sourceText` is the prose, by construction,
 * for ever.
 */

/** What a guide fills in. The prose half is supplied by the mountain record. */
interface RequirementDraft {
  review: RequirementReview;
  requirements: StructuredRequirement[];
  /** Set only where a guide scoped their review to one named route. */
  routeName?: string;
}

/**
 * The state every record is in today, in one place so it reads identically on
 * all fourteen and so appointing the guides is a single edit per mountain.
 */
const AWAITING_REVIEW: RequirementReview = {
  reviewed: false,
  awaiting:
    "No certified guide has been appointed to review this mountain's requirements yet, so ICEFALL holds no figures for it.",
};

const draft = (): RequirementDraft => ({ review: AWAITING_REVIEW, requirements: [] });

/**
 * One entry per curated mountain.
 *
 * Written out rather than generated from `MOUNTAINS` so that the set of
 * objectives ICEFALL claims to have a requirements record for is explicit and
 * diffable. `requirements.test.ts` asserts the two lists match — a new mountain
 * added to the catalogue with no entry here is a gap somebody should see.
 */
const DRAFTS: Record<string, RequirementDraft> = {
  everest: draft(),
  k2: draft(),
  "broad-peak": draft(),
  kilimanjaro: draft(),
  annapurna: draft(),
  "mont-blanc": draft(),
  matterhorn: draft(),
  denali: draft(),
  aconcagua: draft(),
  eiger: draft(),
  "gran-paradiso": draft(),
  "mount-olympus": draft(),
  triglav: draft(),
  toubkal: draft(),
};

/** The ids this file covers, for the review sheet and the test. */
export const REQUIREMENT_OBJECTIVE_IDS: readonly string[] = Object.keys(DRAFTS);

/**
 * The requirement set for a curated mountain.
 *
 * Takes the `Mountain` rather than an id wherever the caller already has one,
 * so a record that came from the server rather than the bundled catalogue
 * carries ITS prose into `sourceText` — the athlete then sees the requirements
 * reviewed against the words they were actually shown.
 */
export function requirementSetFor(
  mountain: Mountain | undefined | null,
): ObjectiveRequirementSet | undefined {
  if (!mountain) return undefined;
  const entry = DRAFTS[mountain.id];
  if (!entry) return undefined;

  return {
    objectiveId: mountain.id,
    objectiveName: mountain.name,
    routeName: entry.routeName,
    // The migration, done by reference. These three arrays and this string are
    // the mountain page's own copy, unedited and unsummarised.
    sourceText: {
      technical: mountain.technicalRequirements,
      experience: mountain.requiredExperience,
      training: mountain.trainingRequirements,
    },
    requirements: entry.requirements,
    review: entry.review,
  };
}

/** The same, for a caller holding only an id. Falls back to the catalogue. */
export function requirementSetById(id: string | undefined | null): ObjectiveRequirementSet | undefined {
  if (!id) return undefined;
  return requirementSetFor(MOUNTAINS.find((m) => m.id === id));
}
