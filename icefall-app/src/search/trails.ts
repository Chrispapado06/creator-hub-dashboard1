import { useEffect, useMemo, useState } from "react";
import { NETWORK_LABEL, type TrailNetwork } from "@/services/trails";
import { withTimeout } from "@/lib/netTimeout";
import { fmtDistance } from "@/lib/format";

/**
 * TRAILS, searchable by name from the global search box.
 *
 * ── WHAT THIS SEARCHES, AND WHAT IT CANNOT ───────────────────────────────────
 * `public/data/trails/` holds prebuilt per-country indexes of OpenStreetMap
 * hiking relations — 77,141 named trails across 22 country files, built by
 * `scripts/build-trail-index.mjs`. MEASURED on 2026-09-02:
 *
 *   all 22 country files, raw ................  6.06 MB
 *   all 22 country files, gzipped ............  2.07 MB
 *   names + refs, total text .................  2.29 MB
 *
 * All 22 are in Europe — the `COUNTRY` table below names every one — and there
 * is NOWHERE ELSE. No United States, no Canada, no Nepal, no Japan, no New
 * Zealand; not even Germany. A search for "Appalachian Trail" or "Everest Base
 * Camp Trek" therefore finds nothing, and an empty list on its own would read
 * as "that trail does not exist". It must not: every answer this module gives
 * carries a `coverageNote` saying exactly what was searched, and the screen
 * must render it. That is the whole reason this file returns a third value.
 *
 * ── WHY IT LOADS EVERYTHING RATHER THAN GUESSING ─────────────────────────────
 * A nearby-trails search has a point to work from, so `services/trails.ts` can
 * use the manifest bounding boxes to open only the one or two files that can
 * contain the circle. A NAME has no geography: "laugavegur" gives no clue that
 * the answer is in Iceland's file. So either every loaded index is scanned, or
 * the search is a lottery.
 *
 * At 2.07 MB gzipped, scanned in memory, that is affordable — but only if it
 * is done once, off the typing path, and streamed:
 *
 *   - Nothing is fetched at app start. The manifest (1.3 KB) is fetched on the
 *     first keystroke; the country files begin at two, which is one keystroke
 *     before a name can answer and the moment a route number like "e4" can.
 *   - Files load three at a time in a fixed priority order, and each one is
 *     searchable the moment it lands. The answer improves while you type
 *     instead of waiting for the slowest file.
 *   - A caller that goes away NEVER cancels the load. This is the lesson
 *     `nearbyTrails`, `trailManifest` and `trailGeometry` in
 *     `services/trails.ts` each carry their own copy of: the work is shared by
 *     every later search for the life of the page, and binding it to the first
 *     caller's AbortController meant React's development double-mount killed it
 *     for the mount that was actually on screen. Each fetch is still bounded,
 *     by `withTimeout`.
 *
 * ── WHY THE SEARCH ITSELF CANNOT FREEZE THE BOX ──────────────────────────────
 * Each country is held as one lowercase text blob of "name<US>ref" rows joined
 * by newlines, plus typed arrays of offsets, so a query is a handful of native
 * `String.indexOf` scans rather than 77,141 JavaScript comparisons. MEASURED
 * over all 22 indexes, every match found and ranked, nothing truncated:
 *
 *   "laugavegur" ..... 1 match ......... 2.1 ms
 *   "west highland" .. 11 matches ...... 0.7 ms
 *   "trail" .......... 1,310 matches ... 1.8 ms
 *   "weg" ............ 8,025 matches ... 0.9 ms   ← the worst case there is
 *
 * Under four milliseconds for anything, or about seven for a ref-shaped query
 * like "e4", which is scanned in both of its spellings (see `terms`) — and it
 * runs 180 ms after the last keystroke rather than on the keystroke itself.
 *
 * Memory for the full 22 is roughly 8 MB: the blob, the offsets, and the name
 * strings the JSON parse already allocated. The parsed row arrays, the
 * coordinates and the SAC grades are all dropped, because a name search needs
 * none of them.
 *
 * ── WHY THIS DOES NOT REUSE `fetchCountryIndex` ──────────────────────────────
 * It shares the manifest, the URL scheme and the packed row format with
 * `services/trails.ts` — the build script stays the single source of truth for
 * all three. What it does not share is that file's row materialiser, which is
 * private to it and turns every row into a full `Trail` object with a distance
 * from an origin. There is no origin here, and 77,141 `Trail` objects is
 * exactly the allocation that would make the search box stutter. The decoding
 * that is duplicated is the three lines that read the packed array; if the
 * format ever gains a field, both readers sit next to the same build script.
 *
 * Data © OpenStreetMap contributors, ODbL. THE SCREEN RENDERING THESE HITS MUST
 * SHOW `TRAIL_ATTRIBUTION` from `services/trails.ts` — the licence requires it
 * and no other search source in the box does it for us.
 */

