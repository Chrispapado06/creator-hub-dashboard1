import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { elevationPath } from "@/lib/geo";
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
