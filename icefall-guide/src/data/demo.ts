/**
 * THE SEED — invented data, gated at definition, matched to the owner's mockup.
 *
 * Nothing here is real. This guide does not exist, the clients never wrote, and
 * no money has ever moved through ICEFALL. It exists so the screens can be
 * judged with something in them.
 *
 * EVERY EXPORT BELOW IS EMPTY OR NULL IN AN ORDINARY BUILD. The gate is
 * `SHOW_DEMO_DATA` and it is applied at the DEFINITION, not at the render, so a
 * plain `npm run build` produces a bundle that does not contain the strings at
 * all. Gating the render leaves the invented names and licence numbers sitting
 * in `index-*.js` for anyone to read. See `lib/demoFlag.ts` for the
 * deployment-protection precondition, which is not optional.
 *
 * ON THE NAME "ALEX MARTIN", because a future session will otherwise re-raise
 * it: constitution §12 lists *"Invented guide 'Alex Martin', 4.9★, 127
 * reviews"* as a FIXED honesty violation in `icefall-app`. That was a
 * CLIMBER-FACING listing — a stranger could have hired him off it — and the
 * rating and review count were presented as measured. This is the same name in
 * the owner's own mockup, used for the guide's OWN profile in their OWN tool,
 * behind the demo flag and under a banner saying it is invented. Different
 * surface, different audience, different claim. The owner was told of the
 * coincidence before this was written.
 *
 * DATES ARE RELATIVE, NOT THE MOCKUP'S LITERAL 2025. A fixture with a fixed
 * calendar goes stale and starts contradicting itself — the mockup's May 2025
 * trips would render under "Upcoming" while being fifteen months past, which is
 * a demo that lies about its own contents. Content matched, calendar live.
 */

import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { sample, sampleOrNull } from "@/domain/sampleGate";
/**
 * THE OFFLINE BUILD READS ITS OWN FIXTURES, NOT THIS SEED.
 *
 * `VITE_ICEFALL_OFFLINE=1` produces a build with no server, no session and no
 * photographs, meant to be clicked through on a plane. It cannot rely on
 * `SHOW_DEMO_DATA`, which is true in `npm run dev` and false in an ordinary
 * build — an offline build made the ordinary way would open on "no guide
 * account is signed in on this device".
 *
 * So each export below carries one guarded branch, and the gate is still at the
 * DEFINITION exactly as the header above requires: with the flag unset the
 * offline values are never read, and the expression that remains is character
 * for character the one that was here before. The fixtures themselves live in
 * `src/offline/` and are imported by nothing else.
 */
import { OFFLINE } from "@/offline/offline";
import {
  OFFLINE_APPLICATION,
  OFFLINE_BOOKINGS,
  OFFLINE_CLIENTS,
  OFFLINE_DAY_STATES,
  OFFLINE_GUIDE,
  OFFLINE_ROUTES,
  OFFLINE_THREADS,
} from "@/offline/fixtures";
import { dayOffset, middayOffset, parseDay } from "@/lib/day";
import type { BookingValue, ViewEvent } from "@/domain/honesty";
import type { GuideApplication } from "./model";
import { eur as cents, type Cents } from "@/money/model";

/**
 * THE LONG FORM, shown on Home and nowhere else. The everywhere-disclosure is
 * the strip in `components/SampleBanner.tsx`, mounted once above the router.
 *
 * The split is deliberate and each half does a job the other cannot. The strip
 * is short, fixed, permanent and unscrollable, so it reaches all eighteen
 * screens without becoming wallpaper. This sentence names what specifically is
 * invented and carries the door to a real account, which is worth reading once,
 * on the screen a guide lands on.
 *
 * It ran to three lines on eight screens until the owner cut it on 2026-08-30,
 * and they were right — a notice repeated everywhere is one nobody reads (§6h).
 * What it has to do is stop a reviewer mistaking this account for a real one; it
 * does not have to explain itself at every stop.
 *
 * "AND NOTHING IS SAVED" WAS DROPPED, AND THE REASON IS THE POINT. It was true
 * when written: this app persisted nothing. It became FALSE the day the listing
 * and availability stores landed — a guide who sets their calendar, reads
 * "nothing is saved" and closes the app would reasonably think their work was
 * gone, when it is on the device. Nothing edited that clause; the world moved
 * under it, exactly as `BACKEND_NOT_CONNECTED` did when a client was installed.
 *
 * The surviving sentence says only what the SEED is, which no future capability
 * can falsify. Where saving genuinely happens, the screen that saves says so —
 * Availability, What I guide and Edit profile each carry "Saved on this phone".
 */
