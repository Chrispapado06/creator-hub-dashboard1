/**
 * THE SEED — invented data, gated at definition.
 *
 * Nothing here is real. This guide does not exist, the enquiries were never
 * sent, and no money has ever moved through ICEFALL. It exists so the screens
 * can be judged with something in them.
 *
 * EVERY EXPORT BELOW IS EMPTY IN AN ORDINARY BUILD. The gate is
 * `SHOW_DEMO_DATA` and it is applied at the DEFINITION, not at the render, so a
 * plain `npm run build` produces a bundle that does not contain the strings at
 * all. Gating the render leaves the invented IFMGA carnet number, the invented
 * insurance policy reference and the invented client names sitting in
 * `index-*.js` for anyone to read — that exact mistake was live in the athlete
 * app for a while. See `lib/demoFlag.ts` for the deployment-protection
 * precondition, which is not optional.
 *
 * WHAT CHANGED HERE ON 2026-08-29, and why each one mattered:
 *
 *  · `COMMISSION_PCT = 12` IS GONE. This file declared its own commission rate
 *    and `Payouts.tsx` computed `Math.round((paid * 12) / 100)` from it — a
 *    FIFTH commission model in a family that had already found four, and the
 *    only one nobody had looked for because it lived in a different app under a
 *    different name. It was wrong twice: the rate has been 10% since the owner
 *    settled it against a worked example, and the local `Math.round` rounded
 *    toward ICEFALL where the shared model deliberately FLOORS so the fraction
 *    goes to the guide. Deleted rather than corrected to 10 — a second
 *    implementation carrying the right constant is still a second
 *    implementation, and it drifts again the next time the rule moves (§6g).
 *
 *  · `EARNINGS_BY_MONTH` IS GONE. Five months of invented income, drawn as a
 *    bar chart on the guide's home screen, footnoted "Nothing has been paid
 *    through ICEFALL yet". The footnote was true and the chart was not, and a
 *    reader takes the shape before the caption. There is no payments ledger
 *    anywhere in the family, so a monthly series cannot be derived from
 *    anything. `GUIDE_NOTICES.EARNINGS_HISTORY_NOT_RECORDED` now occupies that
 *    space and says why.
 *
 *  · BOOKING VALUES ARE `BookingValue`, not bare numbers. The database cannot
 *    store "reported as nothing" (`bookings_value_coherent`), and neither can
 *    this file now. One seeded booking is deliberately `pending` so the
 *    unavailable path is exercised by looking at the screen rather than only by
 *    reading the code — a branch nothing enters is a branch nobody has checked.
 *
 *  · THERE ARE NO SEEDED VIEW EVENTS, IN ANY BUILD. The demo flag permits
 *    invented CONTENT. It does not permit an invented MEASUREMENT BASIS: seeding
 *    server-sourced view rows would light the profile-views tile with a number
 *    while defeating the entire three-state reading that exists to stop exactly
 *    that. See `VIEW_EVENTS` below.
 */

import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { dayOffset, middayOffset, parseDay } from "@/lib/day";
import type { BookingValue, ViewEvent } from "@/domain/honesty";
import type { GuideApplication } from "./model";
import { eur as cents, type Cents } from "@/money/model";

export const DEMO_NOTICE =
  "Placeholder data — this account, its clients and its bookings are invented so the screens can be reviewed. Nothing is sent and nothing is saved.";

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/** Re-exported so screens have one import for a day. See `@/lib/day`. */
export { parseDay };

/**
 * The seed's dates are RELATIVE to whenever it is read, not absolute.
 *
 * A fixed calendar in a fixture goes stale and starts contradicting itself: a
 * hardcoded "waiting 9 h" beside a timestamp twelve days old is a demo that
 * lies about its own contents, which is a poor thing to hand someone who is
 * judging whether this app tells the truth. Being reproducible matters less
 * here than being coherent.
 */
const now = new Date();

/** A past instant. Timestamps carry their offset and need no day handling. */
const hoursAgo = (h: number): string => new Date(now.getTime() - h * 3_600_000).toISOString();

/** A CALENDAR DAY — a date on a certificate, or the start/end of an opening. */
const dayIn = (d: number): string => dayOffset(now, d);

/**
 * A DEPARTURE, as an unambiguous instant at local midday.
 *
 * Deliberately not a day string. `payoutStatusFor` in the shared money model
 * does `new Date(departureIso) <= now` to decide whether a guide's money is
 * released, and a bare "2026-09-12" would reach it as UTC midnight — releasing a
 * payout most of a day early in Zermatt and most of a day late in Anchorage.
 * That file is Session 03's, so the fix belongs on this side of the call.
 */
const departureIn = (d: number): string => middayOffset(now, d);

/* -------------------------------------------------------------------------- */
/* The guide                                                                   */
/* -------------------------------------------------------------------------- */

