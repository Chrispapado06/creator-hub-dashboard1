import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, FileText, Landmark, Wallet } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Resolve, Unavailable } from "@/components/states";
import { listCompanies, listInvoices, listPayments } from "@/data/queries";
import { BillingChase } from "@/components/BillingChase";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { Company, Invoice, InvoiceStatus, Payment } from "@/data/types";
import { cn, daysUntil, formatDay, initials } from "@/lib/utils";

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

/**
 * THE PAGE HEADER, INLINE AND NOT `PageHead` — see the note in Finance.tsx.
 * The theme's title is `text-3xl tracking-tight`: 30px at weight 400, measured
 * on localhost:3100. `PageHead` draws 31px extrabold and takes no className, so
 * it cannot be corrected from a screen. One edit to `PageHead` would carry all
 * 32 screens; this pass may not make it.
 */
function Head({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">{title}</h1>
        {subtitle && <p className="max-w-3xl text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The theme's stat tile — icon square, label, figure, caption.
 *
 * THE HONESTY CONTRACT IS UNCHANGED: `value === null` prints the REASON, in
 * prose. Never a dash, never a zero, never "N/A". A dashboard is read as fact
 * by default, so a tile that cannot say what it means has to say why.
 *
 * NOTE WHAT NO LONGER HAPPENS TO THE COLOUR. The tile this replaces went
 * butter / sky / lilac / mint when it had a figure and dropped to plain white
 * when it did not, so the pastel itself signalled "there is a number here".
 * The theme has no pastels — all four rebind to the same neutral in index.css —
 * so that signal is gone and the DISTINCTION IS CARRIED BY THE TYPE INSTEAD: a
 * figure is 30px tabular ink, a reason is 14px muted prose. They are not
 * mistakable for one another at a glance, which was the point of the colour.
 */
function Tile({
  label,
  value,
  reason,
  hint,
  icon,
}: {
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
            {icon}
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{reason ?? "Not recorded"}</p>
        ) : (
          <>
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
            {hint && <p className="text-muted-foreground text-sm leading-relaxed">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

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
 *
 * The classes are the theme's own `statusMeta`, verbatim from
 * dashboard/users/_components/data.tsx. The chip they replace drew a filled
 * glyph and a chevron; the chevron was `aria-hidden` and inert by design
 * ("nothing in this build can change a status from a list row yet"), so it is
 * gone and no capability goes with it — dot, word and meaning all stay.
 */
const STATUS_TONE: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  pending: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-ui-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

const statusState = (s: InvoiceStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "paid" ? "ok" : s === "overdue" || s === "refunded" ? "pending" : s === "void" ? "bad" : "neutral";

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const tone = STATUS_TONE[statusState(status)];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", tone.badge)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {status}
    </Badge>
  );
}

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
 * Turn a read into the two props `Tile` needs.
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

/** A figure inside a table cell, or the phrase that replaces it. */
function Money({ t, none }: { t: Total; none: string }) {
  if (t.kind === "sum")
    return <span className="font-medium text-sm tabular-nums">{formatCents(t.cents, t.currency)}</span>;
  if (t.kind === "none") return <span className="text-muted-foreground text-sm">{none}</span>;
  return <span className="text-muted-foreground text-sm">Mixed currencies</span>;
}

/**
 * A company_id resolved to a name — or an honest account of why it was not.
 *
 * The avatar is drawn either way so the column keeps its rhythm, but with no
 * name to take initials from it falls back to the neutral placeholder rather
 * than inventing letters for a company nobody could look up.
 *
 * `Avatar` here is the theme's own primitive (components/ui/avatar.tsx):
 * size-8, `bg-muted text-muted-foreground` fallback with a hairline `after:`
 * ring — the same mark the theme draws beside a person in its users table.
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
      <Avatar>
        <AvatarFallback className="text-xs">{name ? initials(name) : "··"}</AvatarFallback>
      </Avatar>
      {name === null ? (
        <span className="text-muted-foreground text-sm">{absence}</span>
      ) : (
        <Link to={`/admin/companies/${id}`} className="font-medium text-sm hover:underline">
          {name}
        </Link>
      )}
    </div>
  );
}

/** The invoice a payment was entered against. */
function InvoiceCell({ id, invoices }: { id: string; invoices: Result<Invoice[]> }) {
  if (invoices.state === "loading") return <span className="text-muted-foreground text-sm">Reading…</span>;
  if (invoices.state !== "ok") return <span className="text-muted-foreground text-sm">Unavailable</span>;
  const number = invoices.value.find((i) => i.id === id)?.number;
  return number ? (
    <span className="font-medium text-sm tabular-nums">{number}</span>
  ) : (
    <span className="text-muted-foreground text-sm">Unknown invoice</span>
  );
}

/** The theme's in-card table chrome, written once because three tables use it. */
const TABLE_CLS = "**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4 **:data-[slot='table-cell']:py-4";
const THEAD_CLS =
  "border-t **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm";
const TBODY_CLS = "**:data-[slot='table-row']:border-border/50";

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
    <div className="flex flex-col gap-4 md:gap-6">
      <Head
        title="Invoices & Payments"
        subtitle="What ICEFALL has billed its operator companies, and what has been received against it. Placement fees and referral fees are billed separately because they are collected differently."
      />

      {/* CR-18's chase list — who owes and whose slot deal is ending, with the
          NOTIFY button that raises real tasks. Untouched by the re-skin. */}
      <BillingChase />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Invoiced"
          value={invoiced.value}
          reason={invoiced.reason}
          icon={<FileText className="size-4" />}
          hint={counts ? `${counts.issued} issued${excluded ? `, excluding ${excluded}` : ""}.` : undefined}
        />
        <Tile
          label="Collected"
          value={collected.value}
          reason={collected.reason}
          icon={<Banknote className="size-4" />}
          hint={
            paymentCount === null
              ? undefined
              : `${paymentCount} payment${paymentCount === 1 ? "" : "s"} entered by hand from bank confirmations.`
          }
        />
        <Tile
          label="Outstanding"
          value={outstanding.value}
          reason={outstanding.reason}
          icon={<Wallet className="size-4" />}
          hint="Issued invoices minus the payments recorded against them, worked out as this page loads. No table holds this figure."
        />
        <Tile
          label="Past due"
          value={pastDue.value}
          reason={pastDue.reason}
          icon={<AlertTriangle className="size-4" />}
          hint={
            counts
              ? `${counts.late} issued invoice${counts.late === 1 ? "" : "s"} past the due date and not settled.`
              : undefined
          }
        />
      </div>

      {/* The theme's own inline notice shape (finance/_components/
          finance-notification.tsx): an outlined `Item` with an icon medium, a
          title and a description. The sentence is unchanged. */}
      <Item variant="outline" className="items-start rounded-xl">
        <ItemMedia variant="icon" className="mt-0.5">
          <Landmark />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Payments here are recorded by hand</ItemTitle>
          <ItemDescription className="max-w-3xl text-wrap leading-relaxed">
            ICEFALL has no payment processor. Every payment below was entered by a member of finance staff
            from a bank confirmation, so a row on this page is somebody&rsquo;s reading of a bank statement
            and not a gateway&rsquo;s confirmation. An invoice marked paid with no payment recorded against
            it is flagged rather than assumed settled.
          </ItemDescription>
        </ItemContent>
      </Item>

      <Resolve
        result={invoices}
        what="invoices"
        isEmpty={(v) => v.length === 0}
        empty="No invoice has been raised. One is created when a placement term is agreed or a referral fee falls due."
      >
        {(rows) => (
          <Card>
            <CardHeader>
              <CardTitle className="leading-none">Invoices</CardTitle>
              <CardDescription>Everything billed, and how far past its due date it is.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table className={TABLE_CLS}>
                <TableHeader className={THEAD_CLS}>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>For</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={TBODY_CLS}>
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
                      // The late-row tint stays — it is the only thing that
                      // finds an overdue invoice by scanning the column rather
                      // than reading every Due cell. Moved off the hardcoded
                      // oklch it used to carry and onto the theme's own amber
                      // register (`bg-amber-500/…`, the tone the theme uses for
                      // "needs attention" on its own status badges).
                      <TableRow key={i.id} className={cn(late && "bg-amber-500/5")}>
                        <TableCell className="font-medium text-sm tabular-nums">{i.number}</TableCell>
                        <TableCell>
                          <CompanyCell id={i.company_id} companies={companies} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full px-2.5">
                            {KIND_LABEL[i.kind]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm tabular-nums">
                          {formatCents(i.amount_cents, i.currency)}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatDay(i.issued_on) ?? <span className="text-muted-foreground">Not recorded</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatDay(i.due_on) ?? <span className="text-muted-foreground">Not recorded</span>}
                          {late && (
                            <span className="mt-0.5 block font-medium text-amber-600 text-xs dark:text-amber-400">
                              {-days} day{days === -1 ? "" : "s"} past due
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={i.status} />
                          {unmatched && (
                            <span className="mt-1.5 block max-w-60 text-wrap text-amber-600 text-xs leading-snug dark:text-amber-400">
                              Marked paid, but no payment has been recorded against it.
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Resolve>

      <Resolve
        result={payments}
        what="recorded payments"
        isEmpty={(v) => v.length === 0}
        empty="Nothing has been entered. Payments do not appear on their own — a member of finance staff records each one after a bank confirmation."
      >
        {(rows) => (
          <Card>
            <CardHeader>
              <CardTitle className="leading-none">Payments recorded</CardTitle>
              <CardDescription>
                Each line is a person&rsquo;s reading of a bank confirmation, not a gateway&rsquo;s.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table className={TABLE_CLS}>
                <TableHeader className={THEAD_CLS}>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Told to us as</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={TBODY_CLS}>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDay(p.received_on) ?? <span className="text-muted-foreground">Not recorded</span>}
                      </TableCell>
                      <TableCell>
                        <InvoiceCell id={p.invoice_id} invoices={invoices} />
                      </TableCell>
                      <TableCell>
                        <CompanyCell id={p.company_id} companies={companies} />
                      </TableCell>
                      <TableCell className="font-medium text-sm tabular-nums">
                        {formatCents(p.amount_cents, p.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-full px-2.5">
                          {METHOD_LABEL[p.method]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.reference ?? <span className="text-muted-foreground">None given</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Resolve>

      <Resolve
        result={trio(companies, invoices, payments)}
        what="company balances"
        isEmpty={(v) => v[0].length === 0}
        empty="No companies are on file, so there is nobody to bill."
      >
        {([cs, inv, pay]) => (
          <Card>
            <CardHeader>
              <CardTitle className="leading-none">Balance by company</CardTitle>
              <CardDescription>
                Issued minus applied, per operator. Nothing here is stored — it is worked out as the page
                loads.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table className={TABLE_CLS}>
                <TableHeader className={THEAD_CLS}>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Invoiced</TableHead>
                    <TableHead>Payments recorded</TableHead>
                    <TableHead>Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={TBODY_CLS}>
                  {cs.map((c) => {
                    const issued = inv.filter((i) => i.company_id === c.id && isIssued(i));
                    const ids = new Set(issued.map((i) => i.id));
                    const against = pay.filter((p) => ids.has(p.invoice_id));
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
                            </Avatar>
                            <Link
                              to={`/admin/companies/${c.id}`}
                              className="font-medium text-sm hover:underline"
                            >
                              {c.name}
                            </Link>
                          </div>
                        </TableCell>
                        {issued.length === 0 ? (
                          // Never a zero balance. Nothing was billed, so nothing
                          // is owed and nothing has been collected — three empty
                          // cells reading "€0" would send finance chasing a
                          // company ICEFALL has never invoiced.
                          <TableCell className="text-muted-foreground text-sm" colSpan={3}>
                            No invoices issued
                          </TableCell>
                        ) : (
                          <>
                            <TableCell>
                              <Money t={total(issued.map(amount))} none="Nothing issued" />
                            </TableCell>
                            <TableCell>
                              <Money t={total(against.map(amount))} none="No payment recorded" />
                            </TableCell>
                            <TableCell>
                              <Money
                                t={total([...issued.map(amount), ...against.map(applied)])}
                                none="Nothing issued"
                              />
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Resolve>

      {/* The refusal, verbatim. Deliberately NOT restyled into the theme's
          Empty component: "No data" would erase the difference between a
          figure nobody measured and a measured zero. */}
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
  );
}
