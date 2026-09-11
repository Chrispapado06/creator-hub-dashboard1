/**
 * WHAT A MOUNTAIN ASKS OF A PERSON, WRITTEN SO A MACHINE CAN CHECK IT.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * Today `assessObjectiveReadiness` compares an athlete against a CLASS of
 * mountain derived from elevation — `services/peakAssessment.ts` puts a peak in
 * one of seven bands and hands back the competences that band normally demands.
 * That is defensible and it is clearly labelled, but it has one consequence
 * nobody would defend if it were said out loud: the Matterhorn (4,478 m) and
 * any other 4,478 m summit on earth get an identical requirement list, because
 * elevation is the only input.
 *
 * Meanwhile the fourteen curated records in `data/mock/mountains.ts` already
 * carry human-written requirements — `technicalRequirements`,
 * `requiredExperience`, `trainingRequirements` — and they are prose. Prose is
 * for reading. Nothing can compare an athlete against "proven technical mixed
 * climbing above 7,500 m", because there is no field in it: no number, no unit,
 * and no way to say whether someone has it.
 *
 * This module is the missing shape. A requirement here is a thing with a KIND,
 * a VALUE, a UNIT and a SOURCE, and `objectives/compare.ts` can evaluate it.
 *
 * ============================================================================
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * ============================================================================
 *
 * IT SHIPS NO THRESHOLDS. Not one of the fourteen has a structured requirement
 * in it, and that is the correct state, not an unfinished one.
 *
 * Deciding that the Matterhorn's Hörnli ridge asks for a particular alpine
 * grade, or that Denali asks for a demonstrated single-day ascent under a
 * loaded pack, is a MOUNTAINEERING judgement. It is made by people who have
 * been on the ground with clients, and getting it wrong in either direction
 * hurts somebody: too low and the app waves a climber at a route that will kill
 * them, too high and it tells a competent person to stay home. A
 * plausible-looking number invented by a developer or a language model is
 * indistinguishable, on screen, from one a guide signed — which is precisely
 * why the app must never hold one.
 *
 * So the type below can express a threshold, the engine can check one, and the
 * data has none. The prose carries across into `sourceText` WORD FOR WORD (see
 * `data/mock/mountainRequirements.ts`, which reads it off the `Mountain` record
 * rather than copying it, so the two cannot drift), every record is
 * `reviewed: false`, and readiness keeps doing exactly what it does today until
 * a guide has filled the sheet in and signed it.
 *
 * ============================================================================
 * THE ONE RULE THIS FILE ENFORCES AS A TYPE
 * ============================================================================
 *
 * `RequirementReview` is a discriminated union, and its `reviewed: true` arm
 * requires a TUPLE of at least two named reviewers, each with a named
 * certification and the body that awarded it. It is therefore impossible to
 * write a reviewed requirement set without naming who reviewed it — not
 * difficult, not discouraged by a comment, impossible. The roadmap asks for
 * "2–3 certified guides"; this is that sentence compiled.
 */

/* -------------------------------------------------------------------------- */
/* The competences an athlete can actually report                             */
/* -------------------------------------------------------------------------- */

/**
 * The closed skill vocabulary.
 *
 * ⚠️ THESE LABELS MUST STAY WORD-FOR-WORD IDENTICAL TO `SKILL_GROUPS` IN
 * `src/coach/answers.ts`, which is what the athlete actually taps during
 * onboarding and in the coaching-profile editor. The stored profile holds
 * LABELS, not ids, so a copy edit on one side and not the other would silently
 * stop every skill requirement from ever being met — the worst kind of bug,
 * because the screen would keep rendering a tidy "not reported" instead of an
 * error. `requirements.test.ts` reads both files and fails on any drift.
 *
 * The ids exist so a guide's answer sheet can name a competence without
 * depending on our wording, and so `compare.ts` can do set membership rather
 * than the substring matching `mountainReadiness.skillClaimed` has to fall back
 * on. Substring matching is the right tool when one side is free text; it is
 * the wrong one once both sides are choosing from the same list.
 */
export const ATHLETE_SKILLS = [
  // Hill and scrambling ground
  { id: "navigation-poor-visibility", label: "Navigation in poor visibility" },
  { id: "scrambling-i-ii", label: "Grade I–II scrambling" },
  { id: "comfort-with-exposure", label: "Comfort with exposure" },
  { id: "rockfall-awareness", label: "Rockfall awareness" },
  // Snow, ice and glacier
  { id: "crampon-and-axe", label: "Crampon and ice-axe technique" },
  { id: "self-arrest", label: "Self-arrest on steep snow" },
  { id: "roped-glacier-travel", label: "Roped glacier travel" },
  { id: "crevasse-rescue", label: "Crevasse rescue" },
  { id: "rope-work-mixed", label: "Efficient rope work on mixed ground" },
  { id: "snow-and-serac-hazard", label: "Reading snow and serac hazard" },
  // Altitude and expedition
  { id: "staged-acclimatisation", label: "Staged acclimatisation" },
  { id: "recognising-ams", label: "Recognising acute mountain sickness" },
  { id: "cold-injury-prevention", label: "Cold-injury prevention" },
  { id: "fixed-line", label: "Fixed-line ascent and descent" },
  { id: "supplementary-oxygen", label: "Supplementary oxygen systems" },
] as const;