/**
 * The shared result shape for the global search box.
 *
 * Declared here rather than imported because the sources were built in
 * parallel and no shared module existed yet. It is structurally identical to
 * the agreed shape, so the day a `src/search/types.ts` appears this becomes a
 * re-export and nothing else changes.
 */
export type SearchHit = {
  id: string;
  kind: "person" | "trek" | "group" | "trail";
  title: string;
  /** One short line: region, country, member count. */
  subtitle?: string;
  /** The route to open. */
  to: string;
  /** Omitted rather than filled with a placeholder. */
  imageUrl?: string;
  /** An honesty note, e.g. "Placeholder group". */
  note?: string;
};

/* -------------------------------------------------------------------------- */
/* Tuning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How many letters before trails answer at all.
 *
 * Two letters match tens of thousands of the 77,141 names — "st" alone is
 * noise in nine languages — and a list of eight arbitrary ones is worse than
 * nothing, because it looks like an answer. Three is the floor, and when the
 * box is below it the coverage note says why the trail section is empty rather
 * than leaving silence to imply "no such trail".
 */
const MIN_QUERY = 3;

/**
 * The exception: a waymark reference is short on purpose.
 *
 * "E4" is two characters and is a real, named, signposted route across Europe;
 * so is "M1". Blocking them because of a length rule aimed at "st" would fail
 * the one query where the athlete knows exactly what they want. Deliberately
 * narrow — letters, then digits — so it cannot re-open the two-letter
 * floodgate. The groups are used by `terms` below.
 */
const REF_LIKE = /^([a-z]{1,3})[-\s]?(\d{1,3}[a-z]?)$/;

/** Typing settles before the scan runs. The scan is ~1 ms; this is politeness. */
const DEBOUNCE_MS = 180;

/** How many trails the box shows. */
const LIMIT = 8;

/**
 * Per-file budget. `netTimeout.ts` owns the app's shared budgets and is not
 * this file's to edit; these are static CDN files, not an Overpass queue, so
 * they get their own, shorter number. A file that misses it is reported as not
 * searched — never silently dropped.
 */
const FILE_TIMEOUT_MS = 12_000;

/**
 * The whole load stops STARTING new files after this. Today all 22 land well
 * inside it; this exists so that if the index grows to eighty countries the
 * search degrades into an honest partial answer instead of a phone downloading
 * for a minute. Whatever is skipped is named in the coverage note.
 */
const LOAD_BUDGET_MS = 45_000;

/**
 * Same idea for memory. 77,141 rows is ~8 MB held; this caps the damage if the
 * index doubles before anyone revisits this file.
 */
const MAX_ROWS = 250_000;

/** Three at a time: enough to hide latency, not enough to starve other fetches. */
const CONCURRENCY = 3;

/**
 * Separates the name from the ref inside a row.
 *
 * A unit separator, written as an ESCAPE rather than as a literal control
 * character: the offset arithmetic in `searchLoaded` assumes it is exactly one
 * character wide, and a literal would be invisible in every editor and the
 * first thing a copy-paste or a whitespace-stripping pass would eat. No typed
 * query can contain it, so no match can straddle the boundary.
 */
const SEP = "\u001f";

/* -------------------------------------------------------------------------- */
/* Which country a file is                                                    */
/* -------------------------------------------------------------------------- */

