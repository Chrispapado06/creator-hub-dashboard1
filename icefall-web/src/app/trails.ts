import { useEffect, useState } from "react";

/**
 * The real trail catalogue — the same OpenStreetMap index the phone app reads.
 *
 * Explore's Find tab previously held TEN hand-written routes: the Tour du Mont
 * Blanc, GR20, Kungsleden and so on. Real routes, but a list of ten, so
 * searching "cyprus" — or Norway, or Japan, or anywhere outside that handful —
 * returned "No matches" and looked like a broken search rather than an absent
 * catalogue. There are 77,141 trails in the index and Cyprus alone has 176.
 *
 * Rows are positional arrays, not objects, because 77k of them as objects is
 * several megabytes of repeated key names:
 *   [osmId, name, lat, lon, network, lengthKm, ref, kind]
 *
 * Country files load on demand and are cached for the session. The manifest's
 * bounding boxes are what make a text search affordable: a query only has to
 * open the countries whose box could contain a match.
 */

export type TrailNetwork = "iwn" | "nwn" | "rwn" | "lwn";

export const NETWORK_LABEL: Record<TrailNetwork, string> = {
  iwn: "International route",
  nwn: "National trail",
  rwn: "Regional route",
  lwn: "Local path",
};

/**
 * Which country each index file holds.
 *
 * The files are named by OSM relation id and carry no country name, so
 * searching "cyprus" matched only the two routes with "Cyprus" in their title —
 * not the 176 trails that are IN Cyprus. Resolved once against the OpenStreetMap
 * API and baked in here; a lookup nobody has to repeat at runtime.
 */
export const COUNTRY_BY_REL: Record<number, string> = {
  14296: "Slovakia", 16239: "Austria", 49715: "Poland", 51684: "Czechia",
  51701: "Switzerland", 52822: "Sweden", 58437: "Wales", 58446: "Scotland",
  58447: "England", 62273: "Ireland", 90689: "Romania", 186382: "Bulgaria",
  192307: "Greece", 214885: "Croatia", 218657: "Slovenia", 295480: "Portugal",
  299133: "Iceland", 307787: "Cyprus", 365331: "Italy", 1311341: "Spain",
  2202162: "France", 2978650: "Norway",
};

export interface Trail {
  osmId: number;
  name: string;
  lat: number;
  lon: number;
  network?: TrailNetwork;
  lengthKm: number | null;
  ref?: string;
  kind?: string;
  rel: number;
  /** Resolved from `rel` — what a person actually searches by. */
  country: string;
}

interface Manifest {
  countries: { rel: number; n: number; bbox: [number, number, number, number] }[];
}

type Row = [number, string, number, number, string?, number?, string?, string?];

const files = new Map<number, Promise<Trail[]>>();
let manifest: Promise<Manifest | null> | null = null;