export type AthleteSkillId = (typeof ATHLETE_SKILLS)[number]["id"];

/** id → the exact label the athlete saw when they ticked it. */
export const SKILL_LABEL: Record<AthleteSkillId, string> = Object.fromEntries(
  ATHLETE_SKILLS.map((s) => [s.id, s.label]),
) as Record<AthleteSkillId, string>;

/**
 * Flattening used on BOTH sides of a skill comparison.
 *
 * The profile stores labels, a guide's sheet stores ids, and the two meet here.
 * It is lossy in exactly one direction — case, punctuation and the en dash in
 * "Grade I–II", so a hyphen typed instead of an en dash still matches. It does
 * not stem, truncate or fuzzy-match: two different competences must never
 * collide.
 */
export function skillKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** label → id, or undefined when the profile holds a label we no longer offer. */
export function skillIdForLabel(label: string): AthleteSkillId | undefined {
  const key = skillKey(label);
  return ATHLETE_SKILLS.find((s) => skillKey(s.label) === key)?.id;
}

/* -------------------------------------------------------------------------- */
/* Where a requirement came from                                              */
/* -------------------------------------------------------------------------- */

/**
 * Provenance for a single requirement, not for the set.
 *
 * A reviewed set can legitimately mix sources: a guide signs off the list, but
 * the permit rule underneath one line of it came from the park authority and
 * the grade from a guidebook. Recording that per requirement means the app can
 * always answer "who says so" about the specific line an athlete is failing,
 * which is the only form of that question anyone ever asks.
 *
 * `icefall-prose` is here so that nothing has to be laundered. If a guide
 * confirms a line ICEFALL wrote, it stays marked as ours with their signature
 * on the SET; it does not get promoted into a guidebook citation.
 */
export type RequirementSourceKind =
  | "guide-review"
  | "operator-listing"
  | "guidebook"
  | "official"
  | "icefall-prose";

export interface RequirementSource {
  kind: RequirementSourceKind;
  /** Named, never generic. "Elite Exped 2026 Ama Dablam prerequisites". */
  detail: string;
  url?: string;
  /** YYYY-MM-DD the source was read. A guidebook edition ages. */
  checkedOn?: string;
}

/* -------------------------------------------------------------------------- */
/* Grades                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The grade scales a requirement may be written in.
 *
 * Closed, because "5.6" means one thing on the YDS and nothing at all on the
 * UIAA, and a grade without its scale is not a grade. ICEFALL cannot check any
 * of these against an athlete today — see `compare.ts` — but a guide filling in
 * the sheet must still be able to write down what the route actually asks, and
 * the app must be able to show it with the scale attached.
 */
export type GradeScale =
  | "alpine-overall"
  | "uiaa-rock"
  | "french-rock"
  | "yds-rock"
  | "scottish-winter"
  | "wi-ice"
  | "m-mixed"
  | "ski-toponeige";

export const GRADE_SCALE_LABEL: Record<GradeScale, string> = {
  "alpine-overall": "Alpine overall grade (F–ED)",
  "uiaa-rock": "UIAA rock grade",
  "french-rock": "French rock grade",
  "yds-rock": "YDS rock grade",
  "scottish-winter": "Scottish winter grade",
  "wi-ice": "Water-ice grade (WI)",
  "m-mixed": "Mixed grade (M)",
  "ski-toponeige": "Toponeige ski grade",
};

/* -------------------------------------------------------------------------- */
/* A requirement                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The kinds of demand a requirement may express.
 *
 * Kept small on purpose. Each kind exists because there is either a real
 * athlete-side figure to compare it against, or an honest, specific reason why
 * there is not — and `compare.ts` gives that reason rather than a shrug. A kind
 * that could be neither checked nor honestly explained would be decoration.
 */
export type RequirementKind =
  | "skill"
  | "altitude-reached"
  | "single-day-ascent"
  | "single-day-duration"
  | "weekly-ascent"
  | "prior-summits"
  | "technical-grade"
  | "certification";

/**
 * The unit each kind is measured in.
 *
 * Bound to the kind by the union below, so there is no way to write a
 * single-day ascent in hours or a grade in metres. "none" belongs to
 * `certification` alone — a held qualification has no magnitude.
 */
