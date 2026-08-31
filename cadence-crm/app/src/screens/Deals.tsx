import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Flame, Plus } from "lucide-react";
import { Avatar, Button, PageHead, Pill } from "@/components/ui";
import {
  DEALS, STAGES, companyById, contactById, contactName, daysSinceActivity,
  fmtEur, isRotting, userById, type Deal,
} from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * The pipeline board — the central object (§5, §6).
 *
 * Drag a card between stages and it moves immediately (held in state; a real
 * build writes the stage change and a deal_stage_history row). Stale deals rot:
 * a card with no activity past the threshold gets a flame and an amber edge, so a
 * rep sees neglect at a glance (§7).
 */
export default function Deals() {
  const [deals, setDeals] = useState<Deal[]>(DEALS);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const m = new Map<string, Deal[]>();
    for (const s of STAGES) m.set(s.id, []);
    for (const d of deals) if (d.status === "open" || d.stageId === "s5") m.get(d.stageId)?.push(d);
    return m;
  }, [deals]);

  const open = deals.filter((d) => d.status === "open");
  const openValue = open.reduce((a, d) => a + d.value, 0);
  const weighted = open.reduce((a, d) => {
    const p = STAGES.find((s) => s.id === d.stageId)?.probability ?? 0;
    return a + (d.value * p) / 100;
  }, 0);

  function drop(stageId: string) {
    if (!dragging) return;
    setDeals((prev) => prev.map((d) => (d.id === dragging ? { ...d, stageId, status: stageId === "s5" ? "won" : "open" } : d)));
    setDragging(null);
    setOver(null);
  }

  return (
    <>
      <PageHead
        title="Deals"
        subtitle={`${open.length} open · ${fmtEur(openValue, { compact: true })} pipeline · ${fmtEur(Math.round(weighted), { compact: true })} weighted`}
        actions={<Button size="sm"><Plus size={15} strokeWidth={2} />New deal</Button>}
      />

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
        {STAGES.map((stage) => {
          const list = byStage.get(stage.id) ?? [];
          const value = list.reduce((a, d) => a + d.value, 0);
          const isOver = over === stage.id;
          return (
            <section
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setOver(stage.id); }}
              onDragLeave={() => setOver((s) => (s === stage.id ? null : s))}
              onDrop={() => drop(stage.id)}
              className={cn("flex w-[272px] shrink-0 flex-col rounded-card border bg-canvas/60 transition-colors",
                isOver ? "border-accent bg-accent-soft/40" : "border-line")}
            >
              <header className="rounded-t-card border-b border-line bg-surface px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                  <h2 className="text-[12.5px] font-semibold text-ink">{stage.name}</h2>
                  <span className="tnum ml-auto rounded-pill bg-raised px-1.5 text-[11px] text-muted ring-1 ring-line">{list.length}</span>
                </div>
                <p className="tnum mt-1.5 flex items-baseline gap-2 text-[12px] text-muted">
                  {fmtEur(value, { compact: true })}
                  <span className="text-faint">· {stage.probability}%</span>
                </p>
              </header>

              <div className="flex-1 space-y-2 p-2">
                {list.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    dragging={dragging === d.id}
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                  />
                ))}
                {list.length === 0 && (
                  <p className="px-2 py-6 text-center text-[12px] text-faint">{isOver ? "Drop here" : "—"}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function DealCard({ deal, dragging, onDragStart, onDragEnd }: {
  deal: Deal; dragging: boolean; onDragStart: () => void; onDragEnd: () => void;
}) {
  const company = companyById(deal.companyId);
  const contact = contactById(deal.contactId);
  const owner = userById(deal.ownerId);
  const rotting = isRotting(deal);
  const stale = daysSinceActivity(deal);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group cursor-grab rounded-tile border bg-surface p-3 transition-shadow active:cursor-grabbing",
        dragging ? "opacity-40" : "hover:shadow-sm",
        rotting ? "border-l-[3px] border-l-[oklch(0.7_0.14_70)] border-y-line border-r-line" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-ink">{deal.title}</p>
        {rotting && <Flame size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-[oklch(0.62_0.16_45)]" />}
      </div>
      <p className="mt-1 truncate text-[11.5px] text-muted">{company?.name} · {contact && contactName(contact)}</p>

      <p className="tnum mt-2.5 text-[15px] font-semibold text-ink">{fmtEur(deal.value)}</p>

      <div className="mt-2.5 flex items-center gap-2 border-t border-line-soft pt-2.5">
        <span className="flex items-center gap-1.5 text-[11px] text-faint">
          <CalendarClock size={12} strokeWidth={1.8} />
          <span className="tnum">{new Date(deal.expectedClose).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        </span>
        {rotting ? (
          <Pill tone="amber" className="ml-auto"><AlertTriangle size={10} strokeWidth={2.2} />{stale}d idle</Pill>
        ) : (
          <span className="tnum ml-auto text-[11px] text-faint">{stale}d ago</span>
        )}
        {owner && <Avatar name={owner.name} size={20} />}
      </div>
    </article>
  );
}
