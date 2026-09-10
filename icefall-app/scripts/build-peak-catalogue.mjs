#!/usr/bin/env node
/**
 * Builds `public/data/peaks.json` — ICEFALL's bundled peak catalogue.
 *
 *   node scripts/build-peak-catalogue.mjs            # the Alps only (the old default)
 *   node scripts/build-peak-catalogue.mjs --world    # every range in REGIONS
 *   node scripts/build-peak-catalogue.mjs --world --refresh   # ignore the cache
 *   node scripts/build-peak-catalogue.mjs --world --only "Atlas,Iceland"
 *   node scripts/build-peak-catalogue.mjs --report   # rebuild the file from cache, fetch nothing
 *
 * The catalogue is the offline fallback and the instant-results set. Live
 * Overpass covers every named peak on earth at runtime, so this file only needs
 * the peaks worth carrying.
 *
 * Data © OpenStreetMap contributors, ODbL. Country boundaries © Natural Earth
 * (public domain), used at build time only and never shipped.
 *
 * ---------------------------------------------------------------------------
 * RESUMABLE
 * ---------------------------------------------------------------------------
 *
 * Every Overpass response is cached to `.harvest-cache/peaks/<slug>.json`, so a
 * re-run refetches nothing it already has and an interrupted run resumes where
 * it stopped. Adding a region to REGIONS and re-running fetches only the new
 * one. `--refresh` throws the cache away; `--only` restricts to named regions.
 *
 * ---------------------------------------------------------------------------
 * TWO DEFECTS THIS FILE USED TO HAVE — both would have shipped on the first
 * `--world` run, and both are fixed here.
 * ---------------------------------------------------------------------------
 *
 * 1. IT DELETED THE COUNTRY FROM EVERY PEAK. The shipped file carries `c`, and
 *    `add()` never wrote one — the field was stamped by a one-off Natural Earth
 *    pass documented in `src/services/peaks.ts` with no script in the repo. `c`
 *    feeds the peak-page header and operator matching, so running the
 *    documented command regressed the product. That pass is now step 2 below,
 *    in this file, reproducible.
 *
 * 2b. IT THREW AWAY THE ENGLISH NAME. OSM carries `name:en` on most major
 *    peaks whose local name is not Latin, and the builder kept only `name`. So
 *    the catalogue held 富士山, دماوند, Эльбрус Западный and
 *    Хан Тәңірі - Хан-Теңири - 汗腾格里峰 — and an athlete typing "Mount Fuji"
 *    or "Damavand" into OFFLINE search found nothing at all, because search
 *    matches the stored name. `enrichPeaks()` repairs this at runtime from
 *    Wikidata labels, but only online and only for peaks that pass through it.
 *    `name:en` is free, it is in the same response, and it is now `x`.
 *
 * 2. IT THREW AWAY THE IDENTITY LINK. OSM tags `wikidata` on 63.9% of Alpine
 *    peaks above 3,000 m and `wikipedia` on 26.2%. The builder kept the second
 *    and dropped the first — and `enrichPeaks()` in `services/peakWikidata.ts`
 *    gates entirely on `p.wikidata`, so for a bundled peak it could never fire.
 *    Photographs and sourced facts both hang off that one tag. It is now `d`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const OUT = join(APP, "public/data/peaks.json");
const CACHE_DIR = join(APP, ".harvest-cache/peaks");
const NE_CACHE = join(APP, ".harvest-cache/ne_10m_admin_0_countries.geojson");

/**
 * A real User-Agent naming the project and a contact address.
 *
 * `TrailPlate.tsx` records what the alternative costs: a sweep of twelve
 * locations was rate-limited after five requests, on 2026-08-24, and the
 * imagery system built on it was torn out. Overpass and Wikimedia both ask for
 * identification and both throttle anonymous bulk traffic first.
 */
const UA =
  "IcefallPeakCatalogue/2.0 (https://github.com/Chrispapado06/icefall; icefallapp@gmail.com) node/" +
  process.versions.node;

/*
 * ORDER MATTERS, AND IT IS NOT ALPHABETICAL.
 *
 * These queries are slow by nature: OSM has no numeric index on `ele`, so an
 * elevation floor is a POST-RETRIEVAL filter — Overpass must fetch every named
 * peak in the bounding box before it can discard the low ones. Measured
 * 2026-09-10, the Iberia box costs ~104 s server-side however the query is
 * phrased (exact-match `natural=peak` unions are no faster than the regex).
 *
 * overpass-api.de's gateway gives up before that and returns 504 "upstream
 * request timeout"; maps.mail.ru answers. Putting the impatient mirror first
 * cost this build every large region in its first run. The patient one leads.
 */
