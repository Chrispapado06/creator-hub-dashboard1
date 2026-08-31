/**
 * Hand-rolled SVG charts — this app has no chart library, and these three
 * cover the owner's mockups (dashboard, products, commissions). They draw
 * whatever real numbers they are given and nothing else: no smoothing, no
 * extrapolation, no invented baseline.
 */

export function LineChart({
  series,
  labels,
  colors = ["var(--crm-accent)", "oklch(0.71 0.16 55)"],
}: {
  /** One or more series of equal length. */
  series: number[][];
  labels: string[];
  colors?: string[];
}) {
  const W = 560, H = 180, PAD = 8;
  const max = Math.max(...series.flat(), 1);
  const n = Math.max(...series.map((s) => s.length), 1);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(n - 1, 1);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-[200px] w-full min-w-[420px]">
        {series.map((pts, si) => {
          const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              {si === 0 && (
                <path
                  d={`${line} L${x(pts.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`}
                  fill={colors[0]}
                  opacity={0.08}
                />
              )}
              <path d={line} fill="none" stroke={colors[si % colors.length]} strokeWidth={2} />
              {pts.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={colors[si % colors.length]} />
              ))}
            </g>
          );
        })}
        {labels.map((l, i) =>
          labels.length <= 10 || i % Math.ceil(labels.length / 8) === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={H + 16}
              textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
              className="fill-[var(--crm-faint)] text-[10px]"
            >
              {l}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export const DONUT_COLORS = [
  "var(--crm-accent)",
  "oklch(0.71 0.16 55)",
  "oklch(0.64 0.15 150)",
  "oklch(0.6 0.17 305)",
];

export function Donut({ segments, centre }: { segments: { value: number }[]; centre: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative h-[150px] w-[150px] shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const el = (
            <circle
              key={i}
              cx={70} cy={70} r={R} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={16}
              strokeDasharray={`${(frac * C).toFixed(2)} ${C.toFixed(2)}`}
              strokeDashoffset={(-offset * C).toFixed(2)}
            />
          );
          offset += frac;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="tnum max-w-[90px] text-center text-[15px] font-extrabold leading-tight text-ink">
          {centre}
        </span>
      </div>
    </div>
  );
}

/** Stacked bars, one bar per label, one stack layer per series. */
export function Bars({
  series,
  labels,
  colors = DONUT_COLORS,
}: {
  series: number[][];
  labels: string[];
  colors?: string[];
}) {
  const W = 560, H = 160, PAD = 8;
  const n = labels.length || 1;
  const totals = labels.map((_, i) => series.reduce((s, layer) => s + (layer[i] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const bw = Math.max(3, ((W - 2 * PAD) / n) * 0.6);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-[180px] w-full min-w-[420px]">
        {labels.map((_, i) => {
          const cx = PAD + ((i + 0.5) * (W - 2 * PAD)) / n;
          let yTop = H - PAD;
          return (
            <g key={i}>
              {series.map((layer, si) => {
                const h = ((layer[i] ?? 0) / max) * (H - 2 * PAD);
                yTop -= h;
                return h > 0 ? (
                  <rect key={si} x={cx - bw / 2} y={yTop} width={bw} height={h} rx={1.5} fill={colors[si % colors.length]} />
                ) : null;
              })}
            </g>
          );
        })}
        {labels.map((l, i) =>
          labels.length <= 10 || i % Math.ceil(labels.length / 8) === 0 ? (
            <text
              key={i}
              x={PAD + ((i + 0.5) * (W - 2 * PAD)) / n}
              y={H + 16}
              textAnchor="middle"
              className="fill-[var(--crm-faint)] text-[10px]"
            >
              {l}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
