import { PEAKS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { OFFLINE } from "@/offline/offline";
import { OFFLINE_HOME_PLACE, offlineSearchPlaces } from "@/offline/fixtures";

/**
 * WHERE YOU ARE — anywhere on earth.
 *
 * The first cut of this shipped eleven hard-coded trailhead towns, which is fine
 * if you live in Chamonix and useless if you live in Boulder, Wanaka or Sapporo.
 * A search that only works where the catalogue already looks good is not a
 * search.
 *
 * So: Photon (OpenStreetMap autocomplete, no key, already used for peak search)
 * geocodes any populated place worldwide, plus the device's own GPS for "here".
 * The suggestions below are a starting point for an empty box, not the menu.
 */

export interface Place {
  id: string;
  name: string;
  /** "Haute-Savoie, France" — whatever the geocoder can tell us. */
  region: string;
  lat: number;
  lon: number;
  /** "Country", "Island", "Town"… — shown so two same-named places are telling apart. */
  kind?: string;
  /** OSM element type the geocoder matched: R(elation), W(ay) or N(ode). */
  osmType?: string;
  /** OSM element id, so a country can be searched as an AREA rather than a circle. */
  osmId?: number;
}

const PHOTON = "https://photon.komoot.io/api/";
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";

/**
 * Somewhere to start when the box is empty. Real mountain towns on four
 * continents — deliberately not the eleven that happen to sit under ICEFALL's
 * documented routes, so the list doesn't imply the world ends there.
 */
export const SUGGESTED_PLACES: Place[] = [
  { id: "s:chamonix", name: "Chamonix", region: "Haute-Savoie, France", lat: 45.9237, lon: 6.8694 },
  { id: "s:zermatt", name: "Zermatt", region: "Valais, Switzerland", lat: 46.0207, lon: 7.7491 },
  { id: "s:innsbruck", name: "Innsbruck", region: "Tyrol, Austria", lat: 47.2692, lon: 11.4041 },
  { id: "s:boulder", name: "Boulder", region: "Colorado, United States", lat: 40.015, lon: -105.2705 },
  { id: "s:seattle", name: "Seattle", region: "Washington, United States", lat: 47.6062, lon: -122.3321 },
  { id: "s:canmore", name: "Canmore", region: "Alberta, Canada", lat: 51.0884, lon: -115.3479 },
  { id: "s:wanaka", name: "Wānaka", region: "Otago, New Zealand", lat: -44.6942, lon: 169.1421 },
  { id: "s:kathmandu", name: "Kathmandu", region: "Bagmati, Nepal", lat: 27.7172, lon: 85.324 },
  { id: "s:mendoza", name: "Mendoza", region: "Mendoza, Argentina", lat: -32.8895, lon: -68.8458 },
  { id: "s:imlil", name: "Imlil", region: "Marrakesh-Safi, Morocco", lat: 31.1361, lon: -7.9192 },
  { id: "s:matsumoto", name: "Matsumoto", region: "Nagano, Japan", lat: 36.238, lon: 137.972 },
  { id: "s:bergen", name: "Bergen", region: "Vestland, Norway", lat: 60.3913, lon: 5.3221 },
];

/** The one we open on, until the athlete says otherwise. */
export const DEFAULT_PLACE = SUGGESTED_PLACES[0];

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string>;
}

/** "Chamonix" + "Haute-Savoie" + "France", minus the repetition and the blanks. */
function regionOf(p: Record<string, string>): string {
  const parts = [p.district, p.city, p.county, p.state, p.country].filter(
    (x): x is string => Boolean(x) && x !== p.name,
  );
  return [...new Set(parts)].slice(0, 2).join(", ");
}

function toPlace(f: PhotonFeature): Place | null {
  const p = f.properties ?? {};
  const c = f.geometry?.coordinates;
  if (!p.name || !c) return null;
  const kind = String(p.osm_type ?? "N").toUpperCase().charAt(0);
  return {
    id: `p:${kind}${p.osm_id ?? `${c[1]},${c[0]}`}`,
    name: p.name,
    region: regionOf(p),
    lat: c[1],
    lon: c[0],
    kind: KIND_LABEL[p.osm_value ?? ""] ?? KIND_LABEL[p.type ?? ""],
    osmType: p.osm_type,
    osmId: typeof p.osm_id === "number" ? p.osm_id : undefined,
  };
}

