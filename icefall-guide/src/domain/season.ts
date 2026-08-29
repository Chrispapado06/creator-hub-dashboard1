/**
 * THE FOUR QUESTIONS A GUIDE OPENS THIS APP TO ANSWER.
 *
 * The product owner's brief, in their words: "the same as phone app but focused
 * for the guides — show them stats like bookings, page views, dates available,
 * etc." Read as questions rather than tiles, that is:
 *
 *   1. What have I earned, and what is coming?
 *   2. Who is waiting on a reply from me?
 *   3. How am I doing on the marketplace?
 *   4. When am I free?
 *
 * This module answers all four in one place, so no screen computes a figure for
 * itself. That is not tidiness: the payouts screen and the home screen show the
 * same money to the same person, and a guide who finds two different totals has
 * no way to tell which one their landlord should believe.
 *
 * EVERY FIGURE IS A `Reading`, AND THE UNMEASURABLE ONES SAY WHY.
 * Nothing here returns a zero to stand in for an absence. The commission is
 * never computed locally — `netEarnings` delegates to the shared money model,
 * which floors in the guide's favour (§6g).
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *   · No earnings history. There is no payments ledger in the family and no
 *     money has ever moved, so a monthly series would be invented.
 *   · No profile-view figure. `viewsReading` returns the honest state and will
 *     start returning a number, with no change here, once a trusted emitter and
 *     a column to attribute it to both exist.
 *   · No "you are doing well/badly" verdict of any kind. ICEFALL cannot defend
 *     one, and a marketplace grading the people who sell on it — with no
 *     comparison set, on data this thin — would be inventing an authority it
 *     does not have.
 */

import { startOfDay } from "@/lib/day";
import {
  bookingValueReading,
  conversionRate,
  measured,
  netEarnings,
  unavailable,
  viewsReading,
  type Reading,
  GUIDE_NOTICES,
} from "./honesty";
import {
  BOOKINGS,
  ENQUIRIES,
  OPENINGS,
  VIEW_EVENTS,
  isUnanswered,
  parseDay,
  waitingHours,
  type Enquiry,
  type GuideBooking,
  type Opening,
} from "@/data/demo";
import {
  payoutStatusFor,
  totalsForAmount,
  type Cents,
  type PayoutStatus,
  type QuoteTotals,
} from "@/money/model";

/* ========================================================================== */
/* 1 — Money                                                                  */
/* ========================================================================== */

/** A booking with the payout stage ICEFALL's own model puts it at. */
export interface StagedBooking extends GuideBooking {
  payout: PayoutStatus;
}

/**
 * Every booking, tagged with where its money is.
 *
 * `payoutStatusFor` is the shared model's, not a local re-reading of the rule:
 * funds are held until the party actually walks in. Cancelled bookings are
 * excluded from every total here rather than counted as zero — a cancellation is
 * not earnings of nothing, it is not earnings.
 */
export function stagedBookings(
  bookings: readonly GuideBooking[] = BOOKINGS,
  now: Date = new Date(),
): StagedBooking[] {
  return bookings
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({
      ...b,
      payout: payoutStatusFor({ status: b.status, departureIso: b.departureIso, now }),
    }));
}

export interface EarningsSplit {
  /** Money that has been released to the guide. */
  paidOut: Reading<Cents>;
  paidOutExcluded: number;
  /** Money ICEFALL is holding, or is about to release. */
  coming: Reading<Cents>;
  comingExcluded: number;
}

/**
 * What the guide has received, and what is still to come — both NET.
 *
 * Two totals rather than one, because they answer different questions and a
 * guide plans against them differently: one is in the bank, the other is a
 * client's promise that ICEFALL is holding. Merging them into a single
 * "earnings" figure would be the more flattering number and the less useful one.
 *
 * `passedThrough` travels into the arithmetic on every row. A hut bill the guide
 * collects and hands to the hut is not their fee, and ICEFALL does not take a
 * commission on it (owner decision 13) — so a booking of €1,000 of guiding plus
 * €240 of hut nights yields a €100 commission, never €124.
 */
export function earningsSplit(staged: readonly StagedBooking[]): EarningsSplit {
  const toInput = (b: StagedBooking) => ({
    value: b.value,
    partySize: b.partySize,
    passedThrough: b.passedThrough,
  });

  const out = netEarnings(
    staged.filter((b) => b.payout === "sent").map(toInput),
    "completed bookings",
  );
  const due = netEarnings(
    staged.filter((b) => b.payout !== "sent").map(toInput),
    "upcoming bookings",
  );

  return {
    paidOut: out.total,
    paidOutExcluded: out.excluded,
    coming: due.total,
    comingExcluded: due.excluded,
  };
}

