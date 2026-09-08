#!/usr/bin/env node
/**
 * Fills the last of the British and Irish photograph gap from Geograph.
 *
 *   node scripts/harvest-geograph.mjs --dry-run     # ask, decide, write nothing
 *   node scripts/harvest-geograph.mjs               # resolve + download images
 *   node scripts/harvest-geograph.mjs --merge       # merge into photos.json
 *
 * Resumable: every answer is cached under `.harvest/geograph/`, so a re-run
 * makes no HTTP request for a trail already decided and costs nothing. Delete
 * that folder to start over. Only `--merge` touches photos.json.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS SMALL, AND WHY THAT IS THE FINDING
 *
 * Geograph was expected to be the big cheap win. Measured 2026-09-08, it is
 * already finished:
 *
 *   Wales      116 trails   116 covered   100.0%
 *   Scotland   666          661            99.2%
 *   England  1,587        1,567            98.7%
 *   Ireland    357          304            85.2%
 *   ─────────────────────────────────────────────
 *   UK + IE  2,726        2,648            97.1%      gap 78
 *
 * 78 trails. 0.10% of the 76,070 in the index. Harvesting every one of them
 * perfectly moves total photograph coverage from 19.3% to 19.4%. It is worth
 * doing because it is finite, correct and cheap — not because it changes the
 * picture. The thing that changes the picture is the satellite layer in
 * `TrailImage`, which covers all 76,070.
 *
 * 53 of the 78 are Irish, which is the one real pattern: Geograph's Irish
 * coverage is thinner than its British coverage, so some of these will have no
 * qualifying photograph within 2 km and will correctly return nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT ASKS, AND THE KIND IT IS ALLOWED TO CLAIM
 *
 * Every entry this writes is kind "near". Never "of". Geograph's syndicator is
 * a proximity search — `location=lat,lon&distance=2` — and proximity is not
 * identity, which is the distinction `src/services/trailImagery.ts` exists to
 * protect and which 2,668 entries in this dataset were found breaking on
 * 2026-09-08 (see `fix-photo-claims.mjs`). A photograph 400 m from a footpath
 * is evidence about a place, and the caption says so: "Moorland near Offa's
 * Dyke Path · <photographer> · CC BY-SA 2.0 · Geograph".
 *
 * What makes that stronger than the Commons geosearch this project deleted is
 * the CATEGORY. A Geograph photographer files their own photograph under a
 * class by hand — "Footpath", "Moorland", "River scene". Nothing here infers a
 * subject from a filename, a name match or a score. The gates below only ever
 * REMOVE a candidate:
 *
 *   LEAF CATEGORY ALLOWLIST. The leaf is the subject the photographer chose;
 *     the `?top:` chain after it is the site's own hierarchy and is ignored.
 *     Leaf-only is what separates "woodland?top:Paths" (a wood — kept) from
 *     "statue?top:Coastal?top:Village" (a statue — dropped) and, importantly,
 *     from "signpost?top:Uplands?top:Paths" — a waymark, which is the exact
 *     shape that put a route's flat EMBLEM on three cards in the Commons
 *     harvest. An allowlist rather than a denylist because a denylist has to
 *     anticipate every wrong subject in Britain and an allowlist does not.
 *   DISTANCE <= 2 km, from the feed's own `Dist:` figure, matching the 2 km
 *     the `PhotoKind` doc already promises for a Geograph "near".
 *   LICENCE must be literally CC BY-SA 2.0, read from the item's own `licence`
 *     URL. Not assumed from the site.
 *   PHOTOGRAPHER must be present. No author, no entry — an image that cannot
 *     carry its credit does not ship.
 *   TITLE must not read as a sign, map, plaque or memorial, for the same
 *     reason the Commons harvest screens filenames.
 *
 * The nearest surviving candidate wins. No scoring, no ranking on anything but
 * the distance the feed itself reports.
 *
 * IMAGES ARE STORED LOCALLY, at 640 px, matching the 2,226 already in
 * `public/data/trails/geograph/`. Geograph publishes only 120x120, 213x160 and
 * the full original — 200 KB and up — so the full one is fetched and resized
 * with `sips`. Where `sips` is missing the original is kept and the run SAYS
 * SO rather than shipping a silently 3x heavier file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TRAILS_DIR = resolve(HERE, "../public/data/trails");
const PHOTOS = resolve(TRAILS_DIR, "photos.json");
const IMAGE_DIR = resolve(TRAILS_DIR, "geograph");
const WORK_DIR = resolve(HERE, "../.harvest/geograph");
const STATE_FILE = resolve(WORK_DIR, "state.json");
const FEED_DIR = resolve(WORK_DIR, "feeds");

const dryRun = process.argv.includes("--dry-run");
const merge = process.argv.includes("--merge");
/**
 * `--reject <osmId>[,<osmId>…] [--why "…"]` — the eyes step.
 *
 * No category, filename or distance can tell a landscape from a close-up of a
 * ragwort taken in a landscape. The Commons harvest learned this the same way,
 * on three route emblems that passed every mechanical gate, and its answer was
 * to open all 83 candidates and look. This does the same for Geograph: the
 * automated gates narrow 78 trails to a couple of dozen, a person looks at
 * those, and a rejection is RECORDED here — resumable, auditable, and gone from
 * any later --merge — rather than deleted by hand from a state file.
 */
