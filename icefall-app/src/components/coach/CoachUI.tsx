import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { isKnown, type Score } from "@/coach/types";
import { QualifierBadge, UnavailableState, type DataQualifier } from "@/components/coach/DataState";
import type { LoadPoint } from "@/coach/load";

/**
 * The Coach component library.
 *
 * One rule governs every component here: a value ICEFALL does not have is drawn
 * as an absence with a reason, never as a zero. A ring with no score is a dashed
 * outline, not an empty azure arc at 0%. A chart with a missing day has a gap in
 * the line, not a point on the floor. Both of those defaults would read as
 * "you did nothing" rather than "we don't know", and that difference changes how
 * an athlete plans their week.
 *
 * Everything is inline SVG — hairline strokes, a single azure accent, no fills
 * beyond a low-opacity wash. It has to stay legible on a screen held at arm's
 * length in daylight.
 */

const AZURE = "var(--ice-azure)";
const TRACK = "oklch(1 0 0 / 8%)";

/* -------------------------------------------------------------------------- */
/* ScoreRing                                                                  */
/* -------------------------------------------------------------------------- */

export function ScoreRing({
  score,
  unit,
  size = 140,
  label,
  caption,
  className,
}: {
  score: Score;
  unit?: string;
  size?: number;
  label?: string;
  caption?: string;
  className?: string;
}) {
  const stroke = Math.max(2, Math.round(size * 0.022));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  // An unknown score draws a dashed outline and says why. It must never render
  // as a complete track, which reads as a real score of zero.
  if (!isKnown(score)) {
    return (
      <div className={cn("flex flex-col items-center", className)}>
        <div className="relative grid place-items-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              stroke={TRACK}
              strokeDasharray="4 6"
            />
          </svg>
          <span className="absolute text-[22px] font-extralight text-mist-dim">—</span>
        </div>
        <UnavailableState
          reason={score.reason ?? "no-data"}
          size="sm"
          className="mt-3 max-w-[200px]"
        />
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, score.value));
  const valueSize = Math.round(size * 0.26);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={TRACK}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={AZURE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
            style={{ transition: "stroke-dashoffset var(--dur-slow) var(--ease-alpine)" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className="tnum font-extralight leading-none text-snow"
            style={{ fontSize: valueSize }}
          >
            {Math.round(score.value)}
          </span>
          {unit && <span className="tnum mt-1 text-[11px] text-mist-dim">{unit}</span>}
        </div>
      </div>
      {label && <p className="mt-3 text-[15px] text-snow">{label}</p>}
      {caption && <p className="section-label mt-1">{caption}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FactorBar                                                                  */
/* -------------------------------------------------------------------------- */

export function FactorBar({
  label,
  score,
  note,
  qualifier,
}: {
  label: string;
  score: Score;
  note: string;
  qualifier?: DataQualifier;
}) {
  const value = isKnown(score) ? score.value : null;

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[13px] text-snow">{label}</span>
        {qualifier && <QualifierBadge kind={qualifier} />}
        {value !== null ? (
          <span className="tnum shrink-0 text-[12px] text-mist">
            {Math.round(value)}
            <span className="text-mist-dim">/100</span>
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-mist-dim">Unavailable</span>
        )}
      </div>

      <div
        className="mt-2 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: TRACK }}
      >
        {/* No bar at all when the value is unknown. A zero-width azure fill and a
            genuine score of zero must not look the same. */}
        {value !== null && (
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, value))}%`,
              background: AZURE,
              transition: "width var(--dur-slow) var(--ease-alpine)",
            }}
          />
        )}
      </div>

      {value === null ? (
        <UnavailableState reason={score.reason ?? "no-data"} size="sm" className="mt-2.5" />
      ) : (
        note && <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{note}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StatTile                                                                   */
/* -------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  unit,
  delta,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  /** Pre-formatted, e.g. "+2.4 km" or "no change". */
  delta?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <p className="section-label">{label}</p>
      <p className="tnum mt-2 text-[22px] font-extralight leading-none text-snow">
        {value}
        {unit && <span className="ml-1 text-[12px] font-light text-mist">{unit}</span>}
      </p>
      {/* Deliberately uncoloured. Green for "more" would reward volume for its
          own sake, which is precisely the incentive this app must not create. */}
      {delta && <p className="tnum mt-1.5 text-[11px] text-mist-dim">{delta}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SegmentBars                                                                */
/* -------------------------------------------------------------------------- */

export function SegmentBars({
  data,
  labels,
  activeIndex,
  className,
}: {
  data: number[];
  labels: string[];
  activeIndex: number;
  className?: string;
}) {
  const max = Math.max(...data, 0);

  return (
    <div className={cn("flex items-end gap-2", className)}>
      {data.map((v, i) => {
        // Guard the all-zero week: dividing by a zero max is NaN, which React
        // renders as a broken height rather than an empty column.
        const h = max > 0 ? Math.max(2, Math.round((v / max) * 64)) : 2;
        const active = i === activeIndex;
        return (
          <div key={`${labels[i] ?? i}-${i}`} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-16 w-full items-end">
              <div
                className={cn("w-full rounded-[3px]", v > 0 ? "" : "border border-hairline")}
                style={{
                  height: h,
                  background: v > 0 ? (active ? AZURE : "oklch(1 0 0 / 20%)") : "transparent",
                }}
              />
            </div>
            <span className={cn("text-[10px]", active ? "text-azure" : "text-mist-dim")}>
              {labels[i] ?? ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DonutChart                                                                 */
/* -------------------------------------------------------------------------- */

export function DonutChart({
  segments,
  size = 112,
}: {
  segments: { id: string; label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = Math.round(size * 0.16);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  if (total <= 0) {
    return (
      <div className="grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={TRACK}
            strokeDasharray="4 6"
          />
        </svg>
      </div>
    );
  }

  let offset = 0;

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={TRACK} />
      {segments.map((s) => {
        const frac = s.value / total;
        const dash = circumference * frac;
        const el = (
          <circle
            key={s.id}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={s.color}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* TrendLine                                                                  */
/* -------------------------------------------------------------------------- */

export interface TrendPoint {
  label: string;
  score: Score;
}

/**
 * Two callers, two shapes: readiness passes a series of Scores, training load
 * passes raw LoadPoints with an optimal band. Both are accepted rather than
 * forcing one to adapt, because the honest handling of a missing value differs
 * between them and collapsing that would lose it.
 */
export function TrendLine({
  points,
  data,
  band,
  height = 72,
  className,
}: {
  points?: TrendPoint[];
  data?: LoadPoint[];
  band?: { from: number; to: number };
  height?: number;
  className?: string;
}) {
  const series: { label: string; value: number | null }[] = points
    ? points.map((p) => ({ label: p.label, value: isKnown(p.score) ? p.score.value : null }))
    : (data ?? []).map((d) => ({ label: d.date, value: d.load }));

  const known = series.filter((s) => s.value !== null).map((s) => s.value as number);
  if (series.length === 0 || known.length === 0) {
    return (
      <div
        className={cn(
          "grid w-full place-items-center rounded-tile border border-hairline",
          className,
        )}
        style={{ height }}
      >
        <span className="text-[11px] text-mist-dim">Not enough data to plot</span>
      </div>
    );
  }

  const W = 300;
  const H = height;
  const pad = 6;

  const lo = Math.min(...known, band ? band.from : Infinity);
  const hi = Math.max(...known, band ? band.to : -Infinity);
  const span = hi - lo || 1;

  const x = (i: number) =>
    series.length === 1 ? W / 2 : (i / (series.length - 1)) * (W - pad * 2) + pad;
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);

  // Build separate path segments so a gap in the data breaks the line. Drawing
  // straight through a missing day would invent a value that was never recorded.
  const paths: string[] = [];
  let current: string[] = [];
  series.forEach((s, i) => {
    if (s.value === null) {
      if (current.length > 1) paths.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`);
  });
  if (current.length > 1) paths.push(current.join(" "));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full", className)} style={{ height }}>
      {band && (
        <rect
          x={pad}
          y={y(band.to)}
          width={W - pad * 2}
          height={Math.max(1, y(band.from) - y(band.to))}
          fill={AZURE}
          fillOpacity={0.07}
        />
      )}
      {paths.map((d) => (
        <path
          key={d.slice(0, 24)}
          d={d}
          fill="none"
          stroke={AZURE}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      ))}
      {series.map((s, i) =>
        s.value === null ? null : (
          <circle key={`${s.label}-${i}`} cx={x(i)} cy={y(s.value)} r={2} fill={AZURE} />
        ),
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* QuickActionTile                                                            */
/* -------------------------------------------------------------------------- */

export function QuickActionTile({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-tile border border-hairline bg-graphite px-3.5 py-3.5 transition-colors hover:border-azure/50"
    >
      <Icon size={16} strokeWidth={1.5} className="shrink-0 text-azure" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-snow">{label}</span>
      <ChevronRight size={14} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
    </Link>
  );
}
