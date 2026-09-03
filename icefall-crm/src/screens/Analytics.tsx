import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Resolve, Unavailable } from "@/components/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listBookings,
  listCommissions,
  listCompanies,
  listCustomers,
  listEnquiries,
  listLeads,
  listRevenue,
  countAccounts,
} from "@/data/queries";
import { formatCents, formatCentsShort, formatRatio, loading, type Ratio, type Result } from "@/data/result";
import type {
  Booking,
  Commission,
  Company,
  CustomerRecord,
  Enquiry,
  Lead,
  RevenueRecord,
  RevenueStream,
} from "@/data/types";
import { cn, initials } from "@/lib/utils";

/**
 * Analytics — and the honest account of how little of it ICEFALL can measure.
 *
 * The owner asked for four groups: Audience, Marketplace, Funnel and Financial.
 * Three of the four are mostly unmeasurable today, and the useful thing this
 * screen can do is say so per group rather than fill the layout with zeros that
 * a reader would take as facts about the business.
 *
 * WHAT IS NOT HERE, AND WHY.
 *
 * Daily and monthly active users, retention, and every view count — mountain,
 * expedition, trek, company profile — have NO SOURCE AT ALL. Nothing in the
 * family writes an analytics event, and an event the client writes about itself
 * is self-reported rather than observed. A zero in those tiles would describe
 * the instrumentation while being read as a description of the business, which
 * is the exact confusion this product exists to avoid. They keep their headings
 * and state the absence; a metric that disappears is one the reader assumes is
 * fine.
 *
 * Nor is there a date-range control or an export button in the header. Both
 * appear in the mockup and neither would do anything: a range picker over data
 * with no event history filters nothing, and a control that implies a capability
 * ICEFALL does not have is the same lie in a smaller font. THE RE-SKIN DID NOT
 * ADD THEM EITHER — the reference theme puts a search field, filter chips and an
 * Export button on the header of every table card, and every one of those would
 * be a picture of a control here.
 *
 * WHAT IS HERE IS MEASURED, NOT INFERRED.
 *
 * Growth is counted from the join date written on each customer record — real
 * registrations, not activity. The funnel from Enquiries onward is counted over
 * one population (the leads) so the stages divide into each other honestly; its
 * first stage, Views, has no source and so the first conversion percentage does
 * not exist either. Financial figures sum only rows that carry a figure, in a
 * single currency, and say what they left out. Operator performance is a real
 * grouping of leads, bookings and revenue by company — the most useful thing on
 * the page precisely because every column of it comes from a table that exists.
 *
 * ── RE-SKIN (theme match, Sep 2026) ────────────────────────────────────────
 * Pastel tiles → the theme's neutral cards; the ICEFALL StatusChip (a coloured
 * glyph, the word, and a chevron that never did anything) → the theme's own
 * status badge, tinted the same four ways, with the dead chevron gone; the
 * ranked bars → the theme's neutral fill on a muted track. Every string, every
 * figure and every absence below is unchanged.
 *
 * ── LAYOUT, REBUILT ONTO THE THEME'S ANALYTICS PAGE ────────────────────────
 * The owner's words: "analytics page is completely different from the mockup.
 * copy it". The reference is theme-ref .../dashboard/analytics/page.tsx, and
 * its skeleton is now this page's skeleton:
 *
 *   h1 + muted subtitle
 *   a Tabs strip, with a toolbar slot pushed right on the same row
 *   under the first tab: a KPI strip, then a 12-column grid split 7/5 twice —
 *     a large chart card beside a smaller live card, then a table card beside
 *     a smaller breakdown card
 *
 * WHAT MOVED, AND NOTHING WAS DROPPED. This screen used to be six sections
 * stacked down one scroll. The six are now the six tabs, in the same order:
 * Overview (new — the composed 7/5 view), Audience, Marketplace, Funnel,
 * Financial, Operators. Every card, figure, caption, footnote and refusal that
 * existed before still exists and still says the same words; the section <h2>
 * that headed each group is now the tab that selects it. Four cards are
 * rendered in two places — the Overview cross-section and their own tab — and
 * each is ONE component rendered twice, not two copies of a card.
 *
 * THREE THINGS IN THE REFERENCE ARE DELIBERATELY NOT COPIED, all for the same
 * reason: each is a control or a figure that would imply a capability ICEFALL
 * does not have, which is the defect this whole screen was written to avoid.
 *
 *   1. THE TOOLBAR SLOT IS EMPTY. The reference puts a date-range Select and a
 *      dropdown of Export report / Import data / Share dashboard / Refresh
 *      metrics in it. ICEFALL records no event history, so a range picker
 *      filters nothing and an export exports the same rows whatever it says.
 *      This is the ruling already written above, unchanged — the theme did not
 *      get to overturn it by putting the control somewhere prettier. The slot
 *      is kept in the markup so the row divides the way the reference's does.
 *   2. NO `Ellipsis` MENU on any card header. The reference draws one on every
 *      card and none of them opens anything. That is the same defect as the
 *      chevron already removed from the ICEFALL StatusChip.
 *   3. NO DELTA BADGE on the KPI tiles. The reference's read "▲ 2.8% — from
 *      207.3k, last 4 weeks". A delta needs a previous period, and with no
 *      event history there is no previous period to compare against; the tiles
 *      carry their existing caption instead.
 *
 * AND ONE THING THE REFERENCE DOES THAT IS NOT REPRODUCED: its unimplemented
 * tabs render a dashed panel reading "… view coming soon." Nothing here is
 * "coming soon". Audience and Marketplace are not unbuilt — they are
 * unmeasurable, which is a different statement — so both keep the `Unavailable`
 * frame and the full, verbatim reason they carried before.
 *
 * ── SECOND PASS: THE CARD ANATOMY, MEASURED AGAINST THE REFERENCE ──────────
 * The skeleton above was right and the insides were not. Four changes, each
 * made because a measurement disagreed with localhost:3100, not because the
 * card looked tired.
 *
 *   A. THE OPERATOR TABLE WAS CLIPPING TWO COLUMNS. It padded every cell
 *      (`**:data-[slot=table-*]:px-4`), which made it 866px wide inside the
 *      647px card that the 7/5 split gives it — and `Card` sets
 *      `overflow-hidden`. Bookings and Revenue recognised, the two columns the
 *      table exists to show, sat off the right edge behind a horizontal scroll
 *      nothing advertised. The reference pads the first and last cell only and
 *      lets the name column absorb the rest; that recipe is now here and the
 *      table measures 647 in a 647px card. This was a real capability loss
 *      introduced by the layout, and it is the most important fix on this page.
 *
 *   B. REVENUE BY STREAM took the shape of the slot it occupies — the
 *      reference's "Traffic Sources": a 40px bar in the chart ramp's lightest
 *      grey with the name inside it, not a label over a hairline drawn in
 *      full-strength `primary`. See the note at the code for the one place it
 *      departs, which is the place where a zero would otherwise disappear.
 *
 *   C. TWO CARDS NOW LEAD WITH THEIR FIGURES. "New customers by month" opened
 *      with three lines of prose in the header and "Response times" with four;
 *      every card on the reference page opens on a title and a measurement.
 *      Both paragraphs are still on their cards, word for word, at the foot
 *      where the existing footnotes live. Moved, not shortened, not softened.
 *
 *   D. DATA MARKS ARE GREY, NOT BLACK. The reference paints every bar and line
 *      from --chart-1…5 and keeps near-black `primary` for buttons and body
 *      type. The month bars were `bg-primary`; they are --chart-3 now.
 *
 * WHAT DID NOT CHANGE: every string, every figure, every empty state and every
 * refusal. The three deliberate omissions above still stand, and no metric was
 * added to fill a slot — the Marketplace tab is still one honest refusal on a
 * page with room for a card, because the alternative is inventing a number.
 */

