import { useEffect, useState } from "react";
import { Avatar, PageHead, Pill, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve, Unavailable } from "@/components/states";
import { listBookings, listCommissions } from "@/data/queries";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { Booking, Commission } from "@/data/types";
import { cn, formatMoment } from "@/lib/utils";

/**
 * What ICEFALL has earned on marketplace transactions, and on what terms.
 *
 * THE RATE ON A ROW IS THE RATE THAT WAS STORED WHEN THE BOOKING CONVERTED.
 * `rate_bps` is copied onto the commission at computation and never looked up
 * again, and this screen reads it from there rather than from any current
 * setting. The failure being designed out is a ledger that restates itself: if
 * this page multiplied today's rate by an old basis, renegotiating a fee next
 * month would quietly change what last month earned, and an invoice already sent
 * would stop matching the screen it was raised from.
 *
 * NO TOTAL ACROSS STATUSES. Money already paid, money invoiced and waiting,
 * money in dispute and money deliberately waived behave differently and are
 * chased by different people. One figure spanning all four would be read as
 * earnings, so the tiles are per status and there is no grand total.
 *
 * NOTHING IS CONVERTED BETWEEN CURRENCIES. ICEFALL stores no exchange rate, so a
 * set of commissions recorded in more than one currency is reported as a count
 * and a reason instead of a sum.
 *
 * A commission carrying neither a rate nor a fixed fee is shown as exactly that.
 * It is a broken record rather than a free booking, and it should look like one.
 */

/** The tones the tiles may take. Plain is not a colour, it is the absence of one. */
type Tone = "plain" | "butter" | "sky" | "lilac" | "mint";

/** 750 bps = 7.5%. Stored as an integer; only the render divides. */
function formatBps(bps: number): string {
  const decimals = bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2;
  return `${(bps / 100).toFixed(decimals)}%`;
}

/**
 * `formatCentsShort` has no symbol outside EUR/GBP/USD and falls back to `$`,
 * which would print a dollar sign over a Swiss franc. A wrong currency symbol is
 * a lie about money, so anything else is rendered in full instead of shortened.
 */
const SHORTENABLE = ["EUR", "GBP", "USD"];
const tileAmount = (cents: number, currency: string): string | null =>
  SHORTENABLE.includes(currency) ? formatCentsShort(cents, currency) : formatCents(cents, currency);

/** Null when the rows disagree, which is the signal not to add them up. */
function soleCurrency(rows: Commission[]): string | null {
  const first = rows[0].currency;
  return rows.every((r) => r.currency === first) ? first : null;
}

const countOf = (rows: Commission[]) => `${rows.length} commission${rows.length === 1 ? "" : "s"}`;

// Waived stays neutral on purpose: red is for cancelled and rejected, and waiving
// a fee is a decision somebody made, not something that went wrong. The three
// tones are unchanged from the pill this chip replaced — a status is not more or
// less urgent because it is now drawn with a glyph.
const statusState = (s: Commission["status"]): "ok" | "pending" | "neutral" =>
  s === "paid" ? "ok" : s === "disputed" ? "pending" : "neutral";

const kindLabel = (k: Commission["kind"]) =>
  k === "referral" ? "Referral fee" : "Guide commission";

/**
 * The pastels run in the mockup's order across the states that hold money.
 * `waived` stays plain: it is the one state whose figure is money nobody will
 * ever collect, and it should not sit in the row of colours the eye reads as
 * earnings.
 */
const STATUSES: {
  id: Commission["status"];
  label: string;
  empty: string;
  note: string;
  tone: Tone;
}[] = [
  {
    id: "accrued",
    label: "Accrued",
    empty: "No commission is accrued.",
    note: "Computed, not yet invoiced.",
    tone: "butter",
  },
  {
    id: "invoiced",
    label: "Invoiced",
    empty: "Nothing has been invoiced.",
    note: "Invoiced and awaiting payment.",
    tone: "sky",
  },
  { id: "paid", label: "Paid", empty: "Nothing has been paid.", note: "Settled.", tone: "lilac" },
  {
    id: "disputed",
    label: "Disputed",
    empty: "Nothing is in dispute.",
    note: "Collection is paused on these.",
    tone: "mint",
  },
  {
    id: "waived",
    label: "Waived",
    empty: "Nothing has been waived.",
    note: "Deliberately not collected.",
    tone: "plain",
  },
];

