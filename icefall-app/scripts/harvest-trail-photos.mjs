#!/usr/bin/env node
/**
 * Harvests verified photographs for trails that have none, into
 * `public/data/trails/photos.json` (v2).
 *
 *   node scripts/harvest-trail-photos.mjs --dry-run --limit 50 --rel 2202162
 *   node scripts/harvest-trail-photos.mjs --rel 2202162        # real run, resumable
 *   node scripts/harvest-trail-photos.mjs                      # every country file
 *   node scripts/harvest-trail-photos.mjs --merge              # merge into photos.json
 *
 * A run resumes from `.harvest/state.json`; delete the `.harvest/` folder to
 * start the sweep over. Nothing in there is ever shipped, and only `--merge`
 * touches photos.json.
 *
 * WHY THIS FILE EXISTS AT ALL. The previous sweep was run ad hoc and thrown
 * away, so the 16,017 entries in photos.json cannot be reproduced, audited or
 * extended by anyone. This one lives beside build-trail-index.mjs, takes the
 * same shape (plain .mjs, node, no dependencies), and is the only supported way
 * to add an entry.
 *
 * WHAT IT WILL AND WILL NOT ASK.
 *
 * `src/services/trailImagery.ts` records three approaches that were tried and
 * rejected: Commons geosearch by filename (a stranger's thumbs-up selfie for
 * Cyprus, a war memorial for Chamonix), bundled terrain photos (an Icelandic
 * massif on a Cypriot ridge), and contour-plates-only (no imagery at all). The
 * common failure was inferring a SUBJECT from something that only knows a
 * PLACE or a STRING. This script therefore never issues a query that takes a
 * coordinate, a radius, a bounding box or a name. Not once. There is no
 * geosearch call in this file and there must never be one.
 *
 * Every source that a 2026-09-07 review marked REJECT is absent, deliberately,
 * and each is named here so nobody re-adds one thinking it was an oversight:
 *
 *   Mapillary        the Graph API exposes NO per-image licence field while the
 *                    terms reserve the right to serve some content as
 *                    CC BY-NC-SA, so the licence string would be a guess on
 *                    every entry; it also demands a visible logo + link that a
 *                    caption cannot carry, and its geotag locates the camera,
 *                    not the subject.
 *   OSM  image=*     no licence field, no photographer field. The OSM wiki says
 *                    outright there is "no way to get info about licensing
 *                    status". 88 of its 132 in-gap values point at 38 unrelated
 *                    third-party hosts. An entry that cannot carry credit +
 *                    licence + source does not get written, so these are not.
 *   Flickr           a geotag is where the camera was, not what it shows; plus
 *                    commercial key required, max 30 photos per page, no
 *                    caching, and a 24-hour takedown a static offline
 *                    photos.json structurally cannot honour.
 *   Unsplash         no coordinate search exists, so any match is a stock
 *                    mountain placed on a named trail — rejected approach #2
 *                    with a cleaner licence.
 *   Openverse        excellent attribution data, but zero geographic
 *                    parameters, and it only re-serves Commons and Flickr.
 *   Wikiloc          personal, non-commercial use only, database right asserted
 *                    against extraction, no API. The right photographs behind
 *                    terms that forbid them.
 *   Commons
 *   deepcategory
 *   + nearcoord      the only method that scales: measured median 6.8 km from
 *                    the trail with ~50% wrong subjects (a Christmas market, a
 *                    castle, an astrophotograph). The Chamonix war memorial
 *                    rebuilt from different parts.
 *
 * WHAT IS LEFT is small, exact, and correct: links a PERSON declared between
 * this OSM relation and a specific Commons file. See `of_vs_near` below.
 *
 * A trail this script cannot serve keeps satellite imagery of its real ground.
 * That fallback is the correct answer, not a placeholder, and is never to be
 * replaced with a borrowed or approximate photograph.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TRAILS_DIR = resolve(HERE, "../public/data/trails");
const PHOTOS = resolve(TRAILS_DIR, "photos.json");
/* State and candidates live OUTSIDE public/ so a half-finished run can never
 * be copied into dist/ by the build. */
const WORK_DIR = resolve(HERE, "../.harvest");
const STATE_FILE = resolve(WORK_DIR, "state.json");
const CANDIDATES = resolve(WORK_DIR, "candidates.json");

/* -------------------------------------------------------------------------- */
/* THE "of" TEST — the one thing in this file that must not be loosened        */
/* -------------------------------------------------------------------------- */

