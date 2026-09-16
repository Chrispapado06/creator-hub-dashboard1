/**
 * THE PLOT — the arithmetic behind the Map tab's drawing (plan §3.3, §4.6).
 *
 * There is no basemap here and there cannot be one yet: every tile service the
 * app uses forbids saving an area (plan §4.2), and the compliant answer — map
 * packs built from OpenStreetMap data and served from ICEFALL's own site — is
 * not built. So this draws only what ICEFALL genuinely holds: your fix, the
 * recorded summit and huts, the pins you added yourself, and the breadcrumbs of
 * where ICEFALL was open and watching. No tile is ever requested.
 *
 * Deliberately not Mapbox. Mapbox bills per map opening, and a tab somebody
 * switches to forty times a day is not the place for it (plan §4.5).
 *
 * The projection is a local flat one about the view's own centre. Over the few
 * kilometres a plot like this covers, the error is far below the error in the
 * GPS fix it is drawing. North is up and stays up: at walking speed a phone's
 * heading is drift, so turning the world with it turns it at random.
 *
 * Pure arithmetic. No React, no network, no clock.
 */

export interface PlotPoint {
  lat: number;
  lon: number;
}

export interface PlotXY {
  x: number;
  y: number;
}

/** What is drawn, and at what scale. Pixels are CSS pixels of the drawing box. */
export interface PlotView {
  centre: PlotPoint;
  metresPerPixel: number;
  width: number;
  height: number;
}

export const M_PER_DEG_LAT = 111_320;

/** Closer than this and the plot is drawing GPS noise; wider and it is a country. */
export const MIN_METRES_PER_PIXEL = 0.5;
export const MAX_METRES_PER_PIXEL = 2000;

/** The smallest ground width a fitted view shows, so one lone point is not infinite zoom. */
export const MIN_SPAN_M = 400;

export const NO_BASEMAP =
  "There is no map behind this. It draws only what ICEFALL holds: your position, the recorded huts and camps, anything you pinned, and where you walked with ICEFALL open.";

export const NORTH_IS_UP = "North is up. The plot does not turn with your phone.";

export function metresPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Degrees east of the centre, wrapped, so a plot near the date line does not fly apart. */
function lonDelta(lon: number, centreLon: number): number {
  let d = lon - centreLon;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function clampMetresPerPixel(mpp: number): number {
  if (!Number.isFinite(mpp) || mpp <= 0) return MIN_METRES_PER_PIXEL;
  return Math.min(MAX_METRES_PER_PIXEL, Math.max(MIN_METRES_PER_PIXEL, mpp));
}

export function toXY(view: PlotView, p: PlotPoint): PlotXY {
  const mppLon = metresPerDegLon(view.centre.lat);
  return {
    x: view.width / 2 + (lonDelta(p.lon, view.centre.lon) * mppLon) / view.metresPerPixel,
    y: view.height / 2 - ((p.lat - view.centre.lat) * M_PER_DEG_LAT) / view.metresPerPixel,
  };
}

export function fromXY(view: PlotView, xy: PlotXY): PlotPoint {
  const mppLon = metresPerDegLon(view.centre.lat);
  return {
    lat: view.centre.lat + ((view.height / 2 - xy.y) * view.metresPerPixel) / M_PER_DEG_LAT,
    lon: view.centre.lon + ((xy.x - view.width / 2) * view.metresPerPixel) / mppLon,
  };
}

export interface FitOptions {
  width: number;
  height: number;
  /** Kept clear at every edge, so a hut label is never half off the plot. */
  paddingPx?: number;
  minSpanM?: number;
}

/** A view holding every point, or null when there is nothing to draw. */
export function fitView(points: readonly PlotPoint[], opts: FitOptions): PlotView | null {
  const { width, height, paddingPx = 40, minSpanM = MIN_SPAN_M } = opts;
  if (!points.length || width <= 0 || height <= 0) return null;

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const centre = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };

  const usableW = Math.max(1, width - 2 * paddingPx);
  const usableH = Math.max(1, height - 2 * paddingPx);
  const spanXm = Math.abs(lonDelta(maxLon, minLon)) * metresPerDegLon(centre.lat);
  const spanYm = (maxLat - minLat) * M_PER_DEG_LAT;

  const mpp = Math.max(spanXm / usableW, spanYm / usableH, minSpanM / Math.min(width, height));
  return { centre, metresPerPixel: clampMetresPerPixel(mpp), width, height };
}

/** Factor above 1 zooms in. The centre stays put. */
export function zoomView(view: PlotView, factor: number): PlotView {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  return { ...view, metresPerPixel: clampMetresPerPixel(view.metresPerPixel / factor) };
}

