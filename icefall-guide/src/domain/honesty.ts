/**
 * THE HONESTY DOCTRINE, GUIDE-SIDE.
 *
 * The athlete app's version of this rule protects a climber deciding whether to
 * leave a hut at 4 a.m. The operator portal's protects a company deciding where
 * to spend money. This file protects the third party to the same trade, and the
 * one with the least room to absorb being wrong: a self-employed mountain guide
 * reading what ICEFALL says they have earned, who is waiting on them, and
 * whether being listed here is worth anything.
 *
 * THE STAKES ARE NOT SOFTER HERE BECAUSE IT IS ONLY MONEY. They are sharper in
 * one specific way. An invented readiness score is a claim about a mountain, and
 * a climber can look at the mountain. An invented earnings figure is a claim
 * about a guide's own bank account, presented to them by the platform that is
 * supposed to be holding it — and the reader has no independent way to check a
 * number that purports to describe money we are keeping on their behalf. A
 * marketplace that is casual with a professional's income figures is one they
 * leave, and they are right to.
 *
 * So: this app never prints a figure ICEFALL did not measure. Where the
 * measurement does not exist, the screen says why, in words, in the space the
 * number would have occupied. `Reading<T>` is what carries that reason, and
 * nothing in this codebase may unwrap one by substituting a default.
 *
 * DELIBERATELY THE SAME SHAPE AS `icefall-operator/src/domain/honesty.ts`.
 * The two files answer the same question for the two sides of the marketplace,
 * and the primitives are identical on purpose — `Measured`, `Unavailable`,
 * `fold` with no default parameter. The SENTENCES differ, because what an
 * operator needs told and what a guide needs told are not the same, and a
 * shared sentence would end up vague enough to suit neither.
 */

import { type Cents, totalsForAmount } from "@/money/model";

/* ========================================================================== */
/* The primitives                                                             */
/* ========================================================================== */

/** A figure ICEFALL actually measured. */
export interface Measured<T> {
  readonly available: true;
  readonly value: T;
}

/**
 * A figure ICEFALL does not have, and the reason.
 *
 * `reason` is rendered to the guide verbatim. It is not a log line and not a
 * developer message — it is the sentence that appears where the number isn't.
 */
export interface Unavailable {
  readonly available: false;
  readonly reason: string;
}

export type Reading<T> = Measured<T> | Unavailable;

export const measured = <T>(value: T): Measured<T> => ({ available: true, value });
export const unavailable = (reason: string): Unavailable => ({ available: false, reason });

/**
 * The one safe way to read a `Reading` in a component.
 *
 * Deliberately has no `defaultValue` parameter and never will. A default is how
 * an unmeasured figure becomes a zero, and a zero is a claim: "nobody looked at
 * your profile" is a very different statement from "we are not counting yet",
 * and "you earned €0" is a very different statement from "no booking has been
 * paid through us".
 */
export function fold<T, R>(
  r: Reading<T>,
  onValue: (v: T) => R,
  onMissing: (reason: string) => R,
): R {
  return r.available ? onValue(r.value) : onMissing(r.reason);
}

/* ========================================================================== */
/* The sentences themselves                                                   */
/* ========================================================================== */

/**
 * Rendered verbatim. Screens must not paraphrase these, because the precise
 * claim each one makes — and declines to make — is the point.
 *
 * Written in the second person because a guide is reading about themselves.
 */
