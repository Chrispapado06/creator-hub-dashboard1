"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical } from "lucide-react";

import type { DataTableFeatures } from "@/lib/data-table-features";

import { CompanyLogo, CompanyStatusBadge, VerificationChip } from "./company-badges";
import type { CompanyRow, RevenueRecord } from "./data";
import { formatCents, formatDay } from "./format";
import type { Result } from "./states";

/**
 * Three different absences, three different sentences — a loading ledger, an
 * unreachable one, and a company with no rows in it. None of them is €0, and
 * none of them may print one. A company that genuinely earned zero prints the
 * zero.
 */
function RevenueCell({ ledger, earned }: { ledger: Result<RevenueRecord[]>; earned: number | undefined }) {
  if (ledger.state !== "ok") {
    return (
      <div className="text-right font-medium tabular-nums">
        <span className="font-normal text-muted-foreground/70">
          {ledger.state === "loading" ? "…" : "Ledger unavailable"}
        </span>
      </div>
    );
  }
  if (earned === undefined) {
    return (
      <div className="text-right font-medium tabular-nums">
        <span className="font-normal text-muted-foreground/70">None recorded</span>
      </div>
    );
  }
  return <div className="text-right font-medium tabular-nums">{formatCents(earned)}</div>;
}

/**
 * The roster's columns.
 *
 * NOTE WHAT IS NOT HERE: "Products" and "Bookings". The static mockup carried
 * both as counted columns and neither figure has a source — nothing in this
 * area counts a company's expeditions or its bookings, and a column that
 * prints an invented count is worse than a column that is missing.
 */
export function companiesColumns({
  ledger,
  ytd,
}: {
  ledger: Result<RevenueRecord[]>;
  ytd: Map<string, number> | null;
}): ColumnDef<DataTableFeatures, CompanyRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Company",
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <CompanyLogo name={row.original.name} size={32} />
          <span className="font-medium">{row.original.name}</span>
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <CompanyStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "countries",
      header: "Countries",
      cell: ({ row }) =>
        row.original.countries.length > 0 ? (
          <span className="text-muted-foreground">{row.original.countries.join(", ")}</span>
        ) : (
          // Not a dash and not a blank: the cell names the fact nobody recorded.
          <span className="text-muted-foreground/70">Not recorded</span>
        ),
    },
    {
      accessorKey: "verification_status",
      header: "Trust",
      cell: ({ row }) => <VerificationChip company={row.original} />,
    },
    {
      accessorKey: "created_at",
      header: "Joined",
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">{formatDay(row.original.created_at)}</span>
      ),
    },
    {
      id: "revenue_ytd",
      header: () => <div className="text-right">Revenue YTD</div>,
      cell: ({ row }) => <RevenueCell ledger={ledger} earned={ytd?.get(row.original.id)} />,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: () => (
        <div className="text-right">
          {/* Drawn because the roster draws it, and NOT interactive — there is
              no per-row action in this build. A control that looks live and is
              not is its own kind of lie, so it carries no menu and is hidden
              from assistive technology rather than announcing itself. */}
          <EllipsisVertical className="inline size-4 text-muted-foreground" aria-hidden />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