export type RequirementUnit = "m" | "h" | "m-per-week" | "count" | "grade" | "skill" | "none";

interface RequirementBase {
  /** Stable within the set, so a review can be diffed and a row keyed. */
  id: string;
  /** What the athlete reads. Written as a demand, never as a verdict. */
  label: string;
  /**
   * Whether failing this stops the objective.
   *
   * `required` is load-bearing: `compare.ts` counts unmet required lines as
   * blockers, and a blocker is the thing a coach should talk about first.
   * Marking everything required makes the field useless, so the review sheet
   * asks the guide to choose per line.
   */
  necessity: "required" | "recommended";
  /** WHY the mountain asks this. The sentence a coach would say. */
  why: string;
  source: RequirementSource;
}

export type StructuredRequirement =
  | (RequirementBase & { kind: "skill"; unit: "skill"; skillId: AthleteSkillId })
  | (RequirementBase & { kind: "altitude-reached"; unit: "m"; metres: number })
  | (RequirementBase & { kind: "single-day-ascent"; unit: "m"; metres: number })
  | (RequirementBase & { kind: "single-day-duration"; unit: "h"; hours: number })
  | (RequirementBase & { kind: "weekly-ascent"; unit: "m-per-week"; metres: number })
  | (RequirementBase & {
      kind: "prior-summits";
      unit: "count";
      count: number;
      /** Summits only count towards this line at or above this elevation. */
      atOrAboveM: number;
    })
  | (RequirementBase & { kind: "technical-grade"; unit: "grade"; scale: GradeScale; grade: string })
  | (RequirementBase & { kind: "certification"; unit: "none"; certification: string });

/* -------------------------------------------------------------------------- */
/* Review                                                                     */
/* -------------------------------------------------------------------------- */

export interface RequirementReviewer {
  name: string;
  /** As awarded. "IFMGA/UIAGM Mountain Guide", "UIAA Alpine Instructor". */
  certification: string;
  /** The body that awarded it. "BMG", "SNGM", "Nepal National Mountain Guide Association". */
  awardedBy: string;
  /** Where the guide gives one. Not invented, not required. */
  licenceNumber?: string;
}

/**
 * Whether a human has signed this set off.
 *
 * A union rather than a boolean plus optional fields, because those two can
 * disagree. Here they cannot: `reviewed: true` carries its reviewers, and the
 * tuple type requires at least two of them. There is no way to construct a
 * reviewed set that nobody reviewed.
 */
export type RequirementReview =
  | {
      reviewed: false;
      /** Plain sentence for the screen. Says what is missing, not "TODO". */
      awaiting: string;
    }
  | {
      reviewed: true;
      /** At least two, per the roadmap. Enforced by the tuple, not by a comment. */
      reviewers: [RequirementReviewer, RequirementReviewer, ...RequirementReviewer[]];
      /** YYYY-MM-DD. */
      reviewedOn: string;
      /**
       * What exactly they signed. A guide who reviewed the normal route in
       * summer conditions has not signed the north face in winter, and the app
       * must be able to say so.
       */
      scope: string;
    };

/* -------------------------------------------------------------------------- */
/* A set                                                                      */
/* -------------------------------------------------------------------------- */

/** The prose a structured set replaces. Carried across, never rewritten. */
export interface RequirementSourceText {
  technical: string[];
  experience: string;
  training: string[];
}

export interface ObjectiveRequirementSet {
  /** The curated mountain id. */
  objectiveId: string;
  objectiveName: string;
  /**
   * The named route these requirements are for, where they are route-specific.
   * Undefined means "the normal way up this mountain", which is what every
   * requirement anybody writes actually means unless it says otherwise.
   */
  routeName?: string;
  /**
   * The human-written prose this set is derived from, verbatim.
   *
   * It is never edited here and never summarised. Two reasons: a guide
   * reviewing the structured fields needs to see what ICEFALL has been telling
   * people, and if a structured line ever contradicts the prose the app should
   * be able to show both rather than quietly having dropped one.
   */
  sourceText: RequirementSourceText;
  requirements: StructuredRequirement[];
  review: RequirementReview;
}

/* -------------------------------------------------------------------------- */
/* Usability                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether readiness may compare against this set.
 *
 *   missing     no record exists for this objective at all
 *   unreviewed  a record exists, no certified guide has signed it
 *   empty       signed, but it contains no structured requirement
 *   usable      signed and populated
 *
 * `empty` is not paranoia: a guide may legitimately return a sheet saying "I am
 * not willing to put numbers on this one", and the app must treat that as
 * "nothing to compare against" rather than as "this athlete meets every
 * requirement (0 of 0)". A zero-denominator pass is the exact failure this
 * codebase spends most of its comments preventing.
 */
export type RequirementSetState = "missing" | "unreviewed" | "empty" | "usable";

