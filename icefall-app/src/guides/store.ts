import { useCallback, useMemo, useSyncExternalStore } from "react";
import { SHOW_DEMO_GUIDES, type Guide } from "./types";

/**
 * Local persistence for the guide marketplace flows.
 *
 * A small module-level store mirrored into its own `localStorage` key, with the
 * same shape and the same defensive parsing as `@/network/peopleFilters`.
 * Deliberately NOT part of `AppState`: the marketplace is in flight, its schema
 * will move, and a half-built feature must not be able to corrupt the record
 * that holds an athlete's training.
 *
 * NOTHING HERE IS SENT, AND NOTHING HERE IS BOOKED.
 *
 * There is no server, no guide has an account, and no message, request, quote
 * or booking leaves this device. Every type below carries that in its own doc
 * comment, because the danger in this feature is specific and physical: an
 * athlete who believes a guide is engaged may fly to Chamonix, or worse, walk
 * onto a glacier expecting to be met. Every screen built on this module must
 * state it too — `GUIDE_REQUEST_NOT_SENT` and `GUIDE_BOOKING_NOT_REAL` exist so
 * they all say the same thing.
 */

const STORAGE_KEY = "icefall.guides.v1";

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const GUIDE_REQUEST_NOT_SENT =
  "Saved on this device. ICEFALL has no guide network connected, so this request has not been sent, the guide has not been notified, and no reply can arrive. To engage a guide, contact them or their guides office directly.";

export const GUIDE_BOOKING_NOT_REAL =
  "This is not a booking. Nothing has been reserved, no money has moved, no deposit has been taken and the guide does not know your name. It is a record kept on this device so the flow can be walked end to end — arrange the real thing with the guide in writing.";

export const GUIDE_QUOTE_ILLUSTRATION =
  "Illustration only. Nobody sent this. It is arithmetic on the demonstration guide's invented day rate, shown so the quote step can be seen — a real quote comes from the guide, itemised, and looks nothing like a multiplication.";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A request for a guide's time.
 *
 * `"queued"` IS THE ONLY STATUS, and the union is closed on purpose — the same
 * decision, for the same reason, as `ConnectionRequest` in `@/network/types`. A
 * request is written to `localStorage` and reaches nobody: no guide is
 * notified, nothing is transmitted, and no reply can ever come back. A "sent"
 * or "awaiting reply" state would be the app telling a client their dates are
 * with a guide when they are sitting in a browser on their own phone.
 *
 * The shape is the one a real backend would use, so wiring one up later does
 * not touch the screens. Adding a status before that backend exists does.
 */
export interface GuideRequest {
  id: string;
  guideId: string;
  /** Denormalised so a request still renders if the catalogue changes. */
  guideName: string;
  peakName: string;
  elevationM?: number;
  fromIso?: string;
  toIso?: string;
  groupSize?: number;
  message: string;
  createdAt: string;
  status: "queued";
}

/**
 * A priced response to a request.
 *
 * `origin` is a closed union with one member. `"demo-illustration"` means the
 * figures were computed here from a demonstration guide's invented day rate —
 * NOT that anyone quoted anything. When guides can really reply, a
 * `"from-guide"` member joins this union and the UI branches on it; until then
 * no code path can produce a quote that claims to have come from a person.
 *
 * `days` and `subtotalEur` are `null` rather than `0` when the client gave no
 * dates. A zero here would read as a free week.
 */
export interface GuideQuote {
  id: string;
  requestId: string;
  guideId: string;
  guideName: string;
  dailyRateEur: number;
  /** Null when no date range was given — never 0. */
  days: number | null;
  /** Null when `days` is null — never 0. */
  subtotalEur: number | null;
  /** Why a figure is missing, when one is. Rendered instead of the number. */
  unknownReason?: string;
  includes: string[];
  excludes: string[];
  origin: "demo-illustration";
  createdAt: string;
  status: "open" | "accepted" | "declined";
  /** Present whenever the guide behind it is demonstration data. */
  demo?: true;
}