export default function Commissions() {
  const [commissions, setCommissions] = useState<Result<Commission[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);

  useEffect(() => {
    void listCommissions().then(setCommissions);
    void listBookings().then(setBookings);
  }, []);

  const reason =
    commissions.state === "loading"
      ? "Still loading."
      : commissions.state === "unavailable" || commissions.state === "error"
        ? commissions.reason
        : "Not recorded";

  const rowsOf = (match: (c: Commission) => boolean): Commission[] | null =>
    commissions.state === "ok" ? commissions.value.filter(match) : null;

  // `tone` is passed on every branch, including the ones with no figure: `Stat`
  // drops the colour itself when the value is null, which is the whole reason
  // the colour is worth anything — a butter tile always has a number on it.
  const tile = (
    key: string,
    label: string,
    rows: Commission[] | null,
    empty: string,
    note: string,
    tone: Tone = "plain",
  ) => {
    if (rows === null)
      return <Stat key={key} label={label} value={null} reason={reason} tone={tone} />;
    // Nothing in this state is not "€0 owed" — the second would read as a figure.
    if (rows.length === 0)
      return <Stat key={key} label={label} value={null} reason={empty} tone={tone} />;
    const currency = soleCurrency(rows);
    if (currency === null) {
      return (
        <Stat
          key={key}
          label={label}
          value={null}
          tone={tone}
          reason={`${countOf(rows)}, recorded in more than one currency. ICEFALL holds no exchange rate, so they are not added together.`}
        />
      );
    }
    const sum = rows.reduce((n, c) => n + c.amount_cents, 0);
    return (
      <Stat
        key={key}
        label={label}
        value={tileAmount(sum, currency)}
        hint={`${countOf(rows)}. ${note}`}
        tone={tone}
      />
    );
  };

  // A commission names its booking by id; without the booking list that id cannot
  // be turned into anything a person recognises. Said once, above the table,
  // rather than repeated as a shrug in every row.
  const bookingNote =
    bookings.state === "unavailable" || bookings.state === "error"
      ? `The booking behind each commission cannot be named: ${bookings.reason}`
      : null;

  const index =
    bookings.state === "ok" ? new Map(bookings.value.map((b) => [b.id, b] as const)) : null;

  return (
    <>
      <PageHead
        title="Commissions"
        subtitle="Every fee ICEFALL has computed on a booking made through the marketplace — a referral fee on an expedition the customer paid the company for directly, or a commission on a guide booking."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {STATUSES.map((s) =>
          tile(
            s.id,
            s.label,
            rowsOf((c) => c.status === s.id),
            s.empty,
            s.note,
            s.tone,
          ),
        )}
      </div>

      {/* The split by kind is the same money seen a second way, so it is left
          uncoloured — two pastel rows would read as two sets of earnings. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tile(
          "referral",
          "Referral fees",
          rowsOf((c) => c.kind === "referral"),
          "No referral fee has been computed.",
          "Claimed against money that never touched ICEFALL.",
        )}
        {tile(
          "guide",
          "Guide commissions",
          rowsOf((c) => c.kind === "guide"),
          "No guide commission has been computed.",
          "Taken from a guide booking.",
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">Computed commissions</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">
          Each row carries the rate agreed at the time of conversion, not the rate configured today
          — changing a rate later changes what the next conversion earns and never moves a figure
          already computed.
        </p>
        {bookingNote && (
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-faint">{bookingNote}</p>
        )}

        <div className="mt-4">
          <Resolve
            result={commissions}
            what="commissions"
            isEmpty={(v) => v.length === 0}
            empty="No commission has been computed. One is written when a booking converts and the rate in force at that moment is applied to the booking's value."
          >
            {(rows) => (
              <TableCard>
                <table className="w-full min-w-[980px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Booking</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Kind</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Basis</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Rate</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Amount</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Computed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => {
                      const booking = index?.get(c.booking_id) ?? null;
                      const bookedAt = booking ? formatMoment(booking.booked_at) : null;
                      // The stored basis stands. If the booking has since been
                      // restated, that is shown beside it rather than replacing
                      // it — the commission was computed on the older figure.
                      const restated =
                        booking &&
                        booking.value_status === "reported" &&
                        booking.value_cents !== null &&
                        booking.value_cents !== c.basis_cents
                          ? formatCents(booking.value_cents, booking.currency)
                          : null;

                      return (
                        <tr
                          key={c.id}
                          className={cn(
                            "border-b border-line-soft last:border-0 hover:bg-raised",
                            c.status === "disputed" && "bg-[oklch(0.978_0.028_84)]",
                          )}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              {/* An avatar with no initials in it is the honest
                                  drawing of a booking that cannot be named — the
                                  row keeps its shape and says why beside it. */}
                              <Avatar
                                name={(booking?.destination_id ?? "").replace(/-/g, " ")}
                                size={34}
                              />
                              <div className="min-w-0">
                                {index === null ? (
                                  <span className="text-faint">Unavailable</span>
                                ) : booking === null ? (
                                  <span className="text-faint">Not in the booking list</span>
                                ) : (
                                  <>
                                    <span className="font-medium text-ink">
                                      {booking.destination_id ?? (
                                        <span className="font-normal text-faint">
                                          Mountain not recorded
                                        </span>
                                      )}
                                    </span>
                                    <p className="tnum mt-0.5 text-[11.5px] text-faint">
                                      {bookedAt
                                        ? `Booked ${bookedAt}`
                                        : "Booked at an unrecorded time"}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <Pill>{kindLabel(c.kind)}</Pill>
                          </td>
                          <td className="tnum px-5 py-3.5 text-muted">
                            {formatCents(c.basis_cents, c.currency)}
                            {restated && (
                              <p className="mt-0.5 text-[11.5px] text-faint">
                                Booking now reports {restated}
                              </p>
                            )}
                          </td>
                          <td className="tnum px-5 py-3.5">
                            {c.rate_bps !== null ? (
                              <span className="font-medium text-muted">
                                {formatBps(c.rate_bps)}
                              </span>
                            ) : c.fixed_fee_cents !== null ? (
                              <span className="font-medium text-muted">
                                {formatCents(c.fixed_fee_cents, c.currency)}
                                <span className="font-normal text-faint"> fixed</span>
                              </span>
                            ) : (
                              <span className="text-faint">No rate stored</span>
                            )}
                          </td>
                          <td className="tnum px-5 py-3.5 text-[14.5px] font-bold tracking-[-0.02em] text-ink">
                            {formatCents(c.amount_cents, c.currency)}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusChip state={statusState(c.status)} label={c.status} />
                            {c.status === "disputed" && (
                              <p className="mt-1 text-[11.5px] leading-snug text-warn">
                                Collection paused
                              </p>
                            )}
                          </td>
                          <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                            {formatMoment(c.computed_at) ?? (
                              <span className="text-faint">Not recorded</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableCard>
            )}
          </Resolve>
        </div>
      </div>

      <div className="mt-6">
        <Unavailable
          reason={
            "There is no ageing on this screen. How overdue an invoiced commission is depends on its " +
            "invoice's due date, and the invoices table is not in the database yet — a count of days since " +
            "the commission was computed would look like the same thing and would not be. Nothing is " +
            "forecast from bookings either: a commission needs a basis, and a booking whose value has not " +
            "been reported has none, so the fee it will eventually carry is unknown rather than estimated."
          }
        />
      </div>
    </>
  );
}