/**
 * An entry is written ONLY when a human being recorded, in a public database,
 * a link from THIS OSM relation id to THIS specific Commons file. Four paths,
 * all of them identity claims, none of them proximity or text:
 *
 *   1. Wikidata item with P402 = <this relation id>, and P18 = <file>.
 *   2. Wikidata item with P402 = <this relation id>, and P373 = <category>;
 *      the file is a DIRECT member of that category (no subcategory descent).
 *   3. The OSM relation carries wikidata=Q… AND that item's P402 names THIS
 *      relation id back. The two-way check is not decoration — see below.
 *   4. The OSM relation carries wikimedia_commons=File:… or Category:….
 *
 * WHY PATH 3 IS TWO-WAY, measured on the first 50-trail dry run of this script
 * (rel 2202162, 2026-09-07). A bare `wikidata=Q…` on a relation is very often a
 * mapper attaching the PARENT ROUTE's item to one short section of it. Taking
 * that item's own P18 then produced, as real output:
 *
 *   relation 454759  "Jakobsweg Saar, Althornbach – Blieskastel – Hérapel"
 *                    -> Catedral de Santiago de Compostela, ~1,800 km away
 *   relation 282117  "Via Francigena - 01 part Great Britain"
 *                    -> Via Francigena at Ariano Irpino, southern Italy
 *
 * Both are photographs of a real thing the trail belongs to, and both would
 * have been captioned as being OF a trail they are nowhere near. That is the
 * Chamonix war memorial arriving through a respectable-looking front door. The
 * item must therefore declare THIS relation, not a family it belongs to. In
 * practice this means path 3 confirms path 1/2 rather than adding to it; it is
 * kept so that a mapper's QID still works the day someone adds the P402
 * back-link, and the run reports how many were refused this way.
 *
 * WHY IT CANNOT PRODUCE A WRONG "of": the script performs no matching of any
 * kind. It does not compare names, does not score similarity, does not rank
 * results, does not measure distance, and never asks "what is near here". The
 * only thing it resolves is a foreign key someone else already wrote down. For
 * a wrong "of" to appear, a person would have to have declared the wrong link
 * on Wikidata or in OSM — a data error upstream that is publicly visible and
 * fixable at source — rather than this script having inferred anything.
 *
 * KIND. Every path above is an identity claim, so every entry this script
 * writes is kind "of". It produces no "near" entries, and that is not an
 * omission: "near" in this dataset means a Geograph photographer filed the
 * shot under a landscape class they chose by hand within 2 km, and no source
 * marked USE supplies human-classified proximity evidence of that strength.
 * A "near" produced from proximity alone would be the rejected geosearch.
 *
 * CONSERVATIVE GATES ON TOP (these only ever REMOVE a candidate, never claim
 * anything about one, which is why a filename may be inspected here and
 * nowhere else):
 *   - must be a raster photograph (jpg/jpeg/png/tif/tiff/webp);
 *   - must return BOTH a photographer and a licence from Commons extmetadata;
 *   - licence must be in the free allowlist, never NC or ND;
 *   - a Commons `Restrictions` flag (personality/trademark rights) skips it;
 *   - names that are plainly a map, plan, diagram, profile, logo or waymark
 *     glyph are skipped — honest "of" material, but a broken-looking card.
 */
const OF_TEST_PATHS = ["wd:P402→P18", "wd:P402→P373", "osm:wikidata⇄P402", "osm:wikimedia_commons"];

const PHOTO_EXT = /\.(jpe?g|png|tiff?|webp)$/i;

/** Free, commercially reusable, attribution-satisfiable. Exact strings come
 *  from Commons `LicenseShortName` — never assumed, only checked. */
const LICENCE_OK = /^(cc0|cc by(-sa)?(\s|$)|public domain|pd(-|\b)|pdm|attribution)/i;
const LICENCE_BAD = /(\bnc\b|noncommercial|non-commercial|\bnd\b|noderiv|fair use)/i;

/**
 * Shapes that are legitimately "of" a trail and still look wrong on a card, plus
 * things that are not photographs of ground at all. The first dry run returned
 * "A mes souscripteurs Reconnaissance Colinet.jpg" — a 19th-century engraving
 * sitting in a trail's own Commons category — as the hero image for a forest
 * circuit. Honest, and not a photograph of anywhere.
 */
const NOT_SCENERY =
  /(^|[\s_-])(map|karte|mapa|carte|plan|diagram|profil|profile|höhenprofil|hoehenprofil|elevation|logo|signet|wappen|coat[\s_-]of[\s_-]arms|schild|icon|symbol|pictogram|piktogramm|waymark|blaze|sticker|qr|engraving|gravure|stich|lithographie|lithograph|portrait|painting|gemälde|peinture|affiche|poster|timbre|stamp|manuscript|urkunde|souscripteurs)([\s_.-]|$)/i;

