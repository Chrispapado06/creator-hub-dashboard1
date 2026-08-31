import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BookMarked, Building2, CalendarDays, ChevronDown, Compass, SlidersHorizontal, TrendingUp, Users as UsersIcon } from "lucide-react";
import { Card, PageHead, Pill, SectionLabel } from "@/components/ui";
import {
  dashboardCounts,
  listCountryCodes,
  listEnquiries,
  listRevenue,
  recentBookings,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Enquiry, RevenueRecord } from "@/data/types";
import { cn, formatDay } from "@/lib/utils";
import { useStaff } from "@/auth/session";
import { Donut, DONUT_COLORS, LineChart } from "@/components/charts";
import { DASHBOARD_MOCKUP } from "@/demo/mockupScreens";
import { WorldDots } from "@/components/drawn";
import { RangeControl, rangeBounds, type RangeValue } from "@/components/controls";

/**
 * Dashboard — ONE screen in the owner's drawn layout (their 31 Aug ruling
 * made the mockups the production design), two data sources: SHOW_DEMO_DATA
 * fills the drawing's sample figures; flag off, every tile reads the live
 * database and honest states render inside the same layout.
 *
 * WHAT THE MOCKUP ITSELF RULED: the owner hand-drew an Active Users tile
 * reading "Not being measured yet / We're working on it" — the honesty
 * doctrine in their own handwriting. It renders VERBATIM in both modes.
 * Live-mode stances:
 *
 *   - DELTAS on sample figures only. "+12.4% vs prior week" needs a prior
 *     snapshot and ICEFALL keeps none, so live figures render without
 *     comparison claims. A delta is a second claim, not decoration.
 *   - SUBSCRIPTIONS: named in the live breakdown as honestly absent — no
 *     subscription product exists, so there is nothing to measure. Absence,
 *     not zero. (The sample donut carries the drawn Subscriptions segment.)
 *   - NO #BK-#### references live: the schema has none and a display format
 *     is not a reason for a migration. Real identifiers, shortened.
 *   - The COUNTRY MAP: the sample face draws the stylised dot-map (the
 *     drawing has one); live keeps the honest no-map gap beside the real
 *     ranked list until a licensed asset lands — stylised geography must not
 *     colour real figures.
 *
 * ALL TIMES UTC, as the mockup's footer demands — formatted with an explicit
 * UTC formatter, not the viewer's clock, so the footer line is true.
 */

/** Range label for the chip beside the revenue card. */
const rangeLabel = (v: RangeValue): string =>
  v.kind === "all" ? "All time" : v.kind === "days" ? `Last ${v.days} days` : `${formatDay(v.start)} – ${formatDay(v.end)}`;

const utc = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", timeZone: "UTC",
});
const utcTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: "UTC",
});
const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

/** ISO-3166 alpha-2 → display name, from the browser's own registry. */
const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/* ── Tiles ─────────────────────────────────────────────────────────────── */

function Kpi({
  icon, iconCls, label, value, caption, reason, delta,
}: {
  icon: React.ReactNode; iconCls: string; label: string;
  value: string | null; caption: string; reason?: string; delta?: string;
}) {
  return (
    <Card className="flex items-start gap-3.5">
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[12px]", iconCls)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-muted">{label}</span>
        {value === null ? (
          <span className="mt-1 block text-[12px] leading-snug text-faint">{reason}</span>
        ) : (
          <>
            <span className="tnum block text-[24px] font-extrabold leading-tight text-ink">{value}</span>
            <span className="block text-[11.5px] text-faint">{caption}</span>
            {delta && (
              <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-ok">
                <TrendingUp size={11} strokeWidth={2.25} aria-hidden />{delta}
              </span>
            )}
          </>
        )}
      </span>
    </Card>
  );
}

const STREAM_LABEL: Record<RevenueRecord["stream"], string> = {
  placement: "Expedition placements",
  referral: "Referral fees",
  guide_commission: "Guide commissions",
  subscription: "Subscriptions",
  other: "Other",
};

