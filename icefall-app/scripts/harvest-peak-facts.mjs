#!/usr/bin/env node
/**
 * Harvests SOURCED FACTS about the peaks in `public/data/peaks.json` from
 * Wikidata, at build time, into `public/data/peak-facts.json`.
 *
 *   node scripts/harvest-peak-facts.mjs
 *   node scripts/harvest-peak-facts.mjs --limit 500     # a slice, for testing
 *   node scripts/harvest-peak-facts.mjs --refresh       # ignore the cache
 *   node scripts/harvest-peak-facts.mjs --report        # rebuild from cache, fetch nothing
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   ONLY A VALUE THAT ARRIVES AS A TYPED SPARQL BINDING MAY REACH THE SCREEN.
 *   NOTHING THAT ARRIVES AS A SENTENCE.
 *
 * A quantity, a date, an item label, a coordinate. If a field's datatype is
 * free text, it is not eligible, and the allowlist below is the one place that
 * is decided.
 *
 * This is not a style preference. Wikipedia prose carries UNATTRIBUTED,
 * UNDATED SAFETY JUDGEMENT written by anonymous editors, and it reads exactly
 * like something the app is asserting. Measured 2026-09-10 against the REST
 * summary endpoint for 175 peaks: 10 of them (5.7%, about one page in
 * eighteen) contain real route guidance or a difficulty verdict —
 *
 *   Täschhorn        "There are no easy mountaineering routes to its summit"
 *   Rocher de la     "can be most easily reached on an ascent of Mont Blanc
 *   Tournette         via the Goûter Route"
 *   Sgùrr Mòr        "mostly gentle sloped and fairly accessible"
 *
 * "Most easily reached", "readily accessed", "gentle sloped" are the sentences
 * that get somebody killed when a reader takes them for ICEFALL's assessment.
 * The defence is NOT a regex over the prose — a filter must catch every
 * phrasing in every language and it will not. The defence is never fetching
 * it. This script does not call the REST summary endpoint, does not call
 * `action=parse`, and does not read an infobox.
 *
 * Wikidata's own one-line `description` is the single free-text exception, and
 * it earns that: it is CC0, capped at about a dozen words, and measured clean
 * at 170/170 for judgement patterns ("mountain in the Pennine Alps on the
 * border between Switzerland and Italy"). It is still length-capped here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PERMANENT DENYLIST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These Wikidata properties EXIST and were measured at 0/250 on peaks:
 *
 *   P7252  degree of difficulty
 *   P3335  hazard
 *   P7309  route used to get closer to a high point
 *
 * They are listed here rather than merely omitted, because the allowlist is
 * what keeps them out and this comment is what says why. The day an editor
 * populates P7252 on a mountain, nothing changes: an unsourced difficulty
 * grade from a stranger is precisely the category ICEFALL does not generate,
 * harvest or infer. A grade is not a fact about a mountain, it is a judgement
 * about a route, and a wrong one kills people.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DELIBERATELY NOT HARVESTED, THOUGH IT IS A FACT AND IT IS AVAILABLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * P3137 PARENT PEAK, 23% of resolved items. It is a prominence-line parent,
 * which is technically defensible and absurd on screen: measured, Wikidata
 * gives Aconcagua's parent as Tirich Mir, Dhaulagiri's as K2, Pico de
 * Orizaba's as Mount Logan and Aoraki's as Mount Erebus. A climber reading
 * "Parent peak: Mount Erebus" under Aoraki learns something false about the
 * world. There is no display framing that rescues it, so it is not collected.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LICENCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wikidata statements are CC0 — "available under the Creative Commons CC0
 * License", waiving rights "for any purpose whatsoever, including without
 * limitation commercial ... purposes". No attribution is legally owed and the
 * app credits Wikidata anyway. Note the split: the STATEMENT is CC0, the FILE
 * a P18 statement points at is not — 84% of those carry AttributionRequired.
 * Images are handled in `harvest-peak-photos.mjs`, which records the licence
 * per file.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const PEAKS = join(APP, "public/data/peaks.json");
/*
 * SHARDED, SIXTEEN WAYS, BY ENTITY ID.
 *
 * One file for the whole world measured 6.1 MB raw / 870 KB gzipped, and the
 * app fetches it the first time any reference page opens — so the first
 * prominence anybody sees costs most of a megabyte on a phone. Sixteen shards
 * cut that to ~55 KB gzipped for the page in hand, and the service worker
 * keeps each one it has seen. The shard is FNV-1a over the QID, modulo 16,
 * computed identically in `src/services/peakFacts.ts` — no manifest, nothing
 * to keep in step but one small function in two places.
 */
