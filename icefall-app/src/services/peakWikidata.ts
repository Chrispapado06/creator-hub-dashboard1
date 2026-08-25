import { PHOTOS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { isLatin } from "./peakNames";
import type { Peak } from "./peaks";

/**
 * Wikidata: the best photograph source ICEFALL has for an arbitrary summit.
 *
 * The Wikipedia route in `peakPhotos.ts` needs OSM to carry a `wikipedia` tag,
 * or the peak's name to survive an English-Wikipedia search. Measured against
 * sixty summits around Matsumoto that gave 33 usable results; measured against
 * sixty around Limassol it gave one.
 *
 * Wikidata does better, because OSM tags `wikidata` far more often than
 * `wikipedia` and because the id is language-independent:
 *
 *   Matsumoto — 38/60 tagged, 19/20 sampled carry an image (P18), 20/20 carry
 *               an English label
 *   Limassol  — 10/60 tagged (the small Troodos summits are simply not in any
 *               open dataset with a photograph; that stays an honest blank)
 *
 * P18 is "image of this item" asserted on the item itself, so unlike a Commons
 * category it cannot hand back a photograph of the neighbouring peak. And the
 * English label solves the other half of the problem: 王ヶ頭 has no `name:en` in
 * OSM but Wikidata knows it as "Ogato".
 *
 * One batched request per 50 peaks, then one to Commons for the thumbnails and
 * the credits CC BY requires. Cached to localStorage across sessions.
 */

export interface WikidataFacts {
  /** Commons thumbnail URL of the image asserted on the item. */
  src?: string;
  credit?: string;
  license?: string;
  pageUrl?: string;
  /** The item's English label, for peaks OSM only names locally. */
  label?: string;
}

/** Matches `placePhotos.ts` — see the note there on why 1400 was four times too big. */
const COMMONS_WIDTH = 800;

const CACHE_KEY = "icefall.peak-wikidata.v1";
const CACHE_LIMIT = 800;

type Entry = WikidataFacts | null;

let cache: Record<string, Entry> = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
  } catch {
    return {};
  }
})();

function persist() {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_LIMIT) {
      cache = Object.fromEntries(keys.slice(-CACHE_LIMIT).map((k) => [k, cache[k]]));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode — the cache is an optimisation, not state we depend on */
  }
}

