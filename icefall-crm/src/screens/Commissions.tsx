import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, CalendarDays, Download, SlidersHorizontal, TrendingUp, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Resolve } from "@/components/states";
import { listBookingsDetailed, type BookingDetailed } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import { cn, formatDay } from "@/lib/utils";
import { Bars, Donut, DONUT_COLORS, LineChart } from "@/components/charts";
import { GUIDE_COMMISSION_PCT } from "@/money/model";
import { COMMISSIONS_MOCKUP } from "@/demo/mockupScreens";
import { ListTabs, LogoDot, Thumb, ViewAllLink, type SourceTab } from "@/components/drawn";
import { RangeControl, rangeBounds, type RangeValue } from "@/components/controls";

/**
 * Commissions — ONE screen, the owner's drawn layout, two data sources.
 *
 * The owner ruled (31 Aug) that the mockups are the production design, not a
 * demo costume ("all this time i was telling you to build things on the acc
 * apps") — so the drawn layout renders unconditionally and only the FIGURES
 * switch: SHOW_DEMO_DATA on → the drawing's sample numbers, so the design can
 * be judged populated; flag off → every figure derives from stored commission
 * rows, rate_bps frozen at conversion, honest states inside the same layout.
 * The old parallel implementation went with the fork — two implementations of
 * one screen is drift with a countdown (§6u).
 *
 * THE DRAWN GRID SURVIVES THE RE-SKIN; THE CHROME INSIDE IT DOES NOT. The owner
 * then said of the theme "i dont see any change i want the designs 1:1", so
 * every container on this page is now the theme's Card, every table the theme's
 * Table, every pill the theme's Badge — but not one cell, figure or column has
 * moved. The layout is still the drawing.
 *
 * THE MOCKUP'S OWN COPY IS THE MODEL'S COPY. The owner drew: "Guide
 * Commissions — deducted from the amount the climber pays. No extra is added"
 * and "Expedition Placement Commissions — rate and basis VARY BY AGREEMENT."
 * Both sentences are TRUE in this codebase by design; the guide percentage
 * prints from the live constant, never retyped.
 *
 * Honesty inside the drawn frame, live mode: WAIVED money is excluded from
 * the total and the tile says so; "Due Date" reads "not invoiced yet" for an
 * accrued commission instead of inventing a date; deltas render only on
 * sample figures — a real delta needs a prior-period snapshot and ICEFALL
 * keeps none.
 */

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;
const eur2 = (cents: number) =>
  `€${(cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * THE PAGE HEADER, INLINE AND NOT `PageHead` — see the note in Finance.tsx.
 * The theme draws page titles at `text-3xl tracking-tight` (30px / 400);
 * `PageHead` draws 31px extrabold and accepts no className.
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
 * THE TWO SOURCES ARE TOLD APART BY THE CHART RAMP, AND ONLY BY IT.
 *
 * They used to be told apart by hue: guide in the ICEFALL azure, placements in
 * a hardcoded `oklch(0.71 0.16 55)` orange. index.css removed every hue from
 * the product, and the orange was left behind — so the legend swatch beside
 * "Expedition Placements" was painting orange while the line it labelled was
 * drawn in a neutral grey. You could not match a legend to its own series.
 *
 * Both now read from `DONUT_COLORS`, which IS the series palette every chart on
 * this page draws with (charts.tsx passes it as the default `colors`), so a
 * swatch is guaranteed to be the colour of the thing it names. Index 0 is the
 * ramp's ink end, index 1 the mid grey — 0.269 against 0.556, far enough apart
 * to separate two lines on one axis.
 */
const GUIDE_INK = DONUT_COLORS[0];
const PLACEMENT_INK = DONUT_COLORS[1];

/** The legend line the two time charts share. */
function SeriesLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: GUIDE_INK }} aria-hidden />
        Guide Commissions ({GUIDE_COMMISSION_PCT}%)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: PLACEMENT_INK }} aria-hidden />
        Expedition Placements
      </span>
    </div>
  );
}

/** The theme's compact column heading, verbatim from its own
 * `pipeline-activity` card: `text-[11px] uppercase tracking-widest`. Used by
 * the four narrow top-lists, which cannot carry a 44px table header. */
const MINI_HEAD = "pb-1.5 text-[11px] text-muted-foreground uppercase tracking-widest";

interface Row {
  booking: BookingDetailed;
  kind: "referral" | "guide";
  rate_bps: number | null;
  amount_cents: number;
  status: "accrued" | "invoiced" | "paid" | "disputed" | "waived";
}

/** Everything the drawn layout needs, from either source. */
interface Slots {
  tiles: { label: string; value: string; sub: string; delta: string | null }[];
  charts: { labels: string[]; guide: number[]; referral: number[] } | null;
  donut: { guide: number; referral: number; centre: string; guideLine: string; referralLine: string };
  companies: { name: string; total: string; paid: string; unpaid: string }[];
  products: { name: string; company: string; total: string; slug: string | null }[];
  mountains: { name: string; total: string; slug: string | null }[];
  largest: { name: string; sub: string; source: string; amount: string; slug: string | null }[];
  unpaid: { name: string; company: string; source: string; date: string; due: string; amount: string; commission: string; status: string; slug: string | null }[];
  summary: [string, string, string, string, string][];
}

export default function Commissions() {
  const M = COMMISSIONS_MOCKUP;
  const [result, setResult] = useState<Result<BookingDetailed[]>>(loading);
  const [range, setRange] = useState<RangeValue>({ kind: "all" });
  // One source filter shared by the three tabbed lists. Live mode filters;
  // sample mode's pills are visual — the drawing's figures are fixed.
  const [topTab, setTopTab] = useState<SourceTab>("all");

  useEffect(() => {
    void listBookingsDetailed().then(setResult);
  }, []);

  const rows: Row[] | null = useMemo(() => {
    if (result.state !== "ok") return null;
    // Date-part string comparison on ISO — no Date parsing in a filter (§6af).
    const bounds = rangeBounds(range);
    const out: Row[] = [];
    for (const b of result.value)
      for (const c of b.commissions) {
        const day = b.booked_at.slice(0, 10);
        if (bounds.start !== null && day < bounds.start) continue;
        if (day > bounds.end) continue;
        out.push({ booking: b, ...c });
      }
    return out;
  }, [result, range]);

  const agg = useMemo(() => {
    if (!rows) return null;
    const live = rows.filter((r) => r.status !== "waived");
    const sum = (xs: Row[]) => xs.reduce((s, r) => s + r.amount_cents, 0);
    const bySource = (k: Row["kind"]) => live.filter((r) => r.kind === k);
    return {
      live,
      waived: rows.filter((r) => r.status === "waived"),
      total: sum(live),
      paid: sum(live.filter((r) => r.status === "paid")),
      unpaid: sum(live.filter((r) => r.status === "accrued" || r.status === "invoiced")),
      disputed: sum(live.filter((r) => r.status === "disputed")),
      guide: sum(bySource("guide")),
      referral: sum(bySource("referral")),
    };
  }, [rows]);

  /** Group live rows by a booking-derived key, remember a photo id and the
   * company, total them, descending. */
  const topBy = (key: (b: BookingDetailed) => string | null) => {
    if (!agg) return [];
    const m = new Map<string, { total: number; paid: number; unpaid: number; slug: string | null; company: string }>();
    for (const r of agg.live) {
      if (topTab !== "all" && r.kind !== topTab) continue;
      const k = key(r.booking);
      if (!k) continue;
      const e = m.get(k) ?? { total: 0, paid: 0, unpaid: 0, slug: r.booking.destination_id, company: r.booking.company_name ?? "" };
      e.total += r.amount_cents;
      if (r.status === "paid") e.paid += r.amount_cents;
      else if (r.status !== "disputed") e.unpaid += r.amount_cents;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  };

  const chartData = useMemo(() => {
    if (!agg || agg.live.length === 0) return null;
    const byDay = new Map<string, { guide: number; referral: number }>();
    for (const r of agg.live) {
      const d = r.booking.booked_at.slice(0, 10);
      const e = byDay.get(d) ?? { guide: 0, referral: 0 };
      e[r.kind] += r.amount_cents / 100;
      byDay.set(d, e);
    }
    const keys = [...byDay.keys()].sort();
    return {
      labels: keys.map((k) => formatDay(k) ?? k),
      guide: keys.map((k) => byDay.get(k)!.guide),
      referral: keys.map((k) => byDay.get(k)!.referral),
    };
  }, [agg]);

  const exportCsv = () => {
    if (!rows) return;
    const out = [
      ["booking", "company", "source", "booked", "amount_eur", "commission_eur", "rate_bps", "status"],
      ...rows.map((r) => [
        r.booking.product_name ?? r.booking.destination_name ?? r.booking.id.slice(0, 8),
        r.booking.company_name ?? "", r.kind, r.booking.booked_at.slice(0, 10),
        r.booking.value_cents !== null ? (r.booking.value_cents / 100).toFixed(2) : "",
        (r.amount_cents / 100).toFixed(2), String(r.rate_bps ?? ""), r.status,
      ]),
    ];
    const csv = out.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "icefall-commissions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pctOf = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}% of total` : "—");

  /** The drawing's sample figures, shaped for the layout. */
  const sampleSlots = (): Slots => ({
    tiles: M!.tiles,
    charts: { labels: M!.chartLabels, guide: M!.guideSeries, referral: M!.referralSeries },
    donut: {
      guide: M!.donut.guide, referral: M!.donut.referral, centre: M!.donut.centre,
      guideLine: "€14,850.00 (47.5%)", referralLine: "€16,440.00 (52.5%)",
    },
    companies: M!.topCompanies,
    products: M!.topProducts,
    mountains: M!.topMountains,
    largest: M!.largest,
    unpaid: M!.unpaid,
    summary: M!.summary,
  });

  /** Live figures shaped for the drawn layout. */
  const liveSlots = (): Slots => {
    const a = agg!;
    const name = (b: BookingDetailed) => b.product_name ?? b.destination_name ?? b.id.slice(0, 8);
    const unpaidPer = (k: Row["kind"]) =>
      a.live.filter((r) => r.kind === k && (r.status === "accrued" || r.status === "invoiced")).reduce((s, r) => s + r.amount_cents, 0);
    const paidPer = (k: Row["kind"]) =>
      a.live.filter((r) => r.kind === k && r.status === "paid").reduce((s, r) => s + r.amount_cents, 0);
    return {
      tiles: [
        {
          label: "Total Commission (all sources)", value: eur2(a.total),
          sub: a.waived.length > 0 ? `excludes ${eur(a.waived.reduce((s, r) => s + r.amount_cents, 0))} waived` : "waived excluded, none exists",
          delta: null,
        },
        { label: "Paid", value: eur2(a.paid), sub: pctOf(a.paid, a.total), delta: null },
        { label: "Unpaid / Pending", value: eur2(a.unpaid), sub: pctOf(a.unpaid, a.total), delta: null },
        { label: `Guide Commissions (${GUIDE_COMMISSION_PCT}% of fee)`, value: eur2(a.guide), sub: pctOf(a.guide, a.total), delta: null },
        { label: "Expedition Placements (referral)", value: eur2(a.referral), sub: pctOf(a.referral, a.total), delta: null },
      ],
      charts: chartData,
      donut: {
        guide: a.guide, referral: a.referral, centre: eur(a.total),
        guideLine: `${eur2(a.guide)} (${a.total > 0 ? ((a.guide / a.total) * 100).toFixed(1) : "0"}%)`,
        referralLine: `${eur2(a.referral)} (${a.total > 0 ? ((a.referral / a.total) * 100).toFixed(1) : "0"}%)`,
      },
      companies: topBy((b) => b.company_name).map(([n, v]) => ({ name: n, total: eur(v.total), paid: eur(v.paid), unpaid: eur(v.unpaid) })),
      products: topBy((b) => b.product_name).map(([n, v]) => ({ name: n, company: v.company, total: eur(v.total), slug: v.slug })),
      mountains: topBy((b) => b.destination_name).map(([n, v]) => ({ name: n, total: eur(v.total), slug: v.slug })),
      largest: [...a.live].sort((x, y) => y.amount_cents - x.amount_cents).slice(0, 8).map((r) => ({
        name: name(r.booking), sub: r.booking.company_name ?? "", source: r.kind === "guide" ? "Guide" : "Placement",
        amount: eur2(r.amount_cents), slug: r.booking.destination_id,
      })),
      unpaid: a.live.filter((r) => r.status !== "paid").map((r) => ({
        name: name(r.booking), company: r.booking.company_name ?? "",
        source: r.kind === "guide" ? "Guide" : "Placement",
        date: formatDay(r.booking.booked_at) ?? r.booking.booked_at.slice(0, 10),
        // An accrued commission HAS no due date — it has no invoice yet.
        due: r.status === "invoiced" ? "with its invoice" : "not invoiced yet",
        // An em dash: the booking's value was never reported. Not €0.
        amount: r.booking.value_cents !== null ? eur2(r.booking.value_cents) : "—",
        commission: eur2(r.amount_cents), status: r.status.toUpperCase(), slug: r.booking.destination_id,
      })),
      summary: [
        [`Guide Commissions (${GUIDE_COMMISSION_PCT}%)`, eur(a.guide), eur(paidPer("guide")), eur(unpaidPer("guide")), a.total > 0 ? `${((a.guide / a.total) * 100).toFixed(1)}%` : "—"],
        ["Expedition Placements", eur(a.referral), eur(paidPer("referral")), eur(unpaidPer("referral")), a.total > 0 ? `${((a.referral / a.total) * 100).toFixed(1)}%` : "—"],
        ["Total", eur(a.total), eur(a.paid), eur(a.unpaid), "100%"],
      ],
    };
  };

  /** THE drawn layout — written once, fed by either source. */
  const render = (S: Slots, sample: boolean) => (
    <div className="flex flex-col gap-4">
      {/* ── One row: five tiles + the two-sources explainer, far right ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(300px,1.8fr)]">
        {S.tiles.map((t) => (
          <Card key={t.label} size="sm">
            <CardHeader>
              <CardDescription className="text-xs">{t.label}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {/* All five figures are ink. They used to be split — two of them
                  painted in a hardcoded orange — but that hue is gone from the
                  product, and a colour that no longer means anything is worse
                  than no colour. What the two placement figures ARE told apart
                  by is the legend swatch, which now matches its own series. */}
              <div className="font-medium text-xl leading-none tracking-tight tabular-nums">{t.value}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* A delta only ever renders on the drawing's sample figures.
                    A real one needs a prior-period snapshot and ICEFALL keeps
                    none, so live mode passes `delta: null` on all five and this
                    Badge — the theme's signature element on a stat tile —
                    simply does not appear. */}
                {t.delta && (
                  <Badge
                    variant="outline"
                    className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
                  >
                    <TrendingUp />
                    {t.delta}
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">{t.sub}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm leading-none">Two distinct sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2.5">
              {/* The theme's icon square, tinted with the series colour so the
                  two sources stay matched to their lines on the charts above. */}
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-ui-muted"
                style={{ color: GUIDE_INK }}
              >
                <User className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  Guide Commissions ({GUIDE_COMMISSION_PCT}% of Guide Fee)
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                  {GUIDE_COMMISSION_PCT}% of the guide&rsquo;s fee. Deducted from the amount the climber pays. No extra is added.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-ui-muted"
                style={{ color: PLACEMENT_INK }}
              >
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-sm">Expedition Placement Commissions</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                  Referral commission on expedition or trek placements. Rate and basis vary by agreement.
                </p>
                {/* Inert in the drawing and inert here — nothing routes off it,
                    so it stays a line of text rather than becoming a button
                    that does nothing when pressed. */}
                <p className="mt-1 font-medium text-xs">View rate details →</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Commission over time (by source)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SeriesLegend />
            {S.charts ? (
              <LineChart series={[S.charts.guide, S.charts.referral]} labels={S.charts.labels} />
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">
                The chart draws itself from the first commission in this range — none exists yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Commission by source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Donut segments={[{ value: S.donut.guide }, { value: S.donut.referral }]} centre={S.donut.centre} />
              <div className="space-y-2 text-sm">
                <p>
                  <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: DONUT_COLORS[0] }} aria-hidden />
                  Guide Commissions ({GUIDE_COMMISSION_PCT}%)
                  <span className="block text-muted-foreground tabular-nums">{S.donut.guideLine}</span>
                </p>
                <p>
                  <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: DONUT_COLORS[1] }} aria-hidden />
                  Expedition Placements
                  <span className="block text-muted-foreground tabular-nums">{S.donut.referralLine}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Commission by day</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SeriesLegend />
            {S.charts ? (
              <Bars series={[S.charts.guide, S.charts.referral]} labels={S.charts.labels} />
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">Nothing to bucket by day yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Four top lists, tabs inside each card, photos on every row ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Top companies by commission</CardTitle>
          </CardHeader>
          <CardContent>
            <ListTabs value={sample ? undefined : topTab} onChange={sample ? undefined : setTopTab} />
            {S.companies.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing in this source yet.</p>
            ) : (
              // FOUR COLUMNS IN A ~300px CARD. The three money columns are
              // held at 11px — the theme's own smallest type, from its
              // `pipeline-activity` card — because at 12px they take enough
              // width to truncate the company name to nothing. Measured: the
              // name column went to zero. Nothing is dropped; the numbers are
              // one step smaller than the name they sit beside.
              <div className="grid grid-cols-[minmax(0,2fr)_auto_auto_auto] items-center gap-x-1.5 text-[11px]">
                <span className={MINI_HEAD}>Company</span>
                <span className={cn(MINI_HEAD, "text-right")}>Total</span>
                <span className={cn(MINI_HEAD, "text-right")}>Paid</span>
                <span className={cn(MINI_HEAD, "text-right")}>Unpaid</span>
                {S.companies.map((c) => (
                  <div key={c.name} className="col-span-4 grid grid-cols-subgrid items-center border-border/50 border-t py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <LogoDot name={c.name} />
                      <span className="truncate font-medium">{c.name}</span>
                    </span>
                    <span className="whitespace-nowrap text-right text-[10px] tabular-nums">{c.total}</span>
                    <span className="whitespace-nowrap text-right text-[10px] text-muted-foreground tabular-nums">{c.paid}</span>
                    <span className="whitespace-nowrap text-right text-[10px] text-muted-foreground tabular-nums">{c.unpaid}</span>
                  </div>
                ))}
              </div>
            )}
            <ViewAllLink>View all companies</ViewAllLink>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Top products by commission</CardTitle>
          </CardHeader>
          <CardContent>
            <ListTabs value={sample ? undefined : topTab} onChange={sample ? undefined : setTopTab} />
            {S.products.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing in this source yet.</p>
            ) : (
              <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_auto] items-center gap-x-2 text-[11px]">
                <span className={MINI_HEAD}>Product</span>
                <span className={MINI_HEAD}>Company</span>
                <span className={cn(MINI_HEAD, "text-right")}>Commission</span>
                {S.products.map((p) => (
                  <div key={p.name} className="col-span-3 grid grid-cols-subgrid items-center border-border/50 border-t py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Thumb slug={p.slug} />
                      <span className="truncate font-medium">{p.name}</span>
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">{p.company}</span>
                    <span className="whitespace-nowrap text-right text-[11px] tabular-nums">{p.total}</span>
                  </div>
                ))}
              </div>
            )}
            <ViewAllLink>View all products</ViewAllLink>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Top mountains / treks</CardTitle>
          </CardHeader>
          <CardContent>
            <ListTabs value={sample ? undefined : topTab} onChange={sample ? undefined : setTopTab} />
            {S.mountains.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing in this source yet.</p>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-xs">
                <span className={MINI_HEAD}>Mountain / Trek</span>
                <span className={cn(MINI_HEAD, "text-right")}>Total Commission</span>
                {S.mountains.map((m) => (
                  <div key={m.name} className="col-span-2 grid grid-cols-subgrid items-center border-border/50 border-t py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Thumb slug={m.slug} />
                      <span className="truncate font-medium">{m.name}</span>
                    </span>
                    <span className="text-right tabular-nums">{m.total}</span>
                  </div>
                ))}
              </div>
            )}
            <ViewAllLink>View all mountains / treks</ViewAllLink>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Largest individual commissions</CardTitle>
          </CardHeader>
          <CardContent>
            {S.largest.length === 0 ? (
              <p className="text-muted-foreground text-sm">No commission rows yet.</p>
            ) : (
              <div className="grid grid-cols-[minmax(0,2fr)_auto_auto] items-center gap-x-2 text-[11px]">
                <span className={MINI_HEAD}>Booking / Placement</span>
                <span className={MINI_HEAD}>Source</span>
                <span className={cn(MINI_HEAD, "text-right")}>Commission</span>
                {S.largest.map((l, i) => (
                  <div key={l.name + i} className="col-span-3 grid grid-cols-subgrid items-center border-border/50 border-t py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Thumb slug={l.slug} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{l.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{l.sub}</span>
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{l.source}</span>
                    <span className="whitespace-nowrap text-right text-[11px] font-medium tabular-nums">{l.amount}</span>
                  </div>
                ))}
              </div>
            )}
            <ViewAllLink>View all</ViewAllLink>
          </CardContent>
        </Card>
      </div>

      {/* ── Unpaid table + summary ──────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Unpaid / Pending Commissions</CardTitle>
          </CardHeader>
          {S.unpaid.length === 0 ? (
            <CardContent>
              <p className="text-muted-foreground text-sm">Nothing outstanding.</p>
            </CardContent>
          ) : (
            <CardContent className="px-0">
              {/* NINE COLUMNS, so this table takes px-3 / py-3 rather than the
                  px-4 / py-4 the theme applies to its own five-column
                  Opportunities table. Everything else — 44px heads at `text-sm
                  font-medium text-foreground`, rows at border/50 — is the
                  theme's, unchanged. */}
              <Table className="**:data-[slot='table-cell']:px-3 **:data-[slot='table-head']:px-3 **:data-[slot='table-cell']:py-3">
                <TableHeader className="border-t **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm">
                  <TableRow>
                    <TableHead>Booking / Placement</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Commission ({GUIDE_COMMISSION_PCT}%)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="**:data-[slot='table-row']:border-border/50">
                  {S.unpaid.map((u, i) => (
                    <TableRow key={u.name + i}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2.5">
                          <Thumb slug={u.slug} className="size-8" />
                          {u.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.company}</TableCell>
                      <TableCell className="text-muted-foreground">{u.source}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{u.date}</TableCell>
                      {/* "not invoiced yet" / "with its invoice" — an accrued
                          commission HAS no due date, and inventing one here is
                          exactly the kind of tidy-looking lie this table refuses. */}
                      <TableCell className="text-muted-foreground tabular-nums">{u.due}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.amount}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{u.commission}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            u.status === "OVERDUE" || u.status === "DISPUTED"
                              ? "border-destructive/20 bg-destructive/10 text-destructive"
                              : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {u.status}
                        </Badge>
                      </TableCell>
                      {/* Inert in the drawing, inert here. Kept as plain text
                          rather than promoted to a button: nothing routes off
                          it yet, and a control that looks like it acts and does
                          not is the same class of problem as a figure that
                          looks measured and is not. */}
                      <TableCell className="font-medium">View</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
          <CardFooter>
            <p className="font-medium text-sm">View all unpaid →</p>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Commission summary by source</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {/* FIVE MONEY COLUMNS IN THE NARROW HALF of a [1.5fr 1fr] split.
                At the theme's px-4 / text-sm this table has to be scrolled
                sideways to reach "% of Total", which is the one column the
                summary exists for. It takes px-2 / text-xs instead — the
                Table component's OWN default padding, and one step down the
                theme's type scale — and fits. The chrome is otherwise
                identical to the tables above. */}
            <Table className="**:data-[slot='table-cell']:px-2 **:data-[slot='table-head']:px-2 **:data-[slot='table-cell']:py-2.5 text-xs">
              <TableHeader className="border-t **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-xs">
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Total Commission</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Unpaid</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="**:data-[slot='table-row']:border-border/50">
                {S.summary.map(([src, total, paid, unpaid, pct], i) => (
                  <TableRow key={src} className={cn(i === S.summary.length - 1 && "font-medium")}>
                    <TableCell className="font-medium">{src}</TableCell>
                    <TableCell className="text-right tabular-nums">{total}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{paid}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{unpaid}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{pct}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Guide commissions are {GUIDE_COMMISSION_PCT}% of the guide fee (deducted from customer payment).
              Placement commissions are per agreement.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Head
        title="Commissions"
        subtitle="Track and analyse all ICEFALL commission earnings."
        actions={
          <>
            {M ? (
              // The drawing prints a fixed range rather than offering the
              // picker, because its figures are fixed. Drawn as the theme's
              // outline Button chrome, but as a span: it is not pressable.
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm">
                {M.range}
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              </span>
            ) : (
              <RangeControl value={range} onChange={setRange} presets={[30, 90]} />
            )}
            <Button variant="outline">
              <SlidersHorizontal data-icon="inline-start" /> Filters
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download data-icon="inline-start" /> Export
            </Button>
          </>
        }
      />
      {M ? (
        render(sampleSlots(), true)
      ) : (
        <Resolve
          result={result}
          what="commissions"
          isEmpty={(v) => v.every((b) => b.commissions.length === 0)}
          empty="No commissions recorded. One is computed when a booking converts, and it carries that day's rate forever."
        >
          {() => (agg ? render(liveSlots(), false) : null)}
        </Resolve>
      )}
    </div>
  );
}
