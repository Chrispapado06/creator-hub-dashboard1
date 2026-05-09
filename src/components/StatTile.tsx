// Shared "Nexus-style" KPI tile + delta pill — reused on the Daily
// Dashboard, Revenue page, and any other place that wants a clean
// white card with: icon chip + label, big number, pill % delta, and
// an optional gradient sparkline running along the bottom.
//
// Extracted from DailyHero so the Revenue page (and future pages) can
// share the same hover-lift, gradient sparkline, and delta-pill look
// without re-implementing them.

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus, Info } from "lucide-react";

const TILE_TONES = {
  emerald: { chipBg: "bg-emerald-500/12", chipFg: "text-emerald-600", sparkRgb: "16 185 129" },
  violet:  { chipBg: "bg-violet-500/12",  chipFg: "text-violet-600",  sparkRgb: "139 92 246" },
  cyan:    { chipBg: "bg-cyan-500/12",    chipFg: "text-cyan-600",    sparkRgb: "8 145 178"  },
  amber:   { chipBg: "bg-amber-500/15",   chipFg: "text-amber-600",   sparkRgb: "245 158 11" },
  rose:    { chipBg: "bg-rose-500/12",    chipFg: "text-rose-600",    sparkRgb: "244 63 94"  },
  indigo:  { chipBg: "bg-indigo-500/12",  chipFg: "text-indigo-600",  sparkRgb: "99 102 241" },
} as const;
export type StatTone = keyof typeof TILE_TONES;

export type StatPoint = { x: string; y: number };

export function StatTile({
  tone, icon, label, value, delta, deltaSubtitle, sparkline, loading, info,
}: {
  tone: StatTone;
  icon: React.ReactNode;
  label: string;
  value: string;
  /** % change vs previous period. null = unknown / not enough data. */
  delta: number | null;
  /** Small caption rendered under the number (e.g. "vs yesterday"). */
  deltaSubtitle: string;
  /** Optional time-series for the bottom-of-tile sparkline. Empty = no chart. */
  sparkline?: StatPoint[];
  loading?: boolean;
  /** When true, shows the small (i) info icon top-right. */
  info?: boolean;
}) {
  const t = TILE_TONES[tone];
  const series = sparkline ?? [];
  const sparkId = `spark-${tone}-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="group relative rounded-2xl border border-border bg-card p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.10)]">
      {/* Top row: icon chip + label, optional info hint right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${t.chipBg} ${t.chipFg}`}>
            {icon}
          </span>
          <span className="text-sm font-medium text-foreground/90 truncate">{label}</span>
        </div>
        {info !== false && <Info className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
      </div>

      {/* Number + pill delta on the same baseline */}
      <div className="mt-4 flex items-end gap-2.5 flex-wrap">
        <span className="text-3xl font-bold tabular-nums leading-none">
          {loading ? <span className="inline-block h-7 w-24 rounded bg-muted animate-pulse" /> : value}
        </span>
        <DeltaBadge delta={delta} />
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground truncate">{deltaSubtitle}</div>

      {/* Sparkline at the bottom — gradient area, low contrast */}
      {series.length > 0 && (
        <div className="mt-3 -mx-2 h-10 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={sparkId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`rgb(${t.sparkRgb})`} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={`rgb(${t.sparkRgb})`} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="y"
                stroke={`rgb(${t.sparkRgb})`}
                strokeWidth={1.75}
                fill={`url(#${sparkId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Pastel pill for percentage change. Diagonal arrow shows direction;
 *  no leading sign so the visual is calm. Pass null when delta is unknown. */
export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground inline-flex items-center gap-1 font-semibold">
        <Minus className="h-2.5 w-2.5" /> —
      </span>
    );
  }
  const positive = delta > 0;
  const negative = delta < 0;
  const cls = positive
    ? "bg-emerald-500/12 text-emerald-600"
    : negative
      ? "bg-rose-500/12 text-rose-600"
      : "bg-muted text-muted-foreground";
  const Arrow = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  return (
    <span className={`text-[10px] px-2 py-1 rounded-full font-semibold inline-flex items-center gap-0.5 tabular-nums ${cls}`}>
      {Math.abs(delta).toFixed(1)}%
      <Arrow className="h-2.5 w-2.5" />
    </span>
  );
}