export const DEMO_NOTICE = "Sample data — this account, its clients and its bookings are invented.";

/** Re-exported so screens have one import for a day. See `@/lib/day`. */
export { parseDay };

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

const now = new Date();
const hoursAgo = (h: number): string => new Date(now.getTime() - h * 3_600_000).toISOString();
/** A CALENDAR DAY — a date on a certificate, or the start/end of a trip. */
const dayIn = (d: number): string => dayOffset(now, d);
/**
 * A DEPARTURE, as an unambiguous instant at local midday. The shared money model
 * does `new Date(departureIso) <= now` to decide whether a payout releases, and
 * a bare day string would reach it as UTC midnight — releasing most of a day
 * early in Zermatt and late in Anchorage. See `@/lib/day`.
 */
const departureIn = (d: number): string => middayOffset(now, d);

/* -------------------------------------------------------------------------- */
/* The guide                                                                   */
/* -------------------------------------------------------------------------- */

export interface GuideProfile {
  name: string;
  title: string;
  nationality: string;
  basedIn: string;
  languages: string[];
  yearsGuiding: number;
  bio: string;
  dailyRateEur: number;
  /** A peak id from the credited library, used as the home hero. */
  heroPeak: string;
}

/**
 * NULL IN AN ORDINARY BUILD, and every screen handles that. A signed-out app has
 * no guide, and inventing a name to fill the gap is how a fictional
 * professional's credentials end up in a public bundle.
 */
export const ME: GuideProfile | null = OFFLINE
  ? OFFLINE_GUIDE
  : !SHOW_DEMO_DATA
    ? null
    : {
        name: "Alex Martin",
        title: "IFMGA Mountain Guide",
        nationality: "French",
        basedIn: "Chamonix, Haute-Savoie",
        languages: ["English", "French"],
        yearsGuiding: 12,
        bio: "IFMGA certified mountain guide with 12+ years of experience leading expeditions across the Himalayas and Alps.",
        dailyRateEur: 690,
        heroPeak: "everest",
      };

/**
 * What this guide offers, as their STARTING LISTING — mountains AND treks.
 *
 * Not derived from bookings. A guide offers ground they are willing to take
 * people onto, which is a statement they make — bookings are what happens
 * against it afterwards, and a guide with no bookings still has a listing.
 */
