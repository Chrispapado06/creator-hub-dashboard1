import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Resolve } from "@/components/states";
import { getCompany, listPlacements } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, PlacementView } from "@/data/types";
import { CompanyStatusBadge, VerificationChip } from "./Companies";
import { CompanyAccess } from "@/components/CompanyAccess";
import { PlacementRow } from "@/components/placement";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * One company.
 *
 * The tabs the specification asks for — Commercial, Mountains, Expeditions,
 * Treks, Leads, Bookings, Messages, Billing, Documents, Notes, Activity — arrive
 * with the modules that own their data. What is here is what exists.
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
 * ── THE RE-SKIN, 2026-09-03 ────────────────────────────────────────────────
 * Shaped as theme-ref /dashboard/profile — the theme's own "one record" page:
 * an avatar beside the name, a quiet second line, a row of badges under it and
 * the actions to the right (`profile-header.tsx`); then the body in cards, with
 * key/values drawn as `profile-overview.tsx` draws them — a `text-xs
 * text-muted-foreground` label over a `text-sm` value.
 *
 * ═══ THE DISCLOSURE BADGE IS LOAD-BEARING. READ domain/companies.ts. ═══
 * `real_business` is rendered in the badge row below and it is the reason that
 * row exists at all. The guard comment on the record warns that a generic card
 * has no slot for a disclosure and that is exactly how it disappears in a
 * re-skin. It did not disappear here: it moved from a `Pill` to the theme's
 * `Badge`, in the same place, saying the same words, and it is the LAST badge
 * in the row so nothing can push it off. Grep `real_business` before and after
 * any further work on this file.
 */
export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<Result<Company>>(loading);
  const [placements, setPlacements] = useState<Result<PlacementView[]>>(loading);

  useEffect(() => {
    if (!id) return;
    void getCompany(id).then(setCompany);
    void listPlacements().then(setPlacements);
  }, [id]);

  return (
    <Resolve result={company} what="this company">
      {(c) => {
        // Only ever a count of the rows drawn below, and only when the list was
        // actually read. A list that failed to load shows no bubble rather than
        // a zero, which would read as "this company holds no positions".
        const held =
          placements.state === "ok"
            ? placements.value.filter((p) => p.company_id === c.id).length
            : null;

        return (
          <div className="flex flex-col gap-4 md:gap-6">
            {/* ── Record header — the theme's profile-header.tsx ────────── */}
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <Avatar className="size-14 shrink-0">
                  <AvatarFallback className="text-base font-medium">
                    {initials(c.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <h1 className="font-medium text-3xl leading-none tracking-tight">{c.name}</h1>
                    {c.description && (
                      <p className="max-w-2xl text-muted-foreground text-sm leading-5">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CompanyStatusBadge status={c.status} />
                    <VerificationChip company={c} />
                    {/* What this listing claims about itself. TRUE carries the
                        public disclosure banner; FALSE is the default every
                        company is born with. NEITHER BRANCH MAY BE DROPPED —
                        see the header, and domain/companies.ts. */}
                    {c.real_business ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/20 bg-amber-500/10 px-2 py-1 font-medium text-amber-600 dark:text-amber-400"
                      >
                        Real business — disclosure shown
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-border bg-ui-muted/50 px-2 py-1 font-medium text-muted-foreground"
                      >
                        Invented company
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl leading-none">Identity</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="flex flex-col gap-5">
                    <Field label="Legal name" value={c.legal_name} />
                    <Field label="Slug" value={c.slug} />
                    <Field
                      label="Countries"
                      // The join is kept as the emptiness test so the absence
                      // sentence appears in exactly the cases it always did.
                      value={c.countries.join(", ") ? <Tags items={c.countries} /> : null}
                    />
                    <Field
                      label="Regions served"
                      value={c.regions.join(", ") ? <Tags items={c.regions} /> : null}
                    />
                  </dl>
                </CardContent>
              </Card>

              <section className="lg:col-span-2">
                <Resolve
                  result={placements}
                  what="placements"
                  isEmpty={(v) => v.filter((p) => p.company_id === c.id).length === 0}
                  empty="This company holds no paid positions."
                >
                  {(all) => (
                    <Card>
                      <CardHeader className="border-b">
                        <CardTitle className="text-xl leading-none">
                          Marketplace placements
                        </CardTitle>
                        {/* The count only ever appears when the list resolved.
                            `held === null` draws nothing at all, because a "0"
                            here would claim this company holds no positions
                            when the truth is that nobody could read the list. */}
                        {held !== null && held > 0 && (
                          <CardAction>
                            <Badge className="tabular-nums">{held}</Badge>
                          </CardAction>
                        )}
                      </CardHeader>
                      <CardContent className="px-0">
                        <Table className="min-w-[620px]">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              {/* px-5, and deliberately not the theme's p-3.
                                  The body cells come from components/placement.tsx,
                                  which is a shared component this pass may not
                                  edit and which sits at px-5. Matching it keeps
                                  every cell under its own heading; the day that
                                  file moves to p-3, these move with it. */}
                              <TableHead className="px-5 py-3 font-normal">Position</TableHead>
                              <TableHead className="px-5 py-3 font-normal">Mountain</TableHead>
                              <TableHead className="px-5 py-3 font-normal">Term</TableHead>
                              <TableHead className="px-5 py-3 font-normal">Price</TableHead>
                              <TableHead className="px-5 py-3 font-normal">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {all
                              .filter((p) => p.company_id === c.id)
                              .map((p) => (
                                <PlacementRow key={p.id} placement={p} showCompany={false} />
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </Resolve>
              </section>
            </div>

            <CompanyAccess companyId={c.id} />
          </div>
        );
      }}
    </Resolve>
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
 * theme's field pattern (profile-overview.tsx) is a `text-xs` muted label over
 * a `text-sm` value; the missing case keeps that shape and only drops the
 * value to the third grey, so an absence never reads as a value.
 */
function Field({ label, value }: { label: string; value: ReactNode }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={missing ? "text-faint text-sm" : "text-sm"}>
        {missing ? "Not recorded" : value}
      </dd>
    </div>
  );
}
