import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, PageHead, Pill } from "@/components/ui";
import { Resolve } from "@/components/states";
import { createDeal, listCompanies, listDeals, moveDeal } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, Deal, DealStage } from "@/data/types";
import { cn } from "@/lib/utils";

/**
 * Sales Pipeline — the mockup's board on the REAL query layer.
 *
 * This page rendered an invented seven-stage board for a few hours on 30 Aug
 * 2026. It now reads `listDeals()` like its 21 sibling screens, which today
 * means an EMPTY BOARD — the live database holds no deals — and that empty
 * board with a sentence saying so is the correct output, not a failure state.
 * A pipeline of invented negotiations reads as a real quarter.
 *
 * WHAT THIS SCREEN REFUSES TO INVENT, and where the mockup had to give way:
 *
 *   - PER-STAGE PROBABILITIES. `probability_pct` is per-deal, set by a person,
 *     and never derived from the stage (the type says so). So there is no "70%
 *     probability" printed under a column — the weighted value sums only deals
 *     where somebody actually set a probability, and says how many it skipped.
 *   - "vs last 30 days" DELTAS. They need history nothing records. The KPI
 *     cards show what is computable from the rows in front of you.
 *   - A DEAL WITHOUT A VALUE is "no value set", not €0 — and it is excluded
 *     from every sum rather than silently counted as zero.
 */

const STAGES: { id: DealStage; label: string; dot: string }[] = [
  { id: "prospect", label: "Prospect", dot: "bg-[var(--crm-stage-prospect,oklch(0.585_0.17_275))]" },
  { id: "contacted", label: "Contacted", dot: "bg-[var(--crm-stage-contacted,oklch(0.62_0.15_245))]" },
  { id: "conversation", label: "Conversation", dot: "bg-[var(--crm-stage-conversation,oklch(0.7_0.13_200))]" },
  { id: "proposal", label: "Proposal", dot: "bg-[var(--crm-stage-proposal,oklch(0.6_0.17_305))]" },
  { id: "negotiation", label: "Negotiation", dot: "bg-[var(--crm-stage-negotiation,oklch(0.71_0.16_55))]" },
  { id: "won", label: "Won", dot: "bg-[var(--crm-stage-won,oklch(0.64_0.15_150))]" },
  { id: "onboarding", label: "Onboarding", dot: "bg-[var(--crm-stage-onboarding,oklch(0.68_0.12_170))]" },
  { id: "active", label: "Active", dot: "bg-[var(--crm-stage-active,oklch(0.6_0.14_150))]" },
  { id: "renewal", label: "Renewal", dot: "bg-[var(--crm-stage-renewal,oklch(0.65_0.12_255))]" },
  { id: "lost", label: "Lost", dot: "bg-[oklch(0.65_0.015_260)]" },
];

const OPEN: DealStage[] = ["prospect", "contacted", "conversation", "proposal", "negotiation"];
const WONISH: DealStage[] = ["won", "onboarding", "active", "renewal"];

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

function Kpi({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <Card>
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className="tnum mt-1.5 text-[26px] font-extrabold leading-tight text-ink">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-faint">{caption}</p>
    </Card>
  );
}