const rejectArg = process.argv.indexOf("--reject");
const rejectIds = rejectArg > -1 ? String(process.argv[rejectArg + 1] ?? "").split(",").filter(Boolean) : [];
const whyArg = process.argv.indexOf("--why");
const rejectWhy = whyArg > -1 ? String(process.argv[whyArg + 1] ?? "") : "reviewed: wrong subject";

/** The four country relations Geograph covers. */
const GEOGRAPH_COUNTRIES = [
  { rel: 58437, name: "Wales" },
  { rel: 58446, name: "Scotland" },
  { rel: 58447, name: "England" },
  { rel: 62273, name: "Ireland" },
];

const MAX_DIST_KM = 2;

/**
 * Landscape classes a trail card can honestly show.
 *
 * Every one of these is ground, water, wood or the view of them. Buildings,
 * monuments, signage, vehicles, people and infrastructure are absent on
 * purpose: they are all things a photograph 800 m from a footpath legitimately
 * contains and none of them is what someone opening a trail is looking at.
 */
const LANDSCAPE = new Set(
  [
    // paths and the ground they cross
    "footpath", "public footpath", "permissive path", "long distance footpath",
    "path", "paths", "pathway", "path junction", "bridleway", "byway",
    "track", "tracks", "track junction", "trail", "boardwalk", "steps",
    // land
    "farmland", "farm", "farming", "grazing", "crop", "field", "fields",
    "grassland", "meadow", "pasture", "common", "moor", "moorland", "heath",
    "heathland", "bog", "marsh", "wetland", "fen", "dunes", "machair",
    "hill", "hills", "hillside", "hilltop", "mountain", "mountains", "summit",
    "ridge", "peak", "uplands", "lowlands", "plateau", "slope", "cliff",
    "cliffs", "crag", "scree", "rock", "rocks", "rock formations", "boulder",
    "cave", "gorge", "valley", "glen", "dale", "corrie", "pass", "col",
    "moraine", "snow", "ice", "glacier",
    // woods
    "wood", "woods", "woodland", "forest", "plantation", "copse",
    /*
     * "tree" and "trees" are NOT here, and were, until the pictures were
     * looked at. Geograph's "Tree" is one specimen — the winning candidate
     * under it was a pine on a roadside verge with tarmac across the
     * foreground, 1.9 km from the trail. A wood is a place; a tree is a
     * thing standing in one, and which one is not knowable from the class.
     */
    // water
    "river", "river scene", "rivers", "stream", "burn", "brook", "beck",
    "waterfall", "ford", "lake", "loch", "lochan", "lough", "tarn", "pool",
    "pond", "reservoir", "canal", "estuary", "creek", "inlet", "bay", "firth",
    "sound", "coast", "coastal", "coastal scenery", "coastline", "shore",
    "shoreline", "beach", "sea", "island", "islands", "islet", "spring",
    // the view of any of it
    "view", "views", "viewpoint", "panorama", "scenery", "landscape",
    "countryside", "scene", "vista", "geological interest", "wilderness",
  ].map((s) => s.toLowerCase()),
);

