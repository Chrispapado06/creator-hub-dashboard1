import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
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
import {
  listAuditEvents,
  listBookings,
  listCompanies,
  listCustomers,
  listLeads,
  listProducts,
  listStaff,
} from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type {
  AuditEvent,
  Booking,
  Company,
  CustomerRecord,
  Lead,
  LeadStatus,
  Product,
  StaffRecord,
} from "@/data/types";
import { formatMoment } from "@/lib/utils";

/**
 * One enquiry, and everything ICEFALL is actually allowed to know about it.
 *
 * THE CONVERSATION IS NOT ON THIS PAGE, AND THAT IS THE FEATURE. The messages
 * between a customer and an operator live in the shared messaging tables, where
 * reading a thread requires being a participant in it. A staff member opening a
 * lead is not a participant, so this screen shows that the thread exists and
 * refuses to show what is in it. Anything else would mean a customer describing
 * a bad experience with an operator is writing into a room the whole company can
 * read, which is a different product from the one they were offered.
 *
 * THE LIFECYCLE TIMELINE NEVER FILLS IN A GAP. A null `contacted_at` renders as
 * "not contacted yet", never as a date and never as the created date standing in
 * for it. It is also not proof the step did not happen: a lead can be moved
 * straight to a later stage, and the timeline says so underneath rather than
 * inviting the reader to conclude that nobody replied.
 *
 * THE BOOKING VALUE IS ONLY A FIGURE WHEN IT WAS REPORTED. `value_status` has
 * three states and only one of them carries money; a booking that converted but
 * whose worth nobody has confirmed reads "not yet reported", because a lead
 * showing €0 next to a confirmed booking is read as a worthless customer rather
 * than an unfinished record.
 */

type Tab = "conversation" | "details" | "notes" | "activity";