export function requirementSetState(
  set: ObjectiveRequirementSet | undefined | null,
): RequirementSetState {
  if (!set) return "missing";
  if (!set.review.reviewed) return "unreviewed";
  if (set.requirements.length === 0) return "empty";
  return "usable";
}

/** Narrowing guard, so a caller cannot read `reviewers` off an unreviewed set. */
export function isUsable(
  set: ObjectiveRequirementSet | undefined | null,
): set is ObjectiveRequirementSet & { review: Extract<RequirementReview, { reviewed: true }> } {
  return requirementSetState(set) === "usable";
}

/**
 * What the app says for each state. One phrasing across every screen.
 *
 * Note what none of these say: none claims a comparison happened, and none
 * implies the objective is easier or harder than the band assessment suggests.
 * They describe the state of ICEFALL's own homework.
 */
export const REQUIREMENT_STATE_COPY: Record<RequirementSetState, string> = {
  missing:
    "ICEFALL holds no structured requirements for this objective, so readiness is assessed against the class of mountain its elevation puts it in, not against this mountain's own demands.",
  unreviewed:
    "This mountain's written requirements have not yet been reviewed by a certified guide, so ICEFALL does not compare you against them. Readiness is assessed against the class of mountain its elevation puts it in.",
  empty:
    "A guide reviewed this mountain's requirements and set no figures ICEFALL can check, so readiness is assessed against the class of mountain its elevation puts it in.",
  usable: "Readiness is compared against this mountain's own reviewed requirements.",
};

/** Who signed a usable set, as one sentence for the screen. Null otherwise. */
export function reviewAttribution(set: ObjectiveRequirementSet | undefined | null): string | null {
  if (!set || !set.review.reviewed) return null;
  const { reviewers, reviewedOn, scope } = set.review;
  const named = reviewers.map((r) => `${r.name} (${r.certification}, ${r.awardedBy})`);
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `Reviewed ${reviewedOn} by ${list}. Scope: ${scope}.`;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Problems that would make a set dishonest if it shipped.
 *
 * Run by `requirements.test.ts` over every record, so a guide's answers cannot
 * reach an athlete with a negative threshold, a duplicate id or an unsourced
 * line in them. It returns a list rather than throwing: the point is to show a
 * human every problem at once, not the first one.
 */
export function validateRequirementSet(set: ObjectiveRequirementSet): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const r of set.requirements) {
    if (seen.has(r.id)) problems.push(`${set.objectiveId}: duplicate requirement id "${r.id}"`);
    seen.add(r.id);

    if (r.label.trim().length === 0) problems.push(`${set.objectiveId}/${r.id}: empty label`);
    if (r.why.trim().length === 0) problems.push(`${set.objectiveId}/${r.id}: no reason given`);
    if (r.source.detail.trim().length === 0)
      problems.push(`${set.objectiveId}/${r.id}: source is not named`);

    switch (r.kind) {
      case "skill":
        if (!(r.skillId in SKILL_LABEL))
          problems.push(
            `${set.objectiveId}/${r.id}: "${r.skillId}" is not a competence the profile offers, so it could never be met`,
          );
        break;
      case "altitude-reached":
      case "single-day-ascent":
      case "weekly-ascent":
        if (!Number.isFinite(r.metres) || r.metres <= 0)
          problems.push(`${set.objectiveId}/${r.id}: ${r.metres} is not a usable figure in metres`);
        break;
      case "single-day-duration":
        if (!Number.isFinite(r.hours) || r.hours <= 0)
          problems.push(`${set.objectiveId}/${r.id}: ${r.hours} is not a usable figure in hours`);
        break;
      case "prior-summits":
        if (!Number.isInteger(r.count) || r.count <= 0)
          problems.push(`${set.objectiveId}/${r.id}: ${r.count} is not a usable summit count`);
        if (!Number.isFinite(r.atOrAboveM) || r.atOrAboveM <= 0)
          problems.push(`${set.objectiveId}/${r.id}: prior summits need an elevation floor`);
        break;
      case "technical-grade":
        if (r.grade.trim().length === 0)
          problems.push(`${set.objectiveId}/${r.id}: grade scale given with no grade`);
        break;
      case "certification":
        if (r.certification.trim().length === 0)
          problems.push(`${set.objectiveId}/${r.id}: certification not named`);
        break;
    }
  }

  // A signed set with nothing in it is legitimate (see RequirementSetState) but
  // an UNSIGNED set with structured figures in it is not: it would mean someone
  // put thresholds into the app without a guide behind them, which is the one
  // thing this whole design exists to prevent.
  if (!set.review.reviewed && set.requirements.length > 0) {
    problems.push(
      `${set.objectiveId}: ${set.requirements.length} structured requirement(s) present on a set no guide has reviewed`,
    );
  }

  return problems;
}