const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const WORLD = flag("world");
const REFRESH = flag("refresh");
const REPORT_ONLY = flag("report");
const ONLY = value("only", "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/*
 * ═══ OWNER RULING, Charlie, 2026-09-10 ═══════════════════════════════════════
 * "add british scottland muntains as well since there not many and only in the
 *  UK area"
 *
 * BRITAIN AND IRELAND WERE ALREADY IN THE WORLD LIST AT 900 m when he asked —
 * this note records the ruling, it did not add the region. 900 m is essentially
 * the Munro line (3,000 FEET = 914 m), which is the threshold British
 * mountaineers actually use, and it is right. The Alpine default of 3,000 m
 * would have returned NOTHING here, because BEN NEVIS IS 1,345 m. Every
 * Scottish, Welsh, Lake District and Irish objective sits below the Alpine
 * floor and is real mountaineering — winter Ben Nevis and the Cuillin ridge are
 * not hillwalking.
 *
 * Charlie's own reasoning is the argument for doing it: the set is SMALL and
 * GEOGRAPHICALLY CONTAINED, so it costs almost nothing in file size. Measured
 * on 2026-09-10, OSM holds 521 named peaks with an elevation in Scotland alone,
 * and 78.9% of them carry a wikidata tag — the HIGHEST resolution rate of any
 * range sampled, better than the Alps at 63.9%. So these peaks enrich well too.
 *
 * The per-region thresholds below are therefore the correct design and are
 * kept. The one thing that must never happen is a single elevation cut applied
 * worldwide.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/*
 * ═══ OWNER RULING, Charlie, 2026-09-10 — CLIMBABLE, NOT COMPLETE ════════════
 * "well add mountains that are climbable at least. is it under 500 or over 500"
 *
 * Told the world set would be roughly 15,000–35,000 peaks, his answer was that
 * they should be CLIMBABLE. So the target is NOT a complete gazetteer of every
 * named high point OSM holds. A catalogue full of 30 m bumps on ridges makes
 * search worse, not better, and buries the mountains somebody would actually
 * set as an objective.
 *
 * HOW THAT RULING IS IMPLEMENTED HERE — TWO ADMISSION TIERS PER RANGE:
 *
 *   CORE FLOOR    Above it, every named summit is admitted. At this height, in
 *                 this range, a named top is a mountain and no further test is
 *                 needed.
 *
 *   DOC FLOOR     Between the doc floor and the core floor, a summit is
 *                 admitted ONLY IF OSM carries a `wikidata` or `wikipedia` tag
 *                 for it. A peak has an encyclopaedia entity because people go
 *                 there and write about it. Measured 2026-09-10 across 3,028
 *                 OSM peaks: 58.1% carry `wikidata` overall — Scotland highest
 *                 at 78.9%, the Alps 63.9%, Himalaya and Andes ~42%. That is a
 *                 real-world climbability signal, it is already being harvested
 *                 for the facts and the photographs, so it costs nothing extra.
 *
 * WHY NOT PROMINENCE, which is the measure mountaineers actually use. Two
 * measurements killed it. Only 29.6% of Alpine peaks above 3,000 m carry P2660
 * at all, so it cannot be a gate without throwing away seven peaks in ten for
 * lack of data. And THE EIGER'S PROMINENCE IS 361 m — any cut at 500 m drops
 * the Eiger. It stays a ranking and display fact where present, never a filter.
 *
 * THE FAILURE TO AVOID: filtering so hard that a genuine objective disappears.
 * The Cuillin ridge tops have low prominence and are serious mountaineering —
 * they survive here because they are documented, not because they are big. Each
 * region therefore reports ADMITTED / EXCLUDED in the documented band, so the
 * cost of the filter is visible rather than assumed. See the run log.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Global scans time out, so the world is covered range by range.
 *
 * `core` admits every named summit; `doc` admits only summits with a Wikidata
 * or Wikipedia tag. Floors are per-range because the climbing is at a different
 * height in each: 900 m is a mountain in Scotland and a foothill in Nepal.
 *
 * The `must` list on a region names peaks that have to survive the build. They
 * are asserted at the end — a floor that drops Ben Nevis or Toubkal is a floor
 * that is wrong, and the run says so rather than shipping quietly.
 */
const REGIONS = [
  // ── Europe ────────────────────────────────────────────────────────────────
  {
    name: "Alps",
    bbox: [43.2, 4.5, 48.3, 16.8],
    core: 3000,
    doc: 2200,
    always: true, // built even without --world; this is the old default
    must: ["Mont Blanc", "Matterhorn", "Eiger", "Gran Paradiso"],
  },
  {
    name: "Pyrenees",
    // Was 3,000 m, which excluded Pic du Midi d'Ossau (2,884 m).
    bbox: [42, -2, 43.8, 3.5],
    core: 2600,
    doc: 2000,
    must: ["Aneto"],
  },
  {
    name: "Iberia",
    // Sierra Nevada, Picos de Europa, Gredos. Mulhacén (3,479 m) and Naranjo de
    // Bulnes (2,519 m) were outside every box in the old world list.
    bbox: [36, -9.6, 43.9, 3.4],
    core: 2000,
    doc: 1400,
    must: ["Mulhacén"],
  },
  {
    name: "Apennines / Corsica",
    // Monte Cinto (2,706 m), Gran Sasso (2,912 m), Etna (3,357 m) — all south
    // or west of the Alpine box.
    bbox: [36.5, 7.8, 44.5, 18.6],
    core: 1800,
    doc: 1200,
    must: ["Monte Cinto"],
  },
  {
    name: "Britain / Ireland",
    // 900 m is the Munro line and Charlie's ruling above keeps it. The doc band
    // below it is what carries the Cuillin and the Lakeland rock peaks.
    bbox: [49.8, -11, 61, 2],
    core: 900,
    doc: 600,
    must: ["Ben Nevis", "Scafell Pike"],
  },
  {
    name: "Scandinavia",
    // Was 1,900 m, which excluded Trollveggen (1,700 m), the tallest vertical
    // rock face in Europe.
    bbox: [58, 4, 71, 32],
    core: 1400,
    doc: 900,
    must: ["Galdhøpiggen"],
  },
  {
    name: "Iceland",
    bbox: [63, -25, 67, -13],
    core: 1000,
    doc: 600,
    must: ["Hvannadalshnúkur"],
  },
  {
    name: "Carpathians / Balkans",
    bbox: [40, 13, 49.5, 29],
    core: 2200,
    doc: 1500,
    must: ["Gerlachovský štít"],
  },
  {
    name: "Caucasus",
    bbox: [40, 39, 46, 51],
    core: 3500,
    doc: 2500,
    must: ["Elbrus"],
  },

  // ── Asia ──────────────────────────────────────────────────────────────────
  {
    name: "Himalaya / Karakoram",
    bbox: [25, 70, 41, 101],
    core: 5500,
    doc: 4500,
    must: ["Ama Dablam"],
  },
  {
    name: "Tien Shan / Pamir",
    // Khan Tengri (7,010 m) and Ismoil Somoni were outside every old box.
    bbox: [35, 66, 45.5, 95],
    core: 4500,
    doc: 3500,
    must: ["Khan Tengri"],
  },
  {
    name: "Turkey / Iran / Caucasus south",
    // Damavand (5,610 m) and Ararat (5,137 m).
    bbox: [30, 25, 42, 64],
    core: 3500,
    doc: 2600,
    must: ["Damavand"],
  },
  {
    name: "Japan",
    bbox: [30, 129, 46, 146],
    core: 2400,
    doc: 1600,
    must: ["Mount Fuji"],
  },
  {
    name: "Altai / Sayan",
    bbox: [46, 84, 56, 100],
    core: 2800,
    doc: 2000,
    must: [],
  },
  {
    name: "Kamchatka",
    bbox: [50, 155, 62, 165],
    core: 2000,
    doc: 1400,
    must: [],
  },
  {
    name: "SE Asia / Borneo / New Guinea",
    // Kinabalu (4,095 m) and Puncak Jaya (4,884 m).
    bbox: [-11, 94, 9, 152],
    core: 2500,
    doc: 1800,
    must: ["Kinabalu"],
  },

  // ── Africa ────────────────────────────────────────────────────────────────
  {
    name: "Atlas",
    // TOUBKAL (4,167 m) IS A CURATED ICEFALL OBJECTIVE and fell outside every
    // box in the old world list. After a full `--world` run it still would not
    // have been in the catalogue.
    bbox: [28, -11, 36, 2],
    core: 2500,
    doc: 1800,
    must: ["Toubkal"],
  },
  {
    name: "East Africa",
    // Was [-7,27,7,42], which topped out at 7°N and missed the Ethiopian
    // highlands entirely — Ras Dashen is 13.2°N.
    bbox: [-7, 27, 15.5, 52],
    core: 3000,
    doc: 2200,
    /*
     * "Uhuru Peak", NOT "Kilimanjaro", and that is OSM being right rather than
     * incomplete. Kilimanjaro is the massif; the summit node is Uhuru Peak
     * (5,895 m) and the caldera beside it is Kibo. There is no node named
     * Kilimanjaro to find, so asserting one would fail forever and teach the
     * next reader to ignore this check.
     *
     * Worth knowing anyway: the CURATED Kilimanjaro carries the name a person
     * would search for, and `screens/Mountains.tsx` searches the curated list
     * beside the catalogue — so the word still finds the mountain.
     */
    must: ["Uhuru Peak"],
  },
  {
    name: "Southern Africa",
    bbox: [-35, 23, -24, 34],
    core: 2500,
    doc: 1900,
    must: [],
  },
  {
    name: "Atlantic islands",
    // Teide (3,715 m), Pico (2,351 m).
    bbox: [26, -32, 40, -12],
    core: 1500,
    doc: 1000,
    must: ["Teide"],
  },

  // ── Americas ──────────────────────────────────────────────────────────────
  {
    name: "Alaska / Yukon",
    // Was 3,500 m, which yielded 89 peaks for the Alaska Range, the St Elias
    // and the Wrangells combined.
    bbox: [55, -168, 71, -125],
    core: 2500,
    doc: 1600,
    must: ["Denali"],
  },
  {
    name: "Rockies / Sierra / Cascades",
    // Was 4,000 m, which excluded THE ENTIRE CANADIAN ROCKIES — Robson 3,954 m,
    // Assiniboine 3,618 m, Bugaboo Spire 3,204 m — and Shuksan at 2,782 m.
    bbox: [32, -126, 61, -100],
    core: 3000,
    doc: 2300,
    must: ["Mount Rainier", "Mount Robson", "Grand Teton"],
  },
  {
    name: "Appalachians / eastern NA",
    bbox: [33, -85, 50, -60],
    core: 1200,
    doc: 900,
    must: [],
  },
  {
    name: "Greenland / Baffin",
    bbox: [59, -75, 84, -17],
    core: 1800,
    doc: 1200,
    must: [],
  },
  {
    name: "Hawaii",
    bbox: [18, -161, 23, -154],
    core: 2000,
    doc: 1200,
    must: ["Mauna Kea"],
  },
  {
    name: "Mexico / Central America",
    // Orizaba (5,636 m) and Popocatépetl (5,426 m).
    bbox: [7, -107, 25, -77],
    core: 3000,
    doc: 2200,
    must: ["Pico de Orizaba"],
  },
  {
    name: "Andes",
    bbox: [-56, -82, 13, -60],
    core: 5000,
    doc: 4200,
    must: ["Aconcagua", "Cotopaxi"],
  },
  {
    name: "Patagonia",
    // The Andes floor of 5,000 m excludes ALL of Patagonia: Cerro Torre is
    // 3,128 m and Fitz Roy 3,405 m, both inside the Andes box and under its
    // floor. A separate region is the fix — lowering the Andes floor into the
    // 4,000 m altiplano would add thousands of walk-up volcanoes instead.
    bbox: [-56, -76, -38, -64],
    core: 2000,
    doc: 1200,
    must: ["Cerro Torre"],
  },

  // ── Oceania and Antarctica ────────────────────────────────────────────────
  {
    name: "New Zealand",
    bbox: [-47.5, 166, -34, 179],
    core: 2200,
    doc: 1400,
    must: ["Aoraki / Mount Cook"],
  },
  {
    name: "Australia",
    // Kosciuszko (2,228 m) — a Seven Summits peak outside every old box.
    bbox: [-44, 138, -28, 154],
    core: 1200,
    doc: 800,
    must: ["Mount Kosciuszko"],
  },
  {
    name: "Ellsworth / Antarctica",
    // Vinson (4,892 m) — a Seven Summits peak outside every old box.
    bbox: [-86, -100, -72, -55],
    core: 1500,
    doc: 500,
    must: [],
  },
];

/* -------------------------------------------------------------------------- */
/* Polite HTTP                                                                */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 2500;
let lastRequest = 0;

async function overpass(query, attempt = 0) {
  const wait = MIN_GAP_MS - (Date.now() - lastRequest);
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();

  const url = MIRRORS[attempt % MIRRORS.length];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: new URLSearchParams({ data: query }),
    });

    if (res.status === 429 || res.status === 504 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(120_000, 5000 * 2 ** attempt);
      if (attempt >= 6) throw new Error(`HTTP ${res.status} after ${attempt} retries`);
      process.stdout.write(`    ${res.status} — backing off ${Math.round(backoff / 1000)}s\n`);
      await sleep(backoff);
      return overpass(query, attempt + 1);
    }

    const text = await res.text();
    if (!text.trimStart().startsWith("{")) throw new Error("mirror returned an error page");
    const json = JSON.parse(text);
    if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark.slice(0, 80));
    return json;
  } catch (e) {
    if (attempt < 6) {
      process.stdout.write(`    retry (${e.message})\n`);
      await sleep(Math.min(120_000, 5000 * 2 ** attempt));
      return overpass(query, attempt + 1);
    }
    throw e;
  }
}