export const SEED_ROUTES: {
  kind: "mountain" | "trek";
  routeId: string;
  routes: string;
  grade: "Introductory" | "Moderate" | "Technical" | "Expedition";
  dayRateEur: number;
  typicalDays: number;
  requires: string;
}[] = OFFLINE
  ? OFFLINE_ROUTES
  : !SHOW_DEMO_DATA
    ? []
    : [
        {
          kind: "mountain",
          routeId: "mont-blanc",
          routes: "Goûter route, Trois Monts",
          grade: "Moderate",
          dayRateEur: 690,
          typicalDays: 3,
          requires: "Crampon-confident, comfortable with 1,200 m of ascent in a day",
        },
        {
          kind: "mountain",
          routeId: "matterhorn",
          routes: "Hörnli ridge",
          grade: "Technical",
          dayRateEur: 950,
          typicalDays: 2,
          requires: "Grade AD, moving together on rock, previous 4,000 m summit",
        },
        {
          kind: "mountain",
          routeId: "ama-dablam",
          routes: "South West ridge",
          grade: "Expedition",
          dayRateEur: 780,
          typicalDays: 14,
          requires: "Fixed-rope ascending, previous 6,000 m peak, three weeks free",
        },
        {
          kind: "mountain",
          routeId: "everest",
          routes: "Base camp trek, Kala Patthar",
          grade: "Introductory",
          dayRateEur: 340,
          typicalDays: 14,
          requires: "Able to walk 6 hours a day on consecutive days",
        },
        {
          kind: "mountain",
          routeId: "lobuche-east",
          routes: "North east ridge",
          grade: "Technical",
          dayRateEur: 520,
          typicalDays: 8,
          requires: "Crampons and axe, comfortable on 45° snow",
        },
        {
          kind: "mountain",
          routeId: "island-peak",
          routes: "Normal route",
          grade: "Moderate",
          dayRateEur: 460,
          typicalDays: 9,
          requires: "Trekking fitness, willing to learn rope work on the hill",
        },
        {
          kind: "trek",
          routeId: "tour-du-mont-blanc",
          routes: "Anti-clockwise, hut to hut",
          grade: "Moderate",
          dayRateEur: 310,
          typicalDays: 11,
          requires: "Able to walk 6–8 hours a day for ten days with a light pack",
        },
        {
          kind: "trek",
          routeId: "everest-base-camp-trek",
          routes: "Lukla in, Kala Patthar, Lukla out",
          grade: "Introductory",
          dayRateEur: 280,
          typicalDays: 14,
          requires: "Able to walk 6 hours a day on consecutive days",
        },
      ];

/* -------------------------------------------------------------------------- */
/* Verification                                                                */
/* -------------------------------------------------------------------------- */

const EMPTY_APPLICATION: GuideApplication = {
  status: "draft",
  submittedAt: null,
  documents: [],
};

/**
 * THE SEED IS SUBMITTED, NOT APPROVED, AND ICEFALL HAS DECIDED NOTHING ABOUT IT.
 *
 * It used to read `status: "approved"` with
 * `review: { decidedAt: <85 days ago>, decidedBy: "ICEFALL — CP" }`, which
 * `verificationSentence()` rendered on three screens as
 * **"Documents checked by ICEFALL on 11 Jun 2026."**
 *
 * Every other invented thing in this file is a claim about a fiction — Alex
 * Martin does not exist, so neither do his clients, his trips or his income, and
 * the strip over the screen says so. That sentence is the one claim in the app
 * that reaches OUT of the fiction and asserts something about ICEFALL: that
 * ICEFALL performs document checks, records them, and dated one to a named
 * member of staff. A sample-data label cannot cover it, because the label
 * disclaims the account and the reader's question is about the platform. No
 * guide has ever been checked. Initials on the record made it worse, not
 * better — they read as a real person's.
 *
 * The listing screens are unchanged in shape; they simply show the state every
 * real guide will actually start in, which is also the only verification state
 * this product can currently demonstrate honestly. `submitted` says "we have
 * your documents, nobody has looked at them yet", `verificationSentence()`
 * returns "Not checked by ICEFALL.", and no credentials mark is granted from a
 * seed — which is the rule the constitution already sets for badges.
 *
 * Restore `approved` only alongside a real recorded decision. A date here is a
 * date somebody at ICEFALL is being said to have worked on.
 */