const OUT_DIR = join(APP, "public/data/peak-facts");
const SHARDS = 16;
const shardOf = (qid) => {
  let h = 2166136261;
  for (const ch of qid) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SHARDS;
};
const CACHE_DIR = join(APP, ".harvest-cache/peak-facts");

const UA =
  "IcefallPeakFacts/1.0 (https://github.com/Chrispapado06/icefall; icefallapp@gmail.com) node/" +
  process.versions.node;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const LIMIT = Number(value("limit", "0")) || 0;
const REFRESH = flag("refresh");
const REPORT_ONLY = flag("report");
const CHUNK = 120;

mkdirSync(CACHE_DIR, { recursive: true });

/* -------------------------------------------------------------------------- */
/* Polite SPARQL                                                              */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 1200;
let lastRequest = 0;

async function sparql(query, attempt = 0) {
  const wait = MIN_GAP_MS - (Date.now() - lastRequest);
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();

  let res;
  try {
    res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        Accept: "application/sparql-results+json",
        "User-Agent": UA,
        "Api-User-Agent": UA,
      },
      body: query,
    });
  } catch (err) {
    if (attempt >= 5) throw err;
    await sleep(Math.min(120_000, 4000 * 2 ** attempt));
    return sparql(query, attempt + 1);
  }

  if (res.status === 429 || res.status === 503 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`HTTP ${res.status} after ${attempt} retries`);
    const ra = Number(res.headers.get("retry-after"));
    const backoff =
      Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(180_000, 5000 * 2 ** attempt);
    process.stdout.write(`\n    ${res.status} — backing off ${Math.round(backoff / 1000)}s\n`);
    await sleep(backoff);
    return sparql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).results?.bindings ?? [];
}

function loadCache(name) {
  const p = join(CACHE_DIR, `${name}.json`);
  if (REFRESH || !existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}
/*
 * ATOMIC, BECAUSE THIS RUNS FOR AN HOUR AND MAY BE INTERRUPTED.
 *
 * `loadCache` returns `{}` when a file will not parse — which is the right
 * thing for a corrupt file and the WORST possible thing to combine with a
 * non-atomic write. A Ctrl-C landing inside `writeFileSync` leaves a truncated
 * JSON file, and the next run silently discards EVERY cached chunk and starts
 * the whole harvest again. Write to a temporary name and rename: rename is
 * atomic on the same filesystem, so the cache is either the old file or the
 * new one and never half of either.
 */
const saveCache = (name, data) => {
  const dest = join(CACHE_DIR, `${name}.json`);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), "utf8");
  renameSync(tmp, dest);
};

/* -------------------------------------------------------------------------- */
/* Units — trap 1                                                             */
/* -------------------------------------------------------------------------- */

/*
 * 19 of 209 sampled items (9%) carry a FOOT-VALUED elevation, and Everest's
 * entity holds 29,030 ft alongside 8,848.86 m. A harvester that reads
 * `quantityAmount` and appends " m" prints "29,030 m" for Everest and
 * "10,821 m" for Mount Wilbur, which is really 3,298 m. So the unit is read,
 * and an unrecognised unit is a DROP, never an assumption.
 */
const TO_METRES = {
  Q11573: 1, // metre
  Q3710: 0.3048, // foot
  Q828224: 1000, // kilometre
  Q253276: 1609.344, // mile
  Q174728: 0.01, // centimetre
  Q218593: 0.0254, // inch
};
const TO_KM = { Q828224: 1, Q11573: 0.001, Q253276: 1.609344, Q3710: 0.0003048 };

const qidOf = (uri) => (uri ? String(uri).split("/").pop() : null);

/* -------------------------------------------------------------------------- */
/* Load the catalogue                                                         */
/* -------------------------------------------------------------------------- */

const peaks = JSON.parse(readFileSync(PEAKS, "utf8"));
const linked = peaks.filter((p) => p.d);
/*
 * Sorted for a stable, readable order — nothing more. The cache is keyed by
 * entity (see the Fetch section), so chunk boundaries carry no meaning and
 * the catalogue can grow, shrink or reorder without a single refetch.
 */
const qids = [...new Set(linked.map((p) => p.d))].sort();
const scope = LIMIT ? qids.slice(0, LIMIT) : qids;

/** OSM elevation per QID — the corroboration baseline, see trap 4. */
const osmEle = new Map();
for (const p of linked) if (!osmEle.has(p.d)) osmEle.set(p.d, p.e);
/** OSM position per QID — what the range test (trap 6) measures against. */
const osmAt = new Map();
for (const p of linked) if (!osmAt.has(p.d)) osmAt.set(p.d, [p.a, p.o]);

/* --- the range test, trap 6 ----------------------------------------------- */