/* -------------------------------------------------------------------------- */
/* Cache — one file per region per query, so a re-run refetches nothing        */
/* -------------------------------------------------------------------------- */

mkdirSync(CACHE_DIR, { recursive: true });

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function cached(key) {
  const path = join(CACHE_DIR, `${key}.json`);
  if (REFRESH || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
/* Atomic, for the same reason as `harvest-peak-facts.mjs`: an interrupted
   write leaves a truncated file, `cached()` cannot parse it, and a region that
   took a hundred seconds to fetch is silently thrown away. */
function putCache(key, data) {
  const dest = join(CACHE_DIR, `${key}.json`);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), "utf8");
  renameSync(tmp, dest);
}

/** Fetch, or return the cached copy. Every network call in this file goes here. */
async function fetchRegionPart(key, query) {
  const hit = cached(key);
  if (hit) return { ...hit, fromCache: true };
  if (REPORT_ONLY) return null;
  const json = await overpass(query);
  const out = { elements: json.elements ?? [], at: new Date().toISOString() };
  putCache(key, out);
  return { ...out, fromCache: false };
}

/* -------------------------------------------------------------------------- */
/* Peaks                                                                      */
/* -------------------------------------------------------------------------- */

const seen = new Map();
/** 4-dp coordinate → the record already holding it. See `add`. */
const byCoord = new Map();
let replaced = 0;

