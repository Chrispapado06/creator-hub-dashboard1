import { useMemo, useSyncExternalStore } from "react";
import { GUIDE_COMMISSION_PCT } from "@/money/model";
import type { Availability } from "./types";

/**
 * The commercial half of the marketplace: terms, money and the conversation.
 *
 * WHY THIS IS A SEPARATE MODULE FROM `./store`
 *
 * `./store` owns the marketplace record — requests, illustrative quotes,
 * shortlist, local bookings — and is the module `useGuideStore` comes from.
 * This one owns everything a REQUEST, a QUOTE and a BOOKING need in order to be
 * commercially complete rather than merely present: the route, the client's own
 * account of their experience, the thread, the itemised costs, the cancellation
 * policy and ICEFALL's fee.
 *
 * The two are keyed together by the ids `./store` issues, so a request queued by
 * `useGuideStore().requestGuide` and the detail recorded here are the same
 * engagement seen from two sides. Nothing here duplicates a field that module
 * already holds — a fact stored twice is a fact that will disagree with itself.
 *
 * NOTHING HERE IS SENT AND NOTHING HERE IS CHARGED. There is no server and no
 * payment processor. `BookingTerms.paid` is the literal `false` so no code path
 * can claim otherwise, and the confirmation screen says so beside the Accept
 * control rather than after it.
 */

const STORAGE_KEY = "icefall.guides.engagement.v1";

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * ICEFALL's share of a booking, as a percentage — DEDUCTED FROM THE GUIDE.
 *
 * THE ONE PLACE THIS NUMBER EXISTS. Every sentence that mentions the fee
 * interpolates this constant instead of writing a figure, so changing it here
 * changes the product — rather than leaving stale copy on a confirmation screen
 * telling somebody they were charged something else. Configurable by design: a
 * marketplace commission is a commercial decision that will be revisited, and
 * it just was.
 *
 * THE MODEL, AS THE OWNER STATED IT (2026-08-28, constitution 3b), because a
 * percentage is ambiguous until somebody works an example:
 *
 *     A guide charges €1,000 for a day.
 *     The client pays €1,000. The guide receives €900. ICEFALL keeps €100.
 *
 * So the advertised price IS what the client pays, nothing is added at
 * checkout, and ICEFALL's cut comes out of the guide's earnings.
 *
 * WHAT THIS FILE USED TO DO, because it explains the shape of the change. The
 * rate was 12 and `quoteTotals` ADDED it: `totalEur = guideFee + additional +
 * platformFee`. That made this module disagree with `earningsFrom` sixty lines
 * below, which has always computed `netEur = grossEur - platformFeeEur` — so
 * one half of the guide's own dashboard told them the client paid extra and
 * they kept their whole fee, while the other half told them the fee came out of
 * it. Both cannot be true and the guide is the person who acts on the answer.
 * The deducted reading is now the only one.
 *
 * Engagements already agreed are NOT restated: `earningsFrom` reads the fee
 * stored on each booking rather than recomputing from this constant. See its
 * header.
 *
 * DERIVED, NOT DECLARED. The rate lives in `money/model.ts` — the canonical
 * copy generated from `icefall-shared` — and this is an alias so the guide
 * marketplace and the client checkout cannot hold two different numbers. They
 * already did once: this file carried 12 while the checkout carried 5, which is
 * how the same product quoted two commissions. The alias keeps the local name,
 * because it reads better on a guide's screen than the model's, and keeps the
 * single source.
 */
export const PLATFORM_COMMISSION_PCT = GUIDE_COMMISSION_PCT;

/**
 * The fee is charged on the GUIDE'S FEE ONLY, never on the whole total — and it
 * comes OUT of that fee rather than being added beside it.
 *
 * The other lines on a quote are pass-through: hut fees, permits, park entry,
 * lifts, transport. Taking a percentage of a national park's permit would mean
 * ICEFALL earning more because Nepal raised its charges, which is not a service
 * anyone rendered. Stated rather than implied, because a percentage against a
 * €60,000 expedition means two very different numbers depending on the base —
 * and a third different number depending on whether it is added or deducted,
 * which is the half this sentence used to leave to inference.
 */
export const PLATFORM_FEE_BASIS_NOTE =
  `ICEFALL's fee is ${PLATFORM_COMMISSION_PCT}% of the guide's fee only, and it is deducted from ` +
  "what the guide receives rather than added to what the client pays. " +
  "Permits, huts, lifts, transport and park charges pass through at cost and carry no ICEFALL fee.";

