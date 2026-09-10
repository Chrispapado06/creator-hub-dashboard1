/**
 * The two kinds of mountain page ICEFALL has, and the difference between them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The catalogue holds tens of thousands of peaks. Fourteen of them have been
 * written up by a person: a difficulty grade, the seasons that are actually
 * safe, the technical ground, the experience the mountain assumes, and — on
 * the deep records — what actually kills people there ("Avalanche and serac
 * fall on the north side, not technical grade alone").
 *
 * Everything else is a set of facts harvested from OpenStreetMap and Wikidata.
 *
 * THOSE TWO THINGS MUST NOT LOOK THE SAME, and until now they did. Both
 * rendered a grade in an identical chip; the only signal separating them was a
 * 10px "Estimated" hint on two tiles. Measured live on 2026-09-10:
 *
 *   · The Matterhorn and the Eiger, both written up as "Technical alpine",
 *     difficulty 5, displayed the derived label "Serious alpine" — an
 *     UNDERSTATEMENT, which is the dangerous direction.
 *   · Gran Paradiso's record says no professional support is required. The
 *     page said "Guide advised", because the tile read an elevation band and
 *     not the field that holds the judgement.
 *   · Toubkal's page showed its curated seasons (Spring · Autumn · Winter) and
 *     directly underneath "the window is generally June to September" —
 *     summer, the one season the expert record excludes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A REFERENCE ENTRY CARRIES NO VERB OF RECOMMENDATION AND NO GRADE.
 *
 * Not a softened grade, not a grade with a disclaimer under it, not a grade in
 * grey text. None. A difficulty label is a judgement about a route made by
 * somebody who has been there, and there is no dataset that carries it. The
 * absence of the planning furniture — no grade chip, no season row, no
 * "requires a guide", no readiness percentage — IS the signal, and it is
 * backed by a line that says so in words.
 *
 * A reference entry may show any fact that arrives with a source: elevation,
 * position, country, mountain range, prominence, first ascent, and a link to
 * the article it came from. Facts are the whole point of the tier. What it may
 * not do is imply that ICEFALL has looked at the mountain.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY NOT JUST ESTIMATE, MORE CAREFULLY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `services/peakAssessment.ts` derives a grade from elevation and latitude in
 * seven bands. It is honest about being an estimate and it is still wrong in
 * the way that matters: it agreed with the curated grade on only 6 of the 14
 * mountains where a real grade exists to check against. An elevation band
 * cannot see a serac, a bergschrund, or a 400 m rock step. Under 3,000 m it
 * says "demanding mountain day" for both a tourist path and the Eiger's north
 * face, which share an altitude and nothing else.
 *
 * An error in a harvested elevation is a data error. A wrong grade is a
 * different kind of thing: somebody reads "suitable for a competent first
 * 4,000er" and goes.
 */

/** Which of the two kinds of page this peak gets. */
export type PeakTier = "objective" | "reference";

/**
 * A peak is an ICEFALL objective only when a human-written record backs it.
 *
 * Deliberately keyed on the presence of the curated record itself rather than
 * on an id or a flag: the tier is not metadata about the peak, it is a
 * statement about whether the judgement fields exist, so it is read from the
 * thing that holds them.
 */
export function tierOf(curated: unknown): PeakTier {
  return curated ? "objective" : "reference";
}

/** The eyebrow above the mountain's name. */
export const TIER_EYEBROW: Record<PeakTier, string> = {
  objective: "ICEFALL objective",
  reference: "Reference entry",
};

/**
 * The line that states, in words, what the reader is looking at.
 *
 * Both tiers get one. A curated page saying nothing would leave the reader to
 * infer that ICEFALL stands behind every page equally, which is the confusion
 * this module exists to end — the claim has to be made explicitly on the pages
 * where it is true, or its absence elsewhere means nothing.
 */
