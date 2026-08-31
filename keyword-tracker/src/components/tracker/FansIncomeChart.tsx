"use client";

// Dependency-free SVG line chart: DIRECT fans/day (accent) + DIRECT income/day
// (emerald) over time, with a dashed vertical marker at each keyword change.
// Clean and functional, not fancy — two independently-scaled series.

type Point = { date: string; fans: number; income: number };
type Marker = { date: string; label: string };

const W = 820;
const H = 300;
const PAD = { l: 44, r: 48, t: 28, b: 28 };

const ACCENT = "#6366f1"; // fans
const EMERALD = "#10b981"; // income
const BORDER = "#243045";
const MUTED = "#8b97ad";

function ms(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function FansIncomeChart({ data, markers }: { data: Point[]; markers: Marker[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">
        Not enough daily data yet to chart (need at least 2 days).
      </div>
    );
  }

  const xs = data.map((d) => ms(d.date));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanX = maxX - minX || 1;
  const maxFans = Math.max(1, ...data.map((d) => d.fans));
  const maxIncome = Math.max(1, ...data.map((d) => d.income));

  const x = (d: string) => PAD.l + ((ms(d) - minX) / spanX) * (W - PAD.l - PAD.r);
  const yFans = (v: number) => H - PAD.b - (v / maxFans) * (H - PAD.t - PAD.b);
  const yIncome = (v: number) => H - PAD.b - (v / maxIncome) * (H - PAD.t - PAD.b);

  const fansPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.date).toFixed(1)},${yFans(d.fans).toFixed(1)}`).join(" ");
  const incomePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.date).toFixed(1)},${yIncome(d.income).toFixed(1)}`).join(" ");

  const inRange = markers.filter((m) => ms(m.date) >= minX && ms(m.date) <= maxX);
  const fmtDate = (d: string) => d.slice(5); // MM-DD

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Fans and income over time">
        {/* axes */}
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke={BORDER} />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke={BORDER} />

        {/* keyword-change markers */}
        {inRange.map((m, i) => {
          const mx = x(m.date);
          return (
            <g key={i}>
              <line x1={mx} y1={PAD.t} x2={mx} y2={H - PAD.b} stroke={MUTED} strokeDasharray="4 4" strokeWidth={1} opacity={0.7} />
              <text x={mx + 3} y={PAD.t + 9} fontSize={9} fill={MUTED}>
                {fmtDate(m.date)} · {m.label}
              </text>
            </g>
          );
        })}

        {/* series */}
        <path d={fansPath} fill="none" stroke={ACCENT} strokeWidth={2} />
        <path d={incomePath} fill="none" stroke={EMERALD} strokeWidth={2} />

        {/* y labels */}
        <text x={PAD.l - 6} y={PAD.t + 4} fontSize={10} fill={ACCENT} textAnchor="end">{maxFans}</text>
        <text x={W - PAD.r + 6} y={PAD.t + 4} fontSize={10} fill={EMERALD} textAnchor="start">${Math.round(maxIncome)}</text>

        {/* x endpoints */}
        <text x={PAD.l} y={H - PAD.b + 16} fontSize={10} fill={MUTED} textAnchor="start">{fmtDate(data[0].date)}</text>
        <text x={W - PAD.r} y={H - PAD.b + 16} fontSize={10} fill={MUTED} textAnchor="end">{fmtDate(data[data.length - 1].date)}</text>
      </svg>
      <div className="mt-1 flex items-center gap-4 px-2 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: ACCENT }} /> direct fans / day</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: EMERALD }} /> direct income / day</span>
        <span className="flex items-center gap-1.5"><span className="h-3 border-l border-dashed" style={{ borderColor: MUTED }} /> keyword change</span>
      </div>
    </div>
  );
}
