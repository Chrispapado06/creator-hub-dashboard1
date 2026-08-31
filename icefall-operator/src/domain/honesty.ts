/**
 * THE HONESTY DOCTRINE, OPERATOR-SIDE.
 *
 * The consumer app's version of this rule protects a climber deciding whether to
 * leave a hut at 4 a.m. This file protects the other party to the same trade: a
 * company deciding where to spend money on the strength of what Icefall tells
 * them is happening.
 *
 * The failure is identical in shape. An athlete reading an invented readiness
 * score and an operator reading an invented view count are both making a real
 * decision on a number nobody measured. The second one is not softer because it
 * is only money — it is a company choosing to buy placement, or not, on our
 * word.
 *
 * So: this portal never prints a figure Icefall did not measure. Where the
 * measurement does not exist, the screen says why, in words, in the space the
 * number would have occupied. `Reading<T>` is what carries that reason, and
 * nothing in this codebase may unwrap one by substituting a default.
 */

/** A figure ICEFALL actually measured. */
export interface Measured<T> {
  readonly available: true;
  readonly value: T;
}

/**
 * A figure ICEFALL does not have, and the reason.
 *
 * `reason` is rendered to the operator verbatim. It is not a log line and not a
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
 * an unmeasured figure becomes a zero, and a zero is a claim: "nobody viewed
 * your listing" is a very different statement from "we are not counting yet".
 */
export function fold<T, R>(r: Reading<T>, onValue: (v: T) => R, onMissing: (reason: string) => R): R {
  return r.available ? onValue(r.value) : onMissing(r.reason);
}

/* ========================================================================== */
/* The sentences themselves                                                   */
/* ========================================================================== */

/**
 * Rendered verbatim. Screens must not paraphrase these, because the precise
 * claim each one makes — and declines to make — is the point.
 */
