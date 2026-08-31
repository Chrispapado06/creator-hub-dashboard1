import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, Download, SlidersHorizontal, TrendingUp, User } from "lucide-react";
import { Button, Card, PageHead, Pill, SectionLabel, TableCard } from "@/components/ui";
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

  const orange = "text-[oklch(0.62_0.14_60)]";

  /** THE drawn layout — written once, fed by either source. */
  const render = (S: Slots, sample: boolean) => (
    <>
      {/* ── One row: five tiles + the two-sources explainer, far right ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(280px,1.8fr)]">
        {S.tiles.map((t, i) => (
          <Card key={t.label} className="py-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">{t.label}</p>
            <p className={cn("tnum mt-1.5 text-[19px] font-extrabold leading-tight", i === 2 || i === 4 ? orange : "text-ink")}>{t.value}</p>
            <p className={cn("mt-1 flex items-center gap-1 text-[11px]", i === 3 ? "text-accent-ink" : i === 4 ? orange : "text-faint")}>
              {t.delta && <span className="flex items-center gap-0.5 font-medium text-ok"><TrendingUp size={11} strokeWidth={2.25} aria-hidden />{t.delta}</span>}
              {t.sub}
            </p>
          </Card>
        ))}
        <Card className="py-4">
          <SectionLabel>Two distinct sources</SectionLabel>
          <div className="mt-2.5 space-y-3">
            <div className="flex gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><User size={13} strokeWidth={2.25} /></span>
              <div>
                <p className="text-[12px] font-semibold text-accent-ink">Guide Commissions ({GUIDE_COMMISSION_PCT}% of Guide Fee)</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                  {GUIDE_COMMISSION_PCT}% of the guide's fee. Deducted from the amount the climber pays. No extra is added.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full bg-butter", orange)}><Building2 size={13} strokeWidth={2.25} /></span>
              <div>
                <p className={cn("text-[12px] font-semibold", orange)}>Expedition Placement Commissions</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                  Referral commission on expedition or trek placements. Rate and basis vary by agreement.
                </p>
                <p className="mt-1 text-[11.5px] font-medium text-accent-ink">View rate details →</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr_1.3fr]">
        <Card>
          <SectionLabel>Commission over time (by source)</SectionLabel>
          <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden />Guide Commissions ({GUIDE_COMMISSION_PCT}%)</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.71_0.16_55)]" aria-hidden />Expedition Placements</span>
          </div>
          {S.charts ? (
            <LineChart series={[S.charts.guide, S.charts.referral]} labels={S.charts.labels} />
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              The chart draws itself from the first commission in this range — none exists yet.
            </p>
          )}
        </Card>
        <Card>
          <SectionLabel>Commission by source</SectionLabel>
          <div className="mt-3 flex items-center gap-4">
            <Donut segments={[{ value: S.donut.guide }, { value: S.donut.referral }]} centre={S.donut.centre} />
            <div className="space-y-2 text-[12.5px]">
              <p><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: DONUT_COLORS[0] }} aria-hidden />Guide Commissions ({GUIDE_COMMISSION_PCT}%)<span className="tnum block text-muted">{S.donut.guideLine}</span></p>
              <p><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: DONUT_COLORS[1] }} aria-hidden />Expedition Placements<span className="tnum block text-muted">{S.donut.referralLine}</span></p>
            </div>
          </div>
        </Card>
        <Card>
          <SectionLabel>Commission by day</SectionLabel>
          <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden />Guide Commissions ({GUIDE_COMMISSION_PCT}%)</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.71_0.16_55)]" aria-hidden />Expedition Placements</span>
          </div>
          {S.charts ? (
            <Bars series={[S.charts.guide, S.charts.referral]} labels={S.charts.labels} />
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-faint">Nothing to bucket by day yet.</p>
          )}
        </Card>
      </div>

      {/* ── Four top lists, tabs inside each card, photos on every row ── */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <SectionLabel>Top companies by commission</SectionLabel>
          <ListTabs value={sample ? undefined : topTab} onChange={sample ? undefined : setTopTab} />
          {S.companies.length === 0 ? (
            <p className="mt-1 text-[12px] text-faint">Nothing in this source yet.</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,2fr)_auto_auto_auto] items-center gap-x-1.5 gap-y-0 text-[11px]">
              <span className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Company</span>
              <span className="pb-1.5 text-right text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Total</span>
              <span className="pb-1.5 text-right text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Paid</span>
              <span className="pb-1.5 text-right text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Unpaid</span>
              {S.companies.map((c) => (
                <div key={c.name} className="col-span-4 grid grid-cols-subgrid items-center border-t border-line-soft py-1.5">
                  <span className="flex min-w-0 items-center gap-2"><LogoDot name={c.name} /><span className="truncate font-medium text-ink">{c.name}</span></span>
                  <span className="tnum text-right text-[10px] text-ink">{c.total}</span>
                  <span className="tnum text-right text-[10px] text-muted">{c.paid}</span>
                  <span className="tnum text-right text-[10px] text-muted">{c.unpaid}</span>
                </div>
              ))}
            </div>
          )}
          <ViewAllLink>View all companies</ViewAllLink>
        </Card>
        <Card>
          <SectionLabel>Top products by commission</SectionLabel>
          <ListTabs value={sample ? undefined : topTab} onChange={sample ? undefined : setTopTab} />
          {S.products.length === 0 ? (
            <p className="mt-1 text-[12px] text-faint">Nothing in this source yet.</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_auto] items-center gap-x-1.5 text-[11px]">
              <span className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Product</span>
              <span className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Company</span>
              <span className="pb-1.5 text-right text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Commission</span>
              {S.products.map((p) => (
                <div key={p.name} className="col-span-3 grid grid-cols-subgrid items-center border-t border-line-soft py-1.5">
                  <span className="flex min-w-0 items-center gap-2"><Thumb slug={p.slug} /><span className="truncate font-medium text-ink">{p.name}</span></span>
                  <span className="truncate text-[10.5px] text-muted">{p.company}</span>
                  <span className="tnum text-right text-[10.5px] text-ink">{p.total}</span>
                </div>
              ))}
            </div>
          )}
          <ViewAllLink>View all products</ViewAllLink>
        </Card>
        <Card>
          <SectionLabel>Top mountains / treks</SectionLabel>
          <ListTabs value={sample ? undefined : topTab} onChange={sample ? undefined : setTopTab} />
          {S.mountains.length === 0 ? (
            <p className="mt-1 text-[12px] text-faint">Nothing in this source yet.</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 text-[11px]">
              <span className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Mountain / Trek</span>
              <span className="pb-1.5 text-right text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Total Commission</span>
              {S.mountains.map((m) => (
                <div key={m.name} className="col-span-2 grid grid-cols-subgrid items-center border-t border-line-soft py-1.5">
                  <span className="flex min-w-0 items-center gap-2"><Thumb slug={m.slug} /><span className="truncate font-medium text-ink">{m.name}</span></span>
                  <span className="tnum text-right text-ink">{m.total}</span>
                </div>
              ))}
            </div>
          )}
          <ViewAllLink>View all mountains / treks</ViewAllLink>
        </Card>
        <Card>
          <SectionLabel>Largest individual commissions</SectionLabel>
          {S.largest.length === 0 ? (
            <p className="mt-2 text-[12px] text-faint">No commission rows yet.</p>
          ) : (
            <div className="mt-2 grid grid-cols-[minmax(0,2fr)_auto_auto] items-center gap-x-1.5 text-[11px]">
              <span className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Booking / Placement</span>
              <span className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Source</span>
              <span className="pb-1.5 text-right text-[10px] font-medium uppercase tracking-[0.05em] text-faint">Commission</span>
              {S.largest.map((l, i) => (
                <div key={l.name + i} className="col-span-3 grid grid-cols-subgrid items-center border-t border-line-soft py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Thumb slug={l.slug} />
                    <span className="min-w-0"><span className="block truncate font-medium text-ink">{l.name}</span><span className="block truncate text-[10.5px] text-faint">{l.sub}</span></span>
                  </span>
                  <span className="text-[10.5px] text-muted">{l.source}</span>
                  <span className="tnum text-right text-[10.5px] font-semibold text-ink">{l.amount}</span>
                </div>
              ))}
            </div>
          )}
          <ViewAllLink>View all</ViewAllLink>
        </Card>
      </div>

      {/* ── Unpaid table + summary ──────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <TableCard>
          <div className="px-4 pb-1 pt-4"><SectionLabel>Unpaid / Pending Commissions</SectionLabel></div>
          {S.unpaid.length === 0 ? (
            <p className="px-4 pb-4 text-[12.5px] text-faint">Nothing outstanding.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                  <th className="px-4 py-2 font-medium">Booking / Placement</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Due Date</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Commission ({GUIDE_COMMISSION_PCT}%)</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {S.unpaid.map((u, i) => (
                  <tr key={u.name + i} className="border-t border-line-soft">
                    <td className="px-4 py-2.5 font-medium text-ink">
                      <span className="flex items-center gap-2.5"><Thumb slug={u.slug} className="h-8 w-8" />{u.name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{u.company}</td>
                    <td className="px-3 py-2.5 text-muted">{u.source}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5 text-muted">{u.date}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5 text-muted">{u.due}</td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{u.amount}</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold text-ink">{u.commission}</td>
                    <td className="px-3 py-2.5"><Pill tone={u.status === "OVERDUE" || u.status === "DISPUTED" ? "red" : "amber"}>{u.status}</Pill></td>
                    <td className="px-3 py-2.5 text-[12px] font-medium text-accent-ink">View</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-4 py-2.5 text-[12px] font-medium text-accent-ink">View all unpaid →</p>
        </TableCard>
        <Card>
          <SectionLabel>Commission summary by source</SectionLabel>
          <table className="mt-2 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 text-right font-medium">Total Commission</th>
                <th className="py-2 text-right font-medium">Paid</th>
                <th className="py-2 text-right font-medium">Unpaid</th>
                <th className="py-2 text-right font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {S.summary.map(([src, total, paid, unpaid, pct], i) => (
                <tr key={src} className={cn("border-t", i === S.summary.length - 1 ? "border-line font-bold" : "border-line-soft")}>
                  <td className="py-2.5 font-medium text-ink">{src}</td>
                  <td className="tnum py-2.5 text-right text-ink">{total}</td>
                  <td className="tnum py-2.5 text-right text-muted">{paid}</td>
                  <td className="tnum py-2.5 text-right text-muted">{unpaid}</td>
                  <td className="tnum py-2.5 text-right text-muted">{pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
            Guide commissions are {GUIDE_COMMISSION_PCT}% of the guide fee (deducted from customer payment).
            Placement commissions are per agreement.
          </p>
        </Card>
      </div>
    </>
  );

  return (
    <>
      <PageHead
        title="Commissions"
        subtitle="Track and analyse all ICEFALL commission earnings."
        actions={
          <div className="flex items-center gap-2">
            {M ? (
              <span className="flex items-center gap-2 rounded-tile border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink">
                {M.range} <CalendarDays size={13} strokeWidth={2} className="text-faint" aria-hidden />
              </span>
            ) : (
              <RangeControl value={range} onChange={setRange} presets={[30, 90]} />
            )}
            <Button variant="secondary"><SlidersHorizontal size={13} strokeWidth={2} /> Filters</Button>
            <Button variant="secondary" onClick={exportCsv}><Download size={14} strokeWidth={2} /> Export</Button>
          </div>
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
    </>
  );
}
