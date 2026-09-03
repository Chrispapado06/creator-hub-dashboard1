import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, CheckCircle2, EllipsisVertical, PauseCircle, Plus, ShieldQuestion, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Resolve } from "@/components/states";
import { CompanyLogo } from "@/components/CompanyLogo";
import { OFFLINE } from "@/offline/offline";
import { cn, formatDay } from "@/lib/utils";
import { listCompanies, listRevenue } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import { Select } from "@/components/controls";
import type { Company, RevenueRecord } from "@/data/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Companies — the mockup's design on the REAL query layer.
 *
 * This page rendered a fixture roster for a few hours on 30 Aug 2026 while its
 * sibling screens read the live database, which meant it showed 48 companies
 * that did not exist beside 21 screens showing the 8 that do. Same design,
 * honest data source: `listCompanies()` with the `Result` wrapper, so "no
 * database", "query failed" and "genuinely no companies" each say what they
 * are instead of all rendering as an empty table.
 *
 * The tiles are COUNTED from the rows. Revenue YTD is summed from
 * `revenue_records` for the current year — a company with no revenue rows says
 * "None recorded", because an empty ledger is an absence, not a euro amount.
 *
 * THE SQUARE LOGOS STAY (owner: "real company logos … in square not circle").
 * `OPERATOR_DOMAINS` maps a company slug to its real website, and the logo is
 * fetched live from that domain. The live database holds invented companies
 * today, so today you see initials; the moment a real operator's record exists
 * under one of these slugs, its own mark appears. Nothing is copied into the
 * repo either way.
 *
 * ── THE RE-SKIN, 2026-09-03 ────────────────────────────────────────────────
 * Owner: "i dont see any change i want the designs 1:1". This screen is now
 * shaped as the theme's own roster page, theme-ref /dashboard/users, with the
 * headline figures taking the tile from /dashboard/default:
 *
 *   page head    h1 `font-medium text-3xl leading-none tracking-tight` over a
 *                `text-muted-foreground text-sm` line, actions on the right —
 *                the theme's invoice/page.tsx header, verbatim.
 *   stat tile    Card + a `size-7 rounded-lg border bg-ui-muted` icon square,
 *                CardDescription label, `font-medium text-3xl tabular-nums`
 *                figure, `text-muted-foreground text-sm` caption. Measured on
 *                the running theme, not guessed.
 *   the roster   ONE Card. CardHeader carries the title, the description and
 *                the actions and closes with a `border-b`; CardContent is
 *                `px-0` so the table runs to the card's edge; the footer is
 *                the theme's Separator + "Rows per page" + Pagination.
 *   the rows     the theme's Table primitives with its own class hooks —
 *                `**:data-[slot='table-cell']:px-4`, TableHead `py-4
 *                font-normal`, TableRow `border-border/60`.
 *
 * NOTHING WAS DROPPED. Every control that was here is still here and still
 * does the same thing: add-company, row-click-through, the five counts, the
 * per-page chooser, the numbered pager, the results sentence, the row overflow
 * glyph. Two MOVED rather than went away, and both are noted at their new home.
 */

export const companyStatusTone = (s: Company["status"]) =>
  s === "active" ? "green" : s === "suspended" || s === "churned" ? "red" : "amber";

/**
 * The same three-way reading of a lifecycle state, for the mockup's status
 * control. It mirrors `companyStatusTone` exactly — active is settled, suspended
 * and churned are refusals, everything else is still on its way — so the two
 * cannot drift into disagreeing about the same row.
 */
export const companyStatusState = (s: Company["status"]): "ok" | "pending" | "bad" | "neutral" =>
  s === "active" ? "ok" : s === "suspended" || s === "churned" ? "bad" : "pending";

/**
 * What "verified" is allowed to say on a screen.
 *
 * ICEFALL checks documents. It does not contact the issuing association, and it
 * must never print anything a reader could take as meaning it did. The date
 * comes from `documents_checked_at`, which is NULL until a real staff review
 * recorded one — so an unchecked company shows the absence, not a placeholder.
 *
 * RE-SKIN NOTE: the shell is the theme's outline Badge with a status dot, from
 * users-columns.tsx `StatusBadge`. THE SENTENCES ARE UNTOUCHED — "Documents
 * checked 4 Aug 2026" is the whole point of this component and a theme has no
 * opinion about it. The unverified/pending/rejected cases still print the raw
 * status word rather than a friendlier synonym.
 */