/**
 * The Overpass AREA id for a place, when searching its actual borders beats
 * searching a circle around its middle.
 *
 * A hundred-kilometre circle on a country's centroid is not the country. The
 * audit caught it in Iceland: Hvannadalshnúkur, at 2,110 m the highest mountain
 * in the country, sits 128 km from the centroid — outside — and so did eight of
 * the thirteen peaks above 1,800 m, and the Laugavegur trek. The app answered
 * with two rows, both the same volcano, and presented them as Iceland.
 *
 * Overpass derives an area id from a relation by adding 3600000000, so a country
 * the geocoder already identified can be searched exactly. Measured 2026-08-23:
 * the area query for Iceland returned all thirteen peaks in 11.0 s and 3 KB.
 */
export function areaIdFor(place: Place): number | undefined {
  if (!isWidePlace(place) || place.osmType !== "R" || !place.osmId) return undefined;
  return 3_600_000_000 + place.osmId;
}

/**
 * How prominent a kind of place is.
 *
 * Filtering to settlements alone was wrong in the other direction: searching
 * "Cyprus" could no longer match the island, so the only hit left was **Cyprus,
 * a district of Newham in east London** — and the app cheerfully searched for
 * mountains there. Countries, islands and regions are back; what keeps them
 * useful is ranking, so the big Cyprus outranks the small one.
 */
const PLACE_RANK: Record<string, number> = {
  country: 100,
  state: 80,
  region: 78,
  province: 78,
  island: 75,
  archipelago: 72,
  county: 60,
  city: 50,
  municipality: 45,
  town: 40,
  village: 25,
  borough: 20,
  suburb: 15,
  district: 15,
  locality: 10,
  hamlet: 5,
  quarter: 5,
  neighbourhood: 3,
};

const KIND_LABEL: Record<string, string> = {
  country: "Country",
  state: "State",
  region: "Region",
  province: "Province",
  island: "Island",
  archipelago: "Islands",
  county: "County",
  city: "City",
  municipality: "Municipality",
  town: "Town",
  village: "Village",
  borough: "Borough",
  suburb: "Suburb",
  district: "District",
  locality: "Locality",
  hamlet: "Hamlet",
};

/**
 * Places a climber could plausibly BE — the answer to "where are you?".
 *
 * Settlements and areas, down to a hamlet, because mountain bases genuinely are
 * hamlets. Below that are fragments OF a settlement — `locality`, `quarter`,
 * `neighbourhood`, `suburb`, `isolated_dwelling` — and they were the bulk of
 * what this search returned: nine of ten rows for "vietnam" were tiny districts
 * in Uganda, Cuba and the Philippines that happen to carry the name. Real
 * places, honestly reported, and none of them an answer to the question asked.
 *
 * An allow-list rather than a deny-list: an unfamiliar `osm_value` should be
 * left out and noticed, not let in and rendered with no label.
 */
const SEARCHABLE_PLACES = new Set([
  "country",
  "state",
  "region",
  "province",
  "island",
  "archipelago",
  "county",
  "city",
  "municipality",
  "town",
  "village",
  "hamlet",
]);

const rankOf = (p: Record<string, string>) =>
  PLACE_RANK[p.osm_value ?? ""] ?? PLACE_RANK[p.type ?? ""] ?? 1;

/**
 * Places big enough that "nearest" stops meaning anything.
 *
 * A country is a pin dropped on its centroid, and sorting summits by how close
 * they are to that pin is how a search for **Slovakia** answered with a row of
 * two-thousand-metre bumps and buried Gerlachovský štít — the highest mountain
 * in the country and in the whole Carpathian range — a hundred rows down. Ask
 * about an area and you mean its mountains, not the geometric middle of it.
 */