/** Mirrors the columns of `public.guide_profiles` this app reads. */
export interface GuideProfile {
  name: string;
  basedIn: string;
  headline: string;
  yearsGuiding: number;
  languages: string[];
  dailyRateEur: number;
}

/**
 * NULL IN AN ORDINARY BUILD, and every screen handles that.
 *
 * A signed-out or not-yet-seeded app has no guide, and inventing a name to fill
 * the gap is how a fictional professional's credentials end up in a public
 * bundle. Owner decision 2 removed four real company names for the mirror-image
 * reason; a fabricated IFMGA holder is the same class of claim pointed the other
 * way.
 */
export const ME: GuideProfile | null = !SHOW_DEMO_DATA
  ? null
  : {
      name: "Tobias Frei",
      basedIn: "Zermatt, Valais",
      headline: "Matterhorn Hörnli ridge and hard mixed ground in the Valais",
      yearsGuiding: 11,
      languages: ["English", "German", "French"],
      dailyRateEur: 690,
    };

/**
 * The honest starting state: nothing submitted, nothing under review.
 *
 * This is what a real guide's application looks like the moment before they
 * fill it in, and it is what an ordinary build carries. `draft` is not a
 * placeholder for the demo state — it is the true state of every account that
 * has never existed.
 */
const EMPTY_APPLICATION: GuideApplication = {
  status: "draft",
  submittedAt: null,
  documents: [],
};

/**
 * Deliberately APPROVED but with a document expiring soon, because that is the
 * state worth designing for — an approval quietly running out is the failure
 * this app has to make impossible to miss.
 */
export const APPLICATION: GuideApplication = !SHOW_DEMO_DATA
  ? EMPTY_APPLICATION
  : {
      status: "approved",
      submittedAt: hoursAgo(24 * 88),
      documents: [
        {
          kind: "guiding-licence",
          fileName: "ifmga-carnet-2026.pdf",
          uploadedAt: hoursAgo(24 * 88),
          expiry: { status: "recorded", on: dayIn(489), source: "printed_on_document" },
          reference: "CH-4471",
        },
        {
          kind: "first-aid",
          fileName: "wfr-certificate.pdf",
          uploadedAt: hoursAgo(24 * 88),
          /*
            DELIBERATELY SELF-REPORTED, and deliberately the one inside the
            warning window. This is the document whose date is about to hide a
            guide's listing — so it is the one where "who told us this" is worth
            a guide seeing. Nobody at ICEFALL has read this date off anything.
          */
          expiry: { status: "recorded", on: dayIn(36), source: "stated_by_holder" },
        },
        {
          kind: "insurance",
          fileName: "liability-2026-27.pdf",
          uploadedAt: hoursAgo(24 * 88),
          expiry: { status: "recorded", on: dayIn(214), source: "printed_on_document" },
          reference: "POL-88213",
        },
        {
          kind: "identity",
          fileName: "passport.jpg",
          uploadedAt: hoursAgo(24 * 88),
          // A passport has an expiry; ICEFALL has not recorded one. "Not
          // recorded" is not "no expiry" and must never render as either.
          expiry: { status: "none" },
        },
      ],
      review: { decidedAt: hoursAgo(24 * 85), decidedBy: "ICEFALL — CP" },
    };

/* -------------------------------------------------------------------------- */
/* Dates the guide is offering                                                 */
/* -------------------------------------------------------------------------- */

export type OpeningStatus = "open" | "full" | "draft" | "past";

/**
 * A dated window the guide is selling.
 *
 * THERE IS NO TABLE BEHIND THIS. `guide_profiles.availability` is a single enum
 * for the whole person — available / limited / unavailable — and
 * `product_departures` is company-scoped. So dated, priced, place-counted guide
 * openings exist only in this app. Filed to Session 03; until it lands, the
 * openings screen is a local statement of intent and says so.
 */
export interface Opening {
  id: string;
  peak: string;
  route: string;
  from: string;
  to: string;
  /** Per person. */
  priceEur: number;
  places: number;
  taken: number;
  status: OpeningStatus;
  /** What the client must already be able to do. Shown before they can enquire. */
  requires: string;
}

