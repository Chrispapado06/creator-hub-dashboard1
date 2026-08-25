import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { trailGeometry, type LatLon } from "@/services/trails";

/**
 * The trail's actual line, drawn.
 *
 * This is the one thing ICEFALL could not honestly put on a card before: its
 * own twelve routes have no GPX, so `MiniMap` deliberately shows the place and
 * no path. An OSM route relation DOES carry geometry, so here the line is the
 * real one — every bend is where the trail bends.
 */

/** Equirectangular projection, which is exact enough over a single trail. */
/**
 * `bounds` lets several segments share one frame. Without it each would be
 * stretched to its own extent and the pieces of one trail would not align.
 */
function project(line: LatLon[], w: number, h: number, pad: number, bounds?: LatLon[]) {
  const frame = bounds ?? line;
  const lats = frame.map((p) => p.lat);
  const lons = frame.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLon - minLon) * k, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);

  // One scale for both axes, so the shape is the trail's shape and not a
  // stretched version of it.
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;

  return line.map((p) => ({
    x: offX + (p.lon - minLon) * k * scale,
    // SVG y grows downward; north should be up.
    y: offY + (maxLat - p.lat) * scale,
  }));
}

export function TrailShape({
  line,
  segments,
  width = 56,
  height = 56,
  className,
  showEnds = false,
}: {
  line: LatLon[];
  /**
   * The route as separate member ways, when they are known.
   *
   * Drawn as distinct strokes so a gap between two ways stays a gap. Joining
   * them would draw a straight line across country the trail does not go.
   */
  segments?: LatLon[][];
  width?: number;
  height?: number;
  className?: string;
  showEnds?: boolean;
}) {
  // All segments are projected against the SAME bounds, or each would be scaled
  // to its own extent and the pieces would not line up.
  const extra = useMemo(() => {
    if (!segments?.length) return [];
    const all = segments.flat();
    return segments
      .filter((seg) => seg.length > 1)
      .map((seg) => project(seg, width, height, showEnds ? 10 : 6, all));
  }, [segments, width, height, showEnds]);

  const points = useMemo(
    () => (line.length > 1 ? project(line, width, height, showEnds ? 10 : 6) : []),
    [line, width, height, showEnds],
  );
  if (points.length < 2 && extra.length === 0) return null;

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Segments win when present — they keep the gaps between member ways honest.
  const paths = extra.length ? extra.map(toPath) : [toPath(points)];
  const ends = extra.length ? extra[0] : points;
  const start = ends[0];
  const end = ends[ends.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      {/* A dark under-stroke, so the line stays readable over a map or a photo. */}
      {paths.map((path, i) => (
        <path key={`u${i}`} d={path} fill="none" stroke="var(--ice-obsidian)" strokeOpacity="0.65"
              strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {paths.map((path, i) => (
        <path key={`o${i}`} d={path} fill="none" stroke="var(--ice-azure)" strokeWidth={1.6}
              strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {showEnds && (
        <>
          <circle cx={start.x} cy={start.y} r={3.2} fill="var(--ice-azure)"
                  stroke="var(--ice-obsidian)" strokeWidth={1.4} />
          <circle cx={end.x} cy={end.y} r={3.2} fill="var(--ice-snow)"
                  stroke="var(--ice-obsidian)" strokeWidth={1.4} />
        </>
      )}
    </svg>
  );
}

/**
 * Loads the geometry for a trail.
 *
 * Deliberately does NOT run on a list: one relation is a few hundred kilobytes,
 * so twelve cards fetching their own line is thirty megabytes. Cards get the
 * location; the page gets the line.
 */
export function useTrailLine(osmId: number | undefined, enabled = true) {
  const [line, setLine] = useState<LatLon[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!osmId || !enabled) return;
    let live = true;
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);

    trailGeometry(osmId)
      .then((l) => {
        if (live) setLine(l);
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
      ctrl.abort();
    };
  }, [osmId, enabled]);

  return { line, loading, failed };
}