const STREAMS: { id: RevenueStream; label: string }[] = [
  { id: "placement", label: "Mountain placements" },
  { id: "referral", label: "Referral fees" },
  { id: "guide_commission", label: "Guide commissions" },
  { id: "subscription", label: "Consumer subscriptions" },
  { id: "other", label: "Other" },
];

/**
 * A commission's status, read as settled / waiting / refused.
 *
 * Only `paid` is money that arrived, so only `paid` is settled. Accrued and
 * invoiced are claims and are drawn as waiting; disputed is a refusal; waived is
 * neither — it was given up, not withheld — so it stays neutral rather than
 * borrowing the colour of a dispute.
 */
const COMMISSION_STATUSES: {
  id: Commission["status"];
  state: "ok" | "pending" | "bad" | "neutral";
}[] = [
  { id: "accrued", state: "pending" },
  { id: "invoiced", state: "pending" },
  { id: "paid", state: "ok" },
  { id: "disputed", state: "bad" },
  { id: "waived", state: "neutral" },
];

/** The theme's own status-badge tints, lifted from its users table. */
const STATE_TONE: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: {
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  pending: {
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  bad: {
    badge: "border-destructive/20 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  neutral: {
    badge: "border-border bg-ui-muted/50 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

function StatusBadge({ state, label }: { state: "ok" | "pending" | "bad" | "neutral"; label: string }) {
  const tone = STATE_TONE[state];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", tone.badge)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      {label}
    </Badge>
  );
}

const NO_EVENT_STREAM =
  "ICEFALL records no page views, no sessions and no app opens. Nothing writes an analytics event anywhere " +
  "in the family, and a row written by the same client that is being measured would be self-reported rather " +
  "than observed. There is no source for these figures at all — not an empty one, an absent one.";

const AUDIENCE_ABSENT =
  "Daily active users, monthly active users and retention are not shown. " +
  NO_EVENT_STREAM +
  " The customer record carries a last-active field for the day this is instrumented; it is null until then, " +
  "and null is not zero.";

const MARKETPLACE_ABSENT =
  "Mountain views, expedition views, trek views and company profile views are not shown. " +
  NO_EVENT_STREAM +
  " Nothing on this screen may stand in for them either: ICEFALL collects no ratings, no popularity signal and " +
  "no scarcity signal, so there is no proxy to quietly substitute.";

const MIXED_CURRENCY =
  "These records are held in more than one currency and ICEFALL stores no exchange rates. There is no total " +
  "to show — converting them here would invent both a rate and a date to have taken it on.";

/** Built from the string's own parts. Never `new Date("2026-08-01")` — see `formatDay`. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ratio = (numerator: number, denominator: number): Ratio => ({ numerator, denominator });

/** The house idiom: the real failure message where there is one, the generic phrase otherwise. */
const absence = <T,>(r: Result<T>): string =>
  r.state === "unavailable" || r.state === "error" ? r.reason : "Not recorded";

/**
 * `formatCentsShort`'s symbol table has no fallback — anything that is not EUR
 * or GBP is drawn with a dollar sign — so the compact form is used only for the
 * three currencies it actually knows. A Nepali rupee total rendered as dollars
 * is a wrong figure, not an untidy one.
 */
const money = (cents: number, currency: string): string | null =>
  currency === "EUR" || currency === "GBP" || currency === "USD"
    ? formatCentsShort(cents, currency)
    : formatCents(cents, currency);

/** The one currency these rows share, or null if they share none (or there are none). */
function oneCurrency(rows: { currency: string }[]): string | null {
  const first = rows[0]?.currency;
  if (first === undefined) return null;
  return rows.every((r) => r.currency === first) ? first : null;
}

/** A total, or the reason there isn't one. Never a zero standing in for either. */
function totalOf(
  rows: { amount_cents: number; currency: string }[],
  emptyReason: string,
): { value: string | null; reason: string } {
  if (rows.length === 0) return { value: null, reason: emptyReason };
  const currency = oneCurrency(rows);
  if (currency === null) return { value: null, reason: MIXED_CURRENCY };
  return {
    value: money(
      rows.reduce((n, r) => n + r.amount_cents, 0),
      currency,
    ),
    reason: "",
  };
}

/**
 * A figure, or the reason there isn't one — the theme's metric card.
 *
 * `value === null` renders the reason and nothing else. This is the smallest
 * place the honesty doctrine lives and the one used most often. The old ICEFALL
 * tile dropped its pastel when it had no figure; the theme has no pastel at all,
 * so the distinction is now carried by what is written rather than by colour —
 * a tile with a reason in it never shows a number, a dash or a delta.
 */
function Metric({
  label,
  value,
  reason,
  hint,
}: {
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{reason ?? "Not recorded"}</p>
        ) : (
          <>
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
            {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface MonthCount {
  key: string;
  label: string;
  count: number;
}

/**
 * Registrations per calendar month.
 *
 * Months with nobody joining are filled in rather than skipped, and a zero in
 * one of them is a real count: the customer table was read in full, so "nobody
 * joined in September" is a measurement and not a gap. Squeezing the empty
 * months out would make the axis lie about time instead.
 */
function joinsByMonth(customers: CustomerRecord[]): MonthCount[] {
  const counts = new Map<string, number>();
  for (const c of customers) {
    const [y, m] = c.joined_on.slice(0, 7).split("-").map(Number);
    // A record whose join date cannot be read is not filed under a guessed
    // month. The caller counts the shortfall and says so.
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) continue;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  if (keys.length === 0) return [];
  const out: MonthCount[] = [];
  const [firstY, firstM] = keys[0].split("-").map(Number);
  const [lastY, lastM] = keys[keys.length - 1].split("-").map(Number);
  let y = firstY;
  let m = firstM;
  while (y < lastY || (y === lastY && m <= lastM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key, label: `${MONTHS[m - 1]} ${y}`, count: counts.get(key) ?? 0 });
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
  return out;
}

/** One stage of the funnel, or the reason the stage has no figure. */
function FunnelStage({
  label,
  value,
  share,
  note,
}: {
  label: string;
  value: number | null;
  share: string | null;
  note: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{note}</p>
        ) : (
          <>
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
            <div className="mt-3 h-[5px] w-full overflow-hidden rounded-full bg-ui-muted">
              {share !== null && <div className="h-full rounded-full bg-primary" style={{ width: share }} />}
            </div>
            <p className="mt-1 text-muted-foreground text-sm leading-relaxed">{note}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** "3h 20m", "2d 4h" — a real elapsed duration, humanised. */
function spell(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * The reference's KPI strip cell.
 *
 * Same contract as `Metric` — a figure, or the reason there isn't one, never
 * both and never a zero standing in for either — drawn at the reference's
 * strip proportions instead: `text-sm` label, `text-2xl` figure, `text-xs`
 * caption. The reference's cell also carries an `Ellipsis` menu that opens
 * nothing and a "▲ 2.8% vs last 4 weeks" delta badge; neither is reproduced,
 * for the reasons in the file header.
 */
function KpiTile({
  label,
  value,
  reason,
  hint,
}: {
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {value === null ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{reason ?? "Not recorded"}</p>
        ) : (
          <>
            <div className="text-2xl tabular-nums leading-none tracking-tight">{value}</div>
            {hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** One cell of the response-times grid — `Metric`'s contract at cell scale. */
function Figure({
  label,
  value,
  reason,
  hint,
}: {
  label: string;
  value: string | null;
  reason: string;
  hint: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      {value === null ? (
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{reason}</p>
      ) : (
        <>
          <p className="mt-1 font-medium text-xl tabular-nums leading-none tracking-tight">{value}</p>
          <p className="mt-1.5 text-muted-foreground text-xs leading-relaxed">{hint}</p>
        </>
      )}
    </div>
  );
}

/**
 * CR-02b — response times, MEASURED AT LAST.
 *
 * Four customer-facing screens once printed "Replies within {n} h", invented
 * and uncaveated — the standing defect the enquiry contract forbids
 * reproducing. The enquiries table now records created/seen/answered as
 * timestamps, so the true version of that number finally exists: not a
 * promise about the future, a measurement of the past, computed from every
 * answered enquiry on record. The customer apps still promise nothing; this
 * is the desk looking at itself.
 *
 * RE-SKIN: this was a full-width section of four `Metric` cards. It is now the
 * SMALL LIVE CARD of the reference's first 7/5 row — the slot its
 * "Realtime Visitors" occupies — because "waiting now" is the one figure on
 * this page that changes while you look at it. All four figures, all four
 * labels and all four captions are the ones that were here before; the pulse
 * beside the header is the reference's own live marker, and it is drawn only
 * when somebody is actually waiting.
 */
function ResponseTimesCard() {
  const [enquiries, setEnquiries] = useState<Result<Enquiry[]>>(loading);
  useEffect(() => {
    void listEnquiries().then(setEnquiries);
  }, []);

  const stats = (() => {
    if (enquiries.state !== "ok") return null;
    const rows = enquiries.value;
    const waits = rows
      .filter((e) => e.answered_at !== null)
      .map((e) => new Date(e.answered_at!).getTime() - new Date(e.created_at).getTime())
      .sort((a, b) => a - b);
    const at = (q: number) => waits[Math.min(waits.length - 1, Math.floor(q * waits.length))];
    const open = rows.filter((e) => e.answered_at === null);
    const oldest =
      open.length > 0 ? Math.max(...open.map((e) => Date.now() - new Date(e.created_at).getTime())) : null;
    return {
      answered: waits.length,
      median: waits.length ? at(0.5) : null,
      p90: waits.length ? at(0.9) : null,
      open: open.length,
      oldest,
    };
  })();

  const reason =
    enquiries.state === "unavailable" || enquiries.state === "error"
      ? enquiries.reason
      : "No enquiry has been answered yet — the first measurement exists when one is.";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Response times — measured</CardTitle>
        {stats !== null && stats.open > 0 && (
          <CardAction>
            <span className="flex items-center gap-2 text-muted-foreground text-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-warn" />
              </span>
              <span className="tabular-nums">{stats.open} waiting</span>
            </span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {/*
         * FIGURES FIRST, PROSE UNDER THEM — the reference's small card opens on
         * its number and its live marker and explains nothing. The paragraph
         * below is the one that used to sit above this grid, word for word; it
         * has moved, not shrunk. It matters too much to drop: it is the standing
         * answer to why four customer-facing screens may not print "replies
         * within n hours".
         */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-5">
          <Figure
            label="Median time to answer"
            value={stats?.median != null ? spell(stats.median) : null}
            reason={reason}
            hint="Half of all answered enquiries were answered faster than this."
          />
          <Figure
            label="90th percentile"
            value={stats?.p90 != null ? spell(stats.p90) : null}
            reason={reason}
            hint="All but the slowest tenth were answered within this."
          />
          <Figure
            label="Answered"
            value={stats ? String(stats.answered) : null}
            reason={reason}
            hint="Enquiries with a recorded answer, all time."
          />
          <Figure
            label="Waiting now"
            value={stats ? String(stats.open) : null}
            reason={reason}
            hint={
              stats?.oldest != null ? `The longest has waited ${spell(stats.oldest)}.` : "Nobody is waiting."
            }
          />
        </div>
        <p className="mt-auto border-border/50 border-t pt-4 text-muted-foreground text-xs leading-relaxed">
          Elapsed time from an enquiry arriving to the desk recording its answer — computed from the
          timestamps on every answered enquiry, nothing else. This is the measured truth behind the "replies
          within&nbsp;n&nbsp;hours" claim the customer screens are forbidden to invent: the apps still promise
          nothing, and this number describes only what has already happened.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The reference's LARGE CHART CARD — the "Traffic Quality" slot.
 *
 * Rendered on Overview and again under Audience, from this one definition.
 * The bars, the caption, the count-difference column and both footnote clauses
 * are exactly what they were.
 */
function CustomersByMonthCard({ customers }: { customers: Result<CustomerRecord[]> }) {
  return (
    <Resolve
      result={customers}
      what="customer records"
      isEmpty={(v) => v.length === 0}
      empty="Nobody has registered yet. A customer record is created at signup, and the join date on it is what this chart counts."
    >
      {(all) => {
        const months = joinsByMonth(all);
        const shown = months.slice(-12);
        const counted = months.reduce((n, m) => n + m.count, 0);
        const inShown = shown.reduce((n, m) => n + m.count, 0);
        const earlier = counted - inShown;
        const undated = all.length - counted;
        const peak = shown.reduce((n, m) => Math.max(n, m.count), 0);

        return (
          <Card className="h-full">
            {/*
             * A ONE-LINE HEADER, like every card on the reference page: the
             * title, and one figure in the action slot. The paragraph that used
             * to sit here is unchanged and has moved to the foot of the card,
             * beside the footnote it belongs with — the reference leads with the
             * measurement and explains underneath, and a card that opens with
             * three lines of prose reads as a different product before a single
             * number is drawn.
             */}
            <CardHeader>
              <CardTitle className="font-normal">New customers by month</CardTitle>
              <CardAction className="text-muted-foreground text-sm tabular-nums">
                {all.length} on record
              </CardAction>
            </CardHeader>
            <CardContent>
              {shown.length === 0 ? (
                <p className="text-muted-foreground text-sm leading-snug">
                  No customer record carries a readable join date, so there is no month to count them into.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {shown.map((m, i) => {
                    const width = formatRatio(ratio(m.count, peak));
                    const change = i === 0 ? null : m.count - shown[i - 1].count;
                    return (
                      <div key={m.key} className="flex items-center gap-3.5">
                        <p className="w-[76px] shrink-0 text-muted-foreground text-sm">{m.label}</p>
                        {/*
                         * The track stays. The reference draws its bars in the
                         * chart ramp's greys, never in the near-black `primary`
                         * it reserves for buttons and body type, so the fill is
                         * --chart-3; but it draws them on nothing, and on
                         * nothing a measured ZERO and an undrawn month are the
                         * same blank. The month rows are filled in rather than
                         * skipped precisely so a zero can be seen, so the
                         * grey track is kept to mark where every bar would be.
                         */}
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ui-muted">
                          {width !== null && m.count > 0 && (
                            <div className="h-full rounded-full bg-chart-3" style={{ width }} />
                          )}
                        </div>
                        <p className="w-[44px] shrink-0 text-right font-medium text-sm tabular-nums">
                          {m.count}
                        </p>
                        <p className="w-[100px] shrink-0 text-right text-muted-foreground text-xs tabular-nums">
                          {change === null
                            ? "first month"
                            : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change)} vs prev`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/*
               * The month-on-month figure is a COUNT DIFFERENCE, never a
               * percentage. A percentage needs the previous month as a
               * denominator, and the month before the first one recorded does
               * not exist — "+300%" off a base of one is a number that travels
               * a lot further than it deserves to.
               */}
              <p className="mt-4 max-w-2xl text-muted-foreground text-xs leading-relaxed">
                Counted from the join date on each customer record. This is registration, not activity —
                somebody who signed up once and never returned is counted here exactly like somebody who books
                every season, and ICEFALL cannot yet tell the two apart.
              </p>
              <p className="mt-2 max-w-2xl text-muted-foreground text-xs leading-relaxed">
                The right-hand column is a count difference against the previous month, not a growth
                percentage: a percentage would need a previous month to divide by, and the first month
                recorded has none.
                {earlier > 0 &&
                  ` ${earlier} customer${earlier === 1 ? " joined" : "s joined"} before ${shown[0].label} and ${earlier === 1 ? "is" : "are"} not drawn.`}
                {undated > 0 &&
                  ` ${undated} record${undated === 1 ? " carries" : "s carry"} no readable join date and ${undated === 1 ? "is" : "are"} counted in the total only.`}
              </p>
            </CardContent>
          </Card>
        );
      }}
    </Resolve>
  );
}

/** The reference's SMALL BREAKDOWN CARD — the "Traffic Sources" slot. */
function RevenueByStreamCard({ revenue }: { revenue: Result<RevenueRecord[]> }) {
  const revenueRows = revenue.state === "ok" ? revenue.value : null;
  const revenueCurrency = revenueRows === null ? null : oneCurrency(revenueRows);
  const revenueGrandTotal = revenueRows === null ? null : revenueRows.reduce((n, r) => n + r.amount_cents, 0);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Revenue by stream</CardTitle>
      </CardHeader>
      <CardContent>
        {revenueRows === null ? (
          <p className="text-muted-foreground text-sm leading-snug">{absence(revenue)}</p>
        ) : revenueRows.length === 0 ? (
          <p className="text-muted-foreground text-sm leading-snug">
            Nothing has been recognised yet, so there is nothing to divide between the streams.
          </p>
        ) : revenueCurrency === null || revenueGrandTotal === null ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{MIXED_CURRENCY}</p>
        ) : (
          /*
           * THE REFERENCE'S "Traffic Sources" BAR, which is the slot this card
           * occupies: a 40px bar, rounded 8, filled in the chart ramp's lightest
           * grey at half strength, with the NAME INSIDE the bar and the figure
           * pinned to the row's right edge. It replaces a label-above /
           * hairline-below pair drawn in full-strength primary — the same
           * numbers, in the shape and the weight the theme actually uses.
           *
           * ONE DEPARTURE, AND IT IS THE HONEST ONE. The reference paints its
           * label with recharts' `position="insideLeft"`, so a zero-length bar
           * takes its own label off the screen with it. Consumer subscriptions
           * is a permanent zero here — there is no subscription product — and a
           * stream that silently vanishes reads as a stream that does not
           * exist. The label is drawn on the ROW and the bar behind it, so a
           * stream with nothing recognised still names itself and still says
           * "None recognised" where its figure would be.
           */
          <div className="space-y-2">
            {STREAMS.map((s) => {
              const rows = revenueRows.filter((r) => r.stream === s.id);
              const sum = rows.reduce((n, r) => n + r.amount_cents, 0);
              const share = formatRatio(ratio(sum, revenueGrandTotal));
              return (
                <div key={s.id} className="flex h-10 items-center gap-3">
                  {/* The bar is measured against THIS box, not the whole row —
                      the reference keeps a 48px right margin on its plot area so
                      a long bar never runs under its own figure. */}
                  <div className="relative flex h-full min-w-0 flex-1 items-center">
                    {share !== null && rows.length > 0 && (
                      <div
                        aria-hidden
                        className="absolute inset-y-0 left-0 rounded-lg bg-chart-1/50"
                        style={{ width: share }}
                      />
                    )}
                    <p className="relative min-w-0 truncate pl-3 text-sm">{s.label}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm tabular-nums">
                    {rows.length === 0 ? (
                      <span className="text-muted-foreground">None recognised</span>
                    ) : (
                      <>
                        {money(sum, revenueCurrency)}
                        {share !== null && <span className="ml-2 text-muted-foreground">{share}</span>}
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {/*
         * Consumer subscriptions will read "None recognised" for the
         * foreseeable future: there is no subscription product. That is the
         * correct output — the stream is defined, nothing has been recognised
         * against it, and inventing an MRR from placement invoices to fill the
         * slice would be the single most misleading figure on this screen.
         */}
      </CardContent>
    </Card>
  );
}

function CommissionsByStatusCard({ commissions }: { commissions: Result<Commission[]> }) {
  const commissionRows = commissions.state === "ok" ? commissions.value : null;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Commissions by status</CardTitle>
      </CardHeader>
      <CardContent>
        {commissionRows === null ? (
          <p className="text-muted-foreground text-sm leading-snug">{absence(commissions)}</p>
        ) : commissionRows.length === 0 ? (
          <p className="text-muted-foreground text-sm leading-snug">
            No commission has been computed yet. One is written when a booking is converted against a rate
            somebody agreed.
          </p>
        ) : (
          <div className="space-y-3.5">
            {COMMISSION_STATUSES.map((s) => {
              const rows = commissionRows.filter((c) => c.status === s.id);
              const currency = oneCurrency(rows);
              const sum = rows.reduce((n, c) => n + c.amount_cents, 0);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <StatusBadge state={s.state} label={s.id} />
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {rows.length} record{rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="font-medium text-base tabular-nums">
                    {rows.length === 0 ? (
                      <span className="font-normal text-muted-foreground text-sm">None</span>
                    ) : currency === null ? (
                      <span className="font-normal text-muted-foreground text-sm">
                        Mixed currencies, no total
                      </span>
                    ) : (
                      money(sum, currency)
                    )}
                  </p>
                </div>
              );
            })}
            <p className="pt-1 text-muted-foreground text-xs leading-relaxed">
              A commission carries the rate copied at conversion, never one looked up now. Accrued and
              invoiced are claims; only paid is money that arrived.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The reference's TABLE CARD — the "Page Performance" slot.
 *
 * Rendered on Overview and again under Operators, from this one definition.
 * Every column, every link and every "Unavailable" / "None recognised" /
 * "Mixed currencies, no total" / "no leads to divide by" is unchanged.
 */
function OperatorPerformanceCard({
  companies,
  leadRows,
  bookingRows,
  revenueRows,
}: {
  companies: Result<Company[]>;
  leadRows: Lead[] | null;
  bookingRows: Booking[] | null;
  revenueRows: RevenueRecord[] | null;
}) {
  return (
    <Resolve
      result={companies}
      what="companies"
      isEmpty={(v) => v.length === 0}
      empty="No company records exist yet, so there is nothing to group performance by."
    >
      {(all) => {
        const rows = [...all].sort((a, b) => {
          if (leadRows !== null) {
            const byLeads =
              leadRows.filter((l) => l.company_id === b.id).length -
              leadRows.filter((l) => l.company_id === a.id).length;
            if (byLeads !== 0) return byLeads;
          }
          return a.name.localeCompare(b.name);
        });
        return (
          <Card className="h-full gap-2">
            <CardHeader>
              <CardTitle className="font-normal">Operator performance</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {/*
               * THE REFERENCE'S TABLE RECIPE, AND WHY IT IS NOT A STYLE CHOICE.
               *
               * This card used to pad EVERY cell (`**:data-[slot=table-*]:px-4`).
               * Six columns × 32px of padding pushed the table to 866px inside a
               * 647px card, and `Card` clips: Bookings and Revenue recognised —
               * the two columns this table exists for — were off the right edge,
               * reachable only by a horizontal scroll nothing advertised. The
               * 7/5 rebuild did that, and a column you cannot see is a column
               * you have lost.
               *
               * The reference pads the FIRST and LAST cell only and lets the
               * name column absorb the remainder (`max-w-0 truncate`), with the
               * numeric columns right-aligned at fixed widths. Same recipe here,
               * measured to 647: 64 + 80 + 112 + 80 + 112 fixed, ~199 left for
               * the company. Nothing is dropped and nothing is clipped.
               */}
              <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                <TableHeader className="[&_tr]:border-border/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 font-normal text-muted-foreground">Company</TableHead>
                    <TableHead className="h-8 w-16 text-right font-normal text-muted-foreground">
                      Leads
                    </TableHead>
                    <TableHead className="h-8 w-20 text-right font-normal text-muted-foreground">
                      Qualified
                    </TableHead>
                    {/* Wrapped rather than shortened: the heading names both
                        figures in the cell below it, and renaming a column to
                        make it fit is a quieter way of losing one. */}
                    <TableHead className="h-8 w-24 whitespace-normal text-right font-normal text-muted-foreground leading-tight">
                      Booked / conversion
                    </TableHead>
                    <TableHead className="h-8 w-20 text-right font-normal text-muted-foreground">
                      Bookings
                    </TableHead>
                    <TableHead className="h-8 w-24 whitespace-normal text-right font-normal text-muted-foreground leading-tight">
                      Revenue recognised
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-border/50">
                  {rows.map((c) => {
                    const mine = leadRows === null ? null : leadRows.filter((l) => l.company_id === c.id);
                    const mineQualified =
                      mine === null ? null : mine.filter((l) => l.qualified_at !== null).length;
                    const mineBooked = mine === null ? null : mine.filter((l) => l.booked_at !== null).length;
                    const conversion =
                      mine === null || mineBooked === null
                        ? null
                        : formatRatio(ratio(mineBooked, mine.length));
                    const theirBookings =
                      bookingRows === null ? null : bookingRows.filter((b) => b.company_id === c.id).length;
                    const theirRevenue =
                      revenueRows === null ? null : revenueRows.filter((r) => r.company_id === c.id);
                    const theirCurrency = theirRevenue === null ? null : oneCurrency(theirRevenue);
                    return (
                      <TableRow key={c.id} className="hover:bg-transparent">
                        <TableCell className="max-w-0 truncate py-4 font-medium">
                          <Link
                            to={`/admin/companies/${c.id}`}
                            title={c.name}
                            className="inline-flex max-w-full items-center gap-2.5 hover:underline"
                          >
                            <Avatar size="sm">
                              <AvatarFallback>{initials(c.name)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{c.name}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="py-4 text-right font-medium tabular-nums">
                          {mine === null ? (
                            <span className="font-normal text-muted-foreground">Unavailable</span>
                          ) : (
                            mine.length
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-right font-medium tabular-nums">
                          {mineQualified === null ? (
                            <span className="font-normal text-muted-foreground">Unavailable</span>
                          ) : (
                            mineQualified
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-right font-medium tabular-nums">
                          {mineBooked === null ? (
                            <span className="font-normal text-muted-foreground">Unavailable</span>
                          ) : (
                            <>
                              {mineBooked}
                              {/* No leads means no conversion rate — not a rate of zero.
                                  Inline, so an ordinary row stays one line deep like the
                                  reference's; `whitespace-normal` lets the one row that
                                  has to say a whole clause wrap instead of widening the
                                  column for all nine. */}
                              <span className="ml-1.5 whitespace-normal font-normal text-muted-foreground text-xs">
                                {conversion ?? "no leads to divide by"}
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-right font-medium tabular-nums">
                          {theirBookings === null ? (
                            <span className="font-normal text-muted-foreground">Unavailable</span>
                          ) : (
                            theirBookings
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-right font-medium tabular-nums">
                          {theirRevenue === null ? (
                            <span className="block whitespace-normal font-normal text-muted-foreground text-xs leading-tight">
                              Unavailable
                            </span>
                          ) : theirRevenue.length === 0 ? (
                            <span className="block whitespace-normal font-normal text-muted-foreground text-xs leading-tight">
                              None recognised
                            </span>
                          ) : theirCurrency === null ? (
                            <span className="block whitespace-normal font-normal text-muted-foreground text-xs leading-tight">
                              Mixed currencies, no total
                            </span>
                          ) : (
                            money(
                              theirRevenue.reduce((n, r) => n + r.amount_cents, 0),
                              theirCurrency,
                            )
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      }}
    </Resolve>
  );
}

/** The reference's empty-tab panel, kept for the shape of the row it sits in. */
const TAB_PANEL = "flex flex-col gap-4";

export default function Analytics() {
  const [customers, setCustomers] = useState<Result<CustomerRecord[]>>(loading);
  const [leads, setLeads] = useState<Result<Lead[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [commissions, setCommissions] = useState<Result<Commission[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);

  const [accounts, setAccounts] = useState<Result<number>>(loading);
  useEffect(() => {
    void countAccounts().then(setAccounts);
    void listCustomers().then(setCustomers);
    void listLeads().then(setLeads);
    void listBookings().then(setBookings);
    void listRevenue().then(setRevenue);
    void listCommissions().then(setCommissions);
    void listCompanies().then(setCompanies);
  }, []);

  // Narrowed once, so nothing below has to ask a Result what it is mid-render.
  const leadRows = leads.state === "ok" ? leads.value : null;
  const bookingRows = bookings.state === "ok" ? bookings.value : null;
  const revenueRows = revenue.state === "ok" ? revenue.value : null;

  /*
   * The funnel is counted over ONE population — the leads — so that each stage
   * genuinely divides into the one before it. Arrival is read from the stage
   * timestamps rather than the current status: a lead that was booked and later
   * disputed still passed through both stages, and a funnel that forgets that
   * reports the pipeline as narrower than it was.
   */
  const enquiries = leadRows === null ? null : leadRows.length;
  const qualified = leadRows === null ? null : leadRows.filter((l) => l.qualified_at !== null).length;
  const booked = leadRows === null ? null : leadRows.filter((l) => l.booked_at !== null).length;
  const unlinkedBookings = bookingRows === null ? null : bookingRows.filter((b) => b.lead_id === null).length;

  const shareOfEnquiries = (n: number | null): string | null =>
    n === null || enquiries === null ? null : formatRatio(ratio(n, enquiries));

  // Each rate is null rather than 0% when the stage above it is empty: nothing
  // to divide by is a different statement from nobody converting.
  const qualifiedRate =
    qualified === null || enquiries === null ? null : formatRatio(ratio(qualified, enquiries));
  const bookedRate = booked === null || qualified === null ? null : formatRatio(ratio(booked, qualified));

  // Reported bookings only. The database refuses to store an unknown value as a
  // zero, and GMV must not undo that by treating null as nothing.
  const reportedBookings =
    bookingRows === null ? null : bookingRows.filter((b) => b.value_status === "reported");
  const gmv =
    reportedBookings === null
      ? { value: null, reason: absence(bookings) }
      : totalOf(
          // `value_status === "reported"` is the state that carries a figure; the
          // others carry NULL, so this coalesce can never fire on a filtered row.
          reportedBookings.map((b) => ({ amount_cents: b.value_cents ?? 0, currency: b.currency })),
          "No booking has been reported with a value yet.",
        );
  const unreportedBookings =
    bookingRows === null || reportedBookings === null ? 0 : bookingRows.length - reportedBookings.length;

  const revenueTotal = (pick: (r: RevenueRecord) => boolean, emptyReason: string) =>
    revenueRows === null
      ? { value: null, reason: absence(revenue) }
      : totalOf(revenueRows.filter(pick), emptyReason);

  const recognised = revenueTotal(() => true, "Nothing has been recognised yet.");
  const placementRevenue = revenueTotal(
    (r) => r.stream === "placement",
    "No placement fee has been recognised yet.",
  );
  const commissionValue =
    commissions.state !== "ok"
      ? { value: null, reason: absence(commissions) }
      : totalOf(commissions.value, "No commission has been computed on a booking yet.");

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Analytics</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Audience, marketplace, funnel and financial performance. Most of what an analytics page normally
          shows has no source in ICEFALL yet, so each group states which part of itself is missing and why
          rather than drawing it as zero.
        </p>
      </div>

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="operators">Operators</TabsTrigger>
          </TabsList>

          {/*
            THE TOOLBAR SLOT, LEFT EMPTY ON PURPOSE — see the file header. The
            reference fills it with a date-range Select and an Export / Import /
            Share / Refresh menu. ICEFALL writes no analytics event, so a range
            picker would filter nothing and an export would hand over the same
            rows whatever the range said. The empty div is kept so this row
            divides the way the reference's does when a control can honestly
            live here later.
          */}
          <div />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Overview — the reference's shape: a KPI strip, then 7/5 twice.    */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="overview" className={TAB_PANEL}>
          {/*
            The reference's strip: one ringed, rounded container with the cells
            divided inside it rather than six separate cards. Six here against
            its five — the tiles are the ones that were already on this page.
            A tile with no figure prints its reason and so grows taller than its
            neighbours; that is the honest outcome and it is not clipped.
          */}
          <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
            <div className="grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-6">
              <KpiTile
                label="Signups"
                value={accounts.state === "ok" ? String(accounts.value) : null}
                reason={accounts.state === "ok" ? undefined : "Accounts could not be counted."}
                hint="Registered accounts, counted live."
              />
              <KpiTile
                label="Enquiries"
                value={enquiries !== null ? String(enquiries) : null}
                reason={absence(leads)}
                hint="Leads recorded, all time."
              />
              <KpiTile
                label="Bookings"
                value={bookingRows !== null ? String(bookingRows.length) : null}
                reason={absence(bookings)}
                hint="Recorded bookings, all streams."
              />
              <KpiTile
                label="Reported GMV"
                value={gmv.value}
                reason={gmv.reason}
                hint="Bookings that carry a stated value."
              />
              <KpiTile
                label="Recognised revenue"
                value={recognised.value}
                reason={recognised.reason}
                hint="ICEFALL's own, all streams."
              />
              <KpiTile
                label="Companies"
                value={companies.state === "ok" ? String(companies.value.length) : null}
                reason="Companies could not be counted."
                hint="On the books, any status."
              />
            </div>
          </div>

          {/* Row one: the large chart card beside the smaller live card. */}
          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <CustomersByMonthCard customers={customers} />
            </div>
            <div className="xl:col-span-5">
              <ResponseTimesCard />
            </div>
          </div>

          {/* Row two: the table card beside the smaller breakdown card. */}
          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <OperatorPerformanceCard
                companies={companies}
                leadRows={leadRows}
                bookingRows={bookingRows}
                revenueRows={revenueRows}
              />
            </div>
            <div className="xl:col-span-5 xl:col-start-8">
              <RevenueByStreamCard revenue={revenue} />
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Audience                                                          */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="audience" className={TAB_PANEL}>
          <Unavailable reason={AUDIENCE_ABSENT} />
          <CustomersByMonthCard customers={customers} />
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Marketplace                                                       */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="marketplace" className={TAB_PANEL}>
          <Unavailable reason={MARKETPLACE_ABSENT} />
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Funnel                                                            */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="funnel" className={TAB_PANEL}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FunnelStage
              label="Views"
              value={null}
              share={null}
              note="Not measured, so the view-to-enquiry rate does not exist either. Nothing writes an analytics event, and the number of people who looked cannot be inferred from the number who wrote in."
            />
            <FunnelStage
              label="Enquiries"
              value={enquiries}
              share={enquiries === null ? null : "100%"}
              note={
                enquiries === null
                  ? absence(leads)
                  : "Every enquiry made through ICEFALL. The base this funnel divides."
              }
            />
            <FunnelStage
              label="Qualified"
              value={qualified}
              share={shareOfEnquiries(qualified)}
              note={
                qualified === null
                  ? absence(leads)
                  : qualifiedRate === null
                    ? "No enquiries to divide by."
                    : `${qualifiedRate} of enquiries reached qualified.`
              }
            />
            <FunnelStage
              label="Bookings"
              value={booked}
              share={shareOfEnquiries(booked)}
              note={
                booked === null
                  ? absence(leads)
                  : bookedRate === null
                    ? "No qualified enquiries to divide by."
                    : `${bookedRate} of qualified enquiries booked.`
              }
            />
          </div>
          <p className="max-w-3xl text-muted-foreground text-xs leading-relaxed">
            Stages count arrival, read from the timestamp each stage writes — a lead that booked and was later
            disputed still passed through both. Every stage is counted over the same population, so the
            percentages divide into each other honestly.
            {unlinkedBookings !== null &&
              unlinkedBookings > 0 &&
              ` ${unlinkedBookings} booking${unlinkedBookings === 1 ? " is" : "s are"} recorded with no enquiry attached; ${unlinkedBookings === 1 ? "it does" : "they do"} not appear above because ${unlinkedBookings === 1 ? "it" : "they"} did not pass through this funnel.`}
          </p>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Financial                                                         */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="financial" className={TAB_PANEL}>
          {/*
            The old pastel was attached to the figure, not to the heading, so a
            tile explaining why a total cannot be shown never carried the same
            colour across a room as one carrying a total. The theme has no pastel
            at all — the distinction now lives entirely in what is written, and
            `Metric` still refuses to draw a number, a dash or a bar without one.
          */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Revenue recognised" value={recognised.value} reason={recognised.reason} />
            <Metric
              label="GMV from reported bookings"
              value={gmv.value}
              reason={gmv.reason}
              hint={
                unreportedBookings > 0
                  ? `Excludes ${unreportedBookings} booking${unreportedBookings === 1 ? "" : "s"} whose value has not been reported.`
                  : "Every recorded booking has a reported value."
              }
            />
            <Metric
              label="Placement revenue"
              value={placementRevenue.value}
              reason={placementRevenue.reason}
            />
            <Metric
              label="Commission value recorded"
              value={commissionValue.value}
              reason={commissionValue.reason}
              hint="Across every status, including disputed and waived. The split is below."
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
            <RevenueByStreamCard revenue={revenue} />
            <CommissionsByStatusCard commissions={commissions} />
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Operator performance                                              */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="operators" className={TAB_PANEL}>
          <p className="max-w-3xl text-muted-foreground text-sm leading-relaxed">
            Leads, bookings and recognised revenue grouped by the company each row is attributed to. Every
            column here comes from a table that exists, which is why this is the part of the page worth acting
            on. A zero is a real count — the lead and booking tables were read in full — while a column that
            could not be read says so instead.
          </p>
          <OperatorPerformanceCard
            companies={companies}
            leadRows={leadRows}
            bookingRows={bookingRows}
            revenueRows={revenueRows}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
