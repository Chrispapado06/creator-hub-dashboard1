import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EllipsisVertical, ExternalLink, Info, Pencil, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Resolve } from "@/components/states";
import { LineChart } from "@/components/charts";
import {
  listBookingsDetailed,
  listCompanies,
  listEnquiries,
  listPlacementRows,
  listProducts,
  type BookingDetailed,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, Enquiry, Product } from "@/data/types";
import { cn, formatDay } from "@/lib/utils";
import { PRODUCTS_MOCKUP } from "@/demo/mockupScreens";

/**
 * One product, the CRM's view — ONE screen in the owner's hierarchy
 * (breadcrumb → title row → tabs with the date pill → tiles → charts → three
 * cards → banner), two data sources per the 31 Aug ruling. SHOW_DEMO_DATA
 * fills the sample figures; flag off, everything derives from real rows in the
 * same skeleton. Commission stays visible here because this is the CRM
 * (routing ruling: the operator's version of this shape must never show
 * ICEFALL's commission, and is filed as a request).
 *
 * The owner drew two things that survive VERBATIM in both modes: the Views
 * tile and the About-views banner. They wrote that copy themselves, twice
 * running.
 *
 * The "Verified Company" chip is DRAWN — it renders on sample figures only.
 * Live, the company card states the verification status in the settled
 * wording (documents checked; never a bare "Verified" claim). Deltas are
 * sample-only: a real delta needs a prior-period snapshot and none is kept.
 *
 * ── THE RE-SKIN ───────────────────────────────────────────────────────────
 * The skeleton is the reference theme's record page now: its breadcrumb, its
 * identity header, its LINE TABS, its stat tiles and its cards. Two notes on
 * what did NOT change:
 *   · The five tabs still only have Overview behind them, and the content still
 *     STAYS PUT when another is selected. They are deliberately not wired to
 *     `TabsContent`: doing so would blank the page on a tab that has nothing,
 *     which is worse than the tab that does nothing today.
 *   · The four hardcoded tangerine chart colours are gone. Both charts now take
 *     the neutral ramp `charts.tsx` defaults to, and the legend swatches were
 *     re-pointed at the same two ramp entries, so a swatch cannot disagree with
 *     the line it labels.
 */

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

/**
 * One headline figure, in the theme's stat-tile shape.
 *
 * A `null` value prints `sub` — the reason — in muted text, never a dash and
 * never a zero. The delta badge is the theme's own; it renders only where a
 * prior period genuinely exists, which today is the sample set alone.
 */