/**
 * Shown BESIDE the Accept control, not on the screen after it.
 *
 * Someone about to accept must already know that nothing has been taken and
 * that settling with the guide is still theirs to do. Learning it on the
 * confirmation is learning it too late.
 */
export const NO_PAYMENT_NOTICE =
  "No payment is taken. ICEFALL has no payment processor connected, so accepting records this on your device and moves no money — no deposit, no card authorisation, nothing. The figures below are what a guide would charge, not what anyone has charged.";

/** One line of a quote that is not the guide's own fee. */
export interface QuoteLine {
  id: string;
  label: string;
  amountEur: number;
  /** Why it is billed separately — hut fees, permits, transport, hire kit. */
  note?: string;
}

/**
 * A refund ladder. `fromDaysBefore` is inclusive and read largest-first, so
 * "60 days or more → 90%" and "30 days or more → 50%" compose without overlap.
 */
export interface CancellationTier {
  fromDaysBefore: number;
  refundPct: number;
}

export interface CancellationPolicy {
  summary: string;
  tiers: CancellationTier[];
  /** What happens when the GUIDE calls it off — weather, conditions, illness. */
  guideCancels: string;
}

/**
 * The ladder a guide's quote composer opens on.
 *
 * Not ICEFALL's terms and not a legal document — the guide edits it on their own
 * quote. It exists so the composer starts from something coherent, because an
 * empty cancellation box is how a booking ends up with no cancellation terms at
 * all and an argument three weeks before departure.
 */
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  summary:
    "Refunds depend on how much notice the guide gets. Dates held for one party rarely resell at short notice.",
  tiers: [
    { fromDaysBefore: 60, refundPct: 90 },
    { fromDaysBefore: 30, refundPct: 50 },
    { fromDaysBefore: 14, refundPct: 25 },
    { fromDaysBefore: 0, refundPct: 0 },
  ],
  guideCancels:
    "If the guide cancels for weather, conditions or their own illness, the fee is refunded in full or the dates moved — the athlete chooses which.",
};

export interface QuoteTotals {
  guideFeeEur: number;
  /** The sum of every pass-through line. */
  additionalEur: number;
  platformFeeEur: number;
  platformCommissionPct: number;
  /** What the client pays: the guide's fee plus pass-through costs. */
  totalEur: number;
  /** What reaches the guide once ICEFALL's cut is deducted. */
  guideReceivesEur: number;
}

export const sumLines = (lines: QuoteLine[]): number =>
  lines.reduce((total, line) => total + (Number.isFinite(line.amountEur) ? line.amountEur : 0), 0);

/**
 * ICEFALL's fee on a guide fee, rounded to whole euros — as it is displayed.
 *
 * Taken OUT of the guide's fee. It is never a line the client pays.
 */
export const platformFeeFor = (guideFeeEur: number): number =>
  Math.round((Math.max(0, guideFeeEur) * PLATFORM_COMMISSION_PCT) / 100);

/**
 * What the guide keeps from a fee, once ICEFALL's cut is deducted.
 *
 * Its own export so a screen never subtracts the two itself. A guide reading
 * "you receive" is reading the number they decide to take work on, and two
 * places doing that arithmetic is how they end up disagreeing.
 */
export const platformNetFor = (guideFeeEur: number): number =>
  Math.max(0, Math.round(guideFeeEur)) - platformFeeFor(guideFeeEur);

/**
 * Every figure a quote or booking displays, computed in one place.
 *
 * The total is built by addition from the lines above it, so a confirmation
 * cannot show a total that disagrees with its own breakdown — and the platform
 * fee is NOT one of those lines. The client's total is the guide's fee plus the
 * pass-through costs and nothing else; ICEFALL's cut is a division of that
 * total, not an addition to it.
 *
 * `guideReceivesEur` is the figure that matters most on this whole screen,
 * because it is the one a guide decides whether to accept work on.
 */