/** Classes under which a P4552 target is a RANGE, and a distance says nothing. */
const RANGE_CLASSES = new Set([
  "Q46831", // mountain range
  "Q1437459", // non-geologically related mountain range
  "Q740445", // mountain ridge
  "Q2624046", // mountain chain
  "Q3977906", // alpine supergroup
  "Q3965305", // alpine subsection
  "Q3777462", // alpine group
  "Q2895674", // volcanic group
  "Q1200524", // complex volcano
]);
/** Classes under which the target is ONE summit: a parent must be close. */
const SUMMIT_CLASSES = new Set([
  "Q8502", // mountain
  "Q8072", // volcano
  "Q169358", // stratovolcano
  "Q1325302", // dormant volcano
  "Q207326", // summit
  "Q13222531", // parent peak
  "Q3393392", // highest point
]);
const MASSIF = "Q1061151";
const SUMMIT_LIMIT_KM = 50;
const MASSIF_LIMIT_KM = 250;

const kmBetween = (a, b) => {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/**
 * Whether a P4552 value is plausible as THIS peak's range. Unknown classes are
 * kept — the test only bites where the target is typed as a single summit or a
 * compact massif and its coordinate is measurably far from the peak.
 */
function rangePlausible(qid, classes, at) {
  if (classes.some((c) => RANGE_CLASSES.has(c))) return true;
  const summit = classes.some((c) => SUMMIT_CLASSES.has(c));
  const massif = classes.includes(MASSIF);
  if (!summit && !massif) return true;
  const here = osmAt.get(qid);
  if (!here || !at) return true;
  return kmBetween(here, at) <= (massif ? MASSIF_LIMIT_KM : SUMMIT_LIMIT_KM);
}

const parsePoint = (wkt) => {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt ?? "");
  return m ? [Number(m[2]), Number(m[1])] : null;
};

console.log("ICEFALL peak facts harvest");
console.log(`  ${peaks.length} peaks, ${linked.length} with a Wikidata id (${((linked.length / peaks.length) * 100).toFixed(1)}%)`);
console.log(`  ${qids.length} distinct entities, working on ${scope.length}\n`);

/* -------------------------------------------------------------------------- */
/* Query 1 — item-valued facts and the label chain                            */
/* -------------------------------------------------------------------------- */

/*
 * TRAP 5, MISSING ENGLISH LABELS. 7% of sampled items have no `en` label, and
 * DENALI IS ONE OF THEM — its English name migrated to the `mul` (multiple
 * languages) code, so `FILTER(LANG(?l)="en")` misses it and the plain label
 * service hands back the literal string "Q130018". The fallback chain is
 * en → mul → the English sitelink title → the OSM name, and it is applied in
 * that order below.
 */
/*
 * TRAP 6, A "RANGE" THAT IS ANOTHER MOUNTAIN 320 KM AWAY. P4552 ("mountain
 * range") is filled by people, and on Mount Kenya (Q172070) somebody filled it
 * with Mount Kilimanjaro (Q7296) — a different massif in a different country.
 * The value is a label, so nothing about it looks wrong until it is on a page
 * as "RANGE · Mount Kilimanjaro · Wikidata". Found 2026-09-11 in review.
 *
 * Audited the same day across all 15,206 harvested range values, with each
 * range item's P31 class and P625 coordinate: 14,232 are typed as a range or a
 * ridge, and for those a distance test is meaningless (the Andes' centroid is
 * hundreds of kilometres from most Andean peaks). 424 are typed as a single
 * mountain or a compact massif — mostly a sub-summit pointing at its parent
 * (Cadair Idris ×11, Grimming ×4, all within a few kilometres) — and for
 * THOSE a distance is a real test. The rule below dropped exactly one value:
 * Mount Kenya's. So the query fetches the class and the coordinate, and the
 * assembly step applies the test rather than trusting the label.
 */
const itemQuery = (chunk) => `
SELECT ?item ?en ?mul ?desc ?rangeL ?rangeCls ?rangeAt ?countryL ?commons ?article WHERE {
  VALUES ?item { ${chunk.map((q) => `wd:${q}`).join(" ")} }
  OPTIONAL { ?item rdfs:label ?en   FILTER(LANG(?en)  = "en")  }
  OPTIONAL { ?item rdfs:label ?mul  FILTER(LANG(?mul) = "mul") }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?item wdt:P4552 ?range .
             OPTIONAL { ?range rdfs:label ?rangeL FILTER(LANG(?rangeL) = "en") }
             OPTIONAL { ?range wdt:P31 ?rangeCls }
             OPTIONAL { ?range wdt:P625 ?rangeAt } }
  OPTIONAL { ?item wdt:P17 ?country .
             OPTIONAL { ?country rdfs:label ?countryL FILTER(LANG(?countryL) = "en") } }
  OPTIONAL { ?item wdt:P373 ?commons }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
}`;

