import type { TrackPoint } from "@/types";
import { fmtDistance, fmtDuration, fmtElevation, fmtPace } from "@/lib/format";

/**
 * ICEFALL share cards.
 *
 * Rendered to a real canvas and exported as a PNG, so what the athlete posts is
 * exactly what they previewed. Branding stays deliberately small — the point is
 * that the achievement looks good, and someone seeing it asks what the app is.
 */

export type CardStyle =
  | "transparent"
  | "transparent-light"
  | "route"
  | "classic"
  | "summit"
  | "minimal"
  | "passport"
  | "elevation"
  | "poster"
  | "light"
  | "mountain"
  | "performance"
  | "editorial";

export type CardFormat = "9:16" | "4:5" | "1:1" | "16:9";

/**
 * The ground the card is drawn on — chosen SEPARATELY from the design.
 *
 * Layout and background used to be the same choice, which meant "transparent"
 * was a design and you could not have, say, the Editorial layout on a photo.
 * Splitting them turns eleven designs × five backgrounds into a real range
 * without writing a single new layout.
 */
export type CardBackground = "photo" | "gradient" | "topographic" | "solid" | "transparent";

export const CARD_BACKGROUNDS: { id: CardBackground; label: string; note: string }[] = [
  { id: "photo", label: "Photo", note: "The mountain behind it" },
  { id: "gradient", label: "Dark gradient", note: "Obsidian, softly lit" },
  { id: "topographic", label: "Topographic", note: "Contour lines, drawn faintly" },
  { id: "solid", label: "Solid black", note: "Nothing but the type" },
  { id: "transparent", label: "Transparent", note: "Alpha — drop it over your own Story" },
];

/**
 * Grouped the way the design sheet groups them, so the picker can offer
 * All / Minimal / Summit / Passport tabs without a second list to drift.
 */
export type CardStyleGroup =
  | "transparent"
  | "cinematic"
  | "performance"
  | "route"
  | "elevation"
  | "passport"
  | "photo";

export const CARD_GROUP_LABEL: Record<CardStyleGroup, string> = {
  transparent: "Overlay",
  cinematic: "Cinematic",
  performance: "Performance",
  route: "Route",
  elevation: "Elevation",
  passport: "Passport",
  photo: "Photo",
};

export const CARD_STYLES: { id: CardStyle; label: string; note: string; group: CardStyleGroup }[] = [
  {
    id: "transparent",
    label: "Overlay · white",
    note: "White type and every figure — pair it with any background",
    group: "transparent",
  },
  {
    id: "transparent-light",
    label: "Overlay · black",
    note: "Black type, for a bright photo or the light ground",
    group: "transparent",
  },
  { id: "mountain", label: "Cinematic", note: "The peak takes the frame", group: "cinematic" },
  { id: "summit", label: "Summit", note: "The altitude, cinematic", group: "cinematic" },
  { id: "editorial", label: "Editorial", note: "Black and azure, very little else", group: "cinematic" },
  { id: "performance", label: "Performance", note: "Metrics first", group: "performance" },
  { id: "minimal", label: "Minimal dark", note: "Typography only", group: "performance" },
  { id: "light", label: "Clean light", note: "Bright, for light feeds", group: "performance" },
  { id: "route", label: "Route", note: "The line you walked, drawn large", group: "route" },
  { id: "elevation", label: "Elevation", note: "The climb, drawn", group: "elevation" },
  { id: "passport", label: "Passport", note: "A stamped page from your record", group: "passport" },
  { id: "classic", label: "Classic", note: "Photography, route and the essentials", group: "photo" },
  { id: "poster", label: "Adventure poster", note: "The mountains build you", group: "photo" },
];

export const CARD_FORMATS: { id: CardFormat; label: string; w: number; h: number }[] = [
  { id: "9:16", label: "Story", w: 1080, h: 1920 },
  { id: "4:5", label: "Portrait", w: 1080, h: 1350 },
  { id: "1:1", label: "Square", w: 1080, h: 1080 },
  { id: "16:9", label: "Wide", w: 1920, h: 1080 },
];

export interface ShareCardData {
  activityLabel: string;
  /** "Olympus, Greece" — where it happened, when that is known. */
  locationLabel?: string;
  /** Highest point reached during the activity, where altitude was recorded. */
  highestAltitudeM?: number;
  distanceKm: number;
  durationSec: number;
  elevationGainM: number;
  paceSecPerKm: number | null;
  dateLabel: string;
  track: TrackPoint[];
  athleteName?: string;
  mountainName?: string;
  mountainElevationM?: number;
  photoSrc?: string;
  simulated?: boolean;
  /** Only where the recorder actually produced them — see `drawStatGrid`. */
  caloriesKcal?: number | null;
  /** The body mass the calorie estimate used, so the card can qualify it. */
  caloriesForKg?: number;
  avgHeartRateBpm?: number | null;
}

const AZURE = "#A78B5C";
const AZURE_BRIGHT = "#C9AC7B";
const SNOW = "#E6E6E6";
const MIST = "#8A8E93";
const MIST_DIM = "#5C6066";
const OBSIDIAN = "#080B0D";

const SANS = '"Inter Tight", "Inter", system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws an image cover-style into a rect. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function scrim(ctx: CanvasRenderingContext2D, w: number, h: number, from = 0.35) {
  const g = ctx.createLinearGradient(0, h * from, 0, h);
  g.addColorStop(0, "rgba(8,11,13,0)");
  g.addColorStop(0.55, "rgba(8,11,13,0.82)");
  g.addColorStop(1, "rgba(8,11,13,0.97)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Top-edge scrim.
 *
 * The readiness card sets its objective's name and elevation over the sky, and a
 * sunlit snowfield behind mist-coloured type is unreadable. Same obsidian, same
 * idea as `.scrim-bottom` in the stylesheet, mirrored.
 */
function scrimTop(ctx: CanvasRenderingContext2D, w: number, h: number, depth = 0.42) {
  const g = ctx.createLinearGradient(0, 0, 0, h * depth);
  g.addColorStop(0, "rgba(8,11,13,0.92)");
  g.addColorStop(0.55, "rgba(8,11,13,0.66)");
  g.addColorStop(1, "rgba(8,11,13,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * depth);
}

function setFont(
  ctx: CanvasRenderingContext2D,
  {
    size,
    weight = 400,
    family = SANS,
    tracking = 0,
  }: { size: number; weight?: number; family?: string; tracking?: number },
) {
  ctx.font = `${weight} ${size}px ${family}`;
  // letterSpacing is supported in Chromium; harmless where it isn't.
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = `${tracking}px`;
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 20,
  color = MIST,
) {
  setFont(ctx, { size, weight: 500, tracking: size * 0.16 });
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), x, y);
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = "0px";
}