export const APPLICATION: GuideApplication = OFFLINE
  ? OFFLINE_APPLICATION
  : !SHOW_DEMO_DATA
    ? EMPTY_APPLICATION
    : {
        status: "submitted",
        submittedAt: hoursAgo(24 * 88),
        documents: [
          {
            kind: "guiding-licence",
            fileName: "ifmga-carnet-2026.pdf",
            uploadedAt: hoursAgo(24 * 88),
            expiry: { status: "recorded", on: dayIn(489), source: "printed_on_document" },
            reference: "FR-4471",
          },
          {
            kind: "first-aid",
            fileName: "wfr-certificate.pdf",
            uploadedAt: hoursAgo(24 * 88),
            /* Deliberately self-reported AND inside the warning window — the one
             document whose date is about to hide a listing is the one where
             "who told us this" is worth the guide seeing. */
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
            // "Not recorded" is not "no expiry" and must never render as either.
            expiry: { status: "none" },
          },
        ],
        /* NO `review`. See the header above: an ICEFALL decision is the one
           field in this file that cannot be invented, because it is a statement
           about ICEFALL rather than about the invented guide. */
      };

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  from: string;
  /** Whether they are on the app right now. Drives the green dot. */
  online: boolean;
  notes: string;
}

export const CLIENTS: Client[] = OFFLINE
  ? OFFLINE_CLIENTS
  : !SHOW_DEMO_DATA
    ? []
    : [
        {
          id: "c1",
          name: "Nima Dorjee",
          email: "nima.dorjee@example.com",
          phone: "+977 98123 45678",
          from: "Kathmandu, Nepal",
          online: true,
          notes: "Prefers gradual acclimatization and good food on treks.",
        },
        {
          id: "c2",
          name: "Sara Khumbu",
          email: "sara.khumbu@example.com",
          phone: "+977 98455 21100",
          from: "Namche, Nepal",
          online: true,
          notes: "Strong on rock, less confident on steep snow.",
        },
        {
          id: "c3",
          name: "Jason Wong",
          email: "jason.wong@example.com",
          phone: "+65 8123 4455",
          from: "Singapore",
          online: false,
          notes: "First 6,000 m peak last season. Wants Ama Dablam next.",
        },
        {
          id: "c4",
          name: "Michelle Lee",
          email: "michelle.lee@example.com",
          phone: "+1 415 555 0182",
          from: "San Francisco, USA",
          online: true,
          notes: "Asks for the gear list early. Vegetarian.",
        },
        {
          id: "c5",
          name: "David Thompson",
          email: "d.thompson@example.com",
          phone: "+44 7700 900321",
          from: "Edinburgh, Scotland",
          online: false,
          notes: "Winter Scottish background. Very fit, low altitude experience.",
        },
        {
          /**
           * NAMED "LHAKPA SHERPA" UNTIL 2026-09-04, WHICH IS A REAL PERSON.
           *
           * Lhakpa Sherpa is a living, identifiable mountaineer who holds the
           * women's record for Everest summits. This record hung an invented
           * email, an invented phone number, an invented booking, an invented
           * payment and the invented note "has climbed with me four seasons
           * running" on her name.
           *
           * That is owner decision 2 in the constitution, applied to a person
           * instead of a company: real, identifiable parties must not appear
           * carrying invented attributes, and the remedy recorded there is to
           * swap in an obviously-fictional name so the exposure disappears
           * rather than to caption it. It is also strictly worse than the
           * company case the decision was written for — a false booking against
           * a professional climber's name is a claim about her working life,
           * and `components/Photo.tsx` already refuses to attach a real FACE to
           * an invented client for the same reason. A name is the same claim
           * with the picture left out.
           *
           * The replacement follows the convention already in this file — a
           * given name with a place standing in for a surname, as in "Sara
           * Khumbu" — so it reads as a person without being one.
           */
          id: "c6",
          name: "Pasang Khumjung",
          email: "pasang.khumjung@example.com",
          phone: "+977 98511 33220",
          from: "Lukla, Nepal",
          online: false,
          notes: "Has climbed with me four seasons running.",
        },
      ];

export const clientById = (id: string): Client | undefined =>
  visibleClients().find((c) => c.id === id);

/**
 * THE ACCESSORS EVERY SCREEN MUST USE.
 *
 * The raw `ME`, `CLIENTS` and `APPLICATION` constants are the sample. These wrap
 * them in the gate so a signed-in account cannot be shown the invented guide's
 * clients or application — the §6aj displacement audit found twelve screens
 * reading them straight through. Reading the constant directly is now the
 * mistake; reading these is the only way to get the data.
 */
