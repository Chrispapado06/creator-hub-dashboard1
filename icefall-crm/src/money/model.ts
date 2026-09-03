/**
 * ICEFALL — the money model.
 *
 * ═══ RE-SKIN NOTICE, 2026-09-03 ═══
 * A visual pass over the CRM must NOT change anything in this file. It is copied
 * verbatim into three other apps (see below), so a formatting convention picked
 * up from a theme would travel to trees this task never opened and make four
 * apps disagree about what a client owes. Re-skin the SCREENS that render money;
 * leave the model alone. If it genuinely has to change, it changes here first
 * and every copy is updated the same day.
 *
 * CANONICAL COPY. This file lives in `icefall-shared/` and is copied verbatim
 * into icefall-app, icefall-guide and icefall-admin. Edit it HERE and re-copy;
 * three drifting definitions of what a client owes is the worst possible bug in
 * this system, because each app would tell a different person a different
 * number about the same booking.
 *
 * NOTHING IN THIS FILE MOVES MONEY. There is no payment processor connected.
 * These are the rules a processor will be driven by, and they are written now
 * because they are the part that has to be right before anything is charged.
 *
 * ── AMOUNTS ARE INTEGER CENTS, ALWAYS ──────────────────────────────────────
 *
 * Every amount here is a whole number of euro cents. Not euros, not floats.
 * `0.1 + 0.2 !== 0.3` in binary floating point, and a marketplace that splits a
 * payment three ways — client pays, guide receives, ICEFALL keeps — accumulates
 * those errors until the books do not balance. Stripe's API is integer minor
 * units for the same reason. Convert at the edge, with `formatEur`, and never
 * in the middle.
 */

export type Cents = number;