/** OSM `ele` is free text: "3203", "3,203", "1234 m", "4810.45". */
function parseEle(raw) {
  const n = parseFloat(
    String(raw)
      .replace(/,(\d{3})\b/g, "$1") // thousands separator
      .replace(",", ".") // decimal comma
      .replace(/[^0-9.\-]/g, ""),
  );
  return Number.isFinite(n) ? n : null;
}

const QID = /^Q\d+$/;

function add(el) {
  const t = el.tags;
  if (!t?.name || !t.ele) return false;
  const ele = parseEle(t.ele);
  if (ele === null || ele < 100 || ele > 9000) return false;
  const name = t.name.trim();
  if (!name || name.length > 60) return false;

  /*
   * The English name, when OSM has one AND it says something the local name
   * does not. Stored rather than substituted: `services/peaks.ts` decides
   * which to display and keeps the other as `localName`, so the athlete can
   * still match a card against a signpost.
   */
  const en = t["name:en"]?.trim();
  const useEn = en && en.length <= 60 && en !== name;

  // Peaks are frequently mapped twice by different surveys.
  const key = `${name}|${el.lat.toFixed(2)}|${el.lon.toFixed(2)}`;
  if (seen.has(key)) return false;

  /*
   * ONE RECORD PER COORDINATE, BECAUSE THE COORDINATE IS THE ID.
   *
   * `src/services/peaks.ts` mints every peak's id as `osm:<lat 4dp>,<lon 4dp>`,
   * and objectives, goals and the photograph index all key on it. The name
   * test above lets two differently-named nodes through at the same spot:
   * "Nevado de los Piuquenes" mapped twice 145 m apart rightly survives it,
   * but two nodes within ~10 m must not get one id between them. Measured on
   * the first world build, 93 pairs collided — saving one of them saved, or
   * un-saved, the other.
   *
   * The record with the stronger identity link wins (a wikidata tag over a
   * wikipedia tag over neither) and on a tie the first one stays.
   */
  const at = `${el.lat.toFixed(4)}|${el.lon.toFixed(4)}`;
  const identity = (tags) => (QID.test(tags.wikidata ?? "") ? 2 : 0) + (tags.wikipedia ? 1 : 0);
  const rival = byCoord.get(at);
  if (rival) {
    if (identity(t) <= rival.identity) return false;
    seen.delete(rival.key);
    replaced += 1;
  }
  byCoord.set(at, { key, identity: identity(t) });

  seen.set(key, {
    n: name,
    e: Math.round(ele),
    a: Number(el.lat.toFixed(4)),
    o: Number(el.lon.toFixed(4)),
    ...(useEn ? { x: en } : {}),
    ...(t.wikipedia ? { w: t.wikipedia } : {}),
    // THE IDENTITY LINK. Everything downstream — the photograph, every sourced
    // fact — resolves through this and nothing else. See the header.
    ...(QID.test(t.wikidata ?? "") ? { d: t.wikidata } : {}),
    ...(t.natural === "volcano" ? { v: 1 } : {}),
  });
  return true;
}

