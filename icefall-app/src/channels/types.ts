/**
 * COMPANY CHANNELS — the climber's half.
 *
 * A company broadcasts; members listen. The owner's words: "like on Instagram
 * when creators create channels". The full contract is
 * `icefall-sessions/13-CHANNELS-CONTRACT.md`; the parts that constrain THIS
 * file are below, because a type is where they can actually be enforced.
 *
 * ── RULE 3 IS GUARDED AT THE TYPE, NOT THE QUERY ────────────────────────────
 * A company may read how MANY people opened a message and never WHICH. RLS
 * enforces that at the database, but the rule only survives in the product
 * while nothing hands a screen a shape that could carry an identity. So the
 * count arrives as a bare `views: number` and there is deliberately no type in
 * this module that pairs a view with a person. A future "who viewed this"
 * screen is then not one careless join away from existing — there is nothing
 * for it to render.
 *
 * ── AND THERE IS NO REPLY ───────────────────────────────────────────────────
 * Not a hidden one, not a disabled one. There is no replies table, and the only
 * insert policy on `channel_messages` requires a company admin. A read-only
 * channel built as "a chat with the reply box hidden" is one forgotten prop
 * from being a chat. Two-way conversation is `threads`/`messages` — a different
 * feature with a different name.
 */

export interface Channel {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  coverPath: string | null;
  /**
   * A channel is archived, never deleted — members joined something and a
   * company must not be able to make it vanish from under them. An archived
   * channel stops accepting messages and stays readable.
   */
  archivedAt: string | null;
  /** Whether the reader holds a member row. Joining is done by the reader. */
  joined: boolean;
  /** Members mute themselves; a company cannot mute anybody. */
  muted: boolean;
}

/**
 * A product this message is promoting.
 *
 * NOT AN OFFER, and the difference matters enough that the contract spends a
 * section on it: an offer needs a thread and exactly one named recipient, so a
 * broadcast to 1,200 members cannot be one. Rendering an offer card here would
 * also leak the best price a company ever privately quoted. A member who wants
 * this promotion enquires, which opens a thread, which is where a real offer
 * lives.
 */
export interface ChannelPromotion {
  productId: string;
  departureId: string | null;
  productName: string | null;
  /**
   * Terms in the seller's own words, ≤300 chars — NEVER A PRICE. A number here
   * would be an unenforceable commitment sitting outside the money model.
   * Every real figure belongs to the product, or to an offer inside a thread.
   */
  promoNote: string | null;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  body: string;
  createdAt: string;
  promotion: ChannelPromotion | null;
  /**
   * Distinct people who opened this message, from the `channel_message_stats`
   * view — never counted client-side.
   *
   * A MEASURED ZERO IS `0`, and renders "0 views". `null` means the count did
   * not arrive and renders nothing at all. The two are different statements and
   * the UI must keep them apart.
   */
  views: number | null;
}

/** Every way the list can honestly be, so no screen renders a blank guess. */
export type ChannelFeed =
  | { status: "loading" }
  | { status: "no-backend" }
  | { status: "signed-out" }
  | { status: "unreachable" }
  | { status: "ready"; channels: Channel[] };

export const CHANNELS_NOT_CONNECTED =
  "Channels are not connected in this build, so there is nothing to read yet.";

/**
 * Printed where a reply box would be, on purpose.
 *
 * The guide session's lesson: a disabled control reads as "not built yet" and
 * invites the next person to finish it. The absence of a reply here is a
 * decision, so it is stated as one rather than left as a gap somebody tidies up.
 */
export const CHANNEL_ONE_WAY_NOTICE =
  "The company broadcasts; members listen. You cannot reply to a channel — by design, not because a reply box is missing. To talk to them, send an enquiry.";