export function VerificationChip({ company }: { company: Company }) {
  if (company.verification_status !== "verified") {
    const refused =
      company.verification_status === "rejected" || company.verification_status === "suspended";
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 border px-2 py-1 font-medium capitalize",
          refused
            ? "border-destructive/20 bg-destructive/10 text-destructive"
            : company.verification_status === "pending"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "border-border bg-ui-muted/50 text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            refused
              ? "bg-destructive"
              : company.verification_status === "pending"
                ? "bg-amber-500"
                : "bg-muted-foreground",
          )}
        />
        {company.verification_status}
      </Badge>
    );
  }
  const on = formatDay(company.documents_checked_at);
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600 dark:text-emerald-400"
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      {on ? `Documents checked ${on}` : "Documents checked"}
    </Badge>
  );
}

/** Real operators' websites, by the slug their record would use. Public facts. */
export const OPERATOR_DOMAINS: Record<string, string> = {
  "elite-exped": "eliteexped.com",
  "seven-summit-treks": "sevensummittreks.com",
  "14-peaks-expedition": "14peaksexpedition.com",
  "alpine-ascents-international": "alpineascents.com",
  "adventure-consultants": "adventureconsultants.com",
  "madison-mountaineering": "madisonmountaineering.com",
  "furtenbach-adventures": "furtenbachadventures.com",
  "imagine-nepal": "imagine-nepal.com",
  "8k-expeditions": "8kexpeditions.com",
  "climbing-the-seven-summits": "climbingthesevensummits.com",
  "international-mountain-guides": "mountainguides.com",
  "jagged-globe": "jagged-globe.co.uk",
  "pioneer-adventure": "pioneeradventure.com",
  "mountain-professionals": "mtnprofessionals.com",
  "kobler-partner": "kobler-partner.ch",
  "summitclimb": "summitclimb.com",
};

/**
 * The lifecycle word, in the theme's own status vocabulary.
 *
 * These five pairs are lifted from theme-ref users/_components/data.tsx
 * `statusMeta` rather than invented: emerald for settled, amber for in-flight,
 * orange for suspended, destructive for gone, neutral for not-yet-started. The
 * mapping keeps the same three-way reading `companyStatusTone` has always had —
 * it does not re-rank anything — and it keeps five statuses distinguishable,
 * which a single neutral badge would not.
 */
