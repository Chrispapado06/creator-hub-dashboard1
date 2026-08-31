import { OVERPASS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { haversine } from "@/tracking/filters";
import { OFFLINE } from "@/offline/offline";
import type { LatLon } from "./trails";

/**
 * What a trail is actually made of — surface underfoot, kind of way, and the
 * hardest ground on it — plus the elevation profile along its line.
 *
 * All of it is COMPUTED. The detail page used to read `ascent`, `duration` and
 * `sac_scale` straight off the relation and print "not mapped" when they were
 * absent, which is most of the time: not one of Slovakia's 1,226 hiking
 * relations carries a `distance` tag, and `ascent` is rarer still. Four empty
 * fields on every card is not honesty, it is a missing feature wearing honesty
 * as a coat.
 *
 * Two measurements decided the design (2026-08-23):
 *   · `relation(id);way(r);out tags geom;` returns every member way WITH its
 *     tags and its geometry in ONE request — 48 KB and 17 ways for Stórurð,
 *     carrying surface, highway and sac_scale. The page was already fetching
 *     the geometry alone, so this is strictly more information for the same
 *     round trip.
 *   · Open-Meteo's elevation endpoint is free, needs no key, sends
 *     `access-control-allow-origin: *`, and accepts a hard maximum of 100
 *     coordinates per request. A hundred samples is a good profile, so the line
 *     is resampled to fit rather than paged.
 *
 * ⚠️ LICENSING — the same exposure `conditions.ts` already carries, and for the
 * same reason. Open-Meteo's free tier is for NON-COMMERCIAL use and ICEFALL
 * intends to charge for Pro. Before this ships behind a paid plan, either take
 * their commercial tier or drop the dependency entirely by sampling Copernicus
 * GLO-30 at build time — which is the better answer anyway, because it makes
 * ascent a stored column that the Find page can sort and filter on instead of a
 * per-trail request. `elevationOf` is the only seam that would change.
 */

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

export interface TrailWay {
  tags: Record<string, string>;
  geometry: LatLon[];
  /** Metres, measured off this way's own geometry. */
  lengthM: number;
}

/**
 * ⚠ THESE WAYS ARE NOT IN ROUTE ORDER.
 *
 * `way(r)` returns a relation's members sorted by OSM way id, which has nothing
 * to do with the order you walk them. Concatenating their geometry produces a
 * line that teleports back and forth across the map — measured on Stórurð, that
 * zigzag sampled out to **2,485 m of ascent on a 18 km walk**, and the noise
 * filter could not help because every jump was a real, sustained climb along a
 * nonsense path.
 *
 * So: use these ways for TAGS ONLY — surface, way type, grade — where each way
 * carries its own length and order is irrelevant. For the line itself use
 * `trailGeometry`, which reads the relation's members in membership order.
 */

/* -------------------------------------------------------------------------- */
/* The ways                                                                    */
/* -------------------------------------------------------------------------- */

const wayCache = new Map<number, Promise<TrailWay[]>>();

export function trailWays(osmId: number): Promise<TrailWay[]> {
  const hit = wayCache.get(osmId);
  if (hit) return hit;

  // Overpass only. Offline the surface/difficulty breakdown is simply absent,
  // which the trail page already renders as "not surveyed" rather than as zero.
  if (OFFLINE) return Promise.resolve([]);

  /*
   * DELIBERATELY NOT GIVEN A CALLER'S SIGNAL — see `trailGeometry` in
   * services/trails.ts for the full account. Same shared-promise cache, same
   * StrictMode double-mount, same failure: the first (deliberately torn down)
   * mount's abort was poisoning the cached promise before the real mount ever
   * read it, so `facts.ways` could come back short or empty with nothing on
   * screen saying so.
   */
  const promise = (async () => {
    const query = `[out:json][timeout:90];relation(${osmId});way(r);out tags geom;`;
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
          signal: withTimeout(OVERPASS_TIMEOUT_MS * 2),
        });
        const text = await res.text();
        if (!text.trimStart().startsWith("{")) continue;
        const json = JSON.parse(text) as {
          elements?: { type?: string; tags?: Record<string, string>; geometry?: LatLon[] }[];
        };
        const ways: TrailWay[] = [];
        for (const el of json.elements ?? []) {
          if (el.type !== "way" || !el.geometry?.length) continue;
          ways.push({
            tags: el.tags ?? {},
            geometry: el.geometry,
            lengthM: lineLength(el.geometry),
          });
        }
        if (ways.length) return ways;
      } catch {
        // Next mirror.
      }
    }
    return [];
  })();

  wayCache.set(osmId, promise);
  void promise.catch(() => wayCache.delete(osmId));
  return promise;
}

