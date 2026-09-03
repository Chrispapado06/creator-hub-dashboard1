import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  Compass,
  Download,
  Info,
  Mountain as MountainIcon,
  Route,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Resolve } from "@/components/states";
import { getBookingAgreement, listAuditEvents, listBookingsDetailed, type BookingDetailed } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { AuditEvent, BookingAgreement } from "@/data/types";
import { cn, formatDay, formatMoment } from "@/lib/utils";
import { BOOKINGS_MOCKUP, type MockBookingRow } from "@/demo/mockupScreens";

/**
 * Bookings — ONE screen, two data sources (the owner's 31 Aug ruling). Master
 * list on the left, the selected booking's detail on the right.
 * SHOW_DEMO_DATA fills the sample figures; flag off, every number comes from a
 * stored row and the honest states render inside the same layout. The old
 * parallel demo face was deleted with the fork (§6u).
 *
 * THE RATE IS NEVER A CONSTANT in live mode. The sample set prints "(15%)" on
 * every line; the guide rate genuinely is 15% today — and it was 10% this
 * morning, which is exactly why live percentages come from the COMMISSION
 * ROW's `rate_bps`, copied at conversion and frozen. A booking with no
 * commission row shows no percentage at all.
 *
 * THE AGREEMENT TAB: a booking WITH a booking_agreements row shows exactly
 * what the customer saw (pinned text, immutable including to staff); one
 * WITHOUT shows the absence honestly — a fabricated agreement record is worse
 * than a missing one. The sample checklist renders on sample figures only.
 *
 * Other honest rows, live: customer payments are not recorded (no processor —
 * `value_status` is what is known about the value, never a payment claim);
 * party size is not in the schema ("—", not a number); ids are real and
 * shortened.
 *
 * ── THE RE-SKIN ───────────────────────────────────────────────────────────
 * Laid out against the reference theme. Three things MOVED rather than went:
 *   1. The three section counts were three big tiles that also acted as a
 *      selector. They are now the theme's line tabs with the count in a badge
 *      on each — same three sections, same three live figures, one control.
 *   2. The master list was a column-label strip above spaced card rows. It is
 *      now a table inside the panel, which is how the theme draws a list with
 *      seven columns. Selection is the theme's `data-state="selected"` row.
 *   3. The detail panel's four inner tabs were hand-drawn underlines; they are
 *      the theme's line tabs now, with the same four panes behind them.
 * Nothing was dropped: the fake "More actions" affordance and the notification
 * bell are both still drawn, still inert, and both are flagged in the handover
 * as controls that look live and are not.
 */

type Tab = "guide" | "mountain" | "trek";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "guide", label: "Guide Bookings", icon: <Compass className="size-4" /> },
  { id: "mountain", label: "Expedition Mountains", icon: <MountainIcon className="size-4" /> },
  { id: "trek", label: "Expedition Treks", icon: <Route className="size-4" /> },
];

const inTab = (b: BookingDetailed, t: Tab) =>
  t === "guide" ? b.kind === "guide" : b.kind === "expedition" && (b.destination_kind ?? "mountain") === t;

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;
const bps = (n: number) => `${(n / 100).toFixed(n % 100 === 0 ? 0 : 1)}%`;

type Tone = "green" | "amber" | "red" | "neutral";

const statusTone = (s: string): Tone =>
  /cancel|refus|lost/.test(s) ? "red" : /complete|confirm|paid/.test(s) ? "green" : "amber";

/**
 * The reference theme's own badge treatments, one per tone. `outline` is what a
 * badge looks like in a table; `solid` is what it looks like on a photograph,
 * where an outline badge would disappear. Both class sets were taken off the
 * theme's users table and profile header rather than invented.
 */
const OUTLINE_BADGE: Record<Tone, { badge: string; dot: string }> = {
  green: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  amber: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  red: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-ui-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

const SOLID_BADGE: Record<Tone, string> = {
  green: "bg-emerald-600 text-white",
  amber: "bg-amber-500 text-amber-950",
  red: "bg-destructive text-white",
  neutral: "bg-background text-foreground",
};

function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const t = OUTLINE_BADGE[tone];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", t.badge)}>
      <span className={cn("size-1.5 rounded-full", t.dot)} />
      {label}
    </Badge>
  );
}

