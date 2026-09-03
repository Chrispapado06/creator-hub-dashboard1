import { useId } from "react";

/**
 * Hand-rolled SVG charts — this app has no chart library, and these three
 * cover the owner's mockups (dashboard, products, commissions). They draw
 * whatever real numbers they are given and nothing else: no smoothing, no
 * extrapolation, no invented baseline.
 *
 * THE THREE HONESTY RULES IN THAT SENTENCE ARE UNCHANGED BY THE RE-SKIN, and
 * one of them cost the theme a feature. The theme draws every series with
 * recharts' `type="natural"` — a bezier that rounds corners and, between two
 * measured points, invents the shape of the curve between them. These charts
 * keep STRAIGHT SEGMENTS for that reason. It is the one place the drawing
 * deliberately does not match localhost:3100.
 *
 * Everything else here was matched against the theme's own charts, read out of
 *   theme-ref/src/app/(main)/dashboard/default/_components/performance-overview.tsx
 *   theme-ref/src/app/(main)/dashboard/crm/_components/pipeline-activity.tsx
 *   theme-ref/src/app/(main)/dashboard/finance/_components/balance-distribution-card.tsx
 * and the shared wrapper in theme-ref/src/components/ui/chart.tsx:
 *
 *   colour       every series is a NEUTRAL GREY from --chart-1…5. The theme
 *                has no chart hue at all; its ramp is 0.87 / 0.556 / 0.439 /
 *                0.371 / 0.269, all chroma 0.
 *   grid         horizontal only (`CartesianGrid vertical={false}`), dashed,
 *                --border at 50%.
 *   axis         no axis line, no tick line, ticks in --muted-foreground at
 *                12px (the wrapper's `text-xs` + `fill-muted-foreground`).
 *   line         1.25px, and NO dots — the theme sets `dot={false}` and shows
 *                a point only on hover.
 *   area         a vertical gradient of the series colour. The theme writes
 *                0.36 → 0.04 over --chart-1, a LIGHT grey, and the wash it
 *                produces lands around L 0.95. The first series here is the
 *                ramp's INK end, so the same alphas would paint a slab: the
 *                stops are 0.10 → 0.01, which reproduces the theme's WEIGHT
 *                (L 0.93 → 0.99) rather than its alpha numbers.
 *   bars         rounded TOP corners only (`radius={[8,8,0,0]}`).
 *   donut        inner/outer 65/90 with a 2° gap between segments.
 *
 * SCALE NOTE, because it decides every hard-coded size below: each <svg> is
 * `h-[Npx] w-full` over a viewBox of almost exactly N units tall, and the
 * default `preserveAspectRatio` scales uniformly to fit the SHORTER axis. So
 * one viewBox unit ≈ one device pixel, and `text-[12px]` here really does
 * render at the theme's 12px.
 */

/**
 * The theme's neutral chart ramp, in the order its own donut renders.
 *
 * Named DONUT_COLORS because Dashboard and Commissions import that name to
 * paint their legend swatches, and those screens may not be edited in this
 * pass. It is the shared series palette for all three charts.
 *
 * The order is not the token order: it is 0.556 → 0.371 → 0.87 → 0.439 →
 * 0.269, which is the sequence the theme's Account Allocation donut actually
 * paints. Every adjacent pair is at least 0.17 apart in lightness, which is
 * what keeps neighbouring segments of one grey donut tellable apart — the
 * whole reason a chromatic palette existed here before.
 */
export const DONUT_COLORS = [
  "var(--chart-5)", // oklch(0.269 0 0) — the ramp's ink end
  "var(--chart-2)", // oklch(0.556 0 0)
  "var(--chart-1)", // oklch(0.87  0 0)
  "var(--chart-3)", // oklch(0.439 0 0)
  "var(--chart-4)", // oklch(0.371 0 0)
];

/** `CartesianGrid` draws a line at each y-tick; recharts' default is 5 ticks. */
const GRID_LINES = 4;

function Grid({ w, top, bottom }: { w: number; top: number; bottom: number }) {
  return (
    <g aria-hidden>
      {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
        const y = top + (i * (bottom - top)) / GRID_LINES;
        return (
          <line
            key={i}
            x1={0}
            x2={w}
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })}
    </g>
  );
}

