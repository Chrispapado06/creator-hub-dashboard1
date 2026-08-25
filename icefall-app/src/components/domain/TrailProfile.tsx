import { useId } from "react";
import type { Elevation, Segment } from "@/services/trailProfile";
import { fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The two things a walker reads before committing to a route: what the ground
 * does vertically, and what it is made of.
 *
 * Both are drawn from computed data — see `trailProfile.ts` — and both say so.
 * The profile is deliberately not interactive: there is no hover on a phone,
 * and a chart that needs a mouse to be readable is a chart that fails outdoors.
 */

export function ElevationProfile({
  elevation,
  lengthKm,
  className,
}: {
  elevation: Elevation;
  lengthKm: number;
  className?: string;
}) {
  const gradientId = useId();
  const { points, highestM, lowestM } = elevation;

  const W = 320;
  const H = 88;
  // A flat walk should look flat, not like a mountain range: the vertical scale
  // is padded so a 20 m undulation cannot fill the frame and read as a climb.
  const span = Math.max(highestM - lowestM, 50);
  const base = lowestM - (span - (highestM - lowestM)) / 2;

  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (m: number) => H - ((m - base) / span) * H;

  const line = points.map((m, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(m).toFixed(1)}`).join("");
  const area = `${line}L${W},${H}L0,${H}Z`;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[88px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Elevation from ${lowestM} to ${highestM} metres over ${lengthKm.toFixed(1)} kilometres`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ice-azure)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ice-azure)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--ice-azure)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-mist-dim">
        <span className="tnum">0 km</span>
        <span className="tnum">
          {fmtElevation(lowestM)}–{fmtElevation(highestM)} m
        </span>
        <span className="tnum">{lengthKm.toFixed(1)} km</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Colours carry meaning here, so they are fixed per class rather than cycled:
 * azure is the good stuff underfoot, grey is tarmac, and "Unrecorded" is
 * deliberately the flattest, dimmest band on the bar — it is an absence of data,
 * not a kind of ground, and it must never look like a finding.
 */
const TONE: Record<string, string> = {
  path: "bg-azure",
  natural: "bg-azure",
  track: "bg-azure/60",
  gravel: "bg-azure/60",
  rock: "bg-mist",
  road: "bg-mist-dim",
  paved: "bg-mist-dim",
  other: "bg-white/10",
};

export function BreakdownBar({
  title,
  segments,
  className,
}: {
  title: string;
  segments: Segment[];
  className?: string;
}) {
  if (segments.length === 0) return null;
  return (
    <div className={className}>
      <p className="section-label text-mist">{title}</p>
      <div className="mt-2.5 flex h-2 overflow-hidden rounded-pill bg-slate">
        {segments.map((s) => (
          <span
            key={s.key}
            className={cn("h-full", TONE[s.key] ?? "bg-white/10")}
            style={{ width: `${s.share * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] text-mist">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE[s.key] ?? "bg-white/10")} />
            {s.label}
            <span className="tnum text-mist-dim">{Math.round(s.share * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