function lineLength(line: LatLon[]): number {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += haversine(line[i - 1], line[i]);
  return m;
}

/* -------------------------------------------------------------------------- */
/* Surface and way type                                                        */
/* -------------------------------------------------------------------------- */

export interface Segment {
  key: string;
  label: string;
  /** Metres of the route on this kind of ground. */
  metres: number;
  /** Share of the mapped total, 0–1. */
  share: number;
}

/**
 * OSM's `surface` vocabulary is long and inconsistent; a walker needs four
 * answers, not thirty. Anything unrecognised stays "other" rather than being
 * guessed into a class it might not belong to.
 */
const SURFACE_CLASS: Record<string, string> = {
  asphalt: "paved", concrete: "paved", paving_stones: "paved", sett: "paved",
  cobblestone: "paved", chipseal: "paved", metal: "paved", wood: "paved",
  compacted: "gravel", gravel: "gravel", fine_gravel: "gravel", pebblestone: "gravel",
  unpaved: "natural", ground: "natural", dirt: "natural", earth: "natural",
  grass: "natural", sand: "natural", mud: "natural", woodchips: "natural",
  rock: "rock", stone: "rock", scree: "rock",
};

const SURFACE_LABEL: Record<string, string> = {
  paved: "Paved",
  gravel: "Gravel",
  natural: "Natural ground",
  rock: "Rock",
  other: "Unrecorded",
};

/** `highway` says what KIND of way it is — a path, a track, or a road. */
const WAYTYPE_CLASS: Record<string, string> = {
  path: "path", footway: "path", steps: "path", bridleway: "path", cycleway: "path",
  track: "track",
  unclassified: "road", residential: "road", service: "road", living_street: "road",
  tertiary: "road", secondary: "road", primary: "road", trunk: "road", road: "road",
  pedestrian: "road",
};

const WAYTYPE_LABEL: Record<string, string> = {
  path: "Path",
  track: "Track",
  road: "Road",
  other: "Unrecorded",
};

function breakdown(
  ways: TrailWay[],
  classOf: (tags: Record<string, string>) => string,
  labels: Record<string, string>,
): Segment[] {
  const metres = new Map<string, number>();
  let total = 0;
  for (const w of ways) {
    const key = classOf(w.tags);
    metres.set(key, (metres.get(key) ?? 0) + w.lengthM);
    total += w.lengthM;
  }
  if (total === 0) return [];
  return [...metres.entries()]
    .map(([key, m]) => ({ key, label: labels[key] ?? key, metres: m, share: m / total }))
    .sort((a, b) => b.metres - a.metres);
}

export const surfaceBreakdown = (ways: TrailWay[]): Segment[] =>
  breakdown(ways, (t) => SURFACE_CLASS[t.surface ?? ""] ?? "other", SURFACE_LABEL);

export const waytypeBreakdown = (ways: TrailWay[]): Segment[] =>
  breakdown(ways, (t) => WAYTYPE_CLASS[t.highway ?? ""] ?? "other", WAYTYPE_LABEL);

/** SAC grades in order, so the HARDEST section can speak for the route. */
const SAC_ORDER = [
  "hiking",
  "mountain_hiking",
  "demanding_mountain_hiking",
  "alpine_hiking",
  "demanding_alpine_hiking",
  "difficult_alpine_hiking",
];

/**
 * The hardest graded section on the route, which is the grade that matters.
 *
 * A route that is T1 for nine kilometres and T4 for one is a T4 day: the
 * average would be a lie that gets somebody into trouble.
 */
export function hardestGrade(ways: TrailWay[]): string | undefined {
  let worst = -1;
  for (const w of ways) {
    const i = SAC_ORDER.indexOf(w.tags.sac_scale ?? "");
    if (i > worst) worst = i;
  }
  return worst >= 0 ? SAC_ORDER[worst] : undefined;
}

/* -------------------------------------------------------------------------- */
/* Elevation                                                                   */
/* -------------------------------------------------------------------------- */

const MAX_SAMPLES = 100; // Open-Meteo's hard per-request limit.

export interface Elevation {
  /** Metres above sea level, evenly spaced along the route. */
  points: number[];
  /** Cumulative metres climbed, noise-filtered. */
  ascentM: number;
  /** Cumulative metres descended, noise-filtered. */
  descentM: number;
  highestM: number;
  lowestM: number;
}

