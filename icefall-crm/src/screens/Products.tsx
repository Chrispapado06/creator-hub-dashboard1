import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { Button, Card, PageHead, Pill, TableCard } from "@/components/ui";
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
import { GoldButton } from "@/components/drawn";
import { Select } from "@/components/controls";
import type { Company, Enquiry, Product } from "@/data/types";

/**
 * Products — ONE screen, the owner's drawn layout, two data sources (their 31
 * Aug ruling: the mockups ARE the production design; the demo-face fork was
 * deleted, §6u). SHOW_DEMO_DATA fills the drawing's sample rows; flag off,
 * every figure aggregates from real rows at read time — bookings and their
 * STORED commissions (rate frozen at conversion), enquiries by product,
 * placements by product.
 *
 * THE LIST IS CRM-ONLY (routing ruling): every company's products with
 * ICEFALL's commission per row is exactly the data an operator must never see.
 *
 * Honest cells, live mode: Mountain reads "—" because products do not yet
 * link a destination (schema fact, not laziness); "Enq → Booking" prints the
 * real ratio of the two counted figures; a product with no live/reserved slot
 * shows a dash, with non-live status pills standing in where the drawing
 * badges Draft. "+ Add Product" is the drawing's primary action; the creation
 * flow itself still lives in the operator portal (products arrive via
 * approval), so the button waits on that link-up.
 *
 * CSV export is real and exports exactly the rows on screen.
 */

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

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
  badge: { text: string; tone: "amber" | "accent" | "neutral" | "green" } | null;
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

  /** Both sources shaped into the drawn columns. */
  const tableRows: PRow[] = useMemo(() => {
    if (M)
      return M.rows.map((r) => ({
        id: r.id, name: r.name, company: r.company, mountain: r.mountain,
        price: r.price, priceKnown: true,
        bookings: String(r.bookings), revenue: r.revenue, revenueNote: null,
        commission: r.commission, enquiries: String(r.enquiries), conv: r.conv,
        // Drawn tints: #1 Premium gold, Featured pale blue, Draft grey.
        badge: r.placement === null
          ? null
          : { text: r.placement, tone: r.placement === "Draft" ? "neutral" : r.placement.includes("#1") ? "amber" : "accent" },
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
          ? { text: `#${s.placement.slot} ${s.placement.status}`, tone: s.placement.slot === 1 ? "amber" : "accent" }
          : p.status !== "live"
            ? { text: p.status.replaceAll("_", " "), tone: p.status === "pending_review" ? "green" : "neutral" }
            : null,
      };
    });
  }, [M, shown, stats, commercialReady, companyName]);

  const table = (
    <TableCard>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-3 py-3 font-medium">Company</th>
            <th className="px-3 py-3 font-medium">Mountain</th>
            <th className="px-3 py-3 text-right font-medium">Price</th>
            <th className="px-3 py-3 text-right font-medium">Bookings</th>
            <th className="px-3 py-3 text-right font-medium">Revenue</th>
            <th className="px-3 py-3 text-right font-medium">ICEFALL Comm.</th>
            <th className="px-3 py-3 text-right font-medium">Enquiries</th>
            <th className="px-3 py-3 text-right font-medium">Enq. → Booking</th>
            <th className="px-3 py-3 text-right font-medium">Placement</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((r) => (
            <tr key={r.id} onClick={() => navigate(`/admin/products/${r.id}`)} className="cursor-pointer border-t border-line-soft hover:bg-raised/60">
              <td className="px-4 py-3 font-semibold text-accent-ink">{r.name}</td>
              <td className="px-3 py-3 text-muted">{r.company}</td>
              <td className="px-3 py-3 text-muted">{r.mountain}</td>
              <td className={`tnum px-3 py-3 text-right ${r.priceKnown ? "text-ink" : "text-faint"}`}>{r.price}</td>
              <td className="tnum px-3 py-3 text-right text-ink">{r.bookings}</td>
              <td className="tnum px-3 py-3 text-right text-ink">
                {r.revenue}
                {r.revenueNote && <span className="block text-[10px] font-normal text-faint">{r.revenueNote}</span>}
              </td>
              <td className="tnum px-3 py-3 text-right font-semibold text-ink">{r.commission}</td>
              <td className="tnum px-3 py-3 text-right text-ink">{r.enquiries}</td>
              <td className="tnum px-3 py-3 text-right text-muted">{r.conv}</td>
              <td className="px-3 py-3 text-right">
                {r.badge === null ? (
                  <span className="text-[11px] text-faint">—</span>
                ) : (
                  <Pill tone={r.badge.tone}>{r.badge.text}</Pill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {M ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-2.5">
          <p className="text-[11.5px] text-faint">{M.showing}</p>
          <div className="flex items-center gap-1.5">
            {M.pages.map((pg, i) =>
              pg === "…" ? (
                <span key={`e${i}`} className="px-1 text-[12.5px] text-faint">…</span>
              ) : (
                <span key={pg} className={pg === 1 ? "grid h-8 w-8 place-items-center rounded-[8px] bg-[oklch(0.72_0.13_60)] text-[12.5px] font-semibold text-white" : "grid h-8 w-8 place-items-center rounded-[8px] text-[12.5px] font-medium text-muted"}>{pg}</span>
              ),
            )}
          </div>
          <span className="text-[12px] text-faint">15 / page</span>
        </div>
      ) : (
        // No invented pagination: every matching row is on this table.
        <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] text-faint">
          Showing {tableRows.length} of {products.state === "ok" ? products.value.length : "…"} products.
          A dash in Placement means no live or reserved slot names this product; Mountain fills when
          products link a destination.
        </p>
      )}
    </TableCard>
  );

  return (
    <>
      <PageHead
        title="Products"
        subtitle="All expeditions and treks sold on the platform."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={exportCsv}><Download size={14} strokeWidth={2} /> CSV Export</Button>
            <GoldButton>+ Add Product</GoldButton>
          </div>
        }
      />

      {/* Totals — sample figures or real aggregates; absent parts show "…". */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(
          M
            ? ([
                ["Total products", M.totals.products], ["Total bookings", M.totals.bookings],
                ["Total revenue", M.totals.revenue], ["ICEFALL commission (15%)", M.totals.commission],
                ["Total enquiries", M.totals.enquiries],
              ] as [string, string | null][])
            : ([
                ["Total products", products.state === "ok" ? String(products.value.length) : null],
                ["Total bookings", totals ? String(totals.bookings) : null],
                ["Total revenue", totals ? eur(totals.revenue) : null],
                ["ICEFALL commission", totals ? eur(totals.commission) : null],
                ["Total enquiries", totals ? String(totals.enquiries) : null],
              ] as [string, string | null][])
        ).map(([label, value]) => (
          <Card key={label} className="py-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint">{label}</p>
            {value === null ? (
              <p className="mt-1 text-[12px] text-faint">…</p>
            ) : (
              <p className="tnum mt-1 text-[22px] font-extrabold leading-tight text-ink">{value}</p>
            )}
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, companies or mountains…"
          className="h-10 min-w-[240px] flex-1 rounded-tile border border-line bg-surface px-3.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
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
        <Resolve
          result={products}
          what="products"
          isEmpty={(v) => v.length === 0}
          empty="No products yet. Operators create them in the portal; each arrives here for approval and then appears in this catalogue."
        >
          {() => table}
        </Resolve>
      )}
    </>
  );
}