const WIDE_KINDS = new Set(["Country", "State", "Region", "Province", "Island", "Islands", "County"]);

export const isWidePlace = (place: Place) => WIDE_KINDS.has(place.kind ?? "");

/**
 * How well a name answers the query, in tiers. Prominence only breaks ties
 * *within* a tier — a country called Cyprus should beat a London suburb called
 * Cyprus, but neither should beat an exact match on something else.
 *
 * A place whose official name merely EXTENDS the query at a word boundary counts
 * as exact. Towns are routinely filed under their long form: typing "Chamonix"
 * has to reach **Chamonix-Mont-Blanc**, or a wine farm in Franschhoek called
 * Chamonix outranks the Chamonix everyone means.
 */
function matchTier(name: string, query: string): number {
  const n = name.toLowerCase();
  if (n === query) return 3;
  if (n.startsWith(query) && /[\s\-,/(]/.test(n.charAt(query.length))) return 3;
  if (n.startsWith(query)) return 2;
  if (n.includes(query)) return 1;
  return 0;
}

/**
 * Type-ahead over every place OSM knows about — worldwide, no key.
 *
 * Photon returns hits in its own relevance order, which does not know that a
 * country beats a bus-stop-sized district of the same name. So results are
 * re-sorted: an exact name match first, then by how prominent the kind of place
 * is, then by Photon's original order.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Photon is the geocoder and there is no offline substitute for "every place
  // on earth". The offline build searches the same short list the empty box
  // offers, so typing still finds something instead of finding nothing.
  if (OFFLINE) return offlineSearchPlaces(q);

  const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=20&lang=en&osm_tag=place`;
  try {
    const res = await fetch(url, { signal: withTimeout(PEAKS_TIMEOUT_MS, signal) });
    // Thrown, not swallowed into an empty array — see the note on the catch.
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const json = (await res.json()) as { features?: PhotonFeature[] };

    const wanted = q.toLowerCase();
    const scored: { place: Place; score: number; order: number }[] = [];
    const seen = new Set<string>();

    (json.features ?? []).forEach((f, order) => {
      const props = f.properties ?? {};
      const place = toPlace(f);
      if (!place) return;

      /*
       * A result whose NAME does not contain what was typed is not a result.
       *
       * `matchTier` already scores those 0, but 0 was never discarded — so
       * prominence alone carried them in, and searching "vietnam" offered
       * **Vienna** (city, rank 50) and **Viennay**. Photon is matching fuzzily
       * and that is reasonable of it; presenting the fuzz as an answer is not.
       * Verified against the live API before and after.
       */
      if (matchTier(place.name, wanted) === 0) return;

      /*
       * Only places this app can NAME.
       *
       * `kind` comes from `KIND_LABEL`, so an absent kind means the app has no
       * word for what it is about to offer — and the row renders with a blank
       * subtitle or bare coordinates. Those are exactly the sub-settlement
       * fragments that filled this search: `neighbourhood`, `quarter`,
       * `isolated_dwelling`. Nine of twelve results for "vietnam" were these.
       *
       * Structural rather than a deny-list: if we cannot say what a thing is,
       * we do not put it in front of somebody choosing where they are — and
       * anything new Photon starts returning is covered by the same rule.
       */
      if (!place.kind) return;

      // And a place-type that answers "where are you?" — see SEARCHABLE_PLACES.
      const value = props.osm_value ?? props.type ?? "";
      if (!SEARCHABLE_PLACES.has(value)) return;

      /*
       * Dedupe on the OSM element as well as the label.
       *
       * The name+region key misses the case where one element comes back twice
       * under different tags — same way, same id, two rows. The id is the thing
       * that is actually the same.
       */
      const key = place.osmId ? `osm:${place.osmType}${place.osmId}` : `${place.name}|${place.region}`;
      if (seen.has(key)) return;
      seen.add(key);

      scored.push({ place, score: matchTier(place.name, wanted) * 1000 + rankOf(props) * 10, order });
    });

    return scored
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, 10)
      .map((x) => x.place);
  } catch (err) {
    /*
     * A failed lookup is NOT an empty result, and returning `[]` for both made
     * the screen say "Nothing found for X" when the truth was that nobody had
     * looked. An abort is the exception: the caller cancelled it on the next
     * keystroke, and there is nothing to report.
     */
    if (err instanceof DOMException && err.name === "AbortError") return [];
    throw new PlaceSearchError();
  }
}

