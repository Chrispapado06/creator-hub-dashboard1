/**
 * `/operator/leads/:id` — two views on one route.
 *
 * By default the id selects a row on the unified Leads & Messages screen, so a
 * deep link lands on the thread the way the mockup's two-pane layout works.
 * `?view=detail` opens THIS file's deeper view: the full lead record — stage,
 * notes, history, booking, assignment — reached from the pane header's
 * "View lead" menu item.
 *
 * Everything spec §10 says a lead stores: customer, company, mountain, product,
 * source page, created date, assigned sales user, status, notes, booking value
 * if known, and the conversion timestamps.
 *
 * "IF KNOWN" IS THE WHOLE OF IT. A booking with no value shows what it is —
 * recorded, value not yet reported — with a field to supply it. It does not show
 * €0, and there is no way through this screen to make it show €0, because a
 * revenue figure an operator did not give us is not a revenue figure.
 */

import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, Notice, PageHeader, Pill, formatMoney, inputClass } from "@/components/ui";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay, timeAgo, NOW } from "@/domain/dates";
import { LEAD_PIPELINE } from "@/domain/types";
import { useState } from "react";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";
import { LeadsMessages } from "./Leads";

export default function LeadDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  if (params.get("view") !== "detail") return <LeadsMessages selectedId={id} />;
  return <LeadDeepDetail id={id} />;
}

function LeadDeepDetail({ id }: { id: string }) {
  const session = useSession();
  const { backend, mountains, revision, refresh } = useOperator();

  const lead = useAsync(() => backend.getLead(session, id), [session, id, revision], null);
  const notes = useAsync(() => backend.getLeadNotes(session, id), [session, id, revision], []);
  const team = useAsync(() => backend.getTeam(session), [session, revision], []);
  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);

  const [note, setNote] = useState("");

  if (!lead) {
    return (
      <>
        <PageHeader title="Lead not found" />
        <Notice>This lead either does not exist or belongs to another company.</Notice>
      </>
    );
  }

  const booking = bookings.find((b) => b.id === lead.bookingId);
  const product = products.find((p) => p.id === lead.productId);
  const mountain = lead.mountainId ? mountains.find((m) => m.id === lead.mountainId) : null;

  const timeline: { label: string; at: string | null }[] = [
    { label: "Enquiry received", at: lead.createdAt },
    { label: "Contacted", at: lead.firstResponseAt },
    { label: "Qualified", at: lead.qualifiedAt },
    { label: "Quoted", at: lead.quotedAt },
    { label: "Booked", at: lead.bookedAt },
    { label: "Lost", at: lead.lostAt },
  ];

  return (
    <>
      <PageHeader
        title={lead.customerName}
        detail={`${product?.name ?? "No trip recorded"}${mountain ? ` · ${mountain.name}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Link to={lead.conversationId ? `/operator/leads/${lead.id}` : "/operator/leads"}>
              <Button variant="quiet">Back to messages</Button>
            </Link>
            {lead.conversationId && (
              <Link to={`/operator/leads/${lead.id}`}>
                <Button>Open conversation</Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Stage</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LEAD_PIPELINE.map((s) => (
                <button
                  key={s}
                  onClick={async () => {
                    await backend.setLeadStatus(session, lead.id, s);
                    refresh();
                  }}
                  className={`rounded-pill px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                    lead.status === s ? "bg-azure text-canvas" : "hairline bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {lead.status === "lost" && lead.lostReason && (
              <div className="mt-3">
                <Notice>{lead.lostReason}</Notice>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Notes</h2>
            <div className="mt-2.5 space-y-2">
              {notes.length === 0 && <p className="text-[12.5px] text-muted">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="rounded-tile bg-canvas px-3 py-2">
                  <div className="text-[11px] font-medium text-muted">
                    {n.authorName} · {timeAgo(n.createdAt, NOW)}
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink">{n.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={inputClass}
                placeholder="Add a note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                onClick={async () => {
                  await backend.addLeadNote(session, lead.id, note);
                  setNote("");
                  refresh();
                }}
                disabled={!note.trim()}
              >
                Add
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">History</h2>
            <ol className="mt-3 space-y-2.5">
              {timeline
                .filter((t) => t.at !== null)
                .map((t) => (
                  <li key={t.label} className="flex items-baseline gap-3">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-azure" aria-hidden />
                    <span className="text-[12.5px] font-medium text-ink">{t.label}</span>
                    <span className="ml-auto text-[11.5px] text-muted">
                      {formatDay(t.at!.slice(0, 10))}
                    </span>
                  </li>
                ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Booking</h2>
            {!booking ? (
              <p className="mt-2 text-[12.5px] text-muted">
                No booking recorded. Move this lead to <em>Booked</em> when the customer commits.
              </p>
            ) : (
              <>
                <div className="tnum mt-2 text-[20px] font-semibold text-ink">
                  {booking.value.status === "reported" ? (
                    formatMoney(booking.value.cents, booking.currency)
                  ) : (
                    <span className="text-[13px] font-normal text-muted">
                      {booking.value.status === "pending"
                        ? OPERATOR_NOTICES.BOOKING_VALUE_PENDING
                        : OPERATOR_NOTICES.BOOKING_VALUE_UNKNOWN}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Pill tone="azure">Attributed to Icefall</Pill>
                </div>
                <div className="mt-2 text-[11.5px] text-muted">
                  Booked {formatDay(booking.bookedAt.slice(0, 10))}
                </div>
                {booking.value.status !== "reported" && (
                  <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
                    A booking can be recorded without a value. Icefall will not put a number on it — this
                    booking is left out of your estimated total until you tell us what it was worth.
                  </p>
                )}
              </>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Assigned to</h2>
            <select
              className={`${inputClass} mt-2`}
              value={lead.ownerId ?? ""}
              onChange={async (e) => {
                await backend.assignLead(session, lead.id, e.target.value || null);
                refresh();
              }}
            >
              <option value="">Nobody</option>
              {team
                .filter((t) => t.status === "active")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
            </select>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Where it came from</h2>
            <dl className="mt-2.5 space-y-2 text-[12.5px]">
              <div>
                <dt className="text-[11px] tracking-wide text-faint uppercase">Source page</dt>
                <dd className="mt-0.5 text-ink">{lead.source ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-faint uppercase">First contact</dt>
                <dd className="mt-0.5 text-ink">{formatDay(lead.createdAt.slice(0, 10))}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
