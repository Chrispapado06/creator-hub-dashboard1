import { useEffect, useState, type ReactNode } from "react";
import { Compass, Handshake, Mountain, Repeat } from "lucide-react";
import { PageHead, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve, Unavailable } from "@/components/states";
import { listBookings, listRevenue } from "@/data/queries";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { Booking, RevenueRecord, RevenueStream } from "@/data/types";

/**
 * The four streams, each with the tile colour and the row swatch it keeps.
 *
 * `swatch` holds a whole class name rather than a fragment to append: Tailwind
 * scans source text, so `bg-${tone}` would generate nothing at all.
 */
const STREAMS: {
  id: RevenueStream;
  label: string;
  tone: "butter" | "sky" | "lilac" | "mint";
  swatch: string;
  icon: ReactNode;
}[] = [
  {
    id: "placement",
    label: "Mountain placements",
    tone: "butter",
    swatch: "bg-butter",
    icon: <Mountain size={17} strokeWidth={1.8} />,
  },
  {
    id: "referral",
    label: "Referral fees",
    tone: "sky",
    swatch: "bg-sky",
    icon: <Handshake size={17} strokeWidth={1.8} />,
  },
  {
    id: "guide_commission",
    label: "Guide commissions",
    tone: "lilac",
    swatch: "bg-lilac",
    icon: <Compass size={17} strokeWidth={1.8} />,
  },
  {
    id: "subscription",
    label: "Consumer subscriptions",
    tone: "mint",
    swatch: "bg-mint",
    icon: <Repeat size={17} strokeWidth={1.8} />,
  },
];

/**
 * Where a recognised record has got to, as the mockup's status control.
 *
 * Collected is money that arrived; invoiced is money asked for and still
 * waiting; written off is money that will not come; accrued is neither asked
 * for nor refused, so it stays neutral rather than borrowing a colour that
 * would suggest somebody has to act on it.
 */
const statusState = (s: RevenueRecord["status"]): "ok" | "pending" | "bad" | "neutral" =>
  s === "collected" ? "ok" : s === "invoiced" ? "pending" : s === "written_off" ? "bad" : "neutral";

/** The heading above a table. Heavier than a label, because the mockup's are. */
function Heading({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-bold tracking-[-0.015em] text-ink">{children}</h2>;
}

/**
 * ICEFALL's commercial ledger. Not accounting software.
 *
 * FOUR STREAMS, NEVER ADDED UP CARELESSLY. A placement fee is invoiced to a
 * company; a referral fee is a claim against money that never touched ICEFALL; a
 * guide commission comes out of a payment ICEFALL processed; a subscription is
 * consumer revenue. They have different collection risks and different people
 * chasing them, and one total across all four hides which of those is true.
 *
 * GMV IS THE HONEST ONE TO GET WRONG. A booking may be recorded with no value —
 * the database refuses to store an unknown as zero — so the total below sums
 * only the bookings whose value was actually reported, and says how many it left
 * out. A GMV figure that silently treats unknowns as zero understates the
 * marketplace and looks precise while doing it.
 */
export default function Revenue() {
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);

  useEffect(() => {
    void listRevenue().then(setRevenue);
    void listBookings().then(setBookings);
  }, []);

  const streamTotal = (id: RevenueStream): string | null =>
    revenue.state === "ok"
      ? formatCentsShort(
          revenue.value.filter((r) => r.stream === id).reduce((n, r) => n + r.amount_cents, 0),
        )
      : null;

  const collected = (status: RevenueRecord["status"]): string | null =>
    revenue.state === "ok"
      ? formatCentsShort(
          revenue.value.filter((r) => r.status === status).reduce((n, r) => n + r.amount_cents, 0),
        )
      : null;

  // Reported only, and the count of what was excluded travels with it.
  const gmv = (() => {
    if (bookings.state !== "ok") return { value: null, excluded: 0 };
    const reported = bookings.value.filter((b) => b.value_status === "reported");
    return {
      value: formatCentsShort(reported.reduce((n, b) => n + (b.value_cents ?? 0), 0)),
      excluded: bookings.value.length - reported.length,
    };
  })();

  const reason = revenue.state === "unavailable" || revenue.state === "error" ? revenue.reason : "Not recorded";

  return (
    <>
      <PageHead
        title="Revenue"
        subtitle="ICEFALL's commercial ledger and management view — not a replacement for accounting software. The four streams are kept apart because they carry different collection risks."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STREAMS.map((s) => (
          <Stat
            key={s.id}
            label={s.label}
            value={streamTotal(s.id)}
            reason={reason}
            tone={s.tone}
            icon={s.icon}
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="GMV attributed to ICEFALL"
          value={gmv.value}
          reason={reason}
          hint={
            gmv.excluded > 0
              ? `Excludes ${gmv.excluded} booking${gmv.excluded === 1 ? "" : "s"} whose value has not been reported.`
              : "Every recorded booking has a reported value."
          }
        />
        <Stat label="Collected" value={collected("collected")} reason={reason} />
        <Stat label="Outstanding — invoiced" value={collected("invoiced")} reason={reason} />
      </div>

      <div className="mt-7">
        <Heading>Records</Heading>
        <div className="mt-2.5">
          <Resolve
            result={revenue}
            what="revenue records"
            isEmpty={(v) => v.length === 0}
            empty="Nothing has been recognised yet. Referral revenue appears once a commission rule is configured and a booking is converted."
          >
            {(records) => (
              <TableCard>
                <table className="w-full min-w-[44rem] text-[13px]">
                  <thead>
                    <tr className="border-b border-line-soft text-left">
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Recognised</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Stream</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Amount</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => {
                      const stream = STREAMS.find((s) => s.id === r.stream);
                      return (
                        <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                          <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">{r.recognised_on}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              {/* A stream is a taxonomy, not a person, so this is a
                                  tone swatch rather than an avatar — it keeps the
                                  row's rhythm without implying somebody is behind
                                  it. A stream with no tile of its own gets none. */}
                              <span
                                aria-hidden
                                className={
                                  stream
                                    ? `h-8 w-8 shrink-0 rounded-full ${stream.swatch}`
                                    : "h-8 w-8 shrink-0 rounded-full bg-raised ring-1 ring-line"
                                }
                              />
                              <span className="font-medium text-ink">{stream?.label ?? r.stream}</span>
                            </div>
                          </td>
                          <td className="tnum whitespace-nowrap px-5 py-3.5 text-[14.5px] font-bold tracking-[-0.015em] text-ink">
                            {formatCents(r.amount_cents, r.currency)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            <StatusChip state={statusState(r.status)} label={r.status} />
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
            "MRR and ARR are not shown. ICEFALL has no subscription product and no payment processor, " +
            "so there is no recurring revenue to annualise — a figure here would be arithmetic performed " +
            "on nothing. Average booking value is likewise withheld while most bookings carry no reported " +
            "value: a mean over three of eleven bookings is not the average booking value, it is the " +
            "average of the three somebody happened to fill in."
          }
        />
      </div>
    </>
  );
}