export const OPENINGS: Opening[] = !SHOW_DEMO_DATA
  ? []
  : [
      {
        id: "op1",
        peak: "Matterhorn",
        route: "Hörnli ridge",
        from: dayIn(14),
        to: dayIn(16),
        priceEur: 1850,
        places: 2,
        taken: 1,
        status: "open",
        requires: "Confident on grade AD, moving together on rock, 1,200 m ascent in a day",
      },
      {
        id: "op2",
        peak: "Monte Rosa",
        route: "Spaghetti traverse",
        from: dayIn(24),
        to: dayIn(28),
        priceEur: 1450,
        places: 4,
        taken: 4,
        status: "full",
        requires: "Crampon-confident, comfortable at 4,000 m",
      },
      {
        id: "op3",
        peak: "Breithorn",
        route: "West summit — skills day",
        from: dayIn(35),
        to: dayIn(35),
        priceEur: 390,
        places: 6,
        taken: 2,
        status: "open",
        requires: "No previous experience needed",
      },
      {
        id: "op4",
        peak: "Eiger",
        route: "Mittellegi ridge",
        from: dayIn(313),
        to: dayIn(315),
        priceEur: 2600,
        places: 1,
        taken: 0,
        status: "draft",
        requires: "Grade D experience, previous 4,000 m ridge traverse",
      },
      {
        id: "op5",
        peak: "Dent Blanche",
        route: "South ridge",
        from: dayIn(-41),
        to: dayIn(-39),
        priceEur: 1700,
        places: 2,
        taken: 2,
        status: "past",
        requires: "Grade AD+, long days",
      },
    ];

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * An enquiry, which is a THREAD and not a lead.
 *
 * `public.leads` — where the whole enquiry → qualified → booked funnel is
 * computed — has `company_id not null`. A guide is a person, not a company, so a
 * guide's enquiry has no lead row and therefore no marketplace funnel. That is a
 * schema gap filed to Session 03, and until it closes, counting these is
 * counting local messages. `GUIDE_NOTICES.ENQUIRY_FUNNEL_NOT_RECORDED` says so
 * wherever the count could be mistaken for a marketplace figure.
 */
export interface Enquiry {
  id: string;
  client: string;
  country: string;
  peak: string;
  dates: string;
  message: string;
  /** ISO timestamp it arrived. Waiting time is DERIVED, never stored. */
  at: string;
  answeredAt: string | null;
}

export const ENQUIRIES: Enquiry[] = !SHOW_DEMO_DATA
  ? []
  : [
      {
        id: "e1",
        client: "Jonas Lindqvist",
        country: "Sweden",
        peak: "Matterhorn",
        dates: "in two weeks",
        message:
          "Could you send the quote with the acclimatisation days included? I have done Mont Blanc and Gran Paradiso this season.",
        at: hoursAgo(9),
        answeredAt: null,
      },
      {
        id: "e2",
        client: "Marta Ruiz",
        country: "Spain",
        peak: "Breithorn",
        dates: "in five weeks",
        message: "First time on crampons — is the skills day the right place to start?",
        at: hoursAgo(22),
        answeredAt: null,
      },
      {
        id: "e3",
        client: "Hanne Bakke",
        country: "Norway",
        peak: "Monte Rosa",
        dates: "in three weeks",
        message: "Understood that it is full — please let me know if a place opens.",
        at: hoursAgo(74),
        answeredAt: hoursAgo(70),
      },
      /**
       * TWO ENQUIRIES THAT DID NOT BECOME BOOKINGS, and they are here on
       * purpose. A seed where every enquiry converts produces a 100% rate, and a
       * marketplace showing a professional a perfect score on their own
       * performance is flattering them with fiction. Guides lose enquiries; the
       * demo should show one being lost.
       */
      {
        id: "e4",
        client: "Pieter de Vries",
        country: "Netherlands",
        peak: "Matterhorn",
        dates: "next summer",
        message:
          "Thanks for the detail — I am going to build up on some 4,000ers first and come back to you next season.",
        at: hoursAgo(200),
        answeredAt: hoursAgo(196),
      },
      {
        id: "e5",
        client: "Aiko Tanaka",
        country: "Japan",
        peak: "Breithorn",
        dates: "in five weeks",
        message: "Is there a weekday date? I would rather not be on the hill on a Saturday.",
        at: hoursAgo(3),
        answeredAt: null,
      },
    ];

/**
 * How long a client has been waiting, in hours, derived from the timestamp.
 *
 * Was a stored `waitingHours` field, which is a figure that starts drifting from
 * its own timestamp the moment it is written. Response time is the one thing
 * every client feels, so it is the last number that should be allowed to go
 * stale.
 */
export function waitingHours(e: Enquiry, at: Date = new Date()): number {
  if (e.answeredAt !== null) return 0;
  return Math.max(0, Math.floor((at.getTime() - new Date(e.at).getTime()) / 3_600_000));
}

export const isUnanswered = (e: Enquiry): boolean => e.answeredAt === null;

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

/** The country the guide's bank account is in. Drives payout eligibility. */
export const PAYOUT_COUNTRY = "Switzerland";

