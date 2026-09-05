/**
 * Conversations.
 *
 * THE RULE THIS FILE ENFORCES: A GUIDE OR COMPANY CAN ONLY TALK TO A CLIENT
 * AFTER THE CLIENT HAS BOOKED AND PAID.
 *
 * There is no free back-and-forth with a professional before money changes
 * hands. It closes the off-platform leak structurally — you cannot be talked
 * into paying a guide directly before there is an on-platform channel, because
 * the channel does not exist until you have paid on-platform — and it means the
 * pre-sale decision is made on STRUCTURED facts (the opening's stated
 * requirements, the price, what is and is not included, the cancellation terms,
 * the checked documents), not on a persuasive chat.
 *
 * The client is not trapped by this. The deposit is refundable under the
 * flexible policy, so a booking is a REFUNDABLE KEY that opens the conversation:
 * book, talk, and if it is not a fit, cancel inside the free window and get the
 * money back. See `@/money/model` (FLEXIBLE_POLICY).
 *
 * Group threads (an expedition party) and peer threads (two mountaineers) are
 * not commercial and carry no such gate — they are always open.
 *
 * Nothing here is real: nobody exists, nothing was sent, no booking was paid.
 */

export type Counterparty = "athlete" | "guide" | "company" | "group";
export type SendState = "queued" | "sending" | "sent" | "read" | "failed" | "unsent";

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  /** Who wrote it, in a group. */
  author?: string;
  body: string;
  at: string;
  state?: SendState;
  kind?: "text" | "system";
}

/** The paid booking that opened a guide/company conversation. */
export interface Booking {
  ref: string;
  peak: string;
  dateLabel: string;
}

export interface Conversation {
  id: string;
  name: string;
  kind: Counterparty;
  /** Guides and companies only — drives the verified tick. */
  credential?: string;
  verifiedOn?: string;
  peak?: string;
  members?: number;
  /** Companies only — their mark, gitignored and never deployed. */
  logo?: string;
  /** Groups only — an ICEFALL peak photograph, never a member's own. */
  photo?: string;
  pinned?: boolean;
  unread: number;
  /**
   * A guide channel opens on a PAID BOOKING; a company channel opens on a
   * QUALIFIED ENQUIRY. The two are different because the money is different — a
   * guide day-rate is an in-app purchase, an expedition is a €50k off-platform
   * wire ICEFALL never touches. Absence of the relevant one locks the channel.
   */
  booking?: Booking;
  /** Companies only — the qualified, readiness-verified enquiry ICEFALL passed on. */
  introduction?: { at: string; objective: string };
  messages: ChatMessage[];
}

export const ME = "You";

/**
 * A guide or company channel is locked until a booking is paid. Group and peer
 * channels are never locked. One function, so no screen can decide differently.
 */
export function isLocked(c: Conversation): boolean {
  if (c.kind === "guide") return !c.booking; // pay to open
  if (c.kind === "company") return !c.introduction; // qualified enquiry to open
  return false; // group and peer channels are never gated
}

/**
 * Dev only, like every other invented record in this app. A production build
 * shows the athlete's real threads and nothing else — see `useConversations`.
 *
 * EVERY `credential` BELOW SAYS IT IS INVENTED. The companies were already
 * labelled and the guides were not, so a bare "IFMGA / UIAGM mountain guide"
 * sat in the same list as "Sample listing — invented company" — two standards
 * in one list, with the unqualified one being the licence, which is the single
 * claim a climber acts on when choosing who to rope up with. `credential` is
 * rendered in `Messages.tsx` and `Thread.tsx`, so the qualifier is on screen
 * rather than in a note.
 *
 * The system line under a booking said a flat "Booking confirmed", which is a
 * transaction state, not sample colour. It now says the booking is invented.
 * `verifiedOn` is untouched and still drawn by nothing — see the note in
 * `Thread.tsx` for why that field renders nowhere.
 */

/**
 * Relative timestamps for the demo threads.
 *
 * Written against "now" rather than fixed dates so the list always reads
 * "Today / Yesterday / 3 days ago" instead of drifting into a wall of absolute
 * dates the longer the build sits unopened.
 */
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