/** What is KNOWN about the money, never a payment claim. */
function valueLabel(b: BookingDetailed): { main: string; sub: string } {
  if (b.value_cents === null) return { main: "no value yet", sub: b.value_status };
  return { main: eur(b.value_cents), sub: b.value_status };
}

function commissionOf(b: BookingDetailed): { cents: number; rate: string | null } | null {
  if (b.commissions.length === 0) return null;
  const cents = b.commissions.reduce((s, c) => s + c.amount_cents, 0);
  const rates = [...new Set(b.commissions.map((c) => c.rate_bps).filter((r): r is number => r !== null))];
  return { cents, rate: rates.length === 1 ? bps(rates[0]) : null };
}

function Photo({ id, size }: { id: string | null; size: string }) {
  const [gone, setGone] = useState(false);
  if (!id || gone) return <span className={cn(size, "shrink-0 rounded-md bg-ui-muted")} aria-hidden />;
  return (
    <img
      src={`/img/destinations/${id}.jpg`}
      alt=""
      className={cn(size, "shrink-0 rounded-md object-cover")}
      onError={() => setGone(true)}
    />
  );
}

/**
 * One money figure, or the reason there isn't one.
 *
 * A `null` value prints `sub` as the whole tile — never a dash, never a zero.
 * "No value has been reported" and "€0" are opposite facts about a booking and
 * they must not share a rendering.
 */
