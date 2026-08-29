import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Avatar, Card, PageHead, Pill, SectionLabel, StatusChip } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listCompanies, listPendingApprovals, listProducts } from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type { Company, ContentVersion, ContentVersionState, Product } from "@/data/types";
import { cn, formatMoment } from "@/lib/utils";

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
 */

/**
 * A review state in the mockup's chip vocabulary.
 *
 * Everything that is still somebody's decision to make — draft, pending, changes
 * requested — is the waiting state, because none of them has reached the public
 * record. `superseded` is neutral rather than refused: a later submission took
 * its place, which is not the same as anyone having turned it down.
 */
const reviewState = (s: ContentVersionState): "ok" | "pending" | "bad" | "neutral" =>
  s === "approved" ? "ok" : s === "rejected" ? "bad" : s === "superseded" ? "neutral" : "pending";

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
    <>
      <PageHead
        title="Approvals"
        subtitle="Operator changes waiting on a decision. While a change is pending, the live version stays exactly as it is — rejecting one leaves the public record untouched."
      />
      <Resolve
        result={result}
        what="pending changes"
        isEmpty={(v) => v.length === 0}
        empty="Nothing is waiting for review."
      >
        {(versions) => (
          <div className="space-y-4">
            {versions.map((v) => {
              const company = companyName(v.company_id);
              const entity = entityName(v);
              return (
                <Card key={v.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {/* An unresolved company gets the neutral placeholder glyph:
                          initials taken from the words "Unknown company" would
                          read as a name ICEFALL holds. */}
                      <Avatar name={company ?? ""} size={34} />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                          {company ?? "Unknown company"}
                          {entity ? ` — ${entity}` : ""}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-faint">
                          <Pill>{v.entity_type}</Pill>
                          <span>
                            {v.changed_fields.length} field
                            {v.changed_fields.length === 1 ? "" : "s"} · submitted{" "}
                            {formatMoment(v.submitted_at) ?? "at an unrecorded time"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      {v.flags.includes("possible_contact_details") && (
                        <Pill tone="amber">
                          <AlertTriangle size={12} strokeWidth={2} />
                          Possible contact details
                        </Pill>
                      )}
                      <StatusChip state={reviewState(v.state)} label={v.state} />
                    </div>
                  </div>

                  <SectionLabel className="mt-5">Live now → proposed</SectionLabel>
                  <div className="mt-2 space-y-1.5">
                    {v.changed_fields.map((f) => {
                      const live = render(f, v.base_snapshot?.[f]);
                      const proposed = render(f, v.payload[f]);
                      // The same test `render` uses, so the figures it formatted
                      // as money are the figures set as money.
                      const isMoney = f.endsWith("_cents");
                      return (
                        <div
                          key={f}
                          className="grid grid-cols-1 gap-1.5 rounded-tile bg-raised px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-4"
                        >
                          <p className="text-[12px] font-semibold text-faint">{f}</p>
                          <p
                            className={cn(
                              "min-w-0 break-words text-[13px] text-muted",
                              isMoney && live !== null && "tnum",
                            )}
                          >
                            {live ?? <span className="text-faint">Not recorded</span>}
                          </p>
                          <p
                            className={cn(
                              "min-w-0 break-words text-ink",
                              isMoney && proposed !== null
                                ? "tnum text-[15px] font-bold tracking-[-0.02em]"
                                : "text-[13px] font-medium",
                            )}
                          >
                            {proposed ?? <span className="font-normal text-faint">Cleared</span>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Resolve>
    </>
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
