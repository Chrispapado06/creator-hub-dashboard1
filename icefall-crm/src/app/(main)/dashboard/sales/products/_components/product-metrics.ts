import type { BookingDetailed, Enquiry, PlacementRow } from "./data";

export const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

/**
 * `new Date("YYYY-MM-DD")` parses as UTC midnight and renders as the previous
 * day west of Greenwich — a placement ending "on the 30th" reading as the 29th
 * gets a slot released a day early. Split the parts and build a local date.
 */
export function formatDay(isoDay: string | null | undefined): string | null {
  if (!isoDay) return null;
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface ProductStats {
  bookings: number;
  revenue_cents: number;
  /** Bookings carrying no value. Counted apart so none of them lands in revenue as a zero. */
  valueless: number;
  commission_cents: number;
  /**
   * How many stored commission rows sit behind `commission_cents`. Zero rows
   * and rows summing to zero are different facts: the first is unrecorded, the
   * second is a measured €0, and only the count can tell them apart.
   */
  commission_rows: number;
  enquiries: number;
  placement: { slot: number; status: string } | null;
}

export function aggregateProducts(
  bookings: BookingDetailed[],
  enquiries: Enquiry[],
  placements: Pick<PlacementRow, "product_id" | "slot_position" | "status">[],
): Map<string, ProductStats> {
  const m = new Map<string, ProductStats>();
  const get = (id: string): ProductStats => {
    let s = m.get(id);
    if (!s) {
      s = {
        bookings: 0,
        revenue_cents: 0,
        valueless: 0,
        commission_cents: 0,
        commission_rows: 0,
        enquiries: 0,
        placement: null,
      };
      m.set(id, s);
    }
    return s;
  };

  for (const b of bookings) {
    if (!b.product_id) continue;
    const s = get(b.product_id);
    s.bookings++;
    if (b.value_cents !== null) s.revenue_cents += b.value_cents;
    else s.valueless++;
    s.commission_cents += b.commissions.reduce((sum, c) => sum + c.amount_cents, 0);
    s.commission_rows += b.commissions.length;
  }
  for (const e of enquiries) if (e.product_id) get(e.product_id).enquiries++;
  for (const p of placements) {
    if (p.product_id && (p.status === "active" || p.status === "reserved")) {
      get(p.product_id).placement = { slot: p.slot_position, status: p.status };
    }
  }
  return m;
}