/**
 * An accepted quote, recorded locally.
 *
 * NOT A BOOKING. `status` is the literal `"local-only"` so nothing can mark it
 * confirmed: no guide has agreed to anything, no date is held, and no payment
 * exists to take. See `GUIDE_BOOKING_NOT_REAL`, which must appear on every
 * surface that renders one of these.
 */
export interface GuideBooking {
  id: string;
  quoteId: string;
  requestId: string;
  guideId: string;
  guideName: string;
  peakName: string;
  fromIso?: string;
  toIso?: string;
  /** Null when the quote had no dates to price. Never 0. */
  totalEur: number | null;
  createdAt: string;
  status: "local-only";
}

interface Persisted {
  requests: GuideRequest[];
  quotes: GuideQuote[];
  bookings: GuideBooking[];
  /** Guide ids, newest first. */
  shortlist: string[];
}

const EMPTY: Persisted = { requests: [], quotes: [], bookings: [], shortlist: [] };

/* -------------------------------------------------------------------------- */
/* Ids                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `Date.now()` alone collides: a request and its illustrative quote are created
 * in the same millisecond, and two ids that match would make `quotesFor` return
 * the wrong row. The counter makes them unique within a session, and the
 * timestamp keeps them unique across reloads.
 */
let idSeq = 0;
const localId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Everything read back from storage is `unknown` until it has been checked.
 * A record written by an older build, or edited by hand, must degrade to the
 * empty state rather than reaching a screen half-formed.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Distinguishes a real stored `null` from a missing field. */
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function parseRequest(v: unknown): GuideRequest | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const guideId = str(v.guideId);
  const createdAt = str(v.createdAt);
  if (!id || !guideId || !createdAt) return null;
  return {
    id,
    guideId,
    guideName: str(v.guideName) ?? "Guide",
    peakName: str(v.peakName) ?? "",
    elevationM: num(v.elevationM),
    fromIso: str(v.fromIso),
    toIso: str(v.toIso),
    groupSize: num(v.groupSize),
    message: typeof v.message === "string" ? v.message : "",
    createdAt,
    // Not read from storage: the union has one member, and honouring a status
    // someone wrote into localStorage is how "sent" gets into this app.
    status: "queued",
  };
}

function parseQuote(v: unknown): GuideQuote | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const requestId = str(v.requestId);
  const guideId = str(v.guideId);
  const createdAt = str(v.createdAt);
  const dailyRateEur = num(v.dailyRateEur);
  if (!id || !requestId || !guideId || !createdAt || dailyRateEur === undefined) return null;
  const status = v.status;
  return {
    id,
    requestId,
    guideId,
    guideName: str(v.guideName) ?? "Guide",
    dailyRateEur,
    days: numOrNull(v.days),
    subtotalEur: numOrNull(v.subtotalEur),
    unknownReason: str(v.unknownReason),
    includes: strArray(v.includes),
    excludes: strArray(v.excludes),
    // Likewise fixed rather than trusted — see `parseRequest`.
    origin: "demo-illustration",
    createdAt,
    status: status === "accepted" || status === "declined" ? status : "open",
    ...(v.demo === true ? { demo: true as const } : {}),
  };
}

function parseBooking(v: unknown): GuideBooking | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const quoteId = str(v.quoteId);
  const guideId = str(v.guideId);
  const createdAt = str(v.createdAt);
  if (!id || !quoteId || !guideId || !createdAt) return null;
  return {
    id,
    quoteId,
    requestId: str(v.requestId) ?? "",
    guideId,
    guideName: str(v.guideName) ?? "Guide",
    peakName: str(v.peakName) ?? "",
    fromIso: str(v.fromIso),
    toIso: str(v.toIso),
    totalEur: numOrNull(v.totalEur),
    createdAt,
    status: "local-only",
  };
}

