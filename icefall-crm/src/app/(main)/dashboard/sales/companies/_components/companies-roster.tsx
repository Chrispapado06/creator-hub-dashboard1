"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { type PaginationState, useTable } from "@tanstack/react-table";
import { Building2, CheckCircle2, type LucideIcon, PauseCircle, Plus, ShieldQuestion, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dataTableFeatures } from "@/lib/data-table-features";

import { companiesColumns } from "./companies-columns";
import { CompaniesTable } from "./companies-table";
import { type CompanyRow, type RevenueRecord, revenueYtdByCompany } from "./data";
import { Resolve, type Result } from "./states";

const NO_ROWS: CompanyRow[] = [];

/**
 * The theme's metric card.
 *
 * NOTE WHAT IS NOT HERE: the theme's tile carries a delta badge — "+12.5% vs
 * last month". These five counts have no previous period to compare against;
 * nothing in this app stores yesterday's roster. A tile that renders the pill
 * with a number nobody measured is the exact failure this codebase guards
 * against, so the pill is left off rather than filled in, along with any
 * sparkline or trend arrow. The caption says what the figure counts instead.
 */
function StatTile({
  label,
  value,
  caption,
  icon: Icon,
}: {
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {/* A measured zero is a zero. It is never softened into a dash. */}
        <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
        <p className="text-muted-foreground text-sm">{caption}</p>
      </CardContent>
    </Card>
  );
}

export function CompaniesRoster({
  result,
  ledger,
}: {
  result: Result<CompanyRow[]>;
  /** The revenue ledger, whole. Year-to-date is summed here, never stored. */
  ledger: Result<RevenueRecord[]>;
}) {
  const router = useRouter();
  const rows = result.state === "ok" ? result.value : NO_ROWS;

  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 8 });

  const ytd = React.useMemo(() => (ledger.state === "ok" ? revenueYtdByCompany(ledger.value) : null), [ledger]);
  const columns = React.useMemo(() => companiesColumns({ ledger, ytd }), [ledger, ytd]);

  // The clamp: shrinking the result set or raising rows-per-page can never
  // leave the table showing an empty slice past the end, and every read below
  // — the slice, the results sentence, "Page N of M" — uses the clamped page.
  const pages = Math.max(1, Math.ceil(rows.length / pagination.pageSize));
  const safePage = Math.min(pagination.pageIndex + 1, pages);

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    state: { pagination: { pageIndex: safePage - 1, pageSize: pagination.pageSize } },
    getRowId: (row) => row.id,
    autoResetPageIndex: false,
    onPaginationChange: setPagination,
  });

  const from = (safePage - 1) * pagination.pageSize + 1;
  const to = Math.min(safePage * pagination.pageSize, rows.length);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium text-3xl leading-none tracking-tight">Companies</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Every expedition company ICEFALL sells to or works with. One canonical record — the operator portal edits
            this same row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* This creates the RECORD and drops you into its page editor. It is
              not a modal, and nothing is written until the form is submitted. */}
          <Button asChild>
            <Link href="/dashboard/sales/companies/new">
              <Plus /> Add company
            </Link>
          </Button>
        </div>
      </div>

      <Resolve
        result={result}
        what="companies"
        empty="No companies yet. The first operator ICEFALL signs appears here."
        isEmpty={(value) => value.length === 0}
      >
        {(loaded) => {
          const counts = {
            total: loaded.length,
            active: loaded.filter((r) => r.status === "active").length,
            onboarding: loaded.filter((r) => r.status === "onboarding").length,
            suspended: loaded.filter((r) => r.status === "suspended").length,
            unverified: loaded.filter((r) => r.verification_status === "unverified").length,
          };

          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatTile label="Companies" value={counts.total} caption="Total companies" icon={Building2} />
                <StatTile
                  label="Active accounts"
                  value={counts.active}
                  caption="Active and onboarded"
                  icon={CheckCircle2}
                />
                <StatTile
                  label="Onboarding"
                  value={counts.onboarding}
                  caption="In the onboarding flow"
                  icon={UserPlus}
                />
                <StatTile label="Suspended" value={counts.suspended} caption="Access suspended" icon={PauseCircle} />
                <StatTile
                  label="Unverified"
                  value={counts.unverified}
                  caption="Awaiting verification"
                  icon={ShieldQuestion}
                />
              </div>

              <Card>
                <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
                  <CardTitle className="text-xl leading-none">All companies</CardTitle>
                  <CardDescription className="max-w-md leading-snug">
                    Select a row to open the company&apos;s record.
                  </CardDescription>
                  <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap items-center justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:justify-end md:justify-self-end">
                    <span className="text-muted-foreground text-sm tabular-nums">
                      Showing {from} to {to} of {loaded.length} results
                    </span>
                  </CardAction>
                </CardHeader>

                <CardContent className="flex flex-col gap-4 px-0">
                  <CompaniesTable
                    table={table}
                    pages={pages}
                    safePage={safePage}
                    perPage={pagination.pageSize}
                    onPerPage={(size) => setPagination({ pageIndex: 0, pageSize: size })}
                    onPage={(page) => setPagination((p) => ({ ...p, pageIndex: page - 1 }))}
                    onOpenCompany={(id) => router.push(`/dashboard/sales/companies/${id}`)}
                  />

                  <p className="px-4 text-muted-foreground text-xs leading-relaxed">
                    &ldquo;Documents checked&rdquo; means a member of ICEFALL staff read them on that date. No insurer,
                    registrar or awarding association was contacted, so nothing here is a third party&apos;s
                    confirmation.
                  </p>
                </CardContent>
              </Card>
            </>
          );
        }}
      </Resolve>
    </div>
  );
}
