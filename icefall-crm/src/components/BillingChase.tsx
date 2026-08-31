import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { Button, Card, Pill, SectionLabel } from "@/components/ui";
import { listCompanies, listInvoices, listPlacements, notifyUnpaidInvoices, raiseExpiryTasks } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, Invoice, PlacementView } from "@/data/types";
import { formatDay } from "@/lib/utils";

/**
 * Who owes, and whose slot deal is ending — CR-18: "Notify sales team who
 * needs to pay invoice or whos coming to an end of a slot deal."
 *
 * The list is DERIVED at read time (an invoice is owing because its status and
 * due date say so now, never because a flag was set once), and the NOTIFY
 * button turns each line into a real task on the sales desk — which, with the
 * sidebar's task badge, is the only notification that exists. Both raises are
 * idempotent: unpaid-invoice tasks carry a dedupe key naming the invoice, and
 * the placement sweep is the existing `raise_expiry_tasks`, which finds its own
 * earlier task rather than duplicating it. Press it twice, get one task each.
 */
export function BillingChase() {
  const [invoices, setInvoices] = useState<Result<Invoice[]>>(loading);
  const [placements, setPlacements] = useState<Result<PlacementView[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void listInvoices().then(setInvoices);
    void listPlacements().then(setPlacements);
    void listCompanies().then(setCompanies);
  }, []);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (companies.state === "ok") for (const c of companies.value) m.set(c.id, c.name);
    return (id: string) => m.get(id) ?? "Unknown company";
  }, [companies]);

  const today = new Date().toISOString().slice(0, 10);
  const owing =
    invoices.state === "ok"
      ? invoices.value.filter(
          (i) => i.status === "overdue" || (i.status === "sent" && i.due_on !== null && i.due_on < today),
        )
      : [];
  const ending =
    placements.state === "ok"
      ? placements.value.filter(
          (p) => p.status === "active" && (p.needs_review || (p.days_remaining >= 0 && p.days_remaining <= 30)),
        )
      : [];

  const notify = async () => {
    setBusy(true);
    setNote(null);
    const a = await notifyUnpaidInvoices(
      owing.map((i) => ({
        id: i.id,
        title: `${i.number} unpaid — ${nameOf(i.company_id)}`,
        detail: `Due ${i.due_on ? formatDay(i.due_on) : "date not set"}. Chase the payment or record it if it arrived.`,
        company_id: i.company_id,
        due_on: i.due_on,
      })),
    );
    const b = await raiseExpiryTasks();
    setBusy(false);
    if (a.state === "ok" && b.state === "ok") {
      setNote(
        `Raised ${a.value} invoice task${a.value === 1 ? "" : "s"} for the sales desk (already-raised ones were found, not duplicated) and swept placements for expiries. The desk sees them under Tasks.`,
      );
    } else {
      const why = [a, b]
        .filter((r) => r.state !== "ok")
        .map((r) => (r.state === "error" || r.state === "unavailable" ? r.reason : ""))
        .join(" · ");
      setNote(`That did not all work: ${why}`);
    }
  };

  // Nothing to chase and nothing ending = nothing to draw — but only when the
  // lists were actually READ. A failed read hiding this panel would show a desk
  // with nothing to chase precisely when nobody can know that.
  const unreadable =
    invoices.state === "error" || invoices.state === "unavailable" ||
    placements.state === "error" || placements.state === "unavailable";
  if (unreadable)
    return (
      <Card className="mb-4">
        <SectionLabel>Needs chasing</SectionLabel>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Cannot say who owes or whose deal is ending —{" "}
          {invoices.state === "error" || invoices.state === "unavailable"
            ? invoices.reason
            : placements.state === "error" || placements.state === "unavailable"
              ? placements.reason
              : ""}
        </p>
      </Card>
    );
  if (invoices.state === "loading" || placements.state === "loading") return null;
  if (owing.length === 0 && ending.length === 0) return null;

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Needs chasing</SectionLabel>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Derived from due dates and terms as of now — nothing here was flagged by hand.
          </p>
        </div>
        <Button
          className="!bg-accent text-white hover:opacity-90"
          disabled={busy}
          onClick={() => void notify()}
        >
          <BellRing size={14} strokeWidth={2.25} /> Raise tasks for the sales desk
        </Button>
      </div>

      {note && <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">{note}</p>}

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
            Owes an invoice ({owing.length})
          </p>
          {owing.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] text-faint">Nobody — every sent invoice is inside its due date.</p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {owing.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-tile bg-[oklch(0.977_0.016_22)] px-3 py-2">
                  <span className="min-w-0 truncate text-[12.5px] font-medium text-ink">
                    <span className="tnum">{i.number}</span> · {nameOf(i.company_id)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tnum text-[12.5px] font-semibold text-ink">
                      €{(i.amount_cents / 100).toLocaleString("en-GB")}
                    </span>
                    <Pill tone="red">{i.due_on ? `due ${formatDay(i.due_on)}` : "no due date"}</Pill>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
            Slot deal ending ({ending.length})
          </p>
          {ending.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] text-faint">No active placement ends inside 30 days.</p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {ending.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-tile bg-butter/60 px-3 py-2">
                  <span className="min-w-0 truncate text-[12.5px] font-medium text-ink">
                    {nameOf(p.company_id)} · {p.destination_id} slot {p.slot_position}
                  </span>
                  <Pill tone="amber">
                    {p.needs_review ? "term has run out" : `${p.days_remaining}d left`}
                  </Pill>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
