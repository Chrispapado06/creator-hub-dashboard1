/**
 * Bookings — the COMMERCIAL RECORD (brief §4 Booking, §5.6), built to the
 * mockup and then widened to the brief's ten states and its ledger.
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
 *
 * ── THE LEDGER (this wave) ──────────────────────────────────────────────────
 * Each booking opens to its `FinancialEvent`s: quotes, invoices, deposit due /
 * received, balance due / received, refunds, ICEFALL commission due / received.
 * Every line shows its SOURCE — "entered by Ravi Thapa", "reported by Luis
 * Miguel (customer)" — because brief §4 says payment status must identify its
 * source, and the one sentence that governs the whole screen is said ONCE at
 * the top: a recorded amount is not proof that money moved.
 *
 * THERE IS NO PAYMENT COLLECTION UI ANYWHERE HERE. No card form, no pay link,
 * no "charge deposit" button. The payment-provider adapter boundary is a single
 * integration row that says "Not connected", and `paymentProviderReference`
 * renders the reason it is empty rather than an empty cell.
 *
 * WRITES go through `createFinancialEvent` / `setFinancialEventStatus` /
 * `setBookingStatus` on the seam, which enforce the rules (confirmed needs a
 * confirming source; `paid` needs confirmed receipts reaching the quote) and
 * return reasons this screen shows VERBATIM. The controls exist only for a
 * role holding `manageBookingsFinance` — `finance_read_only` sees the record
 * and no control, absent rather than disabled.
 *
 * THE LIVE SEAM HAS NO LEDGER YET. When `listFinancialEvents` is absent the
 * ledger section renders `CRM_NOTICES.NOT_CONNECTED`, not an empty table.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Figure,
  Notice,
  PageHeader,
  PersonAvatar,
  Pill,
  RowMenu,
  SearchInput,
  Tabs,
  Toolbar,
  VerifiedMark,
  formatMoney,
  inputClass,
} from "@/components/ui";
import { DateField, Listbox } from "@/components/controls";
import { can } from "@/domain/authz";
import { CRM_NOTICES } from "@/domain/crm";
import { formatDay, TODAY } from "@/domain/dates";
import { estimatedGmv, fold, measured, OPERATOR_NOTICES } from "@/domain/honesty";
import {
  BOOKING_STATUSES,
  FINANCIAL_EVENT_TYPES,
  normaliseBookingStatus,
  type Booking,
  type BookingStatus,
  type Contact,
  type FinancialEvent,
  type FinancialEventSource,
  type FinancialEventStatus,
  type FinancialEventType,
  type Proposal,
} from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";
import { canConfirm, describeSource, parseMinorUnits, positionFor } from "./financeLedger";

type Filter = "all" | Exclude<BookingStatus, "pending">;

/* -------------------------------------------------------------------------- */
/* The ten chips                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Booking statuses are not product statuses — ChipStatus stays products-only
 * (spec §17), so bookings get their own chip with the same visual treatment.
 * Four visual families: anything awaiting money reads as pending, money in
 * reads as live, a dispute reads as a refusal, the rest as settled/neutral.
 *
 * `pending` (the stored legacy word) is normalised to `deposit_pending` before
 * it reaches this map — `normaliseBookingStatus` is the one translation.
 */
const BOOKING_CHIP_CLASS: Record<Exclude<BookingStatus, "pending">, string> = {
  inquiry: "text-draft bg-draft-soft",
  provisional: "text-pending bg-pending-soft",
  deposit_pending: "text-pending bg-pending-soft",
  confirmed: "text-live bg-live-soft",
  balance_pending: "text-pending bg-pending-soft",
  paid: "text-live bg-live-soft",
  cancelled: "text-rejected bg-rejected-soft",
  completed: "text-draft bg-draft-soft",
  refunded: "text-draft bg-draft-soft",
  disputed: "text-rejected bg-rejected-soft",
};

