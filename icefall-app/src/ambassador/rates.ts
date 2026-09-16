/**
 * ICEFALL — the Ambassador programme's three numbers.
 *
 * CANONICAL COPY, same convention as `money.ts` in this directory: edit HERE,
 * then `npm run sync` (see `package.json`), which copies this file verbatim
 * into every app that shows an ambassador anything. A second, hand-typed 20%
 * or 15% anywhere else is how this project already learned its lesson once —
 * `money.ts`'s own header records the guide commission drifting to four
 * different numbers across four apps before it had one home.
 *
 * THESE THREE NUMBERS ARE OWNER DECISIONS (Charlie, co-founder), not defaults
 * and not open questions:
 *
 *   1. SUBSCRIPTIONS — the ambassador earns 20% OF REVENUE AFTER VAT, never of
 *      the sticker price. On €9.99 gross, VAT (~€1.79 at the EU average) comes
 *      out FIRST, leaving €8.20 of real revenue; the ambassador's cut is 20%
 *      of THAT (~€1.64/month) — never 20% of €9.99.
 *   2. BOOKINGS — the ambassador earns 15% OF ICEFALL'S OWN COMMISSION, never
 *      of the booking value. On a €62,000 Everest expedition where ICEFALL's
 *      7.5% referral fee nets €3,900, the ambassador earns 15% of €3,900 =
 *      €585 — never 15% of €62,000, which would exceed what ICEFALL itself
 *      earned and lose money on every booking.
 *   3. ATTRIBUTION WINDOW — 12 months from the referred person's signup. This
 *      is NOT a second, independent number: it is
 *      `ATTRIBUTION_WINDOW_MONTHS` from `money.ts`, the SAME operator-
 *      introduction window, re-exported here rather than redefined so the two
 *      programmes can never quietly drift apart.
 *
 * THE DATABASE MIRRORS THESE, AND MUST STAY MIRRORED. The basis-point literals
 * `1500` and `2000` in
 * `icefall-supabase/migrations/20260912150000_ambassador_program.sql`
 * (`record_ambassador_booking_share`, `record_ambassador_subscription_share`)
 * are what actually compute and freeze a payout — this file is what every
 * screen reads to DESCRIBE the programme. A change to the owner's decision
 * means editing both, in the same change.
 *
 * NOTHING IN THIS FILE MOVES MONEY. No payment processor is connected — see
 * the migration's header — and no ambassador has ever been paid. These are the
 * rules a payout will be computed by once one exists.
 */

/**
 * NOT an import from `./money.ts`, deliberately. This file is synced to each
 * app as a single standalone file (`npm run sync`, see `package.json`) — a
 * cross-import between two synced files would have to resolve identically
 * both here and after copying, which is exactly the kind of fragile path
 * assumption a flat `cp` should not have to carry. Instead this is the SAME
 * convention `money.ts` already uses to relate to the database's own
 * `commission_rules`/`record_commission`: a loud, cross-referencing comment on
 * both sides, checked by a test on each side, rather than a shared import.
 *
 * MUST equal `ATTRIBUTION_WINDOW_MONTHS` in `money.ts`. `ambassador.test.ts`
 * asserts this every run specifically so the two cannot drift silently.
 */
export type Cents = number;

/* ========================================================================== */
/* The three numbers                                                          */
/* ========================================================================== */

/** Decision #1: 20% of a subscription's revenue AFTER VAT. Basis points: 2000 = 20.00%. */
export const AMBASSADOR_SUBSCRIPTION_SHARE_BPS = 2000;
export const AMBASSADOR_SUBSCRIPTION_SHARE_PCT = 20;

/** Decision #2: 15% of ICEFALL's OWN commission on a booking. Basis points: 1500 = 15.00%. */
export const AMBASSADOR_BOOKING_SHARE_BPS = 1500;
export const AMBASSADOR_BOOKING_SHARE_PCT = 15;

/**
 * Decision #3: 12 months from the referred person's signup — THE SAME window
 * as `ATTRIBUTION_WINDOW_MONTHS` (the operator-introduction attribution) in
 * `money.ts`. Kept as its own literal rather than an import — see the header
 * — but a test in `ambassador.test.ts` imports both files together and
 * asserts they still agree, so a change to one without the other fails a run
 * rather than drifting unnoticed.
 */
export const AMBASSADOR_ATTRIBUTION_WINDOW_MONTHS = 12;

/* ========================================================================== */
/* Worked-example disclosure copy — ONE sentence, read everywhere            */
/* ========================================================================== */

/**
 * Stated as worked examples, the only unambiguous way to state a percentage —
 * matching `GUIDE_FEE_DISCLOSURE`'s convention in `money.ts`. Any screen that
 * explains the programme's rates should read these rather than composing its
 * own sentence, so two screens cannot describe the same rule two different ways.
 */
