import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BookMarked, Building2, CalendarDays, ChevronDown, Compass, SlidersHorizontal, TrendingUp, Users as UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
 *
 * ── RE-SKIN (theme match, Sep 2026) ────────────────────────────────────────
 * The layout is now the reference theme's: metric cards across the top with a
 * neutral icon square and a solid delta pill, cards as the only surface, tables
 * inside cards. NOTHING WAS REMOVED. The date chip, the Filters chip, the range
 * control, both View-all links and every honest empty state are the same
 * controls and the same words as before — the tile TINTS went (butter, sky,
 * lilac, mint were ICEFALL identity and the theme has no accent hue at all),
 * and the country ramp went from a blue heat scale to the theme's neutral chart
 * ramp so the legend still ranks without claiming a hue the theme does not own.
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

/**
 * The neutral rank ramp for the country list.
 *
 * The theme carries five greys and nothing else, so a ranked list reads by
 * LIGHTNESS rather than by hue. Ninth place falls back to the muted text grey
 * rather than wrapping round to first place's ink.
 */
const RANK_DOT = ["--chart-5", "--chart-4", "--chart-3", "--chart-2", "--chart-1"];
const rankDot = (i: number) => `var(${RANK_DOT[i] ?? "--muted-foreground"})`;

/**
 * The theme's own status-badge idiom, lifted from its users table: an outline
 * badge tinted at 10% with a solid dot. Used here for the drawn wait times,
 * which are a traffic light in the mockup and must stay one.
 */
const WAIT_TONE = {
  ok: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  bad: "border-destructive/20 bg-destructive/10 text-destructive",
} as const;

/* ── Tiles ─────────────────────────────────────────────────────────────── */

/**
 * The theme's metric card, with the honesty branch kept.
 *
 * `value === null` prints the reason and NOTHING ELSE — no number, no dash, no
 * delta pill. A tile that cannot say what it means says why, and a big grey
 * dash in the number slot would read across a room exactly like a measurement.
 */
