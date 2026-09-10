/**
 * Real photographs of real mountains, from Wikimedia.
 *
 * The app ships 31 photographs. Ten of them are the curated ICEFALL mountains;
 * the rest are unnamed terrain. That was fine until the mountain library grew to
 * every peak on earth — at which point Ama Dablam, K2 and Annapurna all shared
 * the same generic image, which is exactly what "no images installed" looks like.
 *
 * So: fetch the actual photograph.
 *
 *   1. OSM tags most peaks with a `wikipedia` link (`en:Ama Dablam`,
 *      `de:Eiger`). That link is authoritative — the article is about that exact
 *      peak — so its lead image is a photograph of that exact peak. The bundled
 *      catalogue already carries these tags, and the live geocoder returns them.
 *   2. No tag: look the name up on English Wikipedia and only accept the result
 *      if Wikidata describes it as a mountain. "Olympus" alone resolves to a
 *      disambiguation page and "Jackson" to a person, so this gate is not
 *      optional.
 *   3. Neither: the caller falls back to terrain imagery, captioned as such.
 *
 * Requests inside the same tick are coalesced into one API call — a list of
 * eight search results costs two round trips, not sixteen.
 */

import { PHOTOS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { haversine } from "@/tracking/filters";
import { OFFLINE } from "@/offline/offline";

export interface PeakPhoto {
  src: string;
  /** Photographer, when Commons records one. Empty when it doesn't. */
  credit: string;
  /** Licence short name, e.g. "CC BY-SA 4.0". Empty when unrecorded. */
  license: string;
  /** The article the image was taken from, for attribution links. */
  pageUrl: string;
}

/**
 * The attribution line under a photograph.
 *
 * CC BY needs the photographer and the licence named; when Commons records
 * neither, saying so once beats stacking three placeholders into
 * "Wikimedia Commons · See Commons · Wikimedia Commons".
 */
export function photoCredit(subject: string, photo: PeakPhoto): string {
  const parts = [subject, photo.credit, photo.license, "Wikimedia Commons"].filter(Boolean);
  return [...new Set(parts)].join(" · ");
}

export const WIKIMEDIA_ATTRIBUTION = "Photography via Wikimedia Commons";

/** Wikidata one-liners that mean "this is a mountain". */
/** How far a name-guessed article may sit from the peak and still be it. */
const NAME_GUESS_RADIUS_M = 10_000;

const MOUNTAINISH =
  /\b(mountain|peak|summit|volcano|volcanic|massif|mount|hill|ridge|butte|nunatak|cerro|pico|berg)\b/i;
const NOT_A_PEAK = /disambiguation|surname|given name|municipality|village|town|band\b|film\b/i;

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * v3, not v2: entries written before the coordinate gate below may hold a
 * photograph of a different mountain with the same name (see `flush`), and a
 * cache that survives the fix keeps serving them. The old key is simply never
 * read again; the settings reset clears it with everything else.
 */
const CACHE_KEY = "icefall.peak-photos.v3";
const CACHE_LIMIT = 600;

/**
 * What one Wikipedia lookup yields: the lead photograph and the article's own
 * opening description. Both come from the same request, so they're cached
 * together — a peak page shouldn't pay for two round trips.
 */
export interface PeakFacts {
  photo: PeakPhoto | null;
  /** Plain-text intro from the article. Real prose about the real mountain. */
  summary: string | null;
  articleUrl: string | null;
}

type Entry = PeakFacts | null;

let cache: Record<string, Entry> = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
  } catch {
    return {};
  }
})();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const keys = Object.keys(cache);
      if (keys.length > CACHE_LIMIT) {
        // Oldest-inserted first: object key order is insertion order.
        cache = Object.fromEntries(keys.slice(-CACHE_LIMIT).map((k) => [k, cache[k]]));
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* quota — the in-memory cache still works for this session */
    }
  }, 400);
}