/** €1,234.50 → "€1,234.50". The ONLY place cents become a human number. */
export function formatEur(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const s = (abs / 100).toLocaleString("en-GB", {
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? "−" : ""}€${s}`;
}

export const eur = (whole: number): Cents => Math.round(whole * 100);

/* ========================================================================== */
/* Where ICEFALL can actually pay a guide                                     */
/* ========================================================================== */

/**
 * Stripe Connect's cross-border payouts reach connected accounts in the US, UK,
 * EEA, Canada and Switzerland only. Everywhere else needs a different
 * arrangement, and pretending otherwise would mean taking a client's money for a
 * trip we cannot pay the guide for.
 *
 * Verified against Stripe's cross-border payouts documentation, August 2026.
 * Re-check before adding a country — this list is a legal and operational fact,
 * not a preference.
 */
const EEA = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark",
  "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland",
  "Ireland", "Italy", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Romania", "Slovakia",
  "Slovenia", "Spain", "Sweden",
];

export const PAYOUT_COUNTRIES = new Set([
  ...EEA,
  "United Kingdom",
  "Switzerland",
  "United States",
  "Canada",
]);

export type PayoutEligibility =
  | { ok: true }
  | { ok: false; reason: string; options: string[] };

export function payoutEligibility(country: string): PayoutEligibility {
  if (PAYOUT_COUNTRIES.has(country.trim())) return { ok: true };
  return {
    ok: false,
    reason: `ICEFALL cannot pay out to a bank account in ${country} yet. Our payment provider settles to the UK, EEA, Switzerland, the US and Canada only.`,
    options: [
      "Get paid into a company account your business holds in a supported country",
      "Take payment from the client directly, and list with ICEFALL for discovery only",
    ],
  };
}

/* ========================================================================== */
/* A quote                                                                     */
/* ========================================================================== */

export interface QuoteLine {
  label: string;
  amount: Cents;
  /** Per person, or for the whole party. Changes the arithmetic, so it is explicit. */
  per: "person" | "party";
  /**
   * A cost the guide collects and hands straight on: a hut bed, a permit, a lift
   * pass, hired kit. ICEFALL charges NO COMMISSION on it.
   *
   * Settled by the product owner 2026-08-28. ICEFALL earns on the work somebody
   * did, not on money that merely passed through their hands — so a hut raising
   * its charges must never increase what ICEFALL takes.
   *
   * It is a STATED property of the line, never inferred. Nothing can look at a
   * figure and tell whether it was passed on, which is why this is a flag on the
   * quote rather than a heuristic in the arithmetic.
   */
  passThrough?: boolean;
}

/**
 * Something the client will have to pay for that is NOT in this price.
 *
 * Required, and allowed to be an empty list only when the guide has actively
 * said so. Surprise extras — huts, lifts, permits, cable cars — are the single
 * biggest cause of a booking souring, and the client should meet them here
 * rather than in a car park at 6 a.m.
 */
export interface Exclusion {
  label: string;
  /** An indication, not a quote. Null when the guide genuinely cannot say. */
  approxAmount: Cents | null;
}

export type CancelledBy = "client" | "guide" | "conditions";

/**
 * What a client gets back, by how many days' notice they give.
 *
 * Tiers are sorted most-notice-first and evaluated top-down. `refundPct` is the
 * share of everything paid so far.
 */
export interface CancellationTier {
  daysBefore: number;
  refundPct: number;
}

export interface CancellationPolicy {
  tiers: CancellationTier[];
  /**
   * What happens when the MOUNTAIN calls it off rather than the client.
   *
   * A separate field because it is a different moral situation and must not be
   * folded into the notice tiers: a client who is told on the morning that the
   * face is out of condition gave zero days' notice, and charging them a
   * hundred-per-cent cancellation fee for weather would be indefensible.
   */
  conditionsRefundPct: number;
  /** Free text the guide adds. Never replaces the tiers above. */
  note?: string;
}

/** The default ICEFALL offers a guide, which they may change before sending. */
export const STANDARD_POLICY: CancellationPolicy = {
  tiers: [
    { daysBefore: 60, refundPct: 100 },
    { daysBefore: 30, refundPct: 50 },
    { daysBefore: 14, refundPct: 25 },
    { daysBefore: 0, refundPct: 0 },
  ],
  conditionsRefundPct: 100,
  note: "If the guide judges the route unsafe, or conditions prevent an attempt, you are refunded in full — including on the morning.",
};

export interface Quote {
  id: string;
  /** What the guide is charging. */
  lines: QuoteLine[];
  exclusions: Exclusion[];
  cancellation: CancellationPolicy;
  partySize: number;
  departureIso: string;
  /** A quote a guide sent in March should not still be bookable in August. */
  validUntilIso: string;
}

/* ========================================================================== */
/* Totals                                                                      */
/* ========================================================================== */

export interface QuoteTotals {
  /** Everything the client pays. The advertised price, not a larger one. */
  total: Cents;
  /** The part of the total ICEFALL's commission is actually charged on. */
  commissionable: Cents;
  /** Costs the guide passes straight on. Commission-free. */
  passedThrough: Cents;
  /** ICEFALL's cut, taken FROM the total — never added on top. */
  commission: Cents;
  /** What reaches the guide, once ICEFALL's cut is deducted. */
  guideReceives: Cents;
  perPerson: Cents;
}

/**
 * The one place a commission is computed and rounded.
 *
 * Requested by Session 02, whose screens hold a flat total rather than a set of
 * quote lines and were about to compute the deduction themselves. Their argument
 * for the shape was right on both counts and is worth keeping:
 *
 *   · it returns QuoteTotals, not a bare cents figure, because a primitive
 *     reopens the drift one level down — every caller then redoes
 *     `total - commission` and `perPerson` for itself;
 *   · `partySize` has NO DEFAULT, because a silent 1 produces a wrong
 *     per-person figure with nothing anywhere to catch it.
 *
 * `passedThrough` is the part of the total the guide collects and hands straight
 * on. It defaults to zero because a caller holding a single flat figure is
 * asserting that the figure IS the guide's fee; where that is not true, the
 * caller has to say so. It cannot be inferred — nothing about an amount reveals
 * whether part of it was a hut bill.
 */
export function totalsForAmount(
  total: Cents,
  partySize: number,
  commissionPct: number = GUIDE_COMMISSION_PCT,
  passedThrough: Cents = 0,
): QuoteTotals {
  const commissionable = Math.max(0, total - passedThrough);

  // FLOOR, NOT ROUND.
  //
  // `Math.round` sends a half-cent to whoever the rounding favours, and half the
  // time that is ICEFALL. Rounding in the platform's favour on every booking is
  // how a marketplace quietly skims — a cent at a time, invisibly, forever.
  // Floor gives the fraction to the guide, always, and the same rule holds on
  // the referral side where integer division truncates in the operator's favour.
  const commission = Math.floor((commissionable * commissionPct) / 100);

  return {
    total,
    commissionable,
    passedThrough,
    commission,
    guideReceives: total - commission,
    perPerson: partySize > 0 ? Math.round(total / partySize) : total,
  };
}

/**
 * The same arithmetic, from a quote's lines.
 *
 * Reduces the lines and delegates, so there is exactly one implementation of the
 * deduction and one rounding rule. `commissionPct` defaults to the settled guide
 * rate; pass it explicitly only where a partner agreement genuinely differs, and
 * store the rate you used on the record — a rate looked up at read time silently
 * rewrites history when it changes.
 */
export function totalsFor(quote: Quote, commissionPct: number = GUIDE_COMMISSION_PCT): QuoteTotals {
  const lineTotal = (l: QuoteLine) => (l.per === "person" ? l.amount * quote.partySize : l.amount);

  const total = quote.lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const passedThrough = quote.lines.reduce((sum, l) => sum + (l.passThrough ? lineTotal(l) : 0), 0);

  return totalsForAmount(total, quote.partySize, commissionPct, passedThrough);
}

/**
 * ICEFALL's cut of a guide's fee, as a percentage, TAKEN OUT rather than added.
 *
 * SETTLED BY THE PRODUCT OWNER, 2026-08-28 at 10%, RAISED TO 15% BY THE OWNER
 * 2026-08-31. Stated as a worked example, which is the only unambiguous way to
 * state a fee:
 *
 *     A guide charges €1,000 for a day.
 *     The climber pays €1,000. The guide receives €850. ICEFALL keeps €150.
 *
 * THE RATE IS DEFINED HERE AND NOWHERE ELSE. `icefall-shared` is the source and
 * `npm run sync` copies this file into all six apps as `src/money/model.ts`. A
 * second literal anywhere is how this model reached four different numbers once
 * already — see the reversal note below.
 *
 * RAISING IT CHANGES WHAT EXISTING GUIDES ARE TOLD THEY RECEIVE. Every surface
 * that quotes a payout reads this constant, so they all moved together; none of
 * them was told 10% and left saying it.
 *
 * So the advertised price IS what the climber pays. Nothing is added at
 * checkout, and there is no service fee anywhere in this model.
 *
 * THIS REVERSES AN EARLIER DECISION, and the reversal is why the added-fee path
 * is deleted rather than deprecated. `priceBooking`, `SERVICE_FEE_PCT` and
 * `Pricing` used to live here and implemented the opposite arrangement: the
 * guide kept their full rate and the client paid 5% more. Leaving them in place
 * "for now" would mean two functions and a comment telling the reader which one
 * is real — and a comment is exactly what let the phone app drift to a third
 * number (12%) while the checkout used a fourth. One function, no convention.
 *
 * The arithmetic lives in `totalsFor` below, which has always modelled the
 * deducted arrangement and is now the only model.
 */
export const GUIDE_COMMISSION_PCT = 15;

/**
 * What the client is told they are paying, in this model.
 *
 * The whole of it. There is no second number to disclose at checkout, which is
 * the practical benefit of the deducted arrangement: the price on the card is
 * the price on the invoice.
 */
export const GUIDE_FEE_DISCLOSURE =
  `The price shown is what you pay. ICEFALL keeps ${GUIDE_COMMISSION_PCT}% of it and the guide receives the rest.`;

/**
 * "Flexible" — free cancellation up to 14 days out, then nothing.
 *
 * Simpler than the tiered default and easier to put on a card, which is the
 * whole point: a client reads one sentence instead of a table. The conditions
 * clause is unchanged, because weather is still not the client's fault.
 */
export const FLEXIBLE_POLICY: CancellationPolicy = {
  tiers: [
    { daysBefore: 14, refundPct: 100 },
    { daysBefore: 0, refundPct: 0 },
  ],
  conditionsRefundPct: 100,
  note: "Free cancellation up to 14 days before the start date. If the guide judges the route unsafe, or conditions prevent an attempt, you are refunded in full — including on the morning.",
};

/* ========================================================================== */
/* Paying in two parts                                                         */
/* ========================================================================== */

export const DEPOSIT_PCT = 20;
/** Balance falls due this long before the party walks in. */
export const BALANCE_DUE_DAYS_BEFORE = 42;

export interface Instalment {
  kind: "deposit" | "balance";
  amount: Cents;
  dueIso: string;
  label: string;
}

/**
 * Deposit now, balance later.
 *
 * Nobody puts €8,600 on a card for a trip fourteen months away. Splitting it is
 * the difference between a booking and a maybe — and it is also fairer: the
 * client's money is not sitting with a stranger for a year.
 *
 * When departure is closer than the balance window, there is ONE payment for the
 * whole amount. A deposit with a balance due yesterday is nonsense.
 */
export function instalmentsFor(total: Cents, departureIso: string, now = new Date()): Instalment[] {
  const departure = new Date(departureIso);
  const balanceDue = new Date(departure.getTime() - BALANCE_DUE_DAYS_BEFORE * 86_400_000);

  if (balanceDue <= now) {
    return [{ kind: "deposit", amount: total, dueIso: now.toISOString(), label: "Full amount, today" }];
  }

  const deposit = Math.round((total * DEPOSIT_PCT) / 100);
  return [
    { kind: "deposit", amount: deposit, dueIso: now.toISOString(), label: `${DEPOSIT_PCT}% deposit, today` },
    {
      kind: "balance",
      amount: total - deposit,
      dueIso: balanceDue.toISOString(),
      label: "Balance",
    },
  ];
}

/* ========================================================================== */
/* Cancelling                                                                  */
/* ========================================================================== */

/**
 * Whole CALENDAR days between two instants, counted midnight to midnight (UTC).
 *
 * Not a fractional difference. A client reads "60 days before departure" off a
 * calendar, and cancelling at noon on that day is still cancelling on that day —
 * but a fractional count made it 59.5, which floors to 59 and silently dropped
 * them from the 100% tier to the 50% one. On a €1,860 booking that is €186 the
 * client could not have predicted from anything they could see, decided by the
 * hour they happened to click. Boundaries in a refund policy have to fall where
 * the person reading the policy thinks they fall.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day(to) - day(from)) / 86_400_000);
}

export interface RefundOutcome {
  refund: Cents;
  retained: Cents;
  pct: number;
  reason: string;
}

/**
 * What comes back when a booking is cancelled.
 *
 * `paid` is what the client has actually handed over so far, which is not the
 * same as the total — someone who has paid a deposit and cancels is refunded a
 * share of the deposit, not of a balance they never paid.
 */
export function refundFor(
  policy: CancellationPolicy,
  args: { paid: Cents; departureIso: string; by: CancelledBy; now?: Date },
): RefundOutcome {
  const now = args.now ?? new Date();
  const daysBefore = calendarDaysBetween(now, new Date(args.departureIso));

  // The guide pulling out, or the mountain being out of condition, is never the
  // client's fault. This is checked BEFORE the notice tiers so that a
  // weather call on the morning cannot fall through to the 0% tier.
  if (args.by === "guide" || args.by === "conditions") {
    const pct = args.by === "guide" ? 100 : policy.conditionsRefundPct;
    const refund = Math.round((args.paid * pct) / 100);
    return {
      refund,
      retained: args.paid - refund,
      pct,
      reason:
        args.by === "guide"
          ? "The guide cancelled. Everything you have paid is returned in full."
          : "Cancelled on conditions. The notice tiers do not apply — nobody chooses the weather.",
    };
  }

  const sorted = [...policy.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
  const tier = sorted.find((t) => daysBefore >= t.daysBefore) ?? sorted[sorted.length - 1];
  const pct = tier?.refundPct ?? 0;
  const refund = Math.round((args.paid * pct) / 100);

  return {
    refund,
    retained: args.paid - refund,
    pct,
    reason:
      daysBefore < 0
        ? "Cancelled after the departure date."
        : `${daysBefore} day${daysBefore === 1 ? "" : "s"}' notice — ${pct}% of what you have paid is returned.`,
  };
}

