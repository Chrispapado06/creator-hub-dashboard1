/**
 * THE OFFLINE FIXTURES — everything this app shows when it cannot reach anything.
 *
 * Read `src/offline/offline.ts` first. These values are used ONLY when
 * `OFFLINE` is true, and every consumer reaches them through a guarded
 * expression, so with the flag unset not one of these strings is ever read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS REAL, AND NOTHING HERE MAY BE MISTAKEN FOR REAL.
 *
 * Rowan Vesper does not exist. No client wrote any of these messages, no money
 * has moved, and no member of ICEFALL staff has read any document. The
 * permanent banner (`OfflineBanner.tsx`) says so on every screen, and it is not
 * decoration: this app's whole discipline is that it never shows a figure it
 * cannot measure, and offline it can measure nothing at all. The banner is what
 * keeps that true.
 *
 * TWO RULES THIS FILE FOLLOWS, BOTH OF WHICH HAVE BEEN BROKEN BEFORE:
 *
 *   1. NO REAL BUSINESS APPEARS ANYWHERE. Owner decision 2 removed four real,
 *      identifiable expedition operators from this family's seeds because they
 *      were carrying invented ratings and prices. There is no company named in
 *      this file at all — a guide's own tool has no need of one — and none may
 *      be added. Mountains and treks are places, and their ids come from the
 *      catalogues in `src/data/`, so a peak name here is a real mountain and
 *      never a real company.
 *
 *   2. NO CREDENTIAL LOOKS ISSUABLE. `demoFlag.ts` records the risk plainly: an
 *      invented IFMGA carnet number for a person who does not exist is a
 *      published professional credential. Every reference below is prefixed
 *      SAMPLE-, every filename says sample, and the guide's own title says
 *      sample profile, so no line of this can be screenshotted into something
 *      that reads as a qualification.
 *
 * DATES ARE RELATIVE AND MUST STAY THAT WAY. `effectiveStatus()` derives
 * "lapsed" live from document expiry and the payout logic compares departures
 * against now, so literal dates would silently rot this fixture into a
 * lapsed-and-overdue guide some months from now. Every date below is computed
 * from `new Date()` at module load, exactly as `data/demo.ts` does.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Client, DayState, GuideBooking, GuideProfile, Thread } from "@/data/demo";
import type { OfferedRoute } from "@/data/listingStore";
import type { GuideApplication } from "@/data/model";
import { dayOffset, middayOffset } from "@/lib/day";
import { eur } from "@/money/model";

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

const now = new Date();
const hoursAgo = (h: number): string => new Date(now.getTime() - h * 3_600_000).toISOString();
/** A calendar day — a date on a certificate, or the start/end of a trip. */
const dayIn = (d: number): string => dayOffset(now, d);
/** A departure, as an unambiguous instant at local midday. See `@/lib/day`. */
const departureIn = (d: number): string => middayOffset(now, d);

/* -------------------------------------------------------------------------- */
/* The guide                                                                   */
/* -------------------------------------------------------------------------- */

export const OFFLINE_GUIDE: GuideProfile = {
  name: "Rowan Vesper",
  /* Says what it is in the one place a reader looks for a qualification. */
  title: "Mountain guide · sample profile",
  nationality: "Swiss",
  basedIn: "Andermatt, Uri",
  languages: ["English", "German", "French"],
  yearsGuiding: 11,
  bio: "Eleven seasons on rock, snow and ice — mostly the Central Alps in summer and the Khumbu in autumn. Small parties, long ridges, early starts. (Sample profile: this guide is invented for the offline demo.)",
  dailyRateEur: 640,
  heroPeak: "matterhorn",
};

/* -------------------------------------------------------------------------- */
/* The listing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What this guide offers. Every `routeId` is checked against `data/peaks.ts` and
 * `data/treks.ts` — an id the catalogue does not hold renders as a "missing"
 * route, which would be a broken screen rather than a demo.
 */
