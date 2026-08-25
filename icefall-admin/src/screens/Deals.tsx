import { useMemo, useState } from "react";
import { CalendarDays, GripVertical, Plus } from "lucide-react";
import { Avatar, Button, DemoBanner, PageHead } from "@/components/ui";
import {
  DEALS,
  DEMO_NOTICE,
  STAGES,
  type Deal,
  type StageId,
  contactById,
  eur,
  eurFull,
  fmtShort,
  orgById,
} from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * The pipeline board.
 *
 * Deals are held in component state so a stage can actually be dragged — the
 * move is real and immediate, it just has nowhere to persist to yet. Reloading
 * puts everything back, which is the honest behaviour for a build with no
 * database: better a change that visibly resets than one that appears to save
 * and silently does not.
 */
export default function Deals() {
  const [deals, setDeals] = useState<Deal[]>(DEALS);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<StageId | null>(null);

  const byStage = useMemo(() => {
    const m = new Map<StageId, Deal[]>();
    for (const s of STAGES) m.set(s.id, []);
    for (const d of deals) m.get(d.stage)?.push(d);
    return m;
  }, [deals]);

  const total = deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce((a, d) => a + d.valueEur, 0);

  function drop(stage: StageId) {
    if (!dragging) return;
    setDeals((prev) => prev.map((d) => (d.id === dragging ? { ...d, stage } : d)));
    setDragging(null);
    setOver(null);
  }

  return (
    <>
      <PageHead
        title="Deals"
        subtitle={`${deals.length} expeditions in the pipeline · ${eurFull(total)} open value`}
        actions={
          <>
            <Button variant="secondary" size="sm">
              Filter
            </Button>
            <Button size="sm">
              <Plus size={15} strokeWidth={2} />
              New deal
            </Button>
          </>
        }
      />

      <DemoBanner>
        {DEMO_NOTICE} Dragging a card between stages works, but there is nowhere to save it — reload
        and the board returns to its starting state.
      </DemoBanner>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
        {STAGES.map((stage) => {
          const list = byStage.get(stage.id) ?? [];
          const value = list.reduce((a, d) => a + d.valueEur, 0);
          const isOver = over === stage.id;

          return (
            <section
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage.id);
              }}
              onDragLeave={() => setOver((s) => (s === stage.id ? null : s))}
              onDrop={() => drop(stage.id)}
              className={cn(
                "flex w-[266px] shrink-0 flex-col rounded-card border bg-canvas/60 transition-colors",
                isOver ? "border-accent bg-accent-soft/40" : "border-line",
              )}
            >
              <header className="rounded-t-card border-b border-line bg-surface px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.colour }} />
                  <h2 className="text-[12.5px] font-medium text-ink">{stage.label}</h2>
                  <span className="tnum ml-auto text-[11.5px] text-faint">{list.length}</span>
                </div>
                <p className="tnum mt-1.5 text-[12px] text-muted">{eurFull(value)}</p>
              </header>

              <div className="flex-1 space-y-2 p-2">
                {list.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    dragging={dragging === d.id}
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}

                {list.length === 0 && (
                  <p className="px-2 py-6 text-center text-[12px] text-faint">
                    {isOver ? "Drop here" : "Nothing at this stage"}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function DealCard({
  deal,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  deal: Deal;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const contact = contactById(deal.contactId);
  const org = orgById(deal.orgId);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group cursor-grab rounded-tile border border-line bg-surface p-3 transition-shadow active:cursor-grabbing",
        dragging ? "opacity-40" : "hover:border-faint/50",
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical
          size={14}
          strokeWidth={1.6}
          className="mt-[2px] shrink-0 text-line opacity-0 transition-opacity group-hover:opacity-100"
        />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{deal.title}</p>
      </div>

      <p className="tnum mt-2.5 text-[15px] font-light text-ink">{eur(deal.valueEur)}</p>

      <div className="mt-2.5 flex items-center gap-2 border-t border-line-soft pt-2.5">
        <Avatar name={contact?.name ?? "?"} size={22} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{contact?.name}</span>
        <span
          title={`Owner: ${deal.owner}`}
          className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-medium text-accent-ink"
        >
          {deal.owner}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        <CalendarDays size={12} strokeWidth={1.7} />
        <span className="tnum">{fmtShort(deal.departs)}</span>
        <span className="mx-0.5">·</span>
        <span className="truncate">{org?.name}</span>
      </div>
    </article>
  );
}