function Tile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string | null;
  sub?: string;
  delta?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-sm leading-snug text-muted-foreground">{sub}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</div>
              {delta && (
                <Badge
                  variant="outline"
                  className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
                >
                  <TrendingUp />
                  {delta}
                </Badge>
              )}
            </div>
            {sub && (
              <p className="text-sm text-muted-foreground">
                {sub}
                {delta ? " · vs 1 – 31 Jul 2026" : ""}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The owner's words, verbatim — do not paraphrase.
 *
 * Deliberately NOT drawn at the size the figures use: "Not measured" is a
 * sentence about the absence of a measurement, and setting it in the tile's
 * number type would make it read across a room as a figure.
 */
function ViewsTile() {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Views</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="font-medium text-lg leading-tight">Not measured</p>
        <p className="text-sm leading-snug text-muted-foreground">
          We do not currently track views. This metric is not available.
        </p>
      </CardContent>
    </Card>
  );
}

/** A key/value line inside a detail card. */
function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

/** The two chart series, in the neutral order `charts.tsx` draws them. */
function ChartLegend({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-chart-5" aria-hidden />
        {a}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-chart-2" aria-hidden />
        {b}
      </span>
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

const TAB_NAMES = ["Overview", "Bookings", "Enquiries", "Payouts", "Placement"];

export default function ProductDetail() {
  const { id } = useParams();
  const M = PRODUCTS_MOCKUP;
  const sampleRow = M?.rows.find((r) => r.id === id) ?? null;
  const d = M?.detail ?? null;
  const samplePrimary = sampleRow !== null && d !== null && sampleRow.id === d.id;

  const [tab, setTab] = useState("Overview");
  const [products, setProducts] = useState<Result<Product[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [bookings, setBookings] = useState<Result<BookingDetailed[]>>(loading);
  const [enquiries, setEnquiries] = useState<Result<Enquiry[]>>(loading);
  const [placements, setPlacements] = useState<Result<{ id: string; product_id: string | null; destination_id: string; slot_position: number; status: string; price_cents: number | null; starts_on: string; ends_on: string }[]>>(loading);

  useEffect(() => {
    if (sampleRow) return; // sample mode reads nothing
    void listProducts().then(setProducts);
    void listCompanies().then(setCompanies);
    void listBookingsDetailed().then(setBookings);
    void listEnquiries().then(setEnquiries);
    void listPlacementRows().then(setPlacements);
  }, [sampleRow]);

  const product = products.state === "ok" ? products.value.find((p) => p.id === id) ?? null : null;
  const company =
    companies.state === "ok" && product
      ? companies.value.find((c) => c.id === product.company_id) ?? null
      : null;

  const mine = useMemo(
    () => (bookings.state === "ok" && id ? bookings.value.filter((b) => b.product_id === id) : []),
    [bookings, id],
  );
  const myEnquiries = useMemo(
    () => (enquiries.state === "ok" && id ? enquiries.value.filter((e) => e.product_id === id) : []),
    [enquiries, id],
  );
  const myPlacement =
    placements.state === "ok" && id
      ? placements.value.find((p) => p.product_id === id && (p.status === "active" || p.status === "reserved")) ?? null
      : null;

  const revenue = mine.reduce((s, b) => s + (b.value_cents ?? 0), 0);
  const valueless = mine.filter((b) => b.value_cents === null).length;
  const commission = mine.reduce((s, b) => s + b.commissions.reduce((x, c) => x + c.amount_cents, 0), 0);
  const converted = myEnquiries.filter((e) => e.answered_at !== null).length;

  const chart = useMemo(() => {
    if (mine.length === 0 && myEnquiries.length === 0) return null;
    const days = new Map<string, { b: number; e: number; rev: number; com: number }>();
    const get = (iso: string) => {
      const k = iso.slice(0, 10);
      if (!days.has(k)) days.set(k, { b: 0, e: 0, rev: 0, com: 0 });
      return days.get(k)!;
    };
    for (const b of mine) {
      const e = get(b.booked_at);
      e.b++;
      e.rev += (b.value_cents ?? 0) / 100;
      e.com += b.commissions.reduce((x, c) => x + c.amount_cents, 0) / 100;
    }
    for (const q of myEnquiries) get(q.created_at).e++;
    const keys = [...days.keys()].sort();
    return {
      labels: keys.map((k) => formatDay(k) ?? k),
      bookings: keys.map((k) => days.get(k)!.b),
      enquiries: keys.map((k) => days.get(k)!.e),
      revenue: keys.map((k) => days.get(k)!.rev),
      commission: keys.map((k) => days.get(k)!.com),
    };
  }, [mine, myEnquiries]);

  /** All-products aggregates for the company card, from real rows. */
  const companyAgg = useMemo(() => {
    if (!company || products.state !== "ok" || bookings.state !== "ok") return null;
    const ids = new Set(products.value.filter((p) => p.company_id === company.id).map((p) => p.id));
    const theirs = bookings.value.filter((b) => b.product_id && ids.has(b.product_id));
    return {
      products: ids.size,
      bookings: theirs.length,
      revenue: theirs.reduce((s, b) => s + (b.value_cents ?? 0), 0),
      commission: theirs.reduce((s, b) => s + b.commissions.reduce((x, c) => x + c.amount_cents, 0), 0),
    };
  }, [company, products, bookings]);

  /** THE skeleton — one function, slotted from either source. */
  const frame = (S: {
    name: string;
    statusChip: React.ReactNode;
    metaLine: React.ReactNode;
    rangeLabel: string;
    tiles: React.ReactNode;
    charts: React.ReactNode;
    about: React.ReactNode;
    companyCard: React.ReactNode;
    placementCard: React.ReactNode;
  }) => (
    <div className="flex flex-col gap-4 md:gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/products">Products</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{S.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Title row: name + chip left, the actions right. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-heading font-semibold text-xl leading-6 tracking-tight sm:text-2xl sm:leading-7">
              {S.name}
            </h1>
            {S.statusChip}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{S.metaLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm">
            <Pencil data-icon="inline-start" /> Edit Product
          </Button>
          <Button size="sm">
            View on Platform <ExternalLink data-icon="inline-end" />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="More">
            <EllipsisVertical />
          </Button>
        </div>
      </div>

      {/* Tab row with the date pill on the right. Only Overview has content
          behind it; the rest render and the content STAYS PUT, which is why
          this is a TabsList without TabsContent — wiring panes would blank the
          page on a tab that has nothing to show. */}
      <Tabs value={tab} onValueChange={setTab} className="flex-col gap-0">
        <div className="flex items-center justify-between gap-4 border-b">
          <div className="no-scrollbar min-w-0 touch-pan-x overflow-x-auto overscroll-x-contain">
            <TabsList variant="line" className="h-8 w-max justify-start gap-4 *:data-[slot=tabs-trigger]:flex-none">
              {TAB_NAMES.map((t) => (
                <TabsTrigger key={t} value={t} className={LINE_TAB}>
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <span className="inline-flex h-7 shrink-0 items-center rounded-[min(var(--radius-md),12px)] border border-border px-2.5 text-[0.8rem]">
            {S.rangeLabel}
          </span>
        </div>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{S.tiles}</div>
      <div className="grid gap-4 xl:grid-cols-2">{S.charts}</div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>About this product</CardTitle>
          </CardHeader>
          <CardContent>{S.about}</CardContent>
        </Card>
        {S.companyCard}
        {S.placementCard}
      </div>

      {/* The owner's banner, verbatim — written by them, twice running. */}
      <div className="flex items-start gap-3 rounded-xl border bg-ui-muted/50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium text-sm">About views</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            ICEFALL does not currently record view counts, impressions or click-through data.
            We are focused on revenue, bookings and enquiries — the metrics that matter.
          </p>
        </div>
      </div>
    </div>
  );

  /* ── Sample figures ─────────────────────────────────────────────────── */
  if (sampleRow && M && d) {
    // Rows other than the drawn one reuse its layout with their own headline
    // numbers — the drawing specifies one detail; the rest exist so every row
    // opens somewhere sensible.
    const tiles = samplePrimary
      ? d.tiles
      : [
          { label: "Bookings", value: String(sampleRow.bookings), sub: "Total", delta: "58%" },
          { label: "Revenue generated", value: sampleRow.revenue, sub: "Total", delta: "42%" },
          { label: "ICEFALL Commission (15%)", value: sampleRow.commission, sub: "Total", delta: "42%" },
          { label: "Enquiries", value: String(sampleRow.enquiries), sub: "Total", delta: "37%" },
          { label: "Enquiries → Bookings", value: sampleRow.conv, sub: "Converted", delta: "56%" },
          { label: "Placement income", value: sampleRow.placement && sampleRow.placement !== "Draft" ? "€5,000" : "—", sub: sampleRow.placement ?? "no placement", delta: null },
        ];
    return frame({
      name: sampleRow.name,
      statusChip: (
        <Badge
          variant="outline"
          className="rounded-full border-emerald-500/20 bg-emerald-500/10 px-2.5 text-emerald-600 dark:text-emerald-400"
        >
          PUBLISHED
        </Badge>
      ),
      metaLine: (
        <>
          <Badge variant="outline" className="rounded-full px-2.5">{sampleRow.mountain}</Badge>
          <span>Sold by <span className="font-medium text-foreground">{sampleRow.company}</span></span>
        </>
      ),
      rangeLabel: d.range,
      tiles: (
        <>
          {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} sub={t.sub} delta={t.delta} />)}
          <ViewsTile />
        </>
      ),
      charts: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Bookings over time</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <ChartLegend a="Bookings" b="Enquiries" />
              <LineChart series={[d.bookingsSeries, d.enquiriesSeries]} labels={d.chartLabels} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Revenue over time</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <ChartLegend a="Revenue" b="ICEFALL Commission (15%)" />
              <LineChart series={[d.revenueSeries, d.commissionSeries]} labels={d.chartLabels} />
            </CardContent>
          </Card>
        </>
      ),
      about: (
        <dl className="flex flex-col gap-1.5">
          {d.about.map(([k, v]) => <Row key={k} k={k} v={<span className="font-medium">{v}</span>} />)}
        </dl>
      ),
      companyCard: (
        <Card>
          <CardHeader>
            <CardTitle>Company: {d.companyCard.name}</CardTitle>
            {/* Drawn chip — sample figures only; live states the settled wording. */}
            {d.companyCard.verified && (
              <CardAction>
                <Badge variant="outline" className="rounded-full px-2.5">Verified Company</Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="flex flex-col gap-1.5">
              {d.companyCard.rows.map(([k, v]) => (
                <Row key={k} k={k} v={<span className="font-medium tabular-nums">{v}</span>} />
              ))}
            </dl>
            <Button variant="outline" size="sm" className="self-start">View company profile</Button>
          </CardContent>
        </Card>
      ),
      placementCard: (
        <Card>
          <CardHeader>
            <CardTitle>Placement / Slot</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="flex flex-col gap-1.5">
              {d.placementCard.map(([k, v]) => (
                <Row
                  key={k}
                  k={k}
                  v={
                    v === "Active" ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-emerald-500/20 bg-emerald-500/10 px-2.5 text-emerald-600 dark:text-emerald-400"
                      >
                        Active
                      </Badge>
                    ) : (
                      <span className="font-medium">{v}</span>
                    )
                  }
                />
              ))}
            </dl>
            <Button variant="outline" size="sm" className="self-start">Manage placement</Button>
          </CardContent>
        </Card>
      ),
    });
  }

  /* ── Live rows ──────────────────────────────────────────────────────── */
  return (
    <Resolve result={products} what="the product">
      {() =>
        !product ? (
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">No product with this id.</p>
            </CardContent>
          </Card>
        ) : (
          frame({
            name: product.name,
            statusChip: (
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2.5",
                  product.status === "live"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : product.status === "pending_review"
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-border bg-ui-muted/50 text-muted-foreground",
                )}
              >
                {product.status}
              </Badge>
            ),
            metaLine: (
              <>
                <Badge variant="outline" className="rounded-full px-2.5">{product.kind}</Badge>
                {company && (
                  <span>
                    Sold by{" "}
                    <Link to={`/admin/companies/${company.id}`} className="font-medium text-foreground hover:underline">
                      {company.name}
                    </Link>
                  </span>
                )}
              </>
            ),
            rangeLabel: "All time",
            tiles: (
              <>
                <Tile label="Bookings" value={String(mine.length)} sub="linked to this product" />
                <Tile
                  label="Revenue recorded"
                  value={eur(revenue)}
                  sub={valueless > 0 ? `${valueless} booking${valueless === 1 ? "" : "s"} carry no value yet` : "sum of booking values"}
                />
                <Tile
                  label="ICEFALL commission"
                  value={commission > 0 ? eur(commission) : null}
                  sub={commission > 0 ? "from stored commission rows" : "no commission recorded on these bookings"}
                />
                <Tile
                  label="Company earnings"
                  value={commission > 0 ? eur(revenue - commission) : null}
                  sub={commission > 0 ? "derived: revenue − commission" : "needs a commission to derive from"}
                />
                <Tile label="Enquiries" value={String(myEnquiries.length)} sub="about this product" />
                <Tile
                  label="Enquiries → answered"
                  value={myEnquiries.length > 0 ? `${converted} / ${myEnquiries.length}` : null}
                  sub={myEnquiries.length > 0 ? "answered by the desk" : "no enquiries yet"}
                />
                <Tile
                  label="Placement income"
                  value={myPlacement?.price_cents != null ? eur(myPlacement.price_cents) : null}
                  sub={
                    myPlacement
                      ? myPlacement.price_cents != null
                        ? `slot #${myPlacement.slot_position} · agreed price`
                        : `slot #${myPlacement.slot_position} — price not yet agreed, never free`
                      : "no live placement names this product"
                  }
                />
                <ViewsTile />
              </>
            ),
            charts: (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Bookings over time</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {chart ? (
                      <>
                        <ChartLegend a="Bookings" b="Enquiries" />
                        <LineChart series={[chart.bookings, chart.enquiries]} labels={chart.labels} />
                      </>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        No bookings or enquiries yet — the chart draws itself from the first one.
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue over time</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {chart && mine.length > 0 ? (
                      <>
                        <ChartLegend a="Revenue" b="ICEFALL Commission" />
                        <LineChart series={[chart.revenue, chart.commission]} labels={chart.labels} />
                      </>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        No booking values recorded yet — this chart draws itself from the first one.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            ),
            about: (
              <dl className="flex flex-col gap-1.5">
                {(
                  [
                    ["Product type", product.kind],
                    ["Duration", product.duration_days_min !== null ? `${product.duration_days_min}${product.duration_days_max !== null && product.duration_days_max !== product.duration_days_min ? `–${product.duration_days_max}` : ""} days` : null],
                    ["Difficulty", product.difficulty],
                    ["Best season", product.season],
                    ["Max altitude", product.max_altitude_m !== null ? `${product.max_altitude_m.toLocaleString("en-GB")} m` : null],
                    ["Price", product.price_state === "known" && product.price_from_cents !== null ? `${eur(product.price_from_cents)} per person` : `price ${product.price_state.replaceAll("_", " ")}`],
                    ["Status", `${product.status}${product.live_at ? ` since ${formatDay(product.live_at)}` : ""}`],
                  ] as const
                ).map(([k, v]) => (
                  // "not recorded" rather than a dash: the column exists and
                  // nobody has filled it in.
                  <Row key={k} k={k} v={<span className={v ? "font-medium" : "text-muted-foreground"}>{v ?? "not recorded"}</span>} />
                ))}
              </dl>
            ),
            companyCard: company ? (
              <Card>
                <CardHeader>
                  <CardTitle>Company: {company.name}</CardTitle>
                  {/* Never a bare "Verified" claim — the settled wording only. */}
                  <CardAction>
                    <span className="text-xs text-muted-foreground">
                      {company.verification_status === "verified"
                        ? "documents checked"
                        : company.verification_status.replaceAll("_", " ")}
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <dl className="flex flex-col gap-1.5">
                    {(
                      companyAgg
                        ? ([
                            ["Total products", String(companyAgg.products)],
                            ["Total bookings (all products)", String(companyAgg.bookings)],
                            ["Total revenue (all products)", eur(companyAgg.revenue)],
                            ["Total commission", eur(companyAgg.commission)],
                            ["This product earnings", eur(revenue - commission)],
                          ] as [string, string][])
                        : ([["Aggregates", "…"]] as [string, string][])
                    ).map(([k, v]) => (
                      <Row key={k} k={k} v={<span className="font-medium tabular-nums">{v}</span>} />
                    ))}
                  </dl>
                  <Button variant="outline" size="sm" className="self-start" asChild>
                    <Link to={`/admin/companies/${company.id}`}>View company profile</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Company</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Reading the company…</p>
                </CardContent>
              </Card>
            ),
            placementCard: (
              <Card>
                <CardHeader>
                  <CardTitle>Placement / Slot</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {myPlacement ? (
                    <dl className="flex flex-col gap-1.5">
                      <Row k="Position" v={<span className="font-medium">#{myPlacement.slot_position}</span>} />
                      <Row k="Mountain" v={myPlacement.destination_id} />
                      <Row
                        k="Term"
                        v={
                          <span className="tabular-nums">
                            {formatDay(myPlacement.starts_on)} – {formatDay(myPlacement.ends_on)}
                          </span>
                        }
                      />
                      <Row
                        k="Agreed price"
                        v={
                          <span className="tabular-nums">
                            {myPlacement.price_cents != null ? eur(myPlacement.price_cents) : "not yet agreed — never free"}
                          </span>
                        }
                      />
                      <Row
                        k="Status"
                        v={
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2.5",
                              myPlacement.status === "active"
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                            )}
                          >
                            {myPlacement.status}
                          </Badge>
                        }
                      />
                    </dl>
                  ) : (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      No live or reserved placement names this product. Placements are managed on the
                      Placements screen.
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="self-start" asChild>
                    <Link to="/admin/placements">Manage placement</Link>
                  </Button>
                </CardContent>
              </Card>
            ),
          })
        )
      }
    </Resolve>
  );
}