export const visibleMe = (): GuideProfile | null => sampleOrNull(ME);
export const visibleClients = (): Client[] => sample(CLIENTS, []);
export const visibleApplication = (): GuideApplication => sample(APPLICATION, EMPTY_APPLICATION);

/* -------------------------------------------------------------------------- */
/* Bookings                                                                    */
/* -------------------------------------------------------------------------- */

export type TripGrade = "Moderate" | "Technical" | "Expedition";

/**
 * What kind of work this was, for the earnings breakdown.
 *
 * A STATED FIELD, never inferred from the grade or the party size. Nothing about
 * a trip's difficulty reveals whether it was sold as an expedition or as a
 * private day, and guessing would put an invented split on a chart about
 * somebody's income. Same rule as `passedThrough` — the caller says, or it is
 * not known.
 */
export type TripCategory = "expedition" | "private" | "other";
export type BookingState = "confirmed" | "pending" | "complete" | "cancelled";

/** Mirrors `public.bookings` where `kind = 'guide'`, plus what the mockup shows. */
export interface GuideBooking {
  id: string;
  title: string;
  /** Peak id in the credited photo library — see `components/Photo.tsx`. */
  peak: string;
  from: string;
  to: string;
  departureIso: string;
  grade: TripGrade;
  category: TripCategory;
  clientIds: string[];
  state: BookingState;
  /** What the booking is worth, or why we do not know. Never a bare number. */
  value: BookingValue;
  /**
   * Huts, permits and lifts the guide collects and hands straight on. ICEFALL
   * takes no commission on these (owner decision 13), and it cannot be inferred
   * from a total — a booking that does not say has none.
   */
  passedThrough: Cents;
  paid: BookingValue;
  /** The enquiry it came from. NULL is a real answer — a walk-up. */
  fromThreadId: string | null;
  payoutState: "deposit_paid" | "paid_in_full" | "completed" | "cancelled";
}