/** Exposed for the settings reset, which clears every other ICEFALL key too. */
export function clearPeakPhotoCache() {
  cache = {};
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Request batching                                                           */
/* -------------------------------------------------------------------------- */

interface Pending {
  key: string;
  lang: string;
  title: string;
  /** Name guesses need the "is it actually a mountain?" gate; OSM links don't. */
  needsGate: boolean;
  /** Where the peak is, so a name guess can be checked against the article's own position. */
  lat?: number;
  lon?: number;
  resolve: (facts: Entry) => void;
}

let queue: Pending[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = queue;
    queue = [];
    void flush(batch);
  }, 40);
}

/** Wikipedia rewrites titles (normalisation, redirects); follow the chain back. */
function titleResolver(query: {
  normalized?: { from: string; to: string }[];
  redirects?: { from: string; to: string }[];
}) {
  const alias = new Map<string, string>();
  for (const n of query.normalized ?? []) alias.set(n.from, n.to);
  for (const r of query.redirects ?? []) alias.set(r.from, r.to);
  return (title: string) => {
    let cur = title;
    for (let i = 0; i < 5 && alias.has(cur); i++) cur = alias.get(cur)!;
    return cur;
  };
}

interface WikiPage {
  title: string;
  thumbnail?: { source: string };
  pageimage?: string;
  extract?: string;
  terms?: { description?: string[] };
  /** The article's own position, when it has one. Primary first. */
  coordinates?: { lat: number; lon: number; primary?: string }[];
}