export function quoteTotals(input: {
  guideFeeEur: number;
  additionalCosts: QuoteLine[];
}): QuoteTotals {
  const guideFeeEur = Math.max(0, Math.round(input.guideFeeEur));
  const additionalEur = Math.round(sumLines(input.additionalCosts));
  const platformFeeEur = platformFeeFor(guideFeeEur);
  return {
    guideFeeEur,
    additionalEur,
    platformFeeEur,
    platformCommissionPct: PLATFORM_COMMISSION_PCT,
    // The client pays the advertised fee and the pass-through costs. Nothing
    // is added — see `PLATFORM_COMMISSION_PCT`.
    totalEur: guideFeeEur + additionalEur,
    // Pass-through costs are not the guide's earnings, so the commission comes
    // off the guide's fee and the pass-throughs are untouched by both parties.
    guideReceivesEur: guideFeeEur - platformFeeEur,
  };
}

/** Reads the ladder largest-first, so the tiers compose without overlapping. */
export function refundPctAt(policy: CancellationPolicy, daysBefore: number): number | null {
  const ordered = [...policy.tiers].sort((a, b) => b.fromDaysBefore - a.fromDaysBefore);
  const tier = ordered.find((t) => daysBefore >= t.fromDaysBefore);
  return tier ? tier.refundPct : null;
}

/* -------------------------------------------------------------------------- */
/* What the athlete told the guide                                             */
/* -------------------------------------------------------------------------- */

/**
 * The client's own account of what they have done.
 *
 * A coarse band THEY pick — never a level ICEFALL infers from their training.
 * A guide deciding whether to take somebody onto a glacier needs what the client
 * says about themselves, in their words, not a number derived from how many hill
 * walks this app happened to record.
 */
export type ExperienceBand =
  | "first-glaciated-route"
  | "some-alpine-days"
  | "independent-alpinist"
  | "prior-expedition";

export const EXPERIENCE_BAND_COPY: Record<ExperienceBand, string> = {
  "first-glaciated-route": "This would be my first glaciated or technical route",
  "some-alpine-days": "A handful of alpine days, always with someone more experienced",
  "independent-alpinist": "I lead moderate alpine routes independently",
  "prior-expedition": "I have been on a high-altitude expedition before",
};

export const EXPERIENCE_BANDS = Object.keys(EXPERIENCE_BAND_COPY) as ExperienceBand[];

/**
 * Detail attached to a request in `./store`, keyed by that request's id.
 *
 * These are the fields a guide actually needs and the marketplace record does
 * not carry. Kept here rather than pushed into `./store` so the two modules can
 * be developed independently — see the note at the top of this file.
 */
export interface EngagementDetail {
  /** Free text. Empty means NOT DECIDED, which is a real answer, not a gap. */
  route: string;
  experience: ExperienceBand;
  /** The ICEFALL goal this came from, for the link back. */
  goalId?: string;
  recordedAt: string;
}

export interface ThreadMessage {
  id: string;
  from: "athlete" | "guide";
  body: string;
  at: string;
}

/* -------------------------------------------------------------------------- */
/* Terms                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The commercial terms of a quote, keyed by the quote's id in `./store`.
 *
 * A quote without these is incomplete, and the thread says so rather than
 * filling the gaps in: an athlete who is shown a cancellation policy nobody
 * wrote will believe they have one.
 */
export interface QuoteTerms {
  /** Overrides the arithmetic quote's subtotal when the guide priced it by hand. */
  guideFeeEur: number;
  additionalCosts: QuoteLine[];
  included: string[];
  excluded: string[];
  cancellationPolicy: CancellationPolicy;
  /** `YYYY-MM-DD`. A quote with no expiry is not a quote. */
  validUntil: string;
  issuedAt: string;
  /** Written against a demo guide, so the figures are invented like the guide. */
  demo: boolean;
}

/**
 * What was agreed at the moment a quote was accepted, keyed by the booking id.
 *
 * Frozen deliberately. The platform fee and the percentage it came from are
 * stored rather than recomputed on render, so a later change to
 * `PLATFORM_COMMISSION_PCT` cannot silently restate what somebody agreed to.
 */
export interface BookingTerms {
  guideFeeEur: number;
  additionalCosts: QuoteLine[];
  platformFeeEur: number;
  platformCommissionPct: number;
  totalEur: number;
  included: string[];
  excluded: string[];
  cancellationPolicy: CancellationPolicy;
  confirmedAt: string;
  /**
   * ALWAYS FALSE, typed as the literal so nothing can set it. No processor is
   * connected and nothing has been charged. See `NO_PAYMENT_NOTICE`.
   */
  paid: false;
}

/* -------------------------------------------------------------------------- */
/* The guide's own account                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A single day in the guide's diary.
 *
 * Reuses `Availability` from `./types` — one vocabulary for the whole feature —
 * but the COPY differs, deliberately. On a profile the status is standing
 * ("Taking work"); on a calendar square it is about that square ("Available").
 * Same three states, two honest phrasings.
 */