/**
 * OSM relation id → country, for the 22 files that exist.
 *
 * The manifest carries relation ids and bounding boxes but no names, and a
 * trail row that says nothing about where it is is close to useless. Every
 * entry below was checked TWICE before it was written: against the manifest's
 * own bbox, and against the first names actually in that file — r58446's first
 * rows are the Southern Upland Way and the Pennine Way, r299133's are
 * Kjalvegur, Fimmvörðuháls and Laugavegur, r51701's are Swiss Rundwege.
 *
 * An id that is not in this table renders NO country rather than a guess. A
 * label invented from a bounding box would be a claim ICEFALL cannot support,
 * and the whole point of the subtitle is to be the one part of the row a
 * person trusts.
 *
 * England, Scotland and Wales are separate OSM relations and are named as
 * such — calling all three "United Kingdom" would merge three files whose
 * coverage is genuinely different, and Northern Ireland is in none of them.
 */
const COUNTRY: Record<number, string> = {
  1311341: "Spain",
  14296: "Slovakia",
  16239: "Austria",
  186382: "Bulgaria",
  192307: "Greece",
  214885: "Croatia",
  218657: "Slovenia",
  2202162: "France",
  295480: "Portugal",
  2978650: "Norway",
  299133: "Iceland",
  307787: "Cyprus",
  365331: "Italy",
  49715: "Poland",
  51684: "Czechia",
  51701: "Switzerland",
  52822: "Sweden",
  58437: "Wales",
  58446: "Scotland",
  58447: "England",
  62273: "Ireland",
  90689: "Romania",
};

/**
 * Loaded first, because ICEFALL is a mountaineering app.
 *
 * These four files are also the four biggest — 3.7 MB of the 6.1 MB, nearly
 * two thirds — so putting them first costs the small countries a second or two. That is the right
 * trade: if the load is interrupted, throttled or cut short by the budget
 * above, the countries that survive should be the ones this app's athletes
 * actually search. Everything else follows in ascending trail count, which
 * covers the most COUNTRIES per byte and so shrinks the "not searched yet"
 * sentence fastest.
 */
const ALPINE_FIRST = [51701, 16239, 2202162, 365331];

/* -------------------------------------------------------------------------- */
/* The index                                                                  */
/* -------------------------------------------------------------------------- */

/** Packed row in `r<rel>.json`: the build script's format, unchanged. */
type PackedTrail = [
  osmId: number,
  name: string,
  lat: number,
  lon: number,
  network: TrailNetwork | null,
  lengthKm: number | null,
  ref: string | null,
  sacScale: string | null,
];

const NETWORKS: (TrailNetwork | null)[] = [null, "lwn", "rwn", "nwn", "iwn"];

interface CountryIndex {
  rel: number;
  country?: string;
  n: number;
  /** Lowercase "name<US>ref" rows joined by "\n". The thing `indexOf` scans. */
  blob: string;
  /** `n + 1` offsets into `blob`; the last is the tail sentinel. */
  start: Int32Array;
  /** Length of the lowercase NAME part of each row — where the ref begins. */
  nameLen: Int32Array;
  /** Display names, in their real case. These are the strings JSON.parse made. */
  names: string[];
  refs: (string | null)[];
  /** 0 means unknown. See `plausible` for why a broken length lands here too. */
  lengthKm: Float32Array;
  /** Index into `NETWORKS`. */
  net: Uint8Array;
  /**
   * Relation ids are around 2×10^7 today, comfortably inside Int32 — but this
   * is a `Float64Array` because a silently truncated id links to the wrong
   * trail, and 300 KB is not worth that risk.
   */
  osmIds: Float64Array;
}

/**
 * A stated length, or 0 for "we do not know".
 *
 * `services/trails.ts` documents the two ways OSM's number is not a length:
 * absent, or a relation whose members do not join into a route, which measured
 * as high as 192,000 km. Both land on 0 here, which means the figure can
 * neither be printed on a row nor win a length tiebreak. The 25,000 km
 * threshold is that file's `IMPLAUSIBLE_LENGTH_KM` — the Great Trail in Canada,
 * the longest that exists, is about 24,000 km — and is repeated rather than
 * imported only because it is private there.
 */
const IMPLAUSIBLE_LENGTH_KM = 25_000;
const plausible = (km: number | null): number =>
  km != null && km > 0 && km < IMPLAUSIBLE_LENGTH_KM ? km : 0;

/**
 * A name that describes a category instead of naming a trail.
 *
 * Straight from `services/trails.ts`, where the worldwide audit found "Nature
 * trail" ranked fourth for the whole of Norway. These sort last — EXCEPT when
 * the query is the whole name, because someone who types "nature trail" has
 * asked for it and is entitled to be answered.
 */