/**
 * Titles that describe an object rather than a place.
 *
 * A backstop under the category allowlist, not a substitute for it: a
 * photograph filed as "Moorland" and titled "Memorial cairn on the moor" is
 * about the memorial. Same intent as `NOT_SCENERY` in harvest-trail-photos.mjs.
 */
const NOT_SCENERY_TITLE =
  /(^|[\s(_-])(map|plan|diagram|logo|emblem|waymark|waymarker|signpost|sign|nameplate|plaque|notice|noticeboard|information board|memorial|monument|statue|gravestone|headstone|milestone|advert|poster|banner|leaflet|artwork|mural|sculpture)([\s)_.,-]|$)/i;

/* -------------------------------------------------------------------------- */
/* Polite HTTP                                                                */
/* -------------------------------------------------------------------------- */

const CONTACT = process.env.ICEFALL_HARVEST_CONTACT || "icefallapp@gmail.com";
const UA = `ICEFALL-trail-photo-harvester/1.0 (https://github.com/Chrispapado06/icefall; ${CONTACT}) node/${process.versions.node}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serial, one host, one request at a time. Geograph is a volunteer project. */
function pacer(minGapMs) {
  let last = 0;
  let chain = Promise.resolve();
  return (fn) => {
    const run = chain.then(async () => {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      return fn();
    });
    // Settled, not `run` — a single rejection must not poison the gate for
    // every later request. Same bug, same fix, as in harvest-trail-photos.mjs.
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };
}

const paceApi = pacer(1_100);
const paceImages = pacer(600);

let httpCalls = 0;

async function get(url, { pace, binary = false, tries = 4 } = {}) {
  for (let attempt = 0; attempt < tries; attempt++) {
    let res;
    try {
      res = await pace(() => {
        httpCalls++;
        return fetch(url, {
          headers: { "User-Agent": UA, Accept: binary ? "image/*" : "application/json" },
          signal: AbortSignal.timeout(45_000),
        });
      });
    } catch (err) {
      console.log(`    ${new URL(url).host} did not answer (${err.name})`);
      return null;
    }
    if (res.status === 429 || res.status === 503) {
      const wait = 20_000 * (attempt + 1);
      console.log(`    HTTP ${res.status} — backing off ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) return null;
    return binary ? Buffer.from(await res.arrayBuffer()) : await res.json().catch(() => null);
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The gates                                                                  */
/* -------------------------------------------------------------------------- */

/** The subject the photographer chose, without the site's hierarchy chain. */
const leafCategory = (category) =>
  String(category ?? "")
    .split("?top:")[0]
    .trim();

/** "Dist:0.7km<br/>" -> 0.7. Absent means unknown, which fails the gate. */
function distanceKm(description) {
  const m = /Dist:\s*([\d.]+)\s*km/i.exec(String(description ?? ""));
  return m ? Number(m[1]) : null;
}

const isCcBySa2 = (licence) =>
  /creativecommons\.org\/licenses\/by-sa\/2\.0/i.test(String(licence ?? ""));

/** The title without Geograph's "NN1071 : " grid-reference prefix. */
const plainTitle = (title) => String(title ?? "").replace(/^[A-Z]{1,2}\d{2,6}\s*:\s*/, "");

