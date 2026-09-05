"use client";
import * as React from "react";

import Link from "next/link";

import { EllipsisVertical, ExternalLink, Info, Pencil } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type { BookingDetailed, Company, Enquiry, PlacementRow, Product, ProductStatus } from "../../_components/data";
import { eur, formatDay } from "../../_components/product-metrics";
import { ok, type Result } from "../../_components/result";
import { Resolve } from "../../_components/states";
import { EditProductDialog } from "./edit-product-dialog";

const TAB_NAMES = ["Overview", "Bookings", "Enquiries", "Payouts", "Placement"];

function statusChipClass(status: ProductStatus) {
  if (status === "live") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "pending_review") return "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-border bg-muted/50 text-muted-foreground";
}

function placementIncomeSub(placement: PlacementRow | null) {
  if (!placement) return "no live placement names this product";
  if (placement.price_cents != null) return `slot #${placement.slot_position} · agreed price`;
  return `slot #${placement.slot_position} — price not yet agreed, never free`;
}

/**
 * One headline figure.
 *
 * A `null` value prints `sub` — the reason — in muted text, never a dash and
 * never a zero. There is no delta badge here: a real delta needs a prior-period
 * snapshot and the CRM keeps none.
 */
function Tile({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-muted-foreground text-sm leading-snug">{sub}</p>
        ) : (
          <>
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
            {sub ? <p className="text-muted-foreground text-sm">{sub}</p> : null}
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
        <p className="text-muted-foreground text-sm leading-snug">
          We do not currently track views. This metric is not available.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

/** Pointed at the same two ramp entries the lines draw with, so a swatch cannot
    disagree with the line it labels. */
function ChartLegend({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex gap-4 text-muted-foreground text-sm">
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

function TwoSeriesChart({
  data,
  aLabel,
  bLabel,
}: {
  data: { day: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
}) {
  const config = {
    a: { label: aLabel, color: "var(--chart-5)" },
    b: { label: bLabel, color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line dataKey="a" type="monotone" stroke="var(--color-a)" strokeWidth={2} dot={false} />
        <Line dataKey="b" type="monotone" stroke="var(--color-b)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}

export function ProductDetail({
  id,
  products: productRows,
  companies: companyRows,
  bookings: bookingRows,
  enquiries: enquiryRows,
  placements: placementRows,
}: {
  id: string;
  products: Product[];
  companies: Company[];
  bookings: BookingDetailed[];
  enquiries: Enquiry[];
  placements: PlacementRow[];
}) {
  // Same five reads as the list; the record filters them by the route id
  // client-side rather than fetching one product.
  const [products] = React.useState<Result<Product[]>>(() => ok(productRows));
  const [companies] = React.useState<Result<Company[]>>(() => ok(companyRows));
  const [bookings] = React.useState<Result<BookingDetailed[]>>(() => ok(bookingRows));
  const [enquiries] = React.useState<Result<Enquiry[]>>(() => ok(enquiryRows));
  const [placements] = React.useState<Result<PlacementRow[]>>(() => ok(placementRows));

  const [tab, setTab] = React.useState("Overview");

  const product = products.state === "ok" ? (products.value.find((p) => p.id === id) ?? null) : null;
  const company =
    companies.state === "ok" && product ? (companies.value.find((c) => c.id === product.company_id) ?? null) : null;

  const mine = React.useMemo(
    () => (bookings.state === "ok" ? bookings.value.filter((b) => b.product_id === id) : []),
    [bookings, id],
  );
  const myEnquiries = React.useMemo(
    () => (enquiries.state === "ok" ? enquiries.value.filter((e) => e.product_id === id) : []),
    [enquiries, id],
  );
  const myPlacement =
    placements.state === "ok"
      ? (placements.value.find((p) => p.product_id === id && (p.status === "active" || p.status === "reserved")) ??
        null)
      : null;

  const revenue = mine.reduce((s, b) => s + (b.value_cents ?? 0), 0);
  const valueless = mine.filter((b) => b.value_cents === null).length;
  const commission = mine.reduce((s, b) => s + b.commissions.reduce((x, c) => x + c.amount_cents, 0), 0);
  // Whether a commission exists is a question about stored rows, not about the
  // sum: bookings that carry commission rows adding up to nothing are a
  // measured €0, and the list column reads the same count so the two screens
  // cannot disagree about whether the figure exists.
  const commissionRows = mine.reduce((s, b) => s + b.commissions.length, 0);
  const converted = myEnquiries.filter((e) => e.answered_at !== null).length;

  const chart = React.useMemo(() => {
    if (mine.length === 0 && myEnquiries.length === 0) return null;
    const days = new Map<string, { b: number; e: number; rev: number; com: number }>();
    const get = (iso: string) => {
      const k = iso.slice(0, 10);
      let entry = days.get(k);
      if (!entry) {
        entry = { b: 0, e: 0, rev: 0, com: 0 };
        days.set(k, entry);
      }
      return entry;
    };
    for (const b of mine) {
      const entry = get(b.booked_at);
      entry.b++;
      entry.rev += (b.value_cents ?? 0) / 100;
      entry.com += b.commissions.reduce((x, c) => x + c.amount_cents, 0) / 100;
    }
    for (const q of myEnquiries) get(q.created_at).e++;
    // ISO dates sort chronologically as strings.
    const keys = [...days.keys()].sort();
    return {
      counts: keys.map((k) => ({
        day: formatDay(k) ?? k,
        a: days.get(k)?.b ?? 0,
        b: days.get(k)?.e ?? 0,
      })),
      money: keys.map((k) => ({
        day: formatDay(k) ?? k,
        a: days.get(k)?.rev ?? 0,
        b: days.get(k)?.com ?? 0,
      })),
    };
  }, [mine, myEnquiries]);

  const companyAgg = React.useMemo(() => {
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

  function notOnPlatform() {
    toast("No platform link for this product", {
      description: "The public URL is not part of this data, so there is nowhere to send you yet.",
    });
  }

  return (
    <Resolve result={products} what="the product">
      {() =>
        product === null ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground text-sm">No product with this id.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4 md:gap-6">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/dashboard/sales/products">Products</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{product.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate font-semibold text-xl leading-6 tracking-tight sm:text-2xl sm:leading-7">
                    {product.name}
                  </h1>
                  <Badge variant="outline" className={cn("rounded-full px-2.5", statusChipClass(product.status))}>
                    {product.status}
                  </Badge>
                </div>
                <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <Badge variant="outline" className="rounded-full px-2.5">
                    {product.kind}
                  </Badge>
                  {company ? (
                    <span>
                      Sold by{" "}
                      <Link href="/dashboard/sales/companies" className="font-medium text-foreground hover:underline">
                        {company.name}
                      </Link>
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <EditProductDialog product={product}>
                  <Button variant="outline" size="sm">
                    <Pencil data-icon="inline-start" /> Edit Product
                  </Button>
                </EditProductDialog>
                <Button size="sm" onClick={notOnPlatform}>
                  View on Platform <ExternalLink data-icon="inline-end" />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="More">
                  <EllipsisVertical />
                </Button>
              </div>
            </div>

            {/* Only Overview has content behind it, and the content STAYS PUT
                when another tab is chosen. Wiring panes would blank the page on
                a tab that has nothing to show, which is worse than a tab that
                does nothing today. */}
            <Tabs value={tab} onValueChange={setTab} className="flex-col gap-0">
              <div className="flex items-center justify-between gap-4 border-b">
                <div className="min-w-0 touch-pan-x overflow-x-auto overscroll-x-contain">
                  <TabsList variant="line" className="h-8 w-max justify-start gap-4">
                    {TAB_NAMES.map((t) => (
                      <TabsTrigger key={t} value={t}>
                        {t}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {/* A label, not a control — no period filtering exists. */}
                <span className="inline-flex h-7 shrink-0 items-center rounded-[min(var(--radius-md),12px)] border px-2.5 text-[0.8rem]">
                  All time
                </span>
              </div>
            </Tabs>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="Bookings" value={String(mine.length)} sub="linked to this product" />
              <Tile
                label="Revenue recorded"
                value={eur(revenue)}
                sub={
                  valueless > 0
                    ? `${valueless} booking${valueless === 1 ? "" : "s"} carry no value yet`
                    : "sum of booking values"
                }
              />
              <Tile
                label="ICEFALL commission"
                value={commissionRows > 0 ? eur(commission) : null}
                sub={commissionRows > 0 ? "from stored commission rows" : "no commission recorded on these bookings"}
              />
              <Tile
                label="Company earnings"
                value={commissionRows > 0 ? eur(revenue - commission) : null}
                sub={commissionRows > 0 ? "derived: revenue − commission" : "needs a commission to derive from"}
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
                sub={placementIncomeSub(myPlacement)}
              />
              <ViewsTile />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Bookings over time</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {chart ? (
                    <>
                      <ChartLegend a="Bookings" b="Enquiries" />
                      <TwoSeriesChart data={chart.counts} aLabel="Bookings" bLabel="Enquiries" />
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm leading-relaxed">
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
                      <TwoSeriesChart data={chart.money} aLabel="Revenue" bLabel="ICEFALL Commission" />
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      No booking values recorded yet — this chart draws itself from the first one.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>About this product</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="flex flex-col gap-1.5">
                    {(
                      [
                        ["Product type", product.kind],
                        [
                          "Duration",
                          product.duration_days_min !== null
                            ? `${product.duration_days_min}${
                                product.duration_days_max !== null &&
                                product.duration_days_max !== product.duration_days_min
                                  ? `–${product.duration_days_max}`
                                  : ""
                              } days`
                            : null,
                        ],
                        ["Difficulty", product.difficulty],
                        ["Best season", product.season],
                        [
                          "Max altitude",
                          product.max_altitude_m !== null
                            ? `${product.max_altitude_m.toLocaleString("en-GB")} m`
                            : null,
                        ],
                        [
                          "Price",
                          product.price_state === "known" && product.price_from_cents !== null
                            ? `${eur(product.price_from_cents)} per person`
                            : `price ${product.price_state.replaceAll("_", " ")}`,
                        ],
                        ["Status", `${product.status}${product.live_at ? ` since ${formatDay(product.live_at)}` : ""}`],
                      ] as [string, string | null][]
                    ).map(([k, v]) => (
                      // "not recorded" rather than a dash: the column exists and
                      // nobody has filled it in.
                      <Row
                        key={k}
                        k={k}
                        v={<span className={v ? "font-medium" : "text-muted-foreground"}>{v ?? "not recorded"}</span>}
                      />
                    ))}
                  </dl>
                </CardContent>
              </Card>

              {company ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Company: {company.name}</CardTitle>
                    {/* Never a bare "Verified" claim, no tick and no green: a
                        staff member read the papers on a date. No insurer,
                        registrar or awarding body was contacted. */}
                    <CardAction>
                      <span className="text-muted-foreground text-xs">
                        {company.verification_status === "verified"
                          ? "documents checked"
                          : company.verification_status.replaceAll("_", " ")}
                      </span>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <dl className="flex flex-col gap-1.5">
                      {(companyAgg
                        ? ([
                            ["Total products", String(companyAgg.products)],
                            ["Total bookings (all products)", String(companyAgg.bookings)],
                            ["Total revenue (all products)", eur(companyAgg.revenue)],
                            ["Total commission", eur(companyAgg.commission)],
                            [
                              "This product earnings",
                              // Same derivation as the tile above, so it has to
                              // be withheld on the same condition — otherwise
                              // this card states the company earned the whole
                              // recorded revenue on a product whose commission
                              // the tile says is unrecorded.
                              commissionRows > 0 ? eur(revenue - commission) : "needs a commission to derive from",
                            ],
                          ] as [string, string][])
                        : ([["Aggregates", "…"]] as [string, string][])
                      ).map(([k, v]) => (
                        <Row
                          key={k}
                          k={k}
                          v={
                            k === "This product earnings" && commissionRows === 0 ? (
                              <span className="text-muted-foreground">{v}</span>
                            ) : (
                              <span className="font-medium tabular-nums">{v}</span>
                            )
                          }
                        />
                      ))}
                    </dl>
                    <Button variant="outline" size="sm" className="self-start" asChild>
                      <Link href="/dashboard/sales/companies">View company profile</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Company</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">Reading the company…</p>
                  </CardContent>
                </Card>
              )}

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
                            {myPlacement.price_cents != null
                              ? eur(myPlacement.price_cents)
                              : "not yet agreed — never free"}
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
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      No live or reserved placement names this product. Placements are managed on the Placements screen.
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="self-start" asChild>
                    <Link href="/dashboard/sales/placements">Manage placement</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* The owner's banner, verbatim — written by them, twice running. */}
            <div className="flex items-start gap-3 rounded-xl border bg-muted/50 p-4">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium text-sm">About views</p>
                <p className="mt-0.5 text-muted-foreground text-sm leading-relaxed">
                  ICEFALL does not currently record view counts, impressions or click-through data. We are focused on
                  revenue, bookings and enquiries — the metrics that matter.
                </p>
              </div>
            </div>
          </div>
        )
      }
    </Resolve>
  );
}