const GENERIC_NAME =
  /^(the\s+)?(nature\s+)?(trail|walk|path|loop|circle|route|viewpoint|rundweg|sentier|nature\s+walk|footpath|public\s+footpath)s?$/i;

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

interface ManifestCountry {
  rel: number;
  n: number;
  bbox: [number, number, number, number];
}

const listeners = new Set<() => void>();
/** Bumped whenever a country lands or fails, so open searches re-run. */
let version = 0;
function emit() {
  version++;
  for (const l of listeners) l();
}

const indexes = new Map<number, CountryIndex>();
const failed = new Set<number>();
const skipped = new Set<number>();
let manifest: ManifestCountry[] | null = null;
let manifestBuilt: string | undefined;
let manifestPromise: Promise<void> | null = null;
let manifestFailed = false;
let countriesStarted = false;
let loadedRows = 0;

/**
 * The manifest, on the first keystroke. 1.3 KB, so it is worth having early:
 * it is what lets the "three letters" note say 77,141 rather than "a lot".
 *
 * Re-fetched rather than borrowed from `services/trails.ts`, whose own
 * `trailManifest()` is private to it. In practice this is not a second network
 * request — it is the same URL and the browser cache answers it.
 */
function ensureManifest(): Promise<void> {
  if (!manifestPromise) {
    manifestPromise = fetch("/data/trails/manifest.json", {
      signal: withTimeout(FILE_TIMEOUT_MS),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { built?: string; countries?: ManifestCountry[] } | null) => {
        manifest = json?.countries?.length ? json.countries : null;
        manifestBuilt = json?.built;
        manifestFailed = manifest === null;
      })
      .catch(() => {
        // A failed fetch must not poison every later search with null — the
        // same rule `trailManifest` in services/trails.ts writes down. Clearing
        // the promise lets the next keystroke try again.
        manifestFailed = true;
        manifestPromise = null;
      })
      .finally(emit);
  }
  return manifestPromise;
}

/** Total trails the index claims to hold, from the manifest. */
function manifestRows(): number {
  return manifest ? manifest.reduce((sum, c) => sum + c.n, 0) : 0;
}

/**
 * Fetch every country file, three at a time, in priority order.
 *
 * Runs once per page. Deliberately not cancellable: see the file header.
 */