function readStored(): Persisted {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY;
    return {
      requests: (Array.isArray(parsed.requests) ? parsed.requests : [])
        .map(parseRequest)
        .filter((x): x is GuideRequest => x !== null),
      quotes: (Array.isArray(parsed.quotes) ? parsed.quotes : [])
        .map(parseQuote)
        .filter((x): x is GuideQuote => x !== null),
      bookings: (Array.isArray(parsed.bookings) ? parsed.bookings : [])
        .map(parseBooking)
        .filter((x): x is GuideBooking => x !== null),
      shortlist: strArray(parsed.shortlist),
    };
  } catch {
    // Corrupt or unreadable storage falls back to empty, never to a
    // half-parsed request that a dashboard would then render as live.
    return EMPTY;
  }
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

let state: Persisted = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function snapshot(): Persisted {
  if (!hydrated) {
    state = readStored();
    hydrated = true;
  }
  return state;
}

function write(next: Persisted) {
  state = next;
  hydrated = true;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode, or the quota is full. The flows still work for this
      // session; only their survival across a reload is lost.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* -------------------------------------------------------------------------- */
/* Quote arithmetic                                                            */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Inclusive day count, or null when there is nothing to count. */
function daysBetween(fromIso?: string, toIso?: string): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.round((to - from) / DAY_MS) + 1;
}

/**
 * What a quote would contain, phrased as the guide's own standard terms.
 *
 * Held here rather than on the `Guide` so no demonstration profile carries what
 * looks like contractual small print. The exclusions are the ones ICEFALL
 * already tells people to ask about — see `UNIVERSAL` in
 * `@/services/expeditionAccess` — so the two surfaces cannot disagree.
 */
const QUOTE_INCLUDES = [
  "The guide's time for the days quoted",
  "Route planning and the daily weather call",
  "Technical group equipment: rope, rack, glacier kit",
];

const QUOTE_EXCLUDES = [
  "Permits, park fees and hut nights, for both of you",
  "Lifts, transfers and all travel",
  "Your personal equipment",
  "Insurance, including helicopter rescue at the altitude you will reach",
  "The guide's expenses on the hill",
];

/**
 * The illustrative quote.
 *
 * Only ever produced for a demonstration guide, only while `SHOW_DEMO_GUIDES`
 * is true, and always flagged `origin: "demo-illustration"`. A real guide in the
 * catalogue produces no quote at all: the request sits queued, the dashboard
 * says nothing came back, and that is the truth of it.
 */