/**
 * THE FILENAME GATE IS NOT ENOUGH — measured by looking at the pictures.
 *
 * A 2026-09-07 review opened all 83 harvested candidates. Three were not
 * photographs of anywhere at all; they were the ROUTE'S OWN EMBLEM, the flat
 * graphic on a waymark:
 *
 *   rel 161418   Gratweg Stoos            "827-GratwegStoos.jpg"   140x140
 *   rel 13136418 Obwaldner Höhenweg       "57-BE.jpg"              244x245
 *   rel 1254350  European long distance path E6  "E 6 sign.jpg"    2362x1837
 *
 * None contains a NOT_SCENERY word. "E 6 sign.jpg" came closest and still
 * missed — the pattern has `signet`, not `sign`. And ADDING `sign` would have
 * been the wrong fix: it would also have thrown away four of the best honest
 * entries in the set, which are real photographs of a fingerpost standing in a
 * landscape (Offa's Dyke, Vildmarksleden, the Slovak Kačín post, Holustei).
 * A filename cannot tell a photograph OF a sign from the sign's ARTWORK.
 *
 * Two things can, and neither one inspects content or makes any claim:
 *
 *   SIZE, as AREA. No photograph is 140x140. A card renders at 800 px wide, so
 *   anything under ~150k pixels is an upscale of a thumbnail-sized graphic.
 *   Area rather than width/height separately, because the first cut of this
 *   test used `width < 480` and wrongly condemned a perfectly good PORTRAIT
 *   photograph of the St Cuthbert's Way marker post (361x614).
 *
 *   HUMAN CATEGORISATION on Commons — a person filing the file under
 *   "Diagrams of hiking and footpath signs" or "…trail labels" has said, in
 *   words, that it is a diagram. Used ONLY to discard, like every other gate.
 *   `Files by User:…` categories are EXCLUDED: they are one uploader's filing
 *   cabinet, not a statement about the file. Trusting them dropped two real
 *   photographs (Brünigpass, Holustei) purely because their uploader keeps a
 *   folder called "CH-Zeichen".
 */
const MIN_PIXEL_AREA = 150_000;
const NOT_SCENERY_CATEGORY = /\b(diagrams? of|logos?|icons?|pictograms?|coats? of arms|signets?|trail labels?|labels of)\b/i;
const PERSONAL_CATEGORY = /^files by user:/i;

/* -------------------------------------------------------------------------- */
/* Polite HTTP                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Wikimedia's API:Etiquette makes a meaningful User-Agent with contact info
 * mandatory ("unceremoniously block you" otherwise). This is the ICEFALL
 * project's own address; override it if you run the harvest yourself.
 */