export default function Dashboard() {
  const me = useStaff();
  /**
   * DEMO FACE (owner: "just copy the damn mockups"): with SHOW_DEMO_DATA the
   * screen renders the drawing, number for number, under the global
   * DemoBanner. Flag off → the honest live reads below, untouched.
   */
  const M = DASHBOARD_MOCKUP;
  const [range, setRange] = useState<RangeValue>({ kind: "days", days: 30 });
  const [counts, setCounts] = useState<Result<{ users: number; guides: number; companies: number; bookings: number }>>(loading);
  const [countries, setCountries] = useState<Result<{ country_code: string | null }[]>>(loading);
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [bookings, setBookings] = useState<Result<{ id: string; destination: string | null; company: string | null; value_cents: number | null; booked_at: string }[]>>(loading);
  const [enquiries, setEnquiries] = useState<Result<Enquiry[]>>(loading);
  const [asOf, setAsOf] = useState<Date | null>(null);

  useEffect(() => {
    void dashboardCounts().then(setCounts);
    void listCountryCodes().then(setCountries);
    void listRevenue().then(setRevenue);
    void recentBookings(5).then(setBookings);
    void listEnquiries().then(setEnquiries);
    setAsOf(new Date());
  }, []);

  // ISO strings compare as dates (§6af) — no Date parsing in the filter.
  const bounds = rangeBounds(range);

  const revRows = useMemo(() => {
    if (revenue.state !== "ok") return null;
    return revenue.value.filter(
      (r) => (bounds.start === null || r.recognised_on >= bounds.start) && r.recognised_on <= bounds.end,
    );
  }, [revenue, bounds.start, bounds.end]);

  const revTotal = revRows ? revRows.reduce((s, r) => s + r.amount_cents, 0) : 0;

  const chart = useMemo(() => {
    if (!revRows || revRows.length === 0) return null;
    const byDay = new Map<string, number>();
    for (const r of revRows) byDay.set(r.recognised_on, (byDay.get(r.recognised_on) ?? 0) + r.amount_cents);
    const dayKeys = [...byDay.keys()].sort();
    return {
      points: dayKeys.map((d) => byDay.get(d)! / 100),
      labels: dayKeys.map((d) => utc.format(new Date(d))),
    };
  }, [revRows]);

  const breakdown = useMemo(() => {
    if (!revRows) return null;
    const byStream = new Map<RevenueRecord["stream"], number>();
    for (const r of revRows) byStream.set(r.stream, (byStream.get(r.stream) ?? 0) + r.amount_cents);
    return [...byStream.entries()].sort((a, b) => b[1] - a[1]);
  }, [revRows]);

  const countryStats = useMemo(() => {
    if (countries.state !== "ok") return null;
    const byCode = new Map<string, number>();
    let unstated = 0;
    for (const row of countries.value) {
      if (row.country_code) byCode.set(row.country_code, (byCode.get(row.country_code) ?? 0) + 1);
      else unstated++;
    }
    const stated = [...byCode.entries()].sort((a, b) => b[1] - a[1]);
    const total = stated.reduce((s, [, n]) => s + n, 0);
    return { stated, total, unstated };
  }, [countries]);

  const waiting = enquiries.state === "ok"
    ? enquiries.value.filter((e) => e.answered_at === null).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : null;

  const waitedLabel = (iso: string) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
    return mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d`;
  };

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle={M
          ? "Welcome back, Christos. Here's what's happening with ICEFALL today."
          : `Welcome back${me ? `, ${me.displayName.split(" ")[0]}` : ""}. Here's what's happening with ICEFALL today.`}
        actions={
          <div className="flex items-center gap-2">
            {M ? (
              <span className="flex items-center gap-2 rounded-tile border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink">
                <CalendarDays size={13} strokeWidth={2} className="text-faint" aria-hidden /> May 24 – May 30, 2026
                <ChevronDown size={13} strokeWidth={2} className="text-faint" aria-hidden />
              </span>
            ) : (
              <RangeControl value={range} onChange={setRange} />
            )}
            {M && (
              <span className="flex items-center gap-1.5 rounded-tile border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink">
                <SlidersHorizontal size={13} strokeWidth={2} className="text-faint" aria-hidden /> Filters
              </span>
            )}
          </div>
        }
      />

      {/* ── KPI tiles ───────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {M ? (
          <>
            {[
              { icon: <UsersIcon size={19} strokeWidth={2} />, cls: "bg-accent-soft text-accent" },
              { icon: <Compass size={19} strokeWidth={2} />, cls: "bg-mint text-ok" },
              { icon: <Building2 size={19} strokeWidth={2} />, cls: "bg-butter text-[oklch(0.55_0.12_75)]" },
              { icon: <BookMarked size={19} strokeWidth={2} />, cls: "bg-lilac text-[oklch(0.51_0.19_295)]" },
            ].map((ic, i) => (
              <Kpi
                key={M.kpis[i].label}
                icon={ic.icon}
                iconCls={ic.cls}
                label={M.kpis[i].label}
                value={M.kpis[i].value}
                caption={M.kpis[i].caption}
                delta={M.kpis[i].delta}
              />
            ))}
            {/* The owner drew this tile's honesty themselves. It stays. */}
            <Kpi
              icon={<Activity size={19} strokeWidth={2} />}
              iconCls="bg-panel text-muted"
              label="Active Users"
              value={null}
              caption=""
              reason="Not being measured yet. We're working on it."
            />
          </>
        ) : (
          <>
        <Kpi
          icon={<UsersIcon size={19} strokeWidth={2} />} iconCls="bg-accent-soft text-accent"
          label="Total Users"
          value={counts.state === "ok" ? counts.value.users.toLocaleString("en-GB") : null}
          caption="Registered accounts"
          reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
        />
        <Kpi
          icon={<Compass size={19} strokeWidth={2} />} iconCls="bg-mint text-ok"
          label="Total Guides"
          value={counts.state === "ok" ? counts.value.guides.toLocaleString("en-GB") : null}
          caption="Guide profiles"
          reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
        />
        <Kpi
          icon={<Building2 size={19} strokeWidth={2} />} iconCls="bg-butter text-[oklch(0.55_0.12_75)]"
          label="Total Expedition Companies"
          value={counts.state === "ok" ? counts.value.companies.toLocaleString("en-GB") : null}
          caption="Registered companies"
          reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
        />
        <Kpi
          icon={<BookMarked size={19} strokeWidth={2} />} iconCls="bg-lilac text-[oklch(0.51_0.19_295)]"
          label="Total Bookings"
          value={counts.state === "ok" ? counts.value.bookings.toLocaleString("en-GB") : null}
          caption="All time"
          reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
        />
        {/* The owner drew this tile's honesty themselves. Keep their words. */}
        <Kpi
          icon={<Activity size={19} strokeWidth={2} />} iconCls="bg-panel text-muted"
          label="Active Users"
          value={null}
          caption=""
          reason="Not being measured yet. We're working on it."
        />
          </>
        )}
      </div>

      {/* ── Users by Country ───────────────────────────────────────────── */}
      <Card className="mt-4">
        <SectionLabel>Users by Country</SectionLabel>
        {M ? (
          <div className="mt-3 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2">
              {M.countries.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: `oklch(${0.75 - i * 0.045} 0.13 255)` }} aria-hidden />
                    <span className="font-medium text-ink">{c.name}</span>
                  </span>
                  <span className="tnum text-muted">{c.n} <span className="text-faint">({c.pct})</span></span>
                </div>
              ))}
            </div>
            <div className="relative min-h-[180px]">
              {/* The demo face draws the map (stylised dot-grid, hot markets in
                  blue) — the drawing has one and the face copies the drawing.
                  The LIVE branch below keeps its honest no-map gap. */}
              <WorldDots className="max-h-[300px]" />
              <div className="mt-1 flex items-center gap-2 text-[10.5px] text-faint">
                Low
                <span className="h-1.5 w-24 rounded-full" style={{ background: "linear-gradient(to right,#E4ECF7,#5B8DEF)" }} aria-hidden />
                High
              </div>
            </div>
          </div>
        ) : countryStats === null ? (
          <p className="mt-3 text-[12.5px] text-faint">
            {countries.state === "loading" ? "Reading profiles…" : "reason" in countries ? countries.reason : ""}
          </p>
        ) : countryStats.stated.length === 0 ? (
          <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-faint">
            No user has stated a country yet — location is set by people in the phone app, never
            guessed from an IP.{countryStats.unstated > 0 && ` ${countryStats.unstated} account${countryStats.unstated === 1 ? " has" : "s have"} no location on file.`}
          </p>
        ) : (
          <div className="mt-3 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2">
              {countryStats.stated.slice(0, 9).map(([code, n], i) => (
                <div key={code} className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: `oklch(${0.75 - i * 0.05} 0.13 255)` }} aria-hidden />
                    <span className="font-medium text-ink">{countryName(code)}</span>
                  </span>
                  <span className="tnum text-muted">
                    {n.toLocaleString("en-GB")}{" "}
                    <span className="text-faint">({((n / countryStats.total) * 100).toFixed(1)}%)</span>
                  </span>
                </div>
              ))}
              {countryStats.unstated > 0 && (
                <p className="pt-1 text-[11.5px] text-faint">
                  {countryStats.unstated} account{countryStats.unstated === 1 ? "" : "s"} with no stated location — counted nowhere rather than guessed.
                </p>
              )}
            </div>
            <div className="grid min-h-[180px] place-items-center rounded-tile bg-panel">
              {/* Honest gap, stated: no map asset exists in this codebase and
                  geography drawn from memory would be wrong somewhere. The
                  numbers on the left are the live data the map would colour. */}
              <p className="max-w-[300px] p-6 text-center text-[12px] leading-relaxed text-faint">
                The world map arrives with a licensed map asset — the figures beside this space are
                live, and the map will colour exactly them.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── Revenue ────────────────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Revenue Overview</SectionLabel>
            {M ? (
              <span className="flex items-center gap-1.5 rounded-tile border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink">
                May 24 – May 30, 2026 <ChevronDown size={12} strokeWidth={2} className="text-faint" aria-hidden />
              </span>
            ) : (
              <Pill tone="neutral">{rangeLabel(range)}</Pill>
            )}
          </div>
          {M ? (
            // Drawn arrangement: the total sits BESIDE the chart, not above it.
            <div className="mt-3 flex flex-wrap items-start gap-6">
              <div className="shrink-0">
                <p className="text-[12.5px] text-muted">Total Revenue</p>
                <p className="tnum text-[28px] font-extrabold leading-tight text-ink">{M.revenue.total}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11.5px] font-medium text-ok">
                  <TrendingUp size={11} strokeWidth={2.25} aria-hidden />{M.revenue.delta}
                </p>
              </div>
              <div className="min-w-[260px] flex-1">
                <LineChart series={[M.revenue.points]} labels={M.revenue.labels} />
              </div>
            </div>
          ) : revRows === null ? (
            <p className="mt-3 text-[12.5px] text-faint">
              {revenue.state === "loading" ? "Reading the ledger…" : "reason" in revenue ? revenue.reason : ""}
            </p>
          ) : revRows.length === 0 ? (
            <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-faint">
              No revenue recognised in this range. The ledger is real and currently empty — the
              chart draws itself the day money is recorded.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[12.5px] text-muted">Total in range</p>
              <p className="tnum text-[28px] font-extrabold leading-tight text-ink">{eur(revTotal)}</p>
              {chart && <LineChart series={[chart.points]} labels={chart.labels} />}
            </>
          )}
        </Card>

        <Card>
          <SectionLabel>Revenue Breakdown</SectionLabel>
          {M ? (
            <div className="mt-3 flex flex-wrap items-center gap-5">
              <Donut segments={M.breakdownValues.map((v) => ({ value: v }))} centre={M.breakdownCentre} />
              <div className="min-w-0 flex-1 space-y-2.5">
                {M.breakdown.map((b, i) => (
                  <div key={b.label} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{b.label}</span>
                        <span className="block truncate text-[11px] text-faint">{b.sub}</span>
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-muted">{b.amount} <span className="text-faint">{b.pct}</span></span>
                  </div>
                ))}
              </div>
            </div>
          ) : breakdown === null ? (
            <p className="mt-3 text-[12.5px] text-faint">
              {revenue.state === "loading" ? "Reading the ledger…" : "reason" in revenue ? revenue.reason : ""}
            </p>
          ) : breakdown.length === 0 ? (
            <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-faint">
              Nothing to break down — no revenue is recognised in this range.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-5">
              <Donut segments={breakdown.map(([, v]) => ({ value: v }))} centre={eur(revTotal)} />
              <div className="min-w-0 flex-1 space-y-2.5">
                {breakdown.map(([stream, cents], i) => (
                  <div key={stream} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden />
                      <span className="font-medium text-ink">{STREAM_LABEL[stream]}</span>
                    </span>
                    <span className="tnum text-muted">
                      {eur(cents)} <span className="text-faint">({((cents / Math.max(revTotal, 1)) * 100).toFixed(1)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Subscriptions: named because the mockup names it; absent because
              nothing exists to measure. Absence, not zero. */}
          {!M && breakdown !== null && !breakdown.some(([s]) => s === "subscription") && (
            <p className="mt-3 border-t border-line-soft pt-2.5 text-[11.5px] leading-relaxed text-faint">
              Subscriptions — no subscription product exists yet, so there is nothing to measure here.
            </p>
          )}
        </Card>
      </div>

      {/* ── Recent activity (drawn: three cards across, markets included) ── */}
      <div className={cn("mt-4 grid gap-4", M ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Recent Bookings</SectionLabel>
            <Link to="/admin/bookings" className="text-[12px] font-medium text-accent-ink hover:underline">View all</Link>
          </div>
          {M ? (
            <table className="mt-2 w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] text-faint">
                  <th className="py-1.5 pr-3 font-medium">Booking ID</th>
                  <th className="py-1.5 pr-3 font-medium">Mountain / Trek</th>
                  <th className="py-1.5 pr-3 font-medium">Company / Guide</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Amount</th>
                  <th className="py-1.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {M.recentBookings.map((b) => (
                  <tr key={b.ref} className="border-t border-line-soft">
                    <td className="tnum py-2.5 pr-3 font-medium text-accent-ink">{b.ref}</td>
                    <td className="py-2.5 pr-3 text-ink">{b.trip}</td>
                    <td className="py-2.5 pr-3 text-muted">{b.company}</td>
                    <td className="tnum py-2.5 pr-3 text-right font-semibold text-ink">{b.amount}</td>
                    <td className="tnum py-2.5 text-right text-faint">{b.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : bookings.state !== "ok" ? (
            <p className="mt-3 text-[12.5px] text-faint">
              {bookings.state === "loading" ? "Reading…" : "reason" in bookings ? bookings.reason : ""}
            </p>
          ) : bookings.value.length === 0 ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-faint">
              No bookings recorded yet — the first appears here the moment one is.
            </p>
          ) : (
            <table className="mt-2 w-full text-[12.5px]">
              <tbody>
                {bookings.value.map((b) => (
                  <tr key={b.id} className="border-t border-line-soft first:border-0">
                    <td className="tnum py-2.5 pr-3 font-medium text-accent-ink">{b.id.slice(0, 8)}</td>
                    <td className="py-2.5 pr-3 text-ink">{b.destination ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-muted">{b.company ?? ""}</td>
                    <td className="tnum py-2.5 pr-3 text-right font-semibold text-ink">
                      {b.value_cents !== null ? eur(b.value_cents) : <span className="font-normal text-faint">no value set</span>}
                    </td>
                    <td className="tnum py-2.5 text-right text-faint">{utc.format(new Date(b.booked_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Recent Enquiries</SectionLabel>
            <Link to="/admin/leads" className="text-[12px] font-medium text-accent-ink hover:underline">View all</Link>
          </div>
          {M ? (
            <table className="mt-2 w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] text-faint">
                  <th className="py-1.5 pr-3 font-medium">Enquiry ID</th>
                  <th className="py-1.5 pr-3 font-medium">Topic</th>
                  <th className="py-1.5 pr-3 font-medium">Company / Guide</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Wait Time</th>
                  <th className="py-1.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {M.recentEnquiries.map((e) => (
                  <tr key={e.ref} className="border-t border-line-soft">
                    <td className="tnum py-2.5 pr-3 font-medium text-accent-ink">{e.ref}</td>
                    <td className="py-2.5 pr-3 text-ink">{e.topic}</td>
                    <td className="py-2.5 pr-3 text-muted">{e.who}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {/* The drawing's traffic-light wait colours. */}
                      <span className={cn("tnum font-semibold", e.tone === "ok" ? "text-ok" : e.tone === "warn" ? "text-[oklch(0.62_0.14_60)]" : "text-bad")}>{e.wait}</span>
                    </td>
                    <td className="tnum py-2.5 text-right text-faint">{e.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : waiting === null ? (
            <p className="mt-3 text-[12.5px] text-faint">
              {enquiries.state === "loading" ? "Reading…" : "reason" in enquiries ? enquiries.reason : ""}
            </p>
          ) : waiting.length === 0 ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-faint">
              Nobody is waiting. Enquiries from every app land here the moment they are sent.
            </p>
          ) : (
            <table className="mt-2 w-full text-[12.5px]">
              <tbody>
                {waiting.slice(0, 5).map((e) => (
                  <tr key={e.id} className="border-t border-line-soft first:border-0">
                    <td className="py-2.5 pr-3 font-medium text-ink">{e.object_label}</td>
                    <td className="py-2.5 pr-3 text-muted">{e.sender_name ?? e.sender_email ?? e.sender_kind}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className="tnum rounded-pill bg-butter px-2 py-[2px] text-[11.5px] font-semibold text-[oklch(0.5_0.11_75)]">
                        {waitedLabel(e.created_at)}
                      </span>
                    </td>
                    <td className="tnum py-2.5 text-right text-faint">{utc.format(new Date(e.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {M && (
          <Card>
            <SectionLabel>Top Markets</SectionLabel>
            <table className="mt-2 w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] text-faint">
                  <th className="py-1.5 font-medium">Country</th>
                  <th className="py-1.5 text-right font-medium">Users</th>
                  <th className="py-1.5 text-right font-medium">Bookings</th>
                  <th className="py-1.5 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {M.topMarkets.map((m) => (
                  <tr key={m.name} className="border-t border-line-soft">
                    <td className="py-2.5 font-medium text-ink">{m.name}</td>
                    <td className="tnum py-2.5 text-right text-muted">{m.users}</td>
                    <td className="tnum py-2.5 text-right text-muted">{m.bookings}</td>
                    <td className="tnum py-2.5 text-right text-ink">{m.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* ── Top markets (live layout: its own full-width card) ─────────── */}
      {!M && (
      <Card className="mt-4">
        <SectionLabel>Top Markets</SectionLabel>
        {countryStats === null || countryStats.stated.length === 0 ? (
          <p className="mt-3 text-[12.5px] leading-relaxed text-faint">
            Markets appear when users state a country — none has yet.
          </p>
        ) : (
          <>
            <table className="mt-2 w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                  <th className="py-2 font-medium">Country</th>
                  <th className="py-2 text-right font-medium">Users</th>
                  <th className="py-2 text-right font-medium">Bookings</th>
                  <th className="py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {countryStats.stated.slice(0, 5).map(([code, n]) => (
                  <tr key={code} className="border-t border-line-soft">
                    <td className="py-2.5 font-medium text-ink">{countryName(code)}</td>
                    <td className="tnum py-2.5 text-right text-muted">{n.toLocaleString("en-GB")}</td>
                    <td className="py-2.5 text-right text-[11.5px] text-faint">not linked</td>
                    <td className="py-2.5 text-right text-[11.5px] text-faint">not linked</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
              Bookings and revenue are not attributable to a customer's country yet — nothing links
              a payment to a person's stated location, so those columns say so instead of guessing.
            </p>
          </>
        )}
      </Card>
      )}

      <div className="mt-4 flex items-center justify-between text-[11.5px] text-faint">
        <span>All times shown in UTC</span>
        {M ? <span>{M.updated}</span> : asOf && <span className="tnum">Data as of {utcTime.format(asOf)} UTC</span>}
      </div>
    </>
  );
}
