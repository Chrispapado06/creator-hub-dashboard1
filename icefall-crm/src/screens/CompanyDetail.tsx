import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  Avatar,
  Card,
  CountBubble,
  PageHead,
  Pill,
  SectionLabel,
  StatusChip,
  TableCard,
} from "@/components/ui";
import { Resolve } from "@/components/states";
import { getCompany, listPlacements } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, PlacementView } from "@/data/types";
import { VerificationChip, companyStatusState } from "./Companies";
import { PlacementRow } from "@/components/placement";

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
          <>
            <div className="flex items-start gap-4">
              <div className="pt-1">
                <Avatar name={c.name} size={52} />
              </div>
              <div className="min-w-0 flex-1">
                <PageHead
                  title={c.name}
                  subtitle={c.description ?? undefined}
                  actions={
                    <>
                      <StatusChip state={companyStatusState(c.status)} label={c.status} />
                      <VerificationChip company={c} />
                    </>
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-6">
                <SectionLabel>Identity</SectionLabel>
                <dl className="mt-4 space-y-4">
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
              </Card>

              <section className="lg:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <SectionLabel>Marketplace placements</SectionLabel>
                  {held !== null && held > 0 && <CountBubble>{held}</CountBubble>}
                </div>
                <Resolve
                  result={placements}
                  what="placements"
                  isEmpty={(v) => v.filter((p) => p.company_id === c.id).length === 0}
                  empty="This company holds no paid positions."
                >
                  {(all) => (
                    <TableCard>
                      <table className="w-full min-w-[620px] text-[13.5px]">
                        <thead>
                          <tr className="border-b border-line-soft text-left">
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">
                              Position
                            </th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">
                              Mountain
                            </th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">
                              Term
                            </th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">
                              Price
                            </th>
                            <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {all
                            .filter((p) => p.company_id === c.id)
                            .map((p) => (
                              <PlacementRow key={p.id} placement={p} showCompany={false} />
                            ))}
                        </tbody>
                      </table>
                    </TableCard>
                  )}
                </Resolve>
              </section>
            </div>
          </>
        );
      }}
    </Resolve>
  );
}

/** A list of taxonomy values. Neutral pills — none of these is a status. */
function Tags({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Pill key={i}>{i}</Pill>
      ))}
    </span>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={missing ? "mt-1 text-[13.5px] text-faint" : "mt-1.5 text-[13.5px] font-medium text-ink"}>
        {missing ? "Not recorded" : value}
      </dd>
    </div>
  );
}