export const GUIDE_NOTICES = {
  /**
   * PROFILE VIEWS ARE NOT COUNTED, AND THEY ARE NOT COUNTED TWICE OVER.
   *
   * Verified against the schema on 2026-08-29, not assumed:
   *
   *   1. Nothing in the ICEFALL family emits a `listing_view` event. This is the
   *      same finding the operator portal records (constitution §6c, §6d).
   *   2. `public.analytics_events` has no guide or profile column at all — only
   *      `company_id`, `destination_id`, `product_id`, `thread_id`, `lead_id`.
   *      So even a working emitter has nowhere to attribute a view of a GUIDE'S
   *      profile. Filed to Session 03; low priority, because this sentence is
   *      the honest answer and it is the same code path as the working metric.
   *
   * The guide is told one thing, not two, because the second is our problem and
   * not theirs. A sentence about a missing database column would be noise
   * wearing an explanation's clothes (§6h).
   *
   * It does not show 0, it does not hide the tile, and it does not estimate from
   * enquiries — a guide weighing whether being listed with ICEFALL is worth the
   * commission would read any of those three as a measurement.
   */
  VIEWS_NOT_COUNTED:
    "ICEFALL is not counting profile views yet. This will show a real figure once it is measured — never an estimate.",

  /**
   * Views exist, but only from an untrusted emitter.
   *
   * Deliberately a DIFFERENT sentence from "not counting yet". A `client` row is
   * written with the public key, so it is authored by whoever is looking at the
   * page — which includes the guide the number flatters. Showing that figure
   * would hand a professional a number they could inflate themselves and then
   * make a commercial decision on; showing the not-counting sentence would be
   * false once rows exist. This says the true third thing. (§6d.)
   */
  VIEWS_CLIENT_ONLY:
    "Views are being recorded but not yet from a source ICEFALL can verify, so there is no figure here you should make a decision on.",

  /**
   * Bookings ÷ enquiries, with no enquiries.
   *
   * 0/0 is not 0%. A guide with no enquiries has not converted badly; they have
   * not been given the chance to convert at all, and telling a self-employed
   * professional "0% conversion" is telling them something false and
   * discouraging about their own work.
   */
  CONVERSION_NO_DENOMINATOR: "No enquiries yet, so there is no conversion rate to show.",

  /**
   * A THIRD STATE, AND IT WAS FOUND BY LOOKING AT THE SCREEN.
   *
   * The first version of this app's marketplace section divided total bookings
   * by total enquiries and rendered "133%". The arithmetic was fine; the
   * QUESTION was wrong. Bookings and enquiries are not a funnel unless something
   * ties each booking to the enquiry it came from, and a guide can be booked by
   * someone who never sent one — a client who has their number already, or who
   * met them on a hill. Dividing the two counts silently asserts a relationship
   * that does not exist, and it can exceed 100% while doing it.
   *
   * `public.bookings.lead_id` is where that link lives, and a guide's booking
   * has no lead to point at, because `public.leads` is company-scoped. So the
   * honest answer is not "0%" and not "no denominator" — it is that ICEFALL
   * cannot tell which of these bookings it is responsible for. Which is exactly
   * the question a guide paying 10% is asking.
   */
  CONVERSION_NOT_ATTRIBUTED:
    "None of your bookings is linked to an enquiry, so there is no way to say how many ICEFALL brought you.",

  /** A booking recorded before anyone has told us what it was worth. */
  BOOKING_VALUE_PENDING: "Value not yet reported",

  /** A booking whose value nobody is going to supply. */
  BOOKING_VALUE_UNKNOWN: "Value not recorded",

  /**
   * An earnings total must state its own incompleteness.
   *
   * A total that silently omits the bookings with no value reads as the whole
   * picture, and the guide would be reconciling it against their bank statement.
   */
  earningsExcludes: (excluded: number): string =>
    excluded === 1
      ? "Excludes 1 booking with no value recorded."
      : `Excludes ${excluded} bookings with no value recorded.`,

  /**
   * No booking in the set carried a value. Distinct from "you earned nothing".
   *
   * TAKES THE SET IT IS DESCRIBING, and has no default, because the same
   * function totals more than one set — what has been paid out and what is still
   * to come — and a sentence that says "no booking has a value" while sitting
   * under a heading about completed work makes a false claim about the others.
   * The caller names what it summed or it does not get a sentence.
   */
  earningsNoneReported: (set: string): string =>
    `None of your ${set} has a value recorded, so there is nothing to total.`,

  /** Nothing in the set at all. Distinct again — there is nothing to have a value. */
  earningsNoBookings: (set: string): string => `No ${set} yet.`,

  /**
   * THE EARNINGS HISTORY DOES NOT EXIST, AND THIS REPLACES A CHART THAT
   * PRETENDED IT DID.
   *
   * Today's screen carried a five-month bar chart of this guide's fee by month,
   * footnoted "Nothing has been paid through ICEFALL yet". The footnote was
   * true and the chart was not, and a reader takes the shape before the
   * footnote. There is no payments ledger anywhere in the family — no processor,
   * no payouts table, no money has ever moved — so a monthly series cannot be
   * derived from anything.
   */
  EARNINGS_HISTORY_NOT_RECORDED:
    "ICEFALL has never paid a guide, so there is no earnings history to chart. This fills in from your payouts once money starts moving.",

  /**
   * A NOTE ON WHAT "EARNED" MEANS HERE, and it is not decoration.
   *
   * Every figure this app calls earnings is what the guide receives AFTER
   * ICEFALL's commission, computed by the shared money model. Stating the basis
   * beside the number is the difference between a figure a guide can reconcile
   * and one they have to guess at.
   */
  EARNINGS_ARE_NET: "After ICEFALL's commission — this is what reaches you.",

  /**
   * Enquiries are not a measured funnel for a guide, and the reason is
   * structural rather than temporary.
   *
   * `public.leads` — the table the whole enquiry→qualified→booked funnel is
   * computed from — has `company_id not null`. A guide is a person, not a
   * company, so a guide's enquiry cannot be recorded as a lead at all. Until
   * Session 03 widens that, an enquiry count here is a count of local threads,
   * never of marketplace performance.
   */
  ENQUIRY_FUNNEL_NOT_RECORDED:
    "ICEFALL does not yet record a guide's enquiries the way it records a company's, so there is no marketplace figure here — only the messages on this device.",

  /**
   * Availability is a statement, and its absence is not a different statement.
   *
   * Copied in spirit from `setDayAvailability` in the athlete app: "'not set'
   * and 'unavailable' are different statements." A guide who has not opened a
   * date has not declared themselves busy on it.
   */
  DATES_NOT_SET: "You have not set any dates yet. Nothing is being shown as unavailable — a date you have not opened is simply a date you have not spoken about.",

  /**
   * WHERE AN EXPIRY DATE CAME FROM, said beside the date rather than assumed.
   *
   * `public.verification_documents.expiry_source` records whether ICEFALL read a
   * date off the certificate or was simply told it, and makes that mandatory
   * whenever a date exists — because, in the migration's own words, *"ICEFALL
   * must never assert a lapse date it inferred or was merely told."*
   *
   * It earns its place on screen here for a reason it would not on a company's
   * page: in this app the date HIDES A GUIDE'S LISTING, which is lost income. A
   * countdown reading "expires in 3 days" is a materially weaker claim when
   * nobody has seen the document it supposedly came from, and the guide is the
   * one person who can tell us it is wrong.
   *
   * Note what this deliberately does NOT do: it does not soften the lapse. Self-
   * reported cannot OUTRANK recorded, which is not the same as counting for
   * nothing — see `effectiveStatus`. It changes the remedy, not the margin.
   */
  expiryProvenance: (source: "printed_on_document" | "stated_by_holder"): string =>
    source === "printed_on_document"
      ? "Read from the document you sent us."
      : "You told us this date — nobody at ICEFALL has seen it written on the document. Send the certificate if it is wrong.",

  /** No expiry has been recorded. Not "no expiry", and never "expired". */
  EXPIRY_NOT_RECORDED: "No expiry recorded for this document.",

  /**
   * A date is on file and ICEFALL cannot read it. A THIRD state again.
   *
   * The listing is hidden, because a safety check that cannot read its input
   * must never answer "safe" — but the guide is told the truth about which of
   * the two things happened, because the remedies differ completely. "Your
   * certificate ran out" means send a new one. This means the date we hold is
   * damaged and the document itself may be perfectly current.
   */
  EXPIRY_UNREADABLE:
    "We cannot read the expiry date we hold for this document, so your listing is hidden until it is fixed. This is our fault, not a lapse — send the document again and it will be corrected.",

  /**
   * Verification says what ICEFALL did, never what it did not do.
   *
   * Returns null when no check has been recorded, because a fabricated check
   * date is the exact violation already found and fixed in the athlete app's
   * booking data.
   */
  documentsChecked: (checkedAt: string | null): string | null =>
    checkedAt ? `Documents checked by ICEFALL on ${checkedAt}` : null,
} as const;