/**
 * Resamples a line to at most `n` evenly spaced points.
 *
 * Evenly by DISTANCE, not by index: OSM digitises a switchback with far more
 * nodes per metre than a straight valley track, so taking every k-th node would
 * sample the steep parts heavily and flatten the profile everywhere else.
 */
export function resample(line: LatLon[], n = MAX_SAMPLES): LatLon[] {
  if (line.length <= 2) return line;
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversine(line[i - 1], line[i]));
  const total = cum[cum.length - 1];
  if (total === 0) return [line[0]];

  const out: LatLon[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < cum.length - 1 && cum[j] < target) j++;
    const span = cum[j] - cum[j - 1] || 1;
    const f = (target - cum[j - 1]) / span;
    out.push({
      lat: line[j - 1].lat + (line[j].lat - line[j - 1].lat) * f,
      lon: line[j - 1].lon + (line[j].lon - line[j - 1].lon) * f,
    });
  }
  return out;
}

/**
 * Noise threshold for cumulative ascent, in metres.
 *
 * This is the single most important number here. A 30 m DEM has a vertical
 * error of several metres per sample, and summing every positive difference
 * turns that jitter into hundreds of metres of imaginary climbing — it is why
 * the same GPX gives different ascent totals in different apps. Only a sustained
 * rise or fall of more than this counts, which is the standard hysteresis fix.
 */
const NOISE_M = 10;

export function climbAndFall(points: number[]): { ascentM: number; descentM: number } {
  let ascent = 0;
  let descent = 0;
  let anchor = points[0];
  for (const p of points) {
    const delta = p - anchor;
    if (delta >= NOISE_M) {
      ascent += delta;
      anchor = p;
    } else if (delta <= -NOISE_M) {
      descent -= delta;
      anchor = p;
    }
  }
  return { ascentM: Math.round(ascent), descentM: Math.round(descent) };
}

const elevationCache = new Map<string, Promise<Elevation | null>>();

/**
 * The elevation profile of a trail, from Open-Meteo's free elevation endpoint.
 *
 * Sampled PER MEMBER WAY, never along a concatenated line, and this is the whole
 * trick. A relation's members are not guaranteed to be contiguous or to point
 * the same way, so joining them end to end invents distance and climb out of the
 * gaps: on Stórurð that produced 38.7 km and 1,775 m of ascent for a trail whose
 * surveyor recorded 14.6 km and 590 m. Each individual WAY, however, is ordered
 * and continuous by definition. So the 100 samples Open-Meteo allows are shared
 * out across the ways in proportion to their length, ascent is accumulated
 * within each way and then summed, and the gaps between ways are simply not
 * counted — which is right, because they are not part of the walk.
 *
 * Returns null rather than a flat line when it cannot answer: a profile that is
 * secretly zeros is worse than no profile.
 */
export function elevationOf(
  osmId: number,
  ways: TrailWay[],
  signal?: AbortSignal,
): Promise<Elevation | null> {
  const key = String(osmId);
  const hit = elevationCache.get(key);
  if (hit) return hit;

  // Open-Meteo's elevation API is the only source of the profile. Null is this
  // function's own documented answer for "cannot answer" — a profile that is
  // secretly zeros is worse than no profile — so offline it returns null.
  if (OFFLINE) return Promise.resolve(null);

  const promise = (async () => {
    const walked = ways.filter((w) => w.lengthM > 0);
    const total = walked.reduce((m, w) => m + w.lengthM, 0);
    if (total === 0) return null;

    // At least two samples per way, the rest shared out by length.
    const budget = Math.max(0, MAX_SAMPLES - walked.length * 2);
    const plan = walked.map((w) => ({
      way: w,
      n: 2 + Math.floor((budget * w.lengthM) / total),
    }));

    const coords: LatLon[] = [];
    for (const p of plan) coords.push(...resample(p.way.geometry, p.n));
    if (coords.length < 2) return null;

    const heights = await fetchElevation(coords.slice(0, MAX_SAMPLES), signal);
    if (!heights) return null;

    // Accumulate WITHIN each way, then sum. Never across the boundary.
    let ascentM = 0;
    let descentM = 0;
    const points: number[] = [];
    let at = 0;
    for (const p of plan) {
      const slice = heights.slice(at, at + p.n);
      at += p.n;
      if (slice.length < 2) continue;
      const { ascentM: up, descentM: down } = climbAndFall(slice);
      ascentM += up;
      descentM += down;
      points.push(...slice);
    }
    if (points.length < 2) return null;

    return {
      points,
      ascentM: Math.round(ascentM),
      descentM: Math.round(descentM),
      highestM: Math.round(Math.max(...points)),
      lowestM: Math.round(Math.min(...points)),
    };
  })();

  elevationCache.set(key, promise);
  void promise.catch(() => elevationCache.delete(key));
  return promise;
}

