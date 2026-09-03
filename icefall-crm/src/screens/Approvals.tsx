import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Resolve } from "@/components/states";
import { listCompanies, listPendingApprovals, listProducts } from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type { Company, ContentVersion, ContentVersionState, Product } from "@/data/types";
import { cn, formatMoment, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * The Content Approval Center — the moderation layer between an operator editing
 * and the public seeing it.
 *
 * A submission is a PATCH: it carries only the fields it changes, which is what
 * lets one price edit be approved without dragging every other pending change
 * back into review. So the comparison shown is per-field — what is live now
 * beside what is proposed — rather than two copies of a whole record.
 *
 * The `possible_contact_details` flag is advisory. It puts a change in front of
 * a person; it never blocked the operator from submitting it, because the test
 * is a heuristic and "call the hut on arrival" is not a violation.
 *
 * ── THE RE-SKIN, 2026-09-03 ────────────────────────────────────────────────
 * Owner: "i dont see any change i want the designs 1:1". A submission is now a
 * theme Card shaped like the theme's own list cards (crm/_components/
 * task-reminders.tsx, opportunities-section.tsx): the who and the when in a
 * CardHeader, the review state in CardAction on the right, and the diff itself
 * as a table inside the card at `px-0` — the theme's "table lives in a card"
 * pattern from /dashboard/users.
 *
 * ONE LABEL MOVED RATHER THAN WENT AWAY. The section heading "Live now →
 * proposed" is now carried by the diff table's own column headings — "Field",
 * "Live now", "Proposed" — which say the same thing in the place the reader is
 * actually looking. Nothing else changed: every sentence below is the sentence
 * that was there.
 */

/**
 * A review state in the theme's badge vocabulary.
 *
 * Everything that is still somebody's decision to make — draft, pending, changes
 * requested — is the waiting state, because none of them has reached the public
 * record. `superseded` is neutral rather than refused: a later submission took
 * its place, which is not the same as anyone having turned it down.
 */
const reviewState = (s: ContentVersionState): "ok" | "pending" | "bad" | "neutral" =>
  s === "approved" ? "ok" : s === "rejected" ? "bad" : s === "superseded" ? "neutral" : "pending";

/** The four states, in the theme's own status colours (users/data.tsx statusMeta). */
const REVIEW_META: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: {
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  pending: {
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: {
    badge: "border-border bg-ui-muted/50 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export default function Approvals() {
  const [result, setResult] = useState<Result<ContentVersion[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [products, setProducts] = useState<Result<Product[]>>(loading);

  useEffect(() => {
    void listPendingApprovals().then(setResult);
    void listCompanies().then(setCompanies);
    void listProducts().then(setProducts);
  }, []);

  const companyName = (id: string) =>
    companies.state === "ok" ? companies.value.find((c) => c.id === id)?.name : null;
  const entityName = (v: ContentVersion) =>
    v.entity_type === "product" && products.state === "ok"
      ? (products.value.find((p) => p.id === v.entity_id)?.name ?? null)
      : null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium text-3xl leading-none tracking-tight">Approvals</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Operator changes waiting on a decision. While a change is pending, the live version
            stays exactly as it is — rejecting one leaves the public record untouched.
          </p>
        </div>
      </div>

      <Resolve
        result={result}
        what="pending changes"
        isEmpty={(v) => v.length === 0}
        empty="Nothing is waiting for review."
      >
        {(versions) => (
          <div className="flex flex-col gap-4 md:gap-6">
            {versions.map((v) => {
              const company = companyName(v.company_id);
              const entity = entityName(v);
              const meta = REVIEW_META[reviewState(v.state)];
              return (
                <Card key={v.id}>
                  <CardHeader className="border-b">
                    <CardTitle className="flex min-w-0 items-center gap-3 text-xl leading-none">
                      {/* An unresolved company gets the neutral placeholder glyph:
                          initials taken from the words "Unknown company" would
                          read as a name ICEFALL holds. */}
                      <Avatar className="size-9 shrink-0">
                        <AvatarFallback className="text-xs font-medium">
                          {company ? initials(company) : ""}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate">
                        {company ?? "Unknown company"}
                        {entity ? ` — ${entity}` : ""}
                      </span>
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-12">
                      <Badge variant="outline" className="font-normal">
                        {v.entity_type}
                      </Badge>
                      <span>
                        {v.changed_fields.length} field
                        {v.changed_fields.length === 1 ? "" : "s"} · submitted{" "}
                        {/* An unrecorded submission time says so. It is never a
                            dash and never today's date. */}
                        {formatMoment(v.submitted_at) ?? "at an unrecorded time"}
                      </span>
                    </CardDescription>
                    <CardAction className="flex shrink-0 flex-wrap items-center gap-2">
                      {v.flags.includes("possible_contact_details") && (
                        <Badge
                          variant="outline"
                          className="gap-1.5 border-amber-500/20 bg-amber-500/10 px-2 py-1 font-medium text-amber-600 dark:text-amber-400"
                        >
                          <AlertTriangle className="size-3" />
                          Possible contact details
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn("gap-1.5 border px-2 py-1 font-medium capitalize", meta.badge)}
                      >
                        <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        {v.state}
                      </Badge>
                    </CardAction>
                  </CardHeader>

                  <CardContent className="px-0">
                    <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[12rem] py-3 font-normal">Field</TableHead>
                          <TableHead className="py-3 font-normal">Live now</TableHead>
                          <TableHead className="py-3 font-normal">Proposed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {v.changed_fields.map((f) => {
                          const live = render(f, v.base_snapshot?.[f]);
                          const proposed = render(f, v.payload[f]);
                          // The same test `render` uses, so the figures it formatted
                          // as money are the figures set as money.
                          const isMoney = f.endsWith("_cents");
                          return (
                            <TableRow key={f} className="border-border/60 hover:bg-transparent">
                              <TableCell className="py-3 align-top font-medium whitespace-normal text-muted-foreground">
                                {f}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "min-w-0 py-3 align-top break-words whitespace-normal text-muted-foreground",
                                  isMoney && live !== null && "tabular-nums",
                                )}
                              >
                                {/* A field with no live value has never been set.
                                    That is not the same as a field being cleared,
                                    which is what the right-hand column says, and
                                    the two must not collapse into one word. */}
                                {live ?? <span className="text-faint">Not recorded</span>}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "min-w-0 py-3 align-top break-words whitespace-normal",
                                  isMoney && proposed !== null
                                    ? "text-base font-medium tracking-tight tabular-nums"
                                    : "font-medium",
                                )}
                              >
                                {/* A proposed null is a deliberate CLEARING —
                                    the operator is asking for the value to go
                                    away. Reading it as "not recorded" would put
                                    a decision in front of a reviewer with the
                                    verb removed. */}
                                {proposed ?? <span className="font-normal text-faint">Cleared</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Resolve>
    </div>
  );
}

/**
 * A proposed value, as a person would read it.
 *
 * Money is stored in integer cents, and a reviewer shown "165000 → 185000" is
 * being asked to approve a price change whose size they have to work out in
 * their head. Worse, the raw figures make a €200 rise look like a 20,000-unit
 * one. Any field whose name ends `_cents` is money and is formatted as money.
 */
function render(field: string, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (field.endsWith("_cents") && typeof v === "number") return formatCents(v);
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}