/* -------------------------------------------------------------------------- */
/* Query 2 — quantities, with unit, rank and reference provenance             */
/* -------------------------------------------------------------------------- */

/*
 * TRAP 3, "THE SOURCE IS USUALLY NOT A SOURCE". 90% of elevation statements
 * carry a reference, but 70% of those are only P143 "imported from Wikimedia
 * project" — a bot breadcrumb recording that the number was scraped out of an
 * infobox, which is not a source. ONLY 21% have a citable external source
 * (P248 stated in / P854 reference URL).
 *
 * So "every harvested fact carries its source" is UNACHIEVABLE for about four
 * elevations in five, and pretending otherwise would be its own dishonesty.
 * What this script does instead is record WHICH KIND of backing a value has —
 * "cited", "imported" or "none" — and let the screen say so. A number whose
 * only provenance is a bot import is still shown, and shown as what it is.
 */
/*
 * ONE QUERY PER PROPERTY, WHICH LOOKS WASTEFUL AND IS NOT.
 *
 * The obvious shape is a single query with the three properties in a UNION.
 * Measured against the live endpoint on 2026-09-10: the UNION form returns
 * HTTP 504 "upstream request timeout" after 65 seconds on a chunk of six
 * items, while the identical query for one property answers in 429 ms on the
 * same chunk and in 305 ms on a chunk of 120. Blazegraph does not push the
 * VALUES clause down through the UNION, so each branch scans. Three cheap
 * queries beat one that never returns.
 */
const QUANTITY_PROPS = { prominence: "P2660", elevation: "P2044", isolation: "P2659" };

const quantityQuery = (chunk, prop) => {
  const P = QUANTITY_PROPS[prop];
  return `
SELECT ?item ?amount ?unit ?rank ?stated ?refurl ?imported WHERE {
  VALUES ?item { ${chunk.map((q) => `wd:${q}`).join(" ")} }
  ?item p:${P} ?st .
  ?st psv:${P} ?vn ; wikibase:rank ?rank .
  ?vn wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit .
  OPTIONAL {
    ?st prov:wasDerivedFrom ?ref .
    OPTIONAL { ?ref pr:P248 ?stated }
    OPTIONAL { ?ref pr:P854 ?refurl }
    OPTIONAL { ?ref pr:P143 ?imported }
  }
}`;
};

/* -------------------------------------------------------------------------- */
/* Query 3 — first ascent, which has no property of its own                   */
/* -------------------------------------------------------------------------- */

/*
 * There is NO "first ascent" property. It is modelled as
 *   P793 significant event → Q1194369 (first ascent),
 * with the date in qualifier P585 and the party in qualifier P710. (P575 and
 * P1310 are not it; P1310 is "statement disputed by".)
 *
 * Coverage is 14% for the date and 8% for the party, so this is PRESENT-ONLY
 * GARNISH — a line that appears when it exists and leaves no hole when it does
 * not. It is never a fixed slot on the page, because a fixed slot empty on
 * four peaks in five is worse than no slot. Aconcagua and Ben Nevis carry no
 * first-ascent statement at all.
 */
const ascentQuery = (chunk) => `
SELECT ?item ?date ?partyL WHERE {
  VALUES ?item { ${chunk.map((q) => `wd:${q}`).join(" ")} }
  ?item p:P793 ?st .
  ?st ps:P793 wd:Q1194369 .
  OPTIONAL { ?st pq:P585 ?date }
  OPTIONAL { ?st pq:P710 ?party .
             OPTIONAL { ?party rdfs:label ?partyL FILTER(LANG(?partyL) = "en") } }
}`;

/* -------------------------------------------------------------------------- */
/* Fetch                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * CACHED PER ENTITY, NOT PER CHUNK — and the difference is the whole harvest.
 *
 * The first version cached each SPARQL response under a hash of the chunk's
 * ids, with chunks cut as contiguous slices of the sorted id list. That is
 * only stable while the list is. Removing ONE id shifts every later chunk by
 * one, every later hash changes, and a run that had fetched 130 chunks
 * (15,600 entities, an hour of polite requests) would have started again
 * from nothing the moment the catalogue builder dropped a duplicate — which
 * it now does, for the same-coordinate collisions. The rows are therefore
 * filed by the entity they describe, and a chunk is nothing more than how
 * many ids travel in one request.
 *
 *   byqid-asked       { qid: 1 }                  every entity a query answered for
 *   byqid-items       { qid: rows[] }             labels, range, country, article
 *   byqid-quantities  { qid: { prop: rows[] } }   elevation, prominence, isolation
 *   byqid-ascents     { qid: rows[] }             first ascent
 *
 * "Asked" is kept apart from "answered" because an entity with no prominence
 * statement produces no rows, and without the first set it would be asked
 * again on every run.
 */