export const OFFLINE_ROUTES: OfferedRoute[] = [
  {
    kind: "mountain",
    routeId: "matterhorn",
    routes: "Hörnli ridge",
    grade: "Technical",
    dayRateEur: 980,
    typicalDays: 2,
    requires: "Moving together on rock, a previous 4,000 m summit, comfortable soloing grade II",
  },
  {
    kind: "mountain",
    routeId: "eiger",
    routes: "Mittellegi ridge",
    grade: "Technical",
    dayRateEur: 940,
    typicalDays: 2,
    requires: "Sustained exposure, fixed-rope work, one previous alpine ridge with me",
  },
  {
    kind: "mountain",
    routeId: "mont-blanc",
    routes: "Goûter route, Trois Monts",
    grade: "Moderate",
    dayRateEur: 660,
    typicalDays: 3,
    requires: "Crampon-confident and able to climb 1,200 m in a day at altitude",
  },
  {
    kind: "mountain",
    routeId: "ama-dablam",
    routes: "South West ridge",
    grade: "Expedition",
    dayRateEur: 760,
    typicalDays: 15,
    requires: "Jumaring on fixed line, a previous 6,000 m peak, three weeks free",
  },
  {
    kind: "mountain",
    routeId: "island-peak",
    routes: "Normal route",
    grade: "Moderate",
    dayRateEur: 440,
    typicalDays: 9,
    requires: "Trekking fitness and willingness to learn rope work on the hill",
  },
  {
    kind: "mountain",
    routeId: "toubkal",
    routes: "South cirque, winter",
    grade: "Introductory",
    dayRateEur: 320,
    typicalDays: 4,
    requires: "Hill fitness. Crampons taught on the trip — no previous snow needed",
  },
  {
    kind: "trek",
    routeId: "tour-du-mont-blanc",
    routes: "Anti-clockwise, hut to hut",
    grade: "Moderate",
    dayRateEur: 290,
    typicalDays: 11,
    requires: "Able to walk 6–8 hours a day for ten days with a light pack",
  },
  {
    kind: "trek",
    routeId: "walkers-haute-route",
    routes: "Chamonix to Zermatt, high variants",
    grade: "Moderate",
    dayRateEur: 310,
    typicalDays: 13,
    requires: "Two weeks of consecutive walking days, some scrambling on the variants",
  },
  {
    kind: "trek",
    routeId: "everest-base-camp-trek",
    routes: "Lukla in, Kala Patthar, Lukla out",
    grade: "Introductory",
    dayRateEur: 260,
    typicalDays: 14,
    requires: "Able to walk 6 hours a day on consecutive days",
  },
];

/* -------------------------------------------------------------------------- */
/* Verification                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Approved, with one certificate inside the 60-day warning window AND
 * self-reported — deliberately, because that combination is the most
 * interesting state the verification screen has: it shows the amber notice, the
 * provenance caveat, and what happens to a listing if nothing is done.
 *
 * The avalanche credential is absent on purpose, so the "Not uploaded." path
 * renders too.
 */
export const OFFLINE_APPLICATION: GuideApplication = {
  status: "approved",
  submittedAt: hoursAgo(24 * 96),
  documents: [
    {
      kind: "guiding-licence",
      fileName: "sample-guiding-licence.pdf",
      uploadedAt: hoursAgo(24 * 96),
      expiry: { status: "recorded", on: dayIn(402), source: "printed_on_document" },
      reference: "SAMPLE-LIC-0001",
    },
    {
      kind: "first-aid",
      fileName: "sample-wilderness-first-aid.pdf",
      uploadedAt: hoursAgo(24 * 96),
      expiry: { status: "recorded", on: dayIn(41), source: "stated_by_holder" },
    },
    {
      kind: "insurance",
      fileName: "sample-liability-cover.pdf",
      uploadedAt: hoursAgo(24 * 96),
      expiry: { status: "recorded", on: dayIn(173), source: "printed_on_document" },
      reference: "SAMPLE-POL-0002",
    },
    {
      kind: "identity",
      fileName: "sample-photo-id.jpg",
      uploadedAt: hoursAgo(24 * 96),
      /* "Not recorded" is not "no expiry", and must never render as either. */
      expiry: { status: "none" },
    },
  ],
  review: { decidedAt: hoursAgo(24 * 91), decidedBy: "ICEFALL — sample review" },
};

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