function illustrativeQuote(request: GuideRequest, guide: Guide): GuideQuote | null {
  if (!SHOW_DEMO_GUIDES || guide.demo !== true) return null;

  const days = daysBetween(request.fromIso, request.toIso);

  return {
    id: localId("guide-quote"),
    requestId: request.id,
    guideId: guide.id,
    guideName: guide.name,
    dailyRateEur: guide.dailyRateEur,
    days,
    subtotalEur: days === null ? null : days * guide.dailyRateEur,
    unknownReason:
      days === null
        ? "No date range was given, so there are no days to multiply the rate by."
        : undefined,
    includes: QUOTE_INCLUDES,
    excludes: QUOTE_EXCLUDES,
    origin: "demo-illustration",
    createdAt: new Date().toISOString(),
    status: "open",
    demo: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export interface RequestGuideArgs {
  guide: Guide;
  peakName: string;
  elevationM?: number;
  fromIso?: string;
  toIso?: string;
  groupSize?: number;
  message: string;
}

/**
 * The screens' handle on the marketplace.
 *
 * Everything is derived from one persisted record, so a dashboard, a profile
 * and a thread rendered at the same time cannot disagree about what exists.
 */
export function useGuideStore() {
  const stored = useSyncExternalStore(subscribe, snapshot, snapshot);

  /**
   * Queues a request and, for a demonstration guide, the illustrative quote
   * that goes with it. Returns the request id so the caller can navigate to it.
   *
   * NOTHING IS SENT. See `GUIDE_REQUEST_NOT_SENT`, which the compose screen
   * must show before the client writes and the thread must show after.
   */
  const requestGuide = useCallback((args: RequestGuideArgs): string => {
    const now = snapshot();
    const request: GuideRequest = {
      id: localId("guide-request"),
      guideId: args.guide.id,
      guideName: args.guide.name,
      peakName: args.peakName,
      elevationM: args.elevationM,
      fromIso: args.fromIso,
      toIso: args.toIso,
      groupSize: args.groupSize,
      message: args.message,
      createdAt: new Date().toISOString(),
      status: "queued",
    };
    const quote = illustrativeQuote(request, args.guide);

    write({
      ...now,
      requests: [request, ...now.requests],
      quotes: quote ? [quote, ...now.quotes] : now.quotes,
    });
    return request.id;
  }, []);

  /**
   * Records that the client accepted a quote.
   *
   * Creates a `GuideBooking`, which is a local record and not a booking — see
   * `GUIDE_BOOKING_NOT_REAL`. Any sibling quote on the same request is marked
   * declined so a dashboard cannot show two live prices for one set of dates.
   * Returns the booking id, or null when the quote is gone or already settled.
   */
  const acceptQuote = useCallback((quoteId: string): string | null => {
    const now = snapshot();
    const quote = now.quotes.find((q) => q.id === quoteId);
    if (!quote || quote.status !== "open") return null;
    const request = now.requests.find((r) => r.id === quote.requestId);

    const booking: GuideBooking = {
      id: localId("guide-booking"),
      quoteId: quote.id,
      requestId: quote.requestId,
      guideId: quote.guideId,
      guideName: quote.guideName,
      peakName: request?.peakName ?? "",
      fromIso: request?.fromIso,
      toIso: request?.toIso,
      totalEur: quote.subtotalEur,
      createdAt: new Date().toISOString(),
      status: "local-only",
    };

    write({
      ...now,
      quotes: now.quotes.map((q) =>
        q.id === quote.id
          ? { ...q, status: "accepted" }
          : q.requestId === quote.requestId && q.status === "open"
            ? { ...q, status: "declined" }
            : q,
      ),
      bookings: [booking, ...now.bookings],
    });
    return booking.id;
  }, []);

  const declineQuote = useCallback((quoteId: string) => {
    const now = snapshot();
    write({
      ...now,
      quotes: now.quotes.map((q) =>
        q.id === quoteId && q.status === "open" ? { ...q, status: "declined" } : q,
      ),
    });
  }, []);

  /** Removes a request and everything derived from it, so nothing is orphaned. */
  const removeRequest = useCallback((requestId: string) => {
    const now = snapshot();
    const quoteIds = new Set(now.quotes.filter((q) => q.requestId === requestId).map((q) => q.id));
    write({
      ...now,
      requests: now.requests.filter((r) => r.id !== requestId),
      quotes: now.quotes.filter((q) => q.requestId !== requestId),
      bookings: now.bookings.filter((b) => !quoteIds.has(b.quoteId)),
    });
  }, []);

  const toggleShortlist = useCallback((guideId: string) => {
    const now = snapshot();
    const has = now.shortlist.includes(guideId);
    write({
      ...now,
      shortlist: has ? now.shortlist.filter((id) => id !== guideId) : [guideId, ...now.shortlist],
    });
  }, []);

  const isShortlisted = useCallback(
    (guideId: string) => stored.shortlist.includes(guideId),
    [stored.shortlist],
  );

  const quotesFor = useCallback(
    (requestId: string) => stored.quotes.filter((q) => q.requestId === requestId),
    [stored.quotes],
  );

  const bookingForRequest = useCallback(
    (requestId: string) => stored.bookings.find((b) => b.requestId === requestId),
    [stored.bookings],
  );

  return useMemo(
    () => ({
      requests: stored.requests,
      requestGuide,
      quotes: stored.quotes,
      quotesFor,
      acceptQuote,
      declineQuote,
      removeRequest,
      bookings: stored.bookings,
      bookingForRequest,
      shortlist: stored.shortlist,
      toggleShortlist,
      isShortlisted,
    }),
    [
      stored.requests,
      stored.quotes,
      stored.bookings,
      stored.shortlist,
      requestGuide,
      quotesFor,
      acceptQuote,
      declineQuote,
      removeRequest,
      bookingForRequest,
      toggleShortlist,
      isShortlisted,
    ],
  );
}