const CONTACT = process.env.ICEFALL_HARVEST_CONTACT || "icefallapp@gmail.com";
const UA = `ICEFALL-trail-photo-harvester/1.0 (https://github.com/Chrispapado06/icefall; ${CONTACT}) node/${process.versions.node}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One serial gate per host. No parallel requests anywhere — Overpass and
 *  Wikimedia both ask for that in writing. */
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
    /*
     * The gate advances on a SETTLED promise, not on `run` itself. Chaining the
     * next call onto `run` meant one rejection — a DNS blip, a socket reset, an
     * abort — left `chain` permanently rejected, so every later request through
     * this host resolved to that same old error without a fetch ever being
     * made. For Commons that surfaced as an unhandled rejection killing the
     * sweep; worse, a poisoned gate looks exactly like a host that has stopped
     * answering. Swallow here for SEQUENCING only; the caller still sees the
     * real rejection through `run`.
     */
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };
}

/* Documented limits, halved for politeness:
 *  - Overpass fair use for a "regular application" is <100 queries/day; this
 *    run makes ~1 per 1,000 relations. 5 s apart, mirrors rotated.
 *  - WDQS: serial, ~1 req/s.
 *  - Commons Action API: serial, maxlag=5, 4 req/s.
 */
const paceOverpass = pacer(5_000);
const paceWdqs = pacer(1_100);
const paceCommons = pacer(260);

let httpCalls = 0;
let http429 = 0;

async function getJson(url, { pace, tries = 5, init = {}, timeoutMs = 0 } = {}) {
  for (let attempt = 0; attempt < tries; attempt++) {
    let res;
    try {
      res = await pace(() => {
        httpCalls++;
        return fetch(url, {
          ...init,
          /* A host that accepts the connection and then never answers would
           * otherwise hold the whole serial sweep open indefinitely. */
          ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
          headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
        });
      });
    } catch (err) {
      /* Network error or stall. Returning null lets the CALLER decide — for
       * Overpass that means rotating to another mirror, and if every mirror
       * fails osmTags throws, so this can never be mistaken for "no link". */
      console.log(`    ${new URL(url).host} did not answer (${err.name})`);
      return null;
    }
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      http429++;
      /* Nothing to wait FOR on the last attempt — the caller is about to give
       * up on this host and rotate to another, and the per-host pacer already
       * spaces us out if we ever come back. Sleeping here just added 30 s to
       * every flap of a mirror we were leaving anyway. */
      if (attempt === tries - 1) {
        console.log(`    HTTP ${res.status} from ${new URL(url).host}`);
        return null;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30_000 * (attempt + 1);
      console.log(`    HTTP ${res.status} — backing off ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) return null;
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      /* Wikimedia signals lag inside a 200. Treat it as a 429. */
      if (json?.error?.code === "maxlag" || json?.error?.code === "ratelimited") {
        http429++;
        await sleep(20_000 * (attempt + 1));
        continue;
      }
      return json;
    } catch {
      return null;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * STICKY MIRROR — stay on a mirror that works, rotate only when one fails.
 *
 * This used to advance `mirrorIdx` on EVERY call, round-robining across all
 * three regardless of health, which contradicted the header's own description
 * ("mirrors rotated on failure") and was the single biggest cost in the sweep.
 * Measured 2026-09-07 on one identical 300-relation id lookup:
 *
 *   overpass-api.de        1.4 s   HTTP 200
 *   overpass.kumi.systems 31.3 s   HTTP 200
 *   overpass.private.coffee        110.5 s  HTTP 504  (then getJson's own
 *                                  retry spent a 30 s backoff and hit the same
 *                                  dead host again — ~250 s for one batch)
 *
 * Round-robin therefore put a third of all batches on a host that could not
 * answer at all, and the observed rate was ~2.3 min per 300 trails against
 * ~10 s of actual work. Sticking to a healthy mirror is also the POLITER
 * behaviour, not a shortcut around politeness: the per-host 5 s pacer is
 * unchanged, the query count is unchanged, and two struggling volunteer
 * mirrors stop being sent traffic they are visibly failing to serve.
 *
 * The failure path is unchanged in substance: up to MIRRORS*2 attempts, each
 * rotating to the next host, and if none answers the run THROWS rather than
 * recording these relations as "no-link" — a network outage must never be
 * recorded as an absence of evidence.
 */
let mirrorIdx = 0;

/**
 * Abandon a stalled Overpass mirror rather than wait out its own timeout.
 * A healthy mirror answers a 1200-id lookup in ~7 s; 90 s is generous enough
 * that a merely busy mirror is not thrown away, and short enough that a dead
 * one cannot hold a serial sweep open for the ~110 s private.coffee spent
 * before returning 504.
 */
const OVERPASS_STALL_MS = 90_000;

/**
 * Tags for a batch of relation ids. `out tags;` returns no geometry — the whole
 * worldwide image=* set came back in 495 KB — and this asks by ID, so it never
 * touches an unbounded area query.
 *
 * Only `wikidata` and `wikimedia_commons` are read. `image` is deliberately
 * discarded, unread, at the point of parsing: see the header.
 */
async function osmTags(relIds) {
  /* `timeout:300` is the server-side budget. An id-only lookup of 300
   * relations is answered by a healthy mirror in ~1.4 s, so 300 s only ever
   * buys a sick mirror permission to stall; 90 s is still ~60x the measured
   * time and lets a bad host fail fast instead of holding the sweep open. */
  const query = `[out:json][timeout:90];relation(id:${relIds.join(",")});out tags;`;
  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length * 2; attempt++) {
    const url = OVERPASS_MIRRORS[mirrorIdx % OVERPASS_MIRRORS.length];
    /* NOTE: mirrorIdx is advanced ONLY on failure, below. See STICKY MIRROR. */
    const json = await getJson(url, {
      pace: paceOverpass,
      /* One try per mirror. getJson's retry re-hits the SAME host, which on a
       * mirror returning 504 spends the backoff twice over before the rotation
       * below ever gets a turn. Rotating is the better retry. */
      tries: 1,
      timeoutMs: OVERPASS_STALL_MS,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      },
    });
    if (json?.elements) {
      const out = new Map();
      for (const el of json.elements) {
        const t = el.tags ?? {};
        out.set(String(el.id), {
          qid: /^Q\d+$/.test(t.wikidata ?? "") ? t.wikidata : null,
          commons: typeof t.wikimedia_commons === "string" ? t.wikimedia_commons : null,
        });
      }
      return out;
    }
    console.log(`    overpass ${new URL(url).host} unavailable — rotating`);
    mirrorIdx++;
    await sleep(10_000);
  }
  throw new Error("No Overpass mirror answered");
}

const WDQS = "https://query.wikidata.org/sparql";

async function sparql(query) {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  const json = await getJson(url, { pace: paceWdqs, init: { headers: { Accept: "application/sparql-results+json" } } });
  return json?.results?.bindings ?? [];
}