async function fetchPages(lang: string, titles: string[]): Promise<Map<string, WikiPage>> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1` +
    "&prop=pageimages|pageterms|extracts|coordinates&piprop=thumbnail|name&pithumbsize=1200" +
    "&wbptterms=description&exintro=1&explaintext=1&exsentences=4&coprimary=primary" +
    `&titles=${encodeURIComponent(titles.join("|"))}`;

  const res = await fetch(url, { signal: withTimeout(PHOTOS_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`wiki ${res.status}`);
  const json = (await res.json()) as {
    query?: {
      pages?: Record<string, WikiPage>;
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
    };
  };

  const pages = Object.values(json.query?.pages ?? {});
  const byTitle = new Map(pages.map((p) => [p.title, p]));
  const resolve = titleResolver(json.query ?? {});

  const out = new Map<string, WikiPage>();
  for (const t of titles) {
    const page = byTitle.get(resolve(t));
    if (page) out.set(t, page);
  }
  return out;
}

/**
 * Wikipedia hands back `pageimage` with underscores; Commons returns the same
 * file with spaces. Keying on the raw value dropped every credit on the floor.
 */
function fileKey(title: string) {
  return title
    .replace(/^File:/, "")
    .replace(/_/g, " ")
    .trim();
}

/** Commons holds the licence and the photographer; both are required by CC BY. */
async function fetchCredits(
  files: string[],
): Promise<Map<string, { credit: string; license: string }>> {
  const out = new Map<string, { credit: string; license: string }>();
  if (files.length === 0) return out;

  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName" +
    `&titles=${encodeURIComponent(files.map((f) => `File:${f}`).join("|"))}`;

  const res = await fetch(url, { signal: withTimeout(PHOTOS_TIMEOUT_MS) });
  if (!res.ok) return out;
  const json = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: { extmetadata?: Record<string, { value?: string }> }[];
        }
      >;
    };
  };

  for (const page of Object.values(json.query?.pages ?? {})) {
    const meta = page.imageinfo?.[0]?.extmetadata ?? {};
    out.set(fileKey(page.title), {
      credit: stripHtml(meta.Artist?.value) || "",
      license: stripHtml(meta.LicenseShortName?.value) || "",
    });
  }
  return out;
}

/**
 * Commons' Artist field is HTML. Tags are replaced with a SPACE, not nothing:
 * "<span>Brad Mering</span><br>Baltimore, MD" stripped to "" ran the name into
 * the city ("Brad MeringBaltimore, MD") on the Alpamayo caption. And the
 * boilerplate Commons writes where no author was machine-readable — "No
 * machine-readable author provided. Rubenfr assumed (based on copyright
 * claims)." — is reduced to the name it assumed, which is the attribution
 * Commons itself displays for the file.
 */
export function stripHtml(html?: string): string {
  const text = (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const assumed = /^No machine-readable author provided\.\s*(.+?)\s+assumed\s*\(based on copyright claims\)\.?$/i.exec(
    text,
  );
  return assumed ? assumed[1] : text;
}

async function flush(batch: Pending[]) {
  // One request per wiki language, chunked well under the 50-title API limit.
  const byLang = new Map<string, Pending[]>();
  for (const p of batch) {
    const list = byLang.get(p.lang) ?? [];
    list.push(p);
    byLang.set(p.lang, list);
  }

  const found: {
    pending: Pending;
    src: string;
    file?: string;
    page: string;
    summary: string | null;
  }[] = [];

  await Promise.all(
    [...byLang].map(async ([lang, items]) => {
      for (let i = 0; i < items.length; i += 40) {
        const chunk = items.slice(i, i + 40);
        try {
          const pages = await fetchPages(
            lang,
            chunk.map((c) => c.title),
          );
          for (const pending of chunk) {
            const page = pages.get(pending.title);
            const src = page?.thumbnail?.source;
            const description = page?.terms?.description?.[0] ?? "";

            /*
             * The gate is about identity, not illustration: an article with no
             * photograph can still be the right mountain and still describe it.
             *
             * TWO TESTS, NOT ONE. "Is the article about a mountain?" does not
             * ask "is it about THIS mountain?", and names repeat. Measured
             * 2026-09-11 on Cerro Pan de Azúcar, a 5,249 m Andean summit with
             * no `wikipedia` tag: the name guess resolved to enwiki's "Cerro
             * Pan de Azúcar" — a 400 m hill in Maldonado, Uruguay, 1,400 km
             * away — which passed the description gate ("hill") and put a
             * photograph of the wrong country on the page, captioned with a
             * real photographer's name. That is the proximity-matched failure
             * this project deleted an imagery system over. So a name guess
             * must also land where the peak is: the article's own coordinate
             * within 10 km of the query's, and an article with no coordinate
             * cannot be verified and is not used.
             */
            const at = page?.coordinates?.[0];
            const farAway =
              pending.lat !== undefined &&
              pending.lon !== undefined &&
              (!at ||
                haversine({ lat: pending.lat, lon: pending.lon }, { lat: at.lat, lon: at.lon }) >
                  NAME_GUESS_RADIUS_M);
            const wrongSubject =
              pending.needsGate &&
              (!MOUNTAINISH.test(description) || NOT_A_PEAK.test(description) || farAway);

            if (!page || wrongSubject) {
              pending.resolve(null);
              cache[pending.key] = null;
              continue;
            }

            const articleUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`;
            const summary = page.extract?.trim() || null;

            if (!src) {
              const facts: Entry = { photo: null, summary, articleUrl };
              cache[pending.key] = facts;
              pending.resolve(facts);
              continue;
            }
            found.push({ pending, src, file: page.pageimage, page: articleUrl, summary });
          }
        } catch {
          // Offline or rate-limited: resolve to null but do NOT cache, so the
          // next render can try again rather than permanently showing fallback.
          for (const pending of chunk) pending.resolve(null);
        }
      }
    }),
  );

  if (found.length === 0) {
    persist();
    return;
  }

  let credits = new Map<string, { credit: string; license: string }>();
  try {
    credits = await fetchCredits([
      ...new Set(found.map((f) => f.file).filter(Boolean) as string[]),
    ]);
  } catch {
    /* attribution unavailable — fall through to the generic credit below */
  }

  for (const f of found) {
    const meta = (f.file && credits.get(fileKey(f.file))) || undefined;
    /*
     * A CC BY licence cannot be satisfied without the photographer's name.
     * Commons holds files with an empty Artist field — `File:Sermitsiaq.jpg`
     * is one, and it rendered as "CC BY-SA 3.0 · Wikimedia Commons" with no
     * author, which is a licence term printed and not met. The article is
     * still the right one, so its summary and link are kept; only the
     * photograph is withheld, and the page falls back to the terrain plate.
     */
    const credit = meta?.credit ?? "";
    const license = meta?.license ?? "";
    const photo =
      requiresAttribution(license) && !credit
        ? null
        : { src: f.src, credit, license, pageUrl: f.page };
    const facts: Entry = { photo, summary: f.summary, articleUrl: f.page };
    cache[f.pending.key] = facts;
    f.pending.resolve(facts);
  }
  persist();
}

