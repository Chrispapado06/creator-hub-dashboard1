import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, EllipsisVertical, ExternalLink, TrendingUp } from "lucide-react";
import { Card, Pill, SectionLabel } from "@/components/ui";
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
import { formatDay } from "@/lib/utils";
import { PRODUCTS_MOCKUP } from "@/demo/mockupScreens";
import { GoldButton, GOLD, GOLD_HOVER } from "@/components/drawn";

/**
 * One product, the CRM's view — ONE screen in the owner's drawn hierarchy
 * (breadcrumb → title row → tabs with the date pill → tiles → charts → three
 * cards → banner), two data sources per the 31 Aug ruling. SHOW_DEMO_DATA
 * fills the drawing's sample figures; flag off, everything derives from real
 * rows in the same skeleton. Commission stays visible here because this is
 * the CRM (routing ruling: the operator's version of this shape must never
 * show ICEFALL's commission, and is filed as a request).
 *
 * The owner drew two things that survive VERBATIM in both modes: the Views
 * tile and the About-views banner. They wrote that copy themselves, twice
 * running.
 *
 * The "Verified Company" chip is DRAWN — it renders on sample figures only.
 * Live, the company card states the verification status in the settled
 * wording (documents checked; never a bare "Verified" claim). Deltas are
 * sample-only: a real delta needs a prior-period snapshot and none is kept.
 */

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

