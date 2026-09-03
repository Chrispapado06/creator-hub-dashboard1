import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Resolve } from "@/components/states";
import { createDeal, listCompanies, listDeals, moveDeal } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, Deal, DealStage } from "@/data/types";
import { cn } from "@/lib/utils";
import { Select } from "@/components/controls";

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
 *     cards show what is computable from the rows in front of you. This is also
 *     why the tiles below carry NO delta Badge, which is the theme's signature
 *     element on a stat tile: there is no prior period to compare against, and
 *     a black "+12.5%" pill nobody measured is the exact failure this codebase
 *     exists to avoid.
 *   - A DEAL WITHOUT A VALUE is "no value set", not €0 — and it is excluded
 *     from every sum rather than silently counted as zero.
 */

/**
 * THE PAGE HEADER, INLINE AND NOT `PageHead` — see the note in Finance.tsx.
 * The theme draws page titles at `text-3xl tracking-tight` (30px / 400);
 * `PageHead` draws 31px extrabold and accepts no className.
 */
function Head({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">{title}</h1>
        {subtitle && <p className="max-w-3xl text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * THE TEN STAGE DOTS ARE DELIBERATELY STILL IN COLOUR.
 *
 * index.css holds `--crm-stage-*` back from the neutral rebind, and says why:
 * they encode a ten-value enum, the theme's chart ramp has five greys, and ten
 * identical grey dots would remove the only way to read a pipeline board at a
 * glance. That is a capability loss, which outranks the visual match. The
 * fallbacks below are the ones this file has always carried; nothing here
 * assembles a class name, because Tailwind scans source text and `bg-${stage}`
 * would generate no CSS at all.
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
  // The odd one out, fixed: nine stages read `--crm-stage-*` with a fallback,
  // this one had the colour typed straight in and so ignored its own token —
  // `--crm-stage-lost` is a red, and the board was painting Lost grey-blue.
  { id: "lost", label: "Lost", dot: "bg-[var(--crm-stage-lost,oklch(0.64_0.16_25))]" },
];

const OPEN: DealStage[] = ["prospect", "contacted", "conversation", "proposal", "negotiation"];
const WONISH: DealStage[] = ["won", "onboarding", "active", "renewal"];

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

/**
 * The theme's KPI tile (dashboard/crm/_components/kpi-cards.tsx): label as
 * CardDescription, a 30px figure with `leading-none tracking-tight`, and a
 * 14px caption. No delta pill — see the header for why this screen has none.
 */
function Kpi({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl leading-none tracking-tight tabular-nums">{value}</div>
        <p className="text-muted-foreground text-sm">{caption}</p>
      </CardContent>
    </Card>
  );
}

/**
 * A refusal from the database, shown verbatim and left on screen.
 *
 * Not a toast: the theme's habit is to fade a failure away after four seconds,
 * and a write the database refused is exactly the thing the person needs to
 * still be able to read when they look back at the screen. Styled as the
 * theme's destructive surface (`border-destructive/20 bg-destructive/10
 * text-destructive`, the same tone its own destructive Badge uses).
 */
function Refusal({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-destructive text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </div>
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
    <div className="flex flex-col gap-4 md:gap-6">
      <Head
        title="Sales Pipeline"
        subtitle="Track and manage expedition companies from first contact to active partnership."
        actions={
          <Button onClick={() => setAdding((a) => !a)}>
            <Plus data-icon="inline-start" /> Add deal
          </Button>
        }
      />

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">New deal</CardTitle>
            <CardDescription>
              It is created in Prospect. Value is optional — a deal nobody has priced is not a €0 deal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="deal-company">Company *</Label>
                <Select
                  value={form.company_id}
                  onChange={(v: string) => setForm((f) => ({ ...f, company_id: v }))}
                  ariaLabel="Company for this deal"
                  placeholder="Choose…"
                  className="w-full"
                  options={
                    companies.state === "ok" ? companies.value.map((c) => ({ value: c.id, label: c.name })) : []
                  }
                />
                {companies.state === "ok" && companies.value.length === 0 && (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    No companies exist yet — create one on the Companies page first; a deal is a
                    conversation with somebody.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-title">What the deal is *</Label>
                <Input
                  id="deal-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Everest Slot 1, 2027 season"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-value">Estimated value (EUR, optional)</Label>
                <Input
                  id="deal-value"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value.replace(/[^\d]/g, "") }))}
                  inputMode="numeric"
                  placeholder="Leave empty if not discussed"
                  className="tabular-nums"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
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
          </CardFooter>
        </Card>
      )}

      {/* A refusal that arrives while the board is empty has no card to snap
          back, so it is shown here on its own. */}
      {moveError && deals.state === "ok" && deals.value.length === 0 && <Refusal>{moveError}</Refusal>}

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
            <div className="flex flex-col gap-4 md:gap-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
                {/* An em dash here means NOT MEASURED — no deal has closed, so
                    there is no rate. It is not a zero and must never become one. */}
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
                  caption={
                    valued.length > 0
                      ? `Across ${valued.length} valued deal${valued.length === 1 ? "" : "s"}`
                      : "No deal carries a value yet"
                  }
                />
              </div>

              {moveError && <Refusal>The move was refused and the card snapped back: {moveError}</Refusal>}

              {lostPrompt && (
                <Card>
                  <CardHeader>
                    <CardTitle className="leading-none">
                      Why was it lost? The database refuses a lost deal without a reason.
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        autoFocus
                        value={lostPrompt.reason}
                        onChange={(e) => setLostPrompt({ ...lostPrompt, reason: e.target.value })}
                        placeholder="e.g. Renewed directly with their existing channel"
                        className="min-w-0 flex-1"
                      />
                      <Button variant="ghost" onClick={() => setLostPrompt(null)}>
                        Cancel
                      </Button>
                      <Button
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
                  </CardContent>
                </Card>
              )}

              {/* THE BOARD. Column and card chrome copied from the theme's own
                  kanban (dashboard/kanban/_components): a column is
                  `rounded-xl border bg-muted/50` with a `px-4 pt-4 pb-3` head,
                  a `font-medium text-base leading-none` title and a
                  `text-muted-foreground text-sm tabular-nums` count; a card is
                  `rounded-xl border bg-card p-4 shadow-xs`. The drop target
                  goes to the theme's `bg-muted/70`, and the ring is kept on top
                  of it because dragging across ten columns needs a stronger
                  signal than one step of grey. */}
              <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[2400px] grid-cols-10 gap-4">
                  {stagesWithDeals.map((stage) => {
                    const valuedHere = stage.deals.filter((d) => d.estimated_value_cents !== null);
                    const sum = valuedHere.reduce((s, d) => s + d.estimated_value_cents!, 0);
                    const isTarget = overCol === stage.id && dragging !== null;
                    return (
                      <section
                        key={stage.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOverCol(stage.id);
                        }}
                        onDragLeave={() => setOverCol((c) => (c === stage.id ? null : c))}
                        onDrop={() => onDropInto(stage.id)}
                        className={cn(
                          "flex flex-col rounded-xl border bg-ui-muted/50 transition-colors",
                          isTarget && "bg-ui-muted/70 ring-2 ring-ring",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
                          <div className="min-w-0 space-y-1">
                            <h2 className="flex items-center gap-2 truncate font-medium text-base leading-none">
                              <span className={cn("size-2 shrink-0 rounded-full", stage.dot)} aria-hidden />
                              {stage.label}
                            </h2>
                            <p className="text-muted-foreground text-sm tabular-nums leading-none">
                              {stage.deals.length} deal{stage.deals.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          {/* Printed only when at least one deal here has a
                              value somebody set. A column of unpriced deals
                              shows no total rather than €0. */}
                          {valuedHere.length > 0 && (
                            <span className="shrink-0 font-medium text-sm tabular-nums">{eur(sum)}</span>
                          )}
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3">
                          {stage.deals.map((deal) => (
                            <article
                              key={deal.id}
                              draggable
                              onDragStart={() => setDragging(deal.id)}
                              onDragEnd={() => {
                                setDragging(null);
                                setOverCol(null);
                              }}
                              className={cn(
                                "flex cursor-grab flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs active:cursor-grabbing",
                                dragging === deal.id && "opacity-30",
                              )}
                            >
                              <div className="min-w-0 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="min-w-0 font-medium text-sm leading-snug">
                                    {nameOf(deal.company_id)}
                                  </h3>
                                  {deal.stage === "won" && (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    >
                                      Won
                                    </Badge>
                                  )}
                                  {deal.stage === "lost" && (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 border-destructive/20 bg-destructive/10 text-destructive"
                                    >
                                      Lost
                                    </Badge>
                                  )}
                                </div>
                                <p className="line-clamp-2 text-muted-foreground text-sm leading-5">
                                  {deal.title}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                {/* NOT €0. A deal nobody has priced is a deal
                                    nobody has priced, and it is excluded from
                                    every sum above rather than counted as zero. */}
                                {deal.estimated_value_cents !== null ? (
                                  <span className="font-medium text-sm tabular-nums">
                                    {eur(deal.estimated_value_cents)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-sm">No value set</span>
                                )}
                                {/* Only when a person set it. Never derived from the stage. */}
                                {deal.probability_pct !== null && (
                                  <span className="text-muted-foreground text-sm tabular-nums">
                                    {deal.probability_pct}%
                                  </span>
                                )}
                              </div>
                              {deal.lost_reason && (
                                <p className="text-muted-foreground text-sm leading-snug">{deal.lost_reason}</p>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardDescription>Weighted Pipeline Value</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-3xl leading-none tracking-tight tabular-nums">
                      {weightable.length > 0 ? eur(weighted) : "—"}
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {weightable.length > 0
                        ? `From ${weightable.length} open deal${weightable.length === 1 ? "" : "s"} with a value and a probability someone set` +
                          (unweightable > 0 ? `; ${unweightable} excluded for lacking one` : "")
                        : "No open deal carries both a value and a probability — probabilities are set by people, never assumed from the stage"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Forecast (This Month)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {/* The em dash is NOT MEASURED, and it stays one. */}
                    <div className="text-3xl leading-none tracking-tight tabular-nums">—</div>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Needs expected-close dates and a probability on each deal; it appears once deals carry
                      them.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        }}
      </Resolve>
    </div>
  );
}