/**
 * One booking's money, broken down — or the reason there is no breakdown.
 *
 * DELEGATES THE ARITHMETIC ENTIRELY. `totalsForAmount` is the one place a
 * commission is computed and rounded in this family, and it FLOORS so the
 * fraction goes to the guide. Until 2026-08-29 this app did the sum itself, at
 * 12%, with `Math.round` — the wrong rate and the rounding pointed at ICEFALL,
 * on the screen that tells a self-employed person what they are owed.
 *
 * Returns a `Reading`, because a booking whose value nobody recorded has no
 * breakdown: there is no commission on an unknown amount, and printing €0 for
 * ICEFALL's cut beside €0 for the guide would be two false statements.
 */
export function bookingBreakdown(b: GuideBooking): Reading<QuoteTotals> {
  // Not a cast. `bookingValueReading` already carries the right sentence for
  // each missing-value case; re-deriving it here would be a second place that
  // has to be kept saying the same thing.
  const value = bookingValueReading(b.value);
  if (!value.available) return unavailable(value.reason);
  return measured(totalsForAmount(value.value, b.partySize, undefined, b.passedThrough));
}

/** The next party to walk in. Null when there is nothing ahead. */
export function nextDeparture(
  staged: readonly StagedBooking[],
  now: Date = new Date(),
): StagedBooking | null {
  /**
   * `departureIso` is a genuine instant (local midday — see `@/lib/day`), so a
   * direct comparison is correct here. It would NOT be if the seed still held
   * bare day strings: those parse as UTC midnight and a departure would fall out
   * of "ahead" most of a day early west of Greenwich.
   */
  const ahead = staged
    .filter((b) => new Date(b.departureIso) >= now)
    .sort((a, b) => +new Date(a.departureIso) - +new Date(b.departureIso));
  return ahead[0] ?? null;
}

/* ========================================================================== */
/* 2 — Who is waiting                                                         */
/* ========================================================================== */

export interface Waiting {
  /** Unanswered enquiries, longest wait first. */
  enquiries: (Enquiry & { hours: number })[];
  /**
   * The longest anybody has waited, or NULL when nobody is waiting.
   *
   * Null rather than 0. "Nobody is waiting" and "somebody has been waiting less
   * than an hour" are different statements, and the screen says different things
   * about them.
   */
  longestHours: number | null;
}

/**
 * Who is owed a reply, and for how long.
 *
 * Derived from the arrival timestamp every time it is read, never from a stored
 * hours figure — a number that drifts from its own timestamp is the last thing
 * you want on the one metric a client actually feels.
 */
export function waitingOnYou(
  enquiries: readonly Enquiry[] = ENQUIRIES,
  now: Date = new Date(),
): Waiting {
  const open = enquiries
    .filter(isUnanswered)
    .map((e) => ({ ...e, hours: waitingHours(e, now) }))
    .sort((a, b) => b.hours - a.hours);

  return { enquiries: open, longestHours: open.length > 0 ? open[0].hours : null };
}

/* ========================================================================== */
/* 3 — The marketplace                                                        */
/* ========================================================================== */

export interface Marketplace {
  /** Three states, none of them a number this guide could have written. */
  views: Reading<number>;
  /**
   * Enquiries that reached this app. NOT a marketplace figure — see
   * `provenance` and `GUIDE_NOTICES.ENQUIRY_FUNNEL_NOT_RECORDED`.
   */
  enquiries: Reading<number>;
  /**
   * Enquiries that became a booking — counted from the LINK, not by comparing
   * two totals. Unavailable when no booking carries one.
   */
  booked: Reading<number>;
  /** Booked ÷ enquiries. Refuses 0/0, and refuses an unattributed numerator. */
  conversion: Reading<number>;
  /** Rendered under the section, so no count here is read as a measured funnel. */
  provenance: string;
}

/**
 * How the guide is doing, as far as ICEFALL can honestly say — which is not far.
 *
 * THE COUNTS ARE REAL AND THE FUNNEL IS NOT, and the distinction is the whole
 * of this function. Enquiries and bookings are counted from rows this app holds,
 * so they are measured. But `public.leads` — where every funnel in the family is
 * computed — has `company_id not null`, and a guide is a person. So ICEFALL does
 * not record a guide's enquiries centrally at all, and these counts describe
 * this device rather than the marketplace.
 *
 * That is stated beside them rather than left for the guide to assume, because
 * the difference decides what the number is good for: it is fine for "who have I
 * heard from", and it is not fine for "is being listed with ICEFALL worth 10%".
 * The second question is the one a guide is actually asking, and today the
 * honest answer to it is that we cannot tell them.
 */