/** The lookup could not be made — as distinct from finding nothing. */
export class PlaceSearchError extends Error {
  constructor() {
    super("The place directory could not be reached");
    this.name = "PlaceSearchError";
  }
}

/* -------------------------------------------------------------------------- */
/* Here                                                                       */
/* -------------------------------------------------------------------------- */

/** What went wrong, in words the athlete can act on. */
export type LocateError = "denied" | "unavailable" | "insecure";

/**
 * The device's own position, named.
 *
 * Reverse-geocoded so the pill reads "Grindelwald" rather than a pair of
 * decimals — but the coordinates are what the search actually uses, so a failed
 * reverse lookup degrades to "Current location" instead of failing the search.
 */
export async function locateMe(): Promise<Place> {
  /*
   * GPS is a satellite fix rather than a request, so this would in principle
   * work offline — but naming the fix needs the reverse geocoder, and a browser
   * on a desk answers this in twelve seconds or not at all. The offline demo
   * opens on the sample athlete's own valley instead of hanging on a permission
   * prompt that leads nowhere.
   */
  if (OFFLINE) return OFFLINE_HOME_PLACE;

  if (!("geolocation" in navigator)) throw "unavailable" as LocateError;
  // Geolocation is gated on a secure context; over plain http on a LAN address
  // the callback simply never fires, which looks like a hang.
  if (!window.isSecureContext) throw "insecure" as LocateError;

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject((err.code === err.PERMISSION_DENIED ? "denied" : "unavailable") as LocateError),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  });

  const { latitude: lat, longitude: lon } = pos.coords;
  const named = await reverseGeocode(lat, lon);
  return named ?? { id: "here", name: "Current location", region: "", lat, lon };
}

async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  try {
    const res = await fetch(`${PHOTON_REVERSE}?lat=${lat}&lon=${lon}&lang=en&limit=1`, {
      signal: withTimeout(PEAKS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const p = json.features?.[0]?.properties;
    if (!p?.name && !p?.city) return null;
    return {
      id: "here",
      // Reverse lookups often land on a building; the town is what we want.
      name: p.city ?? p.name ?? "Current location",
      region: regionOf(p),
      // The GPS fix, never the geocoder's idea of the town centre.
      lat,
      lon,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Recents                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * v2 — v1 entries are dropped on sight.
 *
 * The place search used to rank a district of Newham above the country of the
 * same name, so anyone who searched "Cyprus" in that window has **"Cyprus —
 * London, England"** saved in their recents, and it keeps coming back every time
 * they open the sheet. Fixing the ranking does not fix the history it wrote, so
 * the history is versioned with it.
 */
const RECENT_KEY = "icefall.places.recent.v2";
const RECENT_LIMIT = 6;

/** Clears anything written by a version whose ranking we no longer trust. */
function dropStaleStore() {
  for (const k of ["icefall.places.recent.v1", "icefall.places.last.v1"]) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  }
}
dropStaleStore();

export function recentPlaces(): Place[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as Place[]) : [];
  } catch {
    return [];
  }
}

/** Remove one place from the history. A recent you cannot delete is a trap. */
export function forgetPlace(id: string): Place[] {
  const next = recentPlaces().filter((p) => p.id !== id);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function rememberPlace(place: Place): Place[] {
  const next = [place, ...recentPlaces().filter((p) => p.id !== place.id)].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode — recents are a convenience, not state the app depends on */
  }
  return next;
}

/** The place the search reopens on. */
const LAST_KEY = "icefall.places.last.v2";

export function lastPlace(): Place {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Place) : DEFAULT_PLACE;
  } catch {
    return DEFAULT_PLACE;
  }
}

export function saveLastPlace(place: Place) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(place));
  } catch {
    /* ignore */
  }
}