function Kpi({
  icon, label, value, caption, reason, delta,
}: {
  icon: React.ReactNode; label: string;
  value: string | null; caption: string; reason?: string; delta?: string;
}) {
  // "12.4% vs May 17 – May 23" → pill "12.4%", line "vs May 17 – May 23".
  const split = delta ? delta.split(/\s+vs\s+/) : null;
  const deltaPart = split ? split[0] : null;
  const againstPart = split && split.length > 1 ? `vs ${split.slice(1).join(" vs ")}` : null;
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
          <p className="text-muted-foreground text-sm leading-snug">{reason}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
              {deltaPart && (
                <Badge>
                  <TrendingUp className="size-3" />
                  {deltaPart}
                </Badge>
              )}
            </div>
            {/* The theme's pill holds the movement and the line under it holds
                what the movement is against — so the comparison window is moved
                down here rather than dropped. It is a second claim, and losing
                it would leave a percentage with nothing to be a percentage of. */}
            {caption && <p className="text-muted-foreground text-sm">{caption}</p>}
            {againstPart && <p className="text-muted-foreground text-xs">{againstPart}</p>}
          </>
        )}
      </CardContent>
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
    <div className="flex flex-col gap-4 md:gap-6">
      {/* ── Page head ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-3xl tracking-tight">Dashboard</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            {M
              ? "Welcome back, Christos. Here's what's happening with ICEFALL today."
              : `Welcome back${me ? `, ${me.displayName.split(" ")[0]}` : ""}. Here's what's happening with ICEFALL today.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {M ? (
            <>
              {/* Drawn, not wired — spans rather than buttons, exactly as before.
                  The demo face copies the drawing; nothing here filters. */}
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium">
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> May 24 – May 30, 2026
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium">
                <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden /> Filters
              </span>
            </>
          ) : (
            <RangeControl value={range} onChange={setRange} />
          )}
        </div>
      </div>

      {/* ── KPI tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs md:grid-cols-2 xl:grid-cols-5 dark:*:data-[slot=card]:bg-card">
        {M ? (
          <>
            {[
              <UsersIcon key="u" className="size-4" />,
              <Compass key="g" className="size-4" />,
              <Building2 key="c" className="size-4" />,
              <BookMarked key="b" className="size-4" />,
            ].map((icon, i) => (
              <Kpi
                key={M.kpis[i].label}
                icon={icon}
                label={M.kpis[i].label}
                value={M.kpis[i].value}
                caption={M.kpis[i].caption}
                delta={M.kpis[i].delta}
              />
            ))}
            {/* The owner drew this tile's honesty themselves. It stays. */}
            <Kpi
              icon={<Activity className="size-4" />}
              label="Active Users"
              value={null}
              caption=""
              reason="Not being measured yet. We're working on it."
            />
          </>
        ) : (
          <>
            <Kpi
              icon={<UsersIcon className="size-4" />}
              label="Total Users"
              value={counts.state === "ok" ? counts.value.users.toLocaleString("en-GB") : null}
              caption="Registered accounts"
              reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
            />
            <Kpi
              icon={<Compass className="size-4" />}
              label="Total Guides"
              value={counts.state === "ok" ? counts.value.guides.toLocaleString("en-GB") : null}
              caption="Guide profiles"
              reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
            />
            <Kpi
              icon={<Building2 className="size-4" />}
              label="Total Expedition Companies"
              value={counts.state === "ok" ? counts.value.companies.toLocaleString("en-GB") : null}
              caption="Registered companies"
              reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
            />
            <Kpi
              icon={<BookMarked className="size-4" />}
              label="Total Bookings"
              value={counts.state === "ok" ? counts.value.bookings.toLocaleString("en-GB") : null}
              caption="All time"
              reason={counts.state === "loading" ? "Counting…" : "reason" in counts ? counts.reason : undefined}
            />
            {/* The owner drew this tile's honesty themselves. Keep their words. */}
            <Kpi
              icon={<Activity className="size-4" />}
              label="Active Users"
              value={null}
              caption=""
              reason="Not being measured yet. We're working on it."
            />
          </>
        )}
      </div>

      {/* ── Users by Country ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Users by Country</CardTitle>
        </CardHeader>
        <CardContent>
          {M ? (
            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-2">
                {M.countries.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: rankDot(i) }} aria-hidden />
                      <span>{c.name}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {c.n} ({c.pct})
                    </span>
                  </div>
                ))}
              </div>
              <div className="relative min-h-[180px]">
                {/* The demo face draws the map (stylised dot-grid, hot markets in
                    the chart ramp) — the drawing has one and the face copies the
                    drawing. The LIVE branch below keeps its honest no-map gap. */}
                <WorldDots className="max-h-[300px]" />
                <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
                  Low
                  <span
                    className="h-1.5 w-24 rounded-full"
                    style={{ background: "linear-gradient(to right,var(--chart-1),var(--chart-5))" }}
                    aria-hidden
                  />
                  High
                </div>
              </div>
            </div>
          ) : countryStats === null ? (
            <p className="text-muted-foreground text-sm">
              {countries.state === "loading" ? "Reading profiles…" : "reason" in countries ? countries.reason : ""}
            </p>
          ) : countryStats.stated.length === 0 ? (
            <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
              No user has stated a country yet — location is set by people in the phone app, never
              guessed from an IP.{countryStats.unstated > 0 && ` ${countryStats.unstated} account${countryStats.unstated === 1 ? " has" : "s have"} no location on file.`}
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-2">
                {countryStats.stated.slice(0, 9).map(([code, n], i) => (
                  <div key={code} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: rankDot(i) }} aria-hidden />
                      <span>{countryName(code)}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {n.toLocaleString("en-GB")} ({((n / countryStats.total) * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
                {countryStats.unstated > 0 && (
                  <p className="pt-1 text-muted-foreground text-xs">
                    {countryStats.unstated} account{countryStats.unstated === 1 ? "" : "s"} with no stated location — counted nowhere rather than guessed.
                  </p>
                )}
              </div>
              <div className="grid min-h-[180px] place-items-center rounded-lg bg-ui-muted">
                {/* Honest gap, stated: no map asset exists in this codebase and
                    geography drawn from memory would be wrong somewhere. The
                    numbers on the left are the live data the map would colour. */}
                <p className="max-w-[300px] p-6 text-center text-muted-foreground text-sm leading-relaxed">
                  The world map arrives with a licensed map asset — the figures beside this space are
                  live, and the map will colour exactly them.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Revenue ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardAction>
              {M ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium">
                  May 24 – May 30, 2026 <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                </span>
              ) : (
                <Badge variant="outline">{rangeLabel(range)}</Badge>
              )}
            </CardAction>
          </CardHeader>
          <CardContent>
            {M ? (
              // Drawn arrangement: the total sits BESIDE the chart, not above it.
              <div className="flex flex-wrap items-start gap-6">
                <div className="shrink-0">
                  <p className="text-muted-foreground text-sm">Total Revenue</p>
                  <p className="mt-1 font-medium text-3xl tabular-nums leading-none tracking-tight">{M.revenue.total}</p>
                  <Badge className="mt-2">
                    <TrendingUp className="size-3" />
                    {M.revenue.delta}
                  </Badge>
                </div>
                <div className="min-w-[260px] flex-1">
                  <LineChart series={[M.revenue.points]} labels={M.revenue.labels} />
                </div>
              </div>
            ) : revRows === null ? (
              <p className="text-muted-foreground text-sm">
                {revenue.state === "loading" ? "Reading the ledger…" : "reason" in revenue ? revenue.reason : ""}
              </p>
            ) : revRows.length === 0 ? (
              <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
                No revenue recognised in this range. The ledger is real and currently empty — the
                chart draws itself the day money is recorded.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">Total in range</p>
                <p className="mt-1 font-medium text-3xl tabular-nums leading-none tracking-tight">{eur(revTotal)}</p>
                {chart && <LineChart series={[chart.points]} labels={chart.labels} />}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {M ? (
              <div className="flex flex-wrap items-center gap-5">
                <Donut segments={M.breakdownValues.map((v) => ({ value: v }))} centre={M.breakdownCentre} />
                <div className="min-w-0 flex-1 space-y-2.5">
                  {M.breakdown.map((b, i) => (
                    <div key={b.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate">{b.label}</span>
                          <span className="block truncate text-muted-foreground text-xs">{b.sub}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">{b.amount} {b.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : breakdown === null ? (
              <p className="text-muted-foreground text-sm">
                {revenue.state === "loading" ? "Reading the ledger…" : "reason" in revenue ? revenue.reason : ""}
              </p>
            ) : breakdown.length === 0 ? (
              <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
                Nothing to break down — no revenue is recognised in this range.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-5">
                <Donut segments={breakdown.map(([, v]) => ({ value: v }))} centre={eur(revTotal)} />
                <div className="min-w-0 flex-1 space-y-2.5">
                  {breakdown.map(([stream, cents], i) => (
                    <div key={stream} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden />
                        <span>{STREAM_LABEL[stream]}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {eur(cents)} ({((cents / Math.max(revTotal, 1)) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Subscriptions: named because the mockup names it; absent because
                nothing exists to measure. Absence, not zero. */}
            {!M && breakdown !== null && !breakdown.some(([s]) => s === "subscription") && (
              <p className="mt-3 border-t border-border pt-2.5 text-muted-foreground text-xs leading-relaxed">
                Subscriptions — no subscription product exists yet, so there is nothing to measure here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent activity (drawn: three cards across, markets included) ── */}
      <div className={cn("grid gap-4 md:gap-6", M ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
        <Card>
          <CardHeader>
            <CardTitle>Recent Bookings</CardTitle>
            <CardAction>
              <Button asChild variant="link" size="sm" className="px-0!">
                <Link to="/admin/bookings">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {M ? (
              <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-normal text-muted-foreground">Booking ID</TableHead>
                    <TableHead className="font-normal text-muted-foreground">Mountain / Trek</TableHead>
                    <TableHead className="font-normal text-muted-foreground">Company / Guide</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Amount</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {M.recentBookings.map((b) => (
                    <TableRow key={b.ref} className="border-border/60">
                      <TableCell className="py-3 font-medium tabular-nums">{b.ref}</TableCell>
                      <TableCell className="py-3">{b.trip}</TableCell>
                      <TableCell className="py-3 text-muted-foreground">{b.company}</TableCell>
                      <TableCell className="py-3 text-right font-medium tabular-nums">{b.amount}</TableCell>
                      <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{b.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : bookings.state !== "ok" ? (
              <p className="px-4 text-muted-foreground text-sm">
                {bookings.state === "loading" ? "Reading…" : "reason" in bookings ? bookings.reason : ""}
              </p>
            ) : bookings.value.length === 0 ? (
              <p className="px-4 text-muted-foreground text-sm leading-relaxed">
                No bookings recorded yet — the first appears here the moment one is.
              </p>
            ) : (
              <Table className="**:data-[slot=table-cell]:px-4">
                <TableBody>
                  {bookings.value.map((b) => (
                    <TableRow key={b.id} className="border-border/60">
                      <TableCell className="py-3 font-medium tabular-nums">{b.id.slice(0, 8)}</TableCell>
                      {/* The em dash: this booking records no destination. */}
                      <TableCell className="py-3">{b.destination ?? "—"}</TableCell>
                      <TableCell className="py-3 text-muted-foreground">{b.company ?? ""}</TableCell>
                      <TableCell className="py-3 text-right font-medium tabular-nums">
                        {b.value_cents !== null ? eur(b.value_cents) : <span className="font-normal text-muted-foreground">no value set</span>}
                      </TableCell>
                      <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{utc.format(new Date(b.booked_at))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Enquiries</CardTitle>
            <CardAction>
              <Button asChild variant="link" size="sm" className="px-0!">
                <Link to="/admin/leads">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {M ? (
              <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-normal text-muted-foreground">Enquiry ID</TableHead>
                    <TableHead className="font-normal text-muted-foreground">Topic</TableHead>
                    <TableHead className="font-normal text-muted-foreground">Company / Guide</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Wait Time</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {M.recentEnquiries.map((e) => (
                    <TableRow key={e.ref} className="border-border/60">
                      <TableCell className="py-3 font-medium tabular-nums">{e.ref}</TableCell>
                      <TableCell className="py-3">{e.topic}</TableCell>
                      <TableCell className="py-3 text-muted-foreground">{e.who}</TableCell>
                      <TableCell className="py-3 text-right">
                        {/* The drawing's traffic-light wait colours, in the
                            theme's own status-badge idiom. */}
                        <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium tabular-nums", WAIT_TONE[e.tone as keyof typeof WAIT_TONE] ?? WAIT_TONE.ok)}>
                          {e.wait}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{e.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : waiting === null ? (
              <p className="px-4 text-muted-foreground text-sm">
                {enquiries.state === "loading" ? "Reading…" : "reason" in enquiries ? enquiries.reason : ""}
              </p>
            ) : waiting.length === 0 ? (
              <p className="px-4 text-muted-foreground text-sm leading-relaxed">
                Nobody is waiting. Enquiries from every app land here the moment they are sent.
              </p>
            ) : (
              <Table className="**:data-[slot=table-cell]:px-4">
                <TableBody>
                  {waiting.slice(0, 5).map((e) => (
                    <TableRow key={e.id} className="border-border/60">
                      <TableCell className="py-3 font-medium">{e.object_label}</TableCell>
                      <TableCell className="py-3 text-muted-foreground">{e.sender_name ?? e.sender_email ?? e.sender_kind}</TableCell>
                      <TableCell className="py-3 text-right">
                        <Badge variant="outline" className="gap-1.5 border-amber-500/20 bg-amber-500/10 px-2 py-1 font-medium text-amber-600 tabular-nums dark:text-amber-400">
                          {waitedLabel(e.created_at)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{utc.format(new Date(e.created_at))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {M && (
          <Card>
            <CardHeader>
              <CardTitle>Top Markets</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-normal text-muted-foreground">Country</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Users</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Bookings</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {M.topMarkets.map((m) => (
                    <TableRow key={m.name} className="border-border/60">
                      <TableCell className="py-3 font-medium">{m.name}</TableCell>
                      <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{m.users}</TableCell>
                      <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{m.bookings}</TableCell>
                      <TableCell className="py-3 text-right tabular-nums">{m.revenue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Top markets (live layout: its own full-width card) ─────────── */}
      {!M && (
        <Card>
          <CardHeader>
            <CardTitle>Top Markets</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {countryStats === null || countryStats.stated.length === 0 ? (
              <p className="px-4 text-muted-foreground text-sm leading-relaxed">
                Markets appear when users state a country — none has yet.
              </p>
            ) : (
              <>
                <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-normal text-muted-foreground">Country</TableHead>
                      <TableHead className="text-right font-normal text-muted-foreground">Users</TableHead>
                      <TableHead className="text-right font-normal text-muted-foreground">Bookings</TableHead>
                      <TableHead className="text-right font-normal text-muted-foreground">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countryStats.stated.slice(0, 5).map(([code, n]) => (
                      <TableRow key={code} className="border-border/60">
                        <TableCell className="py-3 font-medium">{countryName(code)}</TableCell>
                        <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{n.toLocaleString("en-GB")}</TableCell>
                        {/* Not a dash and not a zero: nothing links a payment to
                            a stated country, so the cell says which it is. */}
                        <TableCell className="py-3 text-right text-muted-foreground">not linked</TableCell>
                        <TableCell className="py-3 text-right text-muted-foreground">not linked</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-3 px-4 text-muted-foreground text-xs leading-relaxed">
                  Bookings and revenue are not attributable to a customer's country yet — nothing links
                  a payment to a person's stated location, so those columns say so instead of guessing.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>All times shown in UTC</span>
        {M ? <span>{M.updated}</span> : asOf && <span className="tabular-nums">Data as of {utcTime.format(asOf)} UTC</span>}
      </div>
    </div>
  );
}
