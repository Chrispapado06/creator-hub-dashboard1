import { haversine } from "@/tracking/filters";
import { OVERPASS_TIMEOUT_MS, PEAKS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { displayName } from "./peakNames";
import { MOUNTAINS } from "@/data/mock/mountains";
import { OFFLINE } from "@/offline/offline";
import { offlineNearbyPeaks } from "@/offline/fixtures";

/**
 * Peak discovery.
 *
 * Two sources, deliberately:
 *   · a bundled catalogue of significant peaks — instant, works offline
 *   · live OpenStreetMap via Overpass — every named peak on earth, when online
 *
 * Both are OSM data under ODbL. The ten hand-written ICEFALL mountains keep
 * their own rich pages; everything else gets a derived assessment.
 */

export interface Peak {
  id: string;
  name: string;
  elevationM: number;
  lat: number;
  lon: number;
  wikipedia?: string;
  volcano?: boolean;
  /** Present when this peak is one of the curated ICEFALL objectives. */
  curatedId?: string;
  /** Metres from the search origin, when the search had one. */
  distanceM?: number;
  /** Country name, when a geocoder supplied one. */
  country?: string;
  /**
   * The name on the local map, when `name` is an English or romanised form of
   * it. Kept so the athlete can match a card against a signpost.
   */
  localName?: string;
  /** OSM's Wikidata id — the key to a verified photograph, see peakWikidata.ts. */
  wikidata?: string;
  /** A photograph of THIS peak, once one has been resolved. */
  photo?: string;
  /** Photographer and licence for `photo`. Required by CC BY wherever shown. */
  photoCredit?: string;
}

/** Compact on-disk shape — this file ships with the app, so it's terse. */
interface PackedPeak {
  n: string;
  e: number;
  a: number;
  o: number;
  w?: string;
  v?: number;
}

const BUNDLE_URL = "/data/peaks.json";

/**
 * Overpass instances, in the order they are tried.
 *
 * The list is short because a browser needs `Access-Control-Allow-Origin`, and
 * most public instances do not send one. Probed 2026-08-23 with an Origin
 * header: maps.mail.ru 200 + ACAO, overpass-api.de 200 + ACAO,
 * overpass.private.coffee 502 (and no ACAO even when it is up — so it could
 * never have answered the app, only logged a CORS failure),
 * overpass.kumi.systems 502, overpass.osm.jp no answer. The first two are
 * therefore the whole list; private.coffee was removed rather than left in to
 * burn a round trip on every search.
 */
const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

export const PEAK_ATTRIBUTION = "Peak data © OpenStreetMap contributors (ODbL)";

/* -------------------------------------------------------------------------- */
/* Bundled catalogue                                                           */
/* -------------------------------------------------------------------------- */

let bundlePromise: Promise<Peak[]> | null = null;

const packedToPeak = (p: PackedPeak): Peak => ({
  id: `osm:${p.a.toFixed(4)},${p.o.toFixed(4)}`,
  name: p.n,
  elevationM: p.e,
  lat: p.a,
  lon: p.o,
  wikipedia: p.w,
  volcano: p.v === 1,
});

/**
 * Curated mountains are matched by name so they keep their rich page.
 *
 * The name test is EXACT (per slash-separated alias), not a substring, and is
 * backed by an elevation check. A substring test made neighbouring peaks
 * impersonate the curated one: "Mont Blanc du Tacul" (4,248 m) sits 3.2 km from
 * Mont Blanc and contains its name, so it inherited `curatedId: "mont-blanc"` —
 * tapping it opened the 4,806 m Mont Blanc page with the Goûter Route, wore the
 * ICEFALL badge, and bound any goal made from it to the wrong mountain. "Chlyne
 * Eiger" did the same to Eiger. Both are separate summits with their own routes
 * and their own hazards, which is the kind of confusion that gets somebody hurt.
 *
 * The elevation tolerance absorbs the small disagreements between OSM and the
 * curated figures (4,807 vs 4,806; 3,970 vs 3,967).
 */
function withCurated(peak: Peak): Peak {
  const aliases = peak.name
    .toLowerCase()
    .split("/")
    .map((s) => s.trim());

  const hit = MOUNTAINS.find(
    (m) =>
      aliases.includes(m.name.toLowerCase()) &&
      Math.abs(peak.elevationM - m.elevationM) <= 50 &&
      haversine(peak, { lat: m.coords.lat, lon: m.coords.lon }) < 2000,
  );
  return hit ? { ...peak, curatedId: hit.id } : peak;
}

/** The curated ten, in `Peak` shape — the offline floor for the catalogue. */
const curatedFallback = (): Peak[] =>
  MOUNTAINS.map((m) => ({
    id: `curated:${m.id}`,
    name: m.name,
    elevationM: m.elevationM,
    lat: m.coords.lat,
    lon: m.coords.lon,
    curatedId: m.id,
  }));

export function loadPeakCatalogue(): Promise<Peak[]> {
  if (!bundlePromise) {
    bundlePromise = fetch(BUNDLE_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: PackedPeak[]) => rows.map(packedToPeak).map(withCurated))
      .catch(() => {
        // Offline before the catalogue was ever cached — fall back to the
        // curated mountains so the screen is never empty.
        //
        // The FAILURE IS NOT MEMOISED: clearing the cached promise means the
        // next caller retries the fetch. Previously one transient error pinned
        // the whole session to ten mountains, so a search for any other peak
        // came back empty for as long as the app stayed open — indistinguishable
        // from "that mountain isn't in ICEFALL".
        bundlePromise = null;
        return curatedFallback();
      });
  }
  return bundlePromise;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

export interface NearbyOptions {
  radiusM?: number;
  limit?: number;
  minElevationM?: number;
  /**
   * Overpass area id — search a country's real borders instead of a circle.
   * See `areaIdFor` in routes/places.ts for why this exists.
   */
  areaId?: number;
}

/** Instant results from the bundled catalogue. */
export async function nearbyFromCatalogue(
  lat: number,
  lon: number,
  { radiusM = 40_000, limit = 40, minElevationM = 0 }: NearbyOptions = {},
): Promise<Peak[]> {
  const all = await loadPeakCatalogue();
  return all
    .filter((p) => p.elevationM >= minElevationM)
    .map((p) => ({ ...p, distanceM: haversine({ lat, lon }, p) }))
    .filter((p) => (p.distanceM ?? Infinity) <= radiusM)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
    .slice(0, limit);
}

export async function searchCatalogueByName(query: string, limit = 30): Promise<Peak[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const all = await loadPeakCatalogue();
  return all
    .filter((p) => p.name.toLowerCase().includes(q))
    .sort((a, b) => b.elevationM - a.elevationM)
    .slice(0, limit);
}

/**
 * Runs one Overpass query against the mirrors in turn.
 *
 * Split out because a peak search now makes TWO queries — a count and a fetch —
 * and both need the same "try the next instance, an error page is not data"
 * handling. Returns null only when every mirror refused.
 */
async function overpass(query: string, signal?: AbortSignal): Promise<OverpassJson | null> {
  /*
   * Two passes over the mirror list, not one.
   *
   * Overpass refuses a request outright when its slots are busy, and it does so
   * by returning an empty body — measured twice in a row against maps.mail.ru,
   * the only instance that currently sends a CORS header: the first call came
   * back empty and the second, two seconds later, answered fine. One pass turned
   * that momentary refusal into "couldn't reach the summit database".
   */
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await new Promise((r) => setTimeout(r, 1_500));
    const found = await overpassPass(query, signal);
    if (found) return found;
  }
  return null;
}

