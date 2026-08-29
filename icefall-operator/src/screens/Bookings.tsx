/**
 * Bookings, built to the mockup.
 *
 * The mockup's footer shows a booking count and a total value. The count is
 * straightforward. THE TOTAL IS NOT, and this is the screen where the
 * difference matters most.
 *
 * A booking may be recorded without a value (spec §18). Summing those as zero
 * would understate an operator's own revenue on the screen they use to judge
 * whether ICEFALL is worth keeping — so the total adds up only what was actually
 * reported and states, next to itself, how many bookings it left out. A number
 * that quietly excludes rows is a number nobody can act on safely.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  EmptyState,
  Figure,
  PageHeader,
  Pill,
  SearchInput,
  Tabs,
  Toolbar,
  formatMoney, PersonAvatar, VerifiedMark } from "@/components/ui";
import { estimatedGmv, measured, OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay } from "@/domain/dates";
import type { BookingStatus } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

type Filter = "all" | BookingStatus;

/**
 * Booking statuses are not product statuses — ChipStatus stays products-only
 * (spec §17), so bookings get their own small chip with the same visual
 * treatment: confirmed reads as live, pending as pending, cancelled as
 * rejected, completed as settled/neutral.
 */
const BOOKING_CHIP_CLASS: Record<BookingStatus, string> = {
  confirmed: "text-live bg-live-soft",
  pending: "text-pending bg-pending-soft",
  cancelled: "text-rejected bg-rejected-soft",
  completed: "text-draft bg-draft-soft",
};

function BookingChip({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] uppercase whitespace-nowrap ${BOOKING_CHIP_CLASS[status]}`}
    >
      {status}
    </span>
  );
}

export default function Bookings() {
  const session = useSession();
  const { backend, mountains, revision } = useOperator();
  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);
  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const customerFor = (leadId: string | null) =>
    leads.find((l) => l.id === leadId)?.customerName ?? "Customer";
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? "—";
  const mountainName = (id: string | null) => mountains.find((m) => m.id === id)?.name ?? "—";

  const q = query.trim().toLowerCase();
  const matchesQuery = (b: (typeof bookings)[number]) =>
    q === "" ||
    [customerFor(b.leadId), productName(b.productId), mountainName(b.mountainId)].some((s) =>
      s.toLowerCase().includes(q),
    );

  const searched = bookings.filter(matchesQuery);
  const count = (f: Filter) => (f === "all" ? searched.length : searched.filter((b) => b.status === f).length);
  const shown = searched.filter((b) => filter === "all" || b.status === filter);
  const gmv = estimatedGmv(shown.map((b) => b.value));

  return (
    <>
      <PageHeader title="Bookings" detail="Manage and track all bookings." />

      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search bookings..." />}
      />

      <div className="mb-3">
        <Tabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { key: "all" as const, label: "All", count: count("all") },
            { key: "confirmed" as const, label: "Confirmed", count: count("confirmed") },
            { key: "pending" as const, label: "Pending", count: count("pending") },
            { key: "cancelled" as const, label: "Cancelled", count: count("cancelled") },
            { key: "completed" as const, label: "Completed", count: count("completed") },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        bookings.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            detail="A booking is recorded when you move a lead to Booked."
          />
        ) : (
          <EmptyState
            title="No bookings match"
            detail="Try a different search or switch tabs."
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.4fr_1.6fr_1fr_1fr_0.9fr_0.9fr] gap-4 border-b border-line px-4 py-2.5 md:grid">
            {["Customer", "Trip", "Mountain", "Value", "Status", "Booked"].map((h) => (
              <div key={h} className="lbl">{h}</div>
            ))}
          </div>
          {shown.map((b, i) => (
            <div
              key={b.id}
              className={`grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[1.4fr_1.6fr_1fr_1fr_0.9fr_0.9fr] md:items-center ${
                i > 0 ? "border-t border-line-soft" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PersonAvatar name={customerFor(b.leadId)} size={26} />
                <span className="truncate text-[12.5px] font-medium text-ink">{customerFor(b.leadId)}</span>
                <VerifiedMark name={customerFor(b.leadId)} size={13} />
              </div>
              <div className="truncate text-[12.5px] text-muted">{productName(b.productId)}</div>
              <div className="truncate text-[12.5px] text-muted">{mountainName(b.mountainId)}</div>
              <div className="tnum text-[12.5px]">
                {b.value.status === "reported" ? (
                  <span className="font-medium text-ink">{formatMoney(b.value.cents, b.currency)}</span>
                ) : (
                  /* Never €0. The reason it is absent, in the cell it would fill. */
                  <span className="text-muted">
                    {b.value.status === "pending"
                      ? OPERATOR_NOTICES.BOOKING_VALUE_PENDING
                      : OPERATOR_NOTICES.BOOKING_VALUE_UNKNOWN}
                  </span>
                )}
              </div>
              <div>
                <BookingChip status={b.status} />
              </div>
              <div className="text-[12px] text-faint">{formatDay(b.bookedAt.slice(0, 10))}</div>
            </div>
          ))}
        </Card>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="lbl">Total bookings</div>
          <div className="mt-2">
            <Figure reading={measured(shown.length)} format={String} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="lbl">Total value</div>
          <div className="mt-2">
            <Figure reading={gmv.total} format={(v) => formatMoney(v)} />
          </div>
          <div className="mt-1.5 text-[11.5px] leading-snug text-faint">
            {gmv.excluded > 0 ? OPERATOR_NOTICES.gmvExcludes(gmv.excluded) : "All bookings have a value."}
          </div>
        </Card>
      </div>

      {bookings.some((b) => b.value.status !== "reported") && (
        <div className="mt-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              <Pill>Value not yet reported</Pill>
              <span>
                Icefall records a booking as soon as you mark the lead Booked, without waiting for a figure —
                and will not guess one. Open the lead to add what it was worth.
              </span>
              <Link to="/operator/leads" className="font-medium text-azure-ink hover:underline">
                Open leads
              </Link>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
