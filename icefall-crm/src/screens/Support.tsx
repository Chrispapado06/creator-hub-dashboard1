import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  PageHead,
  Pill,
  SectionLabel,
  Stat,
  StatusChip,
  TableCard,
} from "@/components/ui";
import { Empty, Resolve, Unavailable } from "@/components/states";
import { listCompanies, listCustomers, listTickets } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, CustomerRecord, Ticket, TicketPriority, TicketStatus } from "@/data/types";
import { formatMoment } from "@/lib/utils";

/**
 * The support desk, inside the CRM rather than beside it.
 *
 * A ticket is nearly useless on its own. "Departure date moved without notice"
 * is a customer-service problem, a company-relationship problem and possibly a
 * referral-fee problem at the same time, and whoever picks it up needs to see
 * the customer, the company, the lead and the booking without leaving the row.
 * That is the entire reason support lives here and not in a separate help desk.
 *
 * NO RESPONSE TIME, NO RESOLUTION TIME, NO SATISFACTION SCORE. A ticket carries
 * `created_at` and `updated_at` and nothing about the conversation itself.
 * `updated_at` moves when anyone edits a status or an assignee, so reading it as
 * "when the customer last heard from us" would count an internal edit as a
 * reply — a metric that improves every time somebody touches a ticket without
 * answering it. Those figures arrive with a table that stores ticket messages.
 * Satisfaction never arrives from here at all: ICEFALL collects no ratings.
 *
 * A COUNT OF ZERO IS A MEASUREMENT ON THIS SCREEN, and it is the one place that
 * is true. The tabs and tiles count a list that was actually read, so "0 open"
 * means nothing is open. When the list cannot be read the tiles carry no number
 * at all — the reason takes its place — because "no open tickets" and "we could
 * not reach the ticket table" are the difference between a quiet desk and an
 * unattended one.
 */