/** Path 1 + 2: OSM relation id -> Wikidata item (P402) -> P18 / P373. */
async function wikidataByRelation(relIds) {
  const values = relIds.map((id) => `"${id}"`).join(" ");
  const rows = await sparql(
    `SELECT ?rid ?item ?img ?cat WHERE { VALUES ?rid { ${values} } ?item wdt:P402 ?rid .` +
      ` OPTIONAL { ?item wdt:P18 ?img } OPTIONAL { ?item wdt:P373 ?cat } }`,
  );
  const out = new Map();
  for (const r of rows) {
    const rid = r.rid?.value;
    if (!rid) continue;
    out.set(rid, {
      item: r.item?.value?.split("/").pop() ?? null,
      p18: r.img ? decodeURIComponent(r.img.value.split("/").pop()).replace(/_/g, " ") : null,
      p373: r.cat?.value ?? null,
    });
  }
  return out;
}

/**
 * Path 3: a QID a mapper attached to the relation -> P18 / P373, AND the item's
 * own P402 values so the caller can require the item to name this relation
 * back. Without that requirement this path attaches a parent route's photograph
 * to one section of it — see the two worked failures in the header.
 */
async function wikidataByQid(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const rows = await sparql(
    `SELECT ?item ?img ?cat ?rid WHERE { VALUES ?item { ${values} }` +
      ` OPTIONAL { ?item wdt:P18 ?img } OPTIONAL { ?item wdt:P373 ?cat }` +
      ` OPTIONAL { ?item wdt:P402 ?rid } }`,
  );
  const out = new Map();
  for (const r of rows) {
    const qid = r.item?.value?.split("/").pop();
    if (!qid) continue;
    const prev = out.get(qid) ?? { item: qid, p18: null, p373: null, p402: new Set() };
    if (r.img) prev.p18 = decodeURIComponent(r.img.value.split("/").pop()).replace(/_/g, " ");
    if (r.cat) prev.p373 = r.cat.value;
    if (r.rid) prev.p402.add(String(r.rid.value).trim());
    out.set(qid, prev);
  }
  return out;
}

const COMMONS = "https://commons.wikimedia.org/w/api.php";

/** Direct file members of a category. No subcategory descent: a file two
 *  levels down was categorised against something else, not this trail. */
async function categoryFiles(category) {
  const title = `Category:${category.replace(/^Category:/i, "")}`;
  const url =
    `${COMMONS}?action=query&format=json&formatversion=2&maxlag=5&list=categorymembers` +
    `&cmtitle=${encodeURIComponent(title)}&cmtype=file&cmnamespace=6&cmlimit=50&cmsort=sortkey`;
  const json = await getJson(url, { pace: paceCommons });
  return (json?.query?.categorymembers ?? []).map((m) => String(m.title).replace(/^File:/, ""));
}

const stripHtml = (s) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Credit + licence for one file, read per file, never assumed.
 * Returns null (with a reason logged into the tally) if any of the three
 * mandatory fields is missing or the licence is not free.
 */
async function commonsFile(file, tally) {
  if (!PHOTO_EXT.test(file)) return (tally.skipNotPhoto++, null);
  if (NOT_SCENERY.test(file)) return (tally.skipNotScenery++, null);
  /* `categories` and `size` ride along on the imageinfo request that was
   * already being made — the two gates below cost no extra HTTP call. */
  const url =
    `${COMMONS}?action=query&format=json&formatversion=2&maxlag=5&prop=imageinfo%7Ccategories` +
    `&iiprop=extmetadata%7Curl%7Csize&cllimit=100&titles=${encodeURIComponent(`File:${file}`)}`;
  const json = await getJson(url, { pace: paceCommons });
  const page = json?.query?.pages?.[0];
  if (!page || page.missing) return (tally.skipMissing++, null);
  const info = page.imageinfo?.[0] ?? {};

  /* Not a photograph of ground — see MIN_PIXEL_AREA / NOT_SCENERY_CATEGORY. */
  const area = (info.width ?? 0) * (info.height ?? 0);
  if (area < MIN_PIXEL_AREA) return (tally.skipTooSmall++, null);
  const contentCategories = (page.categories ?? [])
    .map((c) => String(c.title).replace(/^Category:/, ""))
    .filter((c) => !PERSONAL_CATEGORY.test(c) && NOT_SCENERY_CATEGORY.test(c));
  if (contentCategories.length) return (tally.skipNotScenery++, null);

  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value);
  const credit = stripHtml(meta.Artist?.value);
  const restrictions = stripHtml(meta.Restrictions?.value);
  if (!license) return (tally.skipNoLicence++, null);
  if (!credit) return (tally.skipNoCredit++, null);
  if (LICENCE_BAD.test(license) || !LICENCE_OK.test(license)) {
    tally.skipLicenceNotFree++;
    tally.rejectedLicences.add(license);
    return null;
  }
  if (restrictions) return (tally.skipRestricted++, null);
  const enc = encodeURIComponent(file);
  return {
    source: "commons",
    kind: "of",
    src: `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=800`,
    credit,
    license,
    pageUrl: `https://commons.wikimedia.org/wiki/File:${enc}`,
    file,
  };
}