export default function Sales() {
  const [deals, setDeals] = useState<Result<Deal[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  /**
   * CR-05: drag a card between columns. Optimistic — the card lands where it
   * was dropped and the write follows; a refused write snaps it back with the
   * database's reason on screen. Dropping into Lost pauses for the reason the
   * CHECK constraint demands before anything is written.
   */
  const [overrides, setOverrides] = useState<Record<string, DealStage>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<DealStage | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ id: string; reason: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ company_id: "", title: "", value: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void listDeals().then(setDeals);
    void listCompanies().then(setCompanies);
  }, []);
  useEffect(load, [load]);

  const commitMove = async (id: string, stage: DealStage, lostReason?: string) => {
    setOverrides((o) => ({ ...o, [id]: stage }));
    setMoveError(null);
    const r = await moveDeal(id, stage, lostReason);
    if (r.state !== "ok") {
      setOverrides((o) => {
        const { [id]: _dropped, ...rest } = o;
        return rest;
      });
      setMoveError(r.state === "error" ? r.reason : "No database is configured.");
    } else {
      load();
    }
  };

  const onDropInto = (stage: DealStage) => {
    setOverCol(null);
    if (!dragging) return;
    const id = dragging;
    setDragging(null);
    if (stage === "lost") setLostPrompt({ id, reason: "" });
    else void commitMove(id, stage);
  };

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (companies.state === "ok") for (const c of companies.value) m.set(c.id, c.name);
    return (id: string) => m.get(id) ?? "Unknown company";
  }, [companies]);

  return (
    <>
      <PageHead
        title="Sales Pipeline"
        subtitle="Track and manage expedition companies from first contact to active partnership."
        actions={
          <Button className="!bg-accent text-white hover:opacity-90" onClick={() => setAdding((a) => !a)}>
            <Plus size={15} strokeWidth={2.25} /> Add deal
          </Button>
        }
      />

      {adding && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Company *</span>
              <select
                value={form.company_id}
                onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
                className="h-9 w-full rounded-tile border border-line bg-surface px-2.5 text-[13px] text-ink outline-none"
              >
                <option value="">Choose…</option>
                {companies.state === "ok" &&
                  companies.value.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
              {companies.state === "ok" && companies.value.length === 0 && (
                <span className="mt-1 block text-[11.5px] text-faint">
                  No companies exist yet — create one on the Companies page first; a deal is a
                  conversation with somebody.
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">What the deal is *</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Everest Slot 1, 2027 season"
                className="h-9 w-full rounded-tile border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Estimated value (EUR, optional)</span>
              <input
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value.replace(/[^\d]/g, "") }))}
                inputMode="numeric"
                placeholder="Leave empty if not discussed"
                className="tnum h-9 w-full rounded-tile border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              className="!bg-accent text-white hover:opacity-90"
              disabled={busy || !form.company_id || form.title.trim().length === 0}
              onClick={() => {
                setBusy(true);
                void createDeal({
                  company_id: form.company_id,
                  title: form.title,
                  estimated_value_cents: form.value ? Number(form.value) * 100 : null,
                }).then((r) => {
                  setBusy(false);
                  if (r.state === "ok") {
                    setForm({ company_id: "", title: "", value: "" });
                    setAdding(false);
                    load();
                  } else setMoveError(r.state === "error" ? r.reason : "No database is configured.");
                });
              }}
            >
              Create in Prospect
            </Button>
          </div>
        </Card>
      )}

      {moveError && deals.state === "ok" && deals.value.length === 0 && (
        <p className="mb-3 rounded-tile bg-[oklch(0.955_0.03_25)] px-3.5 py-2.5 text-[12.5px] text-bad">{moveError}</p>
      )}

      <Resolve
        result={deals}
        what="the pipeline"
        empty="No deals yet. The pipeline fills as sales conversations are recorded — nothing has been."
        isEmpty={(rows) => rows.length === 0}
      >
        {(raw) => {
          // The optimistic layer: a dragged card computes as being where it was
          // dropped, KPIs included, until the write settles or snaps back.
          const rows = raw.map((d) => (overrides[d.id] ? { ...d, stage: overrides[d.id] } : d));
          const valued = rows.filter((d) => d.estimated_value_cents !== null);
          const unvalued = rows.length - valued.length;
          const open = rows.filter((d) => OPEN.includes(d.stage));
          const openValue = open.reduce((s, d) => s + (d.estimated_value_cents ?? 0), 0);
          const won = rows.filter((d) => WONISH.includes(d.stage)).length;
          const lost = rows.filter((d) => d.stage === "lost").length;
          const closed = won + lost;

          // Weighted value: only deals where a PERSON set both a value and a
          // probability. Nothing is derived from the stage.
          const weightable = open.filter(
            (d) => d.estimated_value_cents !== null && d.probability_pct !== null,
          );
          const weighted = weightable.reduce(
            (s, d) => s + Math.round((d.estimated_value_cents! * d.probability_pct!) / 100),
            0,
          );
          const unweightable = open.length - weightable.length;

          const stagesWithDeals = STAGES.map((s) => ({
            ...s,
            deals: rows.filter((d) => d.stage === s.id),
          }));

          return (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Kpi label="Total Deals" value={String(rows.length)} caption="Across every stage" />
                <Kpi
                  label="Open Pipeline Value"
                  value={eur(openValue)}
                  caption={
                    unvalued > 0
                      ? `${unvalued} deal${unvalued === 1 ? "" : "s"} carry no value and are not counted`
                      : "Every open deal carries a value"
                  }
                />
                <Kpi label="Won Deals" value={String(won)} caption="Won, onboarding, active or renewing" />
                <Kpi
                  label="Conversion Rate"
                  value={closed > 0 ? `${Math.round((won / closed) * 100)}%` : "—"}
                  caption={closed > 0 ? `Of ${closed} closed deal${closed === 1 ? "" : "s"}` : "No deal has closed yet"}
                />
                <Kpi
                  label="Avg. Deal Value"
                  value={
                    valued.length > 0
                      ? eur(Math.round(valued.reduce((s, d) => s + d.estimated_value_cents!, 0) / valued.length))
                      : "—"
                  }
                  caption={valued.length > 0 ? `Across ${valued.length} valued deal${valued.length === 1 ? "" : "s"}` : "No deal carries a value yet"}
                />
              </div>

              {moveError && (
                <p className="mb-3 rounded-tile bg-[oklch(0.955_0.03_25)] px-3.5 py-2.5 text-[12.5px] text-bad">
                  The move was refused and the card snapped back: {moveError}
                </p>
              )}
              {lostPrompt && (
                <Card className="mb-3">
                  <p className="text-[13px] font-semibold text-ink">
                    Why was it lost? The database refuses a lost deal without a reason.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      autoFocus
                      value={lostPrompt.reason}
                      onChange={(e) => setLostPrompt({ ...lostPrompt, reason: e.target.value })}
                      placeholder="e.g. Renewed directly with their existing channel"
                      className="h-9 min-w-0 flex-1 rounded-tile border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
                    />
                    <Button variant="ghost" onClick={() => setLostPrompt(null)}>
                      Cancel
                    </Button>
                    <Button
                      className="!bg-accent text-white hover:opacity-90"
                      disabled={lostPrompt.reason.trim().length === 0}
                      onClick={() => {
                        const { id, reason } = lostPrompt;
                        setLostPrompt(null);
                        void commitMove(id, "lost", reason);
                      }}
                    >
                      Mark lost
                    </Button>
                  </div>
                </Card>
              )}
              <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[2000px] grid-cols-10 gap-3">
                  {stagesWithDeals.map((stage) => {
                    const valuedHere = stage.deals.filter((d) => d.estimated_value_cents !== null);
                    const sum = valuedHere.reduce((s, d) => s + d.estimated_value_cents!, 0);
                    return (
                      <div
                        key={stage.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOverCol(stage.id);
                        }}
                        onDragLeave={() => setOverCol((c) => (c === stage.id ? null : c))}
                        onDrop={() => onDropInto(stage.id)}
                        className={cn(
                          "rounded-card bg-panel p-2.5 transition-shadow",
                          overCol === stage.id && dragging && "ring-2 ring-accent",
                        )}
                      >
                        <div className="px-1.5 pb-2 pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
                              <span className={cn("h-2 w-2 rounded-full", stage.dot)} aria-hidden />
                              {stage.label}
                            </p>
                            {valuedHere.length > 0 && (
                              <span className="tnum text-[12px] font-semibold text-muted">{eur(sum)}</span>
                            )}
                          </div>
                          <p className="mt-0.5 pl-4 text-[11.5px] text-faint">
                            {stage.deals.length} deal{stage.deals.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {stage.deals.map((deal) => (
                            <div
                              key={deal.id}
                              draggable
                              onDragStart={() => setDragging(deal.id)}
                              onDragEnd={() => {
                                setDragging(null);
                                setOverCol(null);
                              }}
                              className={cn(
                                "cursor-grab rounded-tile bg-surface p-3 shadow-soft active:cursor-grabbing",
                                dragging === deal.id && "opacity-50",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[13px] font-semibold leading-snug text-ink">
                                  {nameOf(deal.company_id)}
                                </p>
                                {deal.stage === "won" && <Pill tone="green">Won</Pill>}
                                {deal.stage === "lost" && <Pill tone="red">Lost</Pill>}
                              </div>
                              <p className="mt-1 text-[12px] text-muted">{deal.title}</p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="tnum text-[12px] font-semibold text-ink">
                                  {deal.estimated_value_cents !== null ? (
                                    eur(deal.estimated_value_cents)
                                  ) : (
                                    <span className="font-normal text-faint">No value set</span>
                                  )}
                                </span>
                                {deal.probability_pct !== null && (
                                  <span className="text-[11.5px] text-faint">{deal.probability_pct}%</span>
                                )}
                              </div>
                              {deal.lost_reason && (
                                <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{deal.lost_reason}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Card className="mt-4">
                <div className="grid grid-cols-2 items-center gap-4">
                  <div>
                    <p className="text-[12.5px] font-medium text-muted">Weighted Pipeline Value</p>
                    <p className="tnum mt-1.5 text-[22px] font-extrabold text-ink">
                      {weightable.length > 0 ? eur(weighted) : "—"}
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
                      {weightable.length > 0
                        ? `From ${weightable.length} open deal${weightable.length === 1 ? "" : "s"} with a value and a probability someone set` +
                          (unweightable > 0 ? `; ${unweightable} excluded for lacking one` : "")
                        : "No open deal carries both a value and a probability — probabilities are set by people, never assumed from the stage"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12.5px] font-medium text-muted">Forecast (This Month)</p>
                    <p className="tnum mt-1.5 text-[22px] font-extrabold text-ink">—</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
                      Needs expected-close dates and a probability on each deal; it appears once
                      deals carry them.
                    </p>
                  </div>
                </div>
              </Card>
            </>
          );
        }}
      </Resolve>
    </>
  );
}