export const DAY_AVAILABILITY_COPY: Record<Availability, string> = {
  available: "Available",
  limited: "Limited",
  unavailable: "Unavailable",
};

/**
 * What the guide has entered about themselves in the guide-account outline.
 *
 * NOTHING IS SEEDED. A rate nobody typed is not €0, a language list nobody
 * filled in is not "English", and an unmarked day is not available — each
 * renders its own absence. That is the rule the athlete side of this app already
 * follows, applied to the person being hired.
 */
export interface GuideListing {
  displayName?: string;
  basedIn?: string;
  /** EUR per guiding day. Undefined means NOT SET — never free. */
  dayRateEur?: number;
  mountains: string[];
  specialities: string[];
  languages: string[];
  /** Qualifications the guide CLAIMS. Nothing here is checked — see `./types`. */
  qualificationClaims: string[];
  /** `YYYY-MM-DD` → status. An absent key is NOT SET, which is not a promise. */
  availability: Record<string, Availability>;
}

const EMPTY_LISTING: GuideListing = {
  mountains: [],
  specialities: [],
  languages: [],
  qualificationClaims: [],
  availability: {},
};

/**
 * A category ICEFALL would have to check, and what checking it would take.
 *
 * Rendered on the guide dashboard so the outline is honest about the work
 * between a claim and a badge, rather than implying a badge is a setting
 * somebody forgot to switch on. NOTHING in this build performs any of it.
 */
export interface VerificationCategory {
  id: string;
  label: string;
  /** What ICEFALL would have to see. Written for the guide, not about them. */
  requirement: string;
  /** Why it matters to the athlete on the other side of the booking. */
  why: string;
}

export const VERIFICATION_CATEGORIES: VerificationCategory[] = [
  {
    id: "identity",
    label: "Identity",
    requirement: "Government photo identification matching the name on the profile.",
    why: "The person who meets the client at the trailhead is the person they booked.",
  },
  {
    id: "qualification",
    label: "Guiding qualification",
    requirement:
      "IFMGA/UIAGM carnet or national association membership, checked against the awarding body's own register — not a photograph of a certificate.",
    why: "IFMGA is the only internationally recognised mountain guide qualification.",
  },
  {
    id: "insurance",
    label: "Professional insurance",
    requirement: "Current professional liability cover, with the policy period and the limit.",
    why: "Cover that lapsed last season protects nobody on this one.",
  },
  {
    id: "first-aid",
    label: "Wilderness first aid",
    requirement: "In-date wilderness or mountain first-aid certification.",
    why: "Help is hours away above the snowline and the guide is the first responder.",
  },
  {
    id: "references",
    label: "Professional references",
    requirement: "Two references from a guides office, employer or national association.",
    why: "A qualification says what somebody can do; references say how they work.",
  },
];

export const VERIFICATION_NOT_RUN_NOTICE =
  "ICEFALL verifies nothing today. There is no verification team, no registry integration and no document pipeline, so every category below reads NOT VERIFIED and there is no action here that would change it. The list is what the work would be, not a form to fill in.";

export const GUIDE_VIEW_NOTICE =
  "This is the GUIDE's side of the marketplace, built as an outline. In a real build it would sit behind a separate guide account with its own sign-in and an athlete would never reach it. It is reachable here because it reads the same local store as the athlete screens — which is how a request queued a moment ago turns up below.";

export const REVIEWS_NEED_BOOKINGS_NOTICE =
  "A review requires a completed ICEFALL booking by the person writing it. No booking has ever completed, so there are no reviews — not a low score, not a new profile, simply nothing to average. Any rating shown against a demo guide elsewhere in this build was invented alongside the guide.";

export const EARNINGS_NOT_PAID_NOTICE =
  "Not revenue. Nothing has been paid and no money has moved. This is the sum of what was quoted on engagements accepted on this device, shown so the shape of the earnings view can be judged.";

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

interface EngagementState {
  /** requestId → the detail the athlete gave. */
  details: Record<string, EngagementDetail>;
  /** requestId → the conversation. */
  messages: Record<string, ThreadMessage[]>;
  /** quoteId → its commercial terms. */
  quoteTerms: Record<string, QuoteTerms>;
  /** bookingId → what was frozen at acceptance. */
  bookingTerms: Record<string, BookingTerms>;
  listing: GuideListing;
}