async function overpassPass(query: string, signal?: AbortSignal): Promise<OverpassJson | null> {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        // Bounded per mirror, so a dead one cannot stall the whole walk.
        signal: withTimeout(OVERPASS_TIMEOUT_MS, signal),
      });
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue; // mirror returned an error page
      const json = JSON.parse(text) as OverpassJson;
      if (json.remark && /error/i.test(json.remark)) continue;
      return json;
    } catch {
      // Try the next mirror; Overpass instances go down regularly.
    }
  }
  return null;
}

interface OverpassJson {
  elements?: {
    type?: string;
    lat?: number;
    lon?: number;
    tags?: Record<string, string>;
  }[];
  remark?: string;
}

/** The peak half of an Overpass query, shared by the count and the fetch. */
function peakSelector(
  lat: number,
  lon: number,
  radiusM: number,
  minElevationM: number,
  areaId?: number,
) {
  /*
   * The elevation floor is applied BY OVERPASS, not afterwards.
   *
   * `out body 60` truncates before any client-side filter runs, so a search
   * around Slovakia spent its whole allowance on 400 m foothills and surfaced
   * four of the sixty-six peaks above 2,000 m that are actually there. Pushing
   * the floor into the query means the rows that come back are the rows worth
   * having.
   */
  const floor =
    minElevationM > 0 ? `(if: number(t["ele"]) >= ${Math.round(minElevationM)})` : "";
  const where = areaId ? `(area.searchArea)` : `(around:${Math.round(radiusM)},${lat},${lon})`;
  const scope = areaId ? `area(${areaId})->.searchArea;` : "";
  return `${scope}node["natural"~"peak|volcano"]["name"]["ele"]${floor}${where};`;
}