/* ========================================================================== */
/* Booking lifecycle                                                           */
/* ========================================================================== */

export type BookingStatus =
  | "awaiting_deposit"
  | "deposit_paid"
  | "paid_in_full"
  | "completed"
  | "cancelled";

export type PayoutStatus = "held" | "releasable" | "sent";

/**
 * When ICEFALL lets go of the money.
 *
 * Funds are held until the party actually walks in. It protects the client from
 * paying a stranger months ahead for something that never happens, and it costs
 * the guide nothing they were not already waiting for. It is NOT escrow in the
 * regulated sense — the processor holds the funds under its own licence and
 * ICEFALL never takes custody. Do not describe it to a user as an escrow account.
 */
export function payoutStatusFor(args: {
  status: BookingStatus;
  departureIso: string;
  now?: Date;
}): PayoutStatus {
  const now = args.now ?? new Date();
  if (args.status === "cancelled") return "held";
  if (args.status === "completed") return "sent";
  return new Date(args.departureIso) <= now ? "releasable" : "held";
}

/* ========================================================================== */
/* Referrals — expedition companies, whose money never touches ICEFALL        */
/* ========================================================================== */

/**
 * A guide's fee is an in-app purchase; an expedition is not.
 *
 * An 8,000 m trip is €40–70k, settled by wire and contract over months, and the
 * big Himalayan and Andean operators sit in countries the payment provider
 * cannot pay out to (see `payoutEligibility`). So ICEFALL never holds this
 * money and cannot gate it behind a payment. What it sells to a company is the
 * INTRODUCTION — a qualified, readiness-verified client — and it earns a
 * referral fee on bookings that introduction produces.
 *
 * Because the money is off-platform, the fee is only ever as good as the
 * ATTRIBUTION: proof that ICEFALL introduced this client to this company, and
 * that the booking fell inside the agreed window. Everything below is that
 * proof turned into arithmetic. None of it moves money — it decides what a
 * company owes, and the admin side reconciles it against what they report.
 */