export const OPERATOR_NOTICES = {
  /** No lead arrived in the window at all — so no share of them exists. */
  NO_LEADS_IN_WINDOW: "No enquiries in this period, so there is nothing to work out a share of.",
  /** Nobody has replied yet — which is not the same as replying instantly. */
  NO_REPLIES_YET:
    "No enquiry in this period has been replied to yet, so there is no reply time to report.",
  /** Nothing booked yet — which is not the same as booking in zero days. */
  NO_BOOKINGS_YET: "Nothing booked in this period yet.",
  /**
   * There ARE bookings, they are simply not confirmed. Distinct from
   * NO_BOOKINGS_YET, which sat beside a "Booked: 1" column and contradicted it.
   */
  bookingsNotConfirmed: (n: number): string =>
    n === 1
      ? "One booking here is not confirmed yet, so there is no revenue to report."
      : `${n} bookings here are not confirmed yet, so there is no revenue to report.`,
  /** Confirmed, but nobody told us what it was worth. */
  BOOKING_VALUE_NOT_REPORTED:
    "Booked, but no value has been reported — so there is no revenue figure, not a zero.",
  /**
   * Nothing in the Icefall family emits a listing-view event today. Verified
   * 2026-08-28: no analytics event layer exists in any consumer surface.
   *
   * Until the climber-facing apps count views, this portal shows this sentence
   * where the number goes. It does not show 0, it does not hide the metric, and
   * it does not estimate from enquiries — an operator weighing paid placement
   * would read any of those three as a measurement.
   */
  VIEWS_NOT_COUNTED:
    "Icefall is not counting listing views yet. This will show a real figure once it is measured — never an estimate.",

  /**
   * Views exist, but only from an untrusted emitter.
   *
   * Deliberately a DIFFERENT sentence from "not counting yet". Showing the
   * client figure would hand an operator a number they could inflate
   * themselves; showing the not-counting sentence would be false once rows
   * exist. This says the true third thing.
   */
  VIEWS_CLIENT_ONLY:
    "Views are being recorded but not yet from a source Icefall can verify, so there is no figure here you should make a commercial decision on.",

  /**
   * Bookings ÷ enquiries, with no enquiries.
   *
   * 0/0 is not 0%. A company with no enquiries has not converted badly; it has
   * not been given the chance to convert at all, and telling it "0% conversion"
   * is telling it something false about its own performance.
   */
  CONVERSION_NO_DENOMINATOR:
    "No enquiries yet, so there is no conversion rate to show.",

  /** A booking recorded before anyone has told us what it was worth. */
  BOOKING_VALUE_PENDING: "Value not yet reported",

  /** A booking whose value nobody is going to supply. */
  BOOKING_VALUE_UNKNOWN: "Value not recorded",

  /**
   * Estimated GMV must state its own incompleteness. A total that silently
   * omits the bookings with no value reads as the whole picture.
   */
  gmvExcludes: (excluded: number): string =>
    excluded === 1
      ? "Excludes 1 booking with no value reported."
      : `Excludes ${excluded} bookings with no value reported.`,

  /**
   * Spec §2: operators cannot choose, change or negotiate their ranking
   * position. The portal says so plainly rather than showing a disabled input,
   * which reads as "ask us and we'll enable it".
   */
  PLACEMENT_READ_ONLY:
    "Placement is decided by Icefall and cannot be changed here.",

  /**
   * Spec §18: a placement expires; the mountain is NOT reordered.
   *
   * The operator has to understand that their products are still theirs and
   * their position has not been given away — only that the commercial
   * arrangement has lapsed.
   */
  PLACEMENT_EXPIRED:
    "This placement has expired. Your products and enquiries are unaffected. Icefall will be in touch to renew it.",

  /** Spec §2: the existing approved version stays live throughout. */
  PENDING_LIVE_UNCHANGED:
    "Your current published version is still live. It will not change until Icefall approves this edit.",

  /**
   * Verification is a statement about what ICEFALL did — checked documents —
   * and never an implication that the issuing association was contacted.
   * Returns null when no check has been recorded, because a fabricated check
   * date is the exact violation already shipping in the web app's demo data.
   */
  documentsChecked: (checkedAt: string | null): string | null =>
    checkedAt ? `Documents checked by Icefall on ${checkedAt}` : null,

  /**
   * Spec §2 and §5. Shown next to any public-facing free-text field, so the
   * rule is explained before it is enforced rather than as a rejection.
   */
  NO_CONTACT_DETAILS:
    "Phone numbers, email addresses, messaging handles and booking links cannot appear in public content. Customers reach you through Icefall so that your enquiries and your bookings stay attributed to you.",

  /** Spec §18: never silently lose edits. */
  EDIT_CONFLICT:
    "This page changed since you started editing. Review the differences before submitting — nothing you have typed has been lost.",

  /** Spec §18: a conversation about a product that no longer exists. */
  PRODUCT_ARCHIVED_HISTORICAL:
    "This enquiry is about a trip you have since archived. The name shown is the one the customer saw.",

  /** The referral rate is deliberately unset — owner decision, 2026-08-28. */
  REFERRAL_RATE_PLACEHOLDER:
    "Referral fee not yet set — placeholder, not a live rate.",
} as const;

/* ========================================================================== */
/* Money                                                                      */
/* ========================================================================== */

/** Integer minor units. Never a float, never a bare number in a component. */
export type Cents = number;

/**
 * Why a booking has no value, per spec §18.
 *
 * `reported` is the only status that may carry a figure, and the type makes the
 * other two unable to. This is the honesty rule expressed so that the wrong
 * thing does not compile rather than so that reviewers catch it.
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
      return unavailable(OPERATOR_NOTICES.BOOKING_VALUE_PENDING);
    case "unknown":
      return unavailable(OPERATOR_NOTICES.BOOKING_VALUE_UNKNOWN);
  }
}

/**
 * Sums only what was reported, and says what it left out.
 *
 * The `excluded` count is not optional and not a footnote — a caller that wants
 * the total has to receive the incompleteness alongside it.
 */
export function estimatedGmv(values: readonly BookingValue[]): {
  total: Reading<Cents>;
  excluded: number;
} {
  const reported = values.filter((v): v is Extract<BookingValue, { status: "reported" }> => v.status === "reported");
  const excluded = values.length - reported.length;
  if (reported.length === 0) {
    return {
      total: unavailable(
        values.length === 0
          ? "No bookings recorded yet."
          : "No booking values have been reported yet.",
      ),
      excluded,
    };
  }
  return { total: measured(reported.reduce((sum, v) => sum + v.cents, 0)), excluded };
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
  if (enquiries <= 0) return unavailable(OPERATOR_NOTICES.CONVERSION_NO_DENOMINATOR);
  return measured(bookings / enquiries);
}
