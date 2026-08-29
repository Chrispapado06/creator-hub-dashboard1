import { useEffect, useState } from "react";
import { Avatar, PageHead, Pill, StatusChip, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listBookings } from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type { Booking } from "@/data/types";
import { formatMoment } from "@/lib/utils";

/**
 * Confirmed bookings attributed to ICEFALL.
 *
 * A BOOKING WITH NO VALUE IS SHOWN AS A BOOKING WITH NO VALUE. The operator
 * often reports the conversion before the contract is signed, so `pending` and
 * `unknown` are ordinary states and the database will not let either carry a
 * number. Rendering them as "€0" would put a real booking into the ledger at
 * nothing, which is worse than leaving it out — it would be counted, and counted
 * wrongly, in every average computed downstream.
 *
 * THERE ARE NO TILES ABOVE THIS TABLE. Every other screen in the CRM opens with
 * figures; this one cannot, because the only figure worth totalling here is
 * booking value and a third of these rows have none. A "total" over the rows
 * that happen to carry a number would be read as what ICEFALL booked.
 */

/**
 * The three tones this column has always carried, now in the mockup's chip.
 * `status` is a free-text column, so anything unrecognised stays neutral rather
 * than being guessed into a colour it has not earned.
 */
const statusState = (status: string): "ok" | "bad" | "neutral" =>
  status === "completed" ? "ok" : status === "cancelled" ? "bad" : "neutral";

export default function Bookings() {
  const [result, setResult] = useState<Result<Booking[]>>(loading);
  useEffect(() => {
    void listBookings().then(setResult);
  }, []);

  return (
    <>
      <PageHead
        title="Bookings"
        subtitle="Bookings attributed to an ICEFALL introduction. For expeditions the customer pays the company directly — ICEFALL tracks the referral fee it is owed, and never holds the money."
      />
      <Resolve
        result={result}
        what="bookings"
        isEmpty={(v) => v.length === 0}
        empty="No bookings have been recorded. A booking is recorded when a lead converts."
      >
        {(bookings) => (
          <TableCard>
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Mountain</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Type</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Value</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Attribution</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Booked</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-line-soft last:border-0 hover:bg-raised"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* The slug is what the row says; the hyphens are split
                            for the initials only, so `mont-blanc` reads MB. */}
                        <Avatar name={(b.destination_id ?? "").replace(/-/g, " ")} size={34} />
                        {b.destination_id ? (
                          <span className="font-medium text-ink">{b.destination_id}</span>
                        ) : (
                          <span className="text-faint">Not recorded</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Pill>{b.kind}</Pill>
                    </td>
                    <td className="tnum px-5 py-3.5">
                      {b.value_status === "reported" ? (
                        <span className="text-[14.5px] font-bold tracking-[-0.02em] text-ink">
                          {formatCents(b.value_cents, b.currency)}
                        </span>
                      ) : (
                        <span className="text-faint">
                          {b.value_status === "pending" ? "Not yet reported" : "Unknown"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusChip
                        state={statusState(b.status)}
                        label={b.status.replace(/_/g, " ")}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      {b.attribution_status === "disputed" ? (
                        <StatusChip state="pending" label="disputed" />
                      ) : (
                        <Pill>{b.attribution_status}</Pill>
                      )}
                    </td>
                    <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                      {formatMoment(b.booked_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Resolve>
    </>
  );
}