const EMPTY: EngagementState = {
  details: {},
  messages: {},
  quoteTerms: {},
  bookingTerms: {},
  listing: EMPTY_LISTING,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Storage is `unknown` until it has been checked.
 *
 * A record written by an older build, or edited by hand, must degrade to the
 * empty state rather than reaching a screen half-formed — a cancellation policy
 * that parsed to `undefined` would render as no policy at all, which is a
 * different and much worse statement than "we could not read this".
 */
function load(): EngagementState {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY;
    return {
      details: isRecord(parsed.details) ? (parsed.details as EngagementState["details"]) : {},
      messages: isRecord(parsed.messages) ? (parsed.messages as EngagementState["messages"]) : {},
      quoteTerms: isRecord(parsed.quoteTerms)
        ? (parsed.quoteTerms as EngagementState["quoteTerms"])
        : {},
      bookingTerms: isRecord(parsed.bookingTerms)
        ? (parsed.bookingTerms as EngagementState["bookingTerms"])
        : {},
      listing: isRecord(parsed.listing)
        ? { ...EMPTY_LISTING, ...(parsed.listing as Partial<GuideListing>) }
        : EMPTY_LISTING,
    };
  } catch {
    return EMPTY;
  }
}

let state: EngagementState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * Returns the SAME object until something writes.
 *
 * `useSyncExternalStore` compares snapshots by identity and loops forever if
 * handed a fresh object on every call, so reads never allocate and every write
 * below produces exactly one new state object.
 */
function snapshot(): EngagementState {
  if (!hydrated) {
    state = load();
    hydrated = true;
  }
  return state;
}