export const BOOKINGS: GuideBooking[] = OFFLINE
  ? OFFLINE_BOOKINGS
  : !SHOW_DEMO_DATA
    ? []
    : [
        {
          id: "b1",
          title: "Everest Base Camp Trek",
          peak: "everest",
          from: dayIn(14),
          to: dayIn(27),
          departureIso: departureIn(14),
          grade: "Moderate",
          category: "other",
          clientIds: ["c1", "c2"],
          state: "confirmed",
          value: { status: "reported", cents: cents(2400) },
          passedThrough: cents(310),
          paid: { status: "reported", cents: cents(2400) },
          fromThreadId: "t1",
          payoutState: "paid_in_full",
        },
        {
          id: "b2",
          title: "Ama Dablam Expedition",
          peak: "ama-dablam",
          from: dayIn(40),
          to: dayIn(54),
          departureIso: departureIn(40),
          grade: "Technical",
          category: "expedition",
          clientIds: ["c3"],
          state: "pending",
          value: { status: "reported", cents: cents(3200) },
          passedThrough: cents(640),
          paid: { status: "reported", cents: cents(640) },
          fromThreadId: "t4",
          payoutState: "deposit_paid",
        },
        {
          id: "b3",
          title: "Mont Blanc Ascent",
          peak: "mont-blanc",
          from: dayIn(65),
          to: dayIn(68),
          departureIso: departureIn(65),
          grade: "Moderate",
          category: "private",
          clientIds: ["c4", "c5", "c6"],
          state: "confirmed",
          value: { status: "reported", cents: cents(1800) },
          passedThrough: cents(240),
          paid: { status: "reported", cents: cents(900) },
          fromThreadId: "t6",
          payoutState: "deposit_paid",
        },
        {
          id: "b4",
          title: "Lobuche East Climb",
          peak: "lobuche-east",
          from: dayIn(72),
          to: dayIn(80),
          departureIso: departureIn(72),
          grade: "Technical",
          category: "expedition",
          clientIds: ["c2", "c6"],
          state: "confirmed",
          value: { status: "reported", cents: cents(2100) },
          passedThrough: cents(180),
          paid: { status: "reported", cents: cents(2100) },
          fromThreadId: null,
          payoutState: "paid_in_full",
        },
        {
          id: "b5",
          title: "Island Peak Ascent",
          peak: "island-peak",
          from: dayIn(-48),
          to: dayIn(-40),
          departureIso: departureIn(-48),
          grade: "Moderate",
          category: "private",
          clientIds: ["c1"],
          state: "complete",
          value: { status: "reported", cents: cents(1950) },
          passedThrough: cents(150),
          paid: { status: "reported", cents: cents(1950) },
          fromThreadId: "t1",
          payoutState: "completed",
        },
        {
          id: "b6",
          title: "Mera Peak Expedition",
          peak: "mera-peak",
          from: dayIn(-96),
          to: dayIn(-84),
          departureIso: departureIn(-96),
          grade: "Expedition",
          category: "expedition",
          clientIds: ["c3", "c5"],
          state: "complete",
          /* DELIBERATELY VALUELESS. A booking taken before anyone recorded what it
           was worth is a real state the database models (`value_status =
           'pending'`) and the state most likely to be quietly rendered as €0.
           Seeding one puts the honest path on the screen. */
          value: { status: "pending" },
          passedThrough: 0,
          paid: { status: "pending" },
          fromThreadId: null,
          payoutState: "completed",
        },
        /* LAST SEASON — so the analytics comparison is arithmetic over two windows
         of real rows rather than a typed "+18%". A guide in their second season
         has a first season; seeding one is what lets the delta be computed. */
        {
          id: "h1",
          title: "Mont Blanc Ascent",
          peak: "mont-blanc",
          from: dayIn(-410),
          to: dayIn(-407),
          departureIso: departureIn(-410),
          grade: "Moderate",
          category: "private",
          clientIds: ["c5"],
          state: "complete",
          value: { status: "reported", cents: cents(1650) },
          passedThrough: cents(220),
          paid: { status: "reported", cents: cents(1650) },
          fromThreadId: null,
          payoutState: "completed",
        },
        {
          id: "h2",
          title: "Everest Base Camp Trek",
          peak: "everest",
          from: dayIn(-380),
          to: dayIn(-367),
          departureIso: departureIn(-380),
          grade: "Moderate",
          category: "other",
          clientIds: ["c1", "c6"],
          state: "complete",
          value: { status: "reported", cents: cents(2150) },
          passedThrough: cents(290),
          paid: { status: "reported", cents: cents(2150) },
          fromThreadId: null,
          payoutState: "completed",
        },
        {
          id: "h3",
          title: "Island Peak Ascent",
          peak: "island-peak",
          from: dayIn(-352),
          to: dayIn(-344),
          departureIso: departureIn(-352),
          grade: "Moderate",
          category: "expedition",
          clientIds: ["c3"],
          state: "complete",
          value: { status: "reported", cents: cents(1780) },
          passedThrough: cents(140),
          paid: { status: "reported", cents: cents(1780) },
          fromThreadId: null,
          payoutState: "completed",
        },
        {
          id: "h4",
          title: "Lobuche East Climb",
          peak: "lobuche-east",
          from: dayIn(-330),
          to: dayIn(-322),
          departureIso: departureIn(-330),
          grade: "Technical",
          category: "expedition",
          clientIds: ["c2"],
          state: "complete",
          value: { status: "reported", cents: cents(1900) },
          passedThrough: cents(160),
          paid: { status: "reported", cents: cents(1900) },
          fromThreadId: null,
          payoutState: "completed",
        },
        {
          id: "b7",
          title: "Aiguille du Midi — skills day",
          peak: "mont-blanc",
          from: dayIn(-12),
          to: dayIn(-12),
          departureIso: departureIn(-12),
          grade: "Moderate",
          category: "private",
          clientIds: ["c4"],
          state: "cancelled",
          value: { status: "reported", cents: cents(390) },
          passedThrough: 0,
          paid: { status: "unknown" },
          fromThreadId: null,
          payoutState: "cancelled",
        },
      ];

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

