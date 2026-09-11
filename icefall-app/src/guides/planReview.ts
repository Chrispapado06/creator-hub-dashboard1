/**
 * PAID HUMAN GUIDE REVIEW — the honest empty state, and nothing else.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE ROADMAP ASKS FOR, AND WHY THIS FILE IS MOSTLY REFUSALS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "A real guide reviews the plan or does a call before a big objective."
 *
 * Every noun in that sentence is missing. There is no appointed guide: the
 * marketplace ships `const GUIDES: Guide[] = []` (guides/types.ts:213) and says
 * why in `NO_GUIDES_NOTICE` — "Rather than fill this page with people who do
 * not exist, it is empty". There is no price, because there is nobody to set
 * one. There is no availability, because availability is a claim about a real
 * person's real calendar. And there is no payment: `guides/engagement.ts:22-25`
 * records that "NOTHING HERE IS SENT AND NOTHING HERE IS CHARGED. There is no
 * server and no payment processor."
 *
 * So this module builds the ONE thing that can be built truthfully — the state
 * of having nothing — and makes the alternatives unreachable in the type system
 * rather than merely unused.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW THE EMPTINESS IS ENFORCED RATHER THAN ASSERTED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `guides/types.ts` learned this: a comment saying "no guides here" is a
 * decision, and the next person to need a demo adds one anyway. Three
 * structural locks instead, each of which would have to be deliberately
 * unpicked:
 *
 *   1. `PlanReviewOffer.reviewer` is a `CertifiedReviewer`, whose `verified`
 *      field is typed as the LITERAL `true` and can only be produced by
 *      `appointReviewer` — which does not exist. There is no way to write down
 *      an offer without one. This is the same device `GuideCredential.verified`
 *      uses in the opposite direction (typed as literal `false`), and it is the
 *      same device Phase 3 uses for its two-reviewer tuple.
 *
 *   2. `PLAN_REVIEW_OFFERS` is `readonly []` — the empty TUPLE type, not
 *      `PlanReviewOffer[]`. `[].push(x)` on an array type compiles. On this one
 *      it does not, and neither does assigning a one-element literal to it.
 *
 *   3. `priceEur` and `availability` have no optional or "unknown" member. An
 *      offer without a real number and a real window cannot be expressed at
 *      all, so the failure mode of a future half-finished attempt is a type
 *      error rather than a screen reading "from €—" or "usually within a week".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE 3 — NO CONTROL THAT DOES NOTHING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `planReviewAvailability()` returns `none-appointed`, and a screen handed that
 * renders TEXT. Not a greyed-out "Book a review" button, not a "Notify me",
 * not a waitlist. A disabled control still advertises a product, still gets
 * tapped, and still teaches somebody that the thing exists and they are being
 * kept from it. There is no product. The honest surface is a paragraph, and
 * the paragraph points at where a real IFMGA/UIAGM guide can actually be found
 * today — which is the one genuinely useful thing this feature can do before it
 * exists.
 */

/**
 * A reviewer ICEFALL has actually appointed.
 *
 * `verified: true` is the literal type. Nothing in this codebase can construct
 * one, because appointing a guide is a commercial act — a contract, an insurance
 * check, documents seen by a person — and not something a constructor performs.
 * When that changes, the appointment function is written and reviewed on its
 * own; it is not smuggled in beside a screen.
 */
export interface CertifiedReviewer {
  id: string;
  name: string;
  /** IFMGA/UIAGM or the national association. Never "certified" unqualified. */
  certification: string;
  /** Set only by an appointment ICEFALL made and can evidence. */
  verified: true;
  /** When ICEFALL saw the documents. A verified reviewer always has one. */
  documentsCheckedOn: string;
}

/**
 * One reviewable offering, if one ever exists.
 *
 * Every field is required, and that is the design. See lock 3 above: an
 * optional price is a price that renders as a dash, and a dash beside a real
 * guide's name is a commercial claim with the number left out.
 */
export interface PlanReviewOffer {
  id: string;
  reviewer: CertifiedReviewer;
  /** What the reviewer actually does. Written by them, not by ICEFALL. */
  scope: string;
  /** The price the client pays, in euros. No "from", no range, no estimate. */
  priceEur: number;
  /** A real window on a real calendar, as the reviewer stated it. */
  availability: { from: string; to: string };
}

/**
 * Every plan review ICEFALL can sell. Empty, and typed so it stays empty.
 *
 * `readonly []` rather than `PlanReviewOffer[]` — see lock 2. Widening this is
 * a deliberate edit to the type on this line, which is exactly the amount of
 * friction the decision deserves.
 */
export const PLAN_REVIEW_OFFERS: readonly [] = [];

/** What a screen shows, in these words, when there is nobody to review a plan. */
export const NO_PLAN_REVIEW_NOTICE =
  "ICEFALL has not appointed any guides to review training plans, so there is nothing to book here and no price to quote. Rather than show a waiting list for a service that does not exist: take your plan to an IFMGA/UIAGM-certified guide directly — the local guides office for the range, or the national guides association, will put you in front of someone qualified to read it.";

/**
 * The second sentence, and it is the one that matters most before a big
 * objective.
 *
 * Kept separate from the notice so a screen can show it on its own, and so
 * nobody deletes it while tidying the empty state. It says what ICEFALL's own
 * coach is and is not, which is a thing the athlete is owed BEFORE they decide
 * whether they needed a human to look — not after.
 */
export const PLAN_REVIEW_WHAT_ICEFALL_IS_NOT =
  "Nothing in ICEFALL is a substitute for that. The plan, the readiness figures and the Coach are built from what this app recorded of your training; none of it has seen you move, none of it knows the ground, and none of it clears anybody to go.";

export type PlanReviewAvailability =
  /**
   * Nobody is appointed. The ONLY state this app can be in today.
   *
   * Carries its text so a screen cannot accidentally render an empty state with
   * no explanation, which is how an honest absence turns into a broken-looking
   * page.
   */
  | { state: "none-appointed"; notice: string; alsoTrue: string }
  /**
   * Offers exist. Unreachable while `PLAN_REVIEW_OFFERS` is the empty tuple —
   * written so that the day it is reachable, every consumer already has a
   * branch for it and nobody ships a screen that renders nothing.
   */
  | { state: "offers"; offers: readonly PlanReviewOffer[] };

/**
 * What ICEFALL can offer for a plan review right now.
 *
 * Not a boolean. `false` would collapse "nobody is appointed" into "not
 * available to you", and those are different facts about different things —
 * rule 2, and the same reason `health/consent.ts` refuses to collapse
 * `never-asked` into `declined`.
 */
export function planReviewAvailability(): PlanReviewAvailability {
  if (PLAN_REVIEW_OFFERS.length === 0) {
    return {
      state: "none-appointed",
      notice: NO_PLAN_REVIEW_NOTICE,
      alsoTrue: PLAN_REVIEW_WHAT_ICEFALL_IS_NOT,
    };
  }
  return { state: "offers", offers: PLAN_REVIEW_OFFERS };
}

/**
 * WHETHER ANYTHING HERE CAN BE PAID FOR.
 *
 * The literal `false`, mirroring `BookingTerms.paid` in `guides/engagement.ts`
 * for the same reason: there is no payment processor behind this app, and a
 * screen must be able to state that beside a control rather than discovering it
 * at the end of a flow. While this is `false`, "paid guide review" is a plan,
 * not a product, and no surface may present it as purchasable.
 */
export const PLAN_REVIEW_CAN_BE_PAID_FOR = false;
