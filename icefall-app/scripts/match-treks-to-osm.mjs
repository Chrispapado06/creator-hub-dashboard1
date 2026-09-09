#!/usr/bin/env node
/**
 * MATCHES EACH TREK IN THE CATALOGUE TO ITS OpenStreetMap ROUTE RELATION.
 *
 *   node scripts/match-treks-to-osm.mjs                # every trek, resumable
 *   node scripts/match-treks-to-osm.mjs --only=alps,khumbu    # named regions
 *   node scripts/match-treks-to-osm.mjs --report       # re-score from cache, no network
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * A trek record is purely descriptive: name, country, duration, grade, high
 * point, season, a paragraph. No coordinates, no OSM id, no geometry. That is
 * why the trek page has no map, no GPX and no elevation profile while the trail
 * page has all three — a trail IS an OSM `relation[route=hiking]` and carries a
 * real mapped line.
 *
 * Many of these treks ARE that same kind of object in OSM. This script finds
 * the relation and writes the mapping, so a trek inherits the line and every
 * feature that hangs off it, through the SAME `services/trails.ts` path the
 * trail page uses. Nothing here invents geometry.
 *
 * ── THE MATCH IS THE DANGEROUS PART ─────────────────────────────────────────
 * A trek pointed at the wrong relation sends somebody up a different mountain.
 * This project has already deleted a whole imagery system for precisely this
 * class of mistake — proximity matching that illustrated a Cypriot pine ridge
 * with a war memorial. So the rule is: MATCH ON EVIDENCE, DECLINE ON DOUBT. An
 * unmatched trek keeps today's behaviour and is honest; a wrongly matched one
 * is not. Every decline, with its reason, is written to the audit file.
 *
 * The tests, all recorded on every match:
 *   NAME      the relation's own names (name, name:xx, alt_name, official_name,
 *             int_name, short_name, ref) against the trek's, normalised.
 *   LENGTH    Overpass measures the relation's geometry; compared against the
 *             distance the trek's own summary states, where it states one.
 *             THIS FILTERS FIRST — see `decide`. A route OSM holds as a PARENT
 *             OF SECTIONS is measured by summing those sections, which is the
 *             only way the West Highland Way, the Pennine Way and the South
 *             West Coast Path can be measured at all — none has a way of its
 *             own. See `sectionTree`.
 *   COUNTRY   the relation's centre, put through OSM's boundary polygons with
 *             `is_in`, against the countries the trek record names.
 *   WAYS      how many way members carry the line, counted over the route's
 *             whole section tree. Zero means there is nothing to draw, which is
 *             a decline, not a map with no route on it.
 *   Plus a wikipedia tag on the relation whose title matches the trek's name.
 *
 * ── POLITENESS ──────────────────────────────────────────────────────────────
 * Serial requests, never parallel. A real User-Agent naming ICEFALL. Every
 * request waits for a free slot on the public instance (`/api/status`) instead
 * of retrying into a wall, and backs off when none is offered. Every response
 * is cached under `scripts/.cache/trek-osm/`, keyed by the query text, so a
 * re-run costs nothing and a killed run resumes where it stopped.
 *
 * The shape of the work is what keeps it small: ONE heavy query per REGION
 * finds the candidates for every trek in it — the first version asked one
 * heavy query per TREK and was rejected so often it would have taken three and
 * a half hours for 252 of them. A previous sweep in this project was throttled
 * after five requests; the lesson is written into `TrailPlate.tsx`.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE = resolve(HERE, ".cache/trek-osm");
const OUT_TS = resolve(ROOT, "src/treks/osmRoutes.ts");
const OUT_AUDIT = resolve(HERE, "trek-osm-audit.json");

const UA = "ICEFALL-app/1.0 (trek-to-OSM route matching; https://github.com/Chrispapado06/icefall)";
const API = "https://overpass-api.de/api/interpreter";
const STATUS = "https://overpass-api.de/api/status";
const FALLBACK = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const REPORT_ONLY = args.includes("--report");

/* -------------------------------------------------------------------------- */
/* The trek catalogue, read out of the generated TS                            */
/* -------------------------------------------------------------------------- */

function loadTreks() {
  const src = readFileSync(resolve(ROOT, "src/treks/records.ts"), "utf8");
  const body = src.slice(src.indexOf("= [") + 2, src.lastIndexOf("]") + 1).replace(/,(\s*\])/g, "$1");
  return JSON.parse(body);
}

