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

import { OFFLINE } from "@/offline/offline";

/* -------------------------------------------------------------------------- */
/* Slippy-map tile maths                                                      */
/* -------------------------------------------------------------------------- */

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);

const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * THE MOSAIC'S ZOOM IS CHOSEN PER TRAIL, not fixed.
 *
 * It used to be a constant 12 — "roughly 10 km across a tile at mid latitudes",
 * low enough that a whole day's walk sits inside the frame and high enough that
 * ridges read as terrain. That is a good answer for a day walk and only for a
 * day walk. A 2x2 mosaic at z12 spans `2 x 40075 x cos(lat) / 4096` km, which
 * is 15.7 km at 35°N and 8.5 km above 60°N — so the further north the trail,
 * the less of it fits, and a long route did not fit at all. Measured on 440
 * trails with their real OSM bounding boxes: 84.6% of trails under 2 km fitted
 * the frame entirely, 31.0% of 10-25 km trails, 4.9% of 25-100 km trails and
 * 0.0% of the 13 trails over 100 km. Monarch's Way (990 km) had 0 of its
 * 29,740 mapped vertices inside the picture its own card was showing.
 *
 * So the span is sized to the trail. `zoomFor` picks the CLOSEST zoom whose
 * mosaic still contains the trail's mapped length, which both puts more detail
 * on a short walk (a 400 m circuit gets z14, ~4 km across, instead of a 16 km
 * smudge) and pulls back far enough for a long one to be in frame.
 *
 * The clamps are the honest part:
 *
 *   MAX 14   past this a card shows one hillside and every trail looks alike —
 *            the reason the constant was 12 rather than 15 in the first place.
 *   MIN 10   ~39 km across at 45°N. Below this the picture stops being a place
 *            and becomes a region: at z8 a card is a weather map. A trail
 *            longer than the z10 mosaic therefore does NOT get zoomed out to
 *            fit; it gets z10 and a caption that says the imagery is near the
 *            route rather than of it. `satelliteFramesWholeRoute` is what the
 *            caption asks, so that claim and this clamp can never drift apart.
 */
const MIN_ZOOM = 10;
const MAX_ZOOM = 14;
const DEFAULT_ZOOM = 12;

/** Equatorial circumference, km — the width of the whole tile grid at z0. */
const EARTH_KM = 40075.017;