/** Licences that oblige the display to name the author. */
export const requiresAttribution = (license: string) => /^(CC[ -]BY|Attribution)/i.test(license);

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

const inflight = new Map<string, Promise<Entry>>();

export interface PeakPhotoQuery {
  name: string;
  /** The raw OSM tag, e.g. `en:Ama Dablam`. */
  wikipedia?: string;
  /**
   * Where the peak is. Used only to disambiguate the CACHE KEY for untagged
   * peaks — names repeat across ranges, and without coordinates the first
   * "Aiguille Verte" looked up would hand its photograph to every other one.
   */
  lat?: number;
  lon?: number;
}

/** ~1 km buckets — enough to separate distinct peaks, stable across callers. */
function coordKey(lat?: number, lon?: number): string {
  if (lat === undefined || lon === undefined) return "?";
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * THE one cache key. Both the async resolver and the synchronous read must
 * derive it here — two copies of this expression silently stop agreeing, and a
 * key that disagrees turns the synchronous read into a permanent miss.
 */
function cacheKeyFor(query: PeakPhotoQuery): string | null {
  const tagged = parseWikipediaTag(query.wikipedia);
  const title = tagged?.title ?? query.name.trim();
  if (!title) return null;
  return tagged
    ? `wp:${tagged.lang}:${title}`
    : `nm:${title.toLowerCase()}@${coordKey(query.lat, query.lon)}`;
}

/**
 * A photograph of this specific peak, or `null` when one can't be verified.
 *
 * Never returns a "close enough" image: an unverified photograph of the wrong
 * mountain is worse than no photograph, because nothing on screen would tell
 * the user which they were looking at.
 */
export function resolvePeakFacts(query: PeakPhotoQuery): Promise<Entry> {
  /*
   * Wikipedia and Commons are the only source of these, and there is no
   * honest offline substitute: a photograph of the wrong mountain is worse
   * than no photograph, and this module already refuses "close enough". So
   * offline it refuses everything, and every caller falls back to the bundled
   * terrain plate it already falls back to — the ten curated mountains keep
   * their own shipped photographs, which is most of what an offline demo sees.
   */
  if (OFFLINE) return Promise.resolve(null);

  const tagged = parseWikipediaTag(query.wikipedia);
  const lang = tagged?.lang ?? "en";
  const title = tagged?.title ?? query.name.trim();
  if (!title) return Promise.resolve(null);

  const key = cacheKeyFor(query);
  if (!key) return Promise.resolve(null);

  if (key in cache) return Promise.resolve(cache[key]);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = new Promise<Entry>((resolve) => {
    queue.push({ key, lang, title, needsGate: !tagged, lat: query.lat, lon: query.lon, resolve });
    schedule();
  }).finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/** Just the photograph, for the many callers that don't need the prose. */
export function resolvePeakPhoto(query: PeakPhotoQuery): Promise<PeakPhoto | null> {
  return resolvePeakFacts(query).then((f) => f?.photo ?? null);
}

/** Synchronous read for anything already resolved — avoids a render flash. */
export function cachedPeakFacts(query: PeakPhotoQuery): Entry | undefined {
  const key = cacheKeyFor(query);
  return key && key in cache ? cache[key] : undefined;
}

function parseWikipediaTag(tag?: string): { lang: string; title: string } | null {
  if (!tag) return null;
  const m = /^([a-z-]{2,12}):(.+)$/i.exec(tag.trim());
  if (!m) return null;
  const title = m[2].trim();
  return title ? { lang: m[1].toLowerCase(), title } : null;
}

/* -------------------------------------------------------------------------- */
/* Galleries                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Commons files that aren't photographs of the mountain. Categories are full of
 * maps, elevation profiles, route topos, coats of arms and the occasional
 * pronunciation recording — all correctly filed, none of them a summit shot.
 */
const NOT_A_PHOTO =
  /\b(map|karte|mapa|carte|topo|diagram|schema|relief|profile|sketch|logo|flag|coat.of.arms|wappen|stamp|poster|panorama.chart|location|locator|plan)\b|\.(svg|ogg|oga|ogv|webm|mp3|wav|pdf|tif|tiff|gif)$/i;

/**
 * Named after the mountain, but not a picture OF the mountain.
 *
 * "Cheese fondue in front of the Matterhorn" passes every other gate — it is in
 * the right category and it does name the peak — and it is still the wrong
 * thing to lead a route page with. This is a gallery of a summit, not of the
 * valley's restaurants.
 */
const NOT_THE_MOUNTAIN =
  /\b(fondue|restaurant|menu|beer|wine|cheese|hotel|museum|church|chapel|cemetery|train|railway|tram|bus|car|shop|market|festival|portrait|selfie|statue|monument|plaque|sign|graffiti|cat|dog)\b/i;

const GALLERY_LIMIT = 8;

interface CommonsFile {
  title: string;
  imageinfo?: {
    thumburl?: string;
    url?: string;
    mediatype?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

/**
 * Whether a Commons file is actually ABOUT this peak.
 *
 * A mountain's Commons category is curated by people who care about that
 * mountain — which means it also holds the view FROM it, the hut below it, the
 * neighbouring summit in the same frame, and the odd 19th-century book plate.
 * `Category:Matterhorn` was handing back "Antoine Suarez at the Breithorn" and
 * a page of "Der Montblanc", both captioned "Matterhorn · <photographer>".
 * Attaching a real photographer's name to the wrong mountain is precisely the
 * failure `resolvePeakFacts` refuses to make, so the gallery must not make it
 * either.
 *
 * The test is the file's own name: uploaders name mountain photographs after
 * the mountain. This drops some genuine frames whose names say nothing, which
 * is the right trade — fewer photographs, all of them of this summit.
 */
const normalise = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");

function fileIsAbout(fileName: string, subject: string): boolean {
  // "Olympus (mountain)" and "Mont Blanc massif" both key off the proper noun.
  const words = subject
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .map(normalise)
    .filter((w) => w.length > 2);
  if (words.length === 0) return true;
  const file = normalise(fileName);
  return words.every((w) => file.includes(w));
}

async function categoryPhotos(category: string, subject: string): Promise<PeakPhoto[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    `&generator=categorymembers&gcmtitle=${encodeURIComponent(`Category:${category}`)}` +
    "&gcmtype=file&gcmlimit=60&prop=imageinfo" +
    "&iiprop=url|mediatype|extmetadata&iiurlwidth=1400" +
    "&iiextmetadatafilter=Artist|LicenseShortName";

  const res = await fetch(url, { signal: withTimeout(PHOTOS_TIMEOUT_MS) });
  if (!res.ok) return [];
  const json = (await res.json()) as { query?: { pages?: Record<string, CommonsFile> } };

  const out: PeakPhoto[] = [];
  for (const page of Object.values(json.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    const src = info?.thumburl ?? info?.url;
    const name = page.title.replace(/^File:/, "");
    if (!src || info?.mediatype !== "BITMAP" || NOT_A_PHOTO.test(name)) continue;
    if (!fileIsAbout(name, subject) || NOT_THE_MOUNTAIN.test(name)) continue;

    const meta = info.extmetadata ?? {};
    const credit = stripHtml(meta.Artist?.value);
    const license = stripHtml(meta.LicenseShortName?.value);
    // "Unknown photographer" under CC BY is a licence term not met; the file
    // is skipped rather than captioned with a placeholder.
    if (requiresAttribution(license) && !credit) continue;
    out.push({
      src,
      credit: credit || "Unknown photographer",
      license: license || "See Commons",
      pageUrl:
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    });
    if (out.length >= GALLERY_LIMIT) break;
  }
  return out;
}

const galleryCache = new Map<string, Promise<PeakPhoto[]>>();

/**
 * Every verified photograph of this peak, not just the lead image.
 *
 * The Commons category for a mountain is curated by people who care about that
 * mountain, so it holds far more than the one shot the article uses. Where no
 * category exists the lead image stands alone rather than being padded out.
 */
export function resolvePeakGallery(query: PeakPhotoQuery): Promise<PeakPhoto[]> {
  if (OFFLINE) return Promise.resolve([]);

  const tagged = parseWikipediaTag(query.wikipedia);
  const category = (tagged?.title ?? query.name).trim();
  if (!category) return Promise.resolve([]);

  const existing = galleryCache.get(category);
  if (existing) return existing;

  const promise = (async () => {
    const [lead, members] = await Promise.all([
      resolvePeakPhoto(query),
      categoryPhotos(category, query.name || category).catch(() => [] as PeakPhoto[]),
    ]);

    const seen = new Set<string>();
    const photos: PeakPhoto[] = [];
    for (const photo of [...(lead ? [lead] : []), ...members]) {
      // Thumbnail widths differ between the two endpoints, so dedupe on the
      // underlying file name rather than the URL.
      const key =
        decodeURIComponent(photo.src)
          .split("/")
          .pop()
          ?.replace(/^\d+px-/, "") ?? photo.src;
      if (seen.has(key)) continue;
      seen.add(key);
      photos.push(photo);
    }
    return photos.slice(0, GALLERY_LIMIT);
  })();

  galleryCache.set(category, promise);
  return promise;
}

/* -------------------------------------------------------------------------- */
/* The harvested bundle                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Photographs resolved, filtered and licence-checked AT BUILD TIME by
 * `scripts/harvest-peak-photos.mjs`, downloaded into `public/img/peaks/` and
 * indexed in `public/data/peak-photos.json`.
 *
 * WHY THIS EXISTS ALONGSIDE THE RUNTIME RESOLVER. The header of
 * `components/domain/TrailPlate.tsx` records what runtime-only resolution cost
 * on 2026-08-24: Commons rate-limited a sweep of twelve locations after five,
 * geosearch returned whatever happened to be geotagged nearby, and Cyprus was
 * illustrated with a stranger's selfie. But the decisive argument is not
 * latency — it is that NOBODY CAN LOOK AT A `useEffect`. A pipeline that
 * writes files to disk can be reviewed as a contact sheet, and the harvest
 * script's own measurements say machine filters get to ~95% and no further:
 * they cannot see an annotated panorama with peak names lettered across the
 * sky, a 19th-century printed plate, or a topographic map saved as a PNG.
 *
 * Keyed by the id `services/peaks.ts` mints for every peak —
 * `osm:<lat 4dp>,<lon 4dp>` — so the join is on position-as-identity for a
 * record whose SUBJECT was resolved by entity, never by proximity.
 */
export interface HarvestedPhoto {
  src: string;
  credit: string;
  license: string;
  pageUrl: string;
  /** The article or Wikidata entity that vouched for the subject. */
  article: string;
  via: string;
  /** The Commons file title — the one stable identity a photograph has across
   *  the two hosts and the analytics query strings the API hands out. */
  file: string;
  /**
   * True only when a person looked at this file and accepted it. The Alpine
   * harvest reviewed 608 candidates by eye; the worldwide set is machine-
   * filtered beyond that, and the index says which is which rather than
   * letting the two read the same.
   */
  reviewed: boolean;
}

/**
 * One row as the harvest writes it — packed, because there are tens of
 * thousands and phones fetch the file. The key comment in
 * `scripts/harvest-peak-photos.mjs` is the contract; `unpack` below is the
 * only place it is read.
 */
interface PackedPhoto {
  s: string;
  f: string;
  a: string;
  l: string;
  q: string;
  v: "p18" | "lead";
  r?: 1;
}

/**
 * WHY THE PHOTOGRAPH IS A COMMONS URL AND NOT A FILE IN `public/img/peaks/`.
 *
 * At 800 px the harvest's JPEGs weigh ~150 KB. A worldwide set is tens of
 * thousands of them — more than a gigabyte in a repository whose whole image
 * directory is 84 MB. So the index carries the thumbnail URL the Commons API
 * rendered, the page fetches it on view, and the service worker's existing
 * `upload.wikimedia.org` rule keeps it for offline. `--download` in the
 * harvest script writes local files for a subset, and those rows carry a
 * local path instead; this code serves either.
 */
const THUMB_BASE = "https://upload.wikimedia.org/wikipedia/commons/thumb/";

function unpack(p: PackedPhoto): HarvestedPhoto {
  return {
    src: /^(https?:)?\//.test(p.s) ? p.s : THUMB_BASE + p.s,
    // The harvest normalises this too; the bundle on disk predates that.
    credit: stripHtml(p.a),
    license: p.l,
    pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.f.replace(/ /g, "_"))}`,
    article: /^Q\d+$/.test(p.q) ? `https://www.wikidata.org/wiki/${p.q}` : p.q,
    via: p.v === "p18" ? "wikidata-p18" : "article-lead",
    file: p.f,
    reviewed: p.r === 1,
  };
}

interface PhotoBundle {
  v: number;
  built: string;
  /**
   * Commons file names a person looked at and refused. Carried into the app
   * because the RUNTIME resolver draws from the same candidate pool — without
   * this list it would quietly serve, live, the exact files already rejected
   * by eye.
   */
  rejects: Record<string, string>;
  photos: Record<string, PackedPhoto>;
}

let bundle: PhotoBundle | null = null;
let bundleLoad: Promise<PhotoBundle | null> | null = null;

export function loadHarvestedPhotos(): Promise<PhotoBundle | null> {
  bundleLoad ??= fetch("/data/peak-photos.json")
    .then((r) => (r.ok ? (r.json() as Promise<PhotoBundle>) : null))
    .then((b) => {
      bundle = b;
      return b;
    })
    .catch(() => null);
  return bundleLoad;
}

/** The peak id the catalogue mints, from a coordinate. */
export function peakPhotoKey(lat?: number, lon?: number): string | null {
  if (lat === undefined || lon === undefined) return null;
  return `osm:${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/** Synchronous read, once the bundle has loaded. Undefined before that. */
export function harvestedPhoto(lat?: number, lon?: number): HarvestedPhoto | undefined {
  const key = peakPhotoKey(lat, lon);
  const packed = key && bundle ? bundle.photos[key] : undefined;
  return packed ? unpack(packed) : undefined;
}

/**
 * Whether a Commons file was rejected by a person during review.
 *
 * Exported so the runtime path can honour the same judgement. Deleting an
 * entry undoes a review that was done by eye and cannot be redone by a filter.
 */
export function rejectedByReview(fileName?: string): boolean {
  if (!fileName || !bundle) return false;
  return Boolean(bundle.rejects[fileName.replace(/_/g, " ").trim()]);
}

export function harvestedCredit(p: HarvestedPhoto, subject: string): string {
  return [subject, p.credit, p.license, "Wikimedia Commons"].filter(Boolean).join(" · ");
}