/* -------------------------------------------------------------------------- */
/* 1 — harvest                                                                */
/* -------------------------------------------------------------------------- */

const PEAK = `node["natural"~"^(peak|volcano)$"]["name"]["ele"]`;

const wanted = REGIONS.filter((r) => {
  if (ONLY.length) return ONLY.some((o) => r.name.toLowerCase().includes(o));
  return WORLD || r.always;
});

const log = [];

for (const r of wanted) {
  const [s, w, n, e] = r.bbox;
  const box = `${s},${w},${n},${e}`;
  const id = slug(r.name);
  const before = seen.size;

  /*
   * ONE REQUEST PER REGION, AND THE TIERS ARE DECIDED HERE RATHER THAN THERE.
   *
   * The first version asked Overpass three questions — everything above the
   * core floor, the tagged peaks in the band below it, and a count of the whole
   * band so the filter's cost could be reported. Three requests, each paying
   * the same ~100 s retrieval, because the elevation floor is a post-retrieval
   * filter either way. Asking once at the LOWER floor and sorting the answer in
   * JavaScript returns exactly the same three numbers for a third of the
   * traffic, and is markedly kinder to a free endpoint.
   */
  const q = `[out:json][timeout:300];${PEAK}(${box})(if:number(t["ele"])>=${r.doc});out body;`;

  process.stdout.write(`${r.name}\n`);

  let res;
  try {
    res = await fetchRegionPart(`${id}--all`, q);
  } catch (err) {
    process.stdout.write(`  ! FAILED: ${err.message} — re-run to retry this region only\n\n`);
    log.push({ region: r.name, failed: err.message });
    continue;
  }
  if (!res) {
    process.stdout.write(`  · not cached, and --report fetches nothing\n\n`);
    continue;
  }

  let coreAdded = 0;
  let docAdded = 0;
  let excluded = 0;

  for (const el of res.elements) {
    const ele = parseEle(el.tags?.ele);
    if (ele === null) continue;
    if (ele >= r.core) {
      if (add(el)) coreAdded += 1;
      continue;
    }
    // The documented band. See the CLIMBABLE, NOT COMPLETE ruling above.
    const documented = Boolean(el.tags?.wikidata || el.tags?.wikipedia);
    if (documented) {
      if (add(el)) docAdded += 1;
    } else {
      excluded += 1;
    }
  }

  process.stdout.write(
    `  ≥${r.core} m  +${coreAdded}` +
      `   ${r.doc}–${r.core} m documented +${docAdded}` +
      `   (undocumented in that band, excluded: ${excluded})` +
      `${res.fromCache ? "   [cache]" : ""}\n`,
  );
  process.stdout.write(`  running total ${seen.size}\n\n`);

  log.push({
    region: r.name,
    core: r.core,
    doc: r.doc,
    coreAdded,
    docAdded,
    excluded,
    added: seen.size - before,
  });
}

