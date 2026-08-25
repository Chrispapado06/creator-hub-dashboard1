import {
  FLEXIBLE_POLICY,
  SERVICE_FEE_PCT,
  eur,
  priceBooking,
  type CancellationPolicy,
  type Pricing,
} from "@/money/model";

/**
 * The booking being reviewed.
 *
 * Placeholder — this guide does not exist and nothing here is a real
 * arrangement. It stands in for the accepted quote until the backend lands, and
 * lives in one module so the three checkout steps cannot disagree about the
 * price the client is looking at.
 */

const DAY_RATE = eur(650);
const DAYS = 7;
const GUIDE_FEE = DAY_RATE * DAYS;

export const GUIDE = {
  name: "Alex Martin",
  firstName: "Alex",
  credential: "UIAGM Mountain Guide",
  rating: 4.9,
  reviews: 127,
  /**
   * A GAN-generated face — this person does not exist. Same rule as the guide
   * directory: no real photograph is attached to an invented name and an
   * invented licence. Gitignored, and the layout survives its absence.
   */
  photo: "/img/guides/guide-demo-wehrli.jpg",
  /** The only sentence ICEFALL may put behind the verified tick. */
  verificationSentence:
    "Documents checked by ICEFALL on 5 Jun 2026. We have not contacted the issuing association.",
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
  serviceFeePct: number;
  pricing: Pricing;
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
  fromIso: "2027-07-18T00:00:00Z",
  departureIso: "2027-07-18T00:00:00Z",
  toIso: "2027-07-24T00:00:00Z",
  climbers: 4,
  days: DAYS,
  dayRate: DAY_RATE,
  serviceFeePct: SERVICE_FEE_PCT,
  pricing: priceBooking(GUIDE_FEE, SERVICE_FEE_PCT),

  included: [
    "Professional guiding service",
    "Route planning and preparation",
    "Safety equipment (ropes, protection)",
    "Group technical support",
  ],
  // Rendered with a distinct mark, never a tick. A green tick beside
  // "Accommodation" in a NOT-INCLUDED list reads as included at a glance, which
  // is the one thing this section exists to prevent.
  excluded: [
    "Accommodation",
    "Transport",
    "Meals",
    "Personal equipment",
    "Travel insurance",
  ],

  cancellation: FLEXIBLE_POLICY,
  cancellationLabel: "Flexible",
};

export const SERVICE_FEE_EXPLAINER =
  `ICEFALL's fee is ${SERVICE_FEE_PCT}% of the guide's price, added on top rather than taken out of it. ` +
  "Your guide receives their full rate. The fee covers holding your money until the trip starts, " +
  "checking guides' documents, and running the platform.";