/**
 * Default referral rate on a completed expedition booking. Per-partner overridable.
 *
 * SETTLED BY THE PRODUCT OWNER, 2026-08-28: 7.5%, taken from ICEFALL's own CRM
 * specification in preference to the 10% this file carried from the start.
 *
 * STRUCTURALLY DISTINCT FROM `GUIDE_COMMISSION_PCT`, and they must stay that
 * way. A guide engagement is money ICEFALL processes and splits; an expedition
 * referral is a fee ICEFALL invoices a company for an introduction, on money
 * that never touches the platform. The warning further down about not mixing
 * the two models on one booking is now load-bearing rather than theoretical.
 *
 * Changing this number moves NOTHING that has already been earned: the CRM
 * stores the applied rate on each commission record rather than looking it up.
 */
export const DEFAULT_REFERRAL_PCT = 7.5;

/** A booking counts only if it lands within this long of the introduction. */
export const ATTRIBUTION_WINDOW_MONTHS = 12;

export function referralFee(bookingValue: Cents, ratePct = DEFAULT_REFERRAL_PCT): Cents {
  // FLOOR, matching `totalsForAmount` and the database.
  //
  // This used `Math.round` while the guide commission a few lines up floored,
  // with a comment mandating floor so the fraction never falls to ICEFALL. The
  // CRM therefore QUOTED a referral fee one cent higher than `record_commission`
  // — which does integer division and truncates — would actually record. A cent
  // is nothing; two functions in one file disagreeing about which way a fee
  // rounds is not, because only one of them is what the operator gets invoiced.
  return Math.floor((bookingValue * ratePct) / 100);
}

