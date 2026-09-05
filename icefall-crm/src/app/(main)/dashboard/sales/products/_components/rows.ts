import type { Company, Product, ProductStatus } from "./data";
import { eur, type ProductStats } from "./product-metrics";

export type ProductTableRow = {
  id: string;
  name: string;
  companyId: string;
  company: string;
  status: ProductStatus;
  /** NULL whenever the price is on request or unknown — it sorts apart from a real €0. */
  priceCents: number | null;
  price: string;
  priceKnown: boolean;
  bookings: number;
  revenueCents: number;
  valueless: number;
  commissionCents: number;
  /** Stored commission rows behind `commissionCents`. 0 means unrecorded, not €0. */
  commissionRows: number;
  enquiries: number;
  placement: { slot: number; status: string } | null;
  /**
   * False until bookings, enquiries and placements have all resolved. The five
   * commercial cells flip together behind it — a row showing real bookings next
   * to a zero revenue is the failure this gate exists to prevent.
   */
  commercialReady: boolean;
};

export function buildProductRows(
  products: Product[],
  companies: Company[],
  stats: Map<string, ProductStats>,
  commercialReady: boolean,
): ProductTableRow[] {
  const names = new Map(companies.map((c) => [c.id, c.name]));

  return products.map((p) => {
    const s = stats.get(p.id);
    const priceKnown = p.price_state === "known" && p.price_from_cents !== null;

    return {
      id: p.id,
      name: p.name,
      companyId: p.company_id,
      company: names.get(p.company_id) ?? "",
      status: p.status,
      priceCents: priceKnown ? p.price_from_cents : null,
      price: priceKnown ? eur(p.price_from_cents as number) : p.price_state.replaceAll("_", " "),
      priceKnown,
      bookings: s?.bookings ?? 0,
      revenueCents: s?.revenue_cents ?? 0,
      valueless: s?.valueless ?? 0,
      commissionCents: s?.commission_cents ?? 0,
      commissionRows: s?.commission_rows ?? 0,
      enquiries: s?.enquiries ?? 0,
      placement: s?.placement ?? null,
      commercialReady,
    };
  });
}