const STATUS_META: Record<Company["status"], { label: string; badge: string; dot: string }> = {
  prospect: {
    label: "Prospect",
    badge: "border-border bg-ui-muted/50 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  onboarding: {
    label: "Onboarding",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  active: {
    label: "Active",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  suspended: {
    label: "Suspended",
    badge: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  churned: {
    label: "Churned",
    badge: "border-destructive/20 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

/**
 * The lifecycle word as the theme draws it, exported so the company's own page
 * cannot drift from its row in the roster. One definition, two screens — which
 * is the same reason `companyStatusState` and `companyStatusTone` sit up there
 * together rather than being re-derived per surface.
 */
export function CompanyStatusBadge({ status }: { status: Company["status"] }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", meta.badge)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

/**
 * The theme's metric card, from /dashboard/default `metric-cards.tsx`.
 *
 * NOTE WHAT IS NOT HERE: the theme's tile carries a delta Badge — "+12.5% vs
 * last month". These five counts have no previous period to compare against;
 * nothing in this app stores yesterday's roster. A tile that renders the theme's
 * pill with a number nobody measured is the exact failure this codebase spends
 * its comments guarding against, so the pill is left off rather than filled in.
 * The `caption` says what the figure counts instead.
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
          <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* A measured zero is a zero. It is never softened into a dash. */}
          <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</div>
        </div>
        <p className="text-muted-foreground text-sm">{caption}</p>
      </CardContent>
    </Card>
  );
}

/** Recognised revenue this calendar year, per company — or null for "no rows". */
function revenueYtdByCompany(records: RevenueRecord[]): Map<string, number> {
  const year = new Date().getFullYear();
  const sums = new Map<string, number>();
  for (const r of records) {
    if (r.company_id === null) continue;
    if (new Date(r.recognised_on).getFullYear() !== year) continue;
    if (r.status === "written_off") continue;
    sums.set(r.company_id, (sums.get(r.company_id) ?? 0) + r.amount_cents);
  }
  return sums;
}

export default function Companies() {
  const navigate = useNavigate();
  const [result, setResult] = useState<Result<Company[]>>(loading);
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);

  useEffect(() => {
    void listCompanies().then(setResult);
    void listRevenue().then(setRevenue);
  }, []);

  const ytd = useMemo(
    () => (revenue.state === "ok" ? revenueYtdByCompany(revenue.value) : null),
    [revenue],
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* The theme's page header — invoice/page.tsx. The old PageHead drew a
          31px extrabold title; the theme's is 30px at weight 500. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium text-3xl leading-none tracking-tight">Companies</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Every expedition company ICEFALL sells to or works with. One canonical record — the
            operator portal edits this same row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => navigate("/admin/companies/page/new")}>
            <Plus data-icon="inline-start" /> Add company
          </Button>
        </div>
      </div>

      <Resolve
        result={result}
        what="companies"
        empty="No companies yet. The first operator ICEFALL signs appears here."
        isEmpty={(rows) => rows.length === 0}
      >
        {(rows) => {
          const counts = {
            total: rows.length,
            active: rows.filter((r) => r.status === "active").length,
            onboarding: rows.filter((r) => r.status === "onboarding").length,
            suspended: rows.filter((r) => r.status === "suspended").length,
            unverified: rows.filter((r) => r.verification_status === "unverified").length,
          };
          const pages = Math.max(1, Math.ceil(rows.length / perPage));
          const safePage = Math.min(page, pages);
          const visible = rows.slice((safePage - 1) * perPage, safePage * perPage);
          const from = (safePage - 1) * perPage + 1;
          const to = Math.min(safePage * perPage, rows.length);
          const pageItems: (number | "…")[] =
            pages <= 5 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3, "…", pages];

          return (
            <>
              <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-5 dark:*:data-[slot=card]:bg-card">
                <StatTile label="Companies" value={counts.total} caption="Total companies" icon={Building2} />
                <StatTile label="Active accounts" value={counts.active} caption="Active and onboarded" icon={CheckCircle2} />
                <StatTile label="Onboarding" value={counts.onboarding} caption="In the onboarding flow" icon={UserPlus} />
                <StatTile label="Suspended" value={counts.suspended} caption="Access suspended" icon={PauseCircle} />
                <StatTile label="Unverified" value={counts.unverified} caption="Awaiting verification" icon={ShieldQuestion} />
              </div>

              <Card>
                <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
                  <CardTitle className="text-xl leading-none">All companies</CardTitle>
                  <CardDescription className="max-w-md leading-snug">
                    Select a row to open the company's record.
                  </CardDescription>
                  {/* MOVED, NOT DELETED — the results sentence. It used to sit
                      in the pagination bar beside the pager; the theme puts the
                      row count in the card header and the page position in the
                      footer, so the two halves are split the theme's way and
                      both are still on screen. */}
                  <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap items-center justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:justify-end md:justify-self-end">
                    <span className="text-muted-foreground text-sm tabular-nums">
                      Showing {from} to {to} of {rows.length} results
                    </span>
                  </CardAction>
                </CardHeader>

                <CardContent className="flex flex-col gap-4 px-0">
                  <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                    <TableHeader className="[&_tr]:border-t">
                      <TableRow>
                        <TableHead className="py-4 font-normal">Company</TableHead>
                        <TableHead className="py-4 font-normal">Status</TableHead>
                        <TableHead className="py-4 font-normal">Countries</TableHead>
                        <TableHead className="py-4 font-normal">Trust</TableHead>
                        <TableHead className="py-4 font-normal">Joined</TableHead>
                        <TableHead className="py-4 text-right font-normal">Revenue YTD</TableHead>
                        <TableHead className="py-4 font-normal">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((r) => {
                        const earned = ytd?.get(r.id);
                        return (
                          <TableRow
                            key={r.id}
                            onClick={() => navigate(`/admin/companies/${r.id}`)}
                            className="cursor-pointer border-border/60"
                          >
                            <TableCell className="py-4 align-middle">
                              <span className="flex items-center gap-3">
                                {/* Offline the logo chain is skipped entirely:
                                    it fetches each operator's mark from their own
                                    site, which is a network call with nothing to
                                    reach. Initials render instead — a missing
                                    logo is a cosmetic absence, not information. */}
                                <CompanyLogo
                                  name={r.name}
                                  domain={OFFLINE ? null : OPERATOR_DOMAINS[r.slug]}
                                  size={32}
                                />
                                <span className="font-medium">{r.name}</span>
                              </span>
                            </TableCell>
                            <TableCell className="py-4 align-middle">
                              <CompanyStatusBadge status={r.status} />
                            </TableCell>
                            <TableCell className="py-4 align-middle text-muted-foreground">
                              {r.countries.length > 0 ? (
                                r.countries.join(", ")
                              ) : (
                                /* Not a dash and not a blank: the cell names the
                                   fact nobody has recorded. */
                                <span className="text-faint">Not recorded</span>
                              )}
                            </TableCell>
                            <TableCell className="py-4 align-middle">
                              <VerificationChip company={r} />
                            </TableCell>
                            <TableCell className="py-4 align-middle text-muted-foreground tabular-nums">
                              {formatDay(r.created_at)}
                            </TableCell>
                            <TableCell className="py-4 text-right align-middle font-medium tabular-nums">
                              {revenue.state !== "ok" ? (
                                /* Three different absences, three different
                                   sentences — a loading ledger, an unreachable
                                   one, and a company with no rows in it. None of
                                   them is €0, and none of them may print one. */
                                <span className="font-normal text-faint">
                                  {revenue.state === "loading" ? "…" : "Ledger unavailable"}
                                </span>
                              ) : earned === undefined ? (
                                <span className="font-normal text-faint">None recorded</span>
                              ) : (
                                `€${(earned / 100).toLocaleString("en-GB")}`
                              )}
                            </TableCell>
                            <TableCell className="py-4 text-right align-middle">
                              {/* Drawn because the roster draws it, and NOT
                                  interactive — there is no per-row action in
                                  this build. Same reasoning as the old kit's
                                  StatusChip chevron: a control that looks live
                                  and is not is its own kind of lie. */}
                              <EllipsisVertical
                                className="inline size-4 text-muted-foreground"
                                aria-hidden
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <Separator />

                  <div className="flex flex-wrap items-center justify-between gap-3 px-4">
                    <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
                      <div className="flex items-center gap-2">
                        {/* MOVED, NOT DELETED — the per-page chooser. It was at
                            the far right of the old bar; the theme puts it at
                            the left of the footer with a "Rows per page" label
                            beside it. Same control, same three choices, same
                            reset-to-page-one behaviour. */}
                        <span>Rows per page</span>
                        <Select
                          value={String(perPage)}
                          onChange={(v: string) => {
                            setPerPage(Number(v));
                            setPage(1);
                          }}
                          ariaLabel="Results per page"
                          className="w-20"
                          options={[
                            { value: "8", label: "8" },
                            { value: "16", label: "16" },
                            { value: "24", label: "24" },
                          ]}
                        />
                      </div>
                      <span className="tabular-nums">
                        Page {safePage} of {pages}
                      </span>
                    </div>

                    <Pagination className="mx-0 w-auto justify-start md:justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            text=""
                            className={safePage <= 1 ? "pointer-events-none opacity-50" : undefined}
                            onClick={(e) => {
                              e.preventDefault();
                              setPage((p) => Math.max(1, p - 1));
                            }}
                          />
                        </PaginationItem>
                        {pageItems.map((it, i) =>
                          it === "…" ? (
                            <PaginationItem key={`e${i}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          ) : (
                            <PaginationItem key={it}>
                              <PaginationLink
                                href="#"
                                isActive={it === safePage}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setPage(it);
                                }}
                              >
                                {it}
                              </PaginationLink>
                            </PaginationItem>
                          ),
                        )}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            text=""
                            className={
                              safePage >= pages ? "pointer-events-none opacity-50" : undefined
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              setPage((p) => Math.min(pages, p + 1));
                            }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </CardContent>
              </Card>
            </>
          );
        }}
      </Resolve>
    </div>
  );
}
