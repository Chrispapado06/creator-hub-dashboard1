import { motion, useReducedMotion } from "framer-motion";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { elevationPath } from "@/lib/geo";
import { fmtDistance, fmtElevation } from "@/lib/format";
import type { TrackPoint } from "@/types";

/**
 * Hand-built SVG charts.
 *
 * The reference design's charts are hairline-thin and unlabelled — closer to
 * instrumentation than to business graphics. A charting library would fight
 * that at every step, so these are drawn directly.
 */

/* -------------------------------------------------------------------------- */
/* ProgressRing — goal preparation, macro splits                              */
/* -------------------------------------------------------------------------- */

export function ProgressRing({
  value,
  size = 64,
  stroke = 3,
  className,
  trackClassName,
  color = "var(--ice-azure)",
  children,
  delay = 0,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  trackClassName?: string;
  color?: string;
  children?: React.ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={cn("stroke-white/[0.08]", trackClassName)}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c - (pct / 100) * c : c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1], delay }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {children ?? (
          <span className="tnum text-[13px] font-light text-snow">{Math.round(pct)}%</span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline — weekly trend                                                    */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  data,
  width = 280,
  height = 44,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(1, max - min);

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return [x, y] as const;
  });

  // Catmull-Rom style smoothing keeps the line calm rather than spiky.
  let line = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    line += ` C${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ice-azure)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--ice-azure)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <motion.path
        d={line}
        fill="none"
        stroke="var(--ice-azure)"
        strokeWidth="1.25"
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* MiniBars — seven-day activity strip                                        */
/* -------------------------------------------------------------------------- */

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

export function MiniBars({
  data,
  className,
  activeIndex,
}: {
  data: number[];
  className?: string;
  activeIndex?: number;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(...data, 1);

  return (
    <div className={cn("flex items-end justify-between gap-1.5", className)}>
      {data.map((v, i) => {
        const pct = (v / max) * 100;
        const active = i === activeIndex;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-12 w-full items-end justify-center">
              <motion.div
                className={cn(
                  "w-full max-w-[7px] rounded-full",
                  active ? "bg-azure" : v > 0 ? "bg-white/25" : "bg-white/[0.07]",
                )}
                initial={{ height: reduce ? `${Math.max(pct, 6)}%` : "6%" }}
                animate={{ height: `${Math.max(pct, 6)}%` }}
                transition={{
                  duration: reduce ? 0 : 0.7,
                  ease: [0.22, 1, 0.36, 1],
                  delay: i * 0.05,
                }}
              />
            </div>
            <span className={cn("text-[10px] font-medium", active ? "text-azure" : "text-mist-dim")}>
              {DAY_INITIALS[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ElevationProfile — the shape of the day                                    */
/* -------------------------------------------------------------------------- */

export function ElevationProfile({
  track,
  height = 90,
  className,
  showBounds = true,
}: {
  track: TrackPoint[];
  height?: number;
  className?: string;
  showBounds?: boolean;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const W = 320;
  const { line, area, min, max } = elevationPath(track, W, height - (showBounds ? 16 : 0));

  if (!line) return null;

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`ele-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ice-azure)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ice-azure)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#ele-${id})`} />
        <motion.path
          d={line}
          fill="none"
          stroke="var(--ice-azure)"
          strokeWidth="1.4"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 1.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {showBounds && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between">
          {/* Labelled, so these read as bounds rather than as start/end values. */}
          <span className="tnum text-[10px] text-mist-dim">
            <span className="text-mist-dim/70">High </span>
            {Math.round(max).toLocaleString()} m
          </span>
          <span className="tnum text-[10px] text-mist-dim">
            <span className="text-mist-dim/70">Low </span>
            {Math.round(min).toLocaleString()} m
          </span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MacroBar — nutrition split                                                 */
/* -------------------------------------------------------------------------- */

export function MacroBar({
  segments,
  className,
}: {
  segments: { label: string; value: number; color: string }[];
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}
    >
      {segments.map((s) => (
        <motion.div
          key={s.label}
          initial={{ width: 0 }}
          animate={{ width: `${(s.value / total) * 100}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{ background: s.color }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MonthlyVolume — the season, month by month                                 */
/* -------------------------------------------------------------------------- */

export type VolumeMonth = {
  /** First of the month, local time. */
  date: Date;
  distanceKm: number;
  elevationM: number;
  activities: number;
};

/**
 * Two measures, TWO PLOTS — never one plot with two y-axes.
 *
 * Distance is tens of kilometres and elevation is thousands of metres, so
 * drawing both against a single frame means choosing an arbitrary alignment
 * between the two scales, and the reader sees a correlation the data never
 * claimed. Small multiples sharing ONE x-axis keep every honest comparison
 * (which month was bigger, where the season peaked) and make no dishonest one.
 *
 * One series per plot, so neither needs a legend — the label above it names it.
 * Selecting a month highlights it in BOTH plots, which is the whole reason the
 * two are stacked and share a month axis rather than sitting in separate cards.
 */
/**
 * One plot of the pair.
 *
 * Declared at module scope, NOT inside `MonthlyVolume`. A component defined in
 * another component's body is a new type on every render, so React unmounts and
 * remounts the whole subtree each time state changes — which replayed the grow-in
 * animation on every tap and left the just-clicked button detached, so a second
 * tap on the same month never registered and the selection could not be cleared.
 */
function VolumePlot({
  values,
  max,
  selected,
  onSelect,
  reduce,
}: {
  values: number[];
  max: number;
  selected: number;
  onSelect(i: number): void;
  reduce: boolean;
}) {
  return (
    <div className="flex h-[54px] items-end gap-[2px]">
      {values.map((v, i) => {
        const pct = max > 0 ? (v / max) * 100 : 0;
        const on = i === selected;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            /* The hit area is the whole column including its 2px gap, so a
               thumb never has to find a 6px bar. */
            className="flex h-full flex-1 items-end justify-center"
          >
            <motion.span
              className={cn(
                /* Capped, not slot-filling: a bar that fills its band reads as a
                   solid block and loses the rhythm of the months. */
                "w-full max-w-[14px] rounded-t-[3px]",
                on ? "bg-azure" : v > 0 ? "bg-white/22" : "bg-white/[0.06]",
              )}
              initial={{ height: reduce ? `${Math.max(pct, 3)}%` : "3%" }}
              animate={{ height: `${Math.max(pct, 3)}%` }}
              transition={{
                duration: reduce ? 0 : 0.6,
                ease: [0.22, 1, 0.36, 1],
                delay: reduce ? 0 : i * 0.035,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

export function MonthlyVolume({
  months,
  className,
}: {
  months: VolumeMonth[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState<number | null>(null);

  if (months.length === 0) return null;

  const maxKm = Math.max(...months.map((m) => m.distanceKm), 1);
  const maxM = Math.max(...months.map((m) => m.elevationM), 1);
  // The tallest month is worth naming outright; every other value is one tap
  // away. A number above every bar is noise nobody reads.
  const peak = months.reduce((b, m, i) => (m.distanceKm > months[b].distanceKm ? i : b), 0);
  const shown = sel ?? peak;
  const active = months[shown];
  /* Tapping the selected month again clears the selection and returns the
     readout to the biggest month. */
  const pick = (i: number) => setSel((cur) => (cur === i ? null : i));

  return (
    <div className={cn("select-none", className)}>
      {/* The reading for whichever month is selected. Values live in text, not
          only in a tooltip, so nothing is reachable by hover alone. */}
      <div className="flex items-baseline justify-between">
        <p className="text-[11.5px] text-mist-dim">
          {active.date.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          {sel === null && <span className="ml-1.5 text-white/30">·&nbsp;biggest month</span>}
        </p>
        <p className="tnum text-[11.5px] text-mist">
          {active.activities === 0
            ? "nothing recorded"
            : `${fmtDistance(active.distanceKm, 0)} km · ${fmtElevation(active.elevationM)} m`}
        </p>
      </div>

      <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-mist-dim">Distance</p>
      <VolumePlot
        values={months.map((m) => m.distanceKm)}
        max={maxKm}
        selected={shown}
        onSelect={pick}
        reduce={!!reduce}
      />

      <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-mist-dim">Elevation gain</p>
      <VolumePlot
        values={months.map((m) => m.elevationM)}
        max={maxM}
        selected={shown}
        onSelect={pick}
        reduce={!!reduce}
      />

      {/* One shared month axis under both plots — the reason they are stacked. */}
      <div className="mt-1.5 flex gap-[2px]">
        {months.map((m, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 text-center text-[9px]",
              i === shown ? "text-azure" : "text-white/25",
            )}
          >
            {m.date.toLocaleDateString(undefined, { month: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}