export function LineChart({
  series,
  labels,
  colors = DONUT_COLORS,
}: {
  /** One or more series of equal length. */
  series: number[][];
  labels: string[];
  colors?: string[];
}) {
  // One gradient per instance; two charts on a screen must not share an id.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = 560, H = 180, PAD = 8;
  const max = Math.max(...series.flat(), 1);
  const n = Math.max(...series.map((s) => s.length), 1);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(n - 1, 1);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-[204px] w-full min-w-[420px]">
        <defs>
          <linearGradient id={`fill${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors[0]} stopOpacity={0.1} />
            <stop offset="95%" stopColor={colors[0]} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        <Grid w={W} top={PAD} bottom={H - PAD} />

        {series.map((pts, si) => {
          const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              {si === 0 && pts.length > 1 && (
                <path
                  d={`${line} L${x(pts.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`}
                  fill={`url(#fill${uid})`}
                />
              )}
              <path
                d={line}
                fill="none"
                stroke={colors[si % colors.length]}
                strokeWidth={1.25}
                strokeLinejoin="round"
              />
              {/* The theme draws no dots. A ONE-POINT series is the exception:
                  a path of one point has no length and would render nothing at
                  all, which would turn a measured figure into a blank chart. */}
              {pts.length === 1 && (
                <circle cx={x(0)} cy={y(pts[0])} r={2.5} fill={colors[si % colors.length]} />
              )}
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
              className="fill-[var(--crm-muted)] text-[12px]"
            >
              {l}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function Donut({ segments, centre }: { segments: { value: number }[]; centre: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  // 65/90 in the theme; 45.5/62.5 here, the same 0.73 inner-to-outer ratio.
  const R = 54, SW = 17, C = 2 * Math.PI * R;
  /** The theme's `paddingAngle={2}`, in path units. */
  const GAP = (2 / 360) * C;
  let offset = 0;
  return (
    <div className="relative h-[150px] w-[150px] shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const len = frac * C;
          const el = (
            <circle
              key={i}
              cx={70} cy={70} r={R} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={SW}
              strokeDasharray={`${Math.max(len - GAP, 0).toFixed(2)} ${(C - Math.max(len - GAP, 0)).toFixed(2)}`}
              strokeDashoffset={(-(offset * C) - GAP / 2).toFixed(2)}
            />
          );
          offset += frac;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {/* The theme's donut centre: `font-medium text-lg tabular-nums`. */}
        <span className="tnum max-w-[92px] text-center text-[17px] font-medium leading-tight text-ink">
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
  /** The theme's `radius={[8,8,0,0]}` — rounded top, square foot. */
  const topRounded = (bx: number, by: number, w: number, h: number) => {
    const r = Math.min(8, w / 2, h);
    return `M${bx},${(by + h).toFixed(1)} L${bx},${(by + r).toFixed(1)} A${r},${r} 0 0 1 ${bx + r},${by.toFixed(1)} L${bx + w - r},${by.toFixed(1)} A${r},${r} 0 0 1 ${bx + w},${(by + r).toFixed(1)} L${bx + w},${(by + h).toFixed(1)} Z`;
  };
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-[184px] w-full min-w-[420px]">
        <Grid w={W} top={PAD} bottom={H - PAD} />
        {labels.map((_, i) => {
          const cx = PAD + ((i + 0.5) * (W - 2 * PAD)) / n;
          let yTop = H - PAD;
          // Which layer sits on top of this bar decides which one gets the
          // rounded cap; a zero layer is not "on top", it is not there.
          const topLayer = series.reduce((best, layer, si) => ((layer[i] ?? 0) > 0 ? si : best), -1);
          return (
            <g key={i}>
              {series.map((layer, si) => {
                const h = ((layer[i] ?? 0) / max) * (H - 2 * PAD);
                yTop -= h;
                if (h <= 0) return null;
                const fill = colors[si % colors.length];
                return si === topLayer ? (
                  <path key={si} d={topRounded(cx - bw / 2, yTop, bw, h)} fill={fill} />
                ) : (
                  <rect key={si} x={cx - bw / 2} y={yTop} width={bw} height={h} fill={fill} />
                );
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
              className="fill-[var(--crm-muted)] text-[12px]"
            >
              {l}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
