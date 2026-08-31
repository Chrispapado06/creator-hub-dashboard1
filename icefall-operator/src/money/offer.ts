/**
 * A custom offer, from an EXPEDITION COMPANY — the arithmetic and the words.
 *
 * OP-05b, the owner's "expedition companies can create custom offers via the
 * app". The shape is the shared `Quote` from `./model.ts`, which is the same
 * one the guide app composes (request 07). There is deliberately no second
 * offer type anywhere in this app.
 *
 * This file is separate from the composer component so the rules below can be
 * tested without rendering anything. `model.ts` is the CANONICAL copy shared
 * across the family and is not edited here; this is the operator's side of it.
 *
 * ── WHY AN OPERATOR'S OFFER IS NOT A GUIDE'S ────────────────────────────────
 *
 * The guide app deducts `GUIDE_COMMISSION_PCT` from a guide's fee and shows the
 * guide a smaller "you receive" figure than the client pays. That is correct
 * THERE and would be a lie HERE, and the difference is structural:
 *
 *   · A guide engagement is money ICEFALL PROCESSES. The client pays ICEFALL,
 *     ICEFALL splits it, the guide receives the remainder. The deduction is a
 *     real event that happens to that payment.
 *
 *   · An expedition is not. It is settled by wire and contract between the
 *     climber and the company, and the money NEVER TOUCHES ICEFALL — see the
 *     Referrals block at the foot of `model.ts`. What ICEFALL sells the company
 *     is the introduction, and it INVOICES the company for that separately,
 *     afterwards. Nothing comes out of this offer, because there is nothing
 *     here for ICEFALL to take it out of.
 *
 * `model.ts` warns in its own header that mixing the two models on one booking
 * is a real bug. This file is what that warning was written for.
 *
 * The display was settled too (request 08, the brain, 2026-08-31): "The
 * operator version never shows ICEFALL's commission. An operator sees what they
 * receive; they do not see what we take."
 */

import { eur, formatEur, totalsFor, type Cents, type Quote, type QuoteLine, type QuoteTotals } from "./model";
import { formatDay } from "@/domain/dates";

/**
 * The totals on an operator's offer.
 *
 * NO COMMISSION IS DEDUCTED, AND THAT IS NOT AN OVERSIGHT. `totalsFor` is
 * called with an EXPLICIT ZERO rate — never `GUIDE_COMMISSION_PCT`, never its
 * default. The zero is the point: it reuses the one shared implementation of
 * the line arithmetic (per-person × party size, the pass-through sum, the
 * per-person division) while asserting that nothing comes out of this figure.
 *
 * Read the header above before changing it. Passing the guide rate here would
 * tell an expedition company that ICEFALL keeps 15% of a payment ICEFALL never
 * receives, on a booking it will invoice separately.
 *
 * `commissionable` still comes back and is still meaningful — it is the part of
 * the total that is the company's own fee rather than money it collected and
 * handed on. It is what a referral invoice would later be worked out against.
 * Nothing shown to an operator is derived from it.
 */
export function operatorOfferTotals(quote: Quote): QuoteTotals {
  return totalsFor(quote, 0);
}

/** What a single line comes to for the whole party. */
export function lineTotal(line: QuoteLine, partySize: number): Cents {
  return line.per === "person" ? line.amount * partySize : line.amount;
}

/**
 * Euros typed by a human → integer cents, or null.
 *
 * NULL, NOT ZERO. A line whose amount has not been typed yet is not a free
 * line, and the honesty doctrine says a missing figure states why it is missing
 * rather than rendering as 0 — which here would quietly under-quote a trip.
 * `eur()` from the money model does the only float→cents conversion; nothing
 * here multiplies by 100 itself.
 */
export function centsFromEuros(input: string): Cents | null {
  const t = input.trim().replace(/[,\s]/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return eur(Number(t));
}

/**
 * The offer as the customer will read it.
 *
 * Dates go through `formatDay` and money through `formatEur`, which is not only
 * the house rule — it is also what keeps the composed text clear of the
 * contact-details guard's phone-number pattern, which matches long runs of
 * digits, spaces, dots and dashes. "2026-09-14" reads as a phone number to that
 * matcher; "14 Sep 2026" does not. The guard still fires on anything the
 * operator typed into a label, which is the case it exists for, and there is a
 * test for both halves of that.
 */
export function offerMessageBody(args: {
  customerName: string;
  /** What the enquiry is about — the trip name. Null when nothing is chosen. */
  subject: string | null;
  quote: Quote;
  totals: QuoteTotals;
  /** The seller actively said there is nothing to exclude — see `Exclusion`. */
  nothingExcluded: boolean;
}): string {
  const { customerName, subject, quote, totals } = args;
  const party = quote.partySize;
  const climbers = `${party} ${party === 1 ? "climber" : "climbers"}`;
  const out: string[] = [];

  out.push(`Offer for ${customerName.split(" ")[0]}`);
  // On its own line: a trip name is itself full of dashes and separators, and
  // folding it into the greeting produced "Offer for Hanne — Everest — South Col".
  if (subject) out.push(subject);
  out.push(`Departure ${formatDay(quote.departureIso)} · ${climbers}`);
  out.push(`This offer holds until ${formatDay(quote.validUntilIso)}`);
  out.push("");

  for (const l of quote.lines) {
    // The party maths spelled out on every per-person line (request 07 §3):
    // a per-person figure sitting beside a party total is how €500 gets read
    // as €1,340.
    const total = lineTotal(l, party);
    const maths =
      l.per === "person"
        ? `${formatEur(l.amount)} each × ${climbers} = ${formatEur(total)}`
        : `${formatEur(total)} for the party`;
    out.push(`${l.label} — ${maths}${l.passThrough ? " (collected by us and passed straight on)" : ""}`);
  }

  out.push("");
  out.push(`Total — ${formatEur(totals.total)}`);
  if (party > 1) out.push(`Per person — ${formatEur(totals.perPerson)}`);

  /*
   * A heading with nothing under it is worse than no heading. The composer
   * refuses to send while neither an exclusion nor the "nothing is excluded"
   * declaration exists, so this branch only ever shows in the live preview of a
   * half-written offer — and it should read as unfinished, not as broken.
   */
  if (args.nothingExcluded || quote.exclusions.length > 0) {
    out.push("");
  }
  if (args.nothingExcluded) {
    out.push("Not included: nothing. Everything you will need to pay for is in the price above.");
  } else if (quote.exclusions.length > 0) {
    out.push("Not included in this price:");
    for (const e of quote.exclusions) {
      out.push(
        `· ${e.label}${
          e.approxAmount === null
            ? " (we cannot put a figure on this)"
            : ` (around ${formatEur(e.approxAmount)})`
        }`,
      );
    }
  }

  out.push("");
  out.push("If you cancel:");
  for (const t of [...quote.cancellation.tiers].sort((a, b) => b.daysBefore - a.daysBefore)) {
    out.push(
      t.daysBefore === 0
        ? `· Less notice than that — ${t.refundPct}% back`
        : `· ${t.daysBefore} or more days before departure — ${t.refundPct}% back`,
    );
  }
  out.push(`· If conditions prevent an attempt — ${quote.cancellation.conditionsRefundPct}% back`);
  if (quote.cancellation.note) out.push(quote.cancellation.note);

  return out.join("\n");
}
