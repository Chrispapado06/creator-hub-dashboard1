import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, FileText, Landmark, Wallet } from "lucide-react";
import { Avatar, Card, PageHead, Pill, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve, Unavailable } from "@/components/states";
import { listCompanies, listInvoices, listPayments } from "@/data/queries";
import { BillingChase } from "@/components/BillingChase";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { Company, Invoice, InvoiceStatus, Payment } from "@/data/types";
import { daysUntil, formatDay } from "@/lib/utils";

/**
 * Invoices & Payments — what ICEFALL has billed, and what has actually arrived.
 *
 * THERE IS NO PAYMENT PROCESSOR ANYWHERE IN ICEFALL. Every row in the payments
 * table was typed in by a member of finance staff after reading a bank
 * confirmation. No gateway confirmed anything, no card is charged, and an
 * invoice marked "paid" means a person looked at a bank statement and said so.
 * The page states that in words rather than letting a tidy ledger layout imply a
 * settlement system that does not exist — because the difference matters the
 * moment somebody asks why a figure here disagrees with the bank.
 *
 * OUTSTANDING IS DERIVED, NEVER STORED: invoices issued, minus the payments
 * recorded against them, computed at read time. No column holds it, so it cannot
 * drift away from the two ledgers it is made of. And a company with no invoices
 * reads "no invoices issued", not €0. A zero balance says ICEFALL billed them
 * and they settled; no invoice says ICEFALL never billed them at all. Finance
 * chases the first and has nothing to chase in the second, so the two must never
 * render the same way.
 *
 * A TOTAL IS ONLY DRAWN WHEN EVERY ROW SHARES A CURRENCY. ICEFALL stores no
 * exchange rate, so adding euros to dollars would produce a figure that is
 * precise and meaningless. Where the rows disagree the tile says so instead.
 */

const KIND_LABEL: Record<Invoice["kind"], string> = {
  placement: "Placement fee",
  referral: "Referral fee",
  subscription: "Subscription",
  other: "Other",
};

const METHOD_LABEL: Record<Payment["method"], string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

/**
 * The four chip states, carrying exactly the four tones this screen used before.
 *
 * A literal map, not an assembled class name: Tailwind scans source text. Paid
 * is settled; overdue and refunded are the two that still want somebody's
 * attention; a void invoice was withdrawn; a draft or a sent invoice is simply
 * where it is and is not a problem yet.
 */