// The mockup's order. The screen opens on Details rather than Conversation
// because Conversation has nothing to show and never will from here.
const TABS: { id: Tab; label: string }[] = [
  { id: "conversation", label: "Conversation" },
  { id: "details", label: "Details" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
];

// Mirrors the map in Leads.tsx, which does not export it. Literal state names,
// never one assembled from the status — Tailwind would emit nothing. Booked is
// settled, lost is refused, disputed is the one that wants somebody, and a lead
// still moving is neither good news nor bad.
const statusState = (s: LeadStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "booked" ? "ok" : s === "lost" ? "bad" : s === "disputed" ? "pending" : "neutral";

/**
 * A booking's own status, read the same three ways Bookings.tsx reads it. The
 * column is free text, so anything unrecognised stays neutral rather than being
 * guessed into a colour it has not earned.
 */
const bookingState = (status: string): "ok" | "bad" | "neutral" =>
  status === "completed" ? "ok" : status === "cancelled" ? "bad" : "neutral";

/**
 * The stages a lead passes through, each read off its own column.
 *
 * `notReached` is deliberately a different sentence per stage: "not contacted
 * yet" and "no quote sent" tell whoever is reading which person owes the next
 * move, where a shared "—" would tell them nothing.
 */
const STAGES: { key: string; label: string; at: (l: Lead) => string | null; notReached: string }[] = [
  { key: "created", label: "Enquiry received", at: (l) => l.created_at, notReached: "No time recorded" },
  { key: "contacted", label: "Contacted", at: (l) => l.contacted_at, notReached: "Not contacted yet" },
  { key: "qualified", label: "Qualified", at: (l) => l.qualified_at, notReached: "Not qualified yet" },
  { key: "quoted", label: "Quoted", at: (l) => l.quoted_at, notReached: "No quote sent yet" },
  { key: "booked", label: "Booked", at: (l) => l.booked_at, notReached: "Not booked" },
  { key: "lost", label: "Lost", at: (l) => l.lost_at, notReached: "Not marked lost" },
];

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();

  const [leads, setLeads] = useState<Result<Lead[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);
  const [customers, setCustomers] = useState<Result<CustomerRecord[]>>(loading);
  const [products, setProducts] = useState<Result<Product[]>>(loading);
  const [staff, setStaff] = useState<Result<StaffRecord[]>>(loading);
  const [audit, setAudit] = useState<Result<AuditEvent[]>>(loading);

  const [tab, setTab] = useState<Tab>("details");

  useEffect(() => {
    void listLeads().then(setLeads);
    void listCompanies().then(setCompanies);
    void listBookings().then(setBookings);
    void listCustomers().then(setCustomers);
    void listProducts().then(setProducts);
    void listStaff().then(setStaff);
    void listAuditEvents().then(setAudit);
  }, []);

  /**
   * Each directory is a separate read, and any of them can be missing while the
   * lead itself is perfectly readable. When one is, we print the identifier the
   * lead actually holds rather than "Unknown": the record exists and the lead
   * knows which one it is — this screen simply cannot spell its name yet.
   */
  // The record, where one was found, and the label separately. An avatar is
  // drawn only from a name the directory actually returned: initials struck from
  // a raw uuid would be initials of an identifier, dressed as a person.
  const companyOf = (cid: string): Company | undefined =>
    companies.state === "ok" ? companies.value.find((c) => c.id === cid) : undefined;

  const companyName = (cid: string): string => companyOf(cid)?.name ?? cid;

  const productName = (pid: string): string =>
    products.state === "ok" ? (products.value.find((p) => p.id === pid)?.name ?? pid) : pid;

  const customerOf = (cid: string): CustomerRecord | undefined =>
    customers.state === "ok" ? customers.value.find((c) => c.id === cid) : undefined;

  const staffOf = (sid: string): StaffRecord | undefined =>
    staff.state === "ok" ? staff.value.find((s) => s.profile_id === sid) : undefined;

  const staffName = (sid: string): string => staffOf(sid)?.name ?? sid;

  const eventsFor = (l: Lead): AuditEvent[] =>
    audit.state === "ok"
      ? audit.value.filter((e) => e.entity_type === "lead" && e.entity_id === l.id)
      : [];

  /**
   * The one money figure on this page, and the four separate reasons it may be
   * absent. They are kept apart because "this enquiry never converted" and "the
   * booking table could not be read" are opposite facts about the same lead.
   */
  const bookingFigure = (l: Lead): { value: string | null; reason: string } => {
    if (!l.booking_id) {
      return {
        value: null,
        reason:
          l.status === "lost"
            ? "This enquiry did not convert, so there is no booking to value."
            : "No booking has been attached to this enquiry yet.",
      };
    }
    if (bookings.state !== "ok") {
      return {
        value: null,
        reason: bookings.state === "loading" ? "Still reading the booking list." : bookings.reason,
      };
    }
    const b = bookings.value.find((x) => x.id === l.booking_id);
    if (!b) {
      return {
        value: null,
        reason: `The booking list was read but holds no record ${l.booking_id}. The enquiry references a booking this account cannot see.`,
      };
    }
    if (b.value_status !== "reported") {
      return {
        value: null,
        reason:
          "Not yet reported. The booking exists; what it was worth has not been confirmed, and an unconfirmed value is not a zero one.",
      };
    }
    return {
      value: formatCents(b.value_cents, b.currency),
      reason: "Marked as reported, but no amount was stored against the booking.",
    };
  };

  return (
    <>
      <div className="mb-4">
        <Link
          to="/admin/leads"
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-3.5 py-2 text-[12.5px] font-medium text-muted shadow-soft transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          All leads
        </Link>
      </div>

      <Resolve result={leads} what="leads">
        {(all) => {
          const lead = all.find((l) => l.id === id);
          if (!lead) {
            return (
              <Empty
                what="This enquiry is not in the lead list"
                body="The list was read and holds no enquiry with the reference in this address. It may have been removed, or the address may be wrong — nothing is shown here rather than an empty record that would look like a real one."
              />
            );
          }

          const customer = customerOf(lead.customer_id);
          const raised = formatMoment(lead.created_at);
          const booking =
            lead.booking_id && bookings.state === "ok"
              ? bookings.value.find((b) => b.id === lead.booking_id)
              : undefined;
          const figure = bookingFigure(lead);
          const events = eventsFor(lead);

          return (
            <>
              <div className="flex items-start gap-4">
                {/* Drawn only when the customer directory named somebody. An
                    avatar over "Enquiry 4f2c…" would be initials of a reference. */}
                {customer && (
                  <div className="pt-1">
                    <Avatar name={customer.name} size={52} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <PageHead
                    // Named by the customer when the directory can be read, and by the
                    // enquiry's own reference when it cannot. Never by a guess.
                    title={customer?.name ?? `Enquiry ${lead.id}`}
                    subtitle={
                      customer
                        ? `${customer.email} · enquired ${raised ?? "at an unrecorded time"}`
                        : `Enquired ${raised ?? "at an unrecorded time"}. The customer directory could not be read, so this page is named by the enquiry's own reference rather than by a name ICEFALL cannot currently confirm.`
                    }
                    actions={<StatusChip state={statusState(lead.status)} label={lead.status} />}
                  />
                </div>
              </div>

              <div className="mb-5 inline-flex flex-wrap items-center gap-1 rounded-pill bg-panel p-1">
                {TABS.map((t) => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={tab === t.id ? "secondary" : "ghost"}
                    aria-pressed={tab === t.id}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {/* Only Activity carries a count, and only when the log was
                        actually read. A "0" beside Conversation or Notes would
                        claim this screen had looked and found nothing. */}
                    {t.id === "activity" && audit.state === "ok" && (
                      <span className="tnum text-faint">{events.length}</span>
                    )}
                  </Button>
                ))}
              </div>

              {tab === "details" && (
                <>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    <Card className="p-6 lg:col-span-3">
                      <SectionLabel>Enquiry</SectionLabel>
                      <dl className="mt-3.5">
                        <Field
                          label="Customer"
                          absent="Not recorded"
                          value={
                            customer ? (
                              <span className="flex items-center gap-2.5">
                                <Avatar name={customer.name} size={28} />
                                <span>{customer.name}</span>
                              </span>
                            ) : (
                              lead.customer_id
                            )
                          }
                        />
                        <Field
                          label="Company"
                          absent="Not recorded"
                          value={
                            <span className="flex min-w-0 items-center gap-2.5">
                              {companyOf(lead.company_id) && (
                                <Avatar name={companyName(lead.company_id)} size={28} />
                              )}
                              <Link
                                to={`/admin/companies/${lead.company_id}`}
                                className="truncate hover:text-accent"
                              >
                                {companyName(lead.company_id)}
                              </Link>
                            </span>
                          }
                        />
                        <Field
                          label="Mountain"
                          absent="No mountain was attached to this enquiry"
                          value={
                            lead.destination_id ? (
                              <Link
                                to={`/admin/mountains/${lead.destination_id}`}
                                className="hover:text-accent"
                              >
                                {lead.destination_id}
                              </Link>
                            ) : null
                          }
                        />
                        <Field
                          label="Product"
                          absent="No specific expedition or trek was named"
                          value={lead.product_id ? productName(lead.product_id) : null}
                        />
                        <Field
                          label="Source page"
                          absent="Unknown — the enquiry arrived without a recorded origin"
                          value={lead.source_page}
                        />
                        <Field
                          label="Assigned to"
                          absent="Nobody has been assigned to this enquiry"
                          value={
                            lead.assigned_to ? (
                              <span className="flex min-w-0 items-center gap-2.5">
                                {staffOf(lead.assigned_to) && (
                                  <Avatar name={staffName(lead.assigned_to)} size={28} />
                                )}
                                <span className="truncate">{staffName(lead.assigned_to)}</span>
                              </span>
                            ) : null
                          }
                        />
                      </dl>

                      {lead.status === "disputed" && (
                        <p className="mt-4 text-[12.5px] leading-relaxed text-warn">
                          Attribution on this enquiry is disputed. Whether it converted through
                          ICEFALL is not settled, so it should not be counted as won or lost until
                          somebody resolves it.
                        </p>
                      )}
                    </Card>

                    <Card className="p-6 lg:col-span-2">
                      <SectionLabel>Lifecycle</SectionLabel>
                      <ol className="mt-4">
                        {STAGES.map((s, i) => {
                          const at = s.at(lead);
                          // A stored timestamp that will not parse is still a
                          // stage that happened — it must not fall back to the
                          // "never reached" sentence.
                          const when = at ? (formatMoment(at) ?? "at an unrecorded time") : null;
                          return (
                            <li key={s.key} className="relative flex gap-3.5 pb-5 last:pb-0">
                              {i < STAGES.length - 1 && (
                                <span
                                  aria-hidden
                                  className="absolute bottom-0 left-[5.5px] top-5 w-px bg-line"
                                />
                              )}
                              <span
                                aria-hidden
                                className={
                                  when
                                    ? "relative mt-1.5 h-3 w-3 shrink-0 rounded-full bg-accent"
                                    : "relative mt-1.5 h-3 w-3 shrink-0 rounded-full bg-raised ring-1 ring-line"
                                }
                              />
                              <div className="min-w-0">
                                <p
                                  className={
                                    when
                                      ? "text-[13.5px] font-semibold text-ink"
                                      : "text-[13.5px] font-medium text-faint"
                                  }
                                >
                                  {s.label}
                                </p>
                                <p className="tnum mt-0.5 text-[12px] text-faint">
                                  {when ?? s.notReached}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
                        A stage with no time was never recorded against this enquiry. That is not
                        the same as it never happening — a lead can be moved straight to a later
                        stage, and nothing here fills the gap in afterwards.
                      </p>
                    </Card>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {/* Butter only while there is a figure to carry. An
                        unreported booking value drops the tile to plain white —
                        a coloured card holding the sentence explaining an
                        absence reads, across a room, like one holding money. */}
                    <Stat
                      tone="butter"
                      label="Booking value"
                      value={figure.value}
                      reason={figure.reason}
                      hint={
                        booking
                          ? `Booking ${booking.id} · attribution recorded as ${booking.attribution_status}.`
                          : undefined
                      }
                    />
                    <Card className="p-6 sm:col-span-2">
                      <SectionLabel>Outcome</SectionLabel>
                      {booking ? (
                        <dl className="mt-3.5">
                          <Field label="Booking" absent="Not recorded" value={booking.id} />
                          <Field
                            label="Status"
                            absent="Not recorded"
                            value={
                              <StatusChip
                                state={bookingState(booking.status)}
                                label={booking.status.replace(/_/g, " ")}
                              />
                            }
                          />
                          <Field
                            label="Booked"
                            absent="At an unrecorded time"
                            value={formatMoment(booking.booked_at)}
                          />
                        </dl>
                      ) : (
                        <p className="mt-3 text-[13px] leading-relaxed text-faint">{figure.reason}</p>
                      )}
                      {lead.status === "lost" && (
                        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
                          {lead.lost_reason ??
                            "No reason was given for the loss. The field is optional, so this enquiry closed without anyone saying why."}
                        </p>
                      )}
                    </Card>
                  </div>
                </>
              )}

              {tab === "conversation" && (
                <>
                  <Card className="p-6">
                    <SectionLabel>Message thread</SectionLabel>
                    <p
                      className={
                        lead.thread_id
                          ? "tnum mt-2.5 text-[13.5px] font-medium text-ink"
                          : "mt-2.5 text-[13.5px] text-faint"
                      }
                    >
                      {lead.thread_id ?? "No message thread is attached to this enquiry."}
                    </p>
                  </Card>
                  <div className="mt-4">
                    <Unavailable
                      reason={
                        "The conversation is not readable from here. Messages between the customer and the " +
                        "operator live in the shared messaging tables, and reading a thread requires being a " +
                        "participant in it — a member of staff opening this page is not one. That is a " +
                        "deliberate rule rather than a missing feature: what a customer writes about their own " +
                        "experience of an operator is theirs, and a CRM that quietly reproduced it would be a " +
                        "different promise from the one they were given. If a thread genuinely needs staff " +
                        "eyes, it is escalated into a support ticket by someone who is in it."
                      }
                    />
                  </div>
                </>
              )}

              {tab === "notes" && (
                <Unavailable
                  reason={
                    "No internal notes are shown, because no read is wired to them yet. Notes are stored " +
                    "apart from the message thread on purpose — that separation is the only thing keeping a " +
                    "candid internal remark out of what the customer and the operator can see, and it is " +
                    "worth more than the convenience of holding both in one table. Until the notes read " +
                    "exists, this tab shows nothing rather than borrowing the conversation to fill itself."
                  }
                />
              )}

              {tab === "activity" && (
                <Resolve
                  result={audit}
                  what="activity"
                  isEmpty={() => events.length === 0}
                  empty="Nothing has been recorded against this enquiry. The audit log holds staff actions, so a lead that has only been moved through its stages by the marketplace itself leaves no entry here. Anything done to the booking is recorded against the booking, not against the lead."
                >
                  {() => (
                    <TableCard>
                      <table className="w-full min-w-[720px] text-[13.5px]">
                        <thead>
                          <tr className="border-b border-line-soft text-left">
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">When</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">
                              Action
                            </th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Who</th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">
                              Reason
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.map((e) => (
                            <tr
                              key={e.id}
                              className="border-b border-line-soft align-top last:border-0 hover:bg-raised"
                            >
                              <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                                {formatMoment(e.created_at) ?? (
                                  <span className="text-faint">At an unrecorded time</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <Pill tone="neutral">{e.action}</Pill>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  {/* Struck from the staff name where the
                                      directory had one, and otherwise from the
                                      desk the log recorded — never from a uuid. */}
                                  <Avatar
                                    name={
                                      (e.actor_id ? staffOf(e.actor_id)?.name : undefined) ??
                                      (e.actor_role ?? "").replace(/_/g, " ")
                                    }
                                    size={34}
                                  />
                                  <div className="min-w-0">
                                    <p className="font-medium text-ink">
                                      {e.actor_id ? (
                                        staffName(e.actor_id)
                                      ) : (
                                        <span className="font-normal text-faint">
                                          No actor recorded
                                        </span>
                                      )}
                                    </p>
                                    {e.actor_role && (
                                      <p className="mt-0.5 text-[12px] text-faint">{e.actor_role}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-muted">
                                {e.reason ?? <span className="text-faint">None given</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCard>
                  )}
                </Resolve>
              )}
            </>
          );
        }}
      </Resolve>
    </>
  );
}

/**
 * One labelled fact, or the sentence explaining its absence.
 *
 * `absent` is a required argument rather than a defaulted dash: whoever adds a
 * field has to decide what it means for that field to be missing.
 */
function Field({ label, value, absent }: { label: string; value: ReactNode; absent: string }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-faint">{label}</dt>
      <dd className={missing ? "min-w-0 text-faint" : "min-w-0 text-ink"}>{missing ? absent : value}</dd>
    </div>
  );
}
