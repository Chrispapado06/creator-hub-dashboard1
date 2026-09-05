import {
  FLEXIBLE_POLICY,
  GUIDE_FEE_DISCLOSURE,
  eur,
  totalsFor,
  type CancellationPolicy,
  type Quote,
  type QuoteTotals,
} from "@/money/model";

/**
 * The booking being reviewed.
 *
 * Placeholder — this arrangement does not exist. It stands in for an accepted
 * quote until the backend lands, and lives in one module so the three checkout
 * steps cannot disagree about the price the client is looking at.
 */

const DAY_RATE = eur(650);
const DAYS = 7;
const CLIMBERS = 4;
const DEPARTURE_ISO = "2027-07-18T00:00:00Z";

/* -------------------------------------------------------------------------- */
/* The guide                                                                   */
/* -------------------------------------------------------------------------- */

export interface BookingGuide {
  name: string;
  firstName: string;
  /**
   * What the guide says about themselves. NOT what ICEFALL has checked — the
   * two are different sentences and this field is only ever the first one.
   */
  claimedCredential: string;
  photo: string;
}

/**
 * THERE IS NO VERIFIED GUIDE, AND NO VERIFICATION RECORD.
 *
 * This file used to export a `verificationSentence` reading "Documents checked
 * by ICEFALL on 5 Jun 2026. We have not contacted the issuing association." —
 * rendered behind a tick on all three checkout steps. The second half of that
 * sentence was scrupulous and the first half was invented: nobody has read
 * anybody's documents, on that date or any other, because there are no guides,
 * no staff and no vetting process. A dated verification record is the single
 * most consequential thing this flow could fabricate, since it is read by
 * someone deciding whether to follow a stranger onto a glacier. It is deleted
 * rather than gated, and `credentials[].verified` stays the literal `false`
 * across the app (`guides/types.ts`) for the same reason.
 *
 * What survives is the guide's own claim about their licence, labelled as a
 * claim. If ICEFALL ever does check documents, the record comes back with the
 * date the check actually happened and a tick may return with it.
 */

/**
 * DEV, OR AN EXPLICITLY FLAGGED PROTECTED BUILD.
 *
 * The guard spells out the `import.meta.env` reads INLINE and deliberately does
 * not use `SHOW_DEMO_DATA` — see the long argument in `guides/types.ts`. With a
 * named constant the bundler keeps the literals, because the build-time
 * substitution has to be syntactically inside the branch for the branch to
 * fold. Unflagged this folds to `if (true) return null` and the invented person
 * below is removed from the bundle outright.
 *
 * The name matches the demo guide of the same portrait in `guides/types.ts`, so
 * the two surfaces cannot describe the same face as two different people. It
 * was constructed for this build the same way the other eight were, pairing a
 * given name and surname across origins so the combination does not read as any
 * particular working guide.
 */
function buildDemoGuide(): BookingGuide | null {
  if (!import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO !== "1") return null;
  return {
    name: "Tomás Wehrli",
    firstName: "Tomás",
    claimedCredential: "States an IFMGA / UIAGM licence",
    /**
     * A GAN-generated face — this person does not exist. Same rule as the guide
     * directory: no real photograph is attached to an invented name and an
     * invented licence. Gitignored, and the layout survives its absence.
     */
    photo: "/img/guides/guide-demo-wehrli.jpg",
  };
}

export const GUIDE: BookingGuide | null = buildDemoGuide();

/**
 * THE MONEY DISCLOSURE, CARRIED BY BOTH NOTICES.
 *
 * A DISCLOSURE MUST NEVER BE GATED MORE TIGHTLY THAN THE THING IT DISCLOSES.
 * There were two notices and only the demo one mentioned the figures. With the
 * demo flag off — which is the build an outside reviewer is handed, because the
 * login wall and the invented data are two different switches — `GUIDE` is null,
 * `NO_BOOKING_GUIDE_NOTICE` rendered, and it explained the missing guide while
 * the screen underneath showed an invented €4,550 quote with nothing anywhere
 * saying the price was made up. The quote is unconditional, so its disclosure
 * is now unconditional too.
 */
const INVENTED_FIGURES =
  "The dates, the day rate and the total on these screens were made up to show how checkout works — nobody has quoted this and no price has been agreed.";

/** Shown on every checkout step while a demo guide is being rendered. */
export const BOOKING_DEMO_NOTICE =
  `Demonstration data. This guide does not exist and the licence is invented. ${INVENTED_FIGURES} ICEFALL has verified nothing about this person and nobody can be contacted through these screens — a production build shows no guide at all.`;