export const TIER_STATEMENT: Record<PeakTier, string> = {
  objective:
    "ICEFALL has surveyed this mountain. The grade, the seasons, the technical ground and the experience it asks for were written by a person and are ICEFALL's own assessment.",
  reference:
    "Facts about this peak, from OpenStreetMap and Wikidata, each shown with its source. ICEFALL has not surveyed it — there is no ICEFALL grade, no season advice and no readiness judgement for this mountain, and nothing on this page should be read as one.",
};

/** What a reference entry offers instead of a plan. */
export const REFERENCE_NEXT_STEP =
  "For the grade, the route and the conditions, use a current guidebook and the local guides office.";

/**
 * Why a reference entry shows no readiness figure.
 *
 * A NAMED ABSENCE, not a hidden one. Readiness is the smaller of two ratios:
 * how much vertical you have climbed against what the route demands, and how
 * high you have been against how high the summit is. The second is computable
 * from the elevation. THE FIRST IS NOT — `tracking/training.ts` falls back to
 * `goal.elevationM * 0.45` when no surveyed route exists, which is a number
 * with no source, and every readiness percentage for an unsurveyed peak is
 * computed against it.
 *
 * So the percentage is not withheld out of caution. It is withheld because it
 * is measured against something ICEFALL made up.
 */
export const REFERENCE_NO_READINESS =
  "No readiness figure. Readiness is measured against a route's vertical gain, and ICEFALL has not surveyed a route on this peak — so there is nothing real to measure against.";

/** The short form, for a card or the Home goal strip where a sentence will not fit. */
export const REFERENCE_NO_READINESS_SHORT =
  "No readiness figure — ICEFALL has not surveyed a route on this peak.";

/**
 * What a training plan for an unsurveyed peak actually is, said on the plan.
 *
 * `tracking/training.ts` builds a plan for EVERY goal. With a curated mountain
 * it scales the load from the mountain's difficulty (`demandFor`, 0.7 +
 * difficulty × 0.13); without one it scales from `goal.elevationM / 1600` and
 * sets the vertical focus from `elevationM >= 3500`. The sessions, rest days
 * and volume that come out are what any mountain of that height would get.
 * That is a general altitude programme, NOT a plan for this mountain's route,
 * its technical ground or its season — none of which ICEFALL knows for a
 * reference entry. The programme is still worth having, so it is not
 * withheld; it is labelled, on the plan, in words.
 */
export const REFERENCE_PLAN_NOTE =
  "Built from the summit's elevation alone. ICEFALL has not surveyed this mountain, so this is a general altitude programme — not a plan for its route, its technical ground or its season.";

/**
 * Why a reference entry has no kit list.
 *
 * `services/checklist.ts` derives its list from `assessPeak`'s band: the
 * technical kit ("crampons, technical ice axe, harness and rope"), the skills
 * it assumes ("efficient rope work on mixed ground") and whether a guide is
 * advised all come from elevation alone. Measured 2026-09-11 on Erciyes Dağı —
 * a 3,917 m volcano with no glacier — the list printed a crevasse rescue kit
 * as ESSENTIAL. A kit list is a claim about the mountain's ground, and for an
 * unsurveyed peak that claim has no source, so there is no list rather than a
 * shorter one: a partial list reads as a complete one.
 */
export const REFERENCE_NO_KIT_LIST =
  "No kit list. A kit list is a statement about a mountain's ground — whether it is glaciated, how technical it is, how cold and how high the camps are — and ICEFALL has not surveyed this one. Where you are climbing with a guide or an operator, their list governs; where you are not, a current guidebook and the local guides office do.";

/** The short form, for a status row. */
export const REFERENCE_NO_KIT_LIST_SHORT =
  "No kit list — ICEFALL has not surveyed this peak, and a kit list is a claim about its ground.";

/**
 * What the coach can and cannot say about an unsurveyed objective, for the
 * one line a status row or a chat context has room for.
 */
export const REFERENCE_NOT_ASSESSED =
  "ICEFALL has not surveyed this peak. It holds no grade, no kit list and no readiness judgement for it, and cannot say which part of your preparation is the thin one — that is a question for a current guidebook and the local guides office.";
