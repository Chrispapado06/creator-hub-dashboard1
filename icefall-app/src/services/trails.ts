import { OVERPASS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { haversine } from "@/tracking/filters";
import { displayName } from "./peakNames";

/**
 * Hiking trails, from OpenStreetMap route relations.
 *
 * A `relation[route=hiking]` is a real, named, waymarked trail — the Kaledonia
 * Waterfall Trail, the Tour des Dents du Midi, the E4 — put there by the people
 * who walk them, complete with geometry. That is the thing ICEFALL was missing:
 * its own catalogue documents twelve alpine lines on ten mountains, so "hiking
 * near you" was empty almost everywhere on earth.
 *
 * ── Why the list and the line are fetched separately ──────────────────────────
 * Measured against Chamonix on 2026-08-22:
 *
 *   tags + centre, 194 relations ............  83 KB, 12.6 s
 *   full geometry, 12 relations .............  31 MB, 31.4 s
 *   full geometry, 1 relation ...............  323 KB (6,123 points)
 *
 * So the list carries names, refs and a centre point; the line is fetched only
 * when a trail is opened, and simplified before it is drawn.
 *
 * Attribution is not optional: this is ODbL data. See `TRAIL_ATTRIBUTION`.
 */

/** The two instances that send a CORS header — see the note in `peaks.ts`. */
const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

export const TRAIL_ATTRIBUTION = "Trail data © OpenStreetMap contributors (ODbL)";

/** Thrown when no mirror answered — distinct from "no trails here". */
export class TrailsUnreachable extends Error {
  constructor() {
    super("No Overpass mirror answered");
    this.name = "TrailsUnreachable";
  }
}

export type TrailNetwork = "lwn" | "rwn" | "nwn" | "iwn";

export interface Trail {
  /** `trail:<osm relation id>` */
  id: string;
  osmId: number;
  name: string;
  /** The local-language name, when `name` is its English form. */
  localName?: string;
  /** Waymarking reference — "E4", "GR20", "CFRT". */
  ref?: string;
  /**
   * How far the trail reaches: local, regional, national, international.
   * A local walking network is a day out; an international one is a season.
   */
  network?: TrailNetwork;
  /**
   * Length in km. Since 2026-08-25 this is measured for 99.8% of the index —
   * `scripts/build-trail-lengths.mjs` has Overpass compute it server-side, so
   * it no longer depends on OSM's sparse `distance` tag. Still null where the
   * measurement came back implausible; see `lengthBroken`.
   */
  lengthKm: number | null;
  /**
   * True when OSM's own geometry measured to something that cannot be a trail
   * (see `IMPLAUSIBLE_LENGTH_KM`). `lengthKm` is null for these so no card
   * prints the nonsense figure — but they are emphatically not day hikes, so
   * ranking still needs to know.
   */
  lengthBroken?: boolean;
  /** Centre of the relation's bounding box — enough to place and sort it. */
  lat: number;
  lon: number;
  /** Metres from the search origin. */
  distanceM?: number;
  /** Waymark colour, from `osmc:symbol`. */
  colour?: string;
  operator?: string;
  website?: string;
  wikipedia?: string;
  wikidata?: string;
  /** `sac_scale` where the relation carries one — real difficulty, not derived. */
  sacScale?: string;

  /*
   * A hiking relation carries far more than a line. Surveying every trail
   * around Limassol turned up all of these in use — and the trail page was
   * telling the athlete "OpenStreetMap records the line and the waymarking, not
   * the ascent", which was simply wrong: `ascent` is a standard tag.
   */
  /** Total climb in metres, as mapped. */
  ascentM?: number;
  descentM?: number;
  /** Walking time in hours, as mapped. */
  durationH?: number;
  /** The mapper's own description of the trail. */
  description?: string;
  /** Where it starts, ends and what it passes. */
  from?: string;
  to?: string;
  via?: string;
  /** True when the trail returns to its start. */
  roundtrip?: boolean;
  /** How easy the path is to follow on the ground, as surveyed. */
  visibility?: string;
  /** Plain-language waymark description. */
  symbol?: string;
  officialName?: string;
  altName?: string;
}

/** "2:30" or "2.5" or "150 m" → a number. OSM is not strict about either. */
function num(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * `distance` as kilometres, or nothing.
 *
 * The tag is free text: "11.2", "6 km" and "6,5 km" all appear and all mean the
 * same thing. It was being read with `Number()`, which returns NaN for anything
 * carrying a unit — so every trail tagged "6 km" silently lost its length and
 * fell through to the slow per-trail geometry measurement.
 *
 * Values in miles are REJECTED rather than converted. They are rare, and a
 * wrong number on a mountain is worse than an absent one — 1.5 mi shown as
 * 1.5 km understates the walk by a third.
 */
function distanceKm(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (/\bmi(les?)?\b/i.test(value)) return undefined;
  return num(value);
}

/** `duration` is "h:mm" by convention, but "2.5" appears too. */
function hours(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const hm = /^(\d+):(\d{1,2})$/.exec(value.trim());
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  return num(value);
}

/* -------------------------------------------------------------------------- */
/* Nearby                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Collections rather than trails.
 *
 * Some relations gather every waymarked path in a commune into one object
 * ("Chemins pédestre de montagne, région Entremont"). They are legitimate OSM
 * and useless as a suggestion: you cannot walk a network. `type=network` catches
 * most; the rest are caught by having no ref, no distance and a name that
 * describes a set.
 */
const COLLECTION_NAME =
  /\b(chemins?\s+p[ée]destres?|r[ée]seau|network|wanderwege|sentieri|paths?\s+of|trail\s+network)\b/i;

interface OverpassRelation {
  id: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function overpass(query: string, signal?: AbortSignal): Promise<OverpassRelation[]> {
  /*
   * Two passes, as in `peaks.ts`: a busy Overpass instance refuses by returning
   * an empty body, and one pass turned that into "no trails here".
   */
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await new Promise((r) => setTimeout(r, 1_500));
    const found = await overpassPass(query, signal);
    if (found) return found;
  }
  throw new TrailsUnreachable();
}

async function overpassPass(
  query: string,
  signal?: AbortSignal,
): Promise<OverpassRelation[] | null> {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: withTimeout(OVERPASS_TIMEOUT_MS, signal),
      });
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue; // mirror served an error page
      const json = JSON.parse(text) as { elements?: OverpassRelation[]; remark?: string };
      if (json.remark && /error/i.test(json.remark)) continue;
      return json.elements ?? [];
    } catch {
      // Next mirror. Overpass instances go down, rate-limit and time out often.
    }
  }
  return null;
}