async function fetchElevation(
  coords: LatLon[],
  signal?: AbortSignal,
): Promise<number[] | null> {
  const url =
    "https://api.open-meteo.com/v1/elevation" +
    `?latitude=${coords.map((p) => p.lat.toFixed(5)).join(",")}` +
    `&longitude=${coords.map((p) => p.lon.toFixed(5)).join(",")}`;
  try {
    const res = await fetch(url, { signal: withTimeout(OVERPASS_TIMEOUT_MS, signal) });
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: number[] };
    const points = json.elevation?.filter((n) => Number.isFinite(n)) ?? [];
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

/** The walked length: the sum of the member ways, with no invented gaps. */
export const trailLengthKm = (ways: TrailWay[]): number =>
  ways.reduce((m, w) => m + w.lengthM, 0) / 1000;

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Walking time by DIN 33466 — the rule Alpine clubs actually use.
 *
 * Horizontal and vertical effort are computed separately, then the SMALLER is
 * halved and added to the larger, on the reasoning that you recover from one
 * while doing the other. 4 km/h on the flat, 300 m/h up, 500 m/h down.
 *
 * It is a fit walker's moving time and excludes every stop, which is why the
 * screen labels it "moving time" rather than "duration".
 */
export function walkingHours(lengthKm: number, ascentM: number, descentM: number): number {
  const horizontal = lengthKm / 4;
  const vertical = ascentM / 300 + descentM / 500;
  return Math.max(horizontal, vertical) + Math.min(horizontal, vertical) / 2;
}

export function formatHours(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* GPX                                                                         */
/* -------------------------------------------------------------------------- */

/** The route as GPX, so it can go to a watch or a handheld unit. */
export function toGpx(name: string, line: LatLon[], elevation?: number[] | null): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // The profile is 100 resampled points and the line is thousands, so heights
  // are only attached when the counts genuinely correspond.
  const withEle = elevation && elevation.length === line.length ? elevation : null;
  const pts = line
    .map((p, i) => {
      const ele = withEle ? `<ele>${withEle[i].toFixed(1)}</ele>` : "";
      return `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${ele}</trkpt>`;
    })
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<gpx version="1.1" creator="ICEFALL" xmlns="http://www.topografix.com/GPX/1/1">' +
    `<metadata><name>${esc(name)}</name>` +
    "<copyright author=\"OpenStreetMap contributors\"><license>https://opendatacommons.org/licenses/odbl/</license></copyright>" +
    "</metadata>" +
    `<trk><name>${esc(name)}</name><trkseg>${pts}</trkseg></trk></gpx>`
  );
}

/* -------------------------------------------------------------------------- */
/* The line, for drawing                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The route's line, taken from the member ways already fetched.
 *
 * The trail page was firing TWO heavy Overpass queries for overlapping data —
 * `relation(id);out geom;` for the map and `relation(id);way(r);out tags geom;`
 * for the surface and elevation. The second contains everything the first does
 * and more, so the first was pure cost, and on a throttled connection it was
 * usually the one that failed: hence a Map tab reading "couldn't load the line"
 * beside a page that had the geometry in memory the whole time.
 *
 * Returned as SEGMENTS rather than one array, deliberately. Joining the ways
 * end to end draws straight lines across every gap between them — the same
 * fiction that measured Stórurð at 38.7 km instead of 18.3 km, except on the map
 * you can see it.
 */
export function lineSegments(ways: TrailWay[]): LatLon[][] {
  return ways.filter((w) => w.geometry.length > 1).map((w) => w.geometry);
}

/** The longest single segment — what to draw when only one path is wanted. */
export function longestSegment(ways: TrailWay[]): LatLon[] {
  let best: LatLon[] = [];
  let bestM = 0;
  for (const w of ways) {
    if (w.lengthM > bestM && w.geometry.length > 1) {
      best = w.geometry;
      bestM = w.lengthM;
    }
  }
  return best;
}
