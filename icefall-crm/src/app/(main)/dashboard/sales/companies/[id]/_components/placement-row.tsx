"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { PlacementEffectiveStatus, PlacementRecord } from "../../_components/data";
import { formatCents, formatDay } from "../../_components/format";

/**
 * Position #1 is PREMIUM: the highest featured position on a destination.
 *
 * It is the most expensive slot. It is NOT a statement that the company holding
 * it is better than the others, and no label in this system should imply it —
 * ICEFALL sells the position, it does not rank the operator.
 */
export const slotLabel = (n: number) => (n === 1 ? "#1 Premium" : `#${n} Featured`);

const STATUS_TONE: Record<PlacementEffectiveStatus, string> = {
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expired: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cancelled: "border-destructive/20 bg-destructive/10 text-destructive",
  reserved: "border-border bg-muted/50 text-muted-foreground",
};

export const statusTone = (s: PlacementEffectiveStatus) => STATUS_TONE[s];

export function PlacementRow({
  placement: p,
  showCompany = true,
  companyName,
}: {
  placement: PlacementRecord;
  showCompany?: boolean;
  /** Resolved by the caller. A raw id on screen is a row nobody can read. */
  companyName?: string;
}) {
  return (
    <TableRow>
      <TableCell className="px-5 py-3">
        <span className="font-medium tabular-nums">{slotLabel(p.slot_position)}</span>
      </TableCell>
      <TableCell className="px-5 py-3">
        <Link href="/dashboard/sales/placements" className="hover:underline">
          {p.destination_name ?? p.destination_id}
        </Link>
      </TableCell>
      {showCompany ? (
        <TableCell className="px-5 py-3">
          <Link href={`/dashboard/sales/companies/${p.company_id}`} className="hover:underline">
            {/* Not a blank cell and not a dash: the row says which fact is missing. */}
            {companyName ?? <span className="text-muted-foreground/70">Unknown company</span>}
          </Link>
        </TableCell>
      ) : null}
      <TableCell className="whitespace-nowrap px-5 py-3 text-muted-foreground tabular-nums">
        {/* The em dash here separates two MEASURED dates. It is not the
            not-measured dash and must not be normalised into one. */}
        {formatDay(p.starts_on)} — {formatDay(p.ends_on)}
      </TableCell>
      <TableCell className="px-5 py-3 text-muted-foreground tabular-nums">
        {/* No agreed price is not zero and not an unknown: it is a deal term
            nobody has set yet, and the cell says exactly that. */}
        {formatCents(p.price_cents, p.currency) ?? <span className="text-muted-foreground/70">Not agreed</span>}
      </TableCell>
      <TableCell className="px-5 py-3">
        <Badge
          variant="outline"
          className={cn("border px-2 py-1 font-medium capitalize", statusTone(p.effective_status))}
        >
          {p.effective_status}
        </Badge>
        {/* An expired term does NOT vacate the slot. The company keeps the
            position until an administrator moves or cancels it, and saying so
            here is the difference between a reader assuming it is free and
            knowing it is not. Nothing acts on the flag; it is a flag for a
            person. */}
        {p.needs_review ? (
          <span className="ml-2 text-amber-600 text-xs dark:text-amber-400">
            Term ended — still holds this position
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