export interface NearbyTrailOptions {
  radiusM?: number;
  limit?: number;
  /**
   * How to order the answer. "near" for a town — the closest walk wins.
   * "significant" for a country — the named long-distance ways win.
   */
  rank?: "near" | "significant";
  /**
   * Overpass area id — search a country's real borders instead of a circle
   * around its middle. See `areaIdFor` in routes/places.ts.
   */
  areaId?: number;
}

/**
 * Named hiking trails around a point, nearest first.
 *
 * Local and regional routes are ranked above national and international ones:
 * the E4 passes through Cyprus and is 10,000 km long, which is true and is not
 * an answer to "where can I walk today".
 */
export async function nearbyTrails(
  lat: number,
  lon: number,
  { radiusM = 20_000, limit = 12, rank = "near", areaId }: NearbyTrailOptions = {},
  signal?: AbortSignal,
): Promise<Trail[]> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${Math.round(radiusM)},${areaId ?? ""}`;

  const order = rank === "significant" ? bySignificance : byProximity;

  const hit = resultCache.get(key);
  if (hit) return [...hit].sort(order).slice(0, limit);

  // Two components mounting at once — or React's development double-mount —
  // must not fire the same twelve-second query twice.
  const running = inflight.get(key);
  if (running) return [...(await running)].sort(order).slice(0, limit);

  /*
   * The SHARED promise is not given the caller's signal, for the same reason
   * the manifest is not — and this one was user-visible.
   *
   * `inflight` exists so a double-mount does not fire the same query twice.
   * But the stored promise used to carry the first caller's AbortSignal, so
   * when React unmounted that first effect and aborted it, the second effect
   * joined a promise that immediately rejected with an AbortError. Its own
   * `live` flag was true, so Explore rendered "Couldn't reach the trail
   * database" the instant it opened, every time, on a working connection —
   * and a manual retry then succeeded because nothing was racing it.
   *
   * A caller that goes away simply stops reading the result; it no longer gets
   * to cancel the work that the callers still on screen are waiting for. The
   * request is still bounded, by `withTimeout` inside `fetchNearbyTrails`.
   */
  const promise = fetchNearbyTrails(lat, lon, radiusM, areaId)
    .then((all) => {
      resultCache.set(key, all);
      // Two or three searched areas is all anyone holds in their head at once,
      // and a country's worth of relations is not small.
      for (const stale of [...resultCache.keys()].slice(0, -3)) resultCache.delete(stale);
      return all;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return [...(await promise)].sort(order).slice(0, limit);
}

/**
 * Trail lists, for as long as the app is open.
 *
 * Measured 2026-08-23: the Overpass relation query for a 100 km circle around
 * Chamonix takes **12.4 seconds** and returns 2,610 relations. Without this,
 * every visit to a trail and back — and every toggle between Hiking and
 * Mountaineering — paid that twelve seconds again. Deliberately in memory
 * rather than localStorage: a country's relations run to hundreds of kilobytes
 * and would crowd out the photograph cache, which benefits far more from
 * surviving a reload.
 */
const resultCache = new Map<string, Trail[]>();
const inflight = new Map<string, Promise<Trail[]>>();


/**
 * Overpass elements → `Trail`, shared by the list and the by-id lookup.
 *
 * Extracted because the detail page used to rebuild a trail by re-running a
 * NEARBY SEARCH and hunting for the id in the results — see `trailById`. Two
 * code paths producing the same object is how they drift apart.
 */
function toTrails(
  elements: OverpassRelation[],
  origin?: { lat: number; lon: number },
): Trail[] {
  const out: Trail[] = [];
  for (const el of elements) {
    const t = el.tags;
    if (!t?.name || !el.center) continue;
    if (t.type === "network") continue;
    if (COLLECTION_NAME.test(t.name) && !t.ref && !t.distance) continue;

    const named = displayName(t);
    if (!named) continue;

    /*
     * `num`, not `Number`.
     *
     * OSM's `distance` is free text and a great many editors write "6 km", not
     * "6". `Number("6 km")` is NaN, so every one of those trails silently lost
     * its length and fell through to the slow per-trail geometry measurement —
     * while `ascent`, twenty lines below, had been using the tolerant helper all
     * along. Same file, same shape of tag, two different parsers.
     */
    const distance = distanceKm(t.distance);

    out.push({
      id: `trail:${el.id}`,
      osmId: el.id,
      name: named.name,
      localName: named.localName,
      ref: t.ref,
      network: (["lwn", "rwn", "nwn", "iwn"] as const).find((n) => n === t.network),
      lengthKm: distance ?? null,
      lat: el.center.lat,
      lon: el.center.lon,
      distanceM: origin ? haversine(origin, { lat: el.center.lat, lon: el.center.lon }) : undefined,
      colour: t["osmc:symbol"]?.split(":")[1] || undefined,
      operator: t.operator,
      website: t.website ?? t["contact:website"],
      wikipedia: t.wikipedia,
      wikidata: t.wikidata,
      sacScale: t.sac_scale,
      ascentM: num(t.ascent),
      descentM: num(t.descent),
      durationH: hours(t.duration),
      description: t.description?.trim() || undefined,
      from: t.from,
      to: t.to,
      via: t.via,
      roundtrip: t.roundtrip === "yes" ? true : t.roundtrip === "no" ? false : undefined,
      visibility: t.trail_visibility,
      symbol: t.symbol,
      officialName: t.official_name,
      altName: t.alt_name,
    });
  }

  return out;
}

interface TrailManifest {
  v?: number;
  countries?: { rel: number; n: number; bbox: [number, number, number, number] }[];
}

let manifestPromise: Promise<TrailManifest | null> | null = null;

/**
 * The map of which countries have a prebuilt file. Fetched once, tiny.
 *
 * DELIBERATELY NOT GIVEN THE CALLER'S SIGNAL. This promise is a module-level
 * singleton shared by every search for the life of the page, and binding it to
 * one caller's AbortController meant the FIRST mount owned cancellation for
 * everybody: React's development double-mount aborted it during cleanup, and
 * the second mount — which was the one still on screen — joined a promise that
 * was already dying. It is 2 KB and it is wanted by every search, so it is
 * simply never cancelled.
 */
function trailManifest(): Promise<TrailManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch("/data/trails/manifest.json")
      .then((r) => (r.ok ? (r.json() as Promise<TrailManifest>) : null))
      .catch(() => {
        // A failed fetch must not poison every later search with null.
        manifestPromise = null;
        return null;
      });
  }
  return manifestPromise;
}

/**
 * The prebuilt files covering a POINT search, merged and distance-filtered.
 *
 * This is what makes a search around a town as fast as a search for a country:
 * "Vienna, 100 km" used to go to the public Overpass queue — ten seconds on a
 * good day — while Austria's complete trail set sat in a file the app already
 * had. The manifest's bounding boxes say which files can contain the circle
 * (two on a border), and the filtering is arithmetic on data already here.
 *
 * Returns null when no file covers the point — the caller then asks Overpass,
 * exactly as before. Returns null too when covering files exist but hold
 * nothing inside the radius: near a border that can mean the trails belong to
 * an unindexed neighbour, and a confident empty answer would be a lie.
 */
async function fetchPointFromIndexes(
  lat: number,
  lon: number,
  radiusM: number,
  signal?: AbortSignal,
): Promise<Trail[] | null> {
  const manifest = await trailManifest();
  if (!manifest?.countries?.length) return null;

  const latPad = radiusM / 111_320;
  const lonPad = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const covering = manifest.countries.filter(({ bbox: [a, b, c, d] }) =>
    lat >= a - latPad && lat <= c + latPad && lon >= b - lonPad && lon <= d + lonPad,
  );
  if (covering.length === 0) return null;

  const lists = await Promise.all(
    covering.map((c) => fetchCountryIndex(3_600_000_000 + c.rel, { lat, lon }, signal)),
  );
  const merged = lists
    .filter((l): l is Trail[] => l !== null)
    .flat()
    .filter((t) => (t.distanceM ?? Infinity) <= radiusM);
  return merged.length > 0 ? merged : null;
}



/**
 * The prebuilt index for a country, from ICEFALL's own CDN — or null.
 *
 * Measured 2026-08-23: asking public Overpass for Austria's hiking relations
 * live takes 44 seconds, which is past the client timeout, so the search for
 * any dense country FAILED every time — that was the "couldn't reach the trail
 * database" card. `scripts/build-trail-index.mjs` asks the question once,
 * offline, and ships the answer as a static file: the same 10,334 relations
 * arrive in ~150 KB gzipped at CDN speed. Countries without a file yet fall
 * through to the live query.
 */
async function fetchCountryIndex(
  areaId: number,
  origin: { lat: number; lon: number },
  signal?: AbortSignal,
): Promise<Trail[] | null> {
  const rel = areaId - 3_600_000_000;
  try {
    const res = await fetch(`/data/trails/r${rel}.json`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      v?: number;
      trails?: [number, string, number, number, TrailNetwork | null, number | null, string | null, string | null][];
    };
    if (json.v !== 1 || !Array.isArray(json.trails)) return null;
    return json.trails.map(([osmId, name, lat, lon, network, lengthKm, ref, sacScale]) => ({
      id: `trail:${osmId}`,
      osmId,
      name,
      ref: ref ?? undefined,
      network: network ?? undefined,
      lengthKm: plausibleLength(lengthKm),
      lengthBroken: lengthKm != null && lengthKm >= IMPLAUSIBLE_LENGTH_KM,
      lat,
      lon,
      distanceM: haversine(origin, { lat, lon }),
      sacScale: sacScale ?? undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchNearbyTrails(
  lat: number,
  lon: number,
  radiusM: number,
  areaId: number | undefined,
  signal?: AbortSignal,
): Promise<Trail[]> {
  if (areaId) {
    const indexed = await fetchCountryIndex(areaId, { lat, lon }, signal);
    if (indexed) return indexed.sort(byProximity);
  } else {
    const indexed = await fetchPointFromIndexes(lat, lon, radiusM, signal);
    if (indexed) return indexed.sort(byProximity);
  }

  /*
   * Live fallback. For a COUNTRY without a prebuilt file, the unfiltered query
   * cannot succeed — Austria needs 44 s of server time against a 20 s client
   * budget — so the area path asks only for the national and international
   * ways (measured: 14.4 s, 366 relations for Austria). That is precisely what
   * significance ranking would put first anyway; the file builder covers the
   * local paths as countries are added.
   */
  const scope = areaId ? `area(${areaId})->.searchArea;` : "";
  const filter = areaId ? `["network"~"iwn|nwn"]` : "";
  const where = areaId ? `(area.searchArea)` : `(around:${Math.round(radiusM)},${lat},${lon})`;
  const query =
    `[out:json][timeout:90];` +
    scope +
    `relation["route"="hiking"]["name"]${filter}${where};` +
    `out tags center;`;

  const elements = await overpass(query, signal);
  return toTrails(elements, { lat, lon }).sort(byProximity);
}

/**
 * One trail, by its OSM relation id.
 *
 * The detail page used to find a trail by re-running a THIRTY KILOMETRE nearby
 * search around the last searched place and looking for the id in the results.
 * That fails for most trails and always fails for a country search: Iceland's
 * Laugavegur sits 140 km from the pin and Stórurð 200 km, so neither could ever
 * appear in a 30 km lookup, and the page redirected away as though the trail did
 * not exist. It was capped at 60 results too, so even a close trail ranked 61st
 * was invisible.
 *
 * The old comment argued a direct id lookup "would be a second round trip for
 * data the list already has". It was paying for that round trip anyway — a full
 * thirteen-second area query — and then throwing the answer away. This asks
 * Overpass for the one relation, which is a few hundred bytes.
 *
 * Any warm list is still checked first, so arriving from the list costs nothing.
 */
export async function trailById(osmId: number, signal?: AbortSignal): Promise<Trail | null> {
  for (const list of resultCache.values()) {
    const hit = list.find((t) => t.osmId === osmId);
    if (hit) return hit;
  }
  const elements = await overpass(
    `[out:json][timeout:40];relation(${osmId});out tags center;`,
    signal,
  );
  return toTrails(elements)[0] ?? null;
}

const REACH: Record<TrailNetwork, number> = { lwn: 0, rwn: 1, nwn: 2, iwn: 3 };

/**
 * A name that describes a category rather than naming a trail.
 *
 * The worldwide audit surfaced a relation called simply "Nature trail" as the
 * fourth result for the whole of NORWAY, and "Viewpoint" inside Iceland's top
 * eight. They are legitimate OSM data — a local sign really does say that — but
 * as the headline answer to "show me Norway" they are noise, so they sort last.
 */
const GENERIC_NAME =
  /^(the\s+)?(nature\s+)?(trail|walk|path|loop|circle|route|viewpoint|rundweg|sentier|nature\s+walk|footpath|public\s+footpath)s?$/i;

/** Nearest first — the right answer when the search was a real point. */
function byProximity(a: Trail, b: Trail) {
  return (
    Number(GENERIC_NAME.test(a.name)) - Number(GENERIC_NAME.test(b.name)) ||
    REACH[a.network ?? "rwn"] - REACH[b.network ?? "rwn"] ||
    (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)
  );
}

/**
 * Length past which a route stops being a trip someone takes and starts being
 * a waymarked NETWORK that happens to cross a whole country.
 *
 * West Highland Way (154 km) and Laugavegur (55 km) are both genuinely famous
 * multi-day trips people set out to walk start to finish — exactly what the
 * fix below promotes, correctly. Cyprus's E4 Main Route is 956 km, the entire
 * island coast to coast; nobody is planning "the E4" as a trip the way they
 * plan the West Highland Way, and surfacing it as the #1 answer for "Cyprus"
 * put an unwalkable-in-a-normal-trip mega-route where a real hike belonged.
 * 200 km sits well clear of the legitimate famous routes above.
 *
 * MEASURED, NOT ASSUMED: the static per-country index stores `lengthKm` only
 * when OSM's own `distance` tag is present on the relation, which is most
 * relations' `null` — including the E4's. Length alone caught nothing.
 */
const MEGA_ROUTE_KM = 200;

/**
 * Longer than this and the number is not a trail length, it is broken data.
 *
 * The Great Trail in Canada — the longest recreational trail that exists — is
 * roughly 24,000 km. Measuring every indexed relation with Overpass surfaced
 * 26 that report more than that, topping out at "Camino Južna Istra" at
 * 192,000 km: relations whose members are scattered across a region rather
 * than joined into a route, so summing their segments measures nonsense.
 *
 * They are still real OSM relations and they still sort as mega-routes, which
 * is the right place for them. What must not happen is PRINTING the figure on
 * a card as though ICEFALL believes it — so the length is dropped to null and
 * the card says nothing, the same as any trail whose length is unknown.
 */
const IMPLAUSIBLE_LENGTH_KM = 25_000;

/** The stated length, or null where the data cannot be true. */
const plausibleLength = (km: number | null | undefined): number | null =>
  km != null && km > 0 && km < IMPLAUSIBLE_LENGTH_KM ? km : null;

/**
 * The official E-numbered European long-distance paths — E1 through E12,
 * standardised by the European Ramblers Association and carried in OSM's own
 * `ref` tag exactly as "E4", "E9", and so on. This is a real, structured
 * signal every relation in this network carries, unlike length. It is
 * deliberately NOT a loose `/^E\d+$/` — that also matches "E46", "E68" and
 * similar refs found in the same data, which read as a different, unrelated
 * national numbering scheme reusing the same letter, not an admission that
 * every one of them spans a country. Only the twelve real E-paths are named
 * here; a false negative leaves a trail ranked as before, a false positive
 * demotes a trail that did nothing wrong.
 */
const E_PATH_REFS = new Set(
  Array.from({ length: 12 }, (_, i) => `E${i + 1}`),
);

/**
 * Best first — the right answer when the search was a COUNTRY.
 *
 * Summits got this fix and trails did not, and the audit caught it in four
 * countries at once: Scotland answered with estate paths around Blair Atholl
 * while the West Highland Way was nowhere; Norway answered with village loops
 * and omitted Besseggen; Iceland led on four colour-coded paths in one small
 * wood and no Laugavegur. The cause was this comparator running REACH ascending,
 * which puts the most local network first — exactly backwards for a country,
 * where the international and national ways ARE the answer.
 *
 * That fix over-corrected for the E-numbered mega-routes: promoting "the
 * biggest network reach" put a trail spanning an entire country ahead of the
 * real, walkable famous trails the fix was written for. Mega-routes are
 * demoted to their own bucket, below every ordinary significant result —
 * still found, never first.
 */
function isMegaRoute(t: Trail): boolean {
  return (
    // A relation whose members do not join into a route measured 192,000 km.
    // Its length is hidden from the card, but it is still not a day hike.
    t.lengthBroken === true ||
    (t.lengthKm ?? 0) > MEGA_ROUTE_KM ||
    (t.ref != null && E_PATH_REFS.has(t.ref))
  );
}

function bySignificance(a: Trail, b: Trail) {
  const aMega = Number(isMegaRoute(a));
  const bMega = Number(isMegaRoute(b));
  return (
    aMega - bMega ||
    Number(GENERIC_NAME.test(a.name)) - Number(GENERIC_NAME.test(b.name)) ||
    REACH[b.network ?? "rwn"] - REACH[a.network ?? "rwn"] ||
    (b.lengthKm ?? 0) - (a.lengthKm ?? 0) ||
    (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)
  );
}

/* -------------------------------------------------------------------------- */
/* The line itself                                                            */
/* -------------------------------------------------------------------------- */

export interface LatLon {
  lat: number;
  lon: number;
}

interface GeomMember {
  type: string;
  role?: string;
  geometry?: LatLon[];
}

const geometryCache = new Map<number, Promise<LatLon[]>>();

/* -------------------------------------------------------------------------- */
/* Measured length                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How long a trail actually is.
 *
 * Only about one relation in six carries a `distance` tag — around Aylesbury it
 * was none of the ACW walks — so "Length not mapped" was the answer on almost
 * every card, which is honest and useless.
 *
 * The length is therefore MEASURED from the relation's own geometry and cached
 * for good. It costs one geometry fetch per trail (a few hundred kilobytes),
 * which is why it runs in the background one trail at a time rather than ten at
 * once, and why the result is written to localStorage: a trail's line does not
 * change, so the cost is paid once per trail per device, ever.
 */
const LENGTH_KEY = "icefall.trail-lengths.v1";

let lengthCache: Record<string, number> = (() => {
  try {
    const raw = localStorage.getItem(LENGTH_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
})();

function rememberLength(osmId: number, km: number) {
  lengthCache[osmId] = km;
  try {
    localStorage.setItem(LENGTH_KEY, JSON.stringify(lengthCache));
  } catch {
    /* private mode — measuring still works, it just re-measures next time */
  }
}

export const cachedLengthKm = (osmId: number): number | undefined => lengthCache[osmId];

/**
 * One at a time, in order.
 *
 * Ten simultaneous geometry fetches is several megabytes of parallel traffic on
 * a phone, and Overpass rate-limits hard enough that firing them together makes
 * every one of them fail.
 */
let queue: Promise<unknown> = Promise.resolve();

export function measureLength(osmId: number, signal?: AbortSignal): Promise<number | null> {
  const known = lengthCache[osmId];
  if (known !== undefined) return Promise.resolve(known);

  const run = queue.then(async () => {
    if (signal?.aborted) return null;
    if (lengthCache[osmId] !== undefined) return lengthCache[osmId];
    try {
      const line = await trailGeometry(osmId);
      if (line.length < 2) return null;
      // Measured off the SIMPLIFIED line, which is within ~40 m of the real one
      // over a whole trail — far inside the precision anyone plans with.
      const km = lengthOf(line);
      rememberLength(osmId, km);
      return km;
    } catch {
      return null;
    }
  });

  queue = run.catch(() => {});
  return run;
}

/**
 * The trail's actual line.
 *
 * One relation is a few hundred kilobytes and several thousand points — fine
 * for a page the athlete asked for, far too much for a list. The result is
 * simplified before it is returned, because nothing on this screen is drawn
 * larger than a few hundred pixels and a 6,000-point path costs the same to
 * render as a useful one.
 */
export function trailGeometry(osmId: number): Promise<LatLon[]> {
  const cached = geometryCache.get(osmId);
  if (cached) return cached;

  /*
   * DELIBERATELY NOT GIVEN A CALLER'S SIGNAL.
   *
   * This promise is cached in `geometryCache` and shared by every caller for
   * this osmId. React 18 StrictMode mounts every component once, tears it
   * down, and mounts it again — on purpose, to catch missing cleanup — and the
   * first mount's cleanup used to call `ctrl.abort()` on the very signal this
   * shared promise's fetch was using. The SECOND, real mount then received the
   * already-cached promise from the first call and inherited its abort: it
   * looked like `trailGeometry` simply returned no geometry, silently, with no
   * error visible (the caller's own `haveLine` check was masked by `segments`
   * succeeding independently) — and it was completely reproducible on both a
   * 24,000-point relation and a 200-point one, which is what pointed at
   * something structural rather than a network fluke. `nearbyTrails` and
   * `trailManifest` in this same file carry the identical fix, for the
   * identical reason: a caller going away should stop that caller from
   * listening, not cancel the work every other caller is still waiting on.
   */
  const promise = (async () => {
    const query = `[out:json][timeout:90];relation(${osmId});out geom;`;
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
          elements?: { members?: GeomMember[] }[];
        };
        const members = json.elements?.[0]?.members ?? [];
        const line: LatLon[] = [];
        for (const m of members) {
          // Guideposts and viewpoints are nodes with no geometry; the route is
          // the ways, and `forward`/`backward` variants are alternatives rather
          // than continuations.
          if (m.type !== "way" || !m.geometry?.length) continue;
          if (m.role === "alternative" || m.role === "excursion") continue;
          line.push(...m.geometry);
        }
        return simplify(line, 0.0004);
      } catch {
        /* next mirror */
      }
    }
    throw new TrailsUnreachable();
  })();

  geometryCache.set(osmId, promise);
  // A failed fetch must not be cached, or the page can never recover.
  void promise.catch(() => geometryCache.delete(osmId));
  return promise;
}

/**
 * Ramer–Douglas–Peucker, in degrees.
 *
 * A tolerance of 0.0004° is roughly 40 m — invisible at any size this app draws
 * a trail, and it takes a 6,000-point relation down to a few hundred.
 */
export function simplify(points: LatLon[], tolerance: number): LatLon[] {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

function perpendicular(p: LatLon, a: LatLon, b: LatLon): number {
  // Longitude degrees shrink with latitude; without this the simplification is
  // far more aggressive east-west than north-south at any useful latitude.
  const k = Math.cos((a.lat * Math.PI) / 180);
  const px = (p.lon - a.lon) * k;
  const py = p.lat - a.lat;
  const bx = (b.lon - a.lon) * k;
  const by = b.lat - a.lat;
  const len = bx * bx + by * by;
  if (len === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Walking length of a line, in km. Real, because it is measured. */
export function lengthOf(line: LatLon[]): number {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += haversine(line[i - 1], line[i]);
  return m / 1000;
}

export const NETWORK_LABEL: Record<TrailNetwork, string> = {
  lwn: "Local path",
  rwn: "Regional route",
  nwn: "National trail",
  iwn: "International route",
};

/**
 * `sac_scale` — the Swiss Alpine Club's mountain-hiking scale. Where OSM records
 * it, it is a real grade set by people who walked the ground, and far better
 * than anything ICEFALL could derive from a length.
 */
/** `trail_visibility` — how findable the path is on the ground. */
export const VISIBILITY_LABEL: Record<string, string> = {
  excellent: "Unmistakable",
  good: "Clear",
  intermediate: "Mostly clear",
  bad: "Faint in places",
  horrible: "Hard to follow",
  no: "No visible path",
};

export const SAC_LABEL: Record<string, string> = {
  hiking: "T1 · Hiking",
  mountain_hiking: "T2 · Mountain hiking",
  demanding_mountain_hiking: "T3 · Demanding mountain hiking",
  alpine_hiking: "T4 · Alpine hiking",
  demanding_alpine_hiking: "T5 · Demanding alpine hiking",
  difficult_alpine_hiking: "T6 · Difficult alpine hiking",
};