/** Why this candidate cannot be used, or null if it can. */
function reject(item) {
  if (!isCcBySa2(item.licence)) return `licence ${item.licence ?? "missing"}`;
  if (!item.author || !String(item.author).trim()) return "no photographer";
  if (!item.guid) return "no id";
  const d = distanceKm(item.description);
  if (d == null) return "no distance";
  if (d > MAX_DIST_KM) return `${d} km away`;
  const leaf = leafCategory(item.category);
  if (!leaf) return "no category";
  if (!LANDSCAPE.has(leaf.toLowerCase())) return `category "${leaf}"`;
  const title = plainTitle(item.title);
  if (NOT_SCENERY_TITLE.test(title)) return `title "${title}"`;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Images                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The full-size photograph, derived from the 120x120 thumb the feed gives.
 *
 * `…/823900_5cffa51f_120x120.jpg` -> `…/823900_5cffa51f.jpg`. Probed against
 * Geograph 2026-09-08: `_120x120` and `_213x160` exist, every other size
 * (`_640x640`, `_800x800`, `_512x512`) is a 404, and the unsuffixed name is
 * the original. So there is nothing between a 120 px thumbnail and the full
 * file, and the resize below is not an optimisation but the only way to get a
 * card-sized image at a card-sized weight.
 */
const fullImageUrl = (thumb) => String(thumb ?? "").replace(/_\d+x\d+\.jpg$/i, ".jpg");

let sipsMissingReported = false;

/** 640 px, matching every file already in public/data/trails/geograph. */
function shrink(path) {
  try {
    execFileSync("sips", ["-Z", "640", path, "--out", path], { stdio: "ignore" });
    return true;
  } catch {
    if (!sipsMissingReported) {
      console.log("    NOTE: `sips` unavailable — images kept at full size (~200 KB each)");
      sipsMissingReported = true;
    }
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

mkdirSync(FEED_DIR, { recursive: true });
const state = loadJson(STATE_FILE, { v: 1, results: {} });
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

/* -------------------------------------------------------------------------- */
/* The gap                                                                    */
/* -------------------------------------------------------------------------- */

const photoFile = loadJson(PHOTOS, null);
if (!photoFile || photoFile.v !== 2) throw new Error("photos.json missing or not v2");

function gapTrails() {
  const gap = [];
  for (const c of GEOGRAPH_COUNTRIES) {
    const country = loadJson(resolve(TRAILS_DIR, `r${c.rel}.json`), null);
    if (!country) continue;
    for (const t of country.trails) {
      if (photoFile.photos[String(t[0])]) continue;
      gap.push({ country: c.name, osmId: t[0], name: t[1], lat: t[2], lon: t[3] });
    }
  }
  return gap;
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

async function feedFor(trail) {
  const cached = resolve(FEED_DIR, `${trail.osmId}.json`);
  if (existsSync(cached)) return loadJson(cached, null);
  const url =
    "https://api.geograph.org.uk/syndicator.php?format=JSON" +
    `&location=${trail.lat.toFixed(5)},${trail.lon.toFixed(5)}&distance=${MAX_DIST_KM}`;
  const json = await get(url, { pace: paceApi });
  if (json) writeFileSync(cached, JSON.stringify(json));
  return json;
}

async function run() {
  const gap = gapTrails();
  console.log(`Geograph gap: ${gap.length} trails across Wales, Scotland, England, Ireland`);
  if (dryRun) console.log("--dry-run: no image is downloaded and nothing is written\n");

  const byCountry = {};
  let resolved = 0;
  let none = 0;
  const rejectReasons = {};

  for (const trail of gap) {
    const prior = state.results[trail.osmId];
    /* A recorded rejection is a decision, and --dry-run must not quietly
     * re-propose the photograph a person already looked at and turned down. */
    if (prior?.rejected) {
      none++;
      console.log(`  – ${trail.country} ${trail.osmId} ${trail.name} — ${prior.rejected}`);
      continue;
    }
    if (prior && !dryRun) {
      if (prior.photo) resolved++;
      else none++;
      continue;
    }

    const feed = await feedFor(trail);
    const items = Array.isArray(feed?.items) ? feed.items : [];
    const passing = [];
    for (const item of items) {
      const why = reject(item);
      if (why) {
        const bucket = /^(category|title|licence)/.test(why)
          ? why.split(" ")[0]
          : /km away/.test(why)
            ? "too far"
            : why;
        rejectReasons[bucket] = (rejectReasons[bucket] ?? 0) + 1;
        continue;
      }
      passing.push({ item, km: distanceKm(item.description) });
    }
    passing.sort((a, b) => a.km - b.km);
    const winner = passing[0];

    if (!winner) {
      none++;
      state.results[trail.osmId] = { photo: null, checked: items.length };
      if (!dryRun) saveState();
      console.log(`  ✗ ${trail.country} ${trail.osmId} ${trail.name} — nothing qualifying in ${items.length} nearby`);
      continue;
    }

    const { item, km } = winner;
    const leaf = leafCategory(item.category);
    const entry = {
      source: "geograph",
      kind: "near",
      src: `/data/trails/geograph/${item.guid}.jpg`,
      credit: String(item.author).trim(),
      license: "CC BY-SA 2.0",
      pageUrl: `https://www.geograph.org.uk/photo/${item.guid}`,
      category: leaf,
      distM: Math.round(km * 1000),
    };

    if (!dryRun) {
      const dest = resolve(IMAGE_DIR, `${item.guid}.jpg`);
      if (!existsSync(dest)) {
        const bytes = await get(fullImageUrl(item.thumb), { pace: paceImages, binary: true });
        if (!bytes) {
          console.log(`  ! ${trail.osmId} image download failed — skipped`);
          continue;
        }
        mkdirSync(IMAGE_DIR, { recursive: true });
        writeFileSync(dest, bytes);
        shrink(dest);
      }
      state.results[trail.osmId] = { photo: entry };
      saveState();
    }

    resolved++;
    byCountry[trail.country] = (byCountry[trail.country] ?? 0) + 1;
    console.log(
      `  ✓ ${trail.country} ${trail.osmId} ${trail.name}\n      "${plainTitle(item.title)}" · ${leaf} · ${entry.distM} m · ${entry.credit}`,
    );
  }

  console.log(`\nresolved ${resolved} · nothing found ${none} · HTTP calls ${httpCalls}`);
  console.log("by country:", JSON.stringify(byCountry));
  console.log("candidates rejected:", JSON.stringify(rejectReasons));
  if (!dryRun) console.log(`\nstate: ${STATE_FILE}\nnow run with --merge to write photos.json`);
}

function mergeIn() {
  const photos = photoFile.photos;
  let added = 0;
  let skipped = 0;
  for (const [osmId, result] of Object.entries(state.results)) {
    const e = result?.photo;
    if (!e) continue;
    if (photos[osmId]) {
      skipped++;
      continue;
    }
    // Nothing ships without all four. This is the same contract the caption
    // renders and the licence requires; a partial entry is a breach waiting to
    // be noticed by someone else.
    if (!e.source || !e.credit || !e.license || !e.kind) {
      console.log(`  ! ${osmId} incomplete — not merged`);
      continue;
    }
    const img = resolve(IMAGE_DIR, `${e.src.split("/").pop()}`);
    if (!existsSync(img)) {
      console.log(`  ! ${osmId} image missing on disk — not merged`);
      continue;
    }
    photos[osmId] = e;
    added++;
  }
  const out = { ...photoFile, built: new Date().toISOString().slice(0, 10), photos };
  writeFileSync(PHOTOS, JSON.stringify(out));
  console.log(`merged ${added} new entries (${skipped} already had one). photos.json now ${Object.keys(photos).length} entries.`);
}

if (rejectIds.length) {
  for (const id of rejectIds) {
    const prior = state.results[id];
    state.results[id] = { photo: null, rejected: rejectWhy, was: prior?.photo?.pageUrl ?? null };
    console.log(`rejected ${id} — ${rejectWhy}${prior?.photo ? ` (was ${prior.photo.pageUrl})` : ""}`);
  }
  saveState();
} else if (merge) mergeIn();
else await run();