/* -------------------------------------------------------------------------- */
/* 2 — country, by point-in-polygon against Natural Earth                     */
/* -------------------------------------------------------------------------- */

/*
 * `src/services/peaks.ts` explains why this cannot be short-cut: the `w` field
 * looks like it names a country — "fr:Mont Blanc" — but that prefix is the
 * WIKIPEDIA LANGUAGE, and reading it as one puts the Matterhorn and the
 * Weisshorn in France. A longitude band swept both Swiss peaks into a French
 * box too. Only the polygons are right.
 *
 * Natural Earth 10 m admin-0 is public domain. It is ~13 MB, cached outside the
 * bundle and never shipped — only the resulting country string is.
 */

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";

async function countryIndex() {
  if (!existsSync(NE_CACHE)) {
    if (REPORT_ONLY) return null;
    process.stdout.write(`Natural Earth 10 m admin-0 → ${NE_CACHE}\n`);
    const res = await fetch(NE_URL, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Natural Earth HTTP ${res.status}`);
    mkdirSync(dirname(NE_CACHE), { recursive: true });
    writeFileSync(NE_CACHE, Buffer.from(await res.arrayBuffer()));
  }
  const gj = JSON.parse(readFileSync(NE_CACHE, "utf8"));

  // Flatten to rings with a bounding box, so the per-peak test is a cheap bbox
  // reject for all but a handful of candidates.
  const shapes = [];
  for (const f of gj.features) {
    const p = f.properties ?? {};
    const name = p.NAME_EN || p.NAME || p.ADMIN || p.SOVEREIGNT;
    if (!name) continue;
    const polys =
      f.geometry?.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry?.type === "MultiPolygon"
          ? f.geometry.coordinates
          : [];
    for (const poly of polys) {
      const outer = poly[0];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of outer) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      shapes.push({ name, poly, minX, minY, maxX, maxY });
    }
  }
  return shapes;
}

/** Ray casting, outer ring minus holes. */
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countryAt(shapes, lat, lon) {
  for (const s of shapes) {
    if (lon < s.minX || lon > s.maxX || lat < s.minY || lat > s.maxY) continue;
    if (!inRing(s.poly[0], lon, lat)) continue;
    let hole = false;
    for (let h = 1; h < s.poly.length; h++) {
      if (inRing(s.poly[h], lon, lat)) {
        hole = true;
        break;
      }
    }
    if (!hole) return s.name;
  }
  return null;
}

/*
 * THE FJORD PROBLEM. A 10 m coastline is generalised: the 53,668-row world
 * build left five summits outside every polygon — three in Fiordland (Rover
 * Peak, Mount Danae, Te Rakihuitahi / Mount Longsight), Sermitsiaq on its
 * island off Nuuk, and Himmeltindan on Lofoten — all of them land, all of them
 * a few hundred metres from the drawn coast. Antarctic nunataks are the only
 * honest "no country", and they sit thousands of kilometres from any polygon.
 *
 * So a point that is in no polygon is given the nearest polygon's country
 * when that polygon's outer ring passes within COAST_SLACK_M. The result is
 * still Natural Earth's answer — the same dataset, the same boundary — which
 * is what `countrySource: "Natural Earth"` promises on the page.
 */
const COAST_SLACK_M = 5_000;

function nearestCountry(shapes, lat, lon) {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const degSlack = COAST_SLACK_M / 111_000;
  let best = null;
  for (const s of shapes) {
    if (
      lon < s.minX - degSlack / cosLat ||
      lon > s.maxX + degSlack / cosLat ||
      lat < s.minY - degSlack ||
      lat > s.maxY + degSlack
    ) {
      continue;
    }
    for (const [x, y] of s.poly[0]) {
      const dx = (x - lon) * cosLat * 111_000;
      const dy = (y - lat) * 111_000;
      const d = Math.hypot(dx, dy);
      if (d <= COAST_SLACK_M && (best === null || d < best.d)) best = { d, name: s.name };
    }
  }
  return best?.name ?? null;
}

const peaks = [...seen.values()].sort((a, b) => b.e - a.e);

/*
 * ONE IDENTITY LINK PER ENTITY, ON THE HIGHEST NODE.
 *
 * Mappers tag a massif's Wikidata id onto more than one of its summits.
 * Measured on the first world build: 286 entities sat on two or more nodes.
 * 209 of those are the same mountain mapped twice within 1.5 km (Elbrus West
 * and East both carry Q43105) and are harmless. The other 77 are not: "Cerro
 * Bonete" at 4,943 m carried the id of Cerro Bonete Chico at 6,759 m, fifty
 * kilometres away; Huandoy's three summits shared one id; "Cerro Padreyoc" at
 * 4,710 m carried Kiswar's. Everything downstream — every harvested fact and
 * the photograph — resolves through this id, so a shared id would hand a
 * sub-top the main summit's prominence, first ascent and picture.
 *
 * The rule is the simplest one that was right in every measured case: the
 * highest node keeps the link, the rest lose it and become plain OSM entries
 * with an elevation and a position. Nothing is invented for them and they are
 * not deleted — the sub-top is a real summit; it just is not the entity. The
 * list is already sorted highest-first, so "first seen" is "highest".
 */
const linked = new Set();
let unlinked = 0;
for (const p of peaks) {
  if (!p.d) continue;
  if (linked.has(p.d)) {
    delete p.d;
    unlinked += 1;
  } else {
    linked.add(p.d);
  }
}

let placed = 0;
if (peaks.length) {
  const shapes = await countryIndex();
  if (shapes) {
    for (const p of peaks) {
      const c = countryAt(shapes, p.a, p.o) ?? nearestCountry(shapes, p.a, p.o);
      // A missing country is a NAMED ABSENCE, not an empty string: the field is
      // simply not written, and `src/services/peaks.ts` renders the peak
      // without a country rather than inventing one. Antarctic nunataks
      // legitimately land outside every polygon; a coastal summit a few hundred
      // metres outside a generalised shoreline does not (see `nearestCountry`).
      if (c) {
        p.c = c;
        placed += 1;
      }
    }
  } else {
    process.stdout.write("! no Natural Earth cache and --report fetches nothing: `c` NOT stamped\n");
  }
}

/* -------------------------------------------------------------------------- */
/* 3 — assert, then write                                                      */
/* -------------------------------------------------------------------------- */

/*
 * A floor that drops a famous objective is a floor that is wrong. This is the
 * check that says so out loud instead of shipping a quiet hole — and it is how
 * we know TOUBKAL, a curated ICEFALL objective, is actually in the file this
 * time.
 */
/*
 * BOTH NAMES COUNT. Checking only `n` reported Mount Fuji, Damavand, Elbrus and
 * Khan Tengri as missing when all four were present under their local names —
 * a false alarm that hid the real defect (2b above) rather than exposing it.
 */
/*
 * INSIDE THE REGION'S OWN BOX. Tested against every peak in the world, "Ben
 * Nevis" was satisfied by the 2,682 m one in South Africa and "Cerro Torre" by
 * a 4,631 m homonym in Jujuy — the assertion could not have noticed the
 * Scottish or the Patagonian row being dropped. Six other summits share the
 * name Ben Nevis. The candidate set is now the region's bbox.
 */
const inBox = (p, [s, w, n, e]) => p.a >= s && p.a <= n && p.o >= w && p.o <= e;
const missing = [];
for (const r of wanted) {
  const names = new Set(
    peaks
      .filter((p) => inBox(p, r.bbox))
      .flatMap((p) => [p.n.toLowerCase(), ...(p.x ? [p.x.toLowerCase()] : [])]),
  );
  for (const m of r.must ?? []) {
    const hit = [...names].some((n) => n.includes(m.toLowerCase().split(" / ")[0]));
    if (!hit) missing.push(`${m} (${r.name})`);
  }
}

const bytes = JSON.stringify(peaks).length;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(peaks));

const withD = peaks.filter((p) => p.d).length;
const withW = peaks.filter((p) => p.w).length;
const withC = peaks.filter((p) => p.c).length;

process.stdout.write(
  `\n─────────────────────────────────────────────────────────\n` +
    `${peaks.length} peaks → ${OUT}  (${(bytes / 1024).toFixed(0)} KB raw)\n` +
    `  wikidata id (d)  ${withD}  (${((withD / peaks.length) * 100).toFixed(1)}%)\n` +
    `  wikipedia   (w)  ${withW}  (${((withW / peaks.length) * 100).toFixed(1)}%)\n` +
    `  country     (c)  ${withC}  (${((withC / peaks.length) * 100).toFixed(1)}%)  [placed ${placed}]\n` +
    `  same-coordinate collisions resolved ${replaced}, duplicate entity links removed ${unlinked}\n`,
);

if (missing.length) {
  process.stdout.write(`\n! MISSING REQUIRED PEAKS — a floor or a bbox is wrong:\n`);
  for (const m of missing) process.stdout.write(`    ${m}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\n  all ${wanted.reduce((n, r) => n + (r.must?.length ?? 0), 0)} required peaks present\n`);
}

writeFileSync(join(CACHE_DIR, "_run-log.json"), JSON.stringify(log, null, 2));