const asked = loadCache("byqid-asked");
const rawItems = loadCache("byqid-items");
const rawQuant = loadCache("byqid-quantities");
const rawAscent = loadCache("byqid-ascents");

const persist = () => {
  saveCache("byqid-asked", asked);
  saveCache("byqid-items", rawItems);
  saveCache("byqid-quantities", rawQuant);
  saveCache("byqid-ascents", rawAscent);
};

const todo = REFRESH ? scope : scope.filter((q) => !asked[q]);
const chunks = [];
for (let i = 0; i < todo.length; i += CHUNK) chunks.push(todo.slice(i, i + CHUNK));

console.log(
  `  ${scope.length - todo.length} already answered, ${todo.length} to ask in ${chunks.length} requests of ${CHUNK}\n`,
);

let fetched = 0;
for (const [n, chunk] of chunks.entries()) {
  if (REPORT_ONLY) break;
  try {
    const q = {};
    for (const prop of Object.keys(QUANTITY_PROPS)) {
      q[prop] = await sparql(quantityQuery(chunk, prop));
    }
    const items = await sparql(itemQuery(chunk));
    const ascents = await sparql(ascentQuery(chunk));

    // File every row under its entity. A refresh replaces, so clear first.
    for (const qid of chunk) {
      asked[qid] = 1;
      delete rawItems[qid];
      delete rawQuant[qid];
      delete rawAscent[qid];
    }
    for (const r of items) {
      const qid = qidOf(r.item?.value);
      if (qid) (rawItems[qid] ??= []).push(r);
    }
    for (const [prop, rows] of Object.entries(q)) {
      for (const r of rows) {
        const qid = qidOf(r.item?.value);
        if (qid) ((rawQuant[qid] ??= {})[prop] ??= []).push(r);
      }
    }
    for (const r of ascents) {
      const qid = qidOf(r.item?.value);
      if (qid) (rawAscent[qid] ??= []).push(r);
    }
    fetched += 1;
  } catch (err) {
    process.stdout.write(`\n  ! chunk ${n + 1} failed: ${err.message} — re-run to retry\n`);
    continue;
  }

  if (fetched % 5 === 0) persist();
  process.stdout.write(`\r  chunks ${n + 1}/${chunks.length} (${fetched} fetched)      `);
}
if (!REPORT_ONLY && fetched) {
  persist();
  process.stdout.write("\n");
}

/* -------------------------------------------------------------------------- */
/* Assemble                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * ONLY ENTITIES THE CATALOGUE STILL HOLDS. The cache may carry rows for an
 * id the builder has since unlinked; iterating the catalogue's own list
 * rather than the cache keeps those out of the shipped file.
 */
const facts = {};
const stat = {
  entities: 0,
  label: 0,
  labelFromMul: 0,
  description: 0,
  range: 0,
  country: 0,
  prominence: 0,
  prominenceCited: 0,
  isolation: 0,
  elevationCorroborated: 0,
  elevationDisputed: 0,
  firstAscentDate: 0,
  firstAscentParty: 0,
  article: 0,
  commons: 0,
  dropped: { unit: 0, implausible: 0, conflicting: 0, rangeFar: 0 },
};

const ensure = (qid) => (facts[qid] ??= {});

/* --- item facts ----------------------------------------------------------- */
for (const qid of scope) {
  // One range per item, but its classes arrive one binding row at a time —
  // gather them before the plausibility test (trap 6) is applied.
  const rangeRows = new Map();
  for (const r of rawItems[qid] ?? []) {
    if (!r.rangeL?.value) continue;
    const row = rangeRows.get(r.rangeL.value) ?? { classes: [], at: null };
    if (r.rangeCls?.value) row.classes.push(r.rangeCls.value.split("/").pop());
    if (r.rangeAt?.value && !row.at) row.at = parsePoint(r.rangeAt.value);
    rangeRows.set(r.rangeL.value, row);
  }
  for (const [label, row] of rangeRows) {
    if (rangePlausible(qid, row.classes, row.at)) {
      const f = ensure(qid);
      if (!f.range) f.range = label;
    } else {
      stat.dropped.rangeFar += 1;
    }
  }
  for (const r of rawItems[qid] ?? []) {
    const f = ensure(qid);

    if (r.en?.value) f.label = r.en.value;
    else if (r.mul?.value && !f.label) {
      f.label = r.mul.value;
      f.labelFromMul = true;
    }

    if (r.article?.value) f.article = r.article.value;

    // A description over ~20 words is not a one-liner any more, and the
    // measured cleanliness of this field was measured on one-liners.
    const d = r.desc?.value?.trim();
    if (d && d.split(/\s+/).length <= 20 && !f.description) f.description = d;

    if (r.countryL?.value && !f.country) f.country = r.countryL.value;
    if (r.commons?.value && !f.commons) f.commons = r.commons.value;
  }
}