function MoneyTile({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value === null ? (
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{sub}</p>
      ) : (
        <>
          <p className="mt-1 truncate font-medium text-lg leading-tight tracking-tight tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </div>
  );
}

/**
 * THE LINE TAB, MADE TO WORK IN THIS BUILD — read this before "simplifying" it.
 *
 * `components/ui/tabs.tsx` is a verbatim port of the reference theme's Tabs, and
 * the theme expresses EVERY tab state through custom Tailwind variants that ship
 * in `shadcn/tailwind.css`: `data-active`, `data-horizontal`, `data-vertical`.
 * This app never imports that stylesheet — `shadcn` is not even a dependency —
 * so in the compiled CSS `data-horizontal` degrades to the literal attribute
 * `[data-horizontal]`, which nothing sets, and `data-active` is dropped
 * entirely. Two consequences, both verified on screen:
 *   · the Tabs root keeps `flex-direction: row`, so the list and the pane sit
 *     SIDE BY SIDE and the pane is squeezed to its minimum width;
 *   · an ACTIVE tab renders identically to an inactive one — no underline, no
 *     ink — because the whole active treatment hangs off `data-active`.
 * `flex-col` on the root and the classes below restate exactly what the theme's
 * variants would, against the `data-state` attribute Radix actually sets. They
 * are harmless once the import lands: same selectors, same values.
 */
const LINE_TAB =
  "after:inset-x-0 after:-bottom-[5px] after:h-0.5 data-[state=active]:text-foreground data-[state=active]:after:opacity-100";

/** A section heading inside a card, in the theme's own weight and size. */
function Head({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading font-medium text-base">{children}</h2>;
}

/** One key/value line in a detail card. */
function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

/** One list row, from either source. */
interface ListRow {
  id: string;
  photo: string | null;
  trip: string;
  line2: string;
  line3: string;
  customer: string;
  customerSub: string;
  dates: string;
  party: string;
  amountMain: string;
  amountSub: string;
  commMain: string;
  commSub: string;
  status: string;
  tone: Tone;
}

/**
 * THE detail panel — one component, two data sources. `sample` carries the
 * fixture; with it set, no reads fire and the sample checklist pane renders.
 * Without it, everything derives from the stored row, agreement record
 * included.
 */
function DetailPanel({ b, sample, onClose }: {
  b: BookingDetailed | null;
  sample: { row: MockBookingRow; d: NonNullable<typeof BOOKINGS_MOCKUP>["detail"] | null } | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"agreement" | "payments" | "messages" | "activity">("agreement");
  const [audit, setAudit] = useState<Result<AuditEvent[]>>(loading);
  const [agreement, setAgreement] = useState<Result<BookingAgreement | null>>(loading);
  useEffect(() => {
    if (!b) return; // sample mode reads nothing
    void listAuditEvents(200).then(setAudit);
    void getBookingAgreement(b.id).then(setAgreement);
  }, [b?.id, b]);

  const commission = b ? commissionOf(b) : null;
  const value = b ? valueLabel(b) : null;
  const title = sample ? sample.row.trip : (b!.product_name ?? b!.destination_name ?? "Booking");
  const photoId = sample ? sample.row.destination_id : b!.destination_id;
  const statusText = sample ? sample.row.status : b!.status;
  const tone: Tone = sample
    ? sample.row.status === "CONFIRMED" ? "green" : sample.row.status === "PENDING" ? "amber" : "red"
    : statusTone(b!.status);
  // Company earnings are DERIVED and say so: value minus ICEFALL's stored
  // commission. Both parts must exist or the tile carries the reason instead.
  const earnings =
    b && b.value_cents !== null && commission !== null ? b.value_cents - commission.cents : null;

  const events = audit.state === "ok" && b ? audit.value.filter((e) => e.entity_id === b.id) : null;
  const sd = sample?.d ?? null;

  return (
    <Card className="@container/detail w-0 min-w-full gap-0 py-0">
      <div className="relative">
        <Photo id={photoId} size="h-44 w-full !rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/30" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 left-4 flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Back to bookings
        </button>
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {/* Drawn, and inert — nothing behind it yet. Kept rather than deleted
              so the missing menu stays visible as missing. */}
          <span className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] bg-black/45 px-2.5 text-[0.8rem] font-medium text-white">
            More actions <ChevronDown className="size-3.5" aria-hidden />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-full bg-black/35 text-white hover:bg-black/50"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="absolute right-4 bottom-3 left-4">
          <p className="flex flex-wrap items-center gap-2 font-heading font-semibold text-xl tracking-tight text-white">
            {title}
            <Badge className={cn("rounded-sm", SOLID_BADGE[tone])}>{statusText}</Badge>
          </p>
          <p className="text-sm text-white/85">
            {sample
              ? "Guide Booking"
              : `${b!.kind === "guide" ? "Guide booking" : "Expedition booking"}${b!.company_name ? ` · ${b!.company_name}` : ""}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b px-4 py-4 @xl/detail:grid-cols-3 @3xl/detail:grid-cols-5">
        {sd ? (
          sd.tiles.map(([label, v]) => (
            <div key={label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 truncate font-medium text-lg leading-tight tracking-tight tabular-nums">{v}</p>
            </div>
          ))
        ) : b ? (
          <>
            <MoneyTile label="Recorded value" value={value!.main === "no value yet" ? null : value!.main} sub={value!.sub} />
            <MoneyTile
              label={commission?.rate ? `ICEFALL Commission (${commission.rate})` : "ICEFALL Commission"}
              value={commission ? eur(commission.cents) : null}
              sub={commission ? b.commissions.map((c) => c.status).join(", ") : "none recorded yet"}
            />
            <MoneyTile
              label="Company earnings"
              value={earnings !== null ? eur(earnings) : null}
              sub={earnings !== null ? "derived: value − commission" : "needs a value and a commission"}
            />
            <MoneyTile
              label="Pass-through costs"
              value={b.pass_through_state === "stated" && b.pass_through_cents !== null ? eur(b.pass_through_cents) : null}
              sub={
                b.pass_through_state === "none"
                  ? "none — the company passes nothing through"
                  : b.pass_through_state === "unknown"
                    ? "not stated by the company yet"
                    : "permits & fees, excluded from the commission basis"
              }
            />
            <MoneyTile label="Total recorded" value={value!.main === "no value yet" ? null : value!.main} sub="the booking's stored value" />
          </>
        ) : (
          <p className="col-span-full text-sm text-muted-foreground">
            Sample booking — money tiles fill from the drawn primary booking only.
          </p>
        )}
      </div>

      <div className="grid gap-6 px-4 py-4 @xl/detail:grid-cols-2 @3xl/detail:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Head>Customer</Head>
          {sd ? (
            <>
              <p className="font-medium text-sm">{sd.customer.name}</p>
              <p className="text-sm text-muted-foreground">{sd.customer.email}</p>
              <p className="text-sm text-muted-foreground">{sd.customer.phone}</p>
              <Button variant="outline" size="sm" className="mt-1 self-start">View customer</Button>
            </>
          ) : sample ? (
            <>
              <p className="font-medium text-sm">{sample.row.customer}</p>
              <p className="text-sm text-muted-foreground">{sample.row.email}</p>
              <Button variant="outline" size="sm" className="mt-1 self-start">View customer</Button>
            </>
          ) : (
            <>
              <p className="font-medium text-sm">{b!.customer_name ?? "No account linked"}</p>
              <p className="text-sm text-muted-foreground">
                email lives in the auth system, not on this record
              </p>
              {b!.customer_id && (
                <Button variant="outline" size="sm" className="mt-1 self-start" asChild>
                  <Link to="/admin/users">View customer</Link>
                </Button>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Head>Booking details</Head>
          <dl className="flex flex-col gap-1.5">
            {sd ? (
              sd.details.map(([k, v]) => <Row key={k} k={k} v={<span className="font-medium tabular-nums">{v}</span>} />)
            ) : sample ? (
              <>
                <Row k="Trip" v={<span className="font-medium">{sample.row.trip}</span>} />
                <Row k="Guide" v={sample.row.guide} />
                <Row k="Where" v={sample.row.place} />
                <Row k="Party size" v={<span className="tabular-nums">{sample.row.party} climbers</span>} />
              </>
            ) : (
              <>
                <Row k="Booking ID" v={<span className="font-medium tabular-nums">{b!.id.slice(0, 8)}</span>} />
                <Row k="Booked on" v={<span className="tabular-nums">{formatDay(b!.booked_at)}</span>} />
                <Row k="Trip" v={b!.product_name ?? "not linked"} />
                <Row k={b!.destination_kind === "trek" ? "Trek" : "Mountain"} v={b!.destination_name ?? "not linked"} />
                <Row
                  k={b!.kind === "guide" ? "Guide" : "Company"}
                  v={b!.kind === "guide" ? (b!.guide_name ?? "not linked") : (b!.company_name ?? "not linked")}
                />
                {/* Not "0" and not a dash: the schema has no such column. */}
                <Row k="Party size" v={<span className="text-muted-foreground">not recorded — the schema has no such field yet</span>} />
              </>
            )}
          </dl>
        </div>
        <div className="flex flex-col gap-2">
          <Head>Dates</Head>
          <dl className="flex flex-col gap-1.5">
            {sd ? (
              sd.dates.map(([k, v]) => <Row key={k} k={k} v={<span className="font-medium tabular-nums">{v}</span>} />)
            ) : sample ? (
              <Row k="Dates" v={<span className="tabular-nums">{sample.row.dates}</span>} />
            ) : (
              <>
                <Row k="Start date" v={<span className="tabular-nums">{formatDay(b!.starts_on) ?? "not set"}</span>} />
                <Row k="Completed" v={<span className="tabular-nums">{formatDay(b!.completed_at) ?? "not yet"}</span>} />
                <Row k="End date" v={<span className="text-muted-foreground">not recorded</span>} />
              </>
            )}
            <Row k="Status" v={<StatusBadge tone={tone} label={statusText} />} />
          </dl>
        </div>
      </div>

      <Separator />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-col gap-0">
        <div className="no-scrollbar touch-pan-x overflow-x-auto overscroll-x-contain border-b px-4">
          <TabsList variant="line" className="h-8 w-max min-w-full justify-start gap-4 *:data-[slot=tabs-trigger]:flex-none">
            <TabsTrigger value="agreement" className={LINE_TAB}>Agreement</TabsTrigger>
            <TabsTrigger value="payments" className={LINE_TAB}>Payments</TabsTrigger>
            <TabsTrigger value="messages" className={LINE_TAB}>Messages</TabsTrigger>
            <TabsTrigger value="activity" className={LINE_TAB}>Activity log</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="agreement" className="px-4 py-4">
          {sd ? (
            /* The drawn pane, on sample figures: checklist + policy + disclosures. */
            <div className="grid gap-6 @xl/detail:grid-cols-2 @3xl/detail:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Head>Terms Accepted</Head>
                <div className="flex flex-col gap-2">
                  {sd.agreement.accepted.map((a) => (
                    <div key={a.label} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                      <span>
                        <span className="font-medium">{a.label}</span>
                        <span className="block text-xs text-muted-foreground">{a.on}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-1 self-start">Download all documents</Button>
              </div>
              <div className="flex flex-col gap-2">
                <Head>
                  Cancellation Policy <span className="font-normal text-muted-foreground">(Agreed at time of booking)</span>
                </Head>
                <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
                  {sd.agreement.policy.map((li) => (
                    <li key={li} className="flex gap-2"><span className="text-muted-foreground">·</span>{li}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <Head>What Was Disclosed</Head>
                <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
                  {sd.agreement.disclosures.map((li) => (
                    <li key={li} className="flex gap-2"><span className="text-muted-foreground">·</span>{li}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : sample ? (
            <p className="text-sm text-muted-foreground">
              Sample booking — the drawn agreement fills on the primary sample only.
            </p>
          ) : agreement.state === "loading" ? (
            <p className="text-sm text-muted-foreground">Reading the agreement record…</p>
          ) : agreement.state === "ok" && agreement.value !== null ? (
            <div className="grid max-w-4xl gap-6 @xl/detail:grid-cols-2 @3xl/detail:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Head>Terms accepted</Head>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Version <span className="font-medium text-foreground tabular-nums">{agreement.value.terms_version}</span>,
                  accepted {formatMoment(agreement.value.accepted_at)} via {agreement.value.origin_app.replaceAll("_", " ")}.
                </p>
                <p className="max-h-40 overflow-y-auto rounded-lg border bg-ui-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {agreement.value.terms_text}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {/* The owner's own heading, verbatim — rate preservation. */}
                <Head>
                  Cancellation policy <span className="font-normal text-muted-foreground">(Agreed at time of booking)</span>
                </Head>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{agreement.value.cancellation_policy}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Head>What was disclosed</Head>
                {agreement.value.disclosures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No disclosures were shown.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm leading-relaxed">
                    {agreement.value.disclosures.map((d, i) => (
                      <li key={i} className="flex gap-2"><span className="text-muted-foreground">·</span>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex max-w-2xl flex-col gap-1.5">
              <Head>Not recorded</Head>
              <p className="text-sm leading-relaxed text-muted-foreground">
                No acceptance record exists for this booking — it was made before acceptance
                capture existed{agreement.state !== "ok" ? ", or the record could not be read" : ""}.
                Nothing here assumes today's terms applied: a fabricated agreement record is worse
                than a missing one.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="px-4 py-4">
          {sample ? (
            <p className="text-sm text-muted-foreground">Sample booking — this pane fills from the live record.</p>
          ) : (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Customer payments are not recorded — ICEFALL has no payment processor, and the payments
              ledger holds company invoice money only. What is known about this booking's value is on
              the tiles above, stated as "{b!.value_status}", never as a payment claim.
            </p>
          )}
        </TabsContent>

        <TabsContent value="messages" className="px-4 py-4">
          {sample ? (
            <p className="text-sm text-muted-foreground">Sample booking — this pane fills from the live record.</p>
          ) : b!.thread_id ? (
            <p className="text-sm text-muted-foreground">
              This booking is linked to a conversation thread. Thread reading arrives with the
              messaging surface; the link is real: <span className="tabular-nums">{b!.thread_id.slice(0, 8)}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No conversation thread is linked to this booking.</p>
          )}
        </TabsContent>

        <TabsContent value="activity" className="px-4 py-4">
          {sample ? (
            <p className="text-sm text-muted-foreground">Sample booking — this pane fills from the live record.</p>
          ) : events === null ? (
            <p className="text-sm text-muted-foreground">Reading the audit log…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audit events name this booking. The log records placement moves, approvals and
              commission decisions; routine reads leave no trace.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((e) => (
                <p key={e.id} className="text-sm">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-muted-foreground"> · {formatMoment(e.created_at)}</span>
                </p>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* The owner's own words, verbatim — drawn by them on two mockups running. */}
      <div className="mx-4 mb-4 flex items-start gap-3 rounded-lg border bg-ui-muted/50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium text-sm">About views</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            We do not currently track views, impressions or click-through data. This metric is not
            available.
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function Bookings() {
  const M = BOOKINGS_MOCKUP;
  const [result, setResult] = useState<Result<BookingDetailed[]>>(loading);
  const [tab, setTab] = useState<Tab>("guide");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(M ? "demo-b1" : null);

  useEffect(() => {
    void listBookingsDetailed().then(setResult);
  }, []);

  const rows = result.state === "ok" ? result.value : null;
  const counts = useMemo(
    () =>
      M
        ? M.counts
        : rows
          ? {
              guide: rows.filter((b) => inTab(b, "guide")).length,
              mountain: rows.filter((b) => inTab(b, "mountain")).length,
              trek: rows.filter((b) => inTab(b, "trek")).length,
            }
          : null,
    [rows, M],
  );

  const shown = useMemo(() => {
    if (M || !rows) return [];
    const q = query.trim().toLowerCase();
    return rows
      .filter((b) => inTab(b, tab))
      .filter(
        (b) =>
          q === "" ||
          [b.product_name, b.destination_name, b.company_name, b.customer_name, b.guide_name]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)),
      );
  }, [rows, tab, query, M]);

  /** Both sources shaped into the same row. */
  const listRows: ListRow[] = useMemo(() => {
    if (M)
      return M.rows.map((r) => ({
        id: r.id, photo: r.destination_id, trip: r.trip, line2: `Guide: ${r.guide}`, line3: r.place,
        customer: r.customer, customerSub: r.email, dates: r.dates, party: String(r.party),
        amountMain: r.amount, amountSub: "Paid", commMain: r.commission, commSub: "Paid",
        status: r.status, tone: r.status === "CONFIRMED" ? "green" : r.status === "PENDING" ? "amber" : "red",
      }));
    return shown.map((b) => {
      const value = valueLabel(b);
      const commission = commissionOf(b);
      return {
        id: b.id, photo: b.destination_id,
        trip: b.product_name ?? b.destination_name ?? "Booking",
        line2: b.kind === "guide" ? `Guide: ${b.guide_name ?? "not linked"}` : (b.company_name ?? ""),
        line3: b.destination_name ?? "",
        customer: b.customer_name ?? "no account", customerSub: "",
        dates: formatDay(b.starts_on) ?? "no start date", party: "—",
        amountMain: value.main, amountSub: value.sub,
        commMain: commission ? eur(commission.cents) : "—",
        commSub: commission ? (commission.rate ?? "mixed rates") : "no commission",
        status: b.status, tone: statusTone(b.status),
      };
    });
  }, [M, shown]);

  const selLive = !M ? (rows?.find((b) => b.id === selected) ?? null) : null;
  const selSample = M ? (M.rows.find((r) => r.id === selected) ?? null) : null;
  const detailOpen = Boolean(selLive || selSample);

  /* The list's table and its footer. Column labels are the table's own head
     now; the live commission column carries no typed rate, the stored one
     renders per row. */
  const listTable = (
    <>
      <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 font-medium text-muted-foreground">Booking</TableHead>
            <TableHead className="h-11 font-medium text-muted-foreground">Customer</TableHead>
            <TableHead className="h-11 font-medium text-muted-foreground">Dates</TableHead>
            <TableHead className="h-11 font-medium text-muted-foreground">Party</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Amount Paid</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Commission</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listRows.map((r) => (
            <TableRow
              key={r.id}
              onClick={() => setSelected(r.id)}
              data-state={selected === r.id ? "selected" : undefined}
              className="cursor-pointer border-border/60 hover:bg-ui-muted/40"
            >
              <TableCell className="py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <Photo id={r.photo} size="h-10 w-12" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">{r.trip}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.line2}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.line3}</span>
                  </span>
                </span>
              </TableCell>
              <TableCell className="py-3">
                <span className="block truncate text-sm">{r.customer}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.customerSub}</span>
              </TableCell>
              <TableCell className="py-3 text-sm leading-snug whitespace-pre-line text-muted-foreground tabular-nums">
                {r.dates.replace(" – ", " –\n")}
              </TableCell>
              <TableCell className="py-3 text-sm tabular-nums">{r.party}</TableCell>
              <TableCell className="py-3 text-right">
                <span className="block font-medium text-sm tabular-nums">{r.amountMain}</span>
                <span className="block text-xs text-muted-foreground">{r.amountSub}</span>
              </TableCell>
              <TableCell className="py-3 text-right">
                <span className="block font-medium text-sm tabular-nums">{r.commMain}</span>
                <span className="block text-xs text-muted-foreground">{r.commSub}</span>
              </TableCell>
              <TableCell className="py-3 text-right">
                <span className="inline-flex justify-end"><StatusBadge tone={r.tone} label={r.status} /></span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {M ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4">
          <p className="text-sm text-muted-foreground">Showing 1 to 8 of 126 bookings</p>
          <div className="flex items-center gap-1.5">
            <span className="px-1 text-sm text-muted-foreground">‹</span>
            {[1, 2, 3, 4, 5, "…", 16].map((pg, i) =>
              pg === "…" ? (
                <span key={`e${i}`} className="px-1 text-sm text-muted-foreground">…</span>
              ) : (
                <span
                  key={pg}
                  className={cn(
                    "grid size-7 place-items-center rounded-[min(var(--radius-md),12px)] text-sm",
                    pg === 1 ? "border border-border bg-background font-medium" : "text-muted-foreground",
                  )}
                >
                  {pg}
                </span>
              ),
            )}
            <span className="px-1 text-sm text-muted-foreground">›</span>
          </div>
          <span className="text-sm text-muted-foreground">10 / page</span>
        </div>
      ) : (
        // No invented pagination: every stored row is on this list.
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">
          Showing all {listRows.length} booking{listRows.length === 1 ? "" : "s"} in this section.
        </p>
      )}
    </>
  );

  const list = (
    <div className={cn("flex flex-col gap-4", detailOpen && "hidden xl:flex")}>
      {/* The three sections, and how many bookings each holds. This was three
          large tiles that doubled as the selector; it is one control now, and
          all three counts are still on screen at once. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-col gap-0">
        <div className="no-scrollbar touch-pan-x overflow-x-auto overscroll-x-contain border-b">
          <TabsList variant="line" className="h-8 w-max min-w-full justify-start gap-4 *:data-[slot=tabs-trigger]:flex-none">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className={LINE_TAB}>
                {t.icon}
                {t.label}
                <Badge variant="secondary" className="tabular-nums">{counts ? counts[t.id] : "…"}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="w-0 min-w-full overflow-hidden rounded-xl border border-border/70 bg-background">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}…`}
            className="min-w-0 flex-1"
          />
          <Button variant="outline" size="sm">
            <SlidersHorizontal data-icon="inline-start" /> Filters
          </Button>
        </div>

        {M ? (
          listTable
        ) : (
          // The states render INSIDE the panel, under the search, so a failed
          // or empty read never takes the search box away with it.
          <div className={rows && rows.length > 0 ? undefined : "p-4"}>
            <Resolve
              result={result}
              what="bookings"
              isEmpty={(v) => v.length === 0}
              empty="No bookings recorded yet. The first appears here the moment one is — and its commission will carry the rate stored on that day."
            >
              {() => listTable}
            </Resolve>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-tight">Bookings</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            All bookings across guides, expeditions and treks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download data-icon="inline-start" /> Export
          </Button>
          {/* Drawn, and inert. A span rather than a button so nothing claims to
              be clickable; the count is a figure and only the sample set has one. */}
          <span className="relative grid size-8 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
            <Bell className="size-4" />
            {M && (
              <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-white">
                8
              </span>
            )}
          </span>
        </div>
      </div>

      <div className={cn("grid items-start gap-4 md:gap-6", detailOpen && "xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]")}>
        {list}
        {selSample && M && (
          <DetailPanel
            b={null}
            sample={{ row: selSample, d: selSample.id === M.detail.id ? M.detail : null }}
            onClose={() => setSelected(null)}
          />
        )}
        {selLive && <DetailPanel b={selLive} sample={null} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
