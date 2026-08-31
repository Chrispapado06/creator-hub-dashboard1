import { ArrowUpRight, CircleDollarSign, Flame, Gauge, Handshake, Target } from "lucide-react";
import { Card, Label, PageHead, Pill } from "@/components/ui";
import {
  ACTIVITIES, DEALS, NOW, REVENUE_BY_MONTH, STAGES, companyById, daysSinceActivity,
  fmtEur, isRotting,
} from "@/data/demo";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const open = DEALS.filter((d) => d.status === "open");
  const won = DEALS.filter((d) => d.status === "won");
  const pipeline = open.reduce((a, d) => a + d.value, 0);
  const weighted = open.reduce((a, d) => a + (d.value * (STAGES.find((s) => s.id === d.stageId)?.probability ?? 0)) / 100, 0);
  const wonValue = won.reduce((a, d) => a + d.value, 0);
  const conversion = Math.round((won.length / (won.length + open.length)) * 100);
  const avg = won.length ? Math.round(wonValue / won.length) : 0;

  const rotting = open.filter(isRotting);
  const overdue = ACTIVITIES.filter((a) => a.status === "planned" && new Date(a.dueAt) < NOW);

  return (
    <>
      <PageHead title="Dashboard" subtitle="Everything moving through your pipeline right now." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={CircleDollarSign} label="Open pipeline" value={fmtEur(pipeline, { compact: true })} foot={`${open.length} deals`} />
        <Kpi icon={Gauge} label="Weighted" value={fmtEur(Math.round(weighted), { compact: true })} foot="by stage probability" />
        <Kpi icon={Handshake} label="Won this period" value={fmtEur(wonValue, { compact: true })} foot={`${won.length} deals`} up />
        <Kpi icon={Target} label="Win rate" value={`${conversion}%`} foot={`avg ${fmtEur(avg, { compact: true })}`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <div><Label>Won revenue</Label><p className="mt-1 text-[12.5px] text-muted">By month.</p></div>
            <p className="tnum text-[12.5px] text-faint">{fmtEur(REVENUE_BY_MONTH.reduce((a, m) => a + m.cents, 0), { compact: true })} total</p>
          </div>
          <RevenueChart />
        </Card>

        <Card>
          <Label>Pipeline by stage</Label>
          <div className="mt-4 space-y-3">
            {STAGES.filter((s) => s.id !== "s5").map((s) => {
              const inStage = open.filter((d) => d.stageId === s.id);
              const v = inStage.reduce((a, d) => a + d.value, 0);
              const pct = pipeline ? (v / pipeline) * 100 : 0;
              return (
                <div key={s.id}>
                  <div className="flex items-baseline justify-between text-[12.5px]">
                    <span className="flex items-center gap-2 text-ink"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                    <span className="tnum text-muted">{inStage.length} · {fmtEur(v, { compact: true })}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-raised">
                    <div className="h-full rounded-pill" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <Label>Needs attention</Label>
          <span className="tnum text-[12px] text-faint">{rotting.length + overdue.length} items</span>
        </div>
        <ul className="divide-y divide-line-soft">
          {rotting.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Flame size={15} strokeWidth={2} className="shrink-0 text-[oklch(0.62_0.16_45)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{d.title}</p>
                <p className="text-[11.5px] text-faint">{companyById(d.companyId)?.name}</p>
              </div>
              <Pill tone="amber">{daysSinceActivity(d)}d idle</Pill>
              <span className="tnum text-[12.5px] text-muted">{fmtEur(d.value, { compact: true })}</span>
            </li>
          ))}
          {overdue.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-[15px] w-[15px] place-items-center rounded-full bg-[oklch(0.958_0.03_25)] text-[oklch(0.5_0.16_25)]">!</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] text-ink">{a.title}</p><p className="text-[11.5px] text-faint capitalize">{a.type}</p></div>
              <Pill tone="red">overdue</Pill>
            </li>
          ))}
          {rotting.length + overdue.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-faint">All clear.</li>}
        </ul>
      </Card>
    </>
  );
}

function Kpi({ icon: Icon, label, value, foot, up }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; label: string; value: string; foot: string; up?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <Label>{label}</Label>
        <Icon size={16} strokeWidth={1.8} className="text-faint" />
      </div>
      <p className="tnum mt-3 text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
      <p className={cn("mt-2 flex items-center gap-1 text-[12px]", up ? "text-[oklch(0.5_0.12_155)]" : "text-faint")}>
        {up && <ArrowUpRight size={13} strokeWidth={2} />}{foot}
      </p>
    </Card>
  );
}

function RevenueChart() {
  const data = REVENUE_BY_MONTH;
  const max = Math.max(...data.map((d) => d.cents)) * 1.15;
  const W = 640, H = 190, pad = { l: 46, r: 8, t: 8, b: 26 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, bw = (iw / data.length) * 0.5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Won revenue by month">
      {[0, 0.5, 1].map((t) => {
        const y = pad.t + ih - t * ih;
        return (
          <g key={t}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--c-line-soft)" />
            <text x={pad.l - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--c-faint)">{t === 0 ? "0" : `${Math.round((max * t) / 100000)}k`}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pad.l + (iw / data.length) * (i + 0.5) - bw / 2;
        const h = (d.cents / max) * ih;
        return (
          <g key={d.month}>
            <rect x={x} y={pad.t + ih - h} width={bw} height={h} rx="3" fill="var(--c-accent)" opacity={i === data.length - 1 ? 1 : 0.4} />
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10.5" fill={i === data.length - 1 ? "var(--c-ink)" : "var(--c-faint)"}>{d.month}</text>
          </g>
        );
      })}
    </svg>
  );
}
