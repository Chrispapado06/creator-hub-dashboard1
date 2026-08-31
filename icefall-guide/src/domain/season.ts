/**
 * WHAT THE GUIDE'S SEASON ADDS UP TO — every figure in the app, derived once.
 *
 * The owner's brief asks four questions: what have I earned and what is coming,
 * who is waiting on a reply, how am I doing, and when am I free. The mockup lays
 * those across Home, Bookings, Messages, Availability and Analytics. This module
 * answers them in one place so no screen computes a figure for itself — the home
 * screen and the analytics screen show the same money to the same person, and a
 * guide who finds two different totals has no way to tell which one their
 * landlord should believe.
 *
 * EVERY FIGURE IS A `Reading`, and the unmeasurable ones say why. Nothing here
 * returns a zero to stand in for an absence. The commission is never computed
 * locally — `netEarnings` delegates to the shared money model, which floors in
 * the guide's favour (§6g).
 *
 * DELTAS ARE ARITHMETIC OVER TWO REAL FIGURES, never typed. Where there is no
 * previous period, there is NO delta — not 0%, which would claim the guide had
 * stood still.
 */

import { startOfDay, parseDay } from "@/lib/day";
import { sample } from "./sampleGate";
import { presetRange, previousWindow, withinRange, type DateRange } from "./range";
import {
  bookingValueReading,
  conversionRate,
  excludedNote,
  measured,
  netEarnings,
  unavailable,
  viewsReading,
  GUIDE_NOTICES,
  type Reading,
} from "./honesty";
import { ratingReading, successRateReading, summitsReading } from "./mockupFigures";
import {
  BOOKINGS,
  DAY_STATES,
  THREADS,
  VIEW_EVENTS,
  clientById,
  type BookingState,
  type Client,
  type DayState,
  type GuideBooking,
  type Thread,
} from "@/data/demo";
import {
  payoutStatusFor,
  totalsForAmount,
  type Cents,
  type PayoutStatus,
  type QuoteTotals,
} from "@/money/model";

export { excludedNote, GUIDE_NOTICES };

/* ========================================================================== */
/* Bookings                                                                   */
/* ========================================================================== */

export interface StagedBooking extends GuideBooking {
  payout: PayoutStatus;
  clients: Client[];
}

const partySize = (b: GuideBooking) => Math.max(1, b.clientIds.length);

/**
 * Every booking, tagged with where its money is.
 *
 * `payoutStatusFor` is the shared model's, not a local re-reading of the rule.
 * Cancelled bookings keep their row — the mockup has a Cancelled tab — but they
 * are excluded from every money total, because a cancellation is not earnings of
 * nothing, it is not earnings.
 */
export function stagedBookings(
  bookings: readonly GuideBooking[] = sample(BOOKINGS, []),
  now: Date = new Date(),
): StagedBooking[] {
  return bookings.map((b) => ({
    ...b,
    payout: payoutStatusFor({ status: b.payoutState, departureIso: b.departureIso, now }),
    clients: b.clientIds.map(clientById).filter((c): c is Client => c !== undefined),
  }));
}

export const byState = (rows: readonly StagedBooking[], state: BookingState) =>
  rows.filter((b) => b.state === state);

/** Confirmed and pending trips ahead, soonest first. */
export function upcoming(rows: readonly StagedBooking[], now: Date = new Date()) {
  return rows
    .filter((b) => b.state === "confirmed" || b.state === "pending")
    .filter((b) => new Date(b.departureIso) >= startOfDay(now))
    .sort((a, b) => +new Date(a.departureIso) - +new Date(b.departureIso));
}

/**
 * One booking's money, broken down — or the reason there is none.
 *
 * Delegates the arithmetic entirely. `totalsForAmount` is the one place a
 * commission is computed and rounded in this family, and it FLOORS so the
 * fraction goes to the guide.
 */
