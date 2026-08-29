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
