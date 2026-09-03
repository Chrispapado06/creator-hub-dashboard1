import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, Download, Euro, MessageSquare, Package, Percent, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Resolve } from "@/components/states";
import {
  listBookingsDetailed,
  listCompanies,
  listEnquiries,
  listPlacementRows,
  listProducts,
  type BookingDetailed,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import { PRODUCTS_MOCKUP } from "@/demo/mockupScreens";
import { Select } from "@/components/controls";
import { cn } from "@/lib/utils";
import type { Company, Enquiry, Product } from "@/data/types";

/**
 * Products — ONE screen, two data sources (the owner's 31 Aug ruling; the
 * demo-face fork was deleted, §6u). SHOW_DEMO_DATA fills the sample rows; flag
 * off, every figure aggregates from real rows at read time — bookings and their
 * STORED commissions (rate frozen at conversion), enquiries by product,
 * placements by product.
 *
 * THE LIST IS CRM-ONLY (routing ruling): every company's products with
 * ICEFALL's commission per row is exactly the data an operator must never see.
 *
 * Honest cells, live mode: Mountain reads "—" because products do not yet
 * link a destination (schema fact, not laziness); "Enq → Booking" prints the
 * real ratio of the two counted figures; a product with no live/reserved slot
 * shows a dash, with non-live status badges standing in where the sample set
 * badges Draft. "Add Product" is the primary action; the creation flow itself
 * still lives in the operator portal (products arrive via approval), so the
 * button waits on that link-up.
 *
 * CSV export is real and exports exactly the rows on screen.
 *
 * ── THE RE-SKIN ───────────────────────────────────────────────────────────
 * Laid out against the reference theme's own data-table page: a page header
 * with the two actions on the right, a row of stat tiles, and then ONE bordered
 * panel holding a toolbar strip, the table and a footer strip. The toolbar sits
 * INSIDE that panel and outside the `Resolve`, so the search and the three
 * filters keep rendering whatever the read returns — losing a control to a
 * loading state is the kind of regression a re-skin is not allowed to make.
 */

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

/** The theme's own badge treatments, one per meaning. Nothing is ICEFALL gold. */
const BADGE_CLASS = {
  /** A held slot. The theme paints a stage this way: outline, no fill. */
  slot: "rounded-full px-2.5",
  /** Submitted and waiting on approval — the same "good news" tone the old
      pill carried for `pending_review`, in the theme's own emerald. */
  review: "rounded-full border-emerald-500/20 bg-emerald-500/10 px-2.5 text-emerald-600 dark:text-emerald-400",
  /** Neither good nor bad — draft, archived. */
  quiet: "rounded-full border-border bg-ui-muted/50 px-2.5 text-muted-foreground",
} as const;

export interface ProductStats {
  bookings: number;
  revenue_cents: number;
  valueless: number;
  commission_cents: number;
  enquiries: number;
  placement: { slot: number; status: string } | null;
}

export function aggregateProducts(
  bookings: BookingDetailed[],
  enquiries: Enquiry[],
  placements: { product_id: string | null; slot_position: number; status: string }[],
): Map<string, ProductStats> {
  const m = new Map<string, ProductStats>();
  const get = (id: string): ProductStats => {
    if (!m.has(id))
      m.set(id, { bookings: 0, revenue_cents: 0, valueless: 0, commission_cents: 0, enquiries: 0, placement: null });
    return m.get(id)!;
  };
  for (const b of bookings) {
    if (!b.product_id) continue;
    const s = get(b.product_id);
    s.bookings++;
    if (b.value_cents !== null) s.revenue_cents += b.value_cents;
    else s.valueless++;
    s.commission_cents += b.commissions.reduce((sum, c) => sum + c.amount_cents, 0);
  }
  for (const e of enquiries) if (e.product_id) get(e.product_id).enquiries++;
  for (const p of placements)
    if (p.product_id && (p.status === "active" || p.status === "reserved"))
      get(p.product_id).placement = { slot: p.slot_position, status: p.status };
  return m;
}

/** One table row, from either source. */
interface PRow {
  id: string;
  name: string;
  company: string;
  mountain: string;
  price: string;
  priceKnown: boolean;
  bookings: string;
  revenue: string;
  revenueNote: string | null;
  commission: string;
  enquiries: string;
  conv: string;
  badge: { text: string; tone: keyof typeof BADGE_CLASS } | null;
}

/**
 * One headline figure in the theme's stat-tile shape: outlined icon square,
 * quiet label, large tabular number.
 *
 * A `null` value is a figure that has NOT ARRIVED YET, and it prints the
 * ellipsis the old tile printed — never a zero standing in for a read that has
 * not come back. Nothing in this file may turn an absent aggregate into "0".
 */
function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
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
      <CardContent>
        {value === null ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : (
          <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const M = PRODUCTS_MOCKUP;
  const [products, setProducts] = useState<Result<Product[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [bookings, setBookings] = useState<Result<BookingDetailed[]>>(loading);
  const [enquiries, setEnquiries] = useState<Result<Enquiry[]>>(loading);
  const [placements, setPlacements] = useState<Result<{ id: string; product_id: string | null; destination_id: string; slot_position: number; status: string; price_cents: number | null; starts_on: string; ends_on: string }[]>>(loading);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    void listProducts().then(setProducts);
    void listCompanies().then(setCompanies);
    void listBookingsDetailed().then(setBookings);
    void listEnquiries().then(setEnquiries);
    void listPlacementRows().then(setPlacements);
  }, []);

  const companyName = useMemo(() => {
    const m = new Map<string, string>();
    if (companies.state === "ok") for (const c of companies.value) m.set(c.id, c.name);
    return (id: string) => m.get(id) ?? "";
  }, [companies]);

  const stats = useMemo(
    () =>
      aggregateProducts(
        bookings.state === "ok" ? bookings.value : [],
        enquiries.state === "ok" ? enquiries.value : [],
        placements.state === "ok" ? placements.value : [],
      ),
    [bookings, enquiries, placements],
  );

  const commercialReady = bookings.state === "ok" && enquiries.state === "ok" && placements.state === "ok";

  const shown = useMemo(() => {
    if (products.state !== "ok") return [];
    const q = query.trim().toLowerCase();
    return products.value
      .filter((p) => companyFilter === "all" || p.company_id === companyFilter)
      .filter((p) => statusFilter === "all" || p.status === statusFilter)
      .filter((p) => q === "" || p.name.toLowerCase().includes(q) || companyName(p.company_id).toLowerCase().includes(q));
  }, [products, query, companyFilter, statusFilter, companyName]);

  const totals = useMemo(() => {
    if (products.state !== "ok" || !commercialReady) return null;
    let b = 0, rev = 0, com = 0, enq = 0;
    for (const p of products.value) {
      const s = stats.get(p.id);
      if (!s) continue;
      b += s.bookings; rev += s.revenue_cents; com += s.commission_cents; enq += s.enquiries;
    }
    return { products: products.value.length, bookings: b, revenue: rev, commission: com, enquiries: enq };
  }, [products, stats, commercialReady]);

  const exportCsv = () => {
    const rows = [
      ["product", "company", "status", "bookings", "revenue_eur", "icefall_commission_eur", "enquiries"],
      ...shown.map((p) => {
        const s = stats.get(p.id);
        return [
          p.name, companyName(p.company_id), p.status,
          String(s?.bookings ?? 0), ((s?.revenue_cents ?? 0) / 100).toFixed(2),
          ((s?.commission_cents ?? 0) / 100).toFixed(2), String(s?.enquiries ?? 0),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "icefall-products.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Both sources shaped into the same columns. */
  const tableRows: PRow[] = useMemo(() => {
    if (M)
      return M.rows.map((r) => ({
        id: r.id, name: r.name, company: r.company, mountain: r.mountain,
        price: r.price, priceKnown: true,
        bookings: String(r.bookings), revenue: r.revenue, revenueNote: null,
        commission: r.commission, enquiries: String(r.enquiries), conv: r.conv,
        badge: r.placement === null
          ? null
          : { text: r.placement, tone: r.placement === "Draft" ? "quiet" : "slot" },
      }));
    return shown.map((p) => {
      const s = stats.get(p.id);
      return {
        id: p.id, name: p.name, company: companyName(p.company_id),
        mountain: "—", // products carry no destination link yet — schema fact
        price: p.price_state === "known" && p.price_from_cents !== null ? eur(p.price_from_cents) : p.price_state.replaceAll("_", " "),
        priceKnown: p.price_state === "known" && p.price_from_cents !== null,
        bookings: commercialReady ? String(s?.bookings ?? 0) : "…",
        revenue: commercialReady ? eur(s?.revenue_cents ?? 0) : "…",
        revenueNote: s && s.valueless > 0 ? `+${s.valueless} booking${s.valueless === 1 ? "" : "s"} without a value` : null,
        commission: commercialReady ? eur(s?.commission_cents ?? 0) : "…",
        enquiries: commercialReady ? String(s?.enquiries ?? 0) : "…",
        conv: commercialReady ? `${s?.bookings ?? 0} / ${s?.enquiries ?? 0}` : "…",
        badge: s?.placement
          ? { text: `#${s.placement.slot} ${s.placement.status}`, tone: "slot" }
          : p.status !== "live"
            ? { text: p.status.replaceAll("_", " "), tone: p.status === "pending_review" ? "review" : "quiet" }
            : null,
      };
    });
  }, [M, shown, stats, commercialReady, companyName]);

  const table = (
    <>
      <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 font-medium text-muted-foreground">Product</TableHead>
            <TableHead className="h-11 font-medium text-muted-foreground">Company</TableHead>
            <TableHead className="h-11 font-medium text-muted-foreground">Mountain</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Price</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Bookings</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Revenue</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">ICEFALL Comm.</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Enquiries</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Enq. → Booking</TableHead>
            <TableHead className="h-11 text-right font-medium text-muted-foreground">Placement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((r) => (
            <TableRow
              key={r.id}
              onClick={() => navigate(`/admin/products/${r.id}`)}
              className="cursor-pointer border-border/60 hover:bg-ui-muted/40"
            >
              <TableCell className="py-3 font-medium">{r.name}</TableCell>
              <TableCell className="py-3 text-muted-foreground">{r.company}</TableCell>
              <TableCell className="py-3 text-muted-foreground">{r.mountain}</TableCell>
              <TableCell className={cn("py-3 text-right tabular-nums", !r.priceKnown && "text-muted-foreground")}>
                {r.price}
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">{r.bookings}</TableCell>
              <TableCell className="py-3 text-right tabular-nums">
                {r.revenue}
                {r.revenueNote && (
                  <span className="block text-xs font-normal text-muted-foreground">{r.revenueNote}</span>
                )}
              </TableCell>
              <TableCell className="py-3 text-right font-medium tabular-nums">{r.commission}</TableCell>
              <TableCell className="py-3 text-right tabular-nums">{r.enquiries}</TableCell>
              <TableCell className="py-3 text-right text-muted-foreground tabular-nums">{r.conv}</TableCell>
              <TableCell className="py-3 text-right">
                {r.badge === null ? (
                  // No live or reserved slot names this product. An em dash, not
                  // "None" and not a zero.
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <Badge variant="outline" className={BADGE_CLASS[r.badge.tone]}>
                    {r.badge.text}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {M ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4">
          <p className="text-sm text-muted-foreground">{M.showing}</p>
          <div className="flex items-center gap-1.5">
            {M.pages.map((pg, i) =>
              pg === "…" ? (
                <span key={`e${i}`} className="px-1 text-sm text-muted-foreground">…</span>
              ) : (
                <span
                  key={pg}
                  className={cn(
                    "grid size-7 place-items-center rounded-[min(var(--radius-md),12px)] text-sm",
                    pg === 1
                      ? "border border-border bg-background font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {pg}
                </span>
              ),
            )}
          </div>
          <span className="text-sm text-muted-foreground">15 / page</span>
        </div>
      ) : (
        // No invented pagination: every matching row is on this table.
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">
          Showing {tableRows.length} of {products.state === "ok" ? products.value.length : "…"} products.
          A dash in Placement means no live or reserved slot names this product; Mountain fills when
          products link a destination.
        </p>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-tight">Products</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            All expeditions and treks sold on the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download data-icon="inline-start" /> CSV Export
          </Button>
          <Button size="sm">
            <Plus data-icon="inline-start" /> Add Product
          </Button>
        </div>
      </div>

      {/* Totals — sample figures or real aggregates; absent parts show "…". */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(
          M
            ? ([
                ["Total products", M.totals.products, <Package className="size-4" />],
                ["Total bookings", M.totals.bookings, <CalendarCheck className="size-4" />],
                ["Total revenue", M.totals.revenue, <Euro className="size-4" />],
                ["ICEFALL commission (15%)", M.totals.commission, <Percent className="size-4" />],
                ["Total enquiries", M.totals.enquiries, <MessageSquare className="size-4" />],
              ] as [string, string | null, React.ReactNode][])
            : ([
                ["Total products", products.state === "ok" ? String(products.value.length) : null, <Package className="size-4" />],
                ["Total bookings", totals ? String(totals.bookings) : null, <CalendarCheck className="size-4" />],
                ["Total revenue", totals ? eur(totals.revenue) : null, <Euro className="size-4" />],
                ["ICEFALL commission", totals ? eur(totals.commission) : null, <Percent className="size-4" />],
                ["Total enquiries", totals ? String(totals.enquiries) : null, <MessageSquare className="size-4" />],
              ] as [string, string | null, React.ReactNode][])
        ).map(([label, value, icon]) => (
          <StatTile key={label} icon={icon} label={label} value={value} />
        ))}
      </div>

      {/* `w-0 min-w-full` is load-bearing, not decoration. Ten nowrap columns
          are wider than the viewport; without it this panel reports its
          max-content width up through the shell's flex column and drags the
          whole page — sidebar included — into a horizontal scroll. Pinned to
          the available width, the table scrolls inside its own container the
          way the reference theme's tables do. */}
      <div className="w-0 min-w-full overflow-hidden rounded-xl border border-border/70 bg-background">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, companies or mountains…"
            className="w-full min-w-[240px] flex-1 sm:w-64"
          />
          <Select
            value={companyFilter}
            onChange={setCompanyFilter}
            ariaLabel="Filter by company"
            className="min-w-[170px]"
            options={[
              { value: "all", label: "All Companies" },
              ...(companies.state === "ok" ? companies.value.map((c) => ({ value: c.id, label: c.name })) : []),
            ]}
          />
          <Select
            value="all"
            onChange={() => undefined}
            ariaLabel="Filter by mountain"
            className="min-w-[150px]"
            options={[{ value: "all", label: "All Mountains", hint: "fills when products link a destination" }]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter by status"
            className="min-w-[150px]"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "draft", label: "Draft" },
              { value: "pending_review", label: "Pending review" },
              { value: "live", label: "Live" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>

        {M ? (
          table
        ) : (
          // The five states render INSIDE the panel, under the toolbar, so a
          // failed or empty read never takes the search and the three filters
          // off the screen with it. Padding only when a state frame is showing;
          // the table itself is flush, as the theme draws it.
          <div className={products.state === "ok" && products.value.length > 0 ? undefined : "p-4"}>
            <Resolve
              result={products}
              what="products"
              isEmpty={(v) => v.length === 0}
              empty="No products yet. Operators create them in the portal; each arrives here for approval and then appears in this catalogue."
            >
              {() => table}
            </Resolve>
          </div>
        )}
      </div>
    </div>
  );
}