/** Drag the ground by (dx, dy) pixels: the centre moves the other way. */
export function panView(view: PlotView, dxPx: number, dyPx: number): PlotView {
  const centre = fromXY(view, { x: view.width / 2 - dxPx, y: view.height / 2 - dyPx });
  return { ...view, centre };
}

export function centreView(view: PlotView, p: PlotPoint): PlotView {
  return { ...view, centre: { lat: p.lat, lon: p.lon } };
}

export function resizeView(view: PlotView, width: number, height: number): PlotView {
  if (width <= 0 || height <= 0) return view;
  return { ...view, width, height };
}

export function isOnCanvas(view: PlotView, xy: PlotXY, marginPx = 0): boolean {
  return (
    xy.x >= -marginPx && xy.x <= view.width + marginPx && xy.y >= -marginPx && xy.y <= view.height + marginPx
  );
}

/** Round ground distances a scale bar is allowed to use. */
const SCALE_STEPS_M = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];

export interface ScaleBar {
  metres: number;
  px: number;
  label: string;
}

/** The longest round distance that fits in `maxPx`, with its own label. */
export function scaleBar(view: PlotView, maxPx = 140): ScaleBar {
  let chosen = SCALE_STEPS_M[0];
  for (const step of SCALE_STEPS_M) {
    if (step / view.metresPerPixel <= maxPx) chosen = step;
  }
  const px = chosen / view.metresPerPixel;
  return { metres: chosen, px, label: chosen >= 1000 ? `${chosen / 1000} km` : `${chosen} m` };
}

export interface ScaleTick {
  /** Pixels from the left end of the bar. */
  px: number;
  label: string;
}

export interface TickedScaleBar extends ScaleBar {
  /** Three ticks — start, middle, end — the last one carrying the unit. */
  ticks: ScaleTick[];
}

/**
 * The same bar, divided so it can be read rather than measured: `0  1  2 km`
 * (mockup §6). The distances are the ones `scaleBar` already chose, so the
 * drawing and the numbers cannot drift apart.
 */
export function scaleBarTicks(view: PlotView, maxPx = 140): TickedScaleBar {
  const bar = scaleBar(view, maxPx);
  const km = bar.metres >= 1000;
  const unit = km ? "km" : "m";
  const number = (metres: number): string => {
    const v = km ? metres / 1000 : metres;
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(1)));
  };
  const stops = [0, bar.metres / 2, bar.metres];
  return {
    ...bar,
    ticks: stops.map((metres, i) => ({
      px: (metres / bar.metres) * bar.px,
      label: i === stops.length - 1 ? `${number(metres)} ${unit}` : number(metres),
    })),
  };
}

export interface TrackArrow {
  x: number;
  y: number;
  /** Degrees clockwise for an SVG `rotate`, where an unrotated mark points up. */
  angleDeg: number;
}

/**
 * Arrows along a walked track pointing BACK THE WAY YOU CAME (mockup §6,
 * retrace active). The run is oldest-first, so every arrow points from the
 * newer point towards the older one — the direction somebody retracing walks.
 *
 * Spacing is in pixels along the drawn line, so a zoomed-out track does not
 * turn into a row of arrowheads. A run with one point gets none: a single fix
 * has no direction, and inventing one would be inventing a way to walk.
 */
export function backArrows(
  view: PlotView,
  run: readonly PlotPoint[],
  spacingPx = 52,
): TrackArrow[] {
  if (run.length < 2 || spacingPx <= 0) return [];
  const xy = run.map((p) => toXY(view, p));
  const arrows: TrackArrow[] = [];
  let sinceLast = spacingPx / 2;
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1];
    const b = xy[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len === 0) continue;
    // Back the way you came: the reverse of travel.
    const angleDeg = (Math.atan2(-dx, dy) * 180) / Math.PI;
    let walked = 0;
    while (sinceLast + (len - walked) >= spacingPx) {
      walked += spacingPx - sinceLast;
      sinceLast = 0;
      const t = walked / len;
      arrows.push({ x: a.x + dx * t, y: a.y + dy * t, angleDeg });
    }
    sinceLast += len - walked;
  }
  return arrows;
}

/**
 * One unbroken run as an SVG path. Runs are never joined: a line drawn across a
 * gap in the breadcrumbs is a line across ground nobody walked (plan §3.3).
 */
export function runPath(view: PlotView, run: readonly PlotPoint[]): string {
  if (!run.length) return "";
  return run
    .map((p, i) => {
      const { x, y } = toXY(view, p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** A fix's reported accuracy as a radius in pixels, or null when it reported none. */
export function accuracyRadiusPx(view: PlotView, accuracyM: number | null): number | null {
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM <= 0) return null;
  return accuracyM / view.metresPerPixel;
}