function Tile({ label, value, sub, delta }: { label: string; value: string | null; sub?: string; delta?: string | null }) {
  return (
    <Card className="py-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint">{label}</p>
      {value === null ? (
        <p className="mt-1 text-[12px] leading-snug text-faint">{sub}</p>
      ) : (
        <>
          <p className="tnum mt-1 text-[20px] font-extrabold leading-tight text-ink">{value}</p>
          {sub && <p className="text-[11px] text-faint">{sub}</p>}
          {delta && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-ok">
              <TrendingUp size={11} strokeWidth={2.25} aria-hidden />{delta} vs 1 – 31 Jul 2026
            </p>
          )}
        </>
      )}
    </Card>
  );
}

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

  /** THE drawn skeleton — one function, slotted from either source. */
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
    <>
      {/* Breadcrumb, as drawn. */}
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-faint">
        <Link to="/admin/products" className="flex items-center gap-1 hover:text-ink">
          <ArrowLeft size={12} strokeWidth={2} /> Products
        </Link>
        <span>/</span>
        <span className="text-muted">{S.name}</span>
      </p>

      {/* Title row: name + chip left, the actions right. */}
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-ink">{S.name}</h1>
          {S.statusChip}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="inline-flex h-10 items-center rounded-[10px] border border-line bg-surface px-4 text-[13px] font-medium text-ink hover:bg-raised">
            Edit Product
          </button>
          <GoldButton>View on Platform <ExternalLink size={13} strokeWidth={2.25} /></GoldButton>
          <button type="button" aria-label="More" className="grid h-10 w-10 place-items-center rounded-[10px] border border-line bg-surface text-muted hover:bg-raised">
            <EllipsisVertical size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">{S.metaLine}</p>

      {/* Tab row with the date pill on the right, as drawn. Only Overview has
          content behind it; the rest render and stay put. */}
      <div className="mb-4 flex items-center justify-between border-b border-line-soft">
        <div className="flex gap-1">
          {TAB_NAMES.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={t === tab ? "border-b-2 px-3 py-2 text-[13px] font-semibold" : "border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted hover:text-ink"}
              style={t === tab ? { borderColor: GOLD, color: GOLD_HOVER } : undefined}>
              {t}
            </button>
          ))}
        </div>
        <span className="mb-1.5 rounded-tile border border-line bg-surface px-3 py-1.5 text-[12px] text-ink">{S.rangeLabel}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{S.tiles}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">{S.charts}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <SectionLabel>About this product</SectionLabel>
          {S.about}
        </Card>
        {S.companyCard}
        {S.placementCard}
      </div>

      {/* The owner's banner, verbatim — written by them, twice running. */}
      <Card className="mt-4 !bg-accent-soft/60">
        <p className="text-[12.5px] font-semibold text-accent-ink">About views</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-accent-ink/80">
          ICEFALL does not currently record view counts, impressions or click-through data.
          We are focused on revenue, bookings and enquiries — the metrics that matter.
        </p>
      </Card>
    </>
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
      statusChip: <Pill tone="green">PUBLISHED</Pill>,
      metaLine: (
        <>
          <Pill tone="neutral">{sampleRow.mountain}</Pill>
          <span>Sold by <span className="font-medium text-accent-ink">{sampleRow.company}</span></span>
        </>
      ),
      rangeLabel: d.range,
      tiles: (
        <>
          {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} sub={t.sub} delta={t.delta} />)}
          {/* The owner's words, verbatim. */}
          <Card className="py-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint">Views</p>
            <p className="mt-1 text-[15px] font-bold text-ink">Not measured</p>
            <p className="mt-0.5 text-[11px] leading-snug text-faint">We do not currently track views. This metric is not available.</p>
          </Card>
        </>
      ),
      charts: (
        <>
          <Card>
            <SectionLabel>Bookings over time</SectionLabel>
            <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.71_0.16_55)]" aria-hidden />Bookings</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden />Enquiries</span>
            </div>
            <LineChart series={[d.bookingsSeries, d.enquiriesSeries]} labels={d.chartLabels} colors={["oklch(0.71 0.16 55)", "var(--crm-accent)"]} />
          </Card>
          <Card>
            <SectionLabel>Revenue over time</SectionLabel>
            <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.71_0.16_55)]" aria-hidden />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden />ICEFALL Commission (15%)</span>
            </div>
            <LineChart series={[d.revenueSeries, d.commissionSeries]} labels={d.chartLabels} colors={["oklch(0.71 0.16 55)", "var(--crm-accent)"]} />
          </Card>
        </>
      ),
      about: (
        <dl className="mt-2 space-y-1.5 text-[12.5px]">
          {d.about.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>
          ))}
        </dl>
      ),
      companyCard: (
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Company: {d.companyCard.name}</SectionLabel>
            {/* Drawn chip — sample figures only; live states the settled wording. */}
            {d.companyCard.verified && <Pill tone="accent">Verified Company</Pill>}
          </div>
          <dl className="mt-2 space-y-1.5 text-[12.5px]">
            {d.companyCard.rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="tnum text-right font-medium text-ink">{v}</dd></div>
            ))}
          </dl>
          <span className="mt-3 inline-block rounded-pill border border-line px-4 py-2 text-[12.5px] font-medium text-ink">View company profile</span>
        </Card>
      ),
      placementCard: (
        <Card>
          <SectionLabel>Placement / Slot</SectionLabel>
          <dl className="mt-2 space-y-1.5 text-[12.5px]">
            {d.placementCard.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium text-ink">{v === "Active" ? <Pill tone="green">Active</Pill> : v}</dd>
              </div>
            ))}
          </dl>
          <span className="mt-3 inline-block rounded-pill border border-line px-4 py-2 text-[12.5px] font-medium text-ink">Manage placement</span>
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
            <p className="text-[13px] text-muted">No product with this id.</p>
          </Card>
        ) : (
          frame({
            name: product.name,
            statusChip: (
              <Pill tone={product.status === "live" ? "green" : product.status === "pending_review" ? "amber" : "neutral"}>
                {product.status}
              </Pill>
            ),
            metaLine: (
              <>
                <Pill tone="neutral">{product.kind}</Pill>
                {company && (
                  <span>
                    Sold by <Link to={`/admin/companies/${company.id}`} className="font-medium text-accent-ink hover:underline">{company.name}</Link>
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
                {/* The owner's words, verbatim — do not paraphrase. */}
                <Card className="py-4">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint">Views</p>
                  <p className="mt-1 text-[15px] font-bold text-ink">Not measured</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-faint">We do not currently track views. This metric is not available.</p>
                </Card>
              </>
            ),
            charts: (
              <>
                <Card>
                  <SectionLabel>Bookings over time</SectionLabel>
                  {chart ? (
                    <>
                      <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.71_0.16_55)]" aria-hidden />Bookings</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden />Enquiries</span>
                      </div>
                      <LineChart series={[chart.bookings, chart.enquiries]} labels={chart.labels} colors={["oklch(0.71 0.16 55)", "var(--crm-accent)"]} />
                    </>
                  ) : (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
                      No bookings or enquiries yet — the chart draws itself from the first one.
                    </p>
                  )}
                </Card>
                <Card>
                  <SectionLabel>Revenue over time</SectionLabel>
                  {chart && mine.length > 0 ? (
                    <>
                      <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.71_0.16_55)]" aria-hidden />Revenue</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden />ICEFALL Commission</span>
                      </div>
                      <LineChart series={[chart.revenue, chart.commission]} labels={chart.labels} colors={["oklch(0.71 0.16 55)", "var(--crm-accent)"]} />
                    </>
                  ) : (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
                      No booking values recorded yet — this chart draws itself from the first one.
                    </p>
                  )}
                </Card>
              </>
            ),
            about: (
              <dl className="mt-2 space-y-1.5 text-[12.5px]">
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
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className={v ? "text-right font-medium text-ink" : "text-right text-faint"}>{v ?? "not recorded"}</dd>
                  </div>
                ))}
              </dl>
            ),
            companyCard: company ? (
              <Card>
                <div className="flex items-center justify-between">
                  <SectionLabel>Company: {company.name}</SectionLabel>
                  {/* Never a bare "Verified" claim — the settled wording only. */}
                  <span className="text-[11px] text-faint">
                    {company.verification_status === "verified" ? "documents checked" : company.verification_status.replaceAll("_", " ")}
                  </span>
                </div>
                <dl className="mt-2 space-y-1.5 text-[12.5px]">
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
                    <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="tnum text-right font-medium text-ink">{v}</dd></div>
                  ))}
                </dl>
                <Link
                  to={`/admin/companies/${company.id}`}
                  className="mt-3 inline-block rounded-pill border border-line px-4 py-2 text-[12.5px] font-medium text-ink hover:bg-raised"
                >
                  View company profile
                </Link>
              </Card>
            ) : (
              <Card>
                <SectionLabel>Company</SectionLabel>
                <p className="mt-2 text-[12.5px] text-faint">Reading the company…</p>
              </Card>
            ),
            placementCard: (
              <Card>
                <SectionLabel>Placement / Slot</SectionLabel>
                {myPlacement ? (
                  <dl className="mt-2 space-y-1.5 text-[12.5px]">
                    <div className="flex justify-between gap-3"><dt className="text-muted">Position</dt><dd className="font-medium text-ink">#{myPlacement.slot_position}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Mountain</dt><dd className="text-ink">{myPlacement.destination_id}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Term</dt><dd className="tnum text-ink">{formatDay(myPlacement.starts_on)} – {formatDay(myPlacement.ends_on)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Agreed price</dt><dd className="tnum text-ink">{myPlacement.price_cents != null ? eur(myPlacement.price_cents) : "not yet agreed — never free"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd><Pill tone={myPlacement.status === "active" ? "green" : "amber"}>{myPlacement.status}</Pill></dd></div>
                  </dl>
                ) : (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
                    No live or reserved placement names this product. Placements are managed on the
                    Placements screen.
                  </p>
                )}
                <Link to="/admin/placements" className="mt-3 inline-block rounded-pill border border-line px-4 py-2 text-[12.5px] font-medium text-ink hover:bg-raised">
                  Manage placement
                </Link>
              </Card>
            ),
          })
        )
      }
    </Resolve>
  );
}