/* Label fallback step 3: the English sitelink title. */
for (const [qid, f] of Object.entries(facts)) {
  if (!f.label && f.article) {
    try {
      f.label = decodeURIComponent(f.article.split("/wiki/")[1] ?? "").replace(/_/g, " ") || undefined;
      if (f.label) f.labelFromSitelink = true;
    } catch {
      /* a malformed URL is simply no label; the OSM name stands */
    }
  }
}

/* --- quantities ----------------------------------------------------------- */

/*
 * TRAP 2, MULTIPLE VALUES AND MULTIPLE PREFERRED VALUES. 8% of items carry more
 * than one elevation and SIX of 209 carry more than one PREFERRED value —
 * Mount Wilbur is preferred at both 3,298 m and 10,821 ft, which after unit
 * conversion is the same mountain twice. There is no "the" elevation to fetch.
 *
 * So: normalise every statement to metres, keep the preferred-rank ones if any
 * exist, then ask whether what survives AGREES. Agreement inside tolerance
 * collapses to one number. Disagreement outside it is NOT averaged and NOT
 * arbitrated — the fact is dropped, because ICEFALL showing a confident number
 * it cannot substantiate is the exact failure this codebase is built against.
 */
const RANK = { "http://wikiba.se/ontology#PreferredRank": 2, "http://wikiba.se/ontology#NormalRank": 1 };

for (const qid of scope) {
  const byProp = rawQuant[qid];
  if (!byProp) continue;
  const grouped = new Map();
  for (const [prop, rows] of Object.entries(byProp)) {
    for (const r of rows ?? []) {
      const rank = RANK[r.rank?.value] ?? 0;
      /*
       * DEPRECATED RANK IS A DROP, and it is load-bearing. Everest's entity
       * carries 29,030 ft at deprecated rank beside 8,848.86 m at preferred —
       * an editor has already marked the foot value wrong. Reading rank is what
       * stops "29,030 m" reaching a screen.
       */
      if (rank === 0) continue;
      const k = `${qid}|${prop}`;
      if (!grouped.has(k)) grouped.set(k, new Map());
      // One statement can produce several rows (several references). Key on the
      // value so references merge instead of duplicating the number.
      const vk = `${r.amount.value}|${r.unit.value}|${rank}`;
      const g = grouped.get(k);
      if (!g.has(vk)) g.set(vk, { amount: Number(r.amount.value), unit: qidOf(r.unit.value), rank, cited: false, imported: false });
      const v = g.get(vk);
      if (r.stated?.value || r.refurl?.value) v.cited = true;
      if (r.imported?.value) v.imported = true;
    }
  }

  for (const [k, values] of grouped) {
    const [, prop] = k.split("|");
    const f = ensure(qid);
    let list = [...values.values()];

    // Preferred rank wins outright where any statement carries it.
    if (list.some((v) => v.rank === 2)) list = list.filter((v) => v.rank === 2);

    const isIsolation = prop === "isolation";
    const table = isIsolation ? TO_KM : TO_METRES;
    const converted = [];
    for (const v of list) {
      const factor = table[v.unit];
      if (factor === undefined) {
        stat.dropped.unit += 1; // unknown unit — never assume metres
        continue;
      }
      converted.push({ ...v, n: v.amount * factor });
    }
    if (!converted.length) continue;

    const nums = converted.map((v) => v.n);
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    // Tolerance: the same measurement rounded differently, not two claims.
    const tol = isIsolation ? Math.max(1, lo * 0.02) : Math.max(2, lo * 0.005);
    if (hi - lo > tol) {
      stat.dropped.conflicting += 1;
      continue;
    }

    const n = nums.reduce((a, b) => a + b, 0) / nums.length;
    const cited = converted.some((v) => v.cited);
    const imported = converted.some((v) => v.imported);
    const src = cited ? "cited" : imported ? "imported" : "none";
    const ele = osmEle.get(qid);

    /*
     * RANGE VALIDATION. A sample of seven peaks turned up three errors:
     * Grand Teton's prominence reads 6,530 m — GREATER THAN ITS OWN ELEVATION;
     * Pic du Midi d'Ossau's reads "1.091 m"; Mount Huntington's elevation reads
     * 12,241 (a foot value typed as metres). Wikidata is a wiki. A value that
     * cannot be true is dropped rather than displayed with a shrug.
     */
    if (prop === "prominence") {
      if (!(n > 0) || (ele && n > ele + 5) || n > 9000) {
        stat.dropped.implausible += 1;
        continue;
      }
      f.prominence = { m: Math.round(n), src };
      stat.prominence += 1;
      if (src === "cited") stat.prominenceCited += 1;
    } else if (prop === "isolation") {
      if (!(n > 0) || n > 25000) {
        stat.dropped.implausible += 1;
        continue;
      }
      f.isolation = { km: Number(n.toFixed(n < 10 ? 2 : 0)), src };
      stat.isolation += 1;
    } else if (prop === "elevation") {
      if (!(n > 0) || n > 9000) {
        stat.dropped.implausible += 1;
        continue;
      }
      /*
       * TRAP 4, WIKIDATA DISAGREES WITH WHAT THE APP ALREADY SHIPS. Against OSM
       * `ele` on 209 peaks: 31% differ by more than 1 m, 26 by more than 10 m,
       * 7 by more than 50 m, worst 296 m. Mont Blanc is 4,805.59 here and 4,807
       * in peaks.json.
       *
       * OSM ELEVATION IS NOT OVERWRITTEN. The app has it for 100% of the
       * catalogue and Wikidata for 84%, so trading complete data for partial
       * data to gain nothing would be a poor deal even if the numbers agreed.
       * Wikidata's figure is kept as CORROBORATION, and where the two differ
       * materially the disagreement is recorded so the screen can say "sources
       * differ" rather than pick a winner behind the reader's back.
       */
      const m = Math.round(n * 100) / 100;
      f.elevationWikidata = { m, src };
      if (ele !== undefined) {
        const diff = Math.abs(m - ele);
        if (diff > 10) {
          f.elevationDisputed = Math.round(diff);
          stat.elevationDisputed += 1;
        } else {
          stat.elevationCorroborated += 1;
        }
      }
    }
  }
}