const statusState = (s: InvoiceStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "paid" ? "ok" : s === "overdue" || s === "refunded" ? "pending" : s === "void" ? "bad" : "neutral";

/** Billed. A draft was never sent and a void was withdrawn — neither is owed. */
const isIssued = (i: Invoice) => i.status !== "draft" && i.status !== "void";

/** Still expected to settle, and therefore still capable of running late. */
const isOpen = (i: Invoice) => i.status === "sent" || i.status === "overdue";

type Amount = { cents: number; currency: string };

/**
 * A sum, or the reason there cannot be one.
 *
 * `none` is not zero. An empty set of invoices has no total; it has no invoices,
 * which is a different sentence and a different decision for whoever reads it.
 */
type Total =
  | { kind: "sum"; cents: number; currency: string }
  | { kind: "none" }
  | { kind: "mixed"; currencies: string[] };

function total(rows: Amount[]): Total {
  if (rows.length === 0) return { kind: "none" };
  const currencies = Array.from(new Set(rows.map((r) => r.currency)));
  if (currencies.length > 1) return { kind: "mixed", currencies };
  return { kind: "sum", cents: rows.reduce((n, r) => n + r.cents, 0), currency: currencies[0] };
}

const amount = (x: { amount_cents: number; currency: string }): Amount => ({
  cents: x.amount_cents,
  currency: x.currency,
});

/** A payment, as a negative amount — this is how "minus payments applied" is done. */
const applied = (p: Payment): Amount => ({ cents: -p.amount_cents, currency: p.currency });

/**
 * The compact form, but only for the three currencies it knows.
 *
 * `formatCentsShort` has no symbol fallback: anything that is not EUR or GBP is
 * drawn with a dollar sign, so a Swiss-franc balance would arrive on the tile
 * labelled as dollars. That is a wrong figure rather than an untidy one, so
 * every other currency is rendered in full, where `formatCents` prints the code.
 */
const short = (cents: number, currency: string): string | null =>
  currency === "EUR" || currency === "GBP" || currency === "USD"
    ? formatCentsShort(cents, currency)
    : formatCents(cents, currency);

/** Both reads, or the first reason one of them has no value. */
function pair<A, B>(a: Result<A>, b: Result<B>): Result<[A, B]> {
  if (a.state !== "ok") return a;
  if (b.state !== "ok") return b;
  return { state: "ok", value: [a.value, b.value] };
}

/** All three. A balance drawn from a partial view would be a wrong balance. */
function trio<A, B, C>(a: Result<A>, b: Result<B>, c: Result<C>): Result<[A, B, C]> {
  if (a.state !== "ok") return a;
  if (b.state !== "ok") return b;
  if (c.state !== "ok") return c;
  return { state: "ok", value: [a.value, b.value, c.value] };
}

/**
 * Turn a read into the two props `Stat` needs.
 *
 * Every path that ends without a figure ends with a sentence explaining which of
 * the three reasons applies: still reading, could not be read, or genuinely
 * nothing to total.
 */
function tile<T>(r: Result<T>, compute: (value: T) => Total, none: string): { value: string | null; reason: string } {
  if (r.state === "loading") return { value: null, reason: "Still reading the ledger." };
  if (r.state !== "ok") return { value: null, reason: r.reason };
  const t = compute(r.value);
  if (t.kind === "sum") return { value: short(t.cents, t.currency), reason: none };
  if (t.kind === "none") return { value: null, reason: none };
  return {
    value: null,
    reason: `These rows are recorded in ${t.currencies.join(", ")}. ICEFALL stores no exchange rate, so they cannot honestly be added into one figure.`,
  };
}

/** The heading above a table. Heavier than a label, because the mockup's are. */
function Heading({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-bold tracking-[-0.015em] text-ink">{children}</h2>;
}

/** A figure inside a table cell, or the phrase that replaces it. */
function Money({ t, none }: { t: Total; none: string }) {
  if (t.kind === "sum")
    return (
      <span className="text-[14.5px] font-bold tracking-[-0.015em] text-ink">
        {formatCents(t.cents, t.currency)}
      </span>
    );
  if (t.kind === "none") return <span className="text-[12.5px] text-faint">{none}</span>;
  return <span className="text-[12.5px] text-faint">Mixed currencies</span>;
}

/**
 * A company_id resolved to a name — or an honest account of why it was not.
 *
 * The avatar is drawn either way so the column keeps its rhythm, but with no
 * name to take initials from it falls back to the neutral placeholder rather
 * than inventing letters for a company nobody could look up.
 */
function CompanyCell({ id, companies }: { id: string; companies: Result<Company[]> }) {
  const name = companies.state === "ok" ? (companies.value.find((c) => c.id === id)?.name ?? null) : null;
  const absence =
    companies.state === "loading"
      ? "Reading…"
      : companies.state !== "ok"
        ? "Name unavailable"
        : "Unknown company";
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name ?? ""} size={34} />
      {name === null ? (
        <span className="text-faint">{absence}</span>
      ) : (
        <Link to={`/admin/companies/${id}`} className="font-medium text-ink hover:text-accent">
          {name}
        </Link>
      )}
    </div>
  );
}

/** The invoice a payment was entered against. */
function InvoiceCell({ id, invoices }: { id: string; invoices: Result<Invoice[]> }) {
  if (invoices.state === "loading") return <span className="text-faint">Reading…</span>;
  if (invoices.state !== "ok") return <span className="text-faint">Unavailable</span>;
  const number = invoices.value.find((i) => i.id === id)?.number;
  return number ? (
    <span className="font-semibold text-ink">{number}</span>
  ) : (
    <span className="text-faint">Unknown invoice</span>
  );
}

