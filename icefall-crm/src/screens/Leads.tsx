import { useEffect, useState } from "react";
import { Avatar, PageHead, Pill, SectionLabel, Stat, StatusChip, TableCard } from "@/components/ui";
import { EnquiryQueue } from "@/components/EnquiryQueue";
import { Resolve } from "@/components/states";
import { listLeads } from "@/data/queries";
import { formatRatio, loading, type Ratio, type Result } from "@/data/result";
import type { Lead, LeadStatus } from "@/data/types";
import { formatMoment } from "@/lib/utils";

/**
 * The pastel is written into the row, never assembled from it. Tailwind scans
 * source text, so a tone built as `bg-${stage}` would generate no class at all
 * and the tile would come out white.
 */
const PIPELINE: { id: LeadStatus; label: string; tone: "butter" | "sky" | "lilac" | "mint" }[] = [
  { id: "new", label: "New", tone: "butter" },
  { id: "contacted", label: "Contacted", tone: "sky" },
  { id: "qualified", label: "Qualified", tone: "lilac" },
  { id: "quoted", label: "Quoted", tone: "mint" },
  { id: "booked", label: "Booked", tone: "butter" },
];

/**
 * The status control's four states, holding exactly the meanings the older
 * pill carried: booked is settled, lost is refused, disputed is the one that
 * wants somebody, and a lead still moving is neither good news nor bad.
 */
const statusState = (s: LeadStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "booked" ? "ok" : s === "lost" ? "bad" : s === "disputed" ? "pending" : "neutral";

/**
 * Every enquiry, and where it got to.
 *
 * THE CONVERSION RATE IS A RATIO, NOT A NUMBER, until the moment it is drawn.
 * With no enquiries there is no conversion rate — it is unavailable, not 0%.
 * Those two render differently on purpose: 0% says the marketplace is failing,
 * "no enquiries yet" says nobody has asked. A founder reading the first when the
 * second is true would change the product to fix a problem that does not exist.
 *
 * The conversion tile is the one tile that can come up empty, and when it does
 * it drops to plain white. A butter-yellow card carrying a sentence about why
 * there is no rate would read, across a room, exactly like one carrying a rate.
 */
export default function Leads() {
  const [result, setResult] = useState<Result<Lead[]>>(loading);
  useEffect(() => {
    void listLeads().then(setResult);
  }, []);

  const conversion = (leads: Lead[]): Ratio => ({
    numerator: leads.filter((l) => l.status === "booked").length,
    denominator: leads.length,
  });

  return (
    <>
      <PageHead
        title="Leads"
        subtitle="Who is waiting on us right now — every enquiry from every app, longest wait first — and beneath it, the lead records with their attribution preserved."
      />

      <EnquiryQueue />

      <SectionLabel>Lead records</SectionLabel>
      <Resolve
        result={result}
        what="leads"
        isEmpty={(v) => v.length === 0}
        empty="No enquiries have been made yet. A lead is created automatically when a customer enquires."
      >
        {(leads) => {
          const rate = conversion(leads);
          const drawn = formatRatio(rate);
          return (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {PIPELINE.map((s) => (
                  <Stat
                    key={s.id}
                    tone={s.tone}
                    label={s.label}
                    value={leads
                      .filter((l) => l.status === s.id)
                      .length.toLocaleString("en-GB")}
                  />
                ))}
                <Stat
                  tone="sky"
                  label="Conversion"
                  value={drawn}
                  reason="No enquiries to divide by"
                />
              </div>
              <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-faint">
                Each stage tile counts the enquiries sitting at that status now, not the enquiries
                that ever reached it. Lost and disputed enquiries sit at neither, so the five stages
                do not add up to the total — while the conversion divides bookings by every enquiry,
                including those two.
              </p>

              <div className="mt-5">
                <TableCard>
                  <table className="w-full min-w-[820px] text-[13.5px]">
                    <thead>
                      <tr className="border-b border-line-soft text-left">
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Mountain</th>
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Created</th>
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Source</th>
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Why lost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((l) => (
                        <tr key={l.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                          <td className="px-5 py-3.5">
                            {/* An enquiry with no mountain on it still gets the circle, so the
                                column stays a column — but the circle is empty and the words
                                next to it say so, rather than a plausible-looking initial. */}
                            <span className="flex items-center gap-3">
                              <Avatar name={l.destination_id ?? ""} size={34} />
                              {l.destination_id ? (
                                <span className="font-medium text-ink">{l.destination_id}</span>
                              ) : (
                                <span className="text-faint">Not recorded</span>
                              )}
                            </span>
                          </td>
                          <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                            {formatMoment(l.created_at)}
                          </td>
                          <td className="px-5 py-3.5">
                            {l.source_page ? (
                              <Pill>{l.source_page}</Pill>
                            ) : (
                              <span className="text-faint">Unknown</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusChip state={statusState(l.status)} label={l.status} />
                          </td>
                          <td className="px-5 py-3.5 text-muted">
                            {l.lost_reason ?? <span className="text-faint">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>
              </div>
            </>
          );
        }}
      </Resolve>
    </>
  );
}