/**
 * Breaks `text` into at most `maxLines` lines that fit `maxWidth`.
 *
 * Used by the readiness card, where the provenance and the reason a figure is
 * missing are the two things that MUST survive to the exported image. A
 * single-line fillText would silently run off the edge of a 1080 px card and
 * take the caveat with it, which is precisely the failure this card cannot
 * afford. Anything past `maxLines` is elided rather than dropped in silence.
 *
 * Assumes the font is already set, because measurement depends on it.
 */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  // Anything that did not fit is marked, never dropped without a trace.
  const consumed = lines.join(" ").length;
  if (consumed < text.replace(/\s+/g, " ").trim().length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:]$/, "")}…`;
  }

  return lines;
}

/** Wrapped text growing DOWNWARDS from `y`. Returns the last baseline used. */
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
): number {
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + Math.max(0, lines.length - 1) * lineHeight;
}

/**
 * Wrapped text whose LAST line sits on `bottom`, growing upwards.
 *
 * Bottom-anchored layouts need this: a mountain name that wraps to two lines
 * must push the caption up rather than push itself down into the figure below
 * it. Returns the first line's baseline so the caller can keep stacking upwards.
 */
function drawWrappedUp(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  bottom: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
): number {
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  const top = bottom - Math.max(0, lines.length - 1) * lineHeight;
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight));
  return top;
}

/** The ICEFALL mark, drawn as vectors so it stays crisp at any size. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color = SNOW) {
  const s = w / 64;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(1.5, 35.5);
  ctx.lineTo(14, 18);
  ctx.lineTo(20.5, 25.5);
  ctx.lineTo(32, 4);
  ctx.lineTo(43.5, 20.5);
  ctx.lineTo(49.5, 13.5);
  ctx.lineTo(62.5, 35.5);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(27.2, 12.6);
  ctx.lineTo(30, 11.4);
  ctx.lineTo(32.6, 13.4);
  ctx.lineTo(35.1, 11.2);
  ctx.lineTo(37, 13);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawWordmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color = SNOW,
) {
  setFont(ctx, { size, weight: 300, tracking: size * 0.36 });
  ctx.fillStyle = color;
  ctx.fillText("ICEFALL", x, y);
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = "0px";
}

/** Draws the route inside a box, preserving aspect. */
function drawRoute(
  ctx: CanvasRenderingContext2D,
  track: TrackPoint[],
  x: number,
  y: number,
  w: number,
  h: number,
  color = AZURE,
  width = 6,
) {
  if (track.length < 2) return;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of track) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(w / spanX, h / spanY) * 0.9;
  const offX = x + (w - spanX * scale) / 2;
  const offY = y + (h - spanY * scale) / 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(167,139,92,0.55)";
  ctx.shadowBlur = width * 2.5;
  ctx.beginPath();
  track.forEach((p, i) => {
    const px = offX + (p.x - minX) * scale;
    const py = offY + (p.y - minY) * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();

  // Start and finish markers.
  const pt = (p: TrackPoint) => ({
    x: offX + (p.x - minX) * scale,
    y: offY + (p.y - minY) * scale,
  });
  const a = pt(track[0]);
  const b = pt(track[track.length - 1]);

  ctx.fillStyle = OBSIDIAN;
  ctx.strokeStyle = SNOW;
  ctx.lineWidth = width * 0.55;
  ctx.beginPath();
  ctx.arc(a.x, a.y, width * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, width * 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/* -------------------------------------------------------------------------- */
/* Layouts                                                                     */
/* -------------------------------------------------------------------------- */

interface Ctx {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  d: ShareCardData;
  photo: HTMLImageElement | null;
  bg?: CardBackground;
}

const PAD = 84;

/**
 * Takes the drawing surface rather than a whole `Ctx` so both card families —
 * activity and readiness — share one stat row. Two implementations of the same
 * row is how the two would slowly stop looking like the same product.
 */
function statRow(
  { ctx, W }: { ctx: CanvasRenderingContext2D; W: number },
  items: { value: string; unit?: string; label: string }[],
  y: number,
  size = 54,
) {
  const cols = items.length;
  const colW = (W - PAD * 2) / cols;
  items.forEach((it, i) => {
    const x = PAD + i * colW;
    setFont(ctx, { size, weight: 300 });
    ctx.fillStyle = SNOW;
    const valW = ctx.measureText(it.value).width;
    ctx.fillText(it.value, x, y);
    if (it.unit) {
      setFont(ctx, { size: size * 0.4 });
      ctx.fillStyle = MIST;
      ctx.fillText(it.unit, x + valW + 8, y);
    }
    label(ctx, it.label, x, y + size * 0.62, size * 0.26);
  });
}

function drawClassic(c: Ctx) {
  const { ctx, W, H, d, photo } = c;
  /*
   * The BACKGROUND owns this layer, not the layout.
   *
   * These designs used to paint a full-bleed photograph here unconditionally,
   * which drew straight over whatever ground the athlete had chosen — pick
   * "Topographic" or "Transparent" on a photo layout and the export came back
   * byte-for-byte identical. `paintBackground` already draws the photo when
   * that is the choice, so the layout must not draw it a second time.
   */
  paintBackground(ctx, W, H, c.bg ?? "photo", c.photo);
  scrim(ctx, W, H, 0.18);

  drawMark(ctx, PAD, PAD, 58);
  drawWordmark(ctx, PAD + 76, PAD + 34, 30);

  const baseY = H - PAD - 200;
  drawRoute(ctx, d.track, W - PAD - 300, baseY - 340, 300, 300, AZURE, 6);

  label(ctx, d.activityLabel, PAD, baseY - 40, 24);
  setFont(ctx, { size: 132, weight: 200 });
  ctx.fillStyle = SNOW;
  ctx.fillText(fmtDistance(d.distanceKm), PAD, baseY + 90);
  const w = ctx.measureText(fmtDistance(d.distanceKm)).width;
  setFont(ctx, { size: 44, weight: 300 });
  ctx.fillStyle = MIST;
  ctx.fillText("KM", PAD + w + 16, baseY + 90);

  statRow(
    c,
    [
      { value: `+${fmtElevation(d.elevationGainM)}`, unit: "m", label: "Ascent" },
      { value: fmtDuration(d.durationSec), label: "Time" },
      ...(d.paceSecPerKm ? [{ value: fmtPace(d.paceSecPerKm), unit: "/km", label: "Pace" }] : []),
    ],
    H - PAD - 40,
    46,
  );
}

function drawMinimal(c: Ctx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  label(ctx, d.activityLabel, PAD, PAD + 40, 26);

  let y = H * 0.34;
  setFont(ctx, { size: 168, weight: 200 });
  ctx.fillStyle = SNOW;
  ctx.fillText(fmtDistance(d.distanceKm), PAD, y);
  const w = ctx.measureText(fmtDistance(d.distanceKm)).width;
  setFont(ctx, { size: 56, weight: 300 });
  ctx.fillStyle = MIST;
  ctx.fillText("KM", PAD + w + 20, y);

  y += 130;
  setFont(ctx, { size: 76, weight: 200 });
  ctx.fillStyle = AZURE;
  ctx.fillText(`+${fmtElevation(d.elevationGainM)} M`, PAD, y);

  y += 100;
  setFont(ctx, { size: 76, weight: 200 });
  ctx.fillStyle = SNOW;
  ctx.fillText(fmtDuration(d.durationSec), PAD, y);

  if (d.paceSecPerKm) {
    y += 100;
    ctx.fillStyle = MIST;
    ctx.fillText(`${fmtPace(d.paceSecPerKm)} /KM`, PAD, y);
  }

  drawMark(ctx, PAD, H - PAD - 60, 48);
  drawWordmark(ctx, PAD + 64, H - PAD - 32, 24, MIST);
}

function drawMountain(c: Ctx) {
  const { ctx, W, H, d, photo } = c;
  /*
   * The BACKGROUND owns this layer, not the layout.
   *
   * These designs used to paint a full-bleed photograph here unconditionally,
   * which drew straight over whatever ground the athlete had chosen — pick
   * "Topographic" or "Transparent" on a photo layout and the export came back
   * byte-for-byte identical. `paintBackground` already draws the photo when
   * that is the choice, so the layout must not draw it a second time.
   */
  paintBackground(ctx, W, H, c.bg ?? "photo", c.photo);
  scrim(ctx, W, H, 0.1);

  const title = (d.mountainName ?? d.activityLabel).toUpperCase();
  setFont(ctx, { size: 62, weight: 300, tracking: 8 });
  ctx.fillStyle = SNOW;
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, PAD + 110);
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = "0px";

  if (d.mountainElevationM) {
    setFont(ctx, { size: 38, weight: 300 });
    ctx.fillStyle = AZURE;
    ctx.fillText(`${fmtElevation(d.mountainElevationM)} m`, W / 2, PAD + 168);
  }
  ctx.textAlign = "left";

  drawRoute(ctx, d.track, W / 2 - 220, H * 0.3, 440, 440, AZURE_BRIGHT, 7);

  const y = H - PAD - 150;
  statRow(
    c,
    [
      { value: fmtDistance(d.distanceKm), unit: "km", label: "Distance" },
      { value: `+${fmtElevation(d.elevationGainM)}`, unit: "m", label: "Ascent" },
      { value: fmtDuration(d.durationSec), label: "Time" },
    ],
    y,
    50,
  );

  ctx.textAlign = "center";
  drawMark(ctx, W / 2 - 26, H - PAD - 54, 52);
  ctx.textAlign = "left";
}

function drawPerformance(c: Ctx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  // Faint route behind the numbers.
  ctx.globalAlpha = 0.16;
  drawRoute(ctx, d.track, W - 460, H * 0.06, 420, 420, AZURE, 5);
  ctx.globalAlpha = 1;

  label(ctx, d.activityLabel, PAD, PAD + 44, 26);
  label(ctx, d.dateLabel, PAD, PAD + 84, 22);

  const rows: { v: string; u: string; l: string }[] = [
    { v: fmtDistance(d.distanceKm), u: "KM", l: "Distance" },
    { v: `+${fmtElevation(d.elevationGainM)}`, u: "M", l: "Ascent" },
    { v: fmtDuration(d.durationSec), u: "", l: "Moving time" },
  ];
  if (d.paceSecPerKm) rows.push({ v: fmtPace(d.paceSecPerKm), u: "/KM", l: "Average pace" });

  let y = H * 0.32;
  const gap = Math.min(190, (H * 0.55) / rows.length);
  for (const r of rows) {
    label(ctx, r.l, PAD, y - 58, 22);
    setFont(ctx, { size: 104, weight: 200 });
    ctx.fillStyle = SNOW;
    ctx.fillText(r.v, PAD, y + 30);
    if (r.u) {
      const w = ctx.measureText(r.v).width;
      setFont(ctx, { size: 36, weight: 300 });
      ctx.fillStyle = AZURE;
      ctx.fillText(r.u, PAD + w + 16, y + 30);
    }
    y += gap;
  }

  drawMark(ctx, PAD, H - PAD - 58, 48);
  drawWordmark(ctx, PAD + 64, H - PAD - 30, 24, MIST);
}

function drawEditorial(c: Ctx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  ctx.textAlign = "center";
  label(ctx, d.activityLabel, W / 2, PAD + 70, 24, AZURE);

  setFont(ctx, { size: 150, weight: 400, family: SERIF });
  ctx.fillStyle = AZURE_BRIGHT;
  ctx.fillText(fmtDistance(d.distanceKm), W / 2, H * 0.3);
  setFont(ctx, { size: 46, weight: 300, tracking: 14 });
  ctx.fillStyle = AZURE;
  ctx.fillText("KM", W / 2, H * 0.3 + 74);
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = "0px";

  drawRoute(ctx, d.track, W / 2 - 190, H * 0.36, 380, 380, AZURE, 5);

  let y = H * 0.78;
  setFont(ctx, { size: 52, weight: 300 });
  ctx.fillStyle = SNOW;
  ctx.fillText(`+${fmtElevation(d.elevationGainM)} M`, W / 2, y);
  y += 74;
  ctx.fillStyle = MIST;
  ctx.fillText(fmtDuration(d.durationSec), W / 2, y);
  if (d.paceSecPerKm) {
    y += 74;
    ctx.fillText(`${fmtPace(d.paceSecPerKm)} /KM`, W / 2, y);
  }

  drawMark(ctx, W / 2 - 24, H - PAD - 50, 48, AZURE);
  ctx.textAlign = "left";
}

/* -------------------------------------------------------------------------- */
/* The design-sheet templates                                                 */
/* -------------------------------------------------------------------------- */

/**
 * SUMMIT — the altitude, cinematic.
 *
 * Leads with the highest point the activity actually reached. When no altitude
 * was recorded it leads with the ascent instead and says so — a "1,842 m
 * HIGHEST ALTITUDE" the GPS never measured has no place on an exported image.
 */
function drawSummit(c: Ctx) {
  const { ctx, W, H, d, photo } = c;
  /*
   * The BACKGROUND owns this layer, not the layout.
   *
   * These designs used to paint a full-bleed photograph here unconditionally,
   * which drew straight over whatever ground the athlete had chosen — pick
   * "Topographic" or "Transparent" on a photo layout and the export came back
   * byte-for-byte identical. `paintBackground` already draws the photo when
   * that is the choice, so the layout must not draw it a second time.
   */
  paintBackground(ctx, W, H, c.bg ?? "photo", c.photo);
  scrimTop(ctx, W, H, 0.5);
  scrim(ctx, W, H, 0.3);

  ctx.textAlign = "center";
  drawMark(ctx, W / 2 - 29, PAD, 58);
  setFont(ctx, { size: 34, weight: 300, tracking: 12 });
  ctx.fillStyle = SNOW;
  ctx.fillText("I C E F A L L", W / 2, PAD + 118);

  const hasAltitude = d.highestAltitudeM != null && d.highestAltitudeM > 0;
  const hero = hasAltitude
    ? fmtElevation(d.highestAltitudeM!)
    : `+${fmtElevation(d.elevationGainM)}`;
  const heroLabel = hasAltitude ? "Highest altitude" : "Total ascent";

  const midY = H * 0.44;
  setFont(ctx, { size: Math.min(210, W * 0.19), weight: 200, family: SERIF });
  ctx.fillStyle = AZURE_BRIGHT;
  const heroW = ctx.measureText(hero).width;
  ctx.fillText(hero, W / 2 - 30, midY);
  setFont(ctx, { size: 64, weight: 300, family: SERIF });
  ctx.fillText("m", W / 2 + heroW / 2 + 14, midY);

  // — HIGHEST ALTITUDE — with rules either side, as the sheet draws it.
  label(ctx, heroLabel, W / 2, midY + 74, 26, SNOW);
  const ruleW = 120;
  ctx.strokeStyle = MIST_DIM;
  ctx.lineWidth = 2;
  const halfText = ctx.measureText(heroLabel.toUpperCase()).width / 2 + 36;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + dir * halfText, midY + 66);
    ctx.lineTo(W / 2 + dir * (halfText + ruleW), midY + 66);
    ctx.stroke();
  }

  drawMark(ctx, W / 2 - 25, H - PAD - 420, 50);
  setFont(ctx, { size: 40, weight: 400, tracking: 3 });
  ctx.fillStyle = SNOW;
  ctx.fillText(d.activityLabel.toUpperCase(), W / 2, H - PAD - 310);
  setFont(ctx, { size: 28, weight: 300 });
  ctx.fillStyle = MIST;
  ctx.fillText(
    [d.dateLabel, d.locationLabel].filter(Boolean).join("  ·  "),
    W / 2,
    H - PAD - 262,
  );

  ctx.textAlign = "left";
  statRow(
    c,
    [
      { value: fmtDistance(d.distanceKm), unit: "km", label: "Distance" },
      { value: `+${fmtElevation(d.elevationGainM)}`, unit: "m", label: "Elevation gain" },
      { value: fmtDuration(d.durationSec), label: "Moving time" },
    ],
    H - PAD - 90,
    50,
  );

  if (d.mountainName) {
    ctx.textAlign = "center";
    label(ctx, `${d.mountainName} preparation`, W / 2, H - PAD + 10, 20, MIST_DIM);
  }
  ctx.textAlign = "left";
}

/**
 * PASSPORT — a stamped page from the athlete's record.
 *
 * Paper-coloured on purpose: it is a page from a document, not a poster. The
 * stamp stamps the DATE, which is real — it invents nothing.
 */
function drawPassport(c: Ctx) {
  const { ctx, W, H, d } = c;

  // Aged paper, edge-darkened.
  ctx.fillStyle = "#E9E2D0";
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "rgba(83,70,50,0)");
  vg.addColorStop(1, "rgba(83,70,50,0.16)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const INK = "#26221B";
  const INK_SOFT = "#6B6353";

  // Rule frame.
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 3;
  ctx.strokeRect(PAD - 24, PAD - 24, W - (PAD - 24) * 2, H - (PAD - 24) * 2);

  drawMark(ctx, PAD, PAD, 54, INK);
  setFont(ctx, { size: 26, weight: 500, tracking: 8 });
  ctx.fillStyle = INK;
  ctx.fillText("ICEFALL", PAD + 74, PAD + 40);
  ctx.textAlign = "right";
  label(ctx, "Mountain athlete", W - PAD, PAD + 36, 20, INK_SOFT);
  ctx.textAlign = "left";

  setFont(ctx, { size: 74, weight: 500, family: SERIF });
  ctx.fillStyle = INK;
  drawWrapped(ctx, d.activityLabel, PAD, PAD + 190, W - PAD * 2 - 260, 84, 2);

  // The date stamp: rotated ring, inked.
  const sx = W - PAD - 120;
  const sy = PAD + 220;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.22);
  ctx.strokeStyle = "#8A4B3A";
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#8A4B3A";
  setFont(ctx, { size: 26, weight: 600, tracking: 2 });
  ctx.fillText(d.dateLabel.toUpperCase(), 0, -8);
  setFont(ctx, { size: 20, weight: 500, tracking: 3 });
  ctx.fillText("ICEFALL", 0, 26);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  // The route, inked like a survey line.
  const mapH = H * 0.3;
  drawRoute(ctx, d.track, PAD + 40, H * 0.34, W - PAD * 2 - 80, mapH, "#8A6B3F", 5);

  // The figures, tabulated.
  const rows: [string, string][] = [
    ["Distance", `${fmtDistance(d.distanceKm)} km`],
    ["Elevation gain", `+${fmtElevation(d.elevationGainM)} m`],
    ["Moving time", fmtDuration(d.durationSec)],
    ...(d.highestAltitudeM
      ? [["Highest altitude", `${fmtElevation(d.highestAltitudeM)} m`] as [string, string]]
      : []),
  ];
  let y = H - PAD - rows.length * 58 + 20;
  for (const [k, v] of rows) {
    label(ctx, k, PAD, y, 22, INK_SOFT);
    ctx.textAlign = "right";
    setFont(ctx, { size: 40, weight: 500 });
    ctx.fillStyle = INK;
    ctx.fillText(v, W - PAD, y);
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(107,99,83,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 16);
    ctx.lineTo(W - PAD, y + 16);
    ctx.stroke();
    y += 58;
  }

  if (d.locationLabel) label(ctx, d.locationLabel, PAD, H - PAD + 12, 20, INK_SOFT);
}

/**
 * ELEVATION FOCUS — the climb itself, drawn from the recorded track.
 *
 * The profile is the activity's own elevation series. Where none was recorded
 * the card says so instead of drawing an invented curve.
 */
function drawElevationFocus(c: Ctx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  drawMark(ctx, PAD, PAD, 50);
  drawWordmark(ctx, PAD + 66, PAD + 30, 26);

  setFont(ctx, { size: 62, weight: 400 });
  ctx.fillStyle = SNOW;
  drawWrapped(ctx, d.activityLabel, PAD, PAD + 150, W - PAD * 2, 72, 2);
  setFont(ctx, { size: 26, weight: 300 });
  ctx.fillStyle = MIST;
  ctx.fillText([d.locationLabel, d.dateLabel].filter(Boolean).join("  ·  "), PAD, PAD + 220);

  // The hero figure: the gain.
  const midY = H * 0.42;
  setFont(ctx, { size: 150, weight: 200 });
  ctx.fillStyle = AZURE_BRIGHT;
  ctx.fillText(`+${fmtElevation(d.elevationGainM)}`, PAD, midY);
  const w = ctx.measureText(`+${fmtElevation(d.elevationGainM)}`).width;
  setFont(ctx, { size: 46, weight: 300 });
  ctx.fillStyle = MIST;
  ctx.fillText("m", PAD + w + 16, midY);
  label(ctx, "Elevation gain", PAD, midY + 52, 24);

  // The profile, from the track's own elevation series.
  const profH = H * 0.22;
  const profY = H - PAD - 190 - profH;
  const eles = d.track.map((p) => p.ele).filter((e): e is number => e != null);
  if (eles.length > 2) {
    const minE = Math.min(...eles);
    const maxE = Math.max(...eles);
    const span = Math.max(maxE - minE, 1);
    ctx.save();
    ctx.strokeStyle = AZURE;
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(167,139,92,0.5)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    eles.forEach((e, i) => {
      const px = PAD + (i / (eles.length - 1)) * (W - PAD * 2);
      const py = profY + profH - ((e - minE) / span) * profH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = AZURE_BRIGHT;
    ctx.beginPath();
    ctx.arc(
      W - PAD,
      profY + profH - ((eles[eles.length - 1] - minE) / span) * profH,
      10,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    label(ctx, "0 km", PAD, profY + profH + 40, 20, MIST_DIM);
    ctx.textAlign = "right";
    label(ctx, `${fmtDistance(d.distanceKm)} km`, W - PAD, profY + profH + 40, 20, MIST_DIM);
    ctx.textAlign = "left";
  } else {
    label(ctx, "No elevation series recorded", PAD, profY + profH / 2, 22, MIST_DIM);
  }

  statRow(
    c,
    [
      { value: fmtDistance(d.distanceKm), unit: "km", label: "Distance" },
      { value: fmtDuration(d.durationSec), label: "Moving time" },
    ],
    H - PAD - 40,
    50,
  );
}

/** ADVENTURE POSTER — "THE MOUNTAINS BUILD YOU." over the photograph. */
/**
 * ROUTE — the line, drawn as large as the frame allows.
 *
 * The only card where the track is the subject rather than a garnish, so it
 * gets the whole middle of the canvas and the statistics are pushed to a single
 * row underneath. A route with fewer than two points cannot be the subject of
 * anything, so the card says so rather than printing an empty box.
 */
/**
 * TRANSPARENT — the route and the figures, on nothing at all.
 *
 * The one card that deliberately does NOT paint a background, so the exported
 * PNG keeps its alpha channel and can be dropped over whatever the athlete has
 * already got on their Story: their own photo, a video, a colour. Every other
 * template fills obsidian first; this one must not, and `renderShareCard`
 * skips its usual background fill for this style alone.
 *
 * Everything is drawn TWICE — a dark, wider under-stroke and then the real
 * mark on top. Without that, azure-on-transparent vanishes against a bright sky
 * photo, which is exactly the background a mountaineer is most likely to put
 * behind it. The halo costs nothing and makes the card legible on white and on
 * black alike.
 */
/**
 * The two-column figure grid the photo-overlay layout uses.
 *
 * IT ONLY DRAWS WHAT EXISTS. Pace is absent from a mountaineering day where
 * the recorder never held a usable speed; heart rate is absent unless a strap
 * supplied one, which on ICEFALL today it never does; calories are absent
 * unless a body mass was set to estimate them from. Rather than print "0 bpm"
 * or a dash into a proud layout, the missing rows simply do not appear and the
 * grid closes up — a card with four real figures beats one with six where two
 * are lies.
 *
 * Returns the y it finished at, so the caller can lay out beneath it.
 */
/**
 * Paints the chosen ground, once, before any layout runs.
 *
 * `transparent` deliberately paints NOTHING, which is what preserves the PNG's
 * alpha channel. Every layout calls this instead of filling obsidian itself,
 * so a design added later cannot accidentally paint over a transparent export.
 */
function paintBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  bg: CardBackground,
  photo: HTMLImageElement | null,
) {
  if (bg === "transparent") return;

  if (bg === "photo" && photo) {
    drawCover(ctx, photo, 0, 0, W, H);
    // A scrim, so type stays legible over any photograph.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(8,11,13,0.55)");
    g.addColorStop(0.5, "rgba(8,11,13,0.35)");
    g.addColorStop(1, "rgba(8,11,13,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  ctx.fillStyle = OBSIDIAN;
  ctx.fillRect(0, 0, W, H);

  if (bg === "gradient") {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.28, 0, W * 0.5, H * 0.28, H * 0.8);
    g.addColorStop(0, "rgba(167,139,92,0.16)");
    g.addColorStop(1, "rgba(8,11,13,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  if (bg === "topographic") {
    /*
     * Contour lines, not a real map — concentric deformed rings that read as
     * a topographic sheet at a glance. Deliberately abstract: drawing actual
     * contours of a real place would imply the card knew that terrain, and it
     * does not.
     */
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.lineWidth = 2;
    const cx = W * 0.5;
    const cy = H * 0.45;
    for (let ring = 1; ring <= 14; ring++) {
      ctx.beginPath();
      const r = ring * (Math.max(W, H) / 15);
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.08) {
        const wobble =
          1 + 0.11 * Math.sin(a * 3 + ring * 0.7) + 0.06 * Math.sin(a * 5 - ring * 0.4);
        const x = cx + Math.cos(a) * r * wobble * 0.72;
        const y = cy + Math.sin(a) * r * wobble * 0.5;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawStatGrid(
  ctx: CanvasRenderingContext2D,
  d: ShareCardData,
  x: number,
  y: number,
  w: number,
  ink: string,
  muted: string,
  scale = 1,
): number {
  const cells: { label: string; value: string }[] = [
    { label: "Distance", value: `${fmtDistance(d.distanceKm, 2)} km` },
    { label: "Moving time", value: fmtDuration(d.durationSec) },
    { label: "Elevation gain", value: `${fmtElevation(d.elevationGainM)} m` },
  ];
  if (d.highestAltitudeM != null) {
    cells.push({ label: "Highest point", value: `${fmtElevation(d.highestAltitudeM)} m` });
  }
  if (d.paceSecPerKm != null && d.paceSecPerKm > 0) {
    const m = Math.floor(d.paceSecPerKm / 60);
    const sec = Math.round(d.paceSecPerKm % 60);
    cells.push({ label: "Avg pace", value: `${m}:${String(sec).padStart(2, "0")} /km` });
  }
  if (d.caloriesKcal != null && d.caloriesKcal > 0) {
    cells.push({
      label: d.caloriesForKg ? `Energy · est. ${d.caloriesForKg} kg` : "Energy · estimate",
      value: `${Math.round(d.caloriesKcal)} kcal`,
    });
  }
  if (d.avgHeartRateBpm != null && d.avgHeartRateBpm > 0) {
    cells.push({ label: "Avg heart rate", value: `${Math.round(d.avgHeartRateBpm)} bpm` });
  }

  const colW = w / 2;
  const rowH = 118 * scale;
  cells.forEach((cell, i) => {
    const cx = x + (i % 2) * colW;
    const cy = y + Math.floor(i / 2) * rowH;
    ctx.textAlign = "center";
    setFont(ctx, { size: 26 * scale, weight: 400 });
    ctx.fillStyle = muted;
    ctx.fillText(cell.label, cx + colW / 2, cy);
    setFont(ctx, { size: 56 * scale, weight: 600 });
    ctx.fillStyle = ink;
    ctx.fillText(cell.value, cx + colW / 2, cy + 62 * scale);
    ctx.textAlign = "left";
  });

  return y + Math.ceil(cells.length / 2) * rowH;
}

function drawTransparent(c: Ctx) {
  drawTransparentInk(c, SNOW, "rgba(255,255,255,0.72)", "rgba(0,0,0,0.85)");
}

/** The same card in black, for a bright photo. */
function drawTransparentLight(c: Ctx) {
  drawTransparentInk(c, "#0B0D0F", "rgba(11,13,15,0.66)", "rgba(255,255,255,0.9)");
}

function drawTransparentInk(c: Ctx, ink: string, muted: string, haloColor: string) {
  const { ctx, W, H, d } = c;
  // No fillRect. That absence is the entire feature.

  const halo = (draw: () => void, blur = 16) => {
    ctx.save();
    ctx.shadowColor = haloColor;
    ctx.shadowBlur = blur;
    draw();
    ctx.restore();
  };

  // ---- Wordmark, top-left, the way a photo overlay wears it ------------
  halo(() => {
    drawMark(ctx, PAD, PAD, 52, ink);
    drawWordmark(ctx, PAD + 70, PAD + 32, 34);
  }, 12);

  // ---- The route -------------------------------------------------------
  const top = PAD + 120;
  const boxH = H * 0.34;
  const boxW = W - PAD * 2;
  if (d.track.length >= 2) {
    drawRoute(ctx, d.track, PAD, top, boxW, boxH, haloColor, 20);
    drawRoute(ctx, d.track, PAD, top, boxW, boxH, ink === SNOW ? AZURE_BRIGHT : AZURE, 10);
  }

  // ---- Everything the recording actually holds -------------------------
  halo(() => {
    drawStatGrid(ctx, d, PAD, top + boxH + 92, W - PAD * 2, ink, muted);
  }, 12);

  // ---- The mountain and the date ---------------------------------------
  halo(() => {
    ctx.textAlign = "center";
    if (d.mountainName) {
      setFont(ctx, { size: 34, weight: 500 });
      ctx.fillStyle = ink;
      ctx.fillText(d.mountainName, W / 2, H - PAD - 52);
    }
    setFont(ctx, { size: 24, weight: 400 });
    ctx.fillStyle = muted;
    ctx.fillText(
      [d.locationLabel, d.dateLabel].filter(Boolean).join("  ·  "),
      W / 2,
      H - PAD - 12,
    );
    ctx.textAlign = "left";
  }, 10);

  if (d.simulated) {
    halo(() => {
      setFont(ctx, { size: 22, weight: 600 });
      ctx.fillStyle = "#C9A227";
      ctx.textAlign = "center";
      ctx.fillText("SIMULATED", W / 2, PAD + 92);
      ctx.textAlign = "left";
    }, 8);
  }
}

function drawRouteCard(c: Ctx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  drawMark(ctx, PAD, PAD, 50);
  drawWordmark(ctx, PAD + 66, PAD + 30, 26);

  setFont(ctx, { size: 58, weight: 400 });
  ctx.fillStyle = SNOW;
  drawWrapped(ctx, d.mountainName ?? d.activityLabel, PAD, PAD + 150, W - PAD * 2, 68, 2);
  setFont(ctx, { size: 26, weight: 300 });
  ctx.fillStyle = MIST;
  ctx.fillText([d.locationLabel, d.dateLabel].filter(Boolean).join("  ·  "), PAD, PAD + 218);

  const top = PAD + 268;
  const bottom = H - PAD - 210;
  const boxH = Math.max(120, bottom - top);
  const boxW = W - PAD * 2;

  if (d.track.length >= 2) {
    // A dark under-stroke first, so the azure line reads on any background the
    // card is later placed against.
    drawRoute(ctx, d.track, PAD, top, boxW, boxH, "rgba(0,0,0,0.55)", 16);
    drawRoute(ctx, d.track, PAD, top, boxW, boxH, AZURE_BRIGHT, 8);
  } else {
    setFont(ctx, { size: 28, weight: 300 });
    ctx.fillStyle = MIST_DIM;
    ctx.fillText("No route was recorded for this activity.", PAD, top + boxH / 2);
  }

  statRow(
    { ctx, W },
    [
      { value: fmtDistance(d.distanceKm, 1), unit: "km", label: "Distance" },
      { value: `+${fmtElevation(d.elevationGainM)}`, unit: "m", label: "Ascent" },
      { value: fmtDuration(d.durationSec), label: "Time" },
    ],
    H - PAD - 96,
  );
  return;
}

function drawPoster(c: Ctx) {
  const { ctx, W, H, d, photo } = c;
  /*
   * The BACKGROUND owns this layer, not the layout.
   *
   * These designs used to paint a full-bleed photograph here unconditionally,
   * which drew straight over whatever ground the athlete had chosen — pick
   * "Topographic" or "Transparent" on a photo layout and the export came back
   * byte-for-byte identical. `paintBackground` already draws the photo when
   * that is the choice, so the layout must not draw it a second time.
   */
  paintBackground(ctx, W, H, c.bg ?? "photo", c.photo);
  scrimTop(ctx, W, H, 0.35);
  scrim(ctx, W, H, 0.42);

  drawMark(ctx, PAD, PAD, 50);
  drawWordmark(ctx, PAD + 66, PAD + 30, 26);

  setFont(ctx, { size: 96, weight: 600, tracking: 1 });
  ctx.fillStyle = SNOW;
  const topY = H * 0.58;
  ctx.fillText("THE MOUNTAINS", PAD, topY);
  ctx.fillText("BUILD YOU.", PAD, topY + 104);

  label(ctx, d.activityLabel, PAD, topY + 170, 24, AZURE_BRIGHT);
  label(
    ctx,
    [d.locationLabel, d.dateLabel].filter(Boolean).join("  ·  "),
    PAD,
    topY + 208,
    20,
    MIST,
  );

  statRow(
    c,
    [
      { value: fmtDistance(d.distanceKm), unit: "km", label: "Distance" },
      { value: `+${fmtElevation(d.elevationGainM)}`, unit: "m", label: "Elev. gain" },
      { value: fmtDuration(d.durationSec), label: "Time" },
    ],
    H - PAD - 40,
    46,
  );
}

/** CLEAN LIGHT — bright, for feeds where the dark cards sink. */
function drawLight(c: Ctx) {
  const { ctx, W, H, d, photo } = c;
  const INK = "#1C1D20";
  const SOFT = "#8A8E93";

  ctx.fillStyle = "#F4F2ED";
  ctx.fillRect(0, 0, W, H);

  drawMark(ctx, PAD, PAD, 50, INK);
  setFont(ctx, { size: 26, weight: 500, tracking: 8 });
  ctx.fillStyle = INK;
  ctx.fillText("ICEFALL", PAD + 70, PAD + 38);

  setFont(ctx, { size: 78, weight: 400, family: SERIF });
  ctx.fillStyle = INK;
  drawWrapped(ctx, d.activityLabel, PAD, PAD + 200, W - PAD * 2, 88, 2);
  setFont(ctx, { size: 28, weight: 300 });
  ctx.fillStyle = SOFT;
  ctx.fillText([d.locationLabel, d.dateLabel].filter(Boolean).join("  ·  "), PAD, PAD + 300);

  // The photograph as a plate, with the route inked over it.
  const plateY = PAD + 350;
  const plateH = H - plateY - 320;
  if (photo && plateH > 200) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, plateY, W - PAD * 2, plateH, 24);
    ctx.clip();
    drawCover(ctx, photo, PAD, plateY, W - PAD * 2, plateH);
    ctx.restore();
    drawRoute(ctx, d.track, PAD + 60, plateY + 60, W - PAD * 2 - 120, plateH - 120, AZURE_BRIGHT, 7);
  } else {
    drawRoute(
      ctx,
      d.track,
      PAD + 40,
      plateY + 20,
      W - PAD * 2 - 80,
      Math.max(plateH - 40, 180),
      "#8A6B3F",
      6,
    );
  }

  const stats: { value: string; unit?: string; label: string }[] = [
    { value: fmtDistance(d.distanceKm), unit: "km", label: "Distance" },
    { value: `+${fmtElevation(d.elevationGainM)}`, unit: "m", label: "Elev. gain" },
    { value: fmtDuration(d.durationSec), label: "Moving time" },
    ...(d.highestAltitudeM
      ? [{ value: fmtElevation(d.highestAltitudeM), unit: "m", label: "Highest alt." }]
      : []),
  ];
  // statRow writes light-on-dark; this card is ink-on-paper, so by hand.
  const colW = (W - PAD * 2) / stats.length;
  stats.forEach((it, i) => {
    const x = PAD + i * colW;
    setFont(ctx, { size: 46, weight: 500 });
    ctx.fillStyle = INK;
    ctx.fillText(it.value, x, H - PAD - 60);
    const vw = ctx.measureText(it.value).width;
    if (it.unit) {
      setFont(ctx, { size: 26, weight: 400 });
      ctx.fillStyle = SOFT;
      ctx.fillText(it.unit, x + vw + 8, H - PAD - 60);
    }
    label(ctx, it.label, x, H - PAD - 20, 19, SOFT);
  });

  if (d.mountainName) {
    label(ctx, `${d.mountainName} preparation`, PAD, H - PAD + 16, 18, "#8A6B3F");
  }
}

/* -------------------------------------------------------------------------- */
/* Mountain Readiness card                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A readiness card leaves the app and is read by people with no other context.
 *
 * That single fact drives everything below. Inside ICEFALL a readiness figure
 * sits beside its dimensions, its disclaimer and the sentence explaining what
 * ICEFALL cannot see; on someone's Instagram story it sits beside nothing at
 * all. "82% READY" with no provenance is the most shareable way this product
 * could mislead, so the exported image carries its own provenance and its own
 * caveat, drawn by the entry point rather than by the layouts — no style can
 * omit them, and adding a sixth style cannot lose them by accident.
 */

/**
 * Where the composite figure came from.
 *
 * `recorded`      — every dimension behind it was computed from sessions ICEFALL
 *                   observed. Rare, and only on objectives that turn on fitness
 *                   alone.
 * `mixed`         — part observed, part told to us (logged summits, declared
 *                   skills, a reported maximum altitude).
 * `self-reported` — the figure rests on the athlete's own answers. It is an
 *                   estimate they gave, handed back to them as a number, and the
 *                   card must never let that pass as an observation.
 */
export type ReadinessProvenance = "recorded" | "mixed" | "self-reported";

export interface ReadinessCardData {
  mountainName: string;
  mountainElevationM?: number;
  /**
   * 0–100, or null when the readiness engine withheld a single figure. NEVER
   * substitute a number: `null` means the assessment did not conclude, and a
   * plausible-looking percentage in its place is the one thing this card must
   * not do.
   */
  readinessPct: number | null;
  /** Short explanation drawn in place of the figure. Required when it is null. */
  readinessReason?: string;
  /** Describes preparation. Never a clearance, never "ready". */
  statusWord: string;
  /** Whole days to the target date, or null when there is no usable date. */
  daysToSummit: number | null;
  /** Drawn under the dash when `daysToSummit` is null. */
  noDaysReason?: string;
  /**
   * Ascent and session count over `periodLabel`, from recorded activities only.
   * Null means nothing was recorded in that window — not zero. A zero here would
   * claim ICEFALL measured a month of no ascent, which is a different statement
   * from having no recordings to measure.
   */
  verticalThisMonthM: number | null;
  /**
   * Replaces the ascent label when `verticalThisMonthM` is null. Two different
   * absences hide behind that null — nothing recorded at all, and sessions
   * recorded on a device with no usable altitude — and they are not the same
   * claim, so the card names which one it is.
   */
  noVerticalReason?: string;
  sessionsThisMonth: number | null;
  /** Names the window the two figures above cover, e.g. "August". */
  periodLabel: string;
  provenance: ReadinessProvenance;
  photoSrc?: string;
}

/** Vertical space the entry point reserves at the foot of every layout. */
const READINESS_FOOTER_H = 116;

/**
 * The provenance sentence. Written for a stranger reading the image, not for
 * someone who already knows what ICEFALL is.
 */
const PROVENANCE_LINE: Record<ReadinessProvenance, string> = {
  recorded: "Assessed from sessions recorded in ICEFALL",
  mixed: "Part recorded sessions, part self-reported",
  "self-reported": "Self-reported — from answers, not measurements",
};

/** Drawn on every readiness card, in every style, without exception. */
const READINESS_CAVEAT = "A planning aid. Not a clearance to climb.";

interface RCtx {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  d: ReadinessCardData;
  photo: HTMLImageElement | null;
  bg?: CardBackground;
}

/** The three supporting figures, each either a value or a stated absence. */
function readinessFigures(d: ReadinessCardData): { value: string; unit?: string; label: string }[] {
  return [
    d.daysToSummit === null
      ? { value: "—", label: d.noDaysReason ?? "No date set" }
      : { value: d.daysToSummit.toLocaleString("en-GB"), label: "Days to summit" },
    d.verticalThisMonthM === null
      ? { value: "—", label: d.noVerticalReason ?? "Ascent · none recorded" }
      : {
          value: `+${fmtElevation(d.verticalThisMonthM)}`,
          unit: "m",
          label: `Ascent · ${d.periodLabel}`,
        },
    d.sessionsThisMonth === null
      ? { value: "—", label: "Sessions · none recorded" }
      : { value: String(d.sessionsThisMonth), label: `Sessions · ${d.periodLabel}` },
  ];
}

/**
 * The headline figure, its status word, and — when there is no figure — the
 * reason there isn't one.
 *
 * One helper for all five layouts so none of them can draw a bare em-dash with
 * nothing beside it. An unexplained dash reads as a rendering fault; a dash with
 * "Technical unknown" under it reads as what it is, which is the app declining
 * to put a number on a mountain it cannot see all of.
 *
 * BOTTOM-ANCHORED: `bottom` is the lowest baseline the block may occupy, and the
 * figure floats up from there. The withheld case is one line taller than the
 * ordinary one, and anchoring from the top would have pushed that extra line
 * straight through whatever sits below — the reason would collide with the very
 * figures it explains. Returns the number's own baseline so callers can stack
 * upwards from it.
 */
function drawReadinessValue(
  c: RCtx,
  x: number,
  bottom: number,
  size: number,
  centred: boolean,
  valueColor = SNOW,
  wordColor = AZURE,
): number {
  const { ctx, d } = c;
  const missing = d.readinessPct === null;
  const value = missing ? "—" : String(d.readinessPct);

  const wordSize = Math.max(20, size * 0.17);
  const reasonSize = wordSize * 1.15;
  const wordY = missing ? bottom - reasonSize * 1.7 : bottom;
  const baseline = wordY - size * 0.32;

  setFont(ctx, { size, weight: 200 });
  const valW = ctx.measureText(value).width;
  const unitSize = size * 0.32;
  setFont(ctx, { size: unitSize, weight: 300 });
  const unitW = missing ? 0 : ctx.measureText("%").width + size * 0.09;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  const left = centred ? x - (valW + unitW) / 2 : x;

  setFont(ctx, { size, weight: 200 });
  ctx.fillStyle = missing ? MIST : valueColor;
  ctx.fillText(value, left, baseline);

  if (!missing) {
    setFont(ctx, { size: unitSize, weight: 300 });
    ctx.fillStyle = MIST;
    ctx.fillText("%", left + valW + size * 0.09, baseline);
  }
  ctx.textAlign = prevAlign;

  if (centred) ctx.textAlign = "center";
  label(ctx, d.statusWord, x, wordY, wordSize, wordColor);

  if (missing) {
    setFont(ctx, { size: reasonSize, weight: 400 });
    ctx.fillStyle = MIST;
    ctx.fillText(d.readinessReason ?? "Not assessed", x, bottom);
  }
  ctx.textAlign = prevAlign;

  return baseline;
}

/** Objective name plus its elevation, in the house's caption register. */
function readinessCaption(d: ReadinessCardData): string {
  return d.mountainElevationM
    ? `Mountain readiness · ${fmtElevation(d.mountainElevationM)} m`
    : "Mountain readiness";
}

/**
 * Rough cap height above a baseline for the extralight numerals used here.
 * Layouts stack upwards from a figure's baseline and need to know where its top
 * lands; measuring per glyph would be exact but `measureText` ascent support is
 * uneven across the browsers this has to run in.
 */
const NUMERAL_ASCENT = 0.76;

function drawReadinessClassic(c: RCtx) {
  const { ctx, W, H, d, photo } = c;
  /*
   * The BACKGROUND owns this layer, not the layout.
   *
   * These designs used to paint a full-bleed photograph here unconditionally,
   * which drew straight over whatever ground the athlete had chosen — pick
   * "Topographic" or "Transparent" on a photo layout and the export came back
   * byte-for-byte identical. `paintBackground` already draws the photo when
   * that is the choice, so the layout must not draw it a second time.
   */
  paintBackground(ctx, W, H, c.bg ?? "photo", c.photo);
  scrim(ctx, W, H, 0.18);
  if (photo) scrimTop(ctx, W, H, 0.2);

  drawMark(ctx, PAD, PAD, 58);
  drawWordmark(ctx, PAD + 76, PAD + 34, 30);

  // Built from the bottom up: the footer is fixed, the stat row sits above it,
  // and everything else floats. A long name or a withheld figure grows into the
  // photograph rather than into the type below it.
  const base = H - READINESS_FOOTER_H;
  const size = 138;

  statRow(c, readinessFigures(d), base - 24, 42);
  const numberBaseline = drawReadinessValue(c, PAD, base - 106, size, false);

  setFont(ctx, { size: 56, weight: 300 });
  ctx.fillStyle = SNOW;
  const nameTop = drawWrappedUp(
    ctx,
    d.mountainName,
    PAD,
    numberBaseline - size * NUMERAL_ASCENT - 28,
    W - PAD * 2,
    64,
    2,
  );

  label(ctx, readinessCaption(d), PAD, nameTop - 58, 22);
}

function drawReadinessMinimal(c: RCtx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  label(ctx, readinessCaption(d), PAD, PAD + 40, 24);

  setFont(ctx, { size: 60, weight: 300 });
  ctx.fillStyle = SNOW;
  drawWrapped(ctx, d.mountainName, PAD, PAD + 132, W - PAD * 2, 70, 2);

  const markY = H - READINESS_FOOTER_H - 84;
  const rowGap = 104;
  const rowsTop = markY - 76 - rowGap * 2;

  drawReadinessValue(c, PAD, rowsTop - 96, Math.min(160, H * 0.14), false);

  let y = rowsTop;
  for (const f of readinessFigures(d)) {
    setFont(ctx, { size: 58, weight: 200 });
    ctx.fillStyle = f.value === "—" ? MIST : SNOW;
    ctx.fillText(f.value, PAD, y);
    const w = ctx.measureText(f.value).width;
    if (f.unit) {
      setFont(ctx, { size: 26, weight: 300 });
      ctx.fillStyle = MIST;
      ctx.fillText(f.unit, PAD + w + 10, y);
    }
    label(ctx, f.label, PAD, y + 30, 20);
    y += rowGap;
  }

  drawMark(ctx, PAD, markY, 46);
  drawWordmark(ctx, PAD + 62, markY + 28, 22, MIST);
}

function drawReadinessMountain(c: RCtx) {
  const { ctx, W, H, d, photo } = c;
  /*
   * The BACKGROUND owns this layer, not the layout.
   *
   * These designs used to paint a full-bleed photograph here unconditionally,
   * which drew straight over whatever ground the athlete had chosen — pick
   * "Topographic" or "Transparent" on a photo layout and the export came back
   * byte-for-byte identical. `paintBackground` already draws the photo when
   * that is the choice, so the layout must not draw it a second time.
   */
  paintBackground(ctx, W, H, c.bg ?? "photo", c.photo);
  scrim(ctx, W, H, 0.1);
  if (photo) scrimTop(ctx, W, H, 0.34);

  ctx.textAlign = "center";
  setFont(ctx, { size: 58, weight: 300, tracking: 6 });
  ctx.fillStyle = SNOW;
  const nameBottom = drawWrapped(
    ctx,
    d.mountainName.toUpperCase(),
    W / 2,
    PAD + 110,
    W - PAD * 2,
    70,
    2,
  );
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = "0px";

  // One caption line rather than two. Elevation and the "mountain readiness"
  // label stacked over a sunlit snowfield fought each other for legibility even
  // through the scrim; a single line in SNOW wins that argument outright.
  label(ctx, readinessCaption(d), W / 2, nameBottom + 62, 21, SNOW);
  ctx.textAlign = "left";

  // The mark sits centred under the stat row, so it needs clearance from the
  // middle column's label rather than the row's baseline.
  const markY = H - READINESS_FOOTER_H - 40;
  const statY = markY - 86;

  statRow(c, readinessFigures(d), statY, 44);
  drawReadinessValue(c, W / 2, statY - 72, 168, true);
  drawMark(ctx, W / 2 - 24, markY, 48);
}

function drawReadinessPerformance(c: RCtx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  label(ctx, readinessCaption(d), PAD, PAD + 44, 24);
  setFont(ctx, { size: 44, weight: 300 });
  ctx.fillStyle = SNOW;
  const nameBottom = drawWrapped(ctx, d.mountainName, PAD, PAD + 106, W - PAD * 2, 52, 2);

  const rows = readinessFigures(d);
  const markY = H - READINESS_FOOTER_H - 70;
  // Held clear of the name rather than pinned to a fraction of the height: a
  // two-line objective name on a square card would otherwise run into the top
  // of the figure. The proportional position is the floor, not the rule.
  const valueBottom = Math.max(H * 0.4, nameBottom + 190);
  const rowsTop = valueBottom + 118;
  // Spread to fill the card rather than capping the gap: a fixed cap leaves a
  // dead band at the foot of a 9:16 story, which reads as a rendering fault.
  const gap = Math.max(112, (markY - 76 - rowsTop) / Math.max(1, rows.length - 1));

  drawReadinessValue(c, PAD, valueBottom, Math.min(132, H * 0.115), false);

  let y = rowsTop;
  for (const f of rows) {
    label(ctx, f.label, PAD, y - 46, 21);
    setFont(ctx, { size: Math.min(84, H * 0.072), weight: 200 });
    ctx.fillStyle = f.value === "—" ? MIST : SNOW;
    ctx.fillText(f.value, PAD, y + 22);
    if (f.unit) {
      const w = ctx.measureText(f.value).width;
      setFont(ctx, { size: 32, weight: 300 });
      ctx.fillStyle = AZURE;
      ctx.fillText(f.unit, PAD + w + 14, y + 22);
    }
    y += gap;
  }

  drawMark(ctx, PAD, markY, 46);
  drawWordmark(ctx, PAD + 62, markY + 28, 22, MIST);
}

function drawReadinessEditorial(c: RCtx) {
  const { ctx, W, H, d } = c;
  paintBackground(ctx, W, H, c.bg ?? "solid", c.photo);

  ctx.textAlign = "center";
  label(ctx, "Mountain readiness", W / 2, PAD + 70, 22, AZURE);

  setFont(ctx, { size: Math.min(68, H * 0.058), weight: 400, family: SERIF });
  ctx.fillStyle = SNOW;
  const nameBottom = drawWrapped(
    ctx,
    d.mountainName,
    W / 2,
    PAD + 150,
    W - PAD * 2,
    Math.min(78, H * 0.067),
    2,
  );

  if (d.mountainElevationM) {
    setFont(ctx, { size: 32, weight: 300 });
    ctx.fillStyle = MIST;
    ctx.fillText(`${fmtElevation(d.mountainElevationM)} m`, W / 2, nameBottom + 54);
  }

  const valueBottom = H * 0.53;
  drawReadinessValue(c, W / 2, valueBottom, Math.min(180, H * 0.155), true, AZURE_BRIGHT, AZURE);

  // The mark closes the card, and the figure list is spaced to reach it without
  // running into it — the last label and the mark are both centred, so a short
  // gap here reads as a collision rather than as tight setting.
  const markY = H - READINESS_FOOTER_H - 22;
  const firstRow = valueBottom + 100;
  const rowGap = Math.min(190, Math.max(82, (markY - 70 - firstRow) / 2));

  let y = firstRow;
  for (const f of readinessFigures(d)) {
    setFont(ctx, { size: 42, weight: 300 });
    ctx.fillStyle = f.value === "—" ? MIST : SNOW;
    ctx.fillText(`${f.value}${f.unit ? ` ${f.unit}` : ""}`, W / 2, y);
    label(ctx, f.label, W / 2, y + 30, 19);
    y += rowGap;
  }

  drawMark(ctx, W / 2 - 22, markY, 44, AZURE);
  ctx.textAlign = "left";
}

/**
 * Provenance and caveat, drawn after the layout on every readiness card.
 *
 * Deliberately not dimmed into the background: the provenance line is SNOW at
 * the same weight as a label elsewhere on the card, because the whole point is
 * that it is read. A greyed-out disclosure is a disclosure designed to be missed.
 */
function drawReadinessFooter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  d: ReadinessCardData,
) {
  ctx.textAlign = "center";

  label(ctx, PROVENANCE_LINE[d.provenance], W / 2, H - 66, 21, SNOW);

  setFont(ctx, { size: 23, weight: 400 });
  ctx.fillStyle = MIST_DIM;
  drawWrapped(ctx, READINESS_CAVEAT, W / 2, H - 30, W - PAD, 28, 1);

  ctx.textAlign = "left";
}

/**
 * The readiness card has five designs of its own; the newer activity templates
 * (summit, passport, poster…) are about a single outing and have no readiness
 * layout, so they alias to the closest existing one. ShareReadiness's picker
 * only offers the original five — the aliases exist so the type stays whole.
 */
const READINESS_RENDERERS: Record<CardStyle, (c: RCtx) => void> = {
  classic: drawReadinessClassic,
  minimal: drawReadinessMinimal,
  // A readiness score has no track to draw, so the route template aliases to
  // the metrics-first one rather than rendering an empty frame.
  route: drawReadinessPerformance,
  transparent: drawReadinessPerformance,
  "transparent-light": drawReadinessMinimal,
  mountain: drawReadinessMountain,
  performance: drawReadinessPerformance,
  editorial: drawReadinessEditorial,
  summit: drawReadinessMountain,
  passport: drawReadinessEditorial,
  elevation: drawReadinessPerformance,
  poster: drawReadinessMountain,
  light: drawReadinessMinimal,
};

export async function renderReadinessCard(
  data: ReadinessCardData,
  style: CardStyle,
  format: CardFormat,
  background: CardBackground = "solid",
): Promise<HTMLCanvasElement> {
  const fmt = CARD_FORMATS.find((f) => f.id === format) ?? CARD_FORMATS[0];
  const canvas = document.createElement("canvas");
  canvas.width = fmt.w;
  canvas.height = fmt.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  try {
    await document.fonts.ready;
  } catch {
    /* proceed with whatever is loaded */
  }

  const needsPhoto =
    background === "photo" ||
    style === "classic" || style === "mountain" || style === "summit" || style === "poster" ||
    style === "light";
  const photo = needsPhoto && data.photoSrc ? await loadImage(data.photoSrc) : null;

  ctx.textBaseline = "alphabetic";
  READINESS_RENDERERS[style]({ ctx, W: fmt.w, H: fmt.h, d: data, photo, bg: background });

  // Drawn last, and outside the layouts, so provenance cannot be lost by a
  // layout change or by a style added later. See the block comment above.
  drawReadinessFooter(ctx, fmt.w, fmt.h, data);

  return canvas;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const RENDERERS: Record<CardStyle, (c: Ctx) => void> = {
  classic: drawClassic,
  summit: drawSummit,
  minimal: drawMinimal,
  transparent: drawTransparent,
  "transparent-light": drawTransparentLight,
  route: drawRouteCard,
  passport: drawPassport,
  elevation: drawElevationFocus,
  poster: drawPoster,
  light: drawLight,
  mountain: drawMountain,
  performance: drawPerformance,
  editorial: drawEditorial,
};

export async function renderShareCard(
  data: ShareCardData,
  style: CardStyle,
  format: CardFormat,
  background: CardBackground = "solid",
): Promise<HTMLCanvasElement> {
  const fmt = CARD_FORMATS.find((f) => f.id === format) ?? CARD_FORMATS[0];
  const canvas = document.createElement("canvas");
  canvas.width = fmt.w;
  canvas.height = fmt.h;
  const ctx = canvas.getContext("2d")!;

  // Wait for the brand faces so the card doesn't fall back to a system font.
  try {
    await document.fonts.ready;
  } catch {
    /* proceed with whatever is loaded */
  }

  const needsPhoto =
    background === "photo" ||
    style === "classic" || style === "mountain" || style === "summit" || style === "poster" ||
    style === "light";
  const photo = needsPhoto && data.photoSrc ? await loadImage(data.photoSrc) : null;

  ctx.textBaseline = "alphabetic";
  RENDERERS[style]({ ctx, W: fmt.w, H: fmt.h, d: data, photo, bg: background });

  // Simulated activities are marked on the exported image too — an honest card
  // is worth more than a flattering one.
  if (data.simulated) {
    ctx.textAlign = "center";
    label(ctx, "Simulated activity", fmt.w / 2, fmt.h - 26, 20, "#C9944D");
    ctx.textAlign = "left";
  }

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.96));
}