async function ensureCountries(): Promise<void> {
  if (countriesStarted) return;
  countriesStarted = true;

  await ensureManifest();
  if (!manifest) {
    // Nothing to load and nothing to say beyond what the note already says.
    countriesStarted = false;
    return;
  }

  const order = [...manifest].sort((a, b) => {
    const ai = ALPINE_FIRST.indexOf(a.rel);
    const bi = ALPINE_FIRST.indexOf(b.rel);
    if (ai !== bi) return (ai < 0 ? ALPINE_FIRST.length : ai) - (bi < 0 ? ALPINE_FIRST.length : bi);
    return a.n - b.n;
  });

  const deadline = Date.now() + LOAD_BUDGET_MS;
  let next = 0;

  const worker = async () => {
    for (;;) {
      const country = order[next++];
      if (!country) return;
      if (Date.now() > deadline || loadedRows > MAX_ROWS) {
        skipped.add(country.rel);
        emit();
        continue;
      }
      const built = await loadCountry(country);
      if (built) {
        indexes.set(country.rel, built);
        loadedRows += built.n;
      } else {
        failed.add(country.rel);
      }
      emit();
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function loadCountry(c: ManifestCountry): Promise<CountryIndex | null> {
  try {
    const res = await fetch(`/data/trails/r${c.rel}.json`, {
      signal: withTimeout(FILE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { v?: number; trails?: PackedTrail[] };
    if (json.v !== 1 || !Array.isArray(json.trails)) return null;
    return build(c.rel, json.trails);
  } catch {
    // Offline, a dead CDN, a timeout — all the same to the caller, and all
    // reported as "this country was not searched" rather than as no results.
    return null;
  }
}

/**
 * Packed rows → one scannable blob plus parallel arrays.
 *
 * MEASURED: all 22 countries build in 220 ms total, so the largest single file
 * (France, 16,122 trails) is a few tens of milliseconds — off the typing path,
 * once per page.
 */
/**
 * Anything that would break the row layout, replaced one character for one.
 *
 * CHECKED: zero of today's 77,141 names and refs contain a newline, a carriage
 * return or the separator. But this index is rebuilt from live OpenStreetMap,
 * where a mapper can put anything at all in a `name` tag, and ONE newline would
 * shift every offset after it in that country's blob — silently, with no error,
 * linking rows to the wrong trail. That is the worst failure this file could
 * produce, so it is made impossible rather than watched for. The replacement is
 * one character for one so `nameLen` and `start` stay exactly true.
 */
const flatten = (s: string) => s.replace(/[\n\r\u001f]/g, " ");

function build(rel: number, rows: PackedTrail[]): CountryIndex {
  const n = rows.length;
  const parts = new Array<string>(n);
  const start = new Int32Array(n + 1);
  const nameLen = new Int32Array(n);
  const names = new Array<string>(n);
  const refs = new Array<string | null>(n);
  const lengthKm = new Float32Array(n);
  const net = new Uint8Array(n);
  const osmIds = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const [osmId, name, , , network, km, ref] = rows[i];
    const lower = flatten(name.toLowerCase());
    names[i] = name;
    refs[i] = ref;
    nameLen[i] = lower.length;
    parts[i] = ref ? `${lower}${SEP}${flatten(ref.toLowerCase())}` : lower;
    lengthKm[i] = plausible(km);
    net[i] = Math.max(0, NETWORKS.indexOf(network));
    osmIds[i] = osmId;
  }

  const blob = parts.join("\n");
  let off = 0;
  for (let i = 0; i < n; i++) {
    start[i] = off;
    off += parts[i].length + 1;
  }
  // One past the end, so "skip to the next row" from the last row terminates.
  start[n] = blob.length + 1;

  return { rel, country: COUNTRY[rel], n, blob, start, nameLen, names, refs, lengthKm, net, osmIds };
}

/* -------------------------------------------------------------------------- */
/* Searching                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The spellings of a query worth scanning for.
 *
 * THE BUG THIS FIXES. Typing "gr20" found the Variante Alpine and two link
 * paths and MISSED the GR20 itself, because OSM writes that relation as
 * "GR 20 Principale" with ref "GR 20" — with a space. The most famous
 * long-distance trail in Corsica was invisible to the most obvious way to ask
 * for it. Refs are written both ways all through this data ("E 4" and "E4"
 * both appear), and no amount of ranking rescues a match that was never made.
 *
 * So a ref-shaped query is scanned both spaced and closed up — two passes over
 * the 2.3 MB blob rather than one, since the query is always already one of the
 * two. MEASURED: "e4" costs 3.1 ms as a single scan and 7.0 ms as a pair, and
 * only a query shaped like "e4" or "gr20" pays it at all.
 */
function terms(q: string): string[] {
  const m = REF_LIKE.exec(q);
  if (!m) return [q];
  const out = [q];
  for (const v of [`${m[1]} ${m[2]}`, `${m[1]}${m[2]}`]) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** Which row an offset in the blob belongs to. */
function rowAt(start: Int32Array, n: number, off: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (start[mid] <= off) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A character that continues a word — so a match after one is mid-word. */
function isWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 97 && code <= 122) || // a-z, and the blob is lowercase
    code >= 192 // every accented letter this data is full of
  );
}

/**
 * How good a match is. Lower is better.
 *
 * A person typing into a search box is naming something. Exact beats prefix
 * beats a word they started beats a fragment buried mid-word — the last is
 * still shown, because "highland" should find the West Highland Way, but it
 * should never outrank a trail actually called Highland.
 *
 * THE NAME OUTRANKS THE REF, and this order was chosen against the data, not
 * guessed. With the ref first, "gr20" answered with "Aralarko bira" — a real
 * Basque trail that carries the ref "GR 20" because Spain's regional GR
 * numbering reuses the number — and put "GR 20 Principale", the Corsican
 * GR20 itself, second. Reusing a ref across networks is common (the same
 * reason `E_PATH_REFS` in services/trails.ts refuses to trust /^E\d+$/); a
 * name beginning with what you typed is the far stronger signal.
 */
const TIER_EXACT_NAME = 0;
const TIER_NAME_PREFIX = 1;
const TIER_EXACT_REF = 2;
const TIER_REF_PREFIX = 3;
const TIER_WORD_START = 4;
const TIER_CONTAINS = 5;

interface Candidate {
  rel: number;
  row: number;
  osmId: number;
  tier: number;
  generic: boolean;
  reach: number;
  km: number;
  nameLen: number;
  /** Every indexed country this relation turned up in. See `searchLoaded`. */
  countries: string[];
}

/** Ranked before `b`? Written over primitives so the loop allocates nothing. */
function beats(
  tier: number,
  generic: boolean,
  reach: number,
  km: number,
  nameLen: number,
  b: Candidate,
): boolean {
  if (tier !== b.tier) return tier < b.tier;
  if (generic !== b.generic) return !generic;
  if (reach !== b.reach) return reach > b.reach;
  /*
   * THE LONGER TRAIL FIRST, and the shorter NAME only after that. Tried the
   * other way round on the belief that a name closer in length to the query is
   * a closer match; the data disagreed immediately. "tour du mont blanc" then
   * answered with "Tour du Mont Blanc - Variante du Tour" (6.2 km) and pushed
   * "Tour du Mont Blanc - Itinéraire principal" (166 km) to third. A route and
   * its variants share a name stem, so the only thing separating them is how
   * far they go: length is what tells the trail from its detour.
   *
   * Length is absent — 0 — on most relations, so this settles far fewer ties
   * than it looks like it should, which is why the name length is kept beneath
   * it as the last word rather than dropped.
   */
  if (km !== b.km) return km > b.km;
  return nameLen < b.nameLen;
}

/**
 * Every match in every loaded country, ranked, best eight kept.
 *
 * There is no truncation and no per-country cap: the worst query measured
 * ("weg", 8,025 matches across 22 countries) completes in 0.9 ms because the
 * scan is native `indexOf` and only the eight survivors are ever turned into
 * objects. A cap would have meant ranking the first N matches in file order and
 * calling them the best — a quiet lie in the one place this module exists to
 * avoid telling one.
 */
function searchLoaded(query: string): Candidate[] {
  const best: Candidate[] = [];

  // As typed first, so the spelling the athlete used wins any tie.
  for (const q of terms(query)) {
    for (const idx of indexes.values()) {
      const { blob, start, nameLen, n } = idx;
      let from = 0;
      let at: number;

      while ((at = blob.indexOf(q, from)) !== -1) {
        const row = rowAt(start, n, at);
        const rowStart = start[row];
        // -1 for the "\n" that joined the rows; the sentinel makes this safe on
        // the last row too.
        const rowEnd = start[row + 1] - 1;
        const nameEnd = rowStart + nameLen[row];
        const refStart = nameEnd + 1;
        const end = at + q.length;

        let tier: number;
        if (at === rowStart) {
          tier = q.length === nameLen[row] ? TIER_EXACT_NAME : TIER_NAME_PREFIX;
        } else if (at === refStart && refStart < rowEnd) {
          tier = end === rowEnd ? TIER_EXACT_REF : TIER_REF_PREFIX;
        } else if (!isWordChar(blob.charCodeAt(at - 1))) {
          tier = TIER_WORD_START;
        } else {
          tier = TIER_CONTAINS;
        }

        /*
         * The generic-name demotion is skipped for an exact match. It exists so
         * a relation called "Nature trail" does not headline a country; it must
         * not hide the trail from someone who typed its name in full.
         */
        const generic =
          tier !== TIER_EXACT_NAME &&
          nameLen[row] <= 26 &&
          GENERIC_NAME.test(idx.names[row]);

        const reach = idx.net[row];
        const km = idx.lengthKm[row];

        const osmId = idx.osmIds[row];
        const already = best.find((c) => c.osmId === osmId);
        if (already) {
          if (idx.country && !already.countries.includes(idx.country)) {
            already.countries.push(idx.country);
          }
        } else if (
          best.length < LIMIT ||
          beats(tier, generic, reach, km, nameLen[row], best[best.length - 1])
        ) {
          insert(best, idx, row, osmId, tier, generic, reach, km);
        }

        // One hit per row: jump past it rather than finding the same trail
        // twice because its name repeats the query.
        from = start[row + 1];
        if (from <= at) break;
      }
    }
  }

  return best;
}

/**
 * Keep the top eight. Duplicates are merged by the caller, before this.
 *
 * MEASURED: 1,054 of the 77,141 relations appear in more than one country file.
 * That is not a bug in the data — `build-trail-index.mjs` asks Overpass for
 * relations with members inside each country's real border, so a route that
 * crosses one is genuinely in both files. Without merging, "mont blanc" would
 * list the Tour du Mont Blanc three times, from France, Italy and Switzerland.
 * With it, the row says "France · Italy · Switzerland", which is the truth and
 * is more useful than either.
 */
function insert(
  best: Candidate[],
  idx: CountryIndex,
  row: number,
  osmId: number,
  tier: number,
  generic: boolean,
  reach: number,
  km: number,
) {
  const candidate: Candidate = {
    rel: idx.rel,
    row,
    osmId,
    tier,
    generic,
    reach,
    km,
    nameLen: idx.nameLen[row],
    countries: idx.country ? [idx.country] : [],
  };

  let i = 0;
  while (i < best.length && !beats(tier, generic, reach, km, candidate.nameLen, best[i])) i++;
  best.splice(i, 0, candidate);
  if (best.length > LIMIT) best.pop();
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

/** Letters and digits only — for comparing a name with a ref. */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function toHit(c: Candidate): SearchHit | null {
  const idx = indexes.get(c.rel);
  if (!idx) return null;

  const name = idx.names[c.row];
  const ref = idx.refs[c.row];
  const network = NETWORKS[idx.net[c.row]];

  /*
   * The subtitle is built most-specific first, because `Row` truncates from
   * the right — the same reasoning the search screen already applies to its
   * Demo and Sample badges. Geography goes last: losing "· France" to an
   * ellipsis costs nothing, losing the waymark ref costs the thing that
   * identifies the trail on a signpost.
   */
  const facts: string[] = [];
  /*
   * Compared on letters and digits alone. "Laugavegur" carries the ref
   * "Laugav." — a plain substring test kept the full stop, decided the name did
   * not contain the ref, and rendered "Laugav. · 54.0 km · Iceland", spending
   * the most valuable part of the line repeating the title badly. Same for
   * "GR 20 Principale" with ref "GR 20".
   */
  if (ref && !compact(name).includes(compact(ref))) facts.push(ref);
  if (network) facts.push(NETWORK_LABEL[network]);
  // Only a length OSM actually recorded, and only when it can be true.
  if (c.km > 0) facts.push(`${fmtDistance(c.km)} km`);
  // Three facts plus a country is more than one row can show. The network
  // label is the least identifying of them, so it is the one that goes — it can
  // only be in the middle, because reaching three facts means a ref was pushed.
  if (facts.length > 2) facts.splice(1, 1);

  const where = c.countries.slice(0, 3).join(" · ");
  const subtitle = [...facts, where].filter(Boolean).join(" · ");

  return {
    id: `trail:${c.osmId}`,
    kind: "trail",
    title: name,
    subtitle: subtitle || undefined,
    to: `/explore/trail/${c.osmId}`,
    /*
     * No image. `services/trailImagery.ts` can find a real photograph for about
     * one trail in five and it costs a network round trip to find out which;
     * a placeholder plate in a search row would be eight identical grey
     * rectangles pretending to be photographs.
     */
  };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                   */
/* -------------------------------------------------------------------------- */

const NO_HITS: SearchHit[] = [];

export interface TrailSearchResult {
  hits: SearchHit[];
  loading: boolean;
  /**
   * What was actually searched. THE SCREEN MUST RENDER THIS. A trail search
   * that quietly covers three countries out of twenty-two and shows "no
   * results" is a lie by omission.
   */
  coverageNote?: string;
}

export function useTrailSearch(q: string): TrailSearchResult {
  const query = q.trim().toLowerCase();
  const enabled = query.length >= MIN_QUERY || (query.length >= 2 && REF_LIKE.test(query));

  const [debounced, setDebounced] = useState("");
  const [, setTick] = useState(0);

  // Re-run the search each time another country lands, so results stream in
  // rather than appearing all at once when the slowest file finishes.
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (query.length === 0) {
      setDebounced("");
      return;
    }
    // The manifest is 1.3 KB and makes the "three letters" note honest about
    // how many trails it is declining to search. The country files are 2 MB
    // gzipped, so they wait until a real query is one keystroke away.
    void ensureManifest();
    if (query.length >= 2) void ensureCountries();

    if (!enabled) {
      setDebounced("");
      return;
    }
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, enabled]);

  const hits = useMemo(
    () =>
      debounced
        ? searchLoaded(debounced)
            .map(toHit)
            .filter((h): h is SearchHit => h !== null)
        : NO_HITS,
    // `version` is not read inside: it is the dependency that re-runs the
    // search when a country index arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debounced, version],
  );

  const total = manifest?.length ?? 0;
  const done = indexes.size + failed.size + skipped.size;
  const pending = total === 0 ? !manifestFailed : done < total;
  const loading = enabled && (pending || debounced !== query);

  // The note is told about PENDING COUNTRIES, not about `loading` — those are
  // different facts. `loading` is also true for the 180 ms the debounce is
  // settling, and a note reading "22 of 22 countries, the rest are still
  // loading" during that window is nonsense the reader has no way to discount.
  return { hits, loading, coverageNote: note(query, enabled, pending) };
}

/**
 * Named in the coverage note as places a search cannot reach.
 *
 * Abstract coverage does not land — "only indexed countries are searched" is
 * true and tells an athlete in Colorado nothing. Naming somewhere they were
 * about to type does. FILTERED against what is actually loaded on every call,
 * so the day a United States index ships the sentence corrects itself instead
 * of becoming the file's own lie.
 */
const NOT_INDEXED = ["the United States", "Nepal", "New Zealand"];

/**
 * The sentence under the trail results.
 *
 * Every branch answers one question: WHAT DID YOU ACTUALLY SEARCH? An empty
 * list is only ever honest when the reader can tell "no trail is called that"
 * apart from "that continent is not in here" and from "the index failed to
 * load", and those three look identical without this.
 */
function note(query: string, enabled: boolean, pending: boolean): string | undefined {
  if (query.length === 0) return undefined;

  if (!enabled) {
    const rows = manifestRows();
    return rows
      ? `Trails need three letters, or a route number like E4 — ${rows.toLocaleString("en-GB")} names are too many to narrow on ${query.length === 1 ? "one" : "two"}.`
      : "Trails need three letters, or a route number like E4.";
  }

  const total = manifest?.length ?? 0;

  if (indexes.size === 0) {
    // Two very different empties, and they must not read alike: one is "wait",
    // the other is "this search did not happen".
    return pending
      ? "Loading the trail index — no trail has been searched yet."
      : "The trail index could not be loaded, so no trail was searched — this is a loading failure, not an empty result.";
  }
  if (pending) {
    return `Searched ${indexes.size} of ${total} indexed countries so far — the rest are still loading.`;
  }

  const covered = indexedCountries();
  const searched = [...indexes.values()].reduce((sum, i) => sum + i.n, 0);
  const parts = [
    `Searched ${searched.toLocaleString("en-GB")} trails across ${indexes.size} indexed ${indexes.size === 1 ? "country" : "countries"}${manifestBuilt ? `, built ${manifestBuilt}` : ""}.`,
  ];

  /*
   * THE HARD BOUNDARY, SAID PLAINLY. This is the sentence the whole file exists
   * for. Without it, "everest" returns an empty list that reads as a verdict on
   * the trail rather than on the index — and the index covers about a
   * seventieth of the world's countries.
   */
  const elsewhere = NOT_INDEXED.filter((x) => !covered.some((c) => x.endsWith(c)));
  parts.push(
    elsewhere.length >= 2
      ? `Nothing outside them is indexed — a trail in ${elsewhere.slice(0, -1).join(", ")} or ${elsewhere[elsewhere.length - 1]} is not in here and cannot be found, however it is spelled.`
      : "Nothing outside those countries is indexed, so a trail anywhere else cannot be found, however it is spelled.",
  );
  const missed = failed.size + skipped.size;
  if (missed > 0) {
    parts.push(
      `${missed} ${missed === 1 ? "country file" : "country files"} did not load and ${missed === 1 ? "was" : "were"} not searched.`,
    );
  }
  return parts.join(" ");
}

/**
 * The countries currently searchable, for a screen that wants to list them
 * rather than count them. Empty until the first search loads the index.
 */
export function indexedCountries(): string[] {
  return [...indexes.values()]
    .map((i) => i.country)
    .filter((c): c is string => Boolean(c))
    .sort();
}