/* --- first ascent --------------------------------------------------------- */
for (const qid of scope) {
  const rows = rawAscent[qid];
  if (!rows?.length) continue;
  const f = ensure(qid);
  const names = new Set();
  for (const r of rows) {
    if (r.date?.value && !f.firstAscent) {
      // A Wikidata date can be year- or month-precision; keep the ISO prefix
      // and let the screen format what is actually there.
      f.firstAscent = { date: r.date.value.slice(0, 10) };
    }
    if (r.partyL?.value) names.add(r.partyL.value);
  }
  if (names.size) f.firstAscent = { ...(f.firstAscent ?? {}), party: [...names].slice(0, 6) };
}

/* -------------------------------------------------------------------------- */
/* Emit                                                                       */
/* -------------------------------------------------------------------------- */

// An entity that yielded nothing beyond an empty object is not a fact row.
for (const [qid, f] of Object.entries(facts)) {
  if (!Object.keys(f).length) delete facts[qid];
}

for (const f of Object.values(facts)) {
  stat.entities += 1;
  if (f.label) stat.label += 1;
  if (f.labelFromMul) stat.labelFromMul += 1;
  if (f.description) stat.description += 1;
  if (f.range) stat.range += 1;
  if (f.country) stat.country += 1;
  if (f.article) stat.article += 1;
  if (f.commons) stat.commons += 1;
  if (f.firstAscent?.date) stat.firstAscentDate += 1;
  if (f.firstAscent?.party) stat.firstAscentParty += 1;
}

const built = new Date().toISOString().slice(0, 10);
/** Shown by the app wherever these facts appear. */
const attribution =
  "Facts from Wikidata (CC0). Peak positions and elevations © OpenStreetMap contributors (ODbL).";

const shards = Array.from({ length: SHARDS }, () => ({}));
for (const [qid, f] of Object.entries(facts)) shards[shardOf(qid)][qid] = f;

mkdirSync(OUT_DIR, { recursive: true });
// The monolithic file this replaced must not linger beside the shards.
rmSync(join(APP, "public/data/peak-facts.json"), { force: true });
let outBytes = 0;
let largestShard = 0;
shards.forEach((slice, n) => {
  const text = JSON.stringify({ v: 2, built, attribution, shard: n, of: SHARDS, facts: slice });
  outBytes += text.length;
  largestShard = Math.max(largestShard, text.length);
  writeFileSync(join(OUT_DIR, `${n}.json`), text);
});

/* -------------------------------------------------------------------------- */
/* Write English names back into the catalogue                                */
/* -------------------------------------------------------------------------- */