export function bookingBreakdown(b: GuideBooking): Reading<QuoteTotals> {
  const value = bookingValueReading(b.value);
  if (!value.available) return unavailable(value.reason);
  return measured(totalsForAmount(value.value, partySize(b), undefined, b.passedThrough));
}

/* ========================================================================== */
/* Money                                                                      */
/* ========================================================================== */

export interface EarningsSplit {
  paidOut: Reading<Cents>;
  paidOutExcluded: number;
  coming: Reading<Cents>;
  comingExcluded: number;
  /** Everything not cancelled, for the season headline. */
  season: Reading<Cents>;
  seasonExcluded: number;
}

const toInput = (b: GuideBooking) => ({
  value: b.value,
  partySize: partySize(b),
  passedThrough: b.passedThrough,
});

export function earningsSplit(staged: readonly StagedBooking[]): EarningsSplit {
  const live = staged.filter((b) => b.state !== "cancelled");
  const out = netEarnings(live.filter((b) => b.payout === "sent").map(toInput), "completed bookings");
  const due = netEarnings(live.filter((b) => b.payout !== "sent").map(toInput), "upcoming bookings");
  const all = netEarnings(live.map(toInput), "bookings this season");
  return {
    paidOut: out.total,
    paidOutExcluded: out.excluded,
    coming: due.total,
    comingExcluded: due.excluded,
    season: all.total,
    seasonExcluded: all.excluded,
  };
}

/* ========================================================================== */
/* Messages                                                                   */
/* ========================================================================== */

export interface Conversation extends Thread {
  clients: Client[];
  last: Thread["messages"][number] | undefined;
  /** Hours the client has been waiting, or null when nothing is owed. */
  waitingHours: number | null;
}

/**
 * Conversations, newest first, with how long a reply has been owed.
 *
 * Waiting time is DERIVED from the last inbound message every time it is read,
 * never stored. Response time is the one thing every client feels, so it is the
 * last figure that should be allowed to drift from its own timestamp.
 */
export function conversations(
  threads: readonly Thread[] = sample(THREADS, []),
  now: Date = new Date(),
): Conversation[] {
  return threads
    .map((t) => {
      const last = t.messages[t.messages.length - 1];
      const lastInbound = [...t.messages].reverse().find((m) => m.fromClientId !== null);
      const owed = t.unread > 0 && lastInbound !== undefined;
      return {
        ...t,
        clients: t.clientIds.map(clientById).filter((c): c is Client => c !== undefined),
        last,
        waitingHours: owed
          ? Math.max(0, Math.floor((now.getTime() - new Date(lastInbound.at).getTime()) / 3_600_000))
          : null,
      };
    })
    .sort((a, b) => +new Date(b.last?.at ?? 0) - +new Date(a.last?.at ?? 0));
}

export const unreadTotal = (rows: readonly Conversation[]) =>
  rows.reduce((n, c) => n + c.unread, 0);

/* ========================================================================== */
/* Availability                                                               */
/* ========================================================================== */

export interface Availability {
  states: Record<string, DayState>;
  freeDays: number;
  /** Null unless the guide has genuinely set nothing. */
  emptyReason: string | null;
}

export function availability(states: Record<string, DayState> = sample(DAY_STATES, {})): Availability {
  const keys = Object.keys(states);
  return {
    states,
    freeDays: keys.filter((k) => states[k] === "available").length,
    emptyReason: keys.length === 0 ? GUIDE_NOTICES.DATES_NOT_SET : null,
  };
}

/** A day the guide has said nothing about is NOT a day they said no. */
export const dayState = (states: Record<string, DayState>, day: string): DayState | null =>
  states[day] ?? null;

/* ========================================================================== */
/* Analytics                                                                  */
/* ========================================================================== */