/* ========================================================================== */
/* Money                                                                      */
/* ========================================================================== */

/**
 * Why a booking has no value, mirroring `public.bookings.value_status`.
 *
 * `reported` is the only status that may carry a figure, and the type makes the
 * other two unable to. The database enforces the same thing with
 * `bookings_value_coherent`: "reported as nothing" is unstorable. This is the
 * honesty rule expressed so that the wrong thing does not compile rather than so
 * that reviewers catch it.
 */
export type BookingValue =
  | { readonly status: "reported"; readonly cents: Cents }
  | { readonly status: "pending" }
  | { readonly status: "unknown" };

export function bookingValueReading(v: BookingValue): Reading<Cents> {
  switch (v.status) {
    case "reported":
      return measured(v.cents);
    case "pending":
      return unavailable(GUIDE_NOTICES.BOOKING_VALUE_PENDING);
    case "unknown":
      return unavailable(GUIDE_NOTICES.BOOKING_VALUE_UNKNOWN);
  }
}

/** One booking, as far as the earnings arithmetic is concerned. */
export interface EarningsInput {
  readonly value: BookingValue;
  readonly partySize: number;
  /**
   * The part of the total the guide collects and hands straight on — hut fees,
   * permits, lifts. NEVER inferred: nothing about an amount reveals whether part
   * of it was a hut bill, so a caller that does not know passes 0 and is thereby
   * asserting the whole figure is the guide's fee. (Owner decision 13: ICEFALL
   * charges on what the counterparty keeps, never on pass-through costs.)
   */
  readonly passedThrough: Cents;
}