/* -------------------------------------------------------------------------- */
/* Trail data                                                                 */
/* -------------------------------------------------------------------------- */

function loadPhotos() {
  const json = JSON.parse(readFileSync(PHOTOS, "utf8"));
  if (json.v !== 2) throw new Error(`photos.json is v${json.v}, expected v2`);
  return json;
}

function countryFiles(onlyRel) {
  const manifest = JSON.parse(readFileSync(resolve(TRAILS_DIR, "manifest.json"), "utf8"));
  return manifest.countries
    .map((c) => c.rel)
    .filter((rel) => (onlyRel ? String(rel) === String(onlyRel) : true));
}

/** Gap = trails in the country files with no entry in photos.json. */
function gapTrails(rels, covered) {
  const seen = new Set();
  const gap = [];
  for (const rel of rels) {
    const file = resolve(TRAILS_DIR, `r${rel}.json`);
    if (!existsSync(file)) continue;
    for (const row of JSON.parse(readFileSync(file, "utf8")).trails) {
      const id = String(row[0]);
      if (seen.has(id) || covered.has(id)) continue;
      seen.add(id);
      gap.push({ id, name: row[1], country: rel });
    }
  }
  return gap;
}

/* -------------------------------------------------------------------------- */
/* Resumable state                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One record per relation, so ANY phase can skip work already done and a second
 * run continues instead of restarting. States: "pending" (tags not read),
 * "no-link" (terminal, no human link exists), "resolved" (terminal, entry
 * written to candidates), "no-media" (terminal, link exists but no usable file).
 */
function loadState() {
  if (!existsSync(STATE_FILE)) return { v: 1, started: new Date().toISOString(), rels: {} };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.log("  state.json unreadable — starting a fresh state (photos.json untouched)");
    return { v: 1, started: new Date().toISOString(), rels: {} };
  }
}