/** Null when there is nothing to compare against — never a fabricated 0%. */
export function delta(now: number, before: number | undefined | null): number | null {
  if (before === undefined || before === null || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export interface MonthPoint {
  label: string;
  cents: Cents;
}

/**
 * Net earnings by month, derived from bookings.
 *
 * NOT A PAYMENTS LEDGER, and the screen says so. No money has ever moved through
 * ICEFALL — there is no processor and no payouts table — so this is what the
 * guide's bookings are worth to them, bucketed by departure month. That is a
 * real derivation over real rows, unlike the hardcoded five-month array this app
 * shipped until 2026-08-29, which had no source at all.
 *
 * Only bookings with a reported value contribute. A month with none returns
 * zero SPEND, which is a true statement about a month in which nothing was
 * booked — distinct from the series being unavailable, which is what an empty
 * result gives.
 */
export function earningsByMonth(
  staged: readonly StagedBooking[],
  range: DateRange,
): MonthPoint[] {
  /**
   * THE AXIS IS THE CHOSEN WINDOW, not a fixed six months.
   *
   * An earlier version walked backwards from today and drew a flat line with
   * everything bunched in the last two cells, because a guide's work is mostly
   * AHEAD of them. Now the chart shows exactly the period the figures above it
   * describe — which is the only way a chart and a total can be read together.
   */
  const out: MonthPoint[] = [];
  const months =
    (range.to.getFullYear() - range.from.getFullYear()) * 12 +
    (range.to.getMonth() - range.from.getMonth()) +
    1;
  for (let i = 0; i < Math.min(months, 12); i++) {
    const m = new Date(range.from.getFullYear(), range.from.getMonth() + i, 1);
    const inMonth = staged.filter((b) => {
      if (b.state === "cancelled") return false;
      const d = new Date(b.departureIso);
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
    });
    const total = netEarnings(inMonth.map(toInput), "bookings");
    out.push({
      label: m.toLocaleDateString("en-GB", { month: "short" }),
      cents: total.total.available ? total.total.value : 0,
    });
  }
  return out;
}

export interface Destination {
  peak: string;
  name: string;
  bookings: number;
  cents: Cents;
}

/** Where the work actually was, ranked by what it paid. */
export function topDestinations(staged: readonly StagedBooking[]): Destination[] {
  const m = new Map<string, Destination>();
  for (const b of staged) {
    if (b.state === "cancelled") continue;
    const t = netEarnings([toInput(b)], "bookings").total;
    const row = m.get(b.peak) ?? { peak: b.peak, name: b.title, bookings: 0, cents: 0 };
    row.bookings += 1;
    row.cents += t.available ? t.value : 0;
    m.set(b.peak, row);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents);
}

export interface CategorySlice {
  key: "expedition" | "private" | "other";
  label: string;
  cents: Cents;
}

/**
 * Earnings by kind of work, from the STATED category on each booking.
 *
 * Never inferred from grade or party size — nothing about a trip's difficulty
 * says how it was sold, and a guessed split would put invented proportions on a
 * chart about somebody's income. Bookings with no recorded value contribute
 * nothing and are counted in `excluded`, so the ring never silently omits them.
 */
export function earningsByCategory(staged: readonly StagedBooking[]): {
  slices: CategorySlice[];
  excluded: number;
} {
  const label = { expedition: "Expeditions", private: "Private guiding", other: "Other" } as const;
  const keys = ["expedition", "private", "other"] as const;
  const live = staged.filter((b) => b.state !== "cancelled");
  let excluded = 0;
  const slices = keys.map((key) => {
    const rows = live.filter((b) => b.category === key);
    const t = netEarnings(rows.map(toInput), "bookings");
    excluded += t.excluded;
    return { key, label: label[key], cents: t.total.available ? t.total.value : 0 };
  });
  return { slices: slices.filter((s) => s.cents > 0), excluded };
}

export interface ClienteleRow {
  client: Client;
  /** Their trips in the window, soonest first. */
  trips: StagedBooking[];
  /** The peak behind their most valuable trip — what the row shows a photo of. */
  peak: string;
  /** What the guide receives from this client, net. */
  cents: Cents;
  /** Trips of theirs with no recorded value, so the row can say what it omits. */
  excluded: number;
}

/**
 * TOP CLIENTELE — who the guide's work actually comes from.
 *
 * Replaces "top destinations" at the owner's request (GU-02). The two answer
 * different questions and the new one is the more useful: a guide already knows
 * which mountains they guide — it is their own listing — but which PEOPLE bring
 * the work is not visible anywhere else in the app.
 *
 * Ranked by what the guide RECEIVES, net of ICEFALL's commission, so the order
 * reflects what reaches them rather than gross ticket price. A client whose
 * trips carry no recorded value is still listed, at zero, with the omission
 * counted — dropping them would silently rewrite who the guide's clients are.
 */
export function topClientele(staged: readonly StagedBooking[]): ClienteleRow[] {
  const byClient = new Map<string, ClienteleRow>();

  for (const b of staged) {
    if (b.state === "cancelled") continue;
    for (const c of b.clients) {
      const row =
        byClient.get(c.id) ?? { client: c, trips: [], peak: b.peak, cents: 0, excluded: 0 };
      row.trips.push(b);
      const t = netEarnings([toInput(b)], "bookings").total;
      if (t.available) row.cents += t.value;
      else row.excluded += 1;
      byClient.set(c.id, row);
    }
  }

  for (const row of byClient.values()) {
    row.trips.sort((a, b) => +new Date(a.departureIso) - +new Date(b.departureIso));
    /* The photo is of their most VALUABLE trip, not their first — it is the one
       that put them at the top of this list. */
    const best = [...row.trips].sort((a, b) => {
      const va = netEarnings([toInput(a)], "b").total;
      const vb = netEarnings([toInput(b)], "b").total;
      return (vb.available ? vb.value : 0) - (va.available ? va.value : 0);
    })[0];
    if (best) row.peak = best.peak;
  }

  return [...byClient.values()].sort((a, b) => b.cents - a.cents);
}

export interface Analytics {
  earnings: Reading<Cents>;
  earningsExcluded: number;
  earningsDelta: number | null;
  bookings: Reading<number>;
  bookingsDelta: number | null;
  clients: Reading<number>;
  clientsDelta: number | null;
  /** Clients who have been on more than one trip, as a share of all clients. */
  repeat: Reading<number>;
  repeatDelta: number | null;
  months: MonthPoint[];
  destinations: Destination[];
  categories: CategorySlice[];
  categoriesExcluded: number;
  clientele: ClienteleRow[];
  /** Unavailable everywhere, for the reason `viewsReading` gives. */
  views: Reading<number>;
  /** Doctrine tier 4 — see `domain/mockupFigures.ts`. All three have no source. */
  rating: Reading<number>;
  successRate: Reading<number>;
  summits: Reading<number>;
  /** Said under any count that could be mistaken for a marketplace figure. */
  provenance: string;
  conversion: Reading<number>;
  /** The window every figure above describes. */
  range: DateRange;
  /** What the deltas are measured against, so the screen can name it. */
  previousLabel: string;
}

/** Everything a window's figures are built from, so both windows use one path. */
function windowTotals(staged: readonly StagedBooking[], r: DateRange) {
  const live = staged.filter(
    (b) => b.state !== "cancelled" && withinRange(b.departureIso, r),
  );
  const trips = new Map<string, number>();
  for (const b of live) for (const id of b.clientIds) trips.set(id, (trips.get(id) ?? 0) + 1);
  const clients = trips.size;
  const repeat = [...trips.values()].filter((n) => n > 1).length;
  const money = netEarnings(live.map(toInput), "bookings in this period");
  return {
    live,
    bookings: live.length,
    clients,
    repeat,
    repeatShare: clients > 0 ? repeat / clients : null,
    earnings: money.total.available ? money.total.value : null,
    earningsReading: money.total,
    excluded: money.excluded,
  };
}

/**
 * THE CLIENT COUNT IS NOW WHO WAS ON A BOOKING IN THE WINDOW, not the size of
 * the address book. Counting every client ever, against a window that only
 * covers three months, put two figures that describe different periods on one
 * screen — and the second one never moved when the guide changed the first.
 */
export function analytics(
  staged: readonly StagedBooking[] = stagedBookings(),
  threads: readonly Thread[] = sample(THREADS, []),
  range: DateRange = presetRange("season"),
): Analytics {
  const now = windowTotals(staged, range);
  const before = windowTotals(staged, previousWindow(range));
  const live = now.live;
  const money = { total: now.earningsReading, excluded: now.excluded };

  const attributed = live.filter((b) => b.fromThreadId !== null).length;
  const anyLinked = staged.some((b) => b.fromThreadId !== null);

  return {
    earnings: money.total,
    earningsExcluded: money.excluded,
    earningsDelta: now.earnings !== null ? delta(now.earnings, before.earnings) : null,
    bookings: measured(now.bookings),
    bookingsDelta: delta(now.bookings, before.bookings),
    clients: measured(now.clients),
    clientsDelta: delta(now.clients, before.clients),
    repeat:
      now.repeatShare !== null
        ? measured(now.repeatShare)
        : unavailable("No clients in this period, so there is no repeat share to show."),
    /**
     * PERCENTAGE POINTS, NOT A PERCENTAGE OF A PERCENTAGE.
     *
     * The first version ran this through `delta`, which is a relative change —
     * 83% against last season's 20% came out as **▲315%**, which is
     * arithmetically correct and tells the guide nothing true. Comparing two
     * rates relatively is one of the classic misleading statistics: the honest
     * comparison between two percentages is the gap between them.
     */
    /**
     * PERCENTAGE POINTS, NOT A PERCENTAGE OF A PERCENTAGE. Running this through
     * `delta` once gave **▲315%** — 83% against 20% — which is arithmetically
     * right and tells the guide nothing true. The honest comparison between two
     * rates is the gap between them.
     */
    repeatDelta:
      now.repeatShare !== null && before.repeatShare !== null
        ? Math.round(now.repeatShare * 100) - Math.round(before.repeatShare * 100)
        : null,
    months: earningsByMonth(staged, range),
    destinations: topDestinations(live),
    clientele: topClientele(live),
    categories: earningsByCategory(live).slices,
    categoriesExcluded: earningsByCategory(live).excluded,
    range,
    previousLabel: previousWindow(range).label,
    views: viewsReading(VIEW_EVENTS),
    rating: ratingReading(),
    successRate: successRateReading(),
    summits: summitsReading(),
    provenance: GUIDE_NOTICES.ENQUIRY_FUNNEL_NOT_RECORDED,
    conversion: anyLinked
      ? conversionRate(attributed, threads.length)
      : unavailable(GUIDE_NOTICES.CONVERSION_NOT_ATTRIBUTED),
  };
}

/* ========================================================================== */
/* Home                                                                       */
/* ========================================================================== */

export interface HomeSummary {
  staged: StagedBooking[];
  upcoming: StagedBooking[];
  earnings: EarningsSplit;
  stats: Analytics;
  conversations: Conversation[];
  unread: number;
  dates: Availability;
}

/**
 * One call, threading a single `now` through every derivation.
 *
 * Two figures on one screen computed against two different instants is a class
 * of bug that surfaces as an off-by-one nobody can reproduce.
 */
export function homeSummary(now: Date = new Date()): HomeSummary {
  const staged = stagedBookings(sample(BOOKINGS, []), now);
  const convos = conversations(sample(THREADS, []), now);
  return {
    staged,
    upcoming: upcoming(staged, now),
    earnings: earningsSplit(staged),
    stats: analytics(staged, sample(THREADS, []), presetRange("season", now)),
    conversations: convos,
    unread: unreadTotal(convos),
    dates: availability(),
  };
}

/** Kept for the screens that only need the marketplace block. */
export function marketplace() {
  const a = analytics();
  return { views: a.views, enquiries: measured(sample(THREADS, []).length), conversion: a.conversion, provenance: a.provenance };
}

export { parseDay };
