import { useId, useMemo, useRef, useState } from "react";
import type { SeriesKind, SeriesPoint } from "@/tracking/analysis";
import { SERIES_UNIT } from "@/tracking/analysis";
import { cn } from "@/lib/utils";

/**
 * The chart you drag, and the readout that follows your finger.
 *
 * The point of this component is the CURSOR, not the curve: the whole analysis
 * experience is "put your finger at 8.4 km and see where you were, how high,
 * how fast". So it reports the hovered point upward and the detail screen moves
 * the map to it — one shared cursor across every series and the map, rather
 * than four charts that each know only about themselves.
 *
 * Pointer events, not mouse or touch: one code path that works with a finger,
 * a trackpad and a stylus, and `setPointerCapture` so a drag that leaves the
 * chart keeps tracking instead of stopping at the edge.
 */

export function AnalysisChart({
  series,
  kind,
  cursorDistanceM,
  onCursor,
  height = 132,
  className,
}: {
  series: SeriesPoint[];
  kind: SeriesKind;
  /** Shared across charts and the map. Null when nothing is being pointed at. */
  cursorDistanceM: number | null;
  onCursor: (distanceM: number | null) => void;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();
  const host = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const W = 320;
  const H = height;

  const { path, area, minV, maxV, totalM } = useMemo(() => {
    if (series.length < 2) {
      return { path: "", area: "", minV: 0, maxV: 0, totalM: 0 };
    }
    const total = series[series.length - 1].distanceM || 1;
    const values = series.map((s) => s.value);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    // A flat series must look flat, not like a mountain range.
    if (hi - lo < 1e-6) {
      hi = lo + 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    // Pace reads better inverted — faster is higher on the chart.
    const invert = kind === "pace";
    const x = (d: number) => (d / total) * W;
    const y = (v: number) => {
      const t = (v - lo) / (hi - lo);
      return invert ? t * H : H - t * H;
    };

    const d = series
      .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.distanceM).toFixed(1)},${y(s.value).toFixed(1)}`)
      .join("");
    return { path: d, area: `${d}L${W},${H}L0,${H}Z`, minV: lo, maxV: hi, totalM: total };
  }, [series, kind, H]);

  if (series.length < 2) return null;

  const toDistance = (clientX: number): number => {
    const rect = host.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * totalM;
  };

  const cursorX =
    cursorDistanceM !== null && totalM > 0
      ? Math.min(W, Math.max(0, (cursorDistanceM / totalM) * W))
      : null;

  const hovered =
    cursorDistanceM === null
      ? null
      : series.reduce((best, s) =>
          Math.abs(s.distanceM - cursorDistanceM) < Math.abs(best.distanceM - cursorDistanceM)
            ? s
            : best,
        );

  const stroke =
    kind === "heartRate"
      ? "var(--ice-danger)"
      : kind === "pace"
        ? "var(--ice-summit)"
        : "var(--ice-azure)";

  return (
    <div className={className}>
      <div
        ref={host}
        className="relative touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          onCursor(toDistance(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          onCursor(toDistance(e.clientX));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: H }}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${kind} across the activity`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {cursorX !== null && (
            <line
              x1={cursorX}
              y1={0}
              x2={cursorX}
              y2={H}
              stroke="var(--ice-snow)"
              strokeWidth="1"
              strokeOpacity="0.55"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* The readout rides above the line rather than in a tooltip that a
            finger would cover. */}
        {hovered && (
          <div className="pointer-events-none absolute right-0 top-0 rounded-tile border border-hairline bg-obsidian/85 px-2 py-1 backdrop-blur">
            <span className="tnum text-[12px] text-snow">
              {formatValue(hovered.value, kind)}
              <span className="text-[10px] text-mist-dim"> {SERIES_UNIT[kind]}</span>
            </span>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-mist-dim">
        <span className="tnum">0 km</span>
        <span className="tnum">
          {formatValue(minV, kind)}–{formatValue(maxV, kind)} {SERIES_UNIT[kind]}
        </span>
        <span className="tnum">{(totalM / 1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}

export function formatValue(v: number, kind: SeriesKind): string {
  if (kind === "pace") {
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (kind === "gradient") return v.toFixed(1);
  return Math.round(v).toLocaleString("en-GB");
}

/** The strip of series toggles above the chart. */
export function SeriesTabs({
  available,
  value,
  onChange,
}: {
  available: SeriesKind[];
  value: SeriesKind;
  onChange: (k: SeriesKind) => void;
}) {
  const LABEL: Record<SeriesKind, string> = {
    elevation: "Elevation",
    pace: "Pace",
    heartRate: "Heart rate",
    gradient: "Gradient",
  };
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
      {available.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            "shrink-0 rounded-pill border px-3.5 py-1.5 text-[12px] transition-colors",
            value === k
              ? "border-azure/55 bg-azure/[0.12] text-azure"
              : "border-hairline-strong text-mist hover:text-snow",
          )}
        >
          {LABEL[k]}
        </button>
      ))}
    </div>
  );
}