/** Write via a temp file + rename so an interrupt can never leave a half file. */
function writeAtomic(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function saveState(state, candidates) {
  mkdirSync(WORK_DIR, { recursive: true });
  writeAtomic(STATE_FILE, JSON.stringify(state));
  writeAtomic(CANDIDATES, JSON.stringify({ v: 2, built: new Date().toISOString(), photos: candidates }, null, 1));
}

/* -------------------------------------------------------------------------- */
/* Merge — the only thing that ever touches photos.json                       */
/* -------------------------------------------------------------------------- */

/**
 * Never truncates in place. Backs up first (the repo already keeps
 * photos.backup-*.json and photos.pre-*.json from earlier runs), merges only
 * relations that have NO existing entry, and writes through a temp file.
 * An existing entry is never overwritten — a harvest cannot regress the index.
 */
function merge() {
  if (!existsSync(CANDIDATES)) {
    console.log("Nothing to merge: no .harvest/candidates.json. Run the harvest first.");
    return;
  }
  const current = loadPhotos();
  const incoming = JSON.parse(readFileSync(CANDIDATES, "utf8")).photos ?? {};
  /* Same name shape as the backups already in the folder: photos.backup-YYYYMMDD-HHMM.json */
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const backup = resolve(TRAILS_DIR, `photos.backup-${stamp.slice(0, 8)}-${stamp.slice(8, 12)}.json`);
  writeFileSync(backup, JSON.stringify(current));
  console.log(`Backed up ${Object.keys(current.photos).length} entries -> ${backup.split("/").pop()}`);

  let added = 0;
  let skipped = 0;
  for (const [id, entry] of Object.entries(incoming)) {
    if (current.photos[id]) {
      skipped++;
      continue;
    }
    if (!entry.source || !entry.kind || !entry.src || !entry.credit || !entry.license || !entry.pageUrl) {
      skipped++;
      continue; // an entry that cannot carry all three does not get written
    }
    current.photos[id] = entry;
    added++;
  }
  writeAtomic(PHOTOS, JSON.stringify(current));
  console.log(`Merged ${added} new entries (${skipped} already present or incomplete).`);
  console.log(`photos.json now holds ${Object.keys(current.photos).length} entries.`);
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const DRY = flag("--dry-run");
const LIMIT = Number(value("--limit") ?? 0) || Infinity;
const ONLY_REL = value("--rel");

if (flag("--merge")) {
  merge();
  process.exit(0);
}

/**
 * Relations per Overpass query. Raised from 300 after measuring the two
 * services separately on 2026-09-07 — they have opposite constraints:
 *
 *   Overpass  300 ids -> 0.9 s | 1200 ids -> 7.0 s. Four 300-id queries cost
 *             ~24 s once the mandatory 5 s inter-query gap is counted, against
 *             ~12 s for one 1200-id query. Fewer, larger queries are also what
 *             the fair-use guideline actually counts (queries/day), so this
 *             cuts load on three visibly struggling volunteer mirrors 4x.
 *   WDQS      300 ids -> 0.46 s | 1000 ids -> HTTP 431. It will not take a
 *             larger VALUES block, so WD_BATCH must NOT be raised to match.
 *
 * The run loop already sub-batches WDQS inside each Overpass slice, so these
 * two numbers are independent and must stay that way.
 */
const OSM_BATCH = 1200; // relations per Overpass query
const WD_BATCH = 300; // ids or QIDs per SPARQL query — 1000 returns HTTP 431

const photosFile = loadPhotos();
const covered = new Set(Object.keys(photosFile.photos));
const rels = countryFiles(ONLY_REL);
if (!rels.length) {
  console.error(`No country file for --rel ${ONLY_REL}`);
  process.exit(1);
}

const state = DRY ? { v: 1, rels: {} } : loadState();
const candidates = !DRY && existsSync(CANDIDATES) ? (JSON.parse(readFileSync(CANDIDATES, "utf8")).photos ?? {}) : {};

const allGap = gapTrails(rels, covered);
const todo = allGap.filter((t) => {
  const s = state.rels[t.id]?.status;
  return s !== "no-link" && s !== "resolved" && s !== "no-media";
});
const batchTrails = todo.slice(0, LIMIT === Infinity ? todo.length : LIMIT);

const tally = {
  trails: batchTrails.length,
  withQidTag: 0,
  withCommonsTag: 0,
  viaP402: 0,
  withP18: 0,
  withP373: 0,
  resolvedOf: 0,
  resolvedNear: 0,
  noLink: 0,
  noMedia: 0,
  skipNotPhoto: 0,
  skipNotScenery: 0,
  skipTooSmall: 0,
  skipMissing: 0,
  skipNoLicence: 0,
  skipNoCredit: 0,
  skipLicenceNotFree: 0,
  skipRestricted: 0,
  skipParentItem: 0,
  rejectedLicences: new Set(),
};

console.log(`ICEFALL trail photo harvest${DRY ? "  (DRY RUN — nothing is written)" : ""}`);
console.log(`  country files : ${rels.join(", ")}`);
console.log(`  covered       : ${covered.size} relations in photos.json (whole index)`);
console.log(`  gap here      : ${allGap.length} uncovered relations in these files` +
  `   already attempted: ${allGap.length - todo.length}`);
console.log(`  this run      : ${batchTrails.length}`);
console.log(`  of-test paths : ${OF_TEST_PATHS.join(", ")}`);
console.log("");

const examples = [];

for (let i = 0; i < batchTrails.length; i += OSM_BATCH) {
  const slice = batchTrails.slice(i, i + OSM_BATCH);
  console.log(`[${i + 1}-${i + slice.length}] reading OSM tags…`);
  const tags = await osmTags(slice.map((t) => t.id));

  /* Path 1+2: ask Wikidata which items name these relation ids (P402). */
  const wdByRel = new Map();
  for (let j = 0; j < slice.length; j += WD_BATCH) {
    const ids = slice.slice(j, j + WD_BATCH).map((t) => t.id);
    for (const [k, v] of await wikidataByRelation(ids)) wdByRel.set(k, v);
  }

  /* Path 3: QIDs a mapper put on the relation itself. */
  const qids = new Set();
  for (const t of slice) {
    const tag = tags.get(t.id);
    if (tag?.qid && !wdByRel.has(t.id)) qids.add(tag.qid);
  }
  const wdByQid = new Map();
  const qidList = [...qids];
  for (let j = 0; j < qidList.length; j += WD_BATCH) {
    for (const [k, v] of await wikidataByQid(qidList.slice(j, j + WD_BATCH))) wdByQid.set(k, v);
  }

  console.log(`  P402 items: ${wdByRel.size}   osm wikidata=: ${qidList.length}   osm wikimedia_commons=: ` +
    `${slice.filter((t) => tags.get(t.id)?.commons).length}`);

  for (const t of slice) {
    const tag = tags.get(t.id) ?? { qid: null, commons: null };
    if (tag.qid) tally.withQidTag++;
    if (tag.commons) tally.withCommonsTag++;
    /*
     * The two-way check. An item reached through the relation's own P402 is by
     * construction the item FOR this relation. An item reached through the
     * relation's `wikidata=` tag is only usable if it names this relation back;
     * otherwise it describes something larger that this trail is merely part
     * of, and its photograph is not of this trail.
     */
    let wd = wdByRel.get(t.id) ?? null;
    if (!wd && tag.qid) {
      const byQid = wdByQid.get(tag.qid) ?? null;
      if (byQid && byQid.p402.has(t.id)) wd = byQid;
      else if (byQid && (byQid.p18 || byQid.p373)) tally.skipParentItem++;
    }
    if (wdByRel.has(t.id)) tally.viaP402++;
    if (wd?.p18) tally.withP18++;
    if (wd?.p373) tally.withP373++;

    /* Ordered candidate list, strongest declaration first. */
    const attempts = [];
    if (wd?.p18) attempts.push({ file: wd.p18, via: wdByRel.has(t.id) ? "P402→P18" : "osm:wikidata+P402→P18" });
    if (tag.commons?.startsWith("File:")) attempts.push({ file: tag.commons.slice(5), via: "osm:wikimedia_commons=File" });
    const categories = [];
    if (wd?.p373) categories.push({ cat: wd.p373, via: wdByRel.has(t.id) ? "P402→P373" : "osm:wikidata+P402→P373" });
    if (tag.commons && /^Category:/i.test(tag.commons))
      categories.push({ cat: tag.commons.replace(/^Category:/i, ""), via: "osm:wikimedia_commons=Category" });

    if (!attempts.length && !categories.length) {
      tally.noLink++;
      state.rels[t.id] = { status: "no-link", ts: Date.now() };
      continue;
    }

    let entry = null;
    let via = null;
    for (const a of attempts) {
      entry = await commonsFile(a.file, tally);
      if (entry) {
        via = a.via;
        break;
      }
    }
    if (!entry) {
      for (const c of categories) {
        const files = await categoryFiles(c.cat);
        for (const f of files) {
          entry = await commonsFile(f, tally);
          if (entry) {
            /* The category is the trail's OWN category, declared against this
             * relation; the file was placed in it by a person. Recorded so the
             * caption and any later audit can see which container it came from. */
            entry.category = c.cat;
            via = c.via;
            break;
          }
        }
        if (entry) break;
      }
    }

    if (!entry) {
      tally.noMedia++;
      state.rels[t.id] = { status: "no-media", ts: Date.now() };
      continue;
    }

    entry.kind === "of" ? tally.resolvedOf++ : tally.resolvedNear++;
    candidates[t.id] = entry;
    state.rels[t.id] = { status: "resolved", via, ts: Date.now() };
    if (examples.length < 12) examples.push({ id: t.id, name: t.name, via, entry });
    console.log(`  ✓ ${t.id} ${t.name} — ${via} — ${entry.credit} / ${entry.license}`);
  }

  if (!DRY) saveState(state, candidates);
}

console.log("\n────────────── result ──────────────");
console.log(`trails examined      ${tally.trails}`);
console.log(`  no human link      ${tally.noLink}`);
console.log(`  P402 item found    ${tally.viaP402}`);
console.log(`  osm wikidata=      ${tally.withQidTag}`);
console.log(`  osm wikimedia_commons= ${tally.withCommonsTag}`);
console.log(`  item had P18       ${tally.withP18}`);
console.log(`  item had P373      ${tally.withP373}`);
console.log(`entries written      ${tally.resolvedOf + tally.resolvedNear}  (of: ${tally.resolvedOf}, near: ${tally.resolvedNear})`);
console.log(`  link but no usable file ${tally.noMedia}`);
console.log(`skips: not-photo ${tally.skipNotPhoto}, not-scenery ${tally.skipNotScenery}, too-small ${tally.skipTooSmall}, missing ${tally.skipMissing}, ` +
  `no-licence ${tally.skipNoLicence}, no-credit ${tally.skipNoCredit}, licence-not-free ${tally.skipLicenceNotFree}, ` +
  `restricted ${tally.skipRestricted}`);
console.log(`refused: wikidata item describes a parent route, not this relation  ${tally.skipParentItem}`);
if (tally.rejectedLicences.size) console.log(`rejected licences: ${[...tally.rejectedLicences].join(" | ")}`);
console.log(`http requests ${httpCalls}, backoffs ${http429}`);
if (examples.length) {
  console.log("\nexamples:");
  for (const e of examples) console.log(`  ${e.id} ${e.name}\n    ${e.via}  ${e.entry.credit} · ${e.entry.license}\n    ${e.entry.pageUrl}`);
}
if (DRY) console.log("\nDRY RUN — no state, no candidates, photos.json untouched.");
else console.log(`\nCandidates in ${CANDIDATES}. Review, then: node scripts/harvest-trail-photos.mjs --merge`);