/** Mirrors `public.bookings` where `kind = 'guide'`. */
export interface GuideBooking {
  id: string;
  client: string;
  peak: string;
  departureIso: string;
  partySize: number;
  /**
   * The enquiry this booking came from, or null.
   *
   * Mirrors `public.bookings.lead_id`, which is exactly this link — and which a
   * guide's booking cannot currently populate, because `public.leads` is
   * company-scoped. NULL IS A REAL ANSWER, not a gap: a guide gets booked by
   * people who never sent an enquiry, and pretending otherwise is how a
   * conversion rate ends up above 100%.
   */
  fromEnquiryId: string | null;
  /** What the booking is worth, or why we do not know. Never a bare number. */
  value: BookingValue;
  /**
   * Hut fees, permits and lifts the guide collects and hands straight on.
   * ICEFALL's commission is never charged on these (owner decision 13). It
   * cannot be inferred from a total — a booking that does not say has none.
   */
  passedThrough: Cents;
  /** What the client has actually paid so far. */
  paid: BookingValue;
  status: "deposit_paid" | "paid_in_full" | "completed" | "cancelled";
}

export const BOOKINGS: GuideBooking[] = !SHOW_DEMO_DATA
  ? []
  : [
      {
        id: "b1",
        fromEnquiryId: "e2",
        client: "Marta Ruiz",
        peak: "Breithorn — skills day",
        departureIso: departureIn(35),
        partySize: 2,
        value: { status: "reported", cents: cents(780) },
        passedThrough: cents(96), // Klein Matterhorn lift, two passes.
        paid: { status: "reported", cents: cents(780) },
        status: "paid_in_full",
      },
      {
        id: "b2",
        fromEnquiryId: "e1",
        client: "Jonas Lindqvist",
        peak: "Matterhorn — Hörnli",
        departureIso: departureIn(14),
        partySize: 1,
        value: { status: "reported", cents: cents(1850) },
        passedThrough: cents(310), // Hörnli hut, half board, two nights.
        paid: { status: "reported", cents: cents(1850) },
        status: "paid_in_full",
      },
      {
        id: "b3",
        fromEnquiryId: "e3",
        client: "Hanne Bakke",
        peak: "Monte Rosa — traverse",
        departureIso: departureIn(24),
        partySize: 2,
        value: { status: "reported", cents: cents(2900) },
        passedThrough: cents(640), // Four hut nights across the traverse.
        paid: { status: "reported", cents: cents(580) },
        status: "deposit_paid",
      },
      {
        /**
         * DELIBERATELY VALUELESS. A booking taken before anyone recorded what it
         * was worth is a real state the database models (`value_status =
         * 'pending'`), and it is the state most likely to be quietly rendered as
         * €0. Seeding one means the honest path is visible on the screen rather
         * than only present in the code.
         */
        // Walked up to him in Zermatt. ICEFALL had nothing to do with it.
        id: "b4",
        fromEnquiryId: null,
        client: "Diego Salas",
        peak: "Dent Blanche — south ridge",
        departureIso: departureIn(-41),
        partySize: 2,
        value: { status: "pending" },
        passedThrough: 0,
        paid: { status: "pending" },
        status: "completed",
      },
    ];

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * EMPTY IN EVERY BUILD, INCLUDING A DEMO ONE. Not an oversight — the point.
 *
 * Two independent facts make a profile-view count impossible today, and both
 * were checked against the schema rather than assumed:
 *
 *   1. Nothing in the ICEFALL family emits a `listing_view` event at all.
 *   2. `public.analytics_events` has no guide or profile column, so even a
 *      working emitter has nowhere to attribute a view of a GUIDE'S profile.
 *
 * The demo flag permits invented content. It does not permit an invented
 * measurement: a seeded `server` row would light the tile with a real-looking
 * number and defeat the exact three-state reading that exists to prevent it —
 * and it would do so on the screen a guide uses to decide whether ICEFALL's
 * commission is buying them anything. The operator portal was allowed the
 * mockup's invented figure by an explicit owner decision (18) and carries a
 * standing note to revert it; this app was told the opposite, and it holds.
 *
 * When a trusted emitter exists, rows arrive here and `viewsReading` starts
 * returning a figure with no other change.
 */
export const VIEW_EVENTS: ViewEvent[] = [];

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

export const eur = (n: number) => `€${n.toLocaleString("en-GB")}`;

export function fmtRange(from: string, to: string): string {
  const f = parseDay(from);
  const t = parseDay(to);
  // An unreadable day prints itself rather than "Invalid Date". Showing the raw
  // value tells whoever is looking what is actually stored; "Invalid Date" tells
  // them only that something is wrong somewhere.
  if (f === null || t === null) return from === to ? from : `${from} – ${to}`;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (from === to) return `${d(f)} ${f.getFullYear()}`;
  return `${d(f)} – ${d(t)} ${t.getFullYear()}`;
}

export function fmtDate(iso: string): string {
  const d = iso.length <= 10 ? parseDay(iso) : new Date(iso);
  if (d === null || Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
