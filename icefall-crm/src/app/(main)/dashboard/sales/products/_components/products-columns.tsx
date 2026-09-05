"use client";
import type { ColumnDef, HeaderContext } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DataTableFeatures } from "@/lib/data-table-features";
import { cn } from "@/lib/utils";

import { eur } from "./product-metrics";
import type { ProductTableRow } from "./rows";

/** One badge treatment per meaning. Nothing here is a brand colour. */
const BADGE_CLASS = {
  /** A held slot — outline, no fill. */
  slot: "rounded-full px-2.5",
  /** Submitted and waiting on approval: the "good news" tone. */
  review: "rounded-full border-emerald-500/20 bg-emerald-500/10 px-2.5 text-emerald-600 dark:text-emerald-400",
  /** Neither good nor bad — draft, archived. */
  quiet: "rounded-full border-border bg-muted/50 px-2.5 text-muted-foreground",
} as const;

function sortIcon(sorted: false | "asc" | "desc") {
  if (sorted === "asc") return ArrowUp;
  if (sorted === "desc") return ArrowDown;
  return ChevronsUpDown;
}

function placementBadge(row: ProductTableRow) {
  if (row.placement) return { text: `#${row.placement.slot} ${row.placement.status}`, tone: "slot" as const };
  if (row.status === "live") return null;
  return {
    text: row.status.replaceAll("_", " "),
    tone: row.status === "pending_review" ? ("review" as const) : ("quiet" as const),
  };
}

function SortableHeader({
  ctx,
  label,
  align = "left",
}: {
  ctx: HeaderContext<DataTableFeatures, ProductTableRow>;
  label: string;
  align?: "left" | "right";
}) {
  const sorted = ctx.column.getIsSorted();
  const Icon = sortIcon(sorted);

  return (
    <button
      type="button"
      onClick={() => ctx.column.toggleSorting(sorted === "asc")}
      className={cn(
        "-mx-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring",
        align === "right" && "justify-end",
      )}
    >
      {label}
      <Icon className={cn("size-3.5", sorted ? "text-foreground" : "text-muted-foreground/60")} />
    </button>
  );
}

export const productsColumns: ColumnDef<DataTableFeatures, ProductTableRow>[] = [
  {
    id: "search",
    accessorFn: (row) => row.name,
    // Product name OR company name, case-insensitive substring — matching the
    // old screen exactly, which is why the placeholder's promise of "mountains"
    // goes unkept: a product carries no destination to match against.
    filterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (q === "") return true;
      return row.original.name.toLowerCase().includes(q) || row.original.company.toLowerCase().includes(q);
    },
    enableHiding: true,
    enableSorting: false,
  },
  {
    id: "companyId",
    accessorFn: (row) => row.companyId,
    filterFn: "equalsString",
    enableHiding: true,
    enableSorting: false,
  },
  {
    id: "status",
    accessorFn: (row) => row.status,
    filterFn: "equalsString",
    enableHiding: true,
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: (ctx) => <SortableHeader ctx={ctx} label="Product" />,
    cell: ({ row }) => <div className="whitespace-nowrap font-medium">{row.original.name}</div>,
  },
  {
    accessorKey: "company",
    header: (ctx) => <SortableHeader ctx={ctx} label="Company" />,
    cell: ({ row }) => <div className="whitespace-nowrap text-muted-foreground">{row.original.company}</div>,
  },
  {
    id: "mountain",
    header: "Mountain",
    // A schema fact, stated rather than hidden: products carry no destination
    // link yet, so there is nothing to print here. The footer says so.
    cell: () => <span className="text-muted-foreground">—</span>,
    enableSorting: false,
  },
  {
    id: "price",
    accessorFn: (row) => row.priceCents,
    header: (ctx) => <SortableHeader ctx={ctx} label="Price" align="right" />,
    cell: ({ row }) => (
      <div
        className={cn("whitespace-nowrap text-right tabular-nums", !row.original.priceKnown && "text-muted-foreground")}
      >
        {row.original.price}
      </div>
    ),
  },
  {
    id: "bookings",
    accessorFn: (row) => row.bookings,
    header: (ctx) => <SortableHeader ctx={ctx} label="Bookings" align="right" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{row.original.commercialReady ? row.original.bookings : "…"}</div>
    ),
  },
  {
    id: "revenue",
    accessorFn: (row) => row.revenueCents,
    header: (ctx) => <SortableHeader ctx={ctx} label="Revenue" align="right" />,
    cell: ({ row }) => (
      <div className="whitespace-nowrap text-right tabular-nums">
        {row.original.commercialReady ? eur(row.original.revenueCents) : "…"}
        {row.original.valueless > 0 ? (
          <span className="block font-normal text-muted-foreground text-xs">
            +{row.original.valueless} booking{row.original.valueless === 1 ? "" : "s"} without a value
          </span>
        ) : null}
      </div>
    ),
  },
  {
    id: "commission",
    accessorFn: (row) => row.commissionCents,
    header: (ctx) => <SortableHeader ctx={ctx} label="ICEFALL Comm." align="right" />,
    // A product with no stored commission row has no commission figure at all.
    // The record page withholds the same tile, so the two must not disagree by
    // printing a euro sum here that reads as a measured €0.
    cell: ({ row }) =>
      row.original.commercialReady && row.original.commissionRows === 0 ? (
        <div className="whitespace-nowrap text-right text-muted-foreground text-xs">not recorded</div>
      ) : (
        <div className="whitespace-nowrap text-right font-medium tabular-nums">
          {row.original.commercialReady ? eur(row.original.commissionCents) : "…"}
        </div>
      ),
  },
  {
    id: "enquiries",
    accessorFn: (row) => row.enquiries,
    header: (ctx) => <SortableHeader ctx={ctx} label="Enquiries" align="right" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{row.original.commercialReady ? row.original.enquiries : "…"}</div>
    ),
  },
  {
    id: "conversion",
    header: () => <div className="whitespace-nowrap text-right">Enq. → Booking</div>,
    // The two counted figures, kept apart. A conversion rate with no
    // denominator is unavailable, not 0%.
    cell: ({ row }) => (
      <div className="whitespace-nowrap text-right text-muted-foreground tabular-nums">
        {row.original.commercialReady ? `${row.original.bookings} / ${row.original.enquiries}` : "…"}
      </div>
    ),
    enableSorting: false,
  },
  {
    id: "placement",
    header: () => <div className="text-right">Placement</div>,
    cell: ({ row }) => {
      const badge = placementBadge(row.original);

      return (
        <div className="text-right">
          {badge === null ? (
            // No live or reserved slot names this product. An em dash — not
            // "None", not a zero. The footer explains it.
            <span className="text-muted-foreground">—</span>
          ) : (
            <Badge variant="outline" className={BADGE_CLASS[badge.tone]}>
              {badge.text}
            </Badge>
          )}
        </div>
      );
    },
    enableSorting: false,
  },
];
