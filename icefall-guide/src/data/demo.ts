import type { GuideApplication } from "./model";

/**
 * Placeholder data so the screens can be judged with something in them.
 *
 * Nothing here is real — this guide does not exist, the enquiries were never
 * sent, and no money has moved. Deleted when the backend lands.
 */

export const DEMO_NOTICE =
  "Placeholder data — this account, its enquiries and its bookings are invented so the screens can be reviewed. Nothing is sent and nothing is saved.";

export const ME = {
  name: "Tobias Frei",
  basedIn: "Zermatt, Valais",
  headline: "Matterhorn Hörnli ridge and hard mixed ground in the Valais",
  yearsGuiding: 11,
  languages: ["English", "German", "French"],
  dailyRateEur: 690,
};

/**
 * Deliberately APPROVED but with a document expiring soon, because that is the
 * state worth designing for — an approval quietly running out is the failure
 * this app has to make impossible to miss.
 */
export const APPLICATION: GuideApplication = {
  status: "approved",
  submittedAt: "2026-06-02T09:00:00Z",
  documents: [
    {
      kind: "guiding-licence",
      fileName: "ifmga-carnet-2026.pdf",
      uploadedAt: "2026-06-02T09:00:00Z",
      expiresAt: "2027-12-31",
      reference: "CH-4471",
    },
    {
      kind: "first-aid",
      fileName: "wfr-certificate.pdf",
      uploadedAt: "2026-06-02T09:02:00Z",
      // Inside the 60-day warning window from 17 Aug 2026.
      expiresAt: "2026-10-04",
    },
    {
      kind: "insurance",
      fileName: "liability-2026-27.pdf",
      uploadedAt: "2026-06-02T09:03:00Z",
      expiresAt: "2027-03-31",
      reference: "POL-88213",
    },
    {
      kind: "identity",
      fileName: "passport.jpg",
      uploadedAt: "2026-06-02T09:04:00Z",
      expiresAt: null,
    },
  ],
  review: {
    decidedAt: "2026-06-05T14:20:00Z",
    decidedBy: "ICEFALL — CP",
  },
};

export type OpeningStatus = "open" | "full" | "draft" | "past";

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

export const OPENINGS: Opening[] = [
  {
    id: "op1",
    peak: "Matterhorn",
    route: "Hörnli ridge",
    from: "2026-09-12",
    to: "2026-09-14",
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
    from: "2026-09-22",
    to: "2026-09-26",
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
    from: "2026-10-03",
    to: "2026-10-03",
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
    from: "2027-07-08",
    to: "2027-07-10",
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
    from: "2026-07-19",
    to: "2026-07-21",
    priceEur: 1700,
    places: 2,
    taken: 2,
    status: "past",
    requires: "Grade AD+, long days",
  },
];

export interface Enquiry {
  id: string;
  client: string;
  country: string;
  peak: string;
  dates: string;
  message: string;
  at: string;
  unread: boolean;
  /** Hours since it arrived. Response time is the one metric a client feels. */
  waitingHours: number;
}

export const ENQUIRIES: Enquiry[] = [
  {
    id: "e1",
    client: "Jonas Lindqvist",
    country: "Sweden",
    peak: "Matterhorn",
    dates: "12–14 Sep 2026",
    message:
      "Could you send the quote with the acclimatisation days included? I have done Mont Blanc and Gran Paradiso this season.",
    at: "2026-08-17T07:41:00Z",
    unread: true,
    waitingHours: 9,
  },
  {
    id: "e2",
    client: "Marta Ruiz",
    country: "Spain",
    peak: "Breithorn",
    dates: "3 Oct 2026",
    message: "First time on crampons — is the skills day the right place to start?",
    at: "2026-08-16T18:20:00Z",
    unread: true,
    waitingHours: 22,
  },
  {
    id: "e3",
    client: "Hanne Bakke",
    country: "Norway",
    peak: "Monte Rosa",
    dates: "22–26 Sep 2026",
    message: "Understood that it is full — please let me know if a place opens.",
    at: "2026-08-15T11:05:00Z",
    unread: false,
    waitingHours: 0,
  },
];

export const EARNINGS_BY_MONTH = [
  { month: "Apr", eur: 2400 },
  { month: "May", eur: 4150 },
  { month: "Jun", eur: 6800 },
  { month: "Jul", eur: 9300 },
  { month: "Aug", eur: 7450 },
];

export const eur = (n: number) => `€${n.toLocaleString("en-GB")}`;

export function fmtRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (from === to) return `${d(f)} ${f.getFullYear()}`;
  return `${d(f)} – ${d(t)} ${t.getFullYear()}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Money — demo bookings and payouts                                          */
/* -------------------------------------------------------------------------- */

import { eur as cents, type Cents } from "@/money/model";

/** The country the guide's bank account is in. Drives payout eligibility. */
export const PAYOUT_COUNTRY = "Switzerland";

/** ICEFALL's cut, agreed per partner. */
export const COMMISSION_PCT = 12;

export interface GuideBooking {
  id: string;
  client: string;
  peak: string;
  departureIso: string;
  partySize: number;
  total: Cents;
  paid: Cents;
  status: "deposit_paid" | "paid_in_full" | "completed" | "cancelled";
}

export const BOOKINGS: GuideBooking[] = [
  { id: "b1", client: "Marta Ruiz", peak: "Breithorn — skills day", departureIso: "2026-10-03T00:00:00Z", partySize: 2, total: cents(780), paid: cents(780), status: "paid_in_full" },
  { id: "b2", client: "Jonas Lindqvist", peak: "Matterhorn — Hörnli", departureIso: "2026-09-12T00:00:00Z", partySize: 1, total: cents(1850), paid: cents(1850), status: "paid_in_full" },
  { id: "b3", client: "Hanne Bakke", peak: "Monte Rosa — traverse", departureIso: "2026-09-22T00:00:00Z", partySize: 2, total: cents(2900), paid: cents(580), status: "deposit_paid" },
  { id: "b4", client: "Diego Salas", peak: "Dent Blanche — south ridge", departureIso: "2026-07-19T00:00:00Z", partySize: 2, total: cents(3400), paid: cents(3400), status: "completed" },
];