/**
 * What the guide actually receives, summed, and what the sum leaves out.
 *
 * TWO RULES, BOTH LOAD-BEARING.
 *
 * 1. THE COMMISSION IS NEVER COMPUTED HERE. Every row delegates to
 *    `totalsForAmount` in the shared money model. Importing `GUIDE_COMMISSION_PCT`
 *    and multiplying would protect the RATE and not the RULE (§6g): the shared
 *    model FLOORS the commission so the remainder goes to the guide, and a local
 *    `Math.round` would round toward ICEFALL half the time — on the one screen
 *    that tells a self-employed person what they are owed. This app shipped
 *    exactly that bug until 2026-08-29, at 12% besides.
 *
 * 2. PER BOOKING, THEN SUM — not sum, then deduct once. The guide checks this
 *    total against the individual rows on the payouts screen, and flooring once
 *    over the sum would disagree with the sum of the rows by a few cents with
 *    nothing on screen to explain it. The rows are the source of truth because
 *    the rows are what a payment provider will settle.
 *
 * `excluded` is not optional and not a footnote — a caller that wants the total
 * receives the incompleteness alongside it, or it does not get the total.
 */
export function netEarnings(
  bookings: readonly EarningsInput[],
  /**
   * A plural noun phrase naming what was summed — "completed bookings",
   * "upcoming bookings". NO DEFAULT: see `GUIDE_NOTICES.earningsNoneReported`.
   */
  set: string,
): { total: Reading<Cents>; excluded: number } {
  const reported = bookings.filter(
    (b): b is EarningsInput & { value: { status: "reported"; cents: Cents } } =>
      b.value.status === "reported",
  );
  const excluded = bookings.length - reported.length;

  if (reported.length === 0) {
    return {
      total: unavailable(
        bookings.length === 0
          ? GUIDE_NOTICES.earningsNoBookings(set)
          : GUIDE_NOTICES.earningsNoneReported(set),
      ),
      excluded,
    };
  }

  const total = reported.reduce(
    (sum, b) =>
      sum + totalsForAmount(b.value.cents, b.partySize, undefined, b.passedThrough).guideReceives,
    0,
  );
  return { total: measured(total), excluded };
}

/**
 * Bookings ÷ enquiries, refusing the 0/0 case.
 *
 * Returns a rate in the range 0..1. A genuine zero — enquiries that converted
 * none — IS measured and is returned as such; it is only the absent denominator
 * that is unavailable. Conflating those two was the bug this function exists to
 * make impossible.
 */
export function conversionRate(bookings: number, enquiries: number): Reading<number> {
  if (enquiries <= 0) return unavailable(GUIDE_NOTICES.CONVERSION_NO_DENOMINATOR);
  return measured(bookings / enquiries);
}

/* ========================================================================== */
/* Views                                                                      */
/* ========================================================================== */

/**
 * One row of `public.analytics_events`, as far as this app can see it.
 *
 * `source` is the column that decides whether a count is a measurement. See
 * `viewsReading`.
 */
export interface ViewEvent {
  readonly eventType: string;
  readonly source: "client" | "server";
}

/**
 * Profile views, honestly, in three states.
 *
 * Copied from `icefall-operator`'s `viewsReading` — deliberately, because it
 * already draws the right line and a second reading of the same doctrine is how
 * two apps end up disagreeing about what counts as measured.
 *
 * ONLY SERVER-EMITTED ROWS COUNT. A `client` row is written with the public
 * anon key, so it is authored by whoever is looking at the page — including the
 * guide whose profile it flatters. Counting those would put a number a
 * professional can inflate on the screen they use to judge whether ICEFALL's
 * commission is buying them anything.
 *
 * When a trusted emitter exists this function needs no change: it starts
 * returning a figure. That is the point of building it now — the unavailable
 * state and the working state are the same code path, so the working one is not
 * new code written under pressure the day the backend lands.
 */
export function viewsReading(events: readonly ViewEvent[]): Reading<number> {
  const views = events.filter((e) => e.eventType === "listing_view");
  const trusted = views.filter((e) => e.source === "server");
  if (trusted.length > 0) return measured(trusted.length);
  return unavailable(
    views.length > 0 ? GUIDE_NOTICES.VIEWS_CLIENT_ONLY : GUIDE_NOTICES.VIEWS_NOT_COUNTED,
  );
}

/**
 * The footnote that qualifies an incomplete total — or nothing.
 *
 * ONLY EVER SITS BESIDE A FIGURE THAT EXISTS. An unavailable total has already
 * explained, in its own sentence and in the space the number would have had,
 * that there was nothing to sum; repeating "excludes 1 booking with no value"
 * underneath says the same thing a second time, and a screen that repeats itself
 * teaches the reader to skim the part that matters.
 *
 * Lives here rather than in the two screens that need it. Both the home screen
 * and the payouts screen show these totals, and two local copies of one rule
 * about what to say beside a number is the same shape as the duplicated
 * commission model this app deleted on 2026-08-29, one size down.
 */
export function excludedNote<T>(total: Reading<T>, excluded: number): string | undefined {
  return total.available && excluded > 0 ? GUIDE_NOTICES.earningsExcludes(excluded) : undefined;
}