export interface Message {
  id: string;
  /** Null when the guide sent it. */
  fromClientId: string | null;
  body: string;
  at: string;
  /** A voice note renders as a waveform, per the mockup. Seconds. */
  voiceSeconds?: number;
}

export interface Thread {
  id: string;
  /** A group thread carries a trip and several clients. */
  title: string | null;
  clientIds: string[];
  bookingId: string | null;
  messages: Message[];
  /** Unread FROM the client, i.e. owed a reply. */
  unread: number;
}

export const THREADS: Thread[] = OFFLINE
  ? OFFLINE_THREADS
  : !SHOW_DEMO_DATA
    ? []
    : [
        {
          id: "t1",
          title: null,
          clientIds: ["c1"],
          bookingId: "b1",
          unread: 2,
          messages: [
            {
              id: "m1",
              fromClientId: null,
              body: "Hello Nima! How is everything going at base camp?",
              at: hoursAgo(50),
            },
            {
              id: "m2",
              fromClientId: "c1",
              body: "Hi Alex! We just arrived in Namche. All good here.",
              at: hoursAgo(9),
            },
            {
              id: "m3",
              fromClientId: "c1",
              body: "The teahouse has hot showers, which nobody warned me about.",
              at: hoursAgo(8),
            },
          ],
        },
        {
          id: "t2",
          title: null,
          clientIds: ["c2"],
          bookingId: "b1",
          unread: 1,
          messages: [
            {
              id: "m4",
              fromClientId: "c2",
              body: "Perfect! See you tomorrow morning.",
              at: hoursAgo(26),
            },
          ],
        },
        {
          id: "t3",
          title: "Adventure Seekers",
          clientIds: ["c3", "c4", "c5"],
          bookingId: "b3",
          unread: 3,
          messages: [
            {
              id: "m5",
              fromClientId: "c3",
              body: "Alex: Don't forget to bring spare gloves.",
              at: hoursAgo(30),
            },
            {
              id: "m6",
              fromClientId: "c4",
              body: "Is the hut booked for the Friday night?",
              at: hoursAgo(28),
            },
            {
              id: "m7",
              fromClientId: "c5",
              body: "I have the crampons sorted, borrowed a pair.",
              at: hoursAgo(27),
            },
          ],
        },
        {
          id: "t4",
          title: null,
          clientIds: ["c3"],
          bookingId: "b2",
          unread: 0,
          messages: [
            {
              id: "m8",
              fromClientId: "c3",
              body: "Thanks for an amazing experience!",
              at: hoursAgo(50),
            },
            {
              id: "m9",
              fromClientId: null,
              body: "Any time — you moved really well on the ridge.",
              at: hoursAgo(48),
            },
          ],
        },
        {
          id: "t5",
          title: null,
          clientIds: ["c6"],
          bookingId: "b4",
          unread: 0,
          messages: [
            {
              id: "m10",
              fromClientId: "c6",
              body: "The weather looks stable for the summit window.",
              at: hoursAgo(52),
            },
          ],
        },
        {
          id: "t6",
          title: null,
          clientIds: ["c4"],
          bookingId: "b3",
          unread: 0,
          messages: [
            {
              id: "m11",
              fromClientId: "c4",
              body: "Could you share the gear list again?",
              at: hoursAgo(74),
            },
            {
              id: "m12",
              fromClientId: null,
              body: "Sent — it is in the trip notes as well.",
              at: hoursAgo(72),
            },
          ],
        },
        {
          id: "t7",
          title: "Everest Base Camp Trek",
          clientIds: ["c1", "c2", "c6"],
          bookingId: "b1",
          unread: 0,
          messages: [
            {
              id: "m13",
              fromClientId: "c1",
              body: "Hi team! We just arrived in Namche. All good here.",
              at: hoursAgo(9),
            },
            {
              id: "m14",
              fromClientId: null,
              body: "Great to hear! Take rest and stay hydrated.",
              at: hoursAgo(8.7),
            },
            {
              id: "m15",
              fromClientId: "c2",
              body: "Perfect! See you all tomorrow morning.",
              at: hoursAgo(8.4),
            },
            { id: "m16", fromClientId: null, body: "", at: hoursAgo(8.1), voiceSeconds: 24 },
          ],
        },
      ];