/** Shown on every checkout step when there is no guide, which in production there is not. */
export const NO_BOOKING_GUIDE_NOTICE =
  `No guide is attached to this booking. Nobody has listed with ICEFALL yet, so rather than show a person who does not exist these screens run through the checkout with the guide left blank. ${INVENTED_FIGURES} Find an IFMGA/UIAGM-certified guide through the local guides office or the national association for the range you are heading to.`;

/**
 * The one the checkout steps render — always on screen, never behind a tap.
 *
 * The fabricated verification record used to be reachable only by tapping the
 * tick, which meant the claim it replaced was visible and the qualification of
 * it was not. A notice that has to be discovered does not qualify anything.
 */
export const BOOKING_NOTICE = GUIDE === null ? NO_BOOKING_GUIDE_NOTICE : BOOKING_DEMO_NOTICE;

/* -------------------------------------------------------------------------- */
/* The draft                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * THE CLIENT PAYS THE ADVERTISED RATE. NOTHING IS ADDED AT CHECKOUT.
 *
 * This flow used to price with `priceBooking`, which added a 5% service fee on
 * top of the guide's rate and showed it as its own line before the total. The
 * commercial model is now a commission DEDUCTED from the guide's fee
 * (constitution 3b) rather than added to the client's bill.
 *
 * THE RATE IS NOT REPEATED HERE, and the worked example that used to follow is
 * gone. It said 10% — the owner raised it to 15% and this note stayed behind,
 * so a reader checking the checkout's arithmetic against its own explanation
 * got two different answers. `GUIDE_COMMISSION_PCT` in `money/model.ts` is the
 * one place that number exists; anything that needs it reads it from there.
 *
 * So there is no fee line, no `serviceFeePct`, and no second number to disclose
 * at checkout — the price on the card is the price on the invoice. The client
 * is told where ICEFALL's money comes from via `GUIDE_FEE_DISCLOSURE`, which is
 * a statement about the guide's earnings rather than about their bill.
 *
 * The arithmetic goes through `totalsFor` in the canonical money model rather
 * than being done here. That is deliberate and it is not ceremony: a local
 * multiplication is exactly how this app ended up carrying a third commission
 * figure while the checkout used a fourth. The one function cannot add a fee,
 * so this screen structurally cannot either.
 */
const QUOTE: Quote = {
  id: "quote-demo-booking",
  lines: [{ label: `Guiding, ${DAYS} days`, amount: DAY_RATE * DAYS, per: "party" }],
  exclusions: [
    { label: "Accommodation", approxAmount: null },
    { label: "Transport", approxAmount: null },
    { label: "Meals", approxAmount: null },
    { label: "Personal equipment", approxAmount: null },
    { label: "Travel insurance", approxAmount: null },
  ],
  cancellation: FLEXIBLE_POLICY,
  partySize: CLIMBERS,
  departureIso: DEPARTURE_ISO,
  validUntilIso: "2027-06-18T00:00:00Z",
};

export interface BookingDraft {
  peak: string;
  route: string;
  elevationM: number;
  lat: number;
  lon: number;
  dateLabel: string;
  fromIso: string;
  departureIso: string;
  toIso: string;
  climbers: number;
  days: number;
  dayRate: number;
  /** Client-facing figures. Only `total` is ever shown on these screens. */
  totals: QuoteTotals;
  included: string[];
  excluded: string[];
  cancellation: CancellationPolicy;
  cancellationLabel: string;
}

export const BOOKING: BookingDraft = {
  peak: "Mont Blanc",
  route: "Goûter Route",
  elevationM: 4806,
  lat: 45.8326,
  lon: 6.8652,
  dateLabel: "18 – 24 Jul 2027",
  fromIso: DEPARTURE_ISO,
  departureIso: DEPARTURE_ISO,
  toIso: "2027-07-24T00:00:00Z",
  climbers: CLIMBERS,
  days: DAYS,
  dayRate: DAY_RATE,
  totals: totalsFor(QUOTE),

  included: [
    "Professional guiding service",
    "Route planning and preparation",
    "Safety equipment (ropes, protection)",
    "Group technical support",
  ],
  // Rendered with a distinct mark, never a tick. A green tick beside
  // "Accommodation" in a NOT-INCLUDED list reads as included at a glance, which
  // is the one thing this section exists to prevent.
  excluded: QUOTE.exclusions.map((e) => e.label),

  cancellation: FLEXIBLE_POLICY,
  cancellationLabel: "Flexible",
};

/**
 * Where ICEFALL's money comes from, said to the client.
 *
 * Re-exported from the money model rather than written here, so the checkout
 * cannot describe the commercial arrangement differently from the guide screens
 * that render the other side of it. It replaces `SERVICE_FEE_EXPLAINER`, which
 * described a 5% fee added on top and no longer exists.
 */
export const FEE_DISCLOSURE = GUIDE_FEE_DISCLOSURE;