export const DEMO_CONVERSATIONS: Conversation[] = import.meta.env.DEV
  ? [
      /* -- A booked guide: the channel is OPEN, and this is what it is for --- */
      {
        id: "c1",
        name: "Tobias Frei",
        kind: "guide",
        credential: "Sample thread — invented guide, states an IFMGA / UIAGM licence",
        verifiedOn: "5 Jun 2026",
        peak: "Matterhorn",
        unread: 2,
        booking: { ref: "ICE-4471", peak: "Matterhorn — Hörnli ridge", dateLabel: "18–20 Jul 2027" },
        messages: [
          {
            id: "m0",
            from: "them",
            kind: "system",
            body: "Invented booking. Nothing was paid and nobody was contacted — in a real one, payment is what opens this channel.",
            at: "2026-08-16T09:00:00Z",
          },
          {
            id: "m1",
            from: "me",
            body: "Hi Tobias — booked for the Hörnli, 18–20 July. Anything you want me to have dialled before then?",
            at: "2026-08-16T09:12:00Z",
            state: "read",
          },
          {
            id: "m2",
            from: "them",
            body: "Good to have you. The ridge is about moving fast on rock — keep the 1,200 m weeks going and be comfortable abseiling in crampons. We'll do a shakeout on the Riffelhorn the day before.",
            at: "2026-08-16T09:40:00Z",
          },
          {
            id: "m3",
            from: "me",
            body: "Perfect. I'll keep the vertical up.",
            at: "2026-08-16T10:02:00Z",
            state: "read",
          },
          {
            id: "m4",
            from: "them",
            body: "One thing — next time just pay me directly by bank transfer and I'll knock the platform fee off. Easier for both of us.",
            at: "2026-08-17T07:43:00Z",
          },
        ],
      },

      /* -- An interested guide, NOT booked: the channel is LOCKED ----------- */
      {
        id: "c5",
        name: "Nadia Berger",
        kind: "guide",
        credential: "Sample thread — invented guide, states an IFMGA / UIAGM licence",
        verifiedOn: "2 Mar 2026",
        peak: "Mont Blanc",
        unread: 0,
        messages: [],
      },

      /* -- A company you enquired with, NOT booked: LOCKED ------------------ */
      {
        id: "c3",
        name: "Chamonix Alpine Guides",
        kind: "company",
        credential: "Sample listing — invented company",
        verifiedOn: "11 Feb 2026",
        peak: "Gran Paradiso",
        unread: 0,
        messages: [],
      },

      /* -- A group: always open -------------------------------------------- */
      {
        id: "c2",
        name: "Mont Blanc — July party",
        kind: "group",
        members: 4,
        peak: "Mont Blanc",
        unread: 0,
        messages: [
          {
            id: "g0",
            from: "them",
            kind: "system",
            body: "Alex Martin added you to this group.",
            at: "2026-08-10T08:00:00Z",
          },
          {
            id: "g1",
            from: "them",
            author: "Alex Martin",
            body: "Refuge du Goûter is confirmed for the 21st. Four beds.",
            at: "2026-08-14T18:30:00Z",
          },
          {
            id: "g2",
            from: "them",
            author: "Priya Raman",
            body: "Has anyone done the Tramway before? Wondering how early we need to be at Le Nid d'Aigle.",
            at: "2026-08-15T07:15:00Z",
          },
          {
            id: "g3",
            from: "me",
            body: "First one up is 07:00 in July. We should be on the second at the latest.",
            at: "2026-08-15T07:41:00Z",
            state: "read",
          },
          {
            id: "g4",
            from: "them",
            author: "Jonas Lindqvist",
            body: "Agreed. I'll book the tickets once we're all confirmed.",
            at: "2026-08-15T08:02:00Z",
          },
        ],
      },

      /* -- A peer: always open --------------------------------------------- */
      {
        id: "c4",
        name: "Marta Ruiz",
        kind: "athlete",
        peak: "Breithorn",
        unread: 0,
        messages: [
          {
            id: "a1",
            from: "them",
            body: "Saw you're training for Mont Blanc too — how are you finding the vertical weeks?",
            at: "2026-08-17T06:10:00Z",
          },
          {
            id: "a2",
            from: "me",
            body: "Brutal but working. The 1,500 m weeks were the turning point.",
            at: "2026-08-17T11:55:00Z",
            // Written in the Solvay hut with no signal — on the device only.
            state: "queued",
          },
        ],
      },

      /* -- Expedition companies --------------------------------------------
         These were four real businesses, and every word attributed to them was
         written by ICEFALL — putting sentences directly into a named company's
         mouth, which is worse than inventing their rating. The names now match
         the invented operators in `services/operators.ts`, so the same four
         companies are fictional on both surfaces and neither can be read as
         correspondence with anybody. Still DEV-ONLY: `import.meta.env.DEV`
         above is a harder gate than the operator directory's, and it stays. */
      {
        id: "co-sst",
        name: "Falkenrath Expeditions",
        kind: "company",
        credential: "Sample listing — invented company, 8,000 m operator",
        peak: "Everest",
        unread: 2,
        introduction: { at: hoursAgo(30), objective: "Everest — South Col, spring 2027" },
        messages: [
          {
            id: "sst0",
            from: "them",
            kind: "system",
            body: "Your enquiry was passed on. You can now message this company.",
            at: hoursAgo(30),
          },
          {
            id: "sst1",
            from: "them",
            body: "Namaste! Thank you for your interest in our Everest expeditions. How can we help you today?",
            at: hoursAgo(1),
          },
        ],
      },
      {
        id: "co-ac",
        name: "Halvorsen Alpine",
        kind: "company",
        credential: "Sample listing — invented company, states IFMGA-led trips",
        peak: "Aconcagua",
        unread: 1,
        introduction: { at: hoursAgo(80), objective: "Aconcagua — normal route" },
        messages: [
          {
            id: "ac1",
            from: "me",
            body: "Are the January departures still open?",
            at: hoursAgo(30),
            state: "read",
          },
          {
            id: "ac2",
            from: "them",
            body: "Thank you! I'll check the dates and get back to you shortly.",
            at: hoursAgo(27),
          },
        ],
      },
      {
        id: "co-ee",
        name: "Zelenika High Altitude",
        kind: "company",
        credential: "Sample listing — invented company, 8,000 m logistics",
        peak: "Ama Dablam",
        unread: 0,
        introduction: { at: hoursAgo(120), objective: "Ama Dablam — south-west ridge" },
        messages: [
          {
            id: "ee1",
            from: "them",
            body: "Here's the itinerary outline you asked for on the Ama Dablam expedition.",
            at: hoursAgo(51),
          },
        ],
      },
      {
        id: "co-14p",
        name: "Callaghan Himalaya",
        kind: "company",
        credential: "Sample listing — invented company, Himalayan operator",
        peak: "Mera Peak",
        unread: 0,
        introduction: { at: hoursAgo(150), objective: "Mera Peak — trekking peak" },
        messages: [
          {
            id: "p1",
            from: "them",
            body: "Do you need help with permits or gear for your upcoming trek?",
            at: hoursAgo(75),
          },
        ],
      },

      /* -- Guides ----------------------------------------------------------- */
      {
        id: "g-pasang",
        name: "Pasang Sherpa",
        kind: "guide",
        credential: "Sample thread — invented guide, states an IFMGA licence",
        verifiedOn: "12 Jun 2026",
        peak: "Everest",
        unread: 1,
        booking: { ref: "ICE-5120", peak: "Everest — South Col", dateLabel: "Mar–May 2027" },
        messages: [
          { id: "ps1", from: "them", body: "See you at base camp tomorrow!", at: hoursAgo(2) },
        ],
      },
      {
        id: "g-nima",
        name: "Nima Dorjee",
        kind: "guide",
        credential: "Sample thread — invented guide, states a high-altitude record",
        verifiedOn: "3 Mar 2026",
        peak: "Everest",
        unread: 2,
        booking: { ref: "ICE-5121", peak: "Everest — rotations", dateLabel: "Apr 2027" },
        messages: [
          {
            id: "nd1",
            from: "them",
            body: "Weather looks good for the summit push — I'll confirm the window tomorrow.",
            at: hoursAgo(26),
          },
        ],
      },
      {
        id: "g-alex",
        name: "Alex Martin",
        kind: "guide",
        credential: "Sample thread — invented guide, states a doctor’s role",
        verifiedOn: "9 Jan 2026",
        peak: "Everest",
        unread: 0,
        booking: { ref: "ICE-5122", peak: "Everest — medical cover", dateLabel: "Spring 2027" },
        messages: [
          {
            id: "am1",
            from: "them",
            body: "Remember to hydrate well and rest before the rotation.",
            at: hoursAgo(50),
          },
        ],
      },

      /* -- Groups ----------------------------------------------------------- */
      {
        id: "gr-everest",
        name: "Everest Spring 2027 Team",
        kind: "group",
        members: 12,
        peak: "Everest",
        photo: "/img/everest.jpg",
        pinned: true,
        unread: 3,
        messages: [
          {
            id: "ge1",
            from: "them",
            author: "Nima",
            body: "Flight to Lukla confirmed for 12 May.",
            at: hoursAgo(1.5),
          },
        ],
      },
      {
        id: "gr-ama",
        name: "Ama Dablam Expedition",
        kind: "group",
        members: 8,
        peak: "Ama Dablam",
        photo: "/img/gran-paradiso.jpg",
        pinned: true,
        unread: 1,
        messages: [
          {
            id: "ga1",
            from: "them",
            author: "Pasang",
            body: "Gear check-in at base camp at 6 PM.",
            at: hoursAgo(28),
          },
        ],
      },
      {
        id: "gr-photo",
        name: "Himalaya Photography Club",
        kind: "group",
        members: 45,
        photo: "/img/everest-1.jpg",
        unread: 0,
        messages: [
          {
            id: "gp1",
            from: "them",
            author: "Sara",
            body: "Just shared some photos from the Khumbu Valley.",
            at: hoursAgo(52),
          },
        ],
      },
    ]
  : [];

export const OFF_PLATFORM_WARNING =
  "Paying outside ICEFALL means your money is not held until you meet, there are no cancellation terms, and there is no record of what was agreed. If a guide asks you to pay them directly, you can report it here.";

export const LOCKED_EXPLAINER =
  "You can message a guide once you have booked them. It keeps every arrangement, price and cancellation term on the record — and your deposit is refundable up to 14 days before you start, so booking to talk costs you nothing if it turns out not to be the right trip.";

export const LOCKED_EXPLAINER_COMPANY =
  "An expedition is arranged directly with the company, not paid through ICEFALL. To open the channel, send a qualified enquiry — ICEFALL passes it on with your verified experience and current readiness, so you reach them as a climber they can size up, not a cold email. It costs you nothing.";

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function lastMessage(c: Conversation): ChatMessage | undefined {
  return c.messages[c.messages.length - 1];
}