/** Region names and countries, read from the model rather than retyped here. */
function loadRegions() {
  const src = readFileSync(resolve(ROOT, "src/treks/model.ts"), "utf8");
  const out = {};
  for (const m of src.matchAll(/\{ id: "([^"]+)", name: "([^"]+)", country: "([^"]+)"/g))
    out[m[1]] = `${m[2]} ${m[3]}`;
  return out;
}

/* -------------------------------------------------------------------------- */
/* Search windows                                                              */
/* -------------------------------------------------------------------------- */

/**
 * WHERE TO LOOK, per trek region. [south, west, north, east].
 *
 * These are SEARCH WINDOWS, not claims about anything. They are deliberately
 * generous — the cost of a window that is too wide is a slower query, and the
 * cost of one too tight is a route that exists and is never found. Nothing
 * derived from a window reaches a walker: the country evidence that ships comes
 * from OSM's own boundary polygons, not from these numbers.
 */
const WINDOW = {
  khumbu: [27.3, 86.3, 28.3, 87.4],
  annapurna: [28.0, 83.2, 29.2, 84.9],
  langtang: [27.7, 85.0, 28.6, 86.2],
  "nepal-remote": [26.3, 80.0, 30.6, 88.3],
  cusco: [-15.2, -74.6, -10.9, -70.4],
  cordillera: [-16.5, -78.6, -7.4, -71.5],
  patagonia: [-56.2, -76.5, -36.5, -62.5],
  alps: [43.2, 4.7, 48.7, 17.3],
  dolomites: [45.7, 10.5, 47.2, 13.0],
  iberia: [35.7, -18.5, 44.6, 15.5],
  iceland: [63.0, -25.6, 66.8, -12.9],
  "uk-ireland": [49.6, -11.1, 61.3, 2.3],
  "east-africa": [-7.5, 27.5, 15.8, 48.8],
  atlas: [28.3, -13.6, 36.3, -0.4],
  drakensberg: [-32.0, 26.6, -26.8, 31.7],
  "new-zealand": [-47.7, 165.7, -33.9, 179.2],
  australia: [-44.2, 111.8, -9.8, 154.2],
  japan: [23.9, 121.9, 46.3, 146.6],
  "north-america": [24.0, -172.0, 72.5, -51.5],
  bhutan: [26.5, 88.5, 28.6, 92.3],
  "central-asia": [35.8, 65.8, 44.2, 81.7],
  "andes-north": [-23.2, -81.6, 2.6, -56.8],
};

/** Trek `country` strings → ISO 3166-1 alpha-2, for the country test. */
const ISO = {
  Argentina: "AR", Australia: "AU", Austria: "AT", Bhutan: "BT", Bolivia: "BO",
  Canada: "CA", Chile: "CL", Ecuador: "EC", Ethiopia: "ET", France: "FR",
  Germany: "DE", Iceland: "IS", Ireland: "IE", Italy: "IT", Japan: "JP",
  Kenya: "KE", Kyrgyzstan: "KG", Lesotho: "LS", Liechtenstein: "LI", Monaco: "MC",
  Morocco: "MA", Nepal: "NP", "New Zealand": "NZ", Peru: "PE", Portugal: "PT",
  Slovenia: "SI", "South Africa": "ZA", Spain: "ES", Switzerland: "CH",
  Tajikistan: "TJ", Tanzania: "TZ", Uganda: "UG", "United Kingdom": "GB",
  "United States": "US",
};

/** "NP" → "Nepal", straight back out of the table above. */
const countryName = (code) => Object.entries(ISO).find(([, v]) => v === code)?.[0] ?? code;

/* -------------------------------------------------------------------------- */
/* Overpass, politely                                                          */
/* -------------------------------------------------------------------------- */

if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

/**
 * Wait until the public instance says it has a slot for us.
 *
 * `/api/status` is the documented way to ask, and it answers either "N slots
 * available now" or "Slot available after: <time>, in N seconds". Hammering
 * without asking is what earns the "the server is probably too busy" page —
 * measured 2026-09-09, the same query returned it twice and then answered in
 * 12 s. Asking first turns those wasted requests into a wait.
 */
async function waitForSlot() {
  for (let i = 0; i < 40; i++) {
    let text = "";
    try {
      const res = await fetch(STATUS, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      text = await res.text();
    } catch {
      await sleep(10_000);
      continue;
    }
    if (/\d+ slots? available now/.test(text)) return;
    const after = text.match(/in (\d+) seconds/);
    const wait = after ? Math.min(Number(after[1]) + 2, 180) : 20;
    process.stdout.write(`    (no slot — waiting ${wait}s)\n`);
    await sleep(wait * 1000);
  }
}

/** One query, cached for good. The cache key is the query itself. */
async function overpass(query, label) {
  const key = createHash("sha1").update(query).digest("hex").slice(0, 16);
  const path = resolve(CACHE, `${key}.json`);
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      /* a truncated cache entry — fall through and fetch it again */
    }
  }
  if (REPORT_ONLY) return null;

  for (let attempt = 0; attempt < 6; attempt++) {
    /*
     * THE TWO INSTANCES ALTERNATE RATHER THAN QUEUEING ON ONE.
     *
     * This used to spend attempts 0–2 on the main instance and only then try
     * the mirror, so a query the main instance was refusing cost 30 + 60 + 90
     * seconds of waiting before anything else was asked at all — measured
     * 2026-09-09 at three minutes per refused query, several per region, on a
     * sweep of twenty-two regions. Asking the other instance second is both
     * faster and gentler on the one that just said no: it is the definition of
     * backing off to go somewhere else, not to ask again sooner.
     *
     * The politeness rules are unchanged — still serial, still one request at a
     * time, still waiting for a free slot before touching the main instance,
     * still backing off between attempts, still caching every answer for good.
     */
    const url = attempt % 2 === 0 ? API : FALLBACK;
    if (url === API) await waitForSlot();
    requests++;
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(400_000),
      });
      const text = await res.text();
      if (text.trimStart().startsWith("{")) {
        const json = JSON.parse(text);
        if (!(json.remark && /error/i.test(json.remark))) {
          writeFileSync(path, JSON.stringify(json));
          process.stdout.write(`    [${label}] ${(text.length / 1024).toFixed(0)} KB in ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
          return json;
        }
      }
    } catch {
      /* fall through to the back-off */
    }
    /* Still rising, but from a shorter first step: the next attempt goes to the
       OTHER instance, so a long wait here delays a question the one that
       refused is not being asked again anyway. */
    const wait = 12_000 * (attempt + 1);
    process.stdout.write(`    [${label}] refused — waiting ${wait / 1000}s\n`);
    await sleep(wait);
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Names                                                                       */
/* -------------------------------------------------------------------------- */

/** Diacritics off, punctuation to space, lower case. Comparison only. */
const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đð]/gi, "d")
    .replace(/[þ]/gi, "th")
    .replace(/[ø]/gi, "o")
    .replace(/[ß]/gi, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOP = new Set([
  "the", "of", "and", "a", "to", "de", "du", "des", "la", "le", "les", "del",
  "della", "delle", "dei", "di", "das", "der", "die", "el", "los", "las", "im",
  "am", "von", "van", "en", "il", "og", "i", "y", "e", "n", "no",
]);

/**
 * Words that describe the KIND of thing rather than which one it is. Two names
 * may differ by any number of these and still be the same route — "Laugavegur"
 * and "Laugavegur Trail" — but they may never differ by anything else.
 */
const GENERIC = new Set([
  "trek", "treks", "trekking", "trail", "trails", "route", "routes", "hike",
  "hiking", "walk", "walking", "path", "track", "circuit", "loop", "traverse",
  "crossing", "national", "park", "great", "long", "distance", "way",
  "sentier", "sendero", "weg", "wanderweg", "hohenweg", "runde", "tramp",
]);

/** Words. */
const tokens = (s) => norm(s).split(" ").filter(Boolean);

/**
 * The same words with a waymarking reference joined back up.
 *
 * OSM writes "GR 20", "GR20" and "GR.20" for the same trail and the catalogue
 * writes one of them; split on the space that is "gr" and "20", which match
 * nothing and everything respectively.
 *
 * ⚠ THIS IS A SECOND READING OF THE NAME, NOT A REPLACEMENT FOR THE FIRST, and
 * that is the whole point. Joining unconditionally turned "Alta Via 1" into
 * "alta via1" and lost all six Alte Vie of the Dolomites: OSM calls that route
 * "Alta via n. 1 delle Dolomiti", where "via" is a word and the 1 is three
 * tokens away from it. `nameScore` compares both readings and takes the better,
 * so "GR 20" still finds "GR20" and "Alta Via 1" still finds "Alta via n. 1".
 */
const joined = (words) => {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (/^[a-z]{1,3}$/.test(words[i]) && /^\d{1,4}$/.test(words[i + 1] ?? "")) {
      out.push(words[i] + words[i + 1]);
      i++;
    } else out.push(words[i]);
  }
  return out;
};

/** Both readings of a name, deduplicated when they are the same. */
function readings(name) {
  const split = tokens(name);
  const ref = joined(split);
  return ref.join(" ") === split.join(" ") ? [split] : [split, ref];
}
const meaningful = (t) => t.filter((w) => !STOP.has(w));
const core = (t) => meaningful(t).filter((w) => !GENERIC.has(w));

/** Vowel/consonant classes, so an Overpass regex survives OSM's diacritics. */
const CLASS = {
  a: "[aàáâãäåā]", e: "[eèéêëē]", i: "[iìíîïī]", o: "[oòóôõöø]", u: "[uùúûüū]",
  c: "[cç]", n: "[nñ]", s: "[sšś]", z: "[zžź]", y: "[yý]", d: "[dðđ]",
  g: "[gğ]", r: "[rř]", t: "[tť]",
};

const loose = (word) =>
  word
    .split("")
    .map((ch) => CLASS[ch] ?? (/[a-z0-9]/.test(ch) ? ch : `\\${ch}`))
    .join("");

/**
 * The words a trek is searched by.
 *
 * The two most distinctive words of its name, cut back to a stem. The stem is
 * what lets an English catalogue name find a local-language relation — "Stubai"
 * finds "Stubaier Höhenweg", "Dolomites" finds "Dolomiti", "Laugavegur" finds
 * "Laugavegurinn". It is a RECALL device only: everything it returns is then
 * judged on the full name, and the stem itself is never evidence.
 */
function stemsFor(name) {
  const words = [...new Set(core(tokens(name)))].sort((a, b) => b.length - a.length);
  return words
    .slice(0, 2)
    .map((w) => (w.length >= 8 ? w.slice(0, w.length - 3) : w.length >= 6 ? w.slice(0, w.length - 2) : w))
    .filter((w) => w.length >= 3);
}

const NAME_KEYS = ["name", "name:en", "alt_name", "official_name", "int_name", "short_name", "loc_name", "nat_name", "old_name", "ref"];

const namesOf = (tags = {}) => {
  const out = [];
  for (const [k, v] of Object.entries(tags)) {
    if (!v) continue;
    if (NAME_KEYS.includes(k) || /^(name|alt_name|official_name):[a-z]{2,3}$/.test(k)) {
      for (const part of String(v).split(";")) if (part.trim()) out.push(part.trim());
    }
  }
  return out;
};

/** A shared prefix of at least five letters, and most of the shorter word. */
const stemMate = (w, set) =>
  [...set].some((x) => {
    let n = 0;
    while (n < w.length && n < x.length && w[n] === x[n]) n++;
    return n >= 5 && n >= 0.6 * Math.min(w.length, x.length);
  });

/**
 * Words that qualify a route without changing which route it is. OSM writes
 * "Tour du Mont Blanc - Itinéraire principal" for the main line of the TMB.
 */
const QUALIFIER = new Set([
  "main", "principal", "principale", "itineraire", "itinerario", "itinerary",
  "official", "complete", "full", "whole", "classic", "standard", "original",
  "total", "haupt", "hauptweg", "gesamt", "normal", "summer", "winter",
]);

/**
 * How well two names agree.
 *
 *   tier 4 the same name
 *        3 the same name once "Trek"/"Trail"/"Route" and the like are set aside
 *        2 every distinctive word of one name appears in the other
 *        1 every distinctive word has a stem-mate in the other (language variants)
 *        0 no
 *
 * TWO NAMES CAN DIFFER IN TWO DIRECTIONS, AND BOTH ARE DANGEROUS.
 *
 * `extras` counts the DISTINCTIVE words the relation has that the trek does not
 * — the words that could mean it is a different route with a similar name.
 * "Tour du Mont Blanc - Itinéraire principal" has none that count; "Everest
 * Base Camp Trek via Gokyo Lakes" has two, and they are the whole difference
 * between two treks in this catalogue.
 *
 * `missing` counts the same thing the other way round: the trek's own
 * distinctive words that the relation's name does NOT carry. ⚠ THIS COUNT WAS
 * NOT KEPT UNTIL 2026-09-09, AND ITS ABSENCE SHIPPED A WRONG LINE. The Camino
 * Portugués Coastal — the Atlantic variant that leaves the central way at Porto
 * and rejoins it at Redondela — matched r12786090 "Caminho Português de
 * Santiago", the CENTRAL way, because every word the relation carries appears
 * in the trek's name. The only word that told the two routes apart was the one
 * the trek had and the relation lacked: "Coastal". Counted in one direction
 * only, the difference between two real walks was invisible.
 *
 * `decide` demands independent evidence before accepting a match that carries
 * a difference in EITHER direction.
 */
function nameScore(trekName, candName, context = new Set()) {
  let best = { tier: 0, extras: 0, missing: 0 };
  for (const a of readings(trekName))
    for (const b of readings(candName)) {
      const s = scoreReading(a, b, context);
      if (s.tier > best.tier || (s.tier === best.tier && s.tier > 0 && differs(s) < differs(best))) best = s;
    }
  return best;
}

/** How many words could mean these are two different routes, either way round. */
const differs = (s) => (s.extras ?? 0) + (s.missing ?? 0);

function scoreReading(a, b, context) {
  const none = { tier: 0, extras: 0, missing: 0 };
  if (a.length === 0 || b.length === 0) return none;

  /*
   * DISTINCT WORDS, AND THAT WORD IS LOAD-BEARING.
   *
   * "Coast-to-Coast Walk" reduces to [coast, coast] — two tokens, ten letters,
   * enough to satisfy a rule written as "at least two distinctive words of at
   * least eight letters". Every one of those words was "coast", so Wainwright's
   * walk across northern England matched the Pembrokeshire Coast Path, in Wales,
   * and the measured length agreed to within three per cent because both are
   * about 290 km. One word repeated is one word.
   */
  const ac = [...new Set(core(a))];
  const bc = [...new Set(core(b))];
  const bAll = new Set(meaningful(b));
  const aAll = new Set(meaningful(a));
  const universe = new Set([...aAll, ...context]);
  const chars = (list) => list.join("").length;

  /* What the relation says that the trek does not — place words the catalogue
     supplies from its own region and country fields do not count, and neither
     do qualifiers, spelling variants ("Dolomiti" for "Dolomites") or numbers
     the trek already carries. */
  /* Tokens of one or two characters are never counted: "n", "nr", "no" and
     "km" are the punctuation of a route name ("Alta via n. 1 delle Dolomiti"),
     not a second route. Nothing that short can distinguish one walk from
     another, and treating them as distinctive lost every Alta Via. */
  const extras = bc.filter(
    (w) => w.length > 2 && !universe.has(w) && !context.has(w) && !QUALIFIER.has(w) && !stemMate(w, universe),
  ).length;

  /* And what the trek says that the relation does not — "Coastal", "Tilicho",
     "Gokyo": the words a catalogue adds precisely BECAUSE the route is not the
     one the plain name refers to. The place words the trek supplies from its
     own region and country are excluded, and only those; they are the words a
     relation sitting in that place is entitled to leave out. */
  const missing = ac.filter(
    (w) => w.length > 2 && !bAll.has(w) && !context.has(w) && !QUALIFIER.has(w) && !stemMate(w, bAll),
  ).length;

  if (meaningful(a).join(" ") === meaningful(b).join(" ")) return { tier: 4, extras: 0, missing: 0 };
  if (ac.length && bc.length && ac.join(" ") === bc.join(" ")) return { tier: 3, extras: 0, missing: 0 };

  if (ac.length >= 2 && chars(ac) >= 8 && ac.every((w) => bAll.has(w))) return { tier: 2, extras, missing };
  if (bc.length >= 2 && chars(bc) >= 8 && bc.every((w) => aAll.has(w))) return { tier: 2, extras, missing };
  if (ac.length === 1 && ac[0].length >= 7 && bAll.has(ac[0])) return { tier: 2, extras, missing };

  /*
   * THE CATALOGUE SAYS WHERE, THE RELATION ASSUMES IT.
   *
   * "Dolomites Alta Via 1", "GR10 Pyrenees", "Mallorca GR221" — the catalogue
   * prefixes the place because its own list is worldwide; the relation, sitting
   * in that place, calls itself "Alta Via 1". Those place words are allowed to
   * be missing from the relation's name, and ONLY those: they come from the
   * trek's own region and country fields, not from a guess.
   *
   * ⚠ THIS BRANCH IS WHY THE FIRST RUN OFFERED "Makalu base camp trek with Arun
   * valley" FOR THE EVEREST BASE CAMP TREK. The region is called "Everest & the
   * Khumbu", so "Everest" was a place word and could go missing — and what
   * remained, "base camp", is the same on every base camp trek on earth. The
   * guard is `extras`: a relation that brings its own distinctive word (Makalu)
   * has not dropped a place word, it is somewhere else.
   */
  const rest = ac.filter((w) => !context.has(w));
  if (
    rest.length >= 1 &&
    rest.length < ac.length &&
    extras === 0 &&
    (chars(rest) >= 6 || rest.some((w) => /\d/.test(w))) &&
    rest.every((w) => bAll.has(w))
  )
    return { tier: 2, extras, missing };

  if (ac.length >= 1 && chars(ac) >= 6 && ac.every((w) => stemMate(w, bAll))) return { tier: 1, extras, missing };
  if (rest.length >= 1 && rest.length < ac.length && extras === 0 && chars(rest) >= 6 && rest.every((w) => stemMate(w, bAll)))
    return { tier: 1, extras, missing };
  return none;
}

/** Tier alone, for the wikipedia-title check where `extras` is meaningless. */
const nameTier = (trekName, candName, context) => nameScore(trekName, candName, context).tier;

/** A stage, a variant or a feeder — never the route itself. */
/*
 * ⚠ `parte`, `partie` and `part` EARN THEIR PLACE HERE — added 2026-09-09.
 *
 * German `teil` was on this list from the start and its Romance and English
 * equivalents were not, which let r955907 "Via Francigena - 04 parte Italia"
 * stand as the Via Francigena. The trek is the pilgrim road from Canterbury to
 * Rome; that relation is the Italian leg, and it passed only because 1,915 km
 * of Italy is near enough to the 2,000 km the trek states for the length test
 * to call it corroboration. A walker would have opened the page for a walk
 * through England, France and Switzerland and been shown a line that starts in
 * Italy — the exact failure this script exists to prevent, arrived at through
 * a missing word.
 *
 * The route itself IS in OSM, as r11860709 "Via Francigena", but at 3,268 km it
 * is Canterbury to Leuca rather than to Rome, and the length test refuses it.
 * So this trek now has no line, which is the honest answer.
 */
const VARIANT = /\b(variante?s?|variant|alternativa|alternativo|alternative|alternate|bretelle|etappe|etappen|etape|etapa|stage|section|seccion|abschnitt|teil|tappa|jour|parte|partie|part|zubringer|zuweg|approach|link|spur|connector|option|extension|shortcut|detour|bypass|nebenweg|desvio|ramal)\b/i;

function looksLikeStage(candName, trekName) {
  if (VARIANT.test(candName)) return true;
  // "Something 3" or "Something - 12", where the trek's own name has no number.
  if (!/\d/.test(trekName) && /(^|[\s\-:–—#])\d{1,3}\s*$/.test(candName)) return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/* The stated distance, out of the trek's own summary                          */
/* -------------------------------------------------------------------------- */

/**
 * Kilometres the trek record itself claims, as a range.
 *
 * "about 165 km" → [165, 165]. "roughly 100 to 120 km" → [100, 120]. Several
 * figures in one summary (a route plus a longer variant) widen the range, which
 * is right: the relation may map either. Returns null where the summary states
 * no distance, and then the length test does not run — an absent test is
 * recorded as absent, never as a pass.
 */
function statedKm(summary) {
  const found = [];
  const re = /(\d[\d,.]*)\s*(?:to|–|—|-|and)?\s*(\d[\d,.]*)?\s*(km|kilometres|kilometers)\b/gi;
  let m;
  while ((m = re.exec(summary))) {
    for (const raw of [m[1], m[2]]) {
      if (!raw) continue;
      const n = Number(String(raw).replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 3 && n <= 6000) found.push(n);
    }
  }
  if (found.length === 0) return null;
  return [Math.min(...found), Math.max(...found)];
}

/**
 * The same reading, THROWN AWAY WHEN THE TREK'S OWN DURATION CONTRADICTS IT.
 *
 * ⚠ A NUMBER FOLLOWED BY "km" IN A SUMMARY IS NOT NECESSARILY THE ROUTE'S
 * LENGTH, AND READING IT AS ONE SHIPPED A WRONG LINE. The Kumano Kodo's summary
 * ends "the hardest section, Ogumotori-goe, climbs about 1,260 m in 14 km" —
 * fourteen kilometres of ONE DAY on a four-to-six-day pilgrimage. Read as the
 * whole route's distance it did not merely fail to help: it actively
 * corroborated r17097854, a 12.2 km relation mapping a single pass, which then
 * stood on the page as the whole Kumano Kodo.
 *
 * The catalogue states the duration too, and the two cannot both be true. The
 * band is the one `decide` already uses for treks that state no distance at
 * all — five kilometres a day at the bottom, forty at the top, chosen to reject
 * only the grossly implausible. Where the stated distance falls outside it, the
 * distance is what is discarded, not the duration: the duration is a structured
 * field on the record and the distance is a number scraped out of prose.
 *
 * A trek left with no stated distance is not left with no length test — it
 * falls through to that same duration band, which is exactly what refuses the
 * 12.2 km relation.
 */
function distanceStated(trek) {
  const stated = statedKm(trek.summary);
  if (!stated || !trek.durationDays) return stated;
  const [lo, hi] = trek.durationDays;
  const perDayAtMost = stated[1] / lo;
  const perDayAtLeast = stated[0] / hi;
  if (perDayAtMost < 5 || perDayAtLeast > 40) return null;
  return stated;
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

const centreOf = (b) => ({ lat: (b.minlat + b.maxlat) / 2, lon: (b.minlon + b.maxlon) / 2 });

/**
 * Inside a [south, west, north, east] box.
 *
 * ⚠ WEST MAY BE GREATER THAN EAST. New Zealand's country relation runs from
 * 165.6°E to −175.5°E across the antimeridian, and the United States' from
 * 144.4°E (Guam) to −64.4°W. Read naively, every New Zealand trek failed the
 * country test and all seventeen were declined for being in the wrong country.
 */
const inBox = (c, box) => {
  if (c.lat < box[0] || c.lat > box[2]) return false;
  return box[1] <= box[3] ? c.lon >= box[1] && c.lon <= box[3] : c.lon >= box[1] || c.lon <= box[3];
};

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* -------------------------------------------------------------------------- */
/* Phase 0 — country boxes, from OSM itself                                    */
/* -------------------------------------------------------------------------- */

async function countryBoxes(codes) {
  const wanted = [...new Set(codes)].sort();
  const q =
    `[out:json][timeout:300];` +
    `rel["ISO3166-1"~"^(${wanted.join("|")})$"]["boundary"="administrative"]["admin_level"="2"];` +
    `out ids tags bb;`;
  const json = await overpass(q, "country boxes");
  const out = {};
  for (const el of json?.elements ?? []) {
    const iso = el.tags?.["ISO3166-1"];
    if (!iso || !el.bounds) continue;
    const b = el.bounds;
    out[iso] = [b.minlat, b.minlon, b.maxlat, b.maxlon];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

const ALL = loadTreks();
const REGION_NAME = loadRegions();
const regions = [...new Set(ALL.map((t) => t.regionId))].filter((r) => ONLY.length === 0 || ONLY.includes(r));

/** The place words a relation is entitled to leave out. See `nameTier`. */
const contextFor = (trek) =>
  new Set(core(tokens(`${REGION_NAME[trek.regionId] ?? ""} ${trek.country} ${trek.regionId.replace(/-/g, " ")}`)));

const isoNeeded = [];
for (const t of ALL) for (const c of t.country.split("/")) if (ISO[c.trim()]) isoNeeded.push(ISO[c.trim()]);
const BOX = await countryBoxes(isoNeeded);
console.log(`country boxes from OSM: ${Object.keys(BOX).length}`);
console.log(`${regions.length} region(s), ${ALL.filter((t) => regions.includes(t.regionId)).length} treks\n`);

/**
 * EVERY LENGTH THIS PROJECT HAS EVER MEASURED, kept across runs.
 *
 * A relation's length does not change, and measuring it is the expensive half
 * of this script — Overpass has to walk the geometry of every member way. The
 * response cache alone was not enough: it is keyed on the query text, so
 * changing which relations are shortlisted (which any change to the name rules
 * does) re-asks for lengths already known. This is keyed on the relation.
 *
 * A zero here means "asked, and it has no way members of its own" — a
 * super-route. That is a real answer and worth remembering too.
 */
/**
 * A ROUTE THAT IS A PARENT OF OTHER ROUTES, MEASURED THROUGH ITS SECTIONS.
 *
 * `length()` sums a relation's own way members and nothing else, so a route OSM
 * models as a parent of sections measures zero — and zero used to end the
 * argument, because the app drew way members only and a super-route would have
 * been a map with nothing on it.
 *
 * That is no longer true: `services/trails.ts` follows sub-relations. So the
 * biggest routes in the catalogue can be measured the way they are built, by
 * summing the sections, and the sum is what the length tests then judge.
 *
 * ⚠ `alternative` AND `excursion` MEMBERS ARE NOT PART OF THE ROUTE and are not
 * counted. The Pennine Way's parent carries the Bowes Loop under
 * `role=alternative` and the South West Coast Path carries three such; adding
 * them would inflate the total against the very distance it is tested on. The
 * app skips exactly these roles when it draws, so what is measured here is what
 * gets drawn there.
 *
 * Members are fetched with `out;` rather than `out geom;` — this needs the
 * membership tree, not the geometry, and the geometry of the South West Coast
 * Path is 7,932 ways.
 */
/**
 * A member beside the route rather than on it — BOTH SPELLINGS.
 *
 * This is the same set `services/trails.ts` skips when it draws, and the two
 * have to agree: what this script measures is what that file renders, and the
 * trek page prints the measured number as the length of the drawn line. Filter
 * one spelling here and the other there and the page states a distance for a
 * line it is not showing.
 */
const SIDE_ROLE = (role) => role === "alternative" || role === "alternate" || role === "excursion";

async function sectionTree(ids, label) {
  const children = new Map();
  const seen = new Set(ids);
  let level = [...ids];
  /* THE SAME DEPTH `services/trails.ts` FOLLOWS. What is summed here is what
     that file draws, and a route followed further by one than by the other
     would have this script print a distance for a line the app is not showing.
     Both stop as soon as a level yields no more relations; the number is only
     the backstop against a relation that contains itself. */
  for (let depth = 0; depth < 6 && level.length; depth++) {
    const json = await overpass(
      `[out:json][timeout:400];rel(id:${level.join(",")});out;`,
      `${label} members ${depth + 1}`,
    );
    if (!json) break;
    const next = [];
    for (const el of json.elements ?? []) {
      const kids = (el.members ?? [])
        .filter((m) => m.type === "relation" && !SIDE_ROLE(m.role))
        .map((m) => m.ref);
      children.set(el.id, kids);
      for (const k of kids) if (!seen.has(k)) { seen.add(k); next.push(k); }
    }
    level = next;
  }
  return { children, all: seen };
}

const LENGTHS_FILE = resolve(CACHE, "../trek-osm-lengths.json");
const KNOWN_KM = existsSync(LENGTHS_FILE) ? JSON.parse(readFileSync(LENGTHS_FILE, "utf8")) : {};
const saveLengths = () => writeFileSync(LENGTHS_FILE, JSON.stringify(KNOWN_KM));

/**
 * Totals for the parent routes, kept apart from `KNOWN_KM` on purpose.
 *
 * `KNOWN_KM[id]` means one thing only: the length of the ways THIS relation
 * holds itself. Writing a summed total back into it would make the same field
 * mean two different things, and the sum is built by reading those values — a
 * re-run would then sum sums. Keyed on the relation, and rebuilt each run
 * because it is cheap once the sections' own lengths are cached.
 */
const SUMMED_KM = {};

/**
 * The length of the ways each relation holds ITSELF, cached across runs.
 *
 * Zero is a real answer and is remembered as one: it means "asked, and this
 * relation has no ways of its own" — a parent, which `sectionTree` then goes
 * and measures through its sections.
 */
async function measureOwnKm(ids, label) {
  const unknown = ids.filter((id) => KNOWN_KM[id] === undefined).sort((a, b) => a - b);
  for (let i = 0; i < unknown.length; i += 300) {
    const chunk = unknown.slice(i, i + 300);
    const lenQ =
      `[out:json][timeout:400];rel(id:${chunk.join(",")})->.r;` +
      `foreach.r(convert stat ::id = id(), km = length() / 1000; out;);`;
    const lenJson = await overpass(lenQ, `${label} lengths ${i / 300 + 1}`);
    for (const el of lenJson?.elements ?? []) {
      const v = Number(el.tags?.km);
      if (Number.isFinite(v)) KNOWN_KM[el.id] = Math.round(v * 10) / 10;
    }
    // A relation the query answered nothing for has no way members of its own;
    // record the zero so a re-run does not ask again.
    for (const id of chunk) if (KNOWN_KM[id] === undefined) KNOWN_KM[id] = 0;
    saveLengths();
  }
}
console.log(`${Object.keys(KNOWN_KM).length} relation lengths already measured\n`);

const results = [];

for (const regionId of regions) {
  const inRegion = ALL.filter((t) => t.regionId === regionId);
  const win = WINDOW[regionId];
  console.log(`── ${regionId} (${inRegion.length} treks)`);
  if (!win) {
    for (const t of inRegion) results.push({ id: t.id, name: t.name, matched: false, reason: "no search window for this region" });
    continue;
  }

  /* One pattern for the whole region: every trek's stems, as an alternation. */
  const stems = [...new Set(inRegion.flatMap((t) => stemsFor(t.name)))];
  const pattern = `(${stems.map(loose).join("|")})`;

  const query =
    `[out:json][timeout:400];` +
    `rel(${win.join(",")})["route"~"^(hiking|foot|walking|running)$"]` +
    `[~"^(name|name:[a-z]{2,3}|alt_name|official_name|int_name|short_name|loc_name|nat_name|old_name|ref)$"~"${pattern}",i];` +
    `out tags bb;`;

  const json = await overpass(query, regionId);
  if (!json) {
    for (const t of inRegion) results.push({ id: t.id, name: t.name, matched: false, reason: "Overpass never answered the search for this region" });
    console.log(`  ✗ no answer — ${inRegion.length} treks left unmatched`);
    continue;
  }

  const rels = (json.elements ?? []).filter((e) => e.type === "relation" && e.tags && e.bounds);
  console.log(`  ${rels.length} named route relations to consider`);

  /*
   * ── THE PARENTS, WHICH A BOUNDING BOX CANNOT SEE ──────────────────────────
   *
   * The region query above is `rel(bbox)[...]`, and Overpass matches a relation
   * to a bounding box through the nodes and ways it holds ITSELF. A route that
   * is a parent of sections holds none, so it is not merely unmeasured — it
   * never appears in the answer at all. Measured 2026-09-09: the region query
   * for Britain and Ireland returned all eight sections of the West Highland
   * Way and not r16287, the route they belong to; the same for the Pennine Way
   * and the South West Coast Path. Every one of those was then declined for
   * "no relation of this name measures anything near" the stated distance —
   * the whole route was never a candidate, only its pieces.
   *
   * So parents are asked for BY NAME, without a bounding box. That answer
   * carries no `bb` either, for the same reason, so the box is built from the
   * sections underneath — and once it has one, a parent is scored, windowed and
   * country-checked exactly like any other candidate. Nothing here relaxes a
   * test; it puts a candidate in front of the tests that could not reach them.
   */
  /*
   * `name` AND `name:en` ONLY, WHERE THE REGION QUERY SEARCHES TEN KEYS.
   *
   * The region query above is confined to a bounding box, so a regex across
   * every name-ish key costs little. This one cannot be — a parent has no
   * geometry to sit inside a box — so it is a planet-wide search, and asked
   * across ten keys the public instance simply refused it: three escalating
   * back-offs on the Alps alone, 2026-09-09, before it reached the mirror.
   * Confined to the two keys a national trail actually carries its name in, it
   * is answered. The cost of the narrowing is a parent named ONLY in, say,
   * `alt_name` — which stays unmatched, and an unmatched trek is the honest
   * outcome this whole script is built around.
   *
   * ⚠ AND IT STAYS PER REGION, though one query for every super-route on earth
   * would be tidier and would cache once for the whole run. That was tried the
   * same day and refused outright — `rel["type"="superroute"]` with no name to
   * narrow it is a planet-wide scan the public instances answer with a 504,
   * "the server is probably too busy". The region's own name pattern is what
   * makes this query cheap enough to be answered at all.
   */
  const superJson = await overpass(
    `[out:json][timeout:400];` +
      `(rel["type"="superroute"]["route"~"^(hiking|foot|walking|running)$"]["name"~"${pattern}",i];` +
      `rel["type"="superroute"]["route"~"^(hiking|foot|walking|running)$"]["name:en"~"${pattern}",i];);` +
      `out tags bb;`,
    `${regionId} parents`,
  );
  /*
   * NAME FIRST, THEN THE NETWORK — the order matters and it is not a
   * micro-optimisation.
   *
   * The pattern is a loose alternation of every trek stem in the region, so it
   * answers widely: 273 parents came back for the Alps. Building a bounding box
   * for one means walking its whole section tree and asking for every section's
   * box, and doing that for 273 routes that no trek here could ever be named
   * after cost ~20 MB and ten minutes on the first region alone.
   *
   * A parent whose every name already scores zero against every trek in this
   * region cannot become a match however its box turns out, so it is dropped
   * before a single further request is spent on it. This changes which
   * candidates are ASKED ABOUT, never which are accepted — the scoring below is
   * untouched and every survivor still faces the same window, country, length
   * and name tests.
   */
  const namedLikeATrek = (tags) =>
    namesOf(tags).some((n) => inRegion.some((t) => nameScore(t.name, n, contextFor(t)).tier > 0));
  const supers = (superJson?.elements ?? []).filter(
    (e) => e.type === "relation" && e.tags && !rels.some((r) => r.id === e.id) && namedLikeATrek(e.tags),
  );
  const boxless = supers.filter((e) => !e.bounds).map((e) => e.id);
  if (boxless.length) {
    const { children, all } = await sectionTree(boxless, `${regionId} parent boxes`);
    const bJson = await overpass(
      `[out:json][timeout:400];rel(id:${[...all].join(",")});out ids bb;`,
      `${regionId} parent boxes`,
    );
    const box = new Map();
    for (const el of bJson?.elements ?? []) if (el.bounds) box.set(el.id, el.bounds);
    /* The union of every section's box, walked once so a cycle cannot hang. */
    const union = (id, seen = new Set()) => {
      if (seen.has(id)) return null;
      seen.add(id);
      let b = box.get(id) ? { ...box.get(id) } : null;
      for (const k of children.get(id) ?? []) {
        const kb = union(k, seen);
        if (!kb) continue;
        b = b
          ? {
              minlat: Math.min(b.minlat, kb.minlat), minlon: Math.min(b.minlon, kb.minlon),
              maxlat: Math.max(b.maxlat, kb.maxlat), maxlon: Math.max(b.maxlon, kb.maxlon),
            }
          : { ...kb };
      }
      return b;
    };
    for (const e of supers) if (!e.bounds) e.bounds = union(e.id);
  }
  const usableSupers = supers.filter((e) => e.bounds);
  if (usableSupers.length) {
    rels.push(...usableSupers);
    console.log(`  + ${usableSupers.length} parent route(s) a bounding box could not see`);
  }

  /* Score every relation against every trek in the region, keeping the ones a
     trek could plausibly be. Only those get their length measured. */
  const perTrek = new Map();
  const shortlist = new Set();
  for (const trek of inRegion) {
    const context = contextFor(trek);
    const iso = trek.country.split("/").map((c) => ISO[c.trim()]).filter(Boolean);
    const scored = [];
    for (const r of rels) {
      let tier = 0;
      let extras = 0;
      let missing = 0;
      let via = "";
      for (const n of namesOf(r.tags)) {
        const s = nameScore(trek.name, n, context);
        // Best tier wins; between equal tiers, the name that differs from the
        // trek's by the fewest words — in either direction — is the closer one.
        if (s.tier > tier || (s.tier === tier && s.tier > 0 && differs(s) < extras + missing)) {
          tier = s.tier;
          extras = s.extras;
          missing = s.missing;
          via = n;
        }
      }
      if (tier === 0) continue;
      const centre = centreOf(r.bounds);
      if (!inBox(centre, win)) continue;
      if (iso.length && !iso.some((c) => BOX[c] && inBox(centre, BOX[c]))) continue;
      scored.push({
        osmId: r.id,
        name: r.tags.name ?? via,
        matchedName: via,
        tier,
        extras,
        missing,
        km: null,
        bounds: r.bounds,
        centre,
        tags: r.tags,
        stage: looksLikeStage(via, trek.name) || looksLikeStage(r.tags.name ?? "", trek.name),
        inCountry: iso.filter((c) => BOX[c] && inBox(centre, BOX[c])),
      });
      shortlist.add(r.id);
    }
    perTrek.set(trek.id, scored);
  }

  /* Lengths, measured by Overpass on the relations' own geometry — one query
     for the whole region's shortlist rather than one per relation, and only
     for the relations whose length is not already known. See `KNOWN_KM`. */
  const km = new Map();
  await measureOwnKm([...shortlist], regionId);

  /*
   * THE PARENTS, MEASURED THROUGH THEIR SECTIONS.
   *
   * A shortlisted relation that measures zero has no ways of its own. Before
   * the app followed sub-relations that was the end of it; now the sections are
   * fetched, measured and summed, which is the only way the West Highland Way,
   * the Pennine Way and the South West Coast Path can be measured at all —
   * every one of them is a parent and none has a single way of its own.
   */
  const parents = [...shortlist].filter((id) => KNOWN_KM[id] === 0);
  if (parents.length) {
    const { children, all } = await sectionTree(parents, regionId);
    await measureOwnKm([...all], `${regionId} sections`);
    /* Own ways plus every section below, each counted once. A relation that
       contains itself would recurse for ever, so the walk remembers. */
    const total = (id, seen = new Set()) => {
      if (seen.has(id)) return 0;
      seen.add(id);
      return (KNOWN_KM[id] ?? 0) + (children.get(id) ?? []).reduce((s, k) => s + total(k, seen), 0);
    };
    /* The whole tree under a parent, which is the set the verification pass has
       to measure: `way(r.r)` sees a relation's DIRECT way members only, so a
       parent verified on its own id draws nothing and would be thrown out. */
    const under = (id, seen = new Set()) => {
      if (seen.has(id)) return seen;
      seen.add(id);
      for (const k of children.get(id) ?? []) under(k, seen);
      return seen;
    };
    for (const id of parents) {
      const sum = Math.round(total(id) * 10) / 10;
      if (sum > 0) {
        SUMMED_KM[id] = { km: sum, sections: (children.get(id) ?? []).length, all: [...under(id)] };
        console.log(`  Σ r${id} is a parent of ${SUMMED_KM[id].sections} sections — ${sum} km`);
      }
    }
  }
  /* A parent's length is the sum over its sections; everything else is its own
     ways. `SUMMED_KM` is only ever set where the relation had no ways at all,
     so the two can never disagree about the same relation. */
  for (const id of shortlist) {
    if (SUMMED_KM[id]) km.set(id, SUMMED_KM[id].km);
    else if (KNOWN_KM[id] !== undefined) km.set(id, KNOWN_KM[id]);
  }

  for (const trek of inRegion) {
    const scored = perTrek.get(trek.id) ?? [];
    for (const c of scored) {
      c.km = km.has(c.osmId) ? km.get(c.osmId) : null;
      /* Nonzero only where OSM models this route as a parent of sections, and
         the page says so — a walker reading the evidence should know the line
         was assembled from the route's own sections rather than held whole. */
      c.sections = SUMMED_KM[c.osmId]?.sections ?? 0;
    }
    const stated = distanceStated(trek);
    const decided = decide(trek, scored, stated);
    results.push({
      id: trek.id, name: trek.name, region: trek.regionId, country: trek.country,
      statedKm: stated, candidates: scored.length, ...decided,
    });
    console.log(
      decided.matched
        ? `  ✓ ${trek.name}  →  r${decided.osmId} "${decided.osmName}" ${decided.lengthKm ?? "?"} km [${decided.confidence}]`
        : `  · ${trek.name} — ${decided.reason}`,
    );
  }
}

/**
 * Which candidate, if any.
 *
 * Everything here is a reason to REFUSE. There is no scoring function that adds
 * points until a match falls out; a candidate has to survive every test.
 */
function decide(trek, scored, stated) {
  if (scored.length === 0) return { matched: false, reason: "no OSM route relation in this region carries this name" };

  /*
   * THE SHORTLISTING BAND IS DELIBERATELY LOOSE AT THE TOP.
   *
   * `length()` sums EVERY way member, variants included; `trailGeometry` draws
   * only the ways with no `alternative` or `excursion` role. Measured on Alta
   * Via 1 of the Dolomites: 179.5 km counted, 118.4 km drawn, against the
   * 125 km the catalogue states. Held to a tight upper bound here, the right
   * relation was refused for being too long — by 55 km of paths the app was
   * never going to put on the map.
   *
   * So this is a sieve, not the test. The test is `drawnOk`, applied in the
   * verification pass to the length the app will actually draw.
   */
  const lengthOk = (c) => {
    if (!stated || c.km == null) return null; // untestable, which is not a pass
    const [lo, hi] = stated;
    return c.km >= lo * 0.7 && c.km <= hi * 2;
  };

  /**
   * THE SIEVE MAY NOT DOUBLE AS THE CORROBORATION.
   *
   * `lengthOk` is deliberately loose at the top so variant ways cannot refuse a
   * good relation. Using that same loose answer as the second opinion that
   * promotes a partial name match let "CDT - Colorado Section", 1,174 km, be
   * accepted as the Colorado Trail, which the catalogue puts at 780 km: within
   * twice, so the sieve passed it, and the sieve's pass was then read as
   * agreement. Corroboration is a tighter question and gets its own band.
   */
  const closeOnLength = (c) => {
    if (!stated || c.km == null) return null;
    const [lo, hi] = stated;
    return c.km >= lo * 0.75 && c.km <= hi * 1.25;
  };

  /* Still no length after the sections were summed means there is nothing under
     this relation to draw — not a parent, just empty. A relation that IS a
     parent arrives here with the total of its sections; see `SUMMED_KM`. */
  let pool = scored.filter((c) => c.km != null && c.km > 0);
  if (pool.length === 0)
    return { matched: false, reason: "the candidates carry no mapped ways at all, their own or their sections' — the app would draw nothing" };

  /*
   * THE STATED DISTANCE FILTERS FIRST, BEFORE THE NAME DOES.
   *
   * Measured on the Pennine Way: OSM maps it as named sections plus twenty-odd
   * other relations that all call themselves "Pennine Way", the longest 190 km
   * against the 431 km the catalogue states. Taking the best-named of those
   * would hand a walker a third of the trail under the whole trail's name.
   * Where the trek states a distance, only relations near it are candidates at
   * all — and if none is, that is a decline, not a reason to relax the test.
   */
  if (stated) {
    const fits = pool.filter((c) => lengthOk(c) === true);
    if (fits.length === 0) {
      const closest = pool.slice().sort((a, b) => Math.abs(a.km - stated[0]) - Math.abs(b.km - stated[0]))[0];
      return {
        matched: false,
        reason: `no relation of this name measures anything near the ${stated[0] === stated[1] ? stated[0] : stated.join("–")} km this trek states — closest is r${closest.osmId} "${closest.name}" at ${closest.km} km`,
      };
    }
    pool = fits;
  } else if (trek.durationDays) {
    /*
     * NO STATED DISTANCE? THEN THE DURATION IS THE ONLY LENGTH EVIDENCE THERE
     * IS, AND IT IS ENOUGH TO CATCH A HALF-MAPPED ROUTE.
     *
     * Measured: r17548991 is named exactly "Annapurna Base Camp Trek", sits in
     * the right valley, and is 23.9 km long — for a walk this catalogue puts at
     * seven to twelve days. It is the right route, mapped as far as somebody
     * got. Drawing it would show a walker a line that stops in the middle of
     * the Modi Khola under the name of the whole trek.
     *
     * The band is deliberately wide enough to be nearly unarguable: five
     * kilometres a day at the bottom (slower than any published trekking day)
     * and forty at the top. It rejects only the grossly implausible.
     */
    const [lo, hi] = trek.durationDays;
    const fits = pool.filter((c) => c.km >= lo * 5 && c.km <= hi * 40);
    if (fits.length === 0) {
      const closest = pool.slice().sort((a, b) => Math.abs(a.km - lo * 12) - Math.abs(b.km - lo * 12))[0];
      return {
        matched: false,
        reason: `no relation of this name is a plausible length for a ${lo === hi ? lo : `${lo}–${hi}`} day walk (${lo * 5}–${hi * 40} km) — closest is r${closest.osmId} "${closest.name}" at ${closest.km} km`,
      };
    }
    pool = fits;
  }

  const best = Math.max(...pool.map((c) => c.tier));
  let top = pool.filter((c) => c.tier === best);

  // Variants and stages lose to the route itself.
  const whole = top.filter((c) => !c.stage);
  if (whole.length > 0) top = whole;

  if (top.length > 1) {
    // Several relations that ARE the same line — same place, same length — are
    // a duplicate mapping, not an ambiguity. Anything else is an ambiguity.
    const [a] = top;
    const sameLine = top.every(
      (c) => haversineKm(a.centre, c.centre) < 15 && Math.max(c.km, a.km) / Math.min(c.km, a.km) < 1.3,
    );
    if (sameLine) top = [top.slice().sort((x, y) => y.km - x.km)[0]];
    else
      return {
        matched: false,
        reason: `ambiguous — ${top.length} relations answer to this name in different places (${top.slice(0, 8).map((c) => `r${c.osmId} ${c.km}km`).join(", ")}${top.length > 8 ? ", …" : ""})`,
      };
  }

  const c = top[0];

  /*
   * A STAGE IS NEVER THE ROUTE, even when it is the only candidate left.
   *
   * The rule above prefers a whole route to a stage where both exist; this one
   * refuses a stage where no whole route does. Without it "CDT - Colorado
   * Section" stood as the Colorado Trail because nothing better was on offer —
   * and "nothing better was on offer" is a reason to draw no line, not a reason
   * to draw the wrong one.
   */
  if (c.stage)
    return {
      matched: false,
      reason: `the closest relation, r${c.osmId} "${c.name}", is a stage or a variant rather than the route itself`,
    };

  const lenTest = lengthOk(c);
  const wiki = c.tags.wikipedia ?? c.tags["wikipedia:en"] ?? null;
  const wikiOk = wiki ? nameTier(trek.name, String(wiki).replace(/^[a-z-]+:/, "")) >= 2 : null;

  /* The gate. Tier 4 and 3 are the relation calling itself what the trek calls
     it. Tier 2 is a containment, and needs a second thing to agree. Tier 1 is a
     stem, and needs a measured length or a wikipedia title to agree.

     `apart` is the number of distinctive words between the two names in EITHER
     direction — the relation's that the trek lacks, and the trek's that the
     relation lacks. Counted only in the first direction, it let the Camino
     Portugués Coastal take the central Camino's line: every word "Caminho
     Português de Santiago" carries is in the trek's name, and the one word that
     distinguishes the two walks was the trek's own. */
  const apart = c.extras + (c.missing ?? 0);
  const corroborated = closeOnLength(c) === true || wikiOk === true;
  let confidence = null;
  if (c.tier >= 3) confidence = "strong";
  else if (c.tier === 2 && apart === 0) confidence = corroborated ? "strong" : "medium";
  else if (c.tier === 2 && corroborated) confidence = "strong";
  else if (c.tier === 1 && apart === 0 && corroborated) confidence = "medium";

  if (!confidence)
    return {
      matched: false,
      reason:
        apart > 0
          ? `r${c.osmId} "${c.name}" and this trek's name differ by ${apart} distinctive word(s) — ${c.extras} the relation carries and this trek does not, ${c.missing ?? 0} this trek carries and the relation does not — and no measured length or wikipedia title says they are the same route`
          : `only a stem of the name matches r${c.osmId} "${c.name}", and no measured length or wikipedia title agrees with it`,
    };

  return {
    matched: true,
    confidence,
    osmId: c.osmId,
    osmName: c.name,
    matchedName: c.matchedName,
    extras: c.extras,
    missing: c.missing ?? 0,
    lengthKm: c.km,
    /** Nonzero where OSM holds this route as a parent of sections. */
    sections: c.sections ?? 0,
    bounds: c.bounds,
    centre: c.centre,
    tier: c.tier,
    tests: {
      name: ["none", "a stem of the name", "every distinctive word matches", "the same name but for a generic word", "the same name"][c.tier],
      country: c.inCountry,
      length:
        lenTest === null
          ? trek.durationDays
            ? `${c.km} km measured, a plausible length for the ${trek.durationDays[0] === trek.durationDays[1] ? trek.durationDays[0] : trek.durationDays.join("–")} days this route takes — the trek itself states no distance`
            : `${c.km} km measured, and this trek states neither a distance nor a duration to test it against`
          : `${c.km} km measured against the ${stated[0] === stated[1] ? stated[0] : stated.join("–")} km this trek states`,
      wikipedia: wiki ?? null,
    },
    tags: {
      network: c.tags.network ?? null,
      ref: c.tags.ref ?? null,
      wikidata: c.tags.wikidata ?? null,
      operator: c.tags.operator ?? null,
      symbol: c.tags.symbol ?? null,
      website: c.tags.website ?? c.tags.url ?? null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Phase two — verify every proposed match against the relation itself         */
/* -------------------------------------------------------------------------- */

/**
 * A NAME AND A LENGTH ARE NOT A LINE.
 *
 * Phase one judges a relation on the tags the search sent back. This asks the
 * relation two more questions, and both can still kill a match:
 *
 *   WAYS   how many way members it actually has. `trailGeometry` builds the
 *          line out of way members and ignores relation members, so a
 *          super-route of sub-relations draws NOTHING — and a Start button over
 *          an empty map is the worst outcome available here.
 *   IS_IN  which country the centre is actually in, from OSM's own boundary
 *          polygons rather than from a bounding box. The boxes cannot do this
 *          on their own: France's spans the planet because of its overseas
 *          départements, so it excludes nothing.
 */
console.log(`\n── verifying ${results.filter((r) => r.matched).length} matches`);
for (const r of results) {
  if (!r.matched) continue;
  const trek = ALL.find((t) => t.id === r.id);
  const iso = trek.country.split("/").map((c) => ISO[c.trim()]).filter(Boolean);
  /* The ways the app will actually draw: every way member except the ones
     `trailGeometry` skips by role. Their summed length is the length of the
     line on the map, which is the number this page is entitled to print. */
  /* A parent is verified over its whole section tree — the same ways the app
     will reach by following sub-relations. Everything else is verified over
     itself, exactly as before. */
  /* Worded exactly as it always was for an ordinary relation, so a re-run
     serves all of those out of the response cache rather than re-asking a
     public instance for an answer it already gave. */
  const tree = SUMMED_KM[r.osmId]?.all;
  const q =
    `[out:json][timeout:250];${tree ? `rel(id:${tree.join(",")})` : `rel(${r.osmId})`}->.r;` +
    /* The same three roles `SIDE_ROLE` skips, so the kilometres counted here
       are the kilometres the app draws. `alternate` was missing until
       2026-09-09 and the Six Foot Track's spur was counted as track. */
    `way(r.r)->.all;way(r.r:"alternative")->.a1;way(r.r:"excursion")->.a2;way(r.r:"alternate")->.a3;` +
    /* Named intermediates rather than nested unions: three differences written
       as `((.all; - .a1;); - .a2;); - .a3;)` is a parse error, and Overpass
       reports it as a 200 with an HTML body — which this script would have read
       as "no answer" and turned into a decline for every match it verified. */
    `(.all; - .a1;)->.b1;(.b1; - .a2;)->.b2;(.b2; - .a3;);` +
    `make stat km = sum(length()) / 1000, ways = count(ways);out;` +
    `is_in(${r.centre.lat.toFixed(5)},${r.centre.lon.toFixed(5)})->.a;area.a["ISO3166-1"];out tags;`;
  const json = await overpass(q, `verify ${r.id}`);
  if (!json) {
    Object.assign(r, { matched: false, reason: "the verification query was never answered, so this match is unproven" });
    console.log(`  ✗ ${r.name} — unverified`);
    continue;
  }
  const stat = (json.elements ?? []).find((e) => e.type === "stat");
  const ways = Number(stat?.tags?.ways ?? 0);
  const drawnKm = Number(stat?.tags?.km);
  const areas = (json.elements ?? []).filter((e) => e.type === "area" && e.tags?.["ISO3166-1"]).map((e) => e.tags["ISO3166-1"]);
  r.wayMembers = ways;
  r.countedKm = r.lengthKm;
  if (Number.isFinite(drawnKm) && drawnKm > 0) r.lengthKm = Math.round(drawnKm * 10) / 10;

  if (ways === 0) {
    console.log(`  ✗ ${r.name} — r${r.osmId} has no way members; the app would draw nothing`);
    Object.assign(r, { matched: false, reason: `r${r.osmId} has no way members of its own — the app draws way members only, so this would be an empty map` });
    continue;
  }
  if (areas.length > 0 && !areas.some((a) => iso.includes(a))) {
    console.log(`  ✗ ${r.name} — r${r.osmId} sits in ${areas.join("/")}, not ${iso.join("/")}`);
    Object.assign(r, { matched: false, reason: `r${r.osmId} sits in ${areas.join("/")}, and this trek is in ${trek.country}` });
    continue;
  }

  /*
   * THE LENGTH TEST, RE-RUN ON THE LINE THE APP WILL DRAW.
   *
   * The sieve in `decide` had to tolerate variant ways; this does not. A trek
   * that states a distance and a relation that draws something well away from
   * it are not the same route, however well the names agree.
   */
  const stated = distanceStated(trek);
  if (stated && r.lengthKm !== null) {
    const [lo, hi] = stated;
    if (r.lengthKm < lo * 0.7 || r.lengthKm > hi * 1.35) {
      console.log(`  ✗ ${r.name} — draws ${r.lengthKm} km against ${lo}–${hi} km stated`);
      Object.assign(r, {
        matched: false,
        reason: `r${r.osmId} draws ${r.lengthKm} km, against the ${lo === hi ? lo : `${lo}–${hi}`} km this trek states`,
      });
      continue;
    }
    r.tests.length = `${r.lengthKm} km drawn against the ${lo === hi ? lo : `${lo}–${hi}`} km this trek states`;
  } else if (trek.durationDays && r.lengthKm !== null) {
    const [lo, hi] = trek.durationDays;
    if (r.lengthKm < lo * 5 || r.lengthKm > hi * 40) {
      console.log(`  ✗ ${r.name} — draws ${r.lengthKm} km, implausible for ${lo}–${hi} days`);
      Object.assign(r, {
        matched: false,
        reason: `r${r.osmId} draws ${r.lengthKm} km, not a plausible length for a ${lo === hi ? lo : `${lo}–${hi}`} day walk`,
      });
      continue;
    }
    r.tests.length = `${r.lengthKm} km drawn, a plausible length for the ${lo === hi ? lo : `${lo}–${hi}`} days this route takes — the trek itself states no distance`;
  }

  r.tests.countryPolygon = areas.length
    ? `the line's centre falls inside ${areas.map(countryName).join(" and ")}, by OSM's own boundary`
    : "the centre falls in no country polygon at all — a coast or a border";
  r.tests.wayMembers = ways;
}

/* -------------------------------------------------------------------------- */
/* Phase three — no two treks may claim the same line                          */
/* -------------------------------------------------------------------------- */

/**
 * ONE RELATION, ONE TREK.
 *
 * The Camino Portugués and the Camino Portugués Coastal both matched
 * r12786090, "Caminho Português de Santiago". They are different walks — the
 * coastal way leaves the central one at Porto and follows the sea — so at least
 * one of those two pages would have drawn the wrong route under its own name,
 * its own duration and its own grade.
 *
 * Where one of the claimants is plainly the closer name it keeps the relation
 * and the others are declined. Where they are equally close, NOBODY gets it:
 * the catalogue is telling us the relation is ambiguous between two real
 * routes, and picking one of them by tie-break would be a coin toss printed as
 * a fact.
 */
const claims = new Map();
for (const r of results) if (r.matched) (claims.get(r.osmId) ?? claims.set(r.osmId, []).get(r.osmId)).push(r);

for (const [osmId, group] of claims) {
  if (group.length < 2) continue;
  const ranked = group
    .slice()
    .sort(
      (a, b) =>
        b.tier - a.tier ||
        ((a.extras ?? 0) + (a.missing ?? 0) - ((b.extras ?? 0) + (b.missing ?? 0))) ||
        a.osmName.length - b.osmName.length,
    );
  const [first, second] = ranked;
  const decisive =
    first.tier > second.tier ||
    (first.extras ?? 0) + (first.missing ?? 0) < (second.extras ?? 0) + (second.missing ?? 0);
  const others = group.map((g) => g.name).join(", ");
  for (const r of ranked) {
    if (decisive && r === first) continue;
    console.log(`  ✗ ${r.name} — r${osmId} is claimed by ${group.length} treks${decisive ? `; ${first.name} names it more closely` : " and none names it more closely"}`);
    Object.assign(r, {
      matched: false,
      reason: decisive
        ? `r${osmId} is also claimed by ${first.name}, which names it more closely — two treks cannot share one line`
        : `r${osmId} is claimed equally by ${group.length} treks in this catalogue (${others}), so it is given to none of them`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Write                                                                       */
/* -------------------------------------------------------------------------- */

const matched = results.filter((r) => r.matched);
const declined = results.filter((r) => !r.matched);

/*
 * `--only` MAY NOT WRITE THE GENERATED FILES, AND THIS IS NOT A CONVENIENCE.
 *
 * Both outputs are rebuilt from `results`, and with `--only` set that holds the
 * chosen regions and nothing else. Writing them would silently delete every
 * trek outside those regions from `osmRoutes.ts` — the map, the GPX and the
 * profile would vanish from dozens of pages, and the file would still look
 * perfectly well-formed while it happened. The flag is for reading what one
 * region does; a shipped file is only ever built from a whole run.
 */
if (ONLY.length) {
  console.log(`\n--only=${ONLY.join(",")} · matched ${matched.length} · declined ${declined.length}`);
  console.log("NOTHING WAS WRITTEN. These outputs are rebuilt whole, and this run covered");
  console.log(`only ${ONLY.length} of the catalogue's regions — writing them would drop every other trek.`);
  process.exit(0);
}

writeFileSync(
  OUT_AUDIT,
  JSON.stringify({ built: new Date().toISOString().slice(0, 10), matched: matched.length, declined: declined.length, results }, null, 1),
);

const rows = matched
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(
    (r) =>
      `  ${JSON.stringify(r.id)}: ${JSON.stringify({
        osmId: r.osmId,
        osmName: r.osmName,
        lengthKm: r.lengthKm,
        lat: Math.round(r.centre.lat * 1e5) / 1e5,
        lon: Math.round(r.centre.lon * 1e5) / 1e5,
        bounds: [r.bounds.minlat, r.bounds.minlon, r.bounds.maxlat, r.bounds.maxlon].map((n) => Math.round(n * 1e5) / 1e5),
        confidence: r.confidence,
        evidence: [
          `name: ${r.tests.name} ("${r.matchedName}")`,
          `country: ${r.tests.countryPolygon ?? (r.tests.country.join(", ") || "—")}`,
          `length: ${r.tests.length}`,
          r.sections
            ? `${r.wayMembers ?? 0} way members carry the line, across the ${r.sections} sections this route is mapped in`
            : `${r.wayMembers ?? 0} way members carry the line`,
        ],
      })},`,
  )
  .join("\n");

writeFileSync(
  OUT_TS,
  `import type { TrekRoute } from "./route";\n\n` +
    `/**\n * GENERATED by \`scripts/match-treks-to-osm.mjs\` — do not hand-edit.\n *\n` +
    ` * Built ${new Date().toISOString().slice(0, 10)}. ${matched.length} of ${results.length} treks\n` +
    ` * matched to an OpenStreetMap route relation; ${declined.length} declined, and the\n` +
    ` * reason for every one of those is in \`scripts/trek-osm-audit.json\`.\n *\n` +
    ` * A trek that is NOT in this map keeps the behaviour it has always had: no\n` +
    ` * map, no GPX, no profile, and nothing drawn where they would be. That is\n` +
    ` * the honest outcome of weak evidence, and it is deliberately easier to\n` +
    ` * leave a trek out of this file than to put one in.\n *\n` +
    ` * Route data © OpenStreetMap contributors, ODbL.\n */\n` +
    `export const TREK_ROUTES: Record<string, TrekRoute> = {\n${rows}\n};\n`,
);

console.log(`\nmatched ${matched.length} · declined ${declined.length} · ${requests} network requests this run`);
console.log(`  ${OUT_TS}`);
console.log(`  ${OUT_AUDIT}`);