export interface NearbyLiveResult {
  /** The nearest summits, closest first. */
  peaks: Peak[];
  /** How many summits match inside the radius that was ASKED for. Exact. */
  total: number;
  /** The radius actually searched. Smaller than asked when the ground is dense. */
  radiusM: number;
}

/**
 * Every named peak around a point, straight from OpenStreetMap. Slower than the
 * catalogue and needs a network, so it runs *after* the instant results and
 * merges into them.
 *
 * It counts first, then fetches. That extra round trip buys the one thing a
 * single query cannot give: Overpass returns rows in node-id order, so
 * `out body 120` inside a hundred-kilometre circle hands back an arbitrary
 * hundred and twenty of however many thousand are there — and calling the
 * result "the nearest summits" would be a lie. Knowing the count first means
 * the circle can be shrunk to one that fits, so the rows that come back really
 * are the closest ones, and the total shown to the athlete is a measurement
 * rather than the row cap read back to them.
 */
export async function nearbyLive(
  lat: number,
  lon: number,
  opts: NearbyOptions = {},
  signal?: AbortSignal,
): Promise<NearbyLiveResult> {
  const { radiusM = 25_000, limit = 500, minElevationM = 0, areaId } = opts;

  /*
   * Offline, the same question is answered from the catalogue that ships with
   * the app. `public/data/peaks.json` is a bundled, precached asset — reading
   * it is the app reading its own files, not a request going anywhere — so the
   * arithmetic below is exactly the live path's, minus Overpass. The `total` is
   * still a real count of what was searched rather than a row cap read back.
   */
  if (OFFLINE) {
    const catalogue = await loadPeakCatalogue();
    return offlineNearbyPeaks(catalogue, lat, lon, radiusM, limit, minElevationM);
  }

  // The area id belongs in the key: the same point searched as "this country"
  // and as "a circle here" are two different questions with two answers.
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${Math.round(radiusM)},${limit},${minElevationM},${areaId ?? ""}`;

  const hit = liveCache.get(key);
  if (hit) return hit;

  const running = liveInflight.get(key);
  if (running) return running;

  const promise = fetchNearbyLive(lat, lon, radiusM, limit, minElevationM, areaId, signal)
    .then((r) => {
      liveCache.set(key, r);
      for (const stale of [...liveCache.keys()].slice(0, -4)) liveCache.delete(stale);
      return r;
    })
    .finally(() => liveInflight.delete(key));

  liveInflight.set(key, promise);
  return promise;
}

/**
 * Summit lists, for as long as the app is open.
 *
 * The search is now two Overpass round trips, and around a dense range that is
 * ten to twenty seconds. Without this, every return to the list — from a summit
 * page, or by toggling the activity — paid it again. A failed search is never
 * cached: `liveCache` is only written on success, so "Try again" really does.
 */
const liveCache = new Map<string, NearbyLiveResult>();
const liveInflight = new Map<string, Promise<NearbyLiveResult>>();

async function fetchNearbyLive(
  lat: number,
  lon: number,
  radiusM: number,
  limit: number,
  minElevationM: number,
  areaId: number | undefined,
  signal?: AbortSignal,
): Promise<NearbyLiveResult> {
  const asked = Math.round(radiusM);

  /*
   * The count and the fetch run CONCURRENTLY, not in sequence.
   *
   * Each round trip against public Overpass costs about ten seconds of server
   * queue whatever it asks — measured 2026-08-23, an 11.4 s answer for a 10 km
   * circle holding fourteen relations — so count-then-fetch was paying that
   * twice, serially, and the summit search took twenty seconds before a single
   * card could render. Fired together they cost one wait, and the count's only
   * remaining job is the rare correction: when the circle holds more than the
   * row limit, the optimistic fetch was truncated arbitrarily and a second,
   * shrunken fetch replaces it. Everywhere else — which is almost everywhere,
   * with the elevation floor doing its work — the optimistic fetch IS the
   * answer.
   */
  const [counted, optimistic] = await Promise.all([
    overpass(
      `[out:json][timeout:90];${peakSelector(lat, lon, asked, minElevationM, areaId)}out count;`,
      signal,
    ),
    overpass(
      `[out:json][timeout:90];${peakSelector(lat, lon, asked, minElevationM, areaId)}out body ${limit};`,
      signal,
    ),
  ]);
  if (!counted) throw new OverpassUnreachable();
  const total = Number(counted.elements?.[0]?.tags?.total ?? 0);
  if (total === 0) return { peaks: [], total: 0, radiusM: asked };

  /*
   * Area scales with r², so the radius that holds `limit` summits at the same
   * density is r·√(limit/total). A floor of five kilometres keeps a city-centre
   * search from collapsing to nothing, and the +10% headroom stops a slightly
   * uneven distribution from clipping the last page.
   */
  const search =
    total > limit && !areaId
      ? Math.max(5_000, Math.round(asked * Math.sqrt((limit * 1.1) / total)))
      : asked;

  const json =
    search === asked
      ? optimistic
      : await overpass(
          `[out:json][timeout:90];${peakSelector(lat, lon, search, minElevationM, areaId)}out body ${limit};`,
          signal,
        );
  if (!json) throw new OverpassUnreachable();

  const peaks: Peak[] = [];
  for (const el of json.elements ?? []) {
    const t = el.tags;
    if (!t?.name || !t.ele || el.lat == null || el.lon == null) continue;
    const ele = parseFloat(t.ele.replace(",", "."));
    if (!Number.isFinite(ele)) continue;
    // OSM stores the local name; show the English one where it exists.
    const named = displayName(t);
    if (!named) continue;
    peaks.push(
      withCurated({
        id: `osm:${el.lat.toFixed(4)},${el.lon.toFixed(4)}`,
        name: named.name,
        localName: named.localName,
        elevationM: Math.round(ele),
        lat: el.lat,
        lon: el.lon,
        wikipedia: t.wikipedia,
        wikidata: t.wikidata,
        volcano: t.natural === "volcano",
        distanceM: haversine({ lat, lon }, { lat: el.lat, lon: el.lon }),
      }),
    );
  }
  peaks.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  return { peaks, total, radiusM: search };
}

/** Thrown when no Overpass mirror answered. Distinct from an empty result. */
export class OverpassUnreachable extends Error {
  constructor() {
    super("No Overpass mirror answered");
    this.name = "OverpassUnreachable";
  }
}

/** Merges live results into catalogue results without duplicating a peak. */
const SAME_MOUNTAIN_M = 3_000;

/**
 * Merges live results into catalogue results without duplicating a peak.
 *
 * Identity is NAME PLUS PROXIMITY, not name plus rounded coordinates. Rounding
 * to two decimal places is a ~1 km grid, so Iceland's Bárðarbunga — mapped twice
 * about 2 km apart, at 2,014 m and 2,009 m — landed in two different cells and
 * came back as two summits. That was ICEFALL's entire answer for the country:
 * one volcano, listed twice. Where the same name appears twice within three
 * kilometres the higher reading wins, which is also the summit.
 */
export function mergePeaks(base: Peak[], extra: Peak[]): Peak[] {
  const merged: Peak[] = [];
  for (const p of [...base, ...extra]) {
    const twin = merged.findIndex(
      (q) => q.name === p.name && haversine(q, p) <= SAME_MOUNTAIN_M,
    );
    if (twin === -1) {
      merged.push(p);
    } else if (p.elevationM > merged[twin].elevationM) {
      // Keep whichever node carries the real summit height.
      merged[twin] = { ...p, distanceM: merged[twin].distanceM ?? p.distanceM };
    }
  }
  return merged.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
}

/* -------------------------------------------------------------------------- */
/* Global search by name                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Type-ahead search for a peak, anywhere.
 *
 * Two services, because neither does the whole job:
 *   · Photon    — OSM autocomplete. Matches partial words, which is what people
 *                 actually type. "annapu" finds Annapurna; a plain geocoder
 *                 finds nothing until the name is complete.
 *   · Nominatim — supplies the elevation Photon omits, for every result in a
 *                 single batch lookup.
 *
 * Elevation is not optional here: grade, kit, season and the training plan are
 * all derived from it, so a result without one is not useful.
 */

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM_LOOKUP = "https://nominatim.openstreetmap.org/lookup";

interface PhotonHit {
  name: string;
  lat: number;
  lon: number;
  osmRef: string;
  country?: string;
  volcano: boolean;
}

async function photonSearch(query: string, signal?: AbortSignal): Promise<PhotonHit[]> {
  const url =
    `${PHOTON}?q=${encodeURIComponent(query)}&limit=10&lang=en` +
    "&osm_tag=natural:peak&osm_tag=natural:volcano";
  const res = await fetch(url, { signal: withTimeout(PEAKS_TIMEOUT_MS, signal) });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    features?: {
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, string>;
    }[];
  };

  const out: PhotonHit[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!p.name || !c || p.osm_type === undefined || p.osm_id === undefined) continue;
    // Nominatim wants N/W/R prefixes: N123456.
    const kind = String(p.osm_type).toUpperCase().charAt(0);
    out.push({
      name: p.name,
      lat: c[1],
      lon: c[0],
      osmRef: `${kind}${p.osm_id}`,
      country: p.country,
      volcano: p.osm_value === "volcano",
    });
  }
  return out;
}

interface PeakDetails {
  elevationM: number;
  /** OSM's own link to the article about this peak — the key to its photograph. */
  wikipedia?: string;
}

/** One request for every result's elevation and Wikipedia link. */
async function detailsFor(refs: string[], signal?: AbortSignal): Promise<Map<string, PeakDetails>> {
  const map = new Map<string, PeakDetails>();
  if (refs.length === 0) return map;

  const url = `${NOMINATIM_LOOKUP}?osm_ids=${refs.slice(0, 40).join(",")}&format=jsonv2&extratags=1`;
  try {
    const res = await fetch(url, {
      signal: withTimeout(PEAKS_TIMEOUT_MS, signal),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return map;
    const rows = (await res.json()) as {
      osm_type?: string;
      osm_id?: number;
      extratags?: Record<string, string>;
    }[];
    for (const r of rows) {
      const ele = parseFloat(String(r.extratags?.ele ?? "").replace(",", "."));
      if (!Number.isFinite(ele) || !r.osm_type || r.osm_id === undefined) continue;
      map.set(`${r.osm_type.toUpperCase().charAt(0)}${r.osm_id}`, {
        elevationM: Math.round(ele),
        wikipedia: r.extratags?.wikipedia,
      });
    }
  } catch {
    /* elevation is best-effort; results without one are dropped by the caller */
  }
  return map;
}

export async function searchPeaksGlobal(query: string, signal?: AbortSignal): Promise<Peak[]> {
  const q = query.trim();
  // Two characters is a real mountain name — K2 was unfindable behind a 3-char gate.
  if (q.length < 2) return [];

  /*
   * Photon and Nominatim are the network half of peak search. Offline the
   * bundled catalogue answers on its own — `searchPeaks` already searches it
   * first and merges — so this half simply contributes nothing rather than
   * spending twenty seconds discovering that it cannot.
   */
  if (OFFLINE) return [];

  try {
    const hits = await photonSearch(q, signal);
    if (hits.length === 0) return [];

    const details = await detailsFor(
      hits.map((h) => h.osmRef),
      signal,
    );

    const out: Peak[] = [];
    for (const h of hits) {
      const d = details.get(h.osmRef);
      if (!d) continue; // no elevation, no assessment, no goal
      out.push(
        withCurated({
          id: `osm:${h.lat.toFixed(4)},${h.lon.toFixed(4)}`,
          name: h.name,
          elevationM: d.elevationM,
          lat: h.lat,
          lon: h.lon,
          wikipedia: d.wikipedia,
          country: h.country,
          volcano: h.volcano,
        }),
      );
    }
    return out.sort((a, b) => b.elevationM - a.elevationM);
  } catch {
    return [];
  }
}

/** Catalogue first for instant hits, then the world. */
export async function searchPeaks(query: string, signal?: AbortSignal): Promise<Peak[]> {
  const local = await searchCatalogueByName(query, 6);
  const global = await searchPeaksGlobal(query, signal);
  return rankByName(mergeByName(local, global), query);
}

/**
 * Rank matches by how the name matches, not by which source answered first.
 *
 * The catalogue matches on substring, so "ama" returned "Uia di Ciamarella" and
 * "Tour du Bramafan" — six Alpine near-misses that filled the list and pushed
 * Ama Dablam off the end. Someone typing three letters of a famous peak got
 * everything except the peak.
 *
 * Exact name first, then names starting with the query, then a word inside the
 * name starting with it, then any substring. Ties break on elevation, because
 * between two peaks sharing a name the higher one is the one people mean.
 */
function rankByName(peaks: Peak[], query: string): Peak[] {
  const q = query.trim().toLowerCase();
  if (!q) return peaks;

  const tier = (name: string): number => {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.split(/[\s/(),-]+/).some((w) => w.startsWith(q))) return 2;
    return 3;
  };

  // Copy first: callers pass arrays they still hold.
  return [...peaks].sort((a, b) => tier(a.name) - tier(b.name) || b.elevationM - a.elevationM);
}

function mergeByName(base: Peak[], extra: Peak[]): Peak[] {
  const seen = new Set(base.map((p) => `${p.name.toLowerCase()}|${p.elevationM}`));
  const out = [...base];
  for (const p of extra) {
    const key = `${p.name.toLowerCase()}|${p.elevationM}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Session cache                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything the user has seen this session, so opening a peak resolves
 * instantly — including live-only peaks that aren't in the bundled catalogue.
 */
const remembered = new Map<string, Peak>();

export function rememberPeaks(peaks: Peak[]) {
  for (const p of peaks) remembered.set(p.id, p);
}

/**
 * Resolves a peak id: session cache, then the bundled catalogue, then the peak's
 * own coordinates.
 *
 * The third step is what makes a peak URL shareable. Without it the page only
 * worked if you had just come from a list that happened to contain the peak, so
 * a reload — or a link sent to someone else — bounced to the index.
 */
export async function resolvePeak(id: string): Promise<Peak | null> {
  const hit = remembered.get(id);
  if (hit) return hit;

  const all = await loadPeakCatalogue();
  const bundled = all.find((p) => p.id === id);
  if (bundled) return bundled;

  const at = parsePeakId(id);
  if (!at) return null;
  try {
    // A tight radius around the id's own coordinates; the nearest match is the
    // peak the id was minted from.
    const { peaks: near } = await nearbyLive(at.lat, at.lon, { radiusM: 600, limit: 12 });
    const exact = near.find((p) => p.id === id);
    if (exact) rememberPeaks([exact]);
    return exact ?? null;
  } catch {
    return null;
  }
}

/** Decodes a peak id back into coordinates for the detail screen. */
export function parsePeakId(id: string): { lat: number; lon: number } | null {
  const m = /^osm:(-?\d+\.\d+),(-?\d+\.\d+)$/.exec(id);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}