type Tab = TicketStatus | "all";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "investigating", label: "Investigating" },
  { id: "waiting", label: "Waiting" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

/** Neither resolved nor closed — the tickets somebody still owes an answer on. */
const UNRESOLVED: TicketStatus[] = ["open", "investigating", "waiting"];
const isUnresolved = (t: Ticket) => UNRESOLVED.includes(t.status);

const priorityTone = (p: TicketPriority) =>
  p === "critical" ? "red" : p === "high" ? "amber" : "neutral";

/**
 * The status column, drawn as the mockup's chip.
 *
 * Five statuses collapse to three glyphs and the grouping is exactly the one the
 * tiles above count by: open, investigating and waiting are the tickets somebody
 * still owes an answer on, so they share the waiting glyph; resolved carries the
 * settled tick; closed is neutral because it is merely over, not agreed. The
 * status word is printed beside the glyph either way, so the row still says
 * which of the three unresolved states a ticket is actually in — and the chip
 * can never disagree with the "Open tickets" tile, because both read `UNRESOLVED`.
 */
const statusState = (s: TicketStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "resolved" ? "ok" : s === "closed" ? "neutral" : "pending";

/**
 * Whole literal class strings, one per priority — never `bg-${priority}`.
 * Tailwind scans this file as text, so a class assembled at runtime produces an
 * unstyled row and no error. Every row carries a left rail so that tinting one
 * does not shift the others sideways by two pixels.
 */
const rowClass = (p: TicketPriority) =>
  p === "critical"
    ? "border-b border-line-soft last:border-0 border-l-2 border-l-[oklch(0.55_0.17_22)] bg-[oklch(0.977_0.016_22)] hover:bg-raised"
    : p === "high"
      ? "border-b border-line-soft last:border-0 border-l-2 border-l-[oklch(0.66_0.13_70)] bg-[oklch(0.984_0.019_84)] hover:bg-raised"
      : "border-b border-line-soft last:border-0 border-l-2 border-l-transparent hover:bg-raised";

export default function Support() {
  const [tickets, setTickets] = useState<Result<Ticket[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [customers, setCustomers] = useState<Result<CustomerRecord[]>>(loading);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    void listTickets().then(setTickets);
    void listCompanies().then(setCompanies);
    void listCustomers().then(setCustomers);
  }, []);

  const count = (match: (t: Ticket) => boolean): string | null =>
    tickets.state === "ok" ? String(tickets.value.filter(match).length) : null;

  const reason =
    tickets.state === "loading"
      ? "Still reading the ticket list."
      : tickets.state === "unavailable" || tickets.state === "error"
        ? tickets.reason
        : "Not recorded";

  // The customer directory is a separate read. If it has not arrived we print
  // the identifier the ticket actually holds rather than "Unknown" — the ticket
  // knows who raised it; this screen just cannot spell their name yet.
  const customerLabel = (id: string | null): string | null => {
    if (!id) return null;
    const c = customers.state === "ok" ? customers.value.find((x) => x.id === id) : undefined;
    return c ? c.name : `Customer ${id}`;
  };

  return (
    <>
      <PageHead
        title="Support"
        subtitle="Tickets raised by customers and by ICEFALL's own staff, kept beside the company, lead and booking they are about. Most of what arrives here is a commercial event before it is a service one."
      />

      {/* Pastel in the mockup's order. A tile whose count could not be read drops
          to plain surface on its own — see `Stat`. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          tone="butter"
          label="Open tickets"
          value={count(isUnresolved)}
          reason={reason}
          hint="Open, investigating or waiting. Resolved and closed are excluded."
        />
        <Stat
          tone="sky"
          label="Critical priority"
          value={count((t) => isUnresolved(t) && t.priority === "critical")}
          reason={reason}
          hint="Unresolved only — a critical ticket already closed is not work."
        />
        <Stat
          tone="lilac"
          label="High priority"
          value={count((t) => isUnresolved(t) && t.priority === "high")}
          reason={reason}
          hint="Unresolved only."
        />
        <Stat
          tone="mint"
          label="Nobody assigned"
          value={count((t) => isUnresolved(t) && t.assigned_to === null)}
          reason={reason}
          hint="Unresolved tickets with no name on them."
        />
      </div>

      <Card className="mt-3">
        <SectionLabel>Disputes pause collection</SectionLabel>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          While a company contests the introduction or the amount, ICEFALL does not invoice the
          referral fee on that booking — collection is paused until an administrator resolves the
          dispute one way or the other. A ticket records the argument; it never settles it, and
          nothing on this screen changes a booking&rsquo;s attribution.
        </p>
      </Card>

      <div className="mt-6">
        <Resolve
          result={tickets}
          what="support tickets"
          isEmpty={(v) => v.length === 0}
          empty="No tickets have been raised. One is created when a customer or a member of staff reports a problem with a booking, a listing or a payment."
        >
          {(list) => {
            const shown = tab === "all" ? list : list.filter((t) => t.status === tab);
            return (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {TABS.map((t) => {
                    const n = t.id === "all" ? list.length : list.filter((x) => x.status === t.id).length;
                    return (
                      <Button
                        key={t.id}
                        size="sm"
                        variant={tab === t.id ? "secondary" : "ghost"}
                        aria-pressed={tab === t.id}
                        onClick={() => setTab(t.id)}
                      >
                        {t.label}
                        <span className="tnum rounded-pill bg-raised px-1.5 py-[1px] text-[11.5px] font-medium text-faint">
                          {n}
                        </span>
                      </Button>
                    );
                  })}
                </div>

                {shown.length === 0 ? (
                  <Empty
                    what="No tickets in this status"
                    body="Every ticket ICEFALL has recorded is under one of the other tabs — the count beside each name says where they are."
                  />
                ) : (
                  <>
                    <TableCard>
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="border-b border-line-soft text-left">
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Reference</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Subject</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Type</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Priority</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Company</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Assigned to</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Opened</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((t) => {
                            const who = customerLabel(t.customer_id);
                            const company =
                              t.company_id && companies.state === "ok"
                                ? companies.value.find((c) => c.id === t.company_id)
                                : undefined;
                            return (
                              <tr key={t.id} className={rowClass(t.priority)}>
                                <td className="tnum whitespace-nowrap px-5 py-3.5 font-semibold text-ink">
                                  {t.reference}
                                </td>
                                <td className="px-5 py-3.5">
                                  <p className="font-medium text-ink">{t.subject}</p>
                                  {/* The point of support living in the CRM: the commercial
                                      record this ticket is attached to, on the same line. */}
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-faint">
                                    {who && <span>{who}</span>}
                                    {t.lead_id && (
                                      <Link to={`/admin/leads/${t.lead_id}`} className="hover:text-accent">
                                        Lead {t.lead_id}
                                      </Link>
                                    )}
                                    {t.booking_id && <span>Booking {t.booking_id}</span>}
                                    {!t.customer_id && !t.lead_id && !t.booking_id && (
                                      <span>No customer, lead or booking attached to this ticket</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  {/* Taxonomy, not status — a neutral pill, never a chip. */}
                                  <Pill>{t.type}</Pill>
                                </td>
                                <td className="px-5 py-3.5">
                                  <Pill tone={priorityTone(t.priority)}>
                                    {t.priority === "critical" && (
                                      <AlertTriangle size={12} strokeWidth={1.8} />
                                    )}
                                    {t.priority}
                                  </Pill>
                                </td>
                                <td className="whitespace-nowrap px-5 py-3.5">
                                  <StatusChip state={statusState(t.status)} label={t.status} />
                                </td>
                                <td className="px-5 py-3.5">
                                  {t.company_id === null ? (
                                    <span className="text-faint">No company on this ticket</span>
                                  ) : company ? (
                                    <Link
                                      to={`/admin/companies/${company.id}`}
                                      className="flex items-center gap-2.5 whitespace-nowrap font-medium text-ink hover:text-accent"
                                    >
                                      <Avatar name={company.name} size={34} />
                                      {company.name}
                                    </Link>
                                  ) : (
                                    <Link
                                      to={`/admin/companies/${t.company_id}`}
                                      className="flex items-center gap-2.5 text-muted hover:text-accent"
                                    >
                                      {/* No name to draw a monogram from. The blank
                                          avatar holds the row's shape without
                                          inventing initials out of an identifier. */}
                                      <Avatar name="" size={34} />
                                      {t.company_id}
                                    </Link>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-muted">
                                  {t.assigned_to ? (
                                    <span className="flex items-center gap-2.5 whitespace-nowrap">
                                      {/* Accent marks ICEFALL's own people apart from
                                          the companies in the column beside. The
                                          monogram is the identifier that is printed
                                          next to it, not a name guessed for it. */}
                                      <Avatar name={t.assigned_to} size={28} tone="accent" />
                                      {t.assigned_to}
                                    </span>
                                  ) : (
                                    <span className="text-faint">Unassigned</span>
                                  )}
                                </td>
                                <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                                  {/* `formatMoment` returns null on a stamp it
                                      cannot parse. An empty cell here would read
                                      as a ticket nobody dated. */}
                                  {formatMoment(t.created_at) ?? (
                                    <span className="text-faint">At an unrecorded time</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableCard>
                    <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-faint">
                      Assigned to shows the staff record&rsquo;s identifier. This screen does not read
                      ICEFALL&rsquo;s staff directory, so it prints the reference the ticket holds rather
                      than guessing at a name.
                    </p>
                  </>
                )}
              </>
            );
          }}
        </Resolve>
      </div>

      <div className="mt-6">
        <Unavailable
          reason={
            "First-response time, time to resolution and customer satisfaction are not shown. A " +
            "ticket records when it was opened and when its row last changed, and nothing about " +
            "the conversation — using `updated_at` as the moment the customer last heard from " +
            "ICEFALL would let an internal status edit count as a reply, and would improve the " +
            "figure every time somebody touched a ticket without answering it. Those measures " +
            "arrive with the table that stores ticket messages. Satisfaction does not arrive at " +
            "all: ICEFALL asks nobody to rate anything, so there is no score to average."
          }
        />
      </div>
    </>
  );
}
