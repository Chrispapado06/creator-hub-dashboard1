import { OVERPASS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { OFFLINE } from "@/offline/offline";
import type { LatLon } from "./trails";

/**
 * Real, tagged points along a trail — viewpoints, named landmarks, water,
 * parking. Never invented.
 *
 * Measured 2026-08-25 against six real Cyprus relations: the E4 main route
 * carries 863 tagged nodes within 150m of its own ways — viewpoints with a
 * compass `direction`, named attractions ("Kaledonian Waterfalls", "Cape Greco
 * View Point"), information boards. Three of the other five relations tested
 * carried a handful each; two carried none at all. That unevenness is kept —
 * a trail with nothing tagged shows a route line and a start marker, and
 * nothing else. It does not get a stand-in.
 *
 * `label` is set ONLY from the node's own `name` tag. A node with no name
 * keeps `label: null` and the map draws it as a plain numbered marker — never
 * a generic caption standing in for one that doesn't exist.
 */

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/** Kinds worth showing on a hiking route — deliberately narrow. */
const POI_QUERY = `
node(around.w:150)[tourism~"^(viewpoint|picnic_site|information|attraction)$"];
out body;
node(around.w:150)[natural="peak"];
out body;
node(around.w:150)[amenity~"^(drinking_water|parking)$"];
out body;`;

export type WaypointKind =
  | "viewpoint" | "peak" | "water" | "parking" | "information" | "picnic" | "landmark";

export interface TrailWaypoint {
  lat: number;
  lon: number;
  kind: WaypointKind;
  /** From OSM's own `name` tag — never synthesised. */
  label: string | null;
  /** Compass bearing a viewpoint faces, where OSM records one (`direction=45-220` etc). */
  direction?: string;
}

function kindOf(tags: Record<string, string>): WaypointKind {
  if (tags.natural === "peak") return "peak";
  if (tags.amenity === "drinking_water") return "water";
  if (tags.amenity === "parking") return "parking";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.tourism === "picnic_site") return "picnic";
  if (tags.tourism === "information") return "information";
  return "landmark"; // tourism=attraction
}

const cache = new Map<number, Promise<TrailWaypoint[]>>();

export function trailWaypoints(osmId: number): Promise<TrailWaypoint[]> {
  const hit = cache.get(osmId);
  if (hit) return hit;

  // Huts, springs and viewpoints come from Overpass and nowhere else. Offline
  // there are none to list, and an invented water source on a trail page is
  // exactly the class of thing this app must never print.
  if (OFFLINE) return Promise.resolve([]);

  /*
   * DELIBERATELY NOT GIVEN A CALLER'S SIGNAL.
   *
   * `trailGeometry` and `trailWays` in this codebase both carry the identical
   * fix, for the identical reason: this promise is shared via a module-level
   * cache, and React 18 StrictMode's deliberate mount -> unmount -> remount in
   * dev means the FIRST caller's cleanup can abort the fetch before the real,
   * lasting caller ever reads the cached promise it inherits. Binding this to
   * one caller's signal is how a genuinely working query came back looking
   * like an empty result, silently, with nothing on screen explaining why.
   */
  const promise = (async () => {
    const query = `[out:json][timeout:60];relation(${osmId});way(r)->.w;${POI_QUERY}`;
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
          elements?: { lat?: number; lon?: number; tags?: Record<string, string> }[];
        };
        const out: TrailWaypoint[] = [];
        for (const el of json.elements ?? []) {
          if (el.lat === undefined || el.lon === undefined) continue;
          out.push({
            lat: el.lat,
            lon: el.lon,
            kind: kindOf(el.tags ?? {}),
            label: el.tags?.name ?? null,
            direction: el.tags?.direction,
          });
        }
        return out;
      } catch {
        // Next mirror.
      }
    }
    return [];
  })();

  cache.set(osmId, promise);
  void promise.catch(() => cache.delete(osmId));
  return promise;
}

/**
 * Waypoints, ordered along the route and thinned.
 *
 * A dense information-board cluster (Avakas Gorge had five boards within a
 * few metres of each other) reads as noise, not as stops — this keeps the
 * nearest waypoint to each of N evenly-spaced points along the line, which is
 * the same idea `resample` already uses for the elevation profile.
 */
export function orderedWaypoints(
  line: LatLon[],
  points: TrailWaypoint[],
  max = 12,
): TrailWaypoint[] {
  if (points.length === 0 || line.length === 0) return [];

  /*
   * The line is DECIMATED before projection, and it has to be.
   *
   * The E4's own geometry is 24,269 points; measured against its 863 real
   * tagged waypoints, the naive nearest-point scan below is 21 million
   * distance calculations, synchronously, on the render thread — long enough
   * to freeze the tab and trip the browser automation harness's own hang
   * detector. This only ever needs "roughly what fraction along the route",
   * not the exact vertex — a few hundred samples places a waypoint to well
   * under 100 m of resolution on any trail in the index.
   */
  const RESAMPLE_MAX = 400;
  const step = Math.max(1, Math.floor(line.length / RESAMPLE_MAX));
  const sampled = line.filter((_, i) => i % step === 0);

  const distTo = (a: LatLon, b: TrailWaypoint) => {
    const dLat = a.lat - b.lat;
    const dLon = a.lon - b.lon;
    return dLat * dLat + dLon * dLon; // relative comparison only — no need for haversine here
  };

  // Project every waypoint onto its nearest point along the (decimated) line,
  // so "ordered along the route" is a real position, not just discovery order.
  const withPosition = points.map((p) => {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < sampled.length; i++) {
      const d = distTo(sampled[i], p);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return { p, pos: bestI / (sampled.length - 1 || 1) };
  });
  withPosition.sort((a, b) => a.pos - b.pos);

  if (withPosition.length <= max) return withPosition.map((w) => w.p);

  // Thin to `max`, keeping named landmarks over anonymous ones when two
  // compete for the same slot.
  const bucketed: typeof withPosition = [];
  for (let i = 0; i < max; i++) {
    const from = i / max, to = (i + 1) / max;
    const inBucket = withPosition.filter((w) => w.pos >= from && w.pos < to);
    if (!inBucket.length) continue;
    inBucket.sort((a, b) => (b.p.label ? 1 : 0) - (a.p.label ? 1 : 0));
    bucketed.push(inBucket[0]);
  }
  return bucketed.map((w) => w.p);
}