/** Invented people. Every number is in a range reserved for fiction. */
export const OFFLINE_CLIENTS: Client[] = [
  {
    id: "oc1",
    name: "Ines Fallowfield",
    email: "ines.fallowfield@example.com",
    phone: "+44 7700 900142",
    from: "Bristol, England",
    online: true,
    notes: "Strong on rock, wary of steep snow. Wants the Hörnli this summer.",
  },
  {
    id: "oc2",
    name: "Tobias Marek",
    email: "tobias.marek@example.com",
    phone: "+43 660 555 0118",
    from: "Innsbruck, Austria",
    online: true,
    notes: "Ski tourer moving onto alpine rock. Very fit, needs rope-work miles.",
  },
  {
    id: "oc3",
    name: "Priya Anand",
    email: "priya.anand@example.com",
    phone: "+91 90000 55012",
    from: "Pune, India",
    online: false,
    notes: "First 6,000 m peak went well. Acclimatises slowly — plan an extra day.",
  },
  {
    id: "oc4",
    name: "Casey Ndlovu",
    email: "casey.ndlovu@example.com",
    phone: "+27 82 555 0143",
    from: "Cape Town, South Africa",
    online: true,
    notes: "Asks for the kit list early. Vegetarian, and happy to say so in huts.",
  },
  {
    id: "oc5",
    name: "Hana Bergström",
    email: "hana.bergstrom@example.com",
    phone: "+46 70 555 0166",
    from: "Gothenburg, Sweden",
    online: false,
    notes: "Winter Scandinavian background. Low-altitude experience only so far.",
  },
  {
    id: "oc6",
    name: "Marcus Okonjo",
    email: "marcus.okonjo@example.com",
    phone: "+1 416 555 0128",
    from: "Toronto, Canada",
    online: false,
    notes: "Fourth season with me. Reads weather better than I do.",
  },
  {
    id: "oc7",
    name: "Sofia Delgado",
    email: "sofia.delgado@example.com",
    phone: "+56 9 5550 0177",
    from: "Valparaíso, Chile",
    online: true,
    notes: "Booked the Toubkal week as a first snow trip. Nervous, asks good questions.",
  },
];

/* -------------------------------------------------------------------------- */
/* Bookings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * ELEVEN BOOKINGS, CHOSEN FOR THE STATES THEY PUT ON SCREEN rather than to make
 * a total look healthy. Payouts is the richest screen in this app and it only
 * reads well with a mix:
 *
 *   ob1, ob4   paid in full           the "you receive" column with commission
 *   ob2, ob3   deposit paid           part-paid, balance still with the client
 *   ob5        completed and sent     what a finished trip settles at
 *   ob6        completed, NO VALUE    the honest "not reported" path, never €0
 *   ob7        cancelled              "nothing is due", not a negative number
 *   oh1–oh4    last season            so the analytics delta is real arithmetic
 *                                     over two windows rather than a typed "+18%"
 */