export function marketplace(
  events = VIEW_EVENTS,
  enquiries: readonly Enquiry[] = ENQUIRIES,
  bookings: readonly GuideBooking[] = BOOKINGS,
): Marketplace {
  const enquiryCount = enquiries.length;

  /**
   * COUNTED FROM THE LINK, NOT BY COMPARING TWO TOTALS.
   *
   * The first version of this function divided every booking by every enquiry
   * and put "133%" on the screen — a guide had been booked by four people and
   * written to by three, and nothing about those two facts makes a ratio. A
   * booking counts here only if it names the enquiry it came from.
   */
  const attributed = bookings.filter(
    (b) => b.status !== "cancelled" && b.fromEnquiryId !== null,
  ).length;

  /**
   * THREE STATES, because two of them were saying the wrong thing.
   *
   * "None of your bookings is linked to an enquiry" is a claim ABOUT some
   * bookings. Shown to a guide who has none, it implies we took bookings and
   * failed to attribute them — found by looking at the empty screen, not by
   * reading this function.
   */
  const anyLinked = bookings.some((b) => b.fromEnquiryId !== null);
  const noBookings = unavailable(GUIDE_NOTICES.earningsNoBookings("bookings"));
  const booked: Reading<number> =
    bookings.length === 0
      ? noBookings
      : anyLinked
        ? measured(attributed)
        : unavailable(GUIDE_NOTICES.CONVERSION_NOT_ATTRIBUTED);

  return {
    views: viewsReading(events),
    enquiries: measured(enquiryCount),
    booked,
    conversion:
      bookings.length === 0
        ? noBookings
        : anyLinked
          ? conversionRate(attributed, enquiryCount)
          : unavailable(GUIDE_NOTICES.CONVERSION_NOT_ATTRIBUTED),
    provenance: GUIDE_NOTICES.ENQUIRY_FUNNEL_NOT_RECORDED,
  };
}

/* ========================================================================== */
/* 4 — When am I free                                                         */
/* ========================================================================== */

export interface Availability {
  /** Dates an athlete can currently find and enquire about. */
  live: Opening[];
  /** Live dates with a place still unsold. */
  open: Opening[];
  /** Places unsold across those dates. A count of places, not of dates. */
  placesFree: number;
  /** The soonest date with a place on it, or null. */
  next: Opening | null;
  /**
   * NULL unless the guide has genuinely set nothing.
   *
   * "Not set" and "unavailable" are different statements — the athlete app's
   * `setDayAvailability` deletes the key rather than storing a default for
   * exactly this reason. A guide who has opened no dates has not declared
   * themselves busy, and the screen must not imply they have.
   */
  emptyReason: string | null;
}

export function availability(
  openings: readonly Opening[] = OPENINGS,
  now: Date = new Date(),
): Availability {
  const live = openings.filter((o) => o.status === "open" || o.status === "full");
  const open = live
    .filter((o) => o.taken < o.places)
    .sort((a, b) => (parseDay(a.from)?.getTime() ?? 0) - (parseDay(b.from)?.getTime() ?? 0));
  const placesFree = open.reduce((sum, o) => sum + (o.places - o.taken), 0);

  return {
    live,
    open,
    placesFree,
    /**
     * Against the START of today, not against this moment. An opening that ENDS
     * today is still a date the guide is on — comparing to `now` would drop it
     * at 00:01 and tell them their next free date is next month while they are
     * standing on this one.
     */
    next:
      open.find((o) => {
        const to = parseDay(o.to);
        return to !== null && to >= startOfDay(now);
      }) ?? null,
    emptyReason: openings.length === 0 ? GUIDE_NOTICES.DATES_NOT_SET : null,
  };
}

/* ========================================================================== */
/* All four, in one read                                                      */
/* ========================================================================== */

export interface GuideSummary {
  staged: StagedBooking[];
  earnings: EarningsSplit;
  next: StagedBooking | null;
  waiting: Waiting;
  market: Marketplace;
  dates: Availability;
}

/**
 * One call, so the home screen cannot disagree with the screen it links to.
 *
 * `now` is threaded through every derivation rather than each of them reading
 * the clock: two figures on one screen computed against two different instants
 * is a class of bug that shows up as an off-by-one hour nobody can reproduce.
 */
export function guideSummary(now: Date = new Date()): GuideSummary {
  const staged = stagedBookings(BOOKINGS, now);
  return {
    staged,
    earnings: earningsSplit(staged),
    next: nextDeparture(staged, now),
    waiting: waitingOnYou(ENQUIRIES, now),
    market: marketplace(),
    dates: availability(OPENINGS, now),
  };
}
