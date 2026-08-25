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
 */
export const DEMO_CONVERSATIONS: Conversation[] = import.meta.env.DEV
  ? [
      /* -- A booked guide: the channel is OPEN, and this is what it is for --- */
      {
        id: "c1",
        name: "Tobias Frei",
        kind: "guide",
        credential: "IFMGA / UIAGM mountain guide",
        verifiedOn: "5 Jun 2026",
        peak: "Matterhorn",
        unread: 2,
        booking: { ref: "ICE-4471", peak: "Matterhorn — Hörnli ridge", dateLabel: "18–20 Jul 2027" },
        messages: [
          {
            id: "m0",
            from: "them",
            kind: "system",
            body: "Booking confirmed. You can now message Tobias to plan your trip.",
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
        credential: "IFMGA / UIAGM mountain guide",
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
        credential: "Guiding company · 14 guides",
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