export const OFFLINE_BOOKINGS: GuideBooking[] = [
  {
    id: "ob1",
    title: "Matterhorn — Hörnli ridge",
    peak: "matterhorn",
    from: dayIn(9),
    to: dayIn(12),
    departureIso: departureIn(9),
    grade: "Technical",
    category: "private",
    clientIds: ["oc1", "oc2"],
    state: "confirmed",
    value: { status: "reported", cents: eur(2850) },
    passedThrough: eur(320),
    paid: { status: "reported", cents: eur(2850) },
    fromThreadId: "ot1",
    payoutState: "paid_in_full",
  },
  {
    id: "ob2",
    title: "Ama Dablam Expedition",
    peak: "ama-dablam",
    from: dayIn(36),
    to: dayIn(51),
    departureIso: departureIn(36),
    grade: "Expedition",
    category: "expedition",
    clientIds: ["oc3"],
    state: "pending",
    value: { status: "reported", cents: eur(3450) },
    passedThrough: eur(700),
    paid: { status: "reported", cents: eur(690) },
    fromThreadId: "ot4",
    payoutState: "deposit_paid",
  },
  {
    id: "ob3",
    title: "Mont Blanc Ascent",
    peak: "mont-blanc",
    from: dayIn(58),
    to: dayIn(61),
    departureIso: departureIn(58),
    grade: "Moderate",
    category: "private",
    clientIds: ["oc4", "oc5", "oc6"],
    state: "confirmed",
    value: { status: "reported", cents: eur(1950) },
    passedThrough: eur(260),
    paid: { status: "reported", cents: eur(975) },
    fromThreadId: "ot3",
    payoutState: "deposit_paid",
  },
  {
    id: "ob4",
    title: "Eiger — Mittellegi ridge",
    peak: "eiger",
    from: dayIn(70),
    to: dayIn(73),
    departureIso: departureIn(70),
    grade: "Technical",
    category: "private",
    clientIds: ["oc2"],
    state: "confirmed",
    value: { status: "reported", cents: eur(2300) },
    passedThrough: eur(190),
    paid: { status: "reported", cents: eur(2300) },
    fromThreadId: null,
    payoutState: "paid_in_full",
  },
  {
    id: "ob5",
    title: "Island Peak Ascent",
    peak: "island-peak",
    from: dayIn(-52),
    to: dayIn(-44),
    departureIso: departureIn(-52),
    grade: "Moderate",
    category: "expedition",
    clientIds: ["oc1", "oc7"],
    state: "complete",
    value: { status: "reported", cents: eur(2050) },
    passedThrough: eur(160),
    paid: { status: "reported", cents: eur(2050) },
    fromThreadId: "ot1",
    payoutState: "completed",
  },
  {
    id: "ob6",
    title: "Mera Peak Expedition",
    peak: "mera-peak",
    from: dayIn(-101),
    to: dayIn(-89),
    departureIso: departureIn(-101),
    grade: "Expedition",
    category: "expedition",
    clientIds: ["oc3", "oc5"],
    state: "complete",
    /* DELIBERATELY VALUELESS — a trip taken before anyone recorded what it was
       worth, which is the state most likely to be quietly rendered as €0. */
    value: { status: "pending" },
    passedThrough: 0,
    paid: { status: "pending" },
    fromThreadId: null,
    payoutState: "completed",
  },
  {
    id: "ob7",
    title: "Gornergrat skills day",
    peak: "matterhorn",
    from: dayIn(-15),
    to: dayIn(-15),
    departureIso: departureIn(-15),
    grade: "Moderate",
    category: "private",
    clientIds: ["oc4"],
    state: "cancelled",
    value: { status: "reported", cents: eur(420) },
    passedThrough: 0,
    paid: { status: "unknown" },
    fromThreadId: null,
    payoutState: "cancelled",
  },
  /* ---- Last season, so the comparison window is not empty ----------------- */
  {
    id: "oh1",
    title: "Mont Blanc Ascent",
    peak: "mont-blanc",
    from: dayIn(-415),
    to: dayIn(-412),
    departureIso: departureIn(-415),
    grade: "Moderate",
    category: "private",
    clientIds: ["oc6"],
    state: "complete",
    value: { status: "reported", cents: eur(1700) },
    passedThrough: eur(210),
    paid: { status: "reported", cents: eur(1700) },
    fromThreadId: null,
    payoutState: "completed",
  },
  {
    id: "oh2",
    title: "Everest Base Camp Trek",
    peak: "everest",
    from: dayIn(-386),
    to: dayIn(-373),
    departureIso: departureIn(-386),
    grade: "Moderate",
    category: "other",
    clientIds: ["oc3", "oc6"],
    state: "complete",
    value: { status: "reported", cents: eur(2240) },
    passedThrough: eur(280),
    paid: { status: "reported", cents: eur(2240) },
    fromThreadId: null,
    payoutState: "completed",
  },
  {
    id: "oh3",
    title: "Toubkal Winter Week",
    peak: "toubkal",
    from: dayIn(-358),
    to: dayIn(-350),
    departureIso: departureIn(-358),
    grade: "Moderate",
    category: "other",
    clientIds: ["oc7"],
    state: "complete",
    value: { status: "reported", cents: eur(1480) },
    passedThrough: eur(120),
    paid: { status: "reported", cents: eur(1480) },
    fromThreadId: null,
    payoutState: "completed",
  },
  {
    id: "oh4",
    title: "Lobuche East Climb",
    peak: "lobuche-east",
    from: dayIn(-336),
    to: dayIn(-328),
    departureIso: departureIn(-336),
    grade: "Technical",
    category: "expedition",
    clientIds: ["oc2"],
    state: "complete",
    value: { status: "reported", cents: eur(1880) },
    passedThrough: eur(150),
    paid: { status: "reported", cents: eur(1880) },
    fromThreadId: null,
    payoutState: "completed",
  },
];

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * SEVEN CONVERSATIONS, SIX OF THEM UNREAD, so the chat list, the tab-bar badge
 * and the "waiting N hours for a reply" line all have something real to derive
 * from. One group thread and one voice note, because both render differently.
 *
 * The composer stays disabled offline exactly as it is online — see
 * `offline/state.ts` for why an offline flag is not allowed to switch on a
 * capability this product does not have.
 */