export const BOOKING_STATUS_LABEL: Record<Exclude<BookingStatus, "pending">, string> = {
  inquiry: "Inquiry",
  provisional: "Provisional",
  deposit_pending: "Deposit pending",
  confirmed: "Confirmed",
  balance_pending: "Balance pending",
  paid: "Paid",
  cancelled: "Cancelled",
  completed: "Completed",
  refunded: "Refunded",
  disputed: "Disputed",
};

export function BookingChip({ status }: { status: BookingStatus }) {
  const s = normaliseBookingStatus(status);
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] uppercase whitespace-nowrap ${BOOKING_CHIP_CLASS[s]}`}
    >
      {BOOKING_STATUS_LABEL[s]}
    </span>
  );
}

const EVENT_TYPE_LABEL: Record<FinancialEventType, string> = {
  quote: "Quote",
  invoice: "Invoice",
  deposit_due: "Deposit due",
  deposit_received: "Deposit received",
  balance_due: "Balance due",
  balance_received: "Balance received",
  refund_requested: "Refund requested",
  refund_issued: "Refund issued",
  commission_due: "Icefall commission due",
  commission_received: "Icefall commission received",
};

const EVENT_STATUS_CLASS: Record<FinancialEventStatus, string> = {
  draft: "text-draft bg-draft-soft",
  issued: "text-pending bg-pending-soft",
  reported: "text-pending bg-pending-soft",
  confirmed: "text-live bg-live-soft",
  cancelled: "text-rejected bg-rejected-soft",
  unavailable: "text-draft bg-draft-soft",
};

export function EventStatusChip({ status }: { status: FinancialEventStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] uppercase whitespace-nowrap ${EVENT_STATUS_CLASS[status]}`}
    >
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

