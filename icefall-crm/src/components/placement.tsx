import { Link } from "react-router-dom";
import { Pill } from "@/components/ui";
import { formatCents } from "@/data/result";
import type { PlacementEffectiveStatus, PlacementView } from "@/data/types";
import { formatDay } from "@/lib/utils";

/**
 * How a placement is named and shown, wherever it appears.
 *
 * These lived inside the old flat Placements table. When that page was replaced
 * by the mountain-first Mountain Placements screen, two other screens still
 * needed them — so they moved here rather than leaving a whole retired page
 * alive as a library. A presentation helper shared by three screens belongs in
 * `components`, not in whichever screen happened to define it first.
 *
 * ── THE RE-SKIN, AND THE ONE THING IT COULD NOT DO ──────────────────────────
 * The row is shaped as theme-ref/src/components/ui/table.tsx TableRow:
 * `border-b transition-colors hover:bg-muted/50`, one --border hairline rather
 * than the softer in-card line this used before.
 *
 * The theme's CELL is `p-3` — 12px all round. This row keeps px-5 because the
 * <thead> it sits under is written inside CompanyDetail.tsx at `px-5 py-3.5`,
 * and this pass may not edit screens: dropping to p-3 here would leave every
 * body cell 8px out of line with its own column heading. Vertical padding does
 * not affect that alignment, so it takes the theme's 12px. When CompanyDetail's
 * header moves to p-3, so should this.
 */

/**
 * Position #1 is PREMIUM: the highest featured position on a mountain.
 *
 * It is the most expensive slot. It is NOT a statement that the company holding
 * it is better than the others, and no label in this system should imply it —
 * ICEFALL sells the position, it does not rank the operator.
 */
export const slotLabel = (n: number) => (n === 1 ? "#1 Premium" : `#${n} Featured`);

export const statusTone = (s: PlacementEffectiveStatus) =>
  s === "active" ? "green" : s === "expired" ? "amber" : s === "cancelled" ? "red" : "neutral";

export function PlacementRow({
  placement: p,
  showCompany = true,
  companyName,
  mountainName,
}: {
  placement: PlacementView;
  showCompany?: boolean;
  /** Resolved by the caller. A raw id on screen is a row nobody can read. */
  companyName?: string;
  mountainName?: string;
}) {
  return (
    <tr className="border-b border-line transition-colors last:border-0 hover:bg-raised/50">
      <td className="px-5 py-3">
        <span className="tnum font-medium text-ink">{slotLabel(p.slot_position)}</span>
      </td>
      <td className="px-5 py-3">
        {/* The theme underlines a link on hover rather than recolouring it —
            which is also the only option left, now that the interactive accent
            and the body ink are the same near-black. */}
        <Link to="/admin/placements" className="text-ink hover:underline">
          {mountainName ?? p.destination_id}
        </Link>
      </td>
      {showCompany && (
        <td className="px-5 py-3">
          <Link to={`/admin/companies/${p.company_id}`} className="text-ink hover:underline">
            {/* Not a blank cell and not a dash: the row says which fact is
                missing. */}
            {companyName ?? <span className="text-faint">Unknown company</span>}
          </Link>
        </td>
      )}
      <td className="tnum whitespace-nowrap px-5 py-3 text-muted">
        {/* The em dash here separates two MEASURED dates. It is not the
            not-measured dash and must not be normalised into one. */}
        {formatDay(p.starts_on)} — {formatDay(p.ends_on)}
      </td>
      <td className="tnum px-5 py-3 text-muted">
        {/* No agreed price is not zero and not an unknown: it is a deal term
            nobody has set yet, and the cell says exactly that. */}
        {formatCents(p.price_cents, p.currency) ?? <span className="text-faint">Not agreed</span>}
      </td>
      <td className="px-5 py-3">
        <Pill tone={statusTone(p.effective_status)}>{p.effective_status}</Pill>
        {/* An expired term does NOT vacate the slot. The company keeps the
            position until an administrator moves or cancels it, and saying so
            here is the difference between a reader assuming it is free and
            knowing it is not. */}
        {p.needs_review && (
          <span className="ml-2 text-[12px] text-warn">Term ended — still holds this position</span>
        )}
      </td>
    </tr>
  );
}