/** How wide the 2x2 mosaic is on the ground, in km, at this latitude and zoom. */
export function mosaicSpanKm(lat: number, zoom: number): number {
  return (2 * EARTH_KM * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * The closest zoom whose mosaic still holds the whole trail.
 *
 * `lengthKm` is a path length, not a diameter, so using it as the span to cover
 * over-estimates what is needed for anything that bends — deliberately. Erring
 * wide costs a little detail; erring tight puts the trail outside its own
 * picture, which is the failure being fixed.
 *
 * With no measured length — OSM records one on a minority of relations — this
 * returns the old constant unchanged, so a trail whose length ICEFALL does not
 * know looks exactly as it did before.
 */
export function zoomFor(lat: number, lengthKm?: number | null): number {
  if (lengthKm == null || !Number.isFinite(lengthKm) || lengthKm <= 0) return DEFAULT_ZOOM;
  const wanted = Math.max(1.5, lengthKm * 1.15);
  for (let z = MAX_ZOOM; z > MIN_ZOOM; z--) {
    if (mosaicSpanKm(lat, z) >= wanted) return z;
  }
  return MIN_ZOOM;
}

/**
 * Does the mosaic actually contain the whole route?
 *
 * FALSE is not a failure — it is the difference between "here is the ground
 * this trail crosses" and "here is ground somewhere along it", and the caption
 * has to say which, for exactly the reason `kind` distinguishes "of" from
 * "near" further down this file. It is doubly true here because the coordinate
 * the mosaic is centred on is the centre of the relation's BOUNDING BOX
 * (`scripts/build-trail-index.mjs` stores Overpass `el.center`), which for an
 * L-shaped or very long route is frequently not a point on the route at all.
 *
 * Unknown length answers TRUE, because a claim needs evidence to be withdrawn
 * as much as to be made, and every trail behaved this way before.
 */
export function satelliteFramesWholeRoute(lat: number, lengthKm?: number | null): boolean {
  if (lengthKm == null || !Number.isFinite(lengthKm) || lengthKm <= 0) return true;
  return mosaicSpanKm(lat, zoomFor(lat, lengthKm)) >= lengthKm;
}

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
 * time, at ~64 KB total (42-80 KB measured).
 */
export function satelliteTiles(lat: number, lon: number, lengthKm?: number | null): string[] {
  // Streamed from Esri, so there is nothing to return offline. Every caller
  // already treats an unloaded tile as "keep showing the plate underneath".
  if (OFFLINE) return [];

  const z = zoomFor(lat, lengthKm);
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
 * The same tile, asked for again after it failed.
 *
 * A dropped connection is the ordinary case on a phone, and an <img> that
 * errored will not retry itself. Re-requesting the identical URL can be served
 * straight back out of the HTTP cache — including, in some browsers, a cached
 * failure — so the attempt number rides along as a query parameter. Verified
 * against Esri 2026-09-08: `?icefall_retry=1` returns the same HTTP 200 and the
 * same 21,151 bytes as the bare URL, so the parameter changes the cache key and
 * nothing else.
 */
export const tileAttemptUrl = (src: string, attempt: number) =>
  attempt === 0 ? src : `${src}?icefall_retry=${attempt}`;

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

/**
 * The same imagery, when the mosaic demonstrably does not hold the whole route.
 *
 * `SATELLITE_CREDIT` reads as a picture OF the trail, and for a walk that fits
 * inside the frame it is one. For a 990 km waymarked route it is a square of
 * real ground somewhere along — or, because the centre point is a bounding-box
 * centre, possibly just beside — the line. Saying "near the route" costs three
 * words and is the difference between a caption and a claim. Esri's credit is
 * carried identically either way: the licence is owed on the pixels, not on how
 * confidently they are described.
 */
export const SATELLITE_CREDIT_NEAR =
  "Satellite imagery near the route · Esri, Vantor, Earthstar Geographics";

/** The satellite caption this trail has actually earned. */
export const satelliteCredit = (lat: number, lengthKm?: number | null) =>
  satelliteFramesWholeRoute(lat, lengthKm) ? SATELLITE_CREDIT : SATELLITE_CREDIT_NEAR;

/* -------------------------------------------------------------------------- */
/* What the plate is, in words                                                */
/* -------------------------------------------------------------------------- */

/**
 * THE PLATE IS A DRAWING, AND THE CAPTIONS HERE SAY SO.
 *
 * The terminal caption used to read "Contours from elevation data — no imagery
 * for this area", which is not true of this app. `TrailPlate` takes one input,
 * `seed={osmId}`, and draws closed rings from a seeded PRNG; it reads no
 * elevation model, no geometry and no coordinate. It is deterministic and
 * distinct per trail, which is why it looks like data, and it is exactly that
 * resemblance that made the old wording easy to write and impossible to defend.
 * Naming a source the picture does not have is the same class of error as
 * captioning a photograph of one valley with the name of another.
 *
 * Three states, and none of them is allowed to be "loading" forever:
 *
 *   BEFORE   the tiles have not been asked for, because the card is not near
 *            the viewport yet. Honest, and it resolves the instant it scrolls
 *            into range — so it must not promise imagery it has not requested.
 *   DURING   the request is genuinely in flight. This one may say "loading",
 *            because something is loading.
 *   AFTER    every tile answered and too few arrived. The picture is the
 *            drawing, permanently, and the caption says why.
 */
export const PLATE_CAPTION = "Contours drawn on the device";
export const PLATE_CAPTION_LOADING = "Contours — imagery loading";
export const PLATE_CAPTION_NO_IMAGERY =
  "Contours drawn on the device — no aerial imagery for this point";
export const PLATE_CAPTION_OFFLINE =
  "Contours drawn on the device — imagery needs a connection";

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
    /*
     * A photograph OF the trail still needs its photographer named. This used
     * to return the site alone, which silently dropped the credit on every
     * "of" entry — the same CC BY-SA breach the `near` branch below was
     * written to avoid, hiding in the branch nobody re-read. Attribution is
     * owed per PHOTO, not per kind.
     */
    const who = photo.credit ?? "Unknown photographer";
    const site = photo.source === "geograph" ? "Geograph" : "Wikimedia Commons";
    return `${name} · ${who} · ${photo.license} · ${site}`;
  }
  /*
   * "near" — from Geograph OR from Commons, and the caption must say which.
   *
   * This used to hardcode "CC BY-SA 2.0 · Geograph" for every `near` entry,
   * which was true while Geograph was the only source of them. It is not any
   * more: the worldwide sweep adds Commons photographs under CC BY 4.0,
   * CC BY-SA 3.0 and others. Naming the wrong site and the wrong licence is
   * not a cosmetic bug — both sites' terms require the photographer credited
   * and the actual licence named, so the fields on the entry are used rather
   * than assumed.
   */
  const cat = photo.category ? `${photo.category} near ` : "Near ";
  const who = photo.credit ?? "Unknown photographer";
  const site = photo.source === "geograph" ? "Geograph" : "Wikimedia Commons";
  return `${cat}${name} · ${who} · ${photo.license} · ${site}`;
}