export default function Bookings() {
  const session = useSession();
  const { backend, mountains, revision } = useOperator();
  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);
  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const contacts = useAsync(
    () => (backend.listContacts ? backend.listContacts(session) : Promise.resolve<Contact[]>([])),
    [session, revision],
    [],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  /** The primary contact when the record links one; the lead's name otherwise. */
  const customerFor = (b: Booking) => {
    const c = b.primaryContactId ? contacts.find((x) => x.id === b.primaryContactId) : null;
    if (c) return `${c.firstName} ${c.lastName}`.trim();
    return leads.find((l) => l.id === b.leadId)?.customerName ?? "Customer";
  };
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? "—";
  const mountainName = (id: string | null) => mountains.find((m) => m.id === id)?.name ?? "—";

  const q = query.trim().toLowerCase();
  const matchesQuery = (b: Booking) =>
    q === "" ||
    [customerFor(b), productName(b.productId), mountainName(b.mountainId), b.externalReference ?? ""].some((s) =>
      s.toLowerCase().includes(q),
    );

  const searched = bookings.filter(matchesQuery);
  const statusOf = (b: Booking) => normaliseBookingStatus(b.status);
  const count = (f: Filter) => (f === "all" ? searched.length : searched.filter((b) => statusOf(b) === f).length);
  const shown = searched.filter((b) => filter === "all" || statusOf(b) === filter);
  const gmv = estimatedGmv(shown.map((b) => b.value));

  return (
    <>
      <PageHeader
        title="Bookings"
        detail="The commercial record of every booking, and the financial events recorded against each."
      />

      <div className="mb-4">
        <Notice>{CRM_NOTICES.AMOUNT_IS_NOT_PROOF}</Notice>
      </div>

      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search bookings..." />}
      />

      <div className="mb-3">
        <Tabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { key: "all" as const, label: "All", count: count("all") },
            ...BOOKING_STATUSES.map((s) => ({ key: s, label: BOOKING_STATUS_LABEL[s], count: count(s) })),
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
          <div className="hidden grid-cols-[1.4fr_1.6fr_1fr_1fr_1.1fr_0.9fr] gap-4 border-b border-line px-4 py-2.5 md:grid">
            {["Customer", "Trip", "Mountain", "Value", "Status", "Booked"].map((h) => (
              <div key={h} className="lbl">{h}</div>
            ))}
          </div>
          {shown.map((b, i) => (
            <Link
              key={b.id}
              to={`/operator/bookings/${b.id}`}
              className={`grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-raised md:grid-cols-[1.4fr_1.6fr_1fr_1fr_1.1fr_0.9fr] md:items-center ${
                i > 0 ? "border-t border-line-soft" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PersonAvatar name={customerFor(b)} size={26} />
                <span className="truncate text-[12.5px] font-medium text-ink">{customerFor(b)}</span>
                <VerifiedMark name={customerFor(b)} size={13} />
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
            </Link>
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
          <div className="lbl">Total reported value</div>
          <div className="mt-2">
            <Figure reading={gmv.total} format={(v) => formatMoney(v)} />
          </div>
          <div className="mt-1.5 text-[11.5px] leading-snug text-faint">
            {gmv.excluded > 0 ? OPERATOR_NOTICES.gmvExcludes(gmv.excluded) : "All bookings have a value."}{" "}
            Quoted values, not money received — see Finance for what has been recorded as received.
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

/* -------------------------------------------------------------------------- */
/* One booking — the commercial record and its ledger                          */
/* -------------------------------------------------------------------------- */

/** Loading / not connected / loaded, kept distinct so no state draws as another. */
type Loaded<T> = T | null | undefined;

export function BookingDetail() {
  const { id = "" } = useParams();
  const session = useSession();
  const { backend, mountains, revision, refresh } = useOperator();
  const canWrite = can(session, "manageBookingsFinance");

  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);
  const booking = bookings.find((b) => b.id === id) ?? null;
  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const team = useAsync(() => backend.getTeam(session), [session, revision], []);
  const contacts = useAsync(
    () => (backend.listContacts ? backend.listContacts(session) : Promise.resolve<Contact[]>([])),
    [session, revision],
    [],
  );
  const events = useAsync<Loaded<FinancialEvent[]>>(
    () => (backend.listFinancialEvents ? backend.listFinancialEvents(session, id) : Promise.resolve(null)),
    [session, revision, id],
    undefined,
  );
  const proposal = useAsync<Loaded<Proposal>>(
    () =>
      booking?.proposalId && backend.getProposal
        ? backend.getProposal(session, booking.proposalId)
        : Promise.resolve(backend.getProposal ? null : undefined),
    [session, revision, booking?.proposalId],
    undefined,
  );
  const departures = useAsync(
    () => (booking?.productId ? backend.getDepartures(session, booking.productId) : Promise.resolve([])),
    [session, revision, booking?.productId],
    [],
  );

  const [statusMsg, setStatusMsg] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);
  const [nextStatus, setNextStatus] = useState<string | null>(null);
  const [eventMsg, setEventMsg] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  if (bookings.length > 0 && !booking) {
    return (
      <>
        <PageHeader title="Booking" />
        <EmptyState title="This booking is not in your records" detail="It may belong to another company, or the link is out of date." />
        <div className="mt-4">
          <Link to="/operator/bookings" className="text-[12.5px] font-medium text-azure-ink hover:underline">
            Back to bookings
          </Link>
        </div>
      </>
    );
  }
  if (!booking) return <PageHeader title="Booking" detail="Loading…" />;

  const lead = leads.find((l) => l.id === booking.leadId) ?? null;
  const contact = booking.primaryContactId ? contacts.find((c) => c.id === booking.primaryContactId) ?? null : null;
  const customer = contact ? `${contact.firstName} ${contact.lastName}`.trim() : lead?.customerName ?? "Customer";
  const product = products.find((p) => p.id === booking.productId) ?? null;
  const mountain = mountains.find((m) => m.id === booking.mountainId) ?? null;
  const departure = booking.departureId ? departures.find((d) => d.id === booking.departureId) ?? null : null;
  const position = events ? positionFor(booking, events, TODAY) : null;
  const money = (cents: number | null | undefined) =>
    cents === null || cents === undefined ? <span className="text-muted">Not recorded</span> : <span className="tnum font-medium text-ink">{formatMoney(cents, booking.currency)}</span>;
  const when = (iso: string | null | undefined) => (iso ? formatDay(iso.slice(0, 10)) : "—");

  const changeStatus = async () => {
    if (!nextStatus || !backend.setBookingStatus) return;
    const r = await backend.setBookingStatus(session, booking.id, nextStatus as BookingStatus);
    if (r.ok) {
      setStatusMsg({ tone: "neutral", text: `Status recorded as ${BOOKING_STATUS_LABEL[normaliseBookingStatus(r.value.status)]}. An audit event was written.` });
      setNextStatus(null);
      refresh();
    } else {
      setStatusMsg({ tone: "rejected", text: r.reason });
    }
  };

  const moveEvent = async (e: FinancialEvent, status: FinancialEventStatus) => {
    if (!backend.setFinancialEventStatus) return;
    const r = await backend.setFinancialEventStatus(session, e.id, status);
    setEventMsg(r.ok ? { tone: "neutral", text: `${EVENT_TYPE_LABEL[e.type]} is now ${status}.` } : { tone: "rejected", text: r.reason });
    if (r.ok) refresh();
  };

  return (
    <>
      <PageHeader
        title={customer}
        detail={[product?.name, mountain?.name, `booked ${formatDay(booking.bookedAt.slice(0, 10))}`].filter(Boolean).join(" · ")}
        action={
          <Link to="/operator/bookings" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink">
            <ArrowLeft size={14} aria-hidden /> All bookings
          </Link>
        }
      />

      {/* Said once, at the top, for the whole record below it. */}
      <div className="mb-4">
        <Notice>{CRM_NOTICES.AMOUNT_IS_NOT_PROOF}</Notice>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* ---- the commercial record ------------------------------------ */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-ink">Commercial record</h2>
              <BookingChip status={booking.status} />
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row label="Quoted total">{money(booking.quotedTotalMinor)}</Row>
              <Row label="External reference">
                {booking.externalReference ? <span className="text-ink">{booking.externalReference}</span> : <span className="text-muted">Not recorded</span>}
              </Row>
              <Row label="Deposit due">
                {money(booking.depositDueMinor)}
                <span className="ml-2 text-[11.5px] text-faint">by {when(booking.depositDueAt)}</span>
              </Row>
              <Row label="Balance due">
                {money(booking.balanceDueMinor)}
                <span className="ml-2 text-[11.5px] text-faint">by {when(booking.balanceDueAt)}</span>
              </Row>
              <Row label="Payment provider reference">
                {booking.paymentProviderReference ? (
                  <span className="text-ink">{booking.paymentProviderReference}</span>
                ) : (
                  <span className="text-muted">{CRM_NOTICES.NO_PAYMENT_PROVIDER}</span>
                )}
              </Row>
              <Row label="Currency">
                <span className="text-ink">{booking.currency}</span>
              </Row>
            </dl>

            {position && (
              <div className="mt-4 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-2">
                <PositionLine label="Deposit" line={position.deposit} currency={booking.currency} />
                <PositionLine label="Balance" line={position.balance} currency={booking.currency} />
              </div>
            )}

            {canWrite && backend.setBookingStatus && (
              <div className="mt-5 border-t border-line-soft pt-4">
                <div className="lbl mb-2">Change status</div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-[220px]">
                    <Listbox
                      value={nextStatus}
                      placeholder="Choose a status"
                      options={BOOKING_STATUSES.filter((s) => s !== normaliseBookingStatus(booking.status)).map((s) => ({
                        value: s,
                        label: BOOKING_STATUS_LABEL[s],
                      }))}
                      onChange={(v) => {
                        setNextStatus(v);
                        setStatusMsg(null);
                      }}
                    />
                  </div>
                  <Button variant="primary" disabled={!nextStatus} onClick={changeStatus}>
                    Record status
                  </Button>
                </div>
                <p className="mt-2 text-[11.5px] leading-snug text-muted">
                  Paid needs confirmed receipts that reach the quoted total; Refunded needs a confirmed refund. The
                  record refuses otherwise and says why.
                </p>
                {statusMsg && (
                  <div className="mt-3">
                    <Notice tone={statusMsg.tone}>{statusMsg.text}</Notice>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ---- the ledger ----------------------------------------------- */}
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink">Financial events</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              Every quote, invoice, receipt, refund and commission line recorded against this booking, with who
              said so.
            </p>

            {events === undefined ? (
              <p className="mt-4 text-[12.5px] text-faint">Loading…</p>
            ) : events === null ? (
              <div className="mt-4">
                <Notice>{CRM_NOTICES.NOT_CONNECTED}</Notice>
              </div>
            ) : events.length === 0 ? (
              <p className="mt-4 text-[12.5px] text-muted">No financial event has been recorded on this booking.</p>
            ) : (
              <div className="mt-4 -mx-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line">
                      {["Type", "Amount", "Status", "Source", "Reference", "Effective", ""].map((h) => (
                        <th key={h} className="lbl px-5 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-line-soft">
                        <td className="px-5 py-2.5 text-ink">{EVENT_TYPE_LABEL[e.type]}</td>
                        <td className="tnum px-5 py-2.5 text-ink">
                          {e.amountMinor === null ? <span className="text-muted">Amount not known</span> : formatMoney(e.amountMinor, e.currency)}
                        </td>
                        <td className="px-5 py-2.5"><EventStatusChip status={e.status} /></td>
                        <td className="px-5 py-2.5 text-muted">{describeSource(e.source, team, contacts)}</td>
                        <td className="px-5 py-2.5 text-muted">{e.externalReference ?? "—"}</td>
                        <td className="px-5 py-2.5 text-faint">{when(e.effectiveAt)}</td>
                        <td className="px-5 py-2.5 text-right">
                          {canWrite && backend.setFinancialEventStatus && e.status !== "confirmed" && e.status !== "cancelled" && (
                            <RowMenu
                              label={`Actions for ${EVENT_TYPE_LABEL[e.type]}`}
                              items={[
                                ...(e.status === "draft" ? [{ label: "Mark issued", onClick: () => void moveEvent(e, "issued") }] : []),
                                ...(e.status !== "reported" ? [{ label: "Mark reported", onClick: () => void moveEvent(e, "reported") }] : []),
                                {
                                  label: canConfirm(e.source) ? "Confirm" : "Confirm (source cannot confirm)",
                                  onClick: () => void moveEvent(e, "confirmed"),
                                },
                                { label: "Cancel event", tone: "danger" as const, onClick: () => void moveEvent(e, "cancelled") },
                              ]}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {eventMsg && (
              <div className="mt-3">
                <Notice tone={eventMsg.tone}>{eventMsg.text}</Notice>
              </div>
            )}

            {canWrite && events !== null && events !== undefined && backend.createFinancialEvent && (
              <RecordEventForm
                booking={booking}
                contactName={contact ? customer : null}
                onDone={(text, tone) => {
                  setEventMsg({ text, tone });
                  if (tone === "neutral") refresh();
                }}
              />
            )}
          </Card>
        </div>

        {/* ---- the right column: links and the provider boundary ---------- */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Linked records</h2>
            <dl className="mt-3 space-y-3">
              <Row label="Primary contact">
                {contact ? (
                  can(session, "manageContacts") ? (
                    <Link to={`/operator/customers/${contact.id}`} className="font-medium text-azure-ink hover:underline">
                      {customer}
                    </Link>
                  ) : (
                    <span className="text-ink">{customer}</span>
                  )
                ) : booking.primaryContactId ? (
                  <span className="text-muted">Contact {booking.primaryContactId} — not readable here</span>
                ) : (
                  <span className="text-muted">Not linked to a contact record</span>
                )}
              </Row>
              <Row label="Enquiry">
                {lead ? (
                  <Link to={`/operator/leads/${lead.id}`} className="font-medium text-azure-ink hover:underline">
                    {lead.customerName} · {lead.status}
                  </Link>
                ) : (
                  <span className="text-muted">No enquiry linked</span>
                )}
              </Row>
              <Row label="Proposal">
                {booking.proposalId ? (
                  proposal === undefined ? (
                    <span className="text-muted">Proposal {booking.proposalId} — {CRM_NOTICES.NOT_CONNECTED}</span>
                  ) : proposal === null ? (
                    <span className="text-muted">Proposal {booking.proposalId} — not readable here</span>
                  ) : (
                    <span className="text-ink">
                      {formatMoney(proposal.totalMinor, proposal.currency)} · {proposal.status}
                      {can(session, "manageProposals") && (
                        <>
                          {" · "}
                          <Link to={`/operator/proposals/${proposal.id}`} className="font-medium text-azure-ink hover:underline">
                            open proposal
                          </Link>
                        </>
                      )}
                    </span>
                  )
                ) : (
                  <span className="text-muted">No proposal linked — this booking was recorded without one</span>
                )}
              </Row>
              <Row label="Departure">
                {departure ? (
                  <span className="text-ink">
                    {departure.name ?? product?.name ?? "Departure"} · {formatDay(departure.departureDate)}
                    {can(session, "manageDepartures") ? (
                      <>
                        {" · "}
                        <Link to={`/operator/departures/${departure.id}`} className="font-medium text-azure-ink hover:underline">
                          open departure
                        </Link>
                      </>
                    ) : product ? (
                      <>
                        {" · "}
                        <Link to={`/operator/products/${product.id}`} className="font-medium text-azure-ink hover:underline">
                          open trip
                        </Link>
                      </>
                    ) : null}
                  </span>
                ) : booking.departureId ? (
                  <span className="text-muted">Departure {booking.departureId} — not on this trip's list</span>
                ) : (
                  <span className="text-muted">Not linked to a dated departure</span>
                )}
              </Row>
            </dl>
          </Card>

          {/*
            THE PAYMENT-PROVIDER ADAPTER BOUNDARY, as a row and nothing more.
            No connect button: there is nothing to connect to, and a button
            that opened a form for a provider that does not exist would be the
            fake connect flow the brief rules out.
          */}
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Payment provider</h2>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-muted">Payments integration</span>
              <Pill>Not connected</Pill>
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-muted">
              No provider reports receipts into this record. Every receipt here was entered by a person and says
              so. This portal takes no card details and sends no payment link.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="lbl">{label}</dt>
      <dd className="mt-1 text-[12.5px] leading-snug">{children}</dd>
    </div>
  );
}

function PositionLine({
  label,
  line,
  currency,
}: {
  label: string;
  line: ReturnType<typeof positionFor>["deposit"];
  currency: string;
}) {
  return (
    <div className="rounded-tile bg-canvas px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="lbl">{label} outstanding</span>
        {line.overdue && (
          <span className="rounded-pill bg-rejected-soft px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] text-rejected uppercase">
            Overdue {line.daysOverdue} d
          </span>
        )}
      </div>
      <div className="mt-1">
        <Figure reading={line.outstandingMinor} format={(v) => formatMoney(v, currency)} size="sm" />
      </div>
      <div className="mt-1 text-[11.5px] leading-snug text-faint">
        {fold(
          line.dueMinor,
          (due) => `Due ${formatMoney(due, currency)}${line.dueDay ? ` by ${formatDay(line.dueDay)}` : ""} · confirmed received ${formatMoney(line.receivedMinor, currency)}`,
          () => "",
        )}
        {line.reportedMinor > 0 && ` · reported but unconfirmed ${formatMoney(line.reportedMinor, currency)}`}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Recording an event                                                         */
/* -------------------------------------------------------------------------- */

type SourceKind = Exclude<FinancialEventSource["kind"], "provider">;

const SOURCE_OPTIONS: { value: SourceKind; label: string; hint: string }[] = [
  { value: "operator_confirmation", label: "I saw the money", hint: "Operator confirmation — a bank statement or receipt you checked yourself. Can confirm." },
  { value: "manual_entry", label: "Recorded on somebody's word", hint: "Manual entry by you. Stops at reported; cannot confirm." },
  { value: "customer_report", label: "The customer told us", hint: "Customer report. Stops at reported; cannot confirm." },
];

const STATUS_OPTIONS: { value: FinancialEventStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "reported", label: "Reported" },
  { value: "confirmed", label: "Confirmed" },
];

function RecordEventForm({
  booking,
  contactName,
  onDone,
}: {
  booking: Booking;
  contactName: string | null;
  onDone: (text: string, tone: "neutral" | "rejected") => void;
}) {
  const session = useSession();
  const { backend } = useOperator();
  const [type, setType] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("issued");
  const [amount, setAmount] = useState("");
  const [amountUnknown, setAmountUnknown] = useState(false);
  const [sourceKind, setSourceKind] = useState<string>("manual_entry");
  const [reportedBy, setReportedBy] = useState(contactName ?? "");
  const [reference, setReference] = useState("");
  const [effective, setEffective] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    if (!backend.createFinancialEvent || !type) return;
    const minor = amountUnknown ? null : parseMinorUnits(amount);
    if (!amountUnknown && minor === null) {
      setProblem("Enter the amount as a number with up to two decimals, like 2490 or 2490.50 — or tick “amount not known”.");
      return;
    }
    const source: FinancialEventSource =
      sourceKind === "operator_confirmation"
        ? { kind: "operator_confirmation", confirmedBy: session.user.id }
        : sourceKind === "customer_report"
          ? { kind: "customer_report", reportedBy: reportedBy.trim() }
          : { kind: "manual_entry", enteredBy: session.user.id };
    setProblem(null);
    const r = await backend.createFinancialEvent(session, {
      bookingId: booking.id,
      type: type as FinancialEventType,
      status: status as FinancialEventStatus,
      amountMinor: minor,
      currency: booking.currency,
      source,
      externalReference: reference.trim() || null,
      // A due date is a LOCAL day; recorded at UTC midnight of that day, as the seed does.
      effectiveAt: effective ? `${effective}T00:00:00.000Z` : null,
    });
    if (r.ok) {
      onDone(`${EVENT_TYPE_LABEL[r.value.type]} recorded as ${r.value.status}, ${describeSource(r.value.source, [session.user])}. An audit event was written.`, "neutral");
      setType(null);
      setAmount("");
      setReference("");
      setEffective(null);
    } else {
      onDone(r.reason, "rejected");
    }
  };

  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <div className="lbl mb-2">Record a financial event</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Listbox
          label="Type"
          value={type}
          placeholder="What happened"
          options={FINANCIAL_EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABEL[t] }))}
          onChange={setType}
        />
        <Listbox label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <Field label={`Amount (${booking.currency})`} hint="Whole units with up to two decimals. Stored as integer minor units.">
          <input className={inputClass} value={amount} disabled={amountUnknown} onChange={(e) => setAmount(e.target.value)} placeholder="2490.00" />
          <label className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
            <input type="checkbox" checked={amountUnknown} onChange={(e) => setAmountUnknown(e.target.checked)} />
            Amount not known — record the event without a figure
          </label>
        </Field>
        <div>
          <Listbox
            label="Who says so"
            value={sourceKind}
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={setSourceKind}
          />
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            {SOURCE_OPTIONS.find((o) => o.value === sourceKind)?.hint} A connected provider is not offered: none is connected.
          </p>
        </div>
        {sourceKind === "customer_report" && (
          <Field label="Reported by" hint="The customer who told you.">
            <input className={inputClass} value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} />
          </Field>
        )}
        <Field label="Reference" hint="Invoice number, bank reference — yours.">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <DateField label="Effective day" value={effective} onChange={setEffective} clearable placeholder="Due or receipt day" />
      </div>
      {problem && (
        <div className="mt-3">
          <Notice tone="rejected">{problem}</Notice>
        </div>
      )}
      <div className="mt-4">
        <Button variant="primary" disabled={!type} onClick={submit}>
          Record event
        </Button>
      </div>
    </div>
  );
}
