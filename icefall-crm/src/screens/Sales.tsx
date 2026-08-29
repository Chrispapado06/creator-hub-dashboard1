import { useEffect, useState } from "react";
import { Avatar, Card, CountBubble, PageHead, Stat } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listDeals } from "@/data/queries";
import { formatCentsShort, loading, type Result } from "@/data/result";
import type { Deal, DealStage } from "@/data/types";
import { formatDay } from "@/lib/utils";

const STAGES: { id: DealStage; label: string; colour: string }[] = [
  { id: "prospect", label: "Prospect", colour: "var(--crm-stage-prospect)" },
  { id: "contacted", label: "Contacted", colour: "var(--crm-stage-contacted)" },
  { id: "conversation", label: "Conversation", colour: "var(--crm-stage-conversation)" },
  { id: "proposal", label: "Proposal", colour: "var(--crm-stage-proposal)" },
  { id: "negotiation", label: "Negotiation", colour: "var(--crm-stage-negotiation)" },
  { id: "won", label: "Won", colour: "var(--crm-stage-won)" },
  { id: "onboarding", label: "Onboarding", colour: "var(--crm-stage-onboarding)" },
  { id: "active", label: "Active", colour: "var(--crm-stage-active)" },
  { id: "renewal", label: "Renewal", colour: "var(--crm-stage-renewal)" },
];

/**
 * The operator pipeline.
 *
 * TWO FIGURES THIS SCREEN REFUSES TO INVENT.
 *
 * An unvalued deal is not a zero-value deal, so the column total sums only the
 * deals somebody actually put a number on and says how many it skipped.
 *
 * Weighted pipeline needs a probability, and this system does not derive one
 * from the stage. "Negotiation means 60%" is a number nobody chose being
 * reported as though somebody had — and weighted pipeline is exactly the figure
 * a founder quotes to an investor. Where a probability was set by a person it is
 * used; where it was not, the deal is excluded and the exclusion is stated.
 *
 * The weighted total is drawn as a `Stat`, which is what makes the refusal
 * survive the restyle: with no deal carrying both halves the tile drops out of
 * butter to plain surface and prints the reason, so an absence can never be read
 * across a room as a reported figure.
 */
export default function Sales() {
  const [result, setResult] = useState<Result<Deal[]>>(loading);
  useEffect(() => {
    void listDeals().then(setResult);
  }, []);

  return (
    <>
      <PageHead
        title="Sales Pipeline"
        subtitle="Prospect through to renewal. A renewal date raises an internal task — it never changes a marketplace position on its own."
      />
      <Resolve
        result={result}
        what="deals"
        isEmpty={(v) => v.length === 0}
        empty="No opportunities are open. Sales creates the first from a company's page."
      >
        {(deals) => {
          const weighted = deals.filter((d) => d.probability_pct !== null && d.estimated_value_cents !== null);
          const weightedTotal = weighted.reduce(
            (n, d) => n + Math.round((d.estimated_value_cents! * d.probability_pct!) / 100), 0);
          const unweighted = deals.length - weighted.length;

          return (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Stat
                  tone="butter"
                  label="Weighted pipeline"
                  value={weighted.length === 0 ? null : formatCentsShort(weightedTotal)}
                  reason="No deal carries both a value and a probability somebody set. ICEFALL does not infer a probability from the stage — a weighted figure built on assumed odds is the number most likely to be repeated outside this room."
                  hint={
                    unweighted > 0
                      ? `Excludes ${unweighted} deal${unweighted === 1 ? "" : "s"} with no value or no probability set.`
                      : undefined
                  }
                />
              </div>

              <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
                {STAGES.map((s) => {
                  const inStage = deals.filter((d) => d.stage === s.id);
                  return (
                    <div key={s.id} className="w-[252px] shrink-0">
                      <Card tone="panel" pad={false} className="flex h-full flex-col p-3">
                        <div className="mb-3 flex items-center gap-2.5 px-1.5 pt-1">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: s.colour }}
                          />
                          <p className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{s.label}</p>
                          <span className="ml-auto">
                            <CountBubble>{inStage.length}</CountBubble>
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {inStage.map((d) => (
                            <div key={d.id} className="rounded-tile bg-surface p-3.5 shadow-soft">
                              <div className="flex items-start gap-2.5">
                                <Avatar name={d.title} size={34} />
                                <p className="min-w-0 text-[13px] font-medium leading-snug text-ink">
                                  {d.title}
                                </p>
                              </div>
                              {/*
                                A deal nobody has valued prints the words rather
                                than a figure. It is set in the small muted face
                                on purpose: an unvalued deal must not be able to
                                be scanned as though it were a small one.
                              */}
                              <p className="tnum mt-3 text-[19px] font-bold leading-none tracking-[-0.02em] text-ink">
                                {d.estimated_value_cents === null ? (
                                  <span className="text-[12px] font-normal tracking-normal text-faint">
                                    Value not estimated
                                  </span>
                                ) : (
                                  formatCentsShort(d.estimated_value_cents, d.currency)
                                )}
                              </p>
                              {d.expected_close_on && (
                                <p className="mt-2 text-[11.5px] text-faint">
                                  Expected {formatDay(d.expected_close_on)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </>
          );
        }}
      </Resolve>
    </>
  );
}