export const threadById = (id: string): Thread | undefined => THREADS.find((t) => t.id === id);

/* -------------------------------------------------------------------------- */
/* Availability                                                                */
/* -------------------------------------------------------------------------- */

export type DayState = "available" | "booked" | "partial" | "unavailable";

/**
 * The guide's own calendar. NOTHING IN THE SCHEMA HOLDS THIS.
 * `guide_profiles.availability` is a single enum for the whole person and
 * `product_departures` is company-scoped, so dated guide availability lives only
 * in this app. Filed to the backend owner; the screen says so.
 *
 * A DAY NOT IN THIS MAP IS "NOT SET", WHICH IS NOT "UNAVAILABLE" — the athlete
 * app's `setDayAvailability` deletes the key rather than storing a default for
 * exactly this reason.
 */
export const DAY_STATES: Record<string, DayState> = OFFLINE
  ? OFFLINE_DAY_STATES
  : !SHOW_DEMO_DATA
    ? {}
    : (() => {
        const m: Record<string, DayState> = {};
        const set = (offset: number, s: DayState) => (m[dayIn(offset)] = s);
        for (let i = -6; i <= 60; i++) set(i, "available");
        for (const b of [
          { f: 14, t: 27 },
          { f: 40, t: 54 },
        ]) {
          for (let i = b.f; i <= b.t; i++) set(i, "booked");
        }
        for (const i of [3, 4, 10, 33, 34]) set(i, "partial");
        for (const i of [-2, -1, 7, 8, 29, 30, 58, 59]) set(i, "unavailable");
        return m;
      })();

/** Days before a trip after which the guide will not take a new booking. */
export const CUTOFF_DAYS = 2;

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * EMPTY IN EVERY BUILD, INCLUDING A DEMO ONE. Not an oversight — the point.
 *
 * Nothing in the ICEFALL family emits a `listing_view`, and
 * `public.analytics_events` has no guide or profile column, so even a working
 * emitter could not attribute a view of a guide's page. The demo flag permits
 * invented CONTENT; it does not permit an invented MEASUREMENT BASIS. A seeded
 * `server` row would light the tile with a real-looking number and defeat the
 * three-state reading that exists to prevent exactly that.
 */
export const VIEW_EVENTS: ViewEvent[] = [];

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

export const eur = (n: number) => `€${n.toLocaleString("en-GB")}`;

export function fmtRange(from: string, to: string): string {
  const f = parseDay(from);
  const t = parseDay(to);
  if (f === null || t === null) return from === to ? from : `${from} – ${to}`;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (from === to) return `${d(f)} ${f.getFullYear()}`;
  const sameYear = f.getFullYear() === t.getFullYear();
  return `${d(f)} – ${d(t)} ${sameYear ? t.getFullYear() : ""}`.trim();
}

export function fmtDate(iso: string): string {
  const d = iso.length <= 10 ? parseDay(iso) : new Date(iso);
  if (d === null || Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "09:41", "Yesterday", "2d ago" — the mockup's message-list stamp. */
export function fmtWhen(iso: string, at: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const days = Math.floor((at.getTime() - t.getTime()) / 86_400_000);
  if (days === 0) return t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