export const AMBASSADOR_SUBSCRIPTION_SHARE_DISCLOSURE =
  `You earn ${AMBASSADOR_SUBSCRIPTION_SHARE_PCT}% of a referred member's subscription revenue AFTER VAT — never of the sticker price. On a €9.99 month, VAT is removed first; your share is ${AMBASSADOR_SUBSCRIPTION_SHARE_PCT}% of what is left.`;

export const AMBASSADOR_BOOKING_SHARE_DISCLOSURE =
  `You earn ${AMBASSADOR_BOOKING_SHARE_PCT}% of ICEFALL's OWN commission on a referred booking — never of the booking's value. If ICEFALL's fee on an expedition is €3,900, your share is ${AMBASSADOR_BOOKING_SHARE_PCT}% of €3,900, not of the trip's price.`;

export const AMBASSADOR_ATTRIBUTION_DISCLOSURE =
  `A referral counts for ${AMBASSADOR_ATTRIBUTION_WINDOW_MONTHS} months from the moment that person signs up. Subscriptions and bookings after that no longer credit you.`;

export const AMBASSADOR_PAYMENTS_NOT_CONNECTED =
  "No payment processor is connected anywhere in ICEFALL yet. No subscription has been billed and no booking has been paid, so every figure here is a real, measured zero — not a placeholder.";

/* ========================================================================== */
/* Pure arithmetic — for a screen previewing what a share WOULD be           */
/* ========================================================================== */

/**
 * 20% of net-of-VAT subscription revenue, floored.
 *
 * FLOOR, NOT ROUND — matching every other rate in this codebase
 * (`totalsForAmount`, `referralFee`, `record_commission`). On a PAYOUT this
 * means the fractional cent stays with ICEFALL rather than reaching the
 * ambassador, which is the conservative reading of "never in a way that costs
 * ICEFALL" — flagged in the migration's own comments as worth a one-line
 * confirmation from the owner, because it reverses the existing engines'
 * "the fraction always goes to the counterparty" spirit (they collect; here
 * ICEFALL pays out).
 *
 * `netCents` must already be net of VAT — this function never assumes a VAT
 * rate. A caller holding only a gross figure has no honest way to call this.
 */
export function ambassadorSubscriptionShare(netCents: Cents): Cents {
  return Math.floor((netCents * AMBASSADOR_SUBSCRIPTION_SHARE_BPS) / 10000);
}

/**
 * 15% of ICEFALL's own commission amount on a booking, floored.
 *
 * `commissionAmountCents` is `commissions.amount_cents` — ICEFALL's fee,
 * already net of pass-through costs — never the booking's `value_cents`.
 */
export function ambassadorBookingShare(commissionAmountCents: Cents): Cents {
  return Math.floor((commissionAmountCents * AMBASSADOR_BOOKING_SHARE_BPS) / 10000);
}

/** The introduction stops crediting the ambassador after this date. */
export function ambassadorAttributionDeadline(signupIso: string): string {
  const d = new Date(signupIso);
  d.setMonth(d.getMonth() + AMBASSADOR_ATTRIBUTION_WINDOW_MONTHS);
  return d.toISOString();
}

/** Whether an event (a payment, a booking) falls inside the referral's window. */
export function isWithinAmbassadorAttribution(signupIso: string, eventIso: string): boolean {
  const signup = new Date(signupIso).getTime();
  const event = new Date(eventIso).getTime();
  const deadline = new Date(ambassadorAttributionDeadline(signupIso)).getTime();
  return event >= signup && event <= deadline;
}

/* ========================================================================== */
/* Attribution capture — how a code reaches a signup, on the web and in-app  */
/* ========================================================================== */

/**
 * The query parameter an ambassador's shared link carries.
 *
 * Deliberately NOT `ref` or `code` or anything the existing, unrelated
 * "Expedition crew" member-referral screen might plausibly also grow into
 * using one day — a shared parameter name between two different attribution
 * schemes is how one gets silently fed the other's value. `amb` reads as
 * "ambassador" and nothing else.
 */
export const AMBASSADOR_CODE_PARAM = "amb";

/** Where a captured code waits between the link being opened and the account existing. */
export const AMBASSADOR_CODE_STORAGE_KEY = "icefall.ambassador.code";

/**
 * Read `?amb=CODE` off a URL, if present. Pure — takes the search string
 * rather than reaching into `window.location` itself, so it is callable from
 * a unit test and from either app's router with no DOM assumptions.
 */
export function parseAmbassadorCode(search: string): string | null {
  try {
    const v = new URLSearchParams(search).get(AMBASSADOR_CODE_PARAM);
    const trimmed = v?.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  } catch {
    return null;
  }
}
