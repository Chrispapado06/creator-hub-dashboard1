/**
 * What a trail card actually shows.
 *
 * THE HISTORY, because this was got wrong repeatedly and each wrong answer
 * looked reasonable at the time:
 *
 *   1. Commons GEOSEARCH — "photographs taken near here". Broad coverage, and
 *      unusable: a filename cannot tell you what is in a picture, so Cyprus got
 *      a stranger's thumbs-up selfie and Chamonix got "Streets of Chamonix" and
 *      a war memorial. Commons also rate-limits, so a ten-card page left cards
 *      permanently empty.
 *   2. BUNDLED TERRAIN PHOTOS chosen by altitude band. Fast, but an Icelandic
 *      rhyolite massif stood in for a Cypriot pine ridge and a golf course at
 *      sunset stood in for a hill walk.
 *   3. CONTOUR PLATES only. Honest and instant, but it removed imagery from the
 *      product entirely — every card became a drawing.
 *
 * The mistake common to all three was looking for a PHOTOGRAPH of a trail, for
 * 77,141 OSM relations that mostly have none. Measured 2026-08-25: joining
 * Wikidata's P402 (OSM relation id) to P18 (image) — an exact join, no name
 * matching — yields a verified photograph for 370 of them. 0.5%.
 *
 * So the base layer is not a photograph. It is SATELLITE IMAGERY OF THE GROUND
 * THE TRAIL CROSSES, which is available for every trail on earth, is by
 * definition of the right place, and cannot contain a stranger. Measured on
 * four continents: HTTP 200, ~16 KB per tile, 68-250 ms, `access-control-
 * allow-origin: *`, no API key. It is also what the products this is measured
 * against actually show on a route card.
 *
 * ORDER OF PREFERENCE
 *   1. a Wikidata-verified photograph OF this exact relation  (370 trails)
 *   2. satellite imagery of its coordinates                    (everything else)
 *   3. a contour plate                                         (only if tiles fail)
 */

/* -------------------------------------------------------------------------- */
/* Slippy-map tile maths                                                      */
/* -------------------------------------------------------------------------- */

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);

const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * Zoom 12 — roughly 10 km across a tile at mid latitudes.
 *
 * Low enough that a whole day's walk sits inside the frame with its landforms
 * legible, high enough that ridges and valleys read as terrain rather than as a
 * brown smudge. At z14 a card shows one hillside and every trail looks alike.
 */
const ZOOM = 12;

/** Esri World Imagery. Keyless, CORS `*`, and note the y/x order in the path. */
const esri = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/**
 * The four tiles around a point, as a 2x2 grid in reading order.
 *
 * A single tile would be a third of the bytes, but the trail would sit at a
 * random position inside it — sometimes dead centre, sometimes against an edge.
 * Taking the containing tile plus its right, lower and lower-right neighbours
 * and centring the grid puts the coordinates near the middle of the card every
 * time, at ~64 KB total.
 */
export function satelliteTiles(lat: number, lon: number): string[] {
  const z = ZOOM;
  const x = lonToX(lon, z);
  const y = latToY(lat, z);
  const max = 2 ** z - 1;
  const cx = Math.min(Math.max(x, 0), max - 1);
  const cy = Math.min(Math.max(y, 0), max - 1);
  return [
    esri(z, cx, cy),
    esri(z, cx + 1, cy),
    esri(z, cx, cy + 1),
    esri(z, cx + 1, cy + 1),
  ];
}

/**
 * ⚠️ RUNNING ON THE FREE KEYLESS ESRI TIER — WHICH IS NONCOMMERCIAL-USE-ONLY.
 *
 * Esri doc G577 §2.2 grants this tier solely for use that does not "generate
 * income or promote the generation of income." `src/growth/tiers.ts` defines
 * a paid Pro tier, so this app no longer qualifies the moment billing goes
 * live — arguably already, since a free tier that exists to upsell a paid one
 * promotes that income. §2.1 also states these terms transfer no redistribution
 * right, and serving tiles inside a consumer app is redistribution.
 *
 * FIX BEFORE ANY PAID TIER IS SOLD: migrate to ArcGIS Location Platform
 * (location.arcgis.com/pricing — 2M basemap tiles/month free, then $0.15/1,000,
 * no minimum spend). Confirm with Esri first that the free tier there permits
 * commercial use; that was not stated on the pricing page as of 2026-08-25.
 *
 * Also do not: cache these tiles for offline use (the World Imagery item says
 * it "is not intended to be used to export tiles for offline" — check
 * `dist/sw.js` stays free of `arcgisonline` before adding any precaching), or
 * feed them to the Coach or any model (§2.3(e) bans AI/LLM training or
 * inclusion outright).
 *
 * The attribution string itself must track Esri's live copyrightText, which
 * changed to credit "Vantor" — Maxar's 2026 rebrand — not "Maxar".
 */