function write(next: EngagementState): void {
  state = next;
  hydrated = true;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode or quota. The flow still works for this session; only its
      // survival across a reload is lost. Better than throwing out of a submit.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A local id that cannot collide with the one issued a moment before it.
 *
 * `Date.now()` alone is not enough for records a person can create in quick
 * succession — two messages inside the same millisecond would share an id and
 * every React key and by-id lookup would act on the wrong row. The same fix
 * `AppState` and `./store` already apply, for the same reason.
 */
let idSeq = 0;
const localId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

function recordDetail(requestId: string, detail: Omit<EngagementDetail, "recordedAt">): void {
  const now = snapshot();
  write({
    ...now,
    details: { ...now.details, [requestId]: { ...detail, recordedAt: new Date().toISOString() } },
  });
}

function postMessage(requestId: string, from: ThreadMessage["from"], body: string): void {
  const text = body.trim();
  if (!text) return;
  const now = snapshot();
  const message: ThreadMessage = {
    id: localId("guide-msg"),
    from,
    body: text,
    at: new Date().toISOString(),
  };
  write({
    ...now,
    messages: { ...now.messages, [requestId]: [...(now.messages[requestId] ?? []), message] },
  });
}

/** The guide attaches, or replaces, the commercial terms on one of their quotes. */
function setQuoteTerms(quoteId: string, terms: Omit<QuoteTerms, "issuedAt">): void {
  const now = snapshot();
  write({
    ...now,
    quoteTerms: {
      ...now.quoteTerms,
      [quoteId]: { ...terms, issuedAt: new Date().toISOString() },
    },
  });
}

/**
 * Freezes what was agreed, at the moment it was agreed.
 *
 * Called immediately after `useGuideStore().acceptQuote` returns a booking id.
 * The fee is computed once, here, and never recomputed on render.
 */
function recordBookingTerms(
  bookingId: string,
  input: {
    guideFeeEur: number;
    additionalCosts: QuoteLine[];
    included: string[];
    excluded: string[];
    cancellationPolicy: CancellationPolicy;
  },
): void {
  const totals = quoteTotals(input);
  const now = snapshot();
  const terms: BookingTerms = {
    guideFeeEur: totals.guideFeeEur,
    additionalCosts: input.additionalCosts,
    platformFeeEur: totals.platformFeeEur,
    platformCommissionPct: totals.platformCommissionPct,
    totalEur: totals.totalEur,
    included: input.included,
    excluded: input.excluded,
    cancellationPolicy: input.cancellationPolicy,
    confirmedAt: new Date().toISOString(),
    // Nothing was charged. See the type.
    paid: false,
  };
  write({ ...now, bookingTerms: { ...now.bookingTerms, [bookingId]: terms } });
}

function updateListing(patch: Partial<GuideListing>): void {
  const now = snapshot();
  write({ ...now, listing: { ...now.listing, ...patch } });
}

/**
 * Marks one day in the guide's diary. `null` clears it.
 *
 * Clearing DELETES the key rather than storing a default. "Not set" and
 * "unavailable" are different statements — the first says the guide has not
 * looked at that day, the second says they have and the answer is no — and
 * anyone reading the calendar is entitled to tell them apart.
 */
function setDayAvailability(dateKey: string, status: Availability | null): void {
  const now = snapshot();
  const availability = { ...now.listing.availability };
  if (status === null) delete availability[dateKey];
  else availability[dateKey] = status;
  write({ ...now, listing: { ...now.listing, availability } });
}

/** Drops everything attached to a request, so `removeRequest` leaves nothing behind. */
function forgetRequest(requestId: string, quoteIds: string[], bookingIds: string[]): void {
  const now = snapshot();
  const details = { ...now.details };
  const messages = { ...now.messages };
  const quoteTerms = { ...now.quoteTerms };
  const bookingTerms = { ...now.bookingTerms };
  delete details[requestId];
  delete messages[requestId];
  for (const id of quoteIds) delete quoteTerms[id];
  for (const id of bookingIds) delete bookingTerms[id];
  write({ ...now, details, messages, quoteTerms, bookingTerms });
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export interface EngagementStoreValue {
  details: Record<string, EngagementDetail>;
  messages: Record<string, ThreadMessage[]>;
  quoteTerms: Record<string, QuoteTerms>;
  bookingTerms: Record<string, BookingTerms>;
  listing: GuideListing;
  detailFor: (requestId: string) => EngagementDetail | undefined;
  messagesFor: (requestId: string) => ThreadMessage[];
  termsForQuote: (quoteId: string) => QuoteTerms | undefined;
  termsForBooking: (bookingId: string) => BookingTerms | undefined;
  recordDetail: (requestId: string, detail: Omit<EngagementDetail, "recordedAt">) => void;
  postMessage: (requestId: string, from: ThreadMessage["from"], body: string) => void;
  setQuoteTerms: (quoteId: string, terms: Omit<QuoteTerms, "issuedAt">) => void;
  recordBookingTerms: (
    bookingId: string,
    input: {
      guideFeeEur: number;
      additionalCosts: QuoteLine[];
      included: string[];
      excluded: string[];
      cancellationPolicy: CancellationPolicy;
    },
  ) => void;
  updateListing: (patch: Partial<GuideListing>) => void;
  setDayAvailability: (dateKey: string, status: Availability | null) => void;
  forgetRequest: (requestId: string, quoteIds: string[], bookingIds: string[]) => void;
}

/**
 * The engagement layer, alongside `useGuideStore`.
 *
 * No provider: the state is module-level and shared by every screen that calls
 * it, which is why terms attached on the guide dashboard are already on the
 * athlete's thread without anything being wired together.
 */
export function useEngagementStore(): EngagementStoreValue {
  const stored = useSyncExternalStore(subscribe, snapshot, snapshot);

  return useMemo(
    () => ({
      ...stored,
      detailFor: (requestId: string) => stored.details[requestId],
      messagesFor: (requestId: string) => stored.messages[requestId] ?? [],
      termsForQuote: (quoteId: string) => stored.quoteTerms[quoteId],
      termsForBooking: (bookingId: string) => stored.bookingTerms[bookingId],
      recordDetail,
      postMessage,
      setQuoteTerms,
      recordBookingTerms,
      updateListing,
      setDayAvailability,
      forgetRequest,
    }),
    [stored],
  );
}

/* -------------------------------------------------------------------------- */
/* Derived                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the guide would earn from the bookings held on this device.
 *
 * NOT revenue — see `EARNINGS_NOT_PAID_NOTICE`. Each booking's fee is read from
 * the rate stored ON that booking, so changing the commission does not
 * retroactively restate engagements agreed under the old one.
 */
export function earningsFrom(terms: BookingTerms[]): {
  grossEur: number;
  platformFeeEur: number;
  netEur: number;
  count: number;
} {
  const grossEur = terms.reduce((total, t) => total + t.guideFeeEur, 0);
  const platformFeeEur = terms.reduce((total, t) => total + t.platformFeeEur, 0);
  return { grossEur, platformFeeEur, netEur: grossEur - platformFeeEur, count: terms.length };
}