/*
 * THE CATALOGUE IS ONLY AS BROAD AS IT IS FINDABLE.
 *
 * `build-peak-catalogue.mjs` keeps OSM's `name:en` where it exists, which
 * rescued Mount Fuji, Damavand, Elbrus and Khan Tengri from being searchable
 * only as 富士山, دماوند, Эльбрус Западный and Хан Тәңірі. But OSM does not
 * always have one: EVEREST's summit node is tagged
 * `珠穆朗玛峰 ཇོ་མོ་གླང་མ། सगरमाथा` and carries no `name:en` at all, so offline
 * search for "Everest" missed it.
 *
 * Wikidata's English label is exactly that missing name, it has just been
 * fetched for every entity in the catalogue, and it is CC0. So it is written
 * back into `peaks.json` as `x` — only where OSM had none AND the local name
 * is not already readable in Latin script. A mapper's own Latin name always
 * wins; this fills holes rather than overriding anyone.
 *
 * It lives in this script rather than in the builder because the builder runs
 * first and has no Wikidata. Re-running the builder does NOT undo it — the
 * builder writes `x` from `name:en` and this pass tops it up, so the order is
 * always build → facts.
 */
const LATIN_ONLY = /^[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Tibetan}\p{Script=Thai}\p{Script=Greek}\p{Script=Hangul}\p{Script=Georgian}\p{Script=Armenian}]*$/u;
const isLatin = (t) => LATIN_ONLY.test(t);

let named = 0;
for (const p of peaks) {
  if (p.x || !p.d) continue;
  if (isLatin(p.n)) continue; // already readable — leave the mapper's name alone
  const label = facts[p.d]?.label;
  if (!label || !isLatin(label) || label.length > 60 || label === p.n) continue;
  p.x = label;
  named += 1;
}
if (named) writeFileSync(PEAKS, JSON.stringify(peaks));

/*
 * TWO DENOMINATORS, BECAUSE ONE OF THEM LIES ON A PARTIAL RUN.
 *
 * The harvest is resumable, so it is normal to be looking at a file built from
 * some of the chunks. Reporting coverage only against the whole catalogue then
 * reads as "prominence 6.7%", which is not a fact about Wikidata — it is a fact
 * about how far the run got. `of asked` is the honest per-property figure;
 * `of all` is what the catalogue currently has.
 */
const answered = stat.entities;
const pct = (n) => `${((n / Math.max(1, answered)) * 100).toFixed(1)}%`;
const pctAll = (n) => `${((n / Math.max(1, scope.length)) * 100).toFixed(1)}%`;
console.log(`
─────────────────────────────────────────────────────────
${stat.entities} entities with at least one fact → ${OUT_DIR}/{0..${SHARDS - 1}}.json
  (${(outBytes / 1024).toFixed(0)} KB raw across ${SHARDS} shards, largest ${(largestShard / 1024).toFixed(0)} KB)

  ${stat.entities} of ${scope.length} entities answered so far.
  Coverage, of those answered — and of the whole catalogue's ${scope.length} entities:

    property                  n     of answered   of all entities
    label                 ${String(stat.label).padStart(6)}${pct(stat.label).padStart(12)}${pctAll(stat.label).padStart(15)}   (${stat.labelFromMul} rescued from the "mul" code)
    one-line description  ${String(stat.description).padStart(6)}${pct(stat.description).padStart(12)}${pctAll(stat.description).padStart(15)}
    mountain range        ${String(stat.range).padStart(6)}${pct(stat.range).padStart(12)}${pctAll(stat.range).padStart(15)}
    country               ${String(stat.country).padStart(6)}${pct(stat.country).padStart(12)}${pctAll(stat.country).padStart(15)}
    prominence            ${String(stat.prominence).padStart(6)}${pct(stat.prominence).padStart(12)}${pctAll(stat.prominence).padStart(15)}   (citable source: ${stat.prominenceCited})
    isolation             ${String(stat.isolation).padStart(6)}${pct(stat.isolation).padStart(12)}${pctAll(stat.isolation).padStart(15)}
    en.wikipedia article  ${String(stat.article).padStart(6)}${pct(stat.article).padStart(12)}${pctAll(stat.article).padStart(15)}
    Commons category      ${String(stat.commons).padStart(6)}${pct(stat.commons).padStart(12)}${pctAll(stat.commons).padStart(15)}
    first ascent date     ${String(stat.firstAscentDate).padStart(6)}${pct(stat.firstAscentDate).padStart(12)}${pctAll(stat.firstAscentDate).padStart(15)}
    first ascent party    ${String(stat.firstAscentParty).padStart(6)}${pct(stat.firstAscentParty).padStart(12)}${pctAll(stat.firstAscentParty).padStart(15)}

  ${named} peaks whose OSM name is not in Latin script, and which had no
  \`name:en\`, were given their Wikidata English label so search can find them.

  elevation vs OSM:  ${stat.elevationCorroborated} agree within 10 m, ${stat.elevationDisputed} differ by more
  dropped:  ${stat.dropped.unit} unknown unit, ${stat.dropped.implausible} out of range, ${stat.dropped.conflicting} sources conflict
`);
