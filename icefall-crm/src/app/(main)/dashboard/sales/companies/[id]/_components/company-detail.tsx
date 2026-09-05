"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { CompanyStatusBadge, RealBusinessBadge, VerificationChip } from "../../_components/company-badges";
import type { CompanyInvitationRow, CompanyMemberRow, CompanyRow, PlacementRecord } from "../../_components/data";
import { initials } from "../../_components/format";
import { Resolve, type Result } from "../../_components/states";
import { CompanyAccess } from "./company-access";
import { CompanyRecordCards } from "./company-record-cards";
import { PlacementRow } from "./placement-row";

/**
 * One company.
 *
 * NOTE WHAT IS NOT HERE: nothing from `company_internal`. The account owner,
 * source, priority and internal notes live on a separate table with staff-only
 * policies, because row-level security is row-level — had they stayed on
 * `companies`, an operator reading their own row would read all of them.
 *
 * THERE ARE NO FIGURE TILES ACROSS THE TOP. Every count worth putting there —
 * leads raised, bookings converted, revenue billed — belongs to a module that
 * does not read from this page, and a tile assembled from the two lists this
 * screen does read would be a different number from the one its own module
 * prints. The placement count beside the table below is the exception: it counts
 * the rows immediately underneath it, so the two cannot disagree.
 *
 * ═══ THE DISCLOSURE BADGE IS LOAD-BEARING ═══
 * `real_business` is rendered in the badge row below and it is the reason that
 * row exists at all. It is the LAST badge in the row so nothing can push it
 * off. Grep `real_business` before and after any further work on this file.
 */
export function CompanyDetail({
  company,
  placements,
  members,
  invitations,
}: {
  company: CompanyRow;
  placements: Result<PlacementRecord[]>;
  members: Result<CompanyMemberRow[]>;
  invitations: Result<CompanyInvitationRow[]>;
}) {
  // Only ever a count of the rows drawn below, and only when the list was
  // actually read. A list that failed to load shows no bubble rather than a
  // zero, which would read as "this company holds no positions".
  const held = placements.state === "ok" ? placements.value.filter((p) => p.company_id === company.id).length : null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback className="font-medium text-base">{initials(company.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col gap-1">
              <h1 className="font-medium text-3xl leading-none tracking-tight">{company.name}</h1>
              {company.description ? (
                <p className="max-w-2xl text-muted-foreground text-sm leading-5">{company.description}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CompanyStatusBadge status={company.status} />
              <VerificationChip company={company} />
              {/* What this listing claims about itself. BOTH BRANCHES RENDER,
                  and this one is last so nothing can push it off the row. */}
              <RealBusinessBadge real={company.real_business} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/sales/companies">Back to companies</Link>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/sales/companies/${company.id}/page`}>Open the page editor</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl leading-none">Identity</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-5">
              <RecordField label="Legal name" value={company.legal_name} />
              <RecordField label="Slug" value={company.slug} />
              {/* The join is kept as the emptiness test so the absence sentence
                  appears in exactly the cases it always did. */}
              <RecordField
                label="Countries"
                value={company.countries.join(", ") ? <Tags items={company.countries} /> : null}
              />
              <RecordField
                label="Regions served"
                value={company.regions.join(", ") ? <Tags items={company.regions} /> : null}
              />
            </dl>
          </CardContent>
        </Card>

        <section className="lg:col-span-2">
          <Resolve
            result={placements}
            what="placements"
            isEmpty={(v) => v.filter((p) => p.company_id === company.id).length === 0}
            empty="This company holds no paid positions."
          >
            {(all) => (
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-xl leading-none">Marketplace placements</CardTitle>
                  {/* The count only ever appears when the list resolved. A "0"
                      here would claim this company holds no positions when the
                      truth is that nobody could read the list. */}
                  {held !== null && held > 0 ? (
                    <CardAction>
                      <Badge className="tabular-nums">{held}</Badge>
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardContent className="px-0">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[620px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="px-5 py-3 font-normal">Position</TableHead>
                          <TableHead className="px-5 py-3 font-normal">Mountain</TableHead>
                          <TableHead className="px-5 py-3 font-normal">Term</TableHead>
                          <TableHead className="px-5 py-3 font-normal">Price</TableHead>
                          <TableHead className="px-5 py-3 font-normal">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {all
                          .filter((p) => p.company_id === company.id)
                          .map((p) => (
                            <PlacementRow key={p.id} placement={p} showCompany={false} />
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </Resolve>
        </section>
      </div>

      <CompanyAccess members={members} invitations={invitations} />

      <CompanyRecordCards company={company} placements={placements} />
    </div>
  );
}

/** A list of taxonomy values. Neutral badges — none of these is a status. */
function Tags({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Badge key={i} variant="outline" className="font-normal">
          {i}
        </Badge>
      ))}
    </span>
  );
}

/**
 * A recorded fact, or the sentence saying nobody recorded it.
 *
 * "Not recorded" is not a placeholder and not a dash — it is the answer. The
 * missing case keeps the label/value shape and only drops the value to the
 * faint grey, so an absence never reads as a value.
 */
function RecordField({ label, value }: { label: string; value: ReactNode }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={missing ? "text-muted-foreground/70 text-sm" : "text-sm"}>{missing ? "Not recorded" : value}</dd>
    </div>
  );
}