export default function Billing() {
  const [invoices, setInvoices] = useState<Result<Invoice[]>>(loading);
  const [payments, setPayments] = useState<Result<Payment[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);

  useEffect(() => {
    void listInvoices().then(setInvoices);
    void listPayments().then(setPayments);
    void listCompanies().then(setCompanies);
  }, []);

  const ledger = pair(invoices, payments);

  const invoiced = tile(
    invoices,
    (rows) => total(rows.filter(isIssued).map(amount)),
    "No invoices have been issued yet. Nothing has been billed — which is not the same as nothing being owed.",
  );

  const collected = tile(
    payments,
    (rows) => total(rows.map(amount)),
    "No payment has been recorded yet. Finance enters each one by hand once a bank confirmation arrives.",
  );

  // Issued minus applied. Nothing stores this, and nothing should: the moment a
  // balance is written down it starts disagreeing with the rows it came from.
  const outstanding = tile(
    ledger,
    ([inv, pay]) => {
      const issued = inv.filter(isIssued);
      const ids = new Set(issued.map((i) => i.id));
      return total([...issued.map(amount), ...pay.filter((p) => ids.has(p.invoice_id)).map(applied)]);
    },
    "No invoices have been issued, so there is no balance outstanding.",
  );

  const pastDue = tile(
    ledger,
    ([inv, pay]) => {
      const late = inv.filter((i) => isOpen(i) && daysUntil(i.due_on) < 0);
      const ids = new Set(late.map((i) => i.id));
      return total([...late.map(amount), ...pay.filter((p) => ids.has(p.invoice_id)).map(applied)]);
    },
    "No issued invoice has passed its due date.",
  );

  // The "excluded N" idiom: a total that silently skips rows looks precise while
  // being wrong, so the counts it left out travel with it.
  const counts =
    invoices.state === "ok"
      ? {
          issued: invoices.value.filter(isIssued).length,
          drafts: invoices.value.filter((i) => i.status === "draft").length,
          voided: invoices.value.filter((i) => i.status === "void").length,
          late: invoices.value.filter((i) => isOpen(i) && daysUntil(i.due_on) < 0).length,
        }
      : null;

  const excluded = counts
    ? [
        counts.drafts > 0 ? `${counts.drafts} draft${counts.drafts === 1 ? "" : "s"} never sent` : null,
        counts.voided > 0 ? `${counts.voided} withdrawn as void` : null,
      ]
        .filter((s): s is string => s !== null)
        .join(" and ")
    : "";

  const paymentCount = payments.state === "ok" ? payments.value.length : null;

  return (
    <>
      <PageHead
        title="Invoices & Payments"
        subtitle="What ICEFALL has billed its operator companies, and what has been received against it. Placement fees and referral fees are billed separately because they are collected differently."
      />

      <BillingChase />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          tone="butter"
          label="Invoiced"
          value={invoiced.value}
          reason={invoiced.reason}
          icon={<FileText size={17} strokeWidth={1.8} />}
          hint={
            counts
              ? `${counts.issued} issued${excluded ? `, excluding ${excluded}` : ""}.`
              : undefined
          }
        />
        <Stat
          tone="sky"
          label="Collected"
          value={collected.value}
          reason={collected.reason}
          icon={<Banknote size={17} strokeWidth={1.8} />}
          hint={
            paymentCount === null
              ? undefined
              : `${paymentCount} payment${paymentCount === 1 ? "" : "s"} entered by hand from bank confirmations.`
          }
        />
        <Stat
          tone="lilac"
          label="Outstanding"
          value={outstanding.value}
          reason={outstanding.reason}
          icon={<Wallet size={17} strokeWidth={1.8} />}
          hint="Issued invoices minus the payments recorded against them, worked out as this page loads. No table holds this figure."
        />
        <Stat
          tone="mint"
          label="Past due"
          value={pastDue.value}
          reason={pastDue.reason}
          icon={<AlertTriangle size={17} strokeWidth={1.8} />}
          hint={
            counts
              ? `${counts.late} issued invoice${counts.late === 1 ? "" : "s"} past the due date and not settled.`
              : undefined
          }
        />
      </div>

      <Card className="mt-3 flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-raised text-muted ring-1 ring-line">
          <Landmark size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">Payments here are recorded by hand</p>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            ICEFALL has no payment processor. Every payment below was entered by a member of finance staff
            from a bank confirmation, so a row on this page is somebody&rsquo;s reading of a bank statement
            and not a gateway&rsquo;s confirmation. An invoice marked paid with no payment recorded against
            it is flagged rather than assumed settled.
          </p>
        </div>
      </Card>

      <div className="mt-7">
        <Heading>Invoices</Heading>
        <div className="mt-2.5">
          <Resolve
            result={invoices}
            what="invoices"
            isEmpty={(v) => v.length === 0}
            empty="No invoice has been raised. One is created when a placement term is agreed or a referral fee falls due."
          >
            {(rows) => (
              <TableCard>
                <table className="w-full min-w-[60rem] text-[13px]">
                  <thead>
                    <tr className="border-b border-line-soft text-left">
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Number</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Company</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">For</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Amount</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Issued</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Due</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => {
                      // Computed at read time, the way `placement_status` computes
                      // expiry: the due date is a fact already in the row, and
                      // nothing writes the lateness back.
                      const days = daysUntil(i.due_on);
                      const late = isOpen(i) && days < 0;
                      const unmatched =
                        i.status === "paid" &&
                        payments.state === "ok" &&
                        !payments.value.some((p) => p.invoice_id === i.id);
                      return (
                        <tr
                          key={i.id}
                          className={
                            late
                              ? "border-b border-line-soft bg-[oklch(0.983_0.018_84)] last:border-0 hover:bg-raised"
                              : "border-b border-line-soft last:border-0 hover:bg-raised"
                          }
                        >
                          <td className="tnum whitespace-nowrap px-5 py-3.5 font-semibold text-ink">{i.number}</td>
                          <td className="px-5 py-3.5">
                            <CompanyCell id={i.company_id} companies={companies} />
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            <Pill>{KIND_LABEL[i.kind]}</Pill>
                          </td>
                          <td className="tnum whitespace-nowrap px-5 py-3.5 text-[14.5px] font-bold tracking-[-0.015em] text-ink">
                            {formatCents(i.amount_cents, i.currency)}
                          </td>
                          <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                            {formatDay(i.issued_on) ?? <span className="text-faint">Not recorded</span>}
                          </td>
                          <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                            {formatDay(i.due_on) ?? <span className="text-faint">Not recorded</span>}
                            {late && (
                              <span className="mt-0.5 block text-[11.5px] font-medium text-warn">
                                {-days} day{days === -1 ? "" : "s"} past due
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusChip state={statusState(i.status)} label={i.status} />
                            {unmatched && (
                              <span className="mt-1.5 block max-w-[15rem] text-[11.5px] leading-snug text-warn">
                                Marked paid, but no payment has been recorded against it.
                              </span>
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

      <div className="mt-7">
        <Heading>Payments recorded</Heading>
        <div className="mt-2.5">
          <Resolve
            result={payments}
            what="recorded payments"
            isEmpty={(v) => v.length === 0}
            empty="Nothing has been entered. Payments do not appear on their own — a member of finance staff records each one after a bank confirmation."
          >
            {(rows) => (
              <TableCard>
                <table className="w-full min-w-[58rem] text-[13px]">
                  <thead>
                    <tr className="border-b border-line-soft text-left">
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Received</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Invoice</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Company</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Amount</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Told to us as</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                        <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                          {formatDay(p.received_on) ?? <span className="text-faint">Not recorded</span>}
                        </td>
                        <td className="tnum whitespace-nowrap px-5 py-3.5">
                          <InvoiceCell id={p.invoice_id} invoices={invoices} />
                        </td>
                        <td className="px-5 py-3.5">
                          <CompanyCell id={p.company_id} companies={companies} />
                        </td>
                        <td className="tnum whitespace-nowrap px-5 py-3.5 text-[14.5px] font-bold tracking-[-0.015em] text-ink">
                          {formatCents(p.amount_cents, p.currency)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <Pill>{METHOD_LABEL[p.method]}</Pill>
                        </td>
                        <td className="px-5 py-3.5 text-muted">
                          {p.reference ?? <span className="text-faint">None given</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            )}
          </Resolve>
        </div>
      </div>

      <div className="mt-7">
        <Heading>Balance by company</Heading>
        <div className="mt-2.5">
          <Resolve
            result={trio(companies, invoices, payments)}
            what="company balances"
            isEmpty={(v) => v[0].length === 0}
            empty="No companies are on file, so there is nobody to bill."
          >
            {([cs, inv, pay]) => (
              <TableCard>
                <table className="w-full min-w-[46rem] text-[13px]">
                  <thead>
                    <tr className="border-b border-line-soft text-left">
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Company</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Invoiced</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Payments recorded</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-[12px] font-semibold text-faint">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cs.map((c) => {
                      const issued = inv.filter((i) => i.company_id === c.id && isIssued(i));
                      const ids = new Set(issued.map((i) => i.id));
                      const against = pay.filter((p) => ids.has(p.invoice_id));
                      return (
                        <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <Avatar name={c.name} size={34} />
                              <Link
                                to={`/admin/companies/${c.id}`}
                                className="font-medium text-ink hover:text-accent"
                              >
                                {c.name}
                              </Link>
                            </div>
                          </td>
                          {issued.length === 0 ? (
                            // Never a zero balance. Nothing was billed, so nothing
                            // is owed and nothing has been collected — three empty
                            // cells reading "€0" would send finance chasing a
                            // company ICEFALL has never invoiced.
                            <td className="px-5 py-3.5 text-[12.5px] text-faint" colSpan={3}>
                              No invoices issued
                            </td>
                          ) : (
                            <>
                              <td className="tnum whitespace-nowrap px-5 py-3.5">
                                <Money t={total(issued.map(amount))} none="Nothing issued" />
                              </td>
                              <td className="tnum whitespace-nowrap px-5 py-3.5">
                                <Money t={total(against.map(amount))} none="No payment recorded" />
                              </td>
                              <td className="tnum whitespace-nowrap px-5 py-3.5">
                                <Money
                                  t={total([...issued.map(amount), ...against.map(applied)])}
                                  none="Nothing issued"
                                />
                              </td>
                            </>
                          )}
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
            "No collection rate, no average days-to-payment and no change against a previous period are shown. " +
            "Each would need either a settlement timestamp from a payment provider or an earlier period stored to " +
            "compare against, and ICEFALL has neither — the dates on this page are the days a person entered a row, " +
            "not the days a processor settled one. Refunds have no table of their own yet, so a refunded invoice " +
            "still carries the payment recorded against it: the status says what happened and the arithmetic is left " +
            "alone rather than adjusted by a figure nobody stored."
          }
        />
      </div>
    </>
  );
}