/** The introduction stops earning after this date. */
export function attributionDeadline(introIso: string): string {
  const d = new Date(introIso);
  d.setMonth(d.getMonth() + ATTRIBUTION_WINDOW_MONTHS);
  return d.toISOString();
}

/**
 * Whether a booking is attributable to an introduction.
 *
 * Both ends matter. A booking BEFORE the introduction is not ours — the client
 * already knew the company. A booking after the window has closed is not ours
 * either — a fee that never expires is a claim on every future trip that client
 * ever takes, which no company would sign.
 */
export function isWithinAttribution(introIso: string, bookingIso: string): boolean {
  const intro = new Date(introIso).getTime();
  const booking = new Date(bookingIso).getTime();
  const deadline = new Date(attributionDeadline(introIso)).getTime();
  return booking >= intro && booking <= deadline;
}

/**
 * Where a referral is in its life, and who is waiting on whom.
 *
 *   introduced  the client was passed to the company; no booking reported yet
 *   booked      the company (or the client) reported a booking in-window
 *   invoiced    ICEFALL has billed the referral fee
 *   paid        settled
 *   disputed    the company contests the introduction or the amount
 *   expired     the window closed with no booking — nothing is owed
 *
 * `disputed` and `expired` exist because this model CANNOT force payment. The
 * honest system names the states where a fee is at risk instead of assuming it
 * will arrive.
 */
export type ReferralStatus =
  | "introduced"
  | "booked"
  | "invoiced"
  | "paid"
  | "disputed"
  | "expired";


export const PAYMENTS_NOT_CONNECTED =
  "Payments are not connected. No card is charged, no money moves and no booking is made — these screens show what the flow will do once a payment provider is live.";