export function clearWikidataCache() {
  cache = {};
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

const QID = /^Q\d+$/;

interface Entity {
  labels?: Record<string, { value?: string }>;
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
}

/** Item → its P18 file name and English label. One call per 50 ids. */
async function fetchEntities(
  ids: string[],
  signal?: AbortSignal,
): Promise<Map<string, { file?: string; label?: string }>> {
  const out = new Map<string, { file?: string; label?: string }>();
  if (ids.length === 0) return out;

  const url =
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*" +
    "&props=claims|labels&languages=en" +
    `&ids=${encodeURIComponent(ids.join("|"))}`;

  const res = await fetch(url, { signal: withTimeout(PHOTOS_TIMEOUT_MS, signal) });
  if (!res.ok) return out;
  const json = (await res.json()) as { entities?: Record<string, Entity> };

  for (const [id, ent] of Object.entries(json.entities ?? {})) {
    const raw = ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    out.set(id, {
      file: typeof raw === "string" ? raw : undefined,
      label: ent.labels?.en?.value,
    });
  }
  return out;
}

interface CommonsInfo {
  src: string;
  credit: string;
  license: string;
  pageUrl: string;
}

/** Thumbnail plus the photographer and licence, for every file in one call. */
async function fetchFiles(
  files: string[],
  signal?: AbortSignal,
): Promise<Map<string, CommonsInfo>> {
  const out = new Map<string, CommonsInfo>();
  if (files.length === 0) return out;

  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    `&prop=imageinfo&iiprop=url|mediatype|extmetadata&iiurlwidth=${COMMONS_WIDTH}` +
    "&iiextmetadatafilter=Artist|LicenseShortName" +
    `&titles=${encodeURIComponent(files.map((f) => `File:${f}`).join("|"))}`;

  const res = await fetch(url, { signal: withTimeout(PHOTOS_TIMEOUT_MS, signal) });
  if (!res.ok) return out;
  const json = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: {
            thumburl?: string;
            url?: string;
            mediatype?: string;
            descriptionurl?: string;
            extmetadata?: Record<string, { value?: string }>;
          }[];
        }
      >;
    };
  };

  const strip = (html?: string) =>
    (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

  // Commons normalises underscores to spaces; key on the normalised form so a
  // P18 value of "Mount_Yari.jpg" still finds "File:Mount Yari.jpg".
  const key = (t: string) => t.replace(/^File:/, "").replace(/_/g, " ").trim();

  for (const page of Object.values(json.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    const src = info?.thumburl ?? info?.url;
    // P18 can point at an SVG diagram or an audio file on non-mountain items.
    if (!src || info?.mediatype !== "BITMAP") continue;
    const meta = info.extmetadata ?? {};
    out.set(key(page.title), {
      src,
      credit: strip(meta.Artist?.value),
      license: strip(meta.LicenseShortName?.value),
      pageUrl:
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fill in photographs and English names for a list of peaks.
 *
 * Only touches peaks OSM gave a `wikidata` id. Everything else is returned
 * untouched — this adds facts, it never invents them, and a peak with no item
 * keeps its honest blank.
 */
export async function enrichPeaks(peaks: Peak[], signal?: AbortSignal): Promise<Peak[]> {
  const wanted = [
    ...new Set(
      peaks
        .map((p) => p.wikidata)
        .filter((id): id is string => Boolean(id) && QID.test(id!) && !(id! in cache)),
    ),
  ];

  if (wanted.length > 0) {
    try {
      const entities = new Map<string, { file?: string; label?: string }>();
      for (let i = 0; i < wanted.length; i += 50) {
        const chunk = wanted.slice(i, i + 50);
        for (const [k, v] of await fetchEntities(chunk, signal)) entities.set(k, v);
      }

      const files = [...new Set([...entities.values()].map((e) => e.file).filter(Boolean))];
      const info = new Map<string, CommonsInfo>();
      for (let i = 0; i < files.length; i += 50) {
        const chunk = files.slice(i, i + 50) as string[];
        for (const [k, v] of await fetchFiles(chunk, signal)) info.set(k, v);
      }

      for (const id of wanted) {
        const ent = entities.get(id);
        if (!ent) {
          cache[id] = null;
          continue;
        }
        const file = ent.file?.replace(/_/g, " ").trim();
        const img = file ? info.get(file) : undefined;
        cache[id] = {
          src: img?.src,
          credit: img?.credit,
          license: img?.license,
          pageUrl: img?.pageUrl,
          label: ent.label,
        };
      }
      persist();
    } catch {
      // Offline or rate-limited. Deliberately NOT cached as null — the next
      // search should try again rather than permanently showing a blank.
      return peaks;
    }
  }

  return peaks.map((p) => {
    const facts = p.wikidata ? cache[p.wikidata] : undefined;
    if (!facts) return p;

    // Take the English label only when the current name isn't already readable —
    // OSM's own `name:en` was chosen by a local mapper and outranks us.
    const upgradeName = facts.label && !isLatin(p.name);
    return {
      ...p,
      name: upgradeName ? facts.label! : p.name,
      localName: upgradeName ? (p.localName ?? p.name) : p.localName,
      photo: facts.src ?? p.photo,
      photoCredit: facts.src ? creditLine(facts) : p.photoCredit,
    };
  });
}

function creditLine(f: WikidataFacts): string {
  return [f.credit, f.license, "Wikimedia Commons"].filter(Boolean).join(" · ");
}