export const OFFLINE_THREADS: Thread[] = [
  {
    id: "ot1",
    title: null,
    clientIds: ["oc1"],
    bookingId: "ob1",
    unread: 2,
    messages: [
      {
        id: "om1",
        fromClientId: null,
        body: "Hi Ines — I have us on the Hörnli for the 14th, weather permitting.",
        at: hoursAgo(53),
      },
      {
        id: "om2",
        fromClientId: "oc1",
        body: "Perfect. I have finally sorted boots that fit, which is a first.",
        at: hoursAgo(7),
      },
      {
        id: "om3",
        fromClientId: "oc1",
        body: "Do we still want the hut on the Thursday night or has that moved?",
        at: hoursAgo(6),
      },
    ],
  },
  {
    id: "ot2",
    title: null,
    clientIds: ["oc2"],
    bookingId: "ob4",
    unread: 1,
    messages: [
      {
        id: "om4",
        fromClientId: "oc2",
        body: "Booked my train to Grindelwald. Arriving the evening before.",
        at: hoursAgo(21),
      },
    ],
  },
  {
    id: "ot3",
    title: "Mont Blanc — the September three",
    clientIds: ["oc4", "oc5", "oc6"],
    bookingId: "ob3",
    unread: 3,
    messages: [
      {
        id: "om5",
        fromClientId: null,
        body: "Kit list is in the trip notes. Shout if anything on it is unclear.",
        at: hoursAgo(34),
      },
      {
        id: "om6",
        fromClientId: "oc4",
        body: "Is the Goûter hut confirmed for the Friday?",
        at: hoursAgo(30),
      },
      {
        id: "om7",
        fromClientId: "oc5",
        body: "I have borrowed crampons — will bring them to the shop check.",
        at: hoursAgo(29),
      },
      {
        id: "om8",
        fromClientId: "oc6",
        body: "Forecast looks settled from the Wednesday. Fingers crossed.",
        at: hoursAgo(28),
      },
    ],
  },
  {
    id: "ot4",
    title: null,
    clientIds: ["oc3"],
    bookingId: "ob2",
    unread: 0,
    messages: [
      {
        id: "om9",
        fromClientId: "oc3",
        body: "Deposit sent. I am nervous about the fixed lines, honestly.",
        at: hoursAgo(72),
      },
      {
        id: "om10",
        fromClientId: null,
        body: "Everyone is. We will spend a full day on them before we go up.",
        at: hoursAgo(70),
      },
    ],
  },
  {
    id: "ot5",
    title: null,
    clientIds: ["oc7"],
    bookingId: null,
    unread: 0,
    messages: [
      {
        id: "om11",
        fromClientId: "oc7",
        body: "Thank you for the Toubkal week — I have not stopped talking about it.",
        at: hoursAgo(96),
      },
      {
        id: "om12",
        fromClientId: null,
        body: "You moved really well on the last day. Come back for something steeper.",
        at: hoursAgo(94),
      },
    ],
  },
  {
    id: "ot6",
    title: null,
    clientIds: ["oc5"],
    bookingId: "ob3",
    unread: 0,
    messages: [
      {
        id: "om13",
        fromClientId: "oc5",
        body: "Could you send the gear list again? I have lost the first one.",
        at: hoursAgo(78),
      },
      {
        id: "om14",
        fromClientId: null,
        body: "Sent — it is also pinned in the group thread.",
        at: hoursAgo(77),
      },
    ],
  },
  {
    id: "ot7",
    title: "Ama Dablam — autumn team",
    clientIds: ["oc1", "oc3", "oc6"],
    bookingId: "ob2",
    unread: 0,
    messages: [
      {
        id: "om15",
        fromClientId: "oc3",
        body: "Permits are in. Flights land in Kathmandu on the 3rd.",
        at: hoursAgo(11),
      },
      {
        id: "om16",
        fromClientId: null,
        body: "Good. Two nights low, then we walk — no shortcuts on acclimatisation.",
        at: hoursAgo(10.4),
      },
      {
        id: "om17",
        fromClientId: "oc6",
        body: "Understood. I will bring the spare regulator for the stove.",
        at: hoursAgo(10),
      },
      { id: "om18", fromClientId: null, body: "", at: hoursAgo(9.6), voiceSeconds: 31 },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Availability                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The guide's own calendar, ten weeks of it, so the month view is never blank.
 *
 * BOOKED DAYS ARE NOT SEEDED HERE. The availability screen derives them from the
 * bookings themselves so the calendar cannot disagree with the trips, and the
 * store strips any "booked" it finds in a seed.
 *
 * A DAY ABSENT FROM THIS MAP IS "NOT SET", WHICH IS NOT "UNAVAILABLE".
 */
export const OFFLINE_DAY_STATES: Record<string, DayState> = (() => {
  const m: Record<string, DayState> = {};
  const set = (offset: number, s: DayState) => (m[dayIn(offset)] = s);
  for (let i = -6; i <= 66; i++) set(i, "available");
  for (const i of [2, 3, 17, 44, 45]) set(i, "partial");
  for (const i of [-3, -2, 21, 22, 54, 55, 64, 65]) set(i, "unavailable");
  return m;
})();
