import { ArrowUpRight, CircleDollarSign, Handshake, MessageCircleWarning, Users2 } from "lucide-react";
import { Card, DemoBanner, PageHead, Pill, SectionLabel } from "@/components/ui";
import {
  CONVERSATIONS,
  CONTACTS,
  DEALS,
  DEMO_NOTICE,
  ORGANISATIONS,
  REVENUE_BY_MONTH,
  SIGNUPS_BY_WEEK,
  STAGES,
  contactById,
  eur,
  eurFull,
  fmtShort,
} from "@/data/demo";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const open = DEALS.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const booked = DEALS.filter((d) => d.stage === "won");
  const pipelineValue = open.reduce((a, d) => a + d.valueEur, 0);
  const bookedValue = booked.reduce((a, d) => a + d.valueEur, 0);
  const unreplied = CONVERSATIONS.filter((c) => c.unreplied).length;
  const athletes = CONTACTS.filter((c) => c.role === "athlete").length;

  const grossThis = REVENUE_BY_MONTH.at(-1)!.grossEur;
  const grossPrev = REVENUE_BY_MONTH.at(-2)!.grossEur;
  const delta = Math.round(((grossThis - grossPrev) / grossPrev) * 100);

  return (
    <>
      <PageHead title="Dashboard" subtitle="Everything moving through ICEFALL right now." />

      <DemoBanner>{DEMO_NOTICE}</DemoBanner>

      {/* ---- KPI strip ---------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={CircleDollarSign}
          label="Booking value this month"
          value={eurFull(grossThis)}
          foot={
            <span className={cn("inline-flex items-center gap-1", delta >= 0 ? "text-[oklch(0.5_0.12_152)]" : "text-[oklch(0.55_0.15_22)]")}>
              <ArrowUpRight size={13} strokeWidth={2} className={delta < 0 ? "rotate-90" : undefined} />
              {delta >= 0 ? "+" : ""}
              {delta}% on July
            </span>
          }
        />
        <Kpi icon={Handshake} label="Open pipeline" value={eurFull(pipelineValue)} foot={`${open.length} live deals`} />
        <Kpi icon={Users2} label="Athletes" value={String(athletes)} foot="on the platform" />
        <Kpi
          icon={MessageCircleWarning}
          label="Awaiting a reply"
          value={String(unreplied)}
          foot={unreplied ? "clients waiting on a partner" : "all answered"}
          alert={unreplied > 0}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---- Revenue ---------------------------------------------------- */}
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <SectionLabel>Booking value</SectionLabel>
              <p className="mt-1.5 text-[13px] text-muted">
                Total value of expeditions booked through ICEFALL, by month.
              </p>
            </div>
            <p className="tnum text-[13px] text-faint">
              {eurFull(REVENUE_BY_MONTH.reduce((a, m) => a + m.grossEur, 0))} total
            </p>
          </div>
          <RevenueChart />
        </Card>

        {/* ---- Pipeline by stage ------------------------------------------ */}
        <Card>
          <SectionLabel>Pipeline by stage</SectionLabel>
          <div className="mt-4 space-y-3">
            {STAGES.map((s) => {
              const inStage = DEALS.filter((d) => d.stage === s.id);
              const v = inStage.reduce((a, d) => a + d.valueEur, 0);
              const pct = pipelineValue + bookedValue ? (v / (pipelineValue + bookedValue)) * 100 : 0;
              return (
                <div key={s.id}>
                  <div className="flex items-baseline justify-between text-[12.5px]">
                    <span className="flex items-center gap-2 text-ink">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.colour }} />
                      {s.label}
                    </span>
                    <span className="tnum text-muted">
                      {inStage.length} · {eur(v)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-raised">
                    <div
                      className="h-full rounded-pill"
                      style={{ width: `${pct}%`, background: s.colour }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---- Needs attention -------------------------------------------- */}
        <Card className="xl:col-span-2" pad={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <SectionLabel>Needs attention</SectionLabel>
            <span className="tnum text-[12px] text-faint">{unreplied} unanswered</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {CONVERSATIONS.filter((c) => c.unreplied).map((c) => {
              const athlete = contactById(c.athleteId);
              const partner = contactById(c.partnerId);
              return (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3.5">
                  <Pill tone="red">Waiting</Pill>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">
                      {athlete?.name} → {partner?.name}
                      <span className="text-faint"> · {c.peak}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">“{c.lastMessage}”</p>
                  </div>
                  <span className="tnum shrink-0 text-[11.5px] text-faint">{fmtShort(c.at)}</span>
                </li>
              );
            })}
            {unreplied === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-faint">Nothing waiting.</li>
            )}
          </ul>
        </Card>

        {/* ---- Signups ----------------------------------------------------- */}
        <Card>
          <SectionLabel>New athletes</SectionLabel>
          <p className="mt-1.5 text-[13px] text-muted">Weekly registrations, last 12 weeks.</p>
          <Sparkbars values={SIGNUPS_BY_WEEK} />
          <div className="mt-3 flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="text-[12.5px] text-muted">This week</span>
            <span className="tnum text-[18px] font-light text-ink">{SIGNUPS_BY_WEEK.at(-1)}</span>
          </div>
        </Card>
      </div>

      {/* ---- Partners ------------------------------------------------------ */}
      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <SectionLabel>Partner companies</SectionLabel>
          <span className="tnum text-[12px] text-faint">
            {ORGANISATIONS.filter((o) => o.status === "active").length} active of {ORGANISATIONS.length}
          </span>
        </div>
        <ul className="divide-y divide-line-soft">
          {ORGANISATIONS.slice(0, 4).map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-tile bg-raised text-[11px] font-medium text-muted ring-1 ring-line">
                {o.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{o.name}</p>
                <p className="text-[12px] text-faint">
                  {o.country} · {o.guides} guides
                </p>
              </div>
              <span className="tnum text-[12.5px] text-muted">{o.commissionPct}%</span>
              <Pill tone={o.status === "active" ? "green" : o.status === "onboarding" ? "amber" : "neutral"}>
                {o.status}
              </Pill>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Kpi({
  icon: Icon,
  label,
  value,
  foot,
  alert,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string;
  foot: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionLabel>{label}</SectionLabel>
        <Icon
          size={16}
          strokeWidth={1.7}
          className={alert ? "text-[oklch(0.6_0.15_22)]" : "text-faint"}
        />
      </div>
      <p className="tnum mt-3 text-[26px] font-light leading-none tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-2 text-[12px] text-faint">{foot}</p>
    </Card>
  );
}

/** Hand-built SVG — a chart library for six bars and a line is a dependency for nothing. */
function RevenueChart() {
  const data = REVENUE_BY_MONTH;
  const max = Math.max(...data.map((d) => d.grossEur)) * 1.15;
  const W = 640;
  const H = 190;
  const pad = { l: 44, r: 8, t: 8, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = (iw / data.length) * 0.5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Booking value by month">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad.t + ih - t * ih;
        return (
          <g key={t}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--adm-line-soft)" strokeWidth="1" />
            <text x={pad.l - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--adm-faint)">
              {t === 0 ? "0" : `${Math.round((max * t) / 1000)}k`}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pad.l + (iw / data.length) * (i + 0.5) - bw / 2;
        const h = (d.grossEur / max) * ih;
        return (
          <g key={d.month}>
            <rect
              x={x}
              y={pad.t + ih - h}
              width={bw}
              height={h}
              rx="3"
              fill="var(--adm-accent)"
              opacity={i === data.length - 1 ? 1 : 0.42}
            />
            <text
              x={x + bw / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="10.5"
              fill={i === data.length - 1 ? "var(--adm-ink)" : "var(--adm-faint)"}
            >
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Sparkbars({ values }: { values: number[] }) {
  const max = Math.max(...values);
  return (
    <div className="mt-4 flex h-[74px] items-end gap-[3px]">
      {values.map((v, i) => (
        <div
          key={i}
          title={`${v} registrations`}
          style={{ height: `${(v / max) * 100}%` }}
          className={cn(
            "flex-1 rounded-[2px]",
            i === values.length - 1 ? "bg-accent" : "bg-accent/30",
          )}
        />
      ))}
    </div>
  );
}