export const SATELLITE_CREDIT = "Satellite imagery · Esri, Vantor, Earthstar Geographics";

/* -------------------------------------------------------------------------- */
/* Verified photographs — two sources, two different claims                   */
/* -------------------------------------------------------------------------- */

/**
 * `kind` is the whole point of this file and must never be collapsed into one
 * generic "verified photo" type.
 *
 *   "of"    Wikidata records THIS OSM relation id (P402) against an item that
 *           carries an image (P18). An exact join — the same certainty that
 *           put a photograph on 370 trails before Geograph existed, and the
 *           reason it is captioned as being OF the trail, unqualified.
 *
 *   "near"  Geograph's own photographer filed the shot under a landscape
 *           class (Footpath, Bridleway, Moorland, ...) and it sits within 2km
 *           of the relation's coordinate. Real evidence — categorically
 *           stronger than the Commons filename-geosearch this file's own
 *           history document (`placePhotos.ts`, since removed) tried and
 *           abandoned, because the class is chosen by a person, not guessed
 *           from a filename. But it is still proximity, not identity, and the
 *           caption has to say "near" for the same reason "photographed near"
 *           existed before: a claim stronger than the evidence is a lie a
 *           user just cannot see.
 */
export type PhotoKind = "of" | "near";

export interface TrailPhoto {
  src: string;
  kind: PhotoKind;
  source: "commons" | "geograph";
  credit: string | null;
  license: string;
  pageUrl: string;
  category?: string;
}

interface PhotoEntryV2 {
  source: "commons" | "geograph";
  kind: PhotoKind;
  src: string;
  credit: string | null;
  license: string;
  pageUrl: string;
  category?: string;
}

interface PhotoFileV2 {
  v: 2;
  photos: Record<string, PhotoEntryV2>;
}

let photoIndex: Promise<Record<string, PhotoEntryV2>> | null = null;

/**
 * The relation-id -> photo map, fetched once.
 *
 * Not given a caller's AbortSignal, deliberately: it is a module-level
 * singleton shared by every card on the page, and binding a shared promise to
 * one caller's controller is exactly the bug that made Explore report
 * "Couldn't reach the trail database" on every cold open.
 */
function photos(): Promise<Record<string, PhotoEntryV2>> {
  if (!photoIndex) {
    photoIndex = fetch("/data/trails/photos.json")
      .then((r) => (r.ok ? (r.json() as Promise<PhotoFileV2>) : null))
      .then((j) => (j && j.v === 2 ? j.photos : {}))
      .catch(() => {
        photoIndex = null; // one failure must not poison the whole session
        return {};
      });
  }
  return photoIndex;
}

/**
 * A verified photograph for this relation, or null.
 *
 * "Verified" means one of the two `kind`s above — never a filename guess.
 */
export async function verifiedPhoto(osmId: number): Promise<TrailPhoto | null> {
  const map = await photos();
  const e = map[String(osmId)];
  return e ? { ...e } : null;
}

/** Synchronous peek, for avoiding a flash when the index is already loaded. */
export function cachedVerifiedPhoto(
  osmId: number,
  loaded: Record<string, PhotoEntryV2> | null,
): TrailPhoto | null {
  const e = loaded?.[String(osmId)];
  return e ? { ...e } : null;
}

/**
 * The caption says exactly what is known, per `kind` — this is the one place
 * in the app that turns "of" vs "near" into words a user actually reads.
 */
export function photoCaption(name: string, photo: TrailPhoto): string {
  if (photo.kind === "of") {
    return `${name} · Wikimedia Commons`;
  }
  // "near" — Geograph. Their terms require the photographer credited by name
  // with a link to the photo page and to the licence; this is the text half
  // of that (see `TrailImage`'s pageUrl for the linked half on the hero).
  const cat = photo.category ? `${photo.category} near ` : "Near ";
  return `${cat}${name} · ${photo.credit ?? "Unknown photographer"} · CC BY-SA 2.0 · Geograph`;
}
