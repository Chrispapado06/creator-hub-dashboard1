import { motion, useReducedMotion } from "framer-motion";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { hashSeed, trackToPath } from "@/lib/geo";
import type { TrackPoint } from "@/types";

/**
 * ICEFALL's own topographic renderer.
 *
 * Rather than embed a map vendor — whose default styling would fight the brand
 * and whose key would have to ship — the route is drawn over generated contour
 * lines. `TrackPoint.x/y` are already normalised, so swapping in a real
 * provider later means replacing this component and nothing else.
 */

interface RouteMapProps {
  track: TrackPoint[];
  className?: string;
  /** Fraction of the track completed, 0–1. Drives the live-tracking marker. */
  progress?: number;
  showMarkers?: boolean;
  animate?: boolean;
  seed?: string;
  /** Contour density. Fewer lines reads calmer on small cards. */
  detail?: "low" | "high";
}

const W = 320;
const H = 320;

/** Deterministic contour rings — concentric, irregular, like real terrain. */
function useContours(seed: string, detail: "low" | "high") {
  return useMemo(() => {
    let a = hashSeed(seed) >>> 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const rings: { d: string; opacity: number }[] = [];
    const count = detail === "high" ? 9 : 5;
    // Two summits give the terrain a believable saddle.
    const centres = [
      { cx: W * (0.34 + rand() * 0.1), cy: H * (0.3 + rand() * 0.12) },
      { cx: W * (0.68 + rand() * 0.08), cy: H * (0.52 + rand() * 0.12) },
    ];

    const SEGS = 16;

    for (const centre of centres) {
      const wobble = Array.from({ length: SEGS }, () => 0.72 + rand() * 0.56);
      for (let r = 0; r < count; r++) {
        const radius = 22 + r * (detail === "high" ? 17 : 26);

        const pts = Array.from({ length: SEGS }, (_, i) => {
          const ang = (i / SEGS) * Math.PI * 2;
          const rr = radius * wobble[i];
          return {
            x: centre.cx + Math.cos(ang) * rr * 1.18,
            y: centre.cy + Math.sin(ang) * rr * 0.82,
          };
        });

        // Quadratic curves through edge midpoints: a closed, smooth contour.
        // Straight segments read as polygons once the map fills the screen.
        const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        });

        const first = mid(pts[SEGS - 1], pts[0]);
        let d = `M${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
        for (let i = 0; i < SEGS; i++) {
          const cp = pts[i];
          const end = mid(pts[i], pts[(i + 1) % SEGS]);
          d += ` Q${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
        }

        rings.push({ d: `${d} Z`, opacity: 0.05 + (count - r) * 0.007 });
      }
    }
    return rings;
  }, [seed, detail]);
}

export function RouteMap({
  track,
  className,
  progress = 1,
  showMarkers = true,
  animate = true,
  seed = "icefall",
  detail = "high",
}: RouteMapProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const contours = useContours(seed, detail);

  const path = useMemo(() => trackToPath(track, W, H, 26), [track]);

  const clamped = Math.max(0, Math.min(1, progress));
  const head = track[Math.min(track.length - 1, Math.round(clamped * (track.length - 1)))];
  const start = track[0];

  const toPx = (p: TrackPoint) => ({
    x: 26 + p.x * (W - 52),
    y: 26 + p.y * (H - 52),
  });

  return (
    <div className={cn("relative overflow-hidden bg-obsidian", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ice-slate)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--ice-obsidian)" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} fill={`url(#fade-${id})`} />

        {/* Contour lines */}
        <g fill="none" stroke="var(--ice-snow)" strokeWidth="0.6">
          {contours.map((c, i) => (
            <path key={i} d={c.d} strokeOpacity={c.opacity} />
          ))}
        </g>

        {/* Route — laid under the travelled portion so the trace reads as progress */}
        <path
          d={path}
          fill="none"
          stroke="var(--ice-snow)"
          strokeOpacity="0.16"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <motion.path
          d={path}
          fill="none"
          stroke="var(--ice-azure)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow-${id})`}
          initial={{ pathLength: animate && !reduce ? 0 : clamped }}
          animate={{ pathLength: clamped }}
          transition={{ duration: reduce ? 0 : 1.6, ease: [0.22, 1, 0.36, 1] }}
        />

        {showMarkers && start && (
          <circle
            cx={toPx(start).x}
            cy={toPx(start).y}
            r="3.5"
            fill="var(--ice-obsidian)"
            stroke="var(--ice-snow)"
            strokeWidth="1.5"
          />
        )}
        {showMarkers && head && (
          // Pulse via transform, not by animating `r` — animating an SVG
          // geometry attribute makes framer-motion emit `r: "undefined"` on the
          // first frame, which the browser rejects.
          <g transform={`translate(${toPx(head).x.toFixed(2)} ${toPx(head).y.toFixed(2)})`}>
            <motion.circle
              r={7}
              fill="var(--ice-azure)"
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ scale: 1, opacity: 0.22 }}
              animate={
                reduce
                  ? { scale: 1, opacity: 0.18 }
                  : { scale: [1, 1.85, 1], opacity: [0.22, 0, 0.22] }
              }
              transition={{ duration: 2.4, repeat: reduce ? 0 : Infinity, ease: "easeOut" }}
            />
            <circle r={4} fill="var(--ice-azure)" stroke="var(--ice-obsidian)" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    </div>
  );
}