function loadManifest(): Promise<Manifest | null> {
  manifest ??= fetch("/data/trails/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifest;
}

function loadCountry(rel: number): Promise<Trail[]> {
  let hit = files.get(rel);
  if (hit === undefined) {
    hit = fetch(`/data/trails/r${rel}.json`)
      .then((r) => (r.ok ? r.json() : { trails: [] }))
      .then((j: { trails?: Row[] }) =>
        (j.trails ?? []).map((t): Trail => ({
          osmId: t[0],
          name: t[1],
          lat: t[2],
          lon: t[3],
          network: t[4] as TrailNetwork | undefined,
          lengthKm: typeof t[5] === "number" ? t[5] : null,
          ref: t[6],
          kind: t[7],
          rel,
          country: COUNTRY_BY_REL[rel] ?? "",
        })),
      )
      .catch(() => []);
    files.set(rel, hit);
  }
  return hit;
}

/* -------------------------------------------------------------------------- */
/* Towns and cities                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Place search, for "Limassol" rather than only "Cyprus".
 *
 * ICEFALL HAS NO GAZETTEER. The manifest knows 22 countries and nothing
 * smaller, and inventing a town list would be inventing data. So towns come
 * from Photon — the same OpenStreetMap geocoder the phone app already uses for
 * peak search — asked only for `place:city`, `place:town` and `place:village`.
 * Free, no key, and CORS-open.
 *
 * Photon is rate-limited to roughly one request a second, which is why every
 * caller must debounce. Countries are answered locally and instantly from the
 * manifest; only the town half touches the network.
 */
const PHOTON = "https://photon.komoot.io/api/";

export interface Place {
  name: string;
  /** "Cyprus" — as Photon states it, used to find the country file. */
  country: string;
  /** The line under the name: "Limassol District · Cyprus". */
  detail: string;
  lat: number;
  lon: number;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lang=en` +
    "&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village";
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }[];
    };
    const out: Place[] = [];
    for (const f of json.features ?? []) {
      const pr = f.properties ?? {};
      const c = f.geometry?.coordinates;
      if (pr.name === undefined || c === undefined) continue;
      const parts = [pr.state, pr.country].filter((x) => x !== undefined && x !== "");
      out.push({
        name: pr.name,
        country: pr.country ?? "",
        detail: parts.join(" · "),
        lat: c[1],
        lon: c[0],
      });
    }
    return out;
  } catch {
    // Offline, rate-limited or blocked: countries still answer. No error shown.
    return [];
  }
}

/** Great-circle distance in km — used to say HOW near "near" is. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** The rel of the country file that could contain a place, by name. */
export function relForCountry(countries: TrailCountry[], country: string): number | null {
  const hit = countries.find((c) => c.name.toLowerCase() === country.trim().toLowerCase());
  return hit === undefined ? null : hit.rel;
}

/* -------------------------------------------------------------------------- */
/* The line itself                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A trail's actual course, fetched from Overpass on demand.
 *
 * THE PREBUILT INDEX HAS NO GEOMETRY. Each row carries a name, a network, a
 * length and ONE point — the centre of the relation's bounding box. That point
 * is enough to drop a marker and nothing like enough to draw a route, so the
 * line has to come from OpenStreetMap live. Ported from the phone app's
 * `services/trails.ts`, which paid for the three lessons below; none of them
 * are obvious and all three produce silent wrongness rather than errors.
 *
 * 1. **`out geom` on the RELATION, never `way(r)`.** `way(r)` returns member
 *    ways sorted by OSM way id, which has nothing to do with the order you walk
 *    them. Concatenating those produces a line that teleports back and forth
 *    across the map — on the phone that zigzag measured 2,485 m of ascent on an
 *    18 km walk. `relation(id);out geom;` returns members in MEMBERSHIP order,
 *    which is the order of the route.
 *
 * 2. **Skip `alternative` and `excursion` members.** They are variants of the
 *    route, not continuations of it, and splicing them into the line draws a
 *    spur that doubles back.
 *
 * 3. **The shared promise is deliberately NOT given a caller's AbortSignal.**
 *    React StrictMode mounts a component, tears it down and mounts it again; the
 *    first (throwaway) mount's cleanup would abort the very fetch the second,
 *    real mount then inherits from the cache. The symptom is no line, no error
 *    and nothing on screen to explain it. A caller going away should stop that
 *    caller listening, not cancel work every other caller is waiting on.
 */
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export interface LatLon {
  lat: number;
  lon: number;
}

interface GeomMember {
  type?: string;
  role?: string;
  geometry?: LatLon[];
}

const geometryCache = new Map<number, Promise<LatLon[]>>();

/** Ramer–Douglas–Peucker. 0.0004° is about 40 m — invisible at map scale. */
function simplify(points: LatLon[], tolerance: number): LatLon[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let index = -1;
  let far = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], first, last);
    if (d > far) {
      far = d;
      index = i;
    }
  }
  if (far <= tolerance || index === -1) return [first, last];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

function perpendicular(p: LatLon, a: LatLon, b: LatLon): number {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return Math.hypot(p.lon - a.lon, p.lat - a.lat);
  const t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
  const c = t < 0 ? a : t > 1 ? b : { lat: a.lat + t * dy, lon: a.lon + t * dx };
  return Math.hypot(p.lon - c.lon, p.lat - c.lat);
}

function trailGeometry(osmId: number): Promise<LatLon[]> {
  const cached = geometryCache.get(osmId);
  if (cached !== undefined) return cached;

  const promise = (async () => {
    const query = `[out:json][timeout:90];relation(${osmId});out geom;`;
    for (const url of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
        });
        const text = await res.text();
        if (!text.trimStart().startsWith("{")) continue;
        const json = JSON.parse(text) as { elements?: { members?: GeomMember[] }[] };
        const line: LatLon[] = [];
        for (const m of json.elements?.[0]?.members ?? []) {
          if (m.type !== "way" || m.geometry === undefined || m.geometry.length === 0) continue;
          if (m.role === "alternative" || m.role === "excursion") continue;
          line.push(...m.geometry);
        }
        if (line.length > 0) return simplify(line, 0.0004);
      } catch {
        /* try the next mirror */
      }
    }
    return [];
  })();

  geometryCache.set(osmId, promise);
  // A failure must not be cached, or the page can never recover from one.
  void promise.catch(() => geometryCache.delete(osmId));
  return promise;
}

/**
 * The selected trail's line, or an empty array.
 *
 * Empty is an ordinary answer — offline, on an Overpass timeout, or for a
 * relation with no drawable members. The map draws nothing in that case rather
 * than a straight line between two endpoints, which would be an invented route.
 */
export function useTrailLine(osmId: number | null): LatLon[] {
  const [line, setLine] = useState<LatLon[]>([]);
  useEffect(() => {
    if (osmId === null) {
      setLine([]);
      return;
    }
    let live = true;
    setLine([]);
    void trailGeometry(osmId)
      .then((l) => {
        if (live) setLine(l);
      })
      .catch(() => {
        if (live) setLine([]);
      });
    return () => {
      live = false;
    };
  }, [osmId]);
  return line;
}

/* -------------------------------------------------------------------------- */
/* Places — the 22 countries, for search-as-you-type                          */
/* -------------------------------------------------------------------------- */

/**
 * A country in the catalogue, with the box it occupies and how many routes
 * it holds.
 *
 * BOTH FIGURES ARE THE MANIFEST'S OWN, not estimates: `n` is the row count of
 * that country's file and `bbox` is the extent the harvest computed from the
 * routes in it. That is what makes "Cyprus · 176 routes" a claim the app can
 * keep, and what lets a click zoom to the real extent of a place rather than
 * to a hardcoded centre and guessed zoom.
 *
 * **`bbox` IS `[minLat, minLon, maxLat, maxLon]` — LATITUDE FIRST.** Not the
 * GeoJSON/MapLibre order, which is longitude first, and the two are impossible
 * to tell apart for a country whose ranges overlap (Cyprus is 34.6-35.7 lat and
 * 32.3-34.5 lon — both plausible either way). Verified against Norway, which
 * cannot be confused: its box starts 57.98, and Norway spans 57-71 north and
 * 4-31 east. Every consumer must swap the pairs for MapLibre.
 */
export interface TrailCountry {
  rel: number;
  name: string;
  count: number;
  /** [minLat, minLon, maxLat, maxLon] — see the note above. */
  bbox: [number, number, number, number];
}

/** The 22 countries, named and counted, once per session. */
export function useTrailCountries(): TrailCountry[] {
  const [list, setList] = useState<TrailCountry[]>([]);
  useEffect(() => {
    let live = true;
    void loadManifest().then((m) => {
      if (!live || m === null) return;
      setList(
        m.countries
          .map((c) => ({
            rel: c.rel,
            name: COUNTRY_BY_REL[c.rel] ?? "",
            count: c.n,
            bbox: c.bbox,
          }))
          .filter((c) => c.name !== "")
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
    return () => {
      live = false;
    };
  }, []);
  return list;
}

/**
 * Every route in one country.
 *
 * The name search cannot answer "show me Cyprus" — it matches route NAMES, and
 * a Cypriot path is not obliged to have "Cyprus" in its name. Picking a place
 * from the suggestions reads that country's file instead, which is the whole
 * file and therefore the whole truth about that country.
 */
export function useCountryTrails(rel: number | null): { trails: Trail[]; loading: boolean } {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (rel === null) {
      setTrails([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void loadCountry(rel).then((all) => {
      if (!live) return;
      setTrails(
        [...all]
          .filter((t) => t.name.trim() !== "")
          .sort((a, b) => (b.lengthKm ?? 0) - (a.lengthKm ?? 0)),
      );
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [rel]);
  return { trails, loading };
}

/* -------------------------------------------------------------------------- */
/* Photographs                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A trail photograph, and the credit that must appear with it.
 *
 * ── WHY `attribution` IS NOT OPTIONAL ───────────────────────────────────────
 *
 * 14,783 of the 15,928 photographs in the index are CC BY or CC BY-SA. Those
 * licences require the photographer's name AND the licence to be VISIBLE
 * wherever the image is shown. This is not a nicety: the family has already
 * shipped 1,772 photographs without credit once and had to correct it, and a
 * public website is a worse exposure than a signed-in app.
 *
 * So the type makes the mistake unavailable. There is no way to obtain `src`
 * without also obtaining a non-empty `attribution` — they arrive on the same
 * object or not at all, and `photoFor` returns null rather than half of one.
 * A future edit cannot drop the credit line without also dropping the image,
 * because it has nothing to render the image FROM.
 *
 * The eight entries with no credit recorded are skipped for the same reason:
 * a photograph we cannot attribute is a photograph we cannot show. Missing one
 * costs nothing — four French trails in five have none anyway.
 */
export interface TrailPhoto {
  src: string;
  /** "Haeferl · CC BY-SA 4.0" — rendered verbatim, never truncated. */
  attribution: string;
}

interface PhotoRow {
  src?: string;
  credit?: string;
  license?: string;
}

let photoIndex: Promise<Record<string, PhotoRow> | null> | null = null;

/**
 * 6.1 MB, so it is fetched ON DEMAND and never bundled — one request per
 * session, cached like the country files beside it. A failure is silent and
 * permanent for the session: no photographs is a normal state on this screen,
 * not an error worth a message.
 */
function loadPhotos(): Promise<Record<string, PhotoRow> | null> {
  photoIndex ??= fetch("/data/trails/photos.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ photos?: Record<string, PhotoRow> }>) : null))
    .then((j) => j?.photos ?? null)
    .catch(() => null);
  return photoIndex;
}

/** CC0 waives attribution; everything else here requires it. */
function isCC0(license: string): boolean {
  return license.trim().toUpperCase().startsWith("CC0");
}

function toPhoto(row: PhotoRow | undefined): TrailPhoto | null {
  if (row?.src === undefined || row.src === "") return null;
  const credit = (row.credit ?? "").trim();
  const license = (row.license ?? "").trim();
  if (credit !== "") {
    return { src: row.src, attribution: license === "" ? credit : `${credit} · ${license}` };
  }
  // No photographer recorded. Public domain is still showable and still says so.
  if (isCC0(license)) return { src: row.src, attribution: "Public domain · CC0" };
  return null;
}

/**
 * The photograph for one trail, or null.
 *
 * NULL IS THE ORDINARY ANSWER. Coverage is 19% overall and wildly uneven —
 * 99% across England, Wales and Scotland because Geograph is a British archive
 * with a free licence and an API, and 10% in France because there is no
 * Geograph for the Alps and Wikimedia Commons is thin for footpaths. A French
 * trail with no photograph is the normal case, four times in five.
 *
 * So a caller must render NOTHING when this is null — not a broken frame, not
 * a spinner, and above all not a generic mountain photograph, which would be
 * asserting a picture of a specific place that nobody has taken.
 */
export function useTrailPhoto(osmId: number): TrailPhoto | null {
  const [photo, setPhoto] = useState<TrailPhoto | null>(null);
  useEffect(() => {
    let live = true;
    void loadPhotos().then((index) => {
      if (live) setPhoto(toPhoto(index?.[String(osmId)]));
    });
    return () => {
      live = false;
    };
  }, [osmId]);
  return photo;
}

/**
 * Search every country whose box could hold a match.
 *
 * A name search cannot be narrowed by bounding box, so this opens all 22 files
 * — 5.8 MB once, then cached for the session. Country files are small and the
 * alternative is a search index ICEFALL has no server to build.
 */
export async function searchTrails(query: string, limit = 60): Promise<Trail[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const m = await loadManifest();
  if (m === null) return [];

  /*
   * A country name is the common case, so it is checked first and treated as a
   * different question: "cyprus" means the routes IN Cyprus, not the two whose
   * titles happen to contain the word.
   */
  const byCountry = m.countries.filter((c) =>
    (COUNTRY_BY_REL[c.rel] ?? "").toLowerCase().includes(q),
  );
  if (byCountry.length > 0) {
    const lists = await Promise.all(byCountry.map((c) => loadCountry(c.rel)));
    return lists
      .flat()
      .filter((t) => t.name.trim() !== "" && t.network !== "lwn")
      .sort((a, b) => (b.lengthKm ?? 0) - (a.lengthKm ?? 0))
      .slice(0, limit);
  }

  const all = await Promise.all(m.countries.map((c) => loadCountry(c.rel)));
  const hits: Trail[] = [];

  for (const list of all) {
    for (const t of list) {
      if (t.name.toLowerCase().includes(q) || (t.ref?.toLowerCase().includes(q) ?? false)) {
        hits.push(t);
        if (hits.length >= limit * 4) break;
      }
    }
  }

  // Longest first: someone searching a country wants its through-routes, not
  // the 400 m link path that happens to share the name.
  return hits.sort((a, b) => (b.lengthKm ?? 0) - (a.lengthKm ?? 0)).slice(0, limit);
}

/** The opening set — the longest routes across the whole index. */
export async function featuredTrails(limit = 24): Promise<Trail[]> {
  const m = await loadManifest();
  if (m === null) return [];
  const all = await Promise.all(m.countries.map((c) => loadCountry(c.rel)));
  return all
    .flat()
    .filter((t) => t.name.trim() !== "" && t.lengthKm != null && t.network !== "lwn")
    .sort((a, b) => (b.lengthKm ?? 0) - (a.lengthKm ?? 0))
    .slice(0, limit);
}

export function useTrails(query: string): { trails: Trail[]; loading: boolean } {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const run = query.trim().length >= 2 ? searchTrails(query) : featuredTrails();
    run
      .then((t) => {
        if (live) setTrails(t);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [query]);

  return { trails, loading };
}
