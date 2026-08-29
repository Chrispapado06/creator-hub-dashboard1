/**
 * The Performance Overview chart.
 *
 * ONE RULE ABOVE ALL: a series is drawn only if ICEFALL measured it.
 *
 * The mockup this is built from shows four lines, the first being Profile
 * Views. Nothing in the ICEFALL family emits a listing-view event, so that line
 * would be a shape drawn from nothing — and a line on a chart is a stronger
 * claim than a number in a tile, because its *shape* implies a trend somebody
 * could act on. Views therefore does not appear as a flat zero line, an
 * interpolation, or a dotted "coming soon" line. It is named in the legend as
 * not counted, and the chart draws the three series that are real.
 *
 * Deliberately hand-drawn SVG rather than a charting dependency: three series of
 * daily counts do not justify 200 kB, and a library's default behaviours —
 * zero-filling gaps, smoothing through missing points — are exactly the ones
 * this product must not have.
 */

import { useId } from "react";

export interface TrendSeries {
  key: string;
  label: string;
  colour: string;
  points: number[];
}

export function TrendChart({
  days,
  series,
  unavailableNote,
  height = 190,
}: {
  days: string[];
  series: TrendSeries[];
  /** Named in the legend, so its absence is visible rather than silent. */
  unavailableNote?: { label: string; reason: string };
  height?: number;
}) {
  const gradId = useId();
  const width = 620;
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 22;

  const max = Math.max(1, ...series.flatMap((s) => s.points));
  // A tidy ceiling, so the gridline labels are readable numbers.
  const ceil = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const n = days.length;

  const x = (i: number) => padL + (i * (width - padL - padR)) / Math.max(1, n - 1);
  const y = (v: number) => padT + (1 - v / ceil) * (height - padT - padB);

  const path = (points: number[]) =>
    points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const gridValues = [0, ceil / 4, ceil / 2, (ceil * 3) / 4, ceil];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-pill" style={{ background: s.colour }} aria-hidden />
            {s.label}
          </span>
        ))}
        {unavailableNote && (
          /*
           * The missing series, named. Struck through and captioned rather than
           * omitted: a legend that silently lists three where the mockup showed
           * four teaches the reader that three is all there ever was.
           */
          <span
            className="flex items-center gap-1.5 text-[11.5px] text-faint"
            title={unavailableNote.reason}
          >
            <span className="h-1.5 w-1.5 rounded-pill border border-faint" aria-hidden />
            <span className="line-through">{unavailableNote.label}</span>
            <span>— not counted</span>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Daily ${series.map((s) => s.label).join(", ")} over ${n} days`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--op-azure)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--op-azure)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--op-line)"
              strokeWidth="1"
            />
            <text
              x={padL - 7}
              y={y(v) + 3.5}
              textAnchor="end"
              className="tnum"
              fontSize="9"
              fill="var(--op-faint)"
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* The lead series gets a fill, so the eye has somewhere to rest. */}
        {series[0] && series[0].points.some((p) => p > 0) && (
          <path
            d={`${path(series[0].points)} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
            fill={`url(#${gradId})`}
          />
        )}

        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.points)}
            fill="none"
            stroke={s.colour}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {series.map((s) =>
          s.points.map((v, i) =>
            v > 0 ? (
              <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v)} r="2" fill={s.colour}>
                <title>{`${days[i]} — ${v} ${s.label.toLowerCase()}`}</title>
              </circle>
            ) : null,
          ),
        )}

        {days.map((d, i) =>
          i === 0 || i === n - 1 || i === Math.floor(n / 2) ? (
            <text
              key={d}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize="9"
              fill="var(--op-faint)"
            >
              {d}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
