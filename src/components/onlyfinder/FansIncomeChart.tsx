import { useMemo } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DailyMetric } from "@/lib/onlyfinder";

const toMs = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fmtDay = (t: number) => new Date(t).toISOString().slice(5, 10); // MM-DD

/** Direct fans/day + direct income/day, with a dashed marker at each keyword change. */
export function FansIncomeChart({
  metrics,
  changes,
}: {
  metrics: DailyMetric[];
  changes: { changed_on: string; action: string | null }[];
}) {
  const data = useMemo(
    () => metrics.map((m) => ({ t: toMs(m.metric_date), fans: m.direct_fans, income: Number(m.direct_income_usd) })),
    [metrics],
  );

  if (data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Not enough daily data yet to chart (need at least 2 days).
      </div>
    );
  }

  const minT = data[0].t;
  const maxT = data[data.length - 1].t;
  const markers = changes.map((c) => ({ t: toMs(c.changed_on), label: c.action ?? "change" })).filter((m) => m.t >= minT && m.t <= maxT);

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 16, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtDay}
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis yAxisId="fans" stroke="hsl(var(--primary))" fontSize={10} tickLine={false} axisLine={false} width={32} />
          <YAxis yAxisId="income" orientation="right" stroke="#10b981" fontSize={10} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 10)}
            formatter={(v: number, name) => [name === "income" ? `$${v}` : v, name === "income" ? "direct income/day" : "direct fans/day"]}
          />
          {markers.map((m, i) => (
            <ReferenceLine
              key={i}
              yAxisId="fans"
              x={m.t}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{ value: `${fmtDay(m.t)} ${m.label}`, position: "top", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            />
          ))}
          <Line yAxisId="fans" type="monotone" dataKey="fans" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          <Line yAxisId="income" type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-4 px-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: "hsl(var(--primary))" }} /> direct fans / day</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: "#10b981" }} /> direct income / day</span>
        <span className="flex items-center gap-1.5"><span className="h-3 border-l border-dashed border-muted-foreground" /> keyword change</span>
      </div>
    </div>
  );
}
