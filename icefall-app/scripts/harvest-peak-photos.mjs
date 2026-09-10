#!/usr/bin/env node
/**
 * Harvests photographs of the peaks in `public/data/peaks.json` from Wikimedia,
 * AT BUILD TIME, into `public/img/peaks/` — and writes the credits file that
 * makes them legal to show.
 *
 *   node scripts/harvest-peak-photos.mjs               # resume / top up
 *   node scripts/harvest-peak-photos.mjs --limit 200   # a slice, for testing
 *   node scripts/harvest-peak-photos.mjs --refresh     # ignore the API cache
 *   node scripts/harvest-peak-photos.mjs --report      # no fetching, just the numbers
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A BUILD SCRIPT AND NOT A FETCH IN THE APP
 * ---------------------------------------------------------------------------
 *
 * ICEFALL already tried resolving mountain photographs live, and the header of
 * `src/components/domain/TrailPlate.tsx` records what happened on 2026-08-24:
 * Commons rate-limited a sweep of twelve locations after five, geosearch
 * returned whatever was geotagged nearby (Cyprus got a stranger's thumbs-up
 * selfie), and the fallback illustrated a Cypriot pine trail with an Icelandic
 * massif. All of it was torn out.
 *
 * The decisive argument for moving to a build step is not latency, though. It
 * is that NOBODY CAN LOOK AT A RUNTIME FETCH. `src/treks/credits.ts` says of
 * the 238 trek photographs: "EVERY ONE WAS LOOKED AT. No filter catches a map
 * whose filename never says 'map', a bronze plaque with the route etched on
 * it, or an aerial that is really a satellite frame — all three got through
 * and were caught by eye." A pipeline that writes files to disk can be
 * reviewed as a contact sheet. A `useEffect` cannot.
 *
 * ---------------------------------------------------------------------------
 * HOW A PEAK IS RESOLVED — BY ARTICLE OR ENTITY, NEVER BY PROXIMITY
 * ---------------------------------------------------------------------------
 *
 * ADAPTED 2026-09-10 FOR THE WORLDWIDE CATALOGUE. The version this came from
 * could only resolve a peak through its `wikipedia` tag, because that was the
 * only identity link the builder kept. `build-peak-catalogue.mjs` now also
 * keeps OSM's `wikidata` tag in a `d` field, which is the SAME KIND of link
 * and a much commoner one: measured across 3,028 OSM peaks, 58.1% carry
 * `wikidata` against 30.4% for `wikipedia` — in the Alps 63.9% against 26.2%.
 * So stage 1 below now takes the entity id directly where OSM has one and only
 * falls back to resolving an article. Nothing else about the method changed;
 * every filter here was paid for in review and is kept exactly.
 *
 * 1,099 of the 4,193 peaks carried OSM's `wikipedia` tag in their `w` field —
 * `fr:Mont Blanc`, `de:Watzmann`. That names an EXACT ARTICLE, which is the
 * whole opportunity: a human editor chose that article's images knowing what
 * the article was about. This script uses nothing else. It never asks "what is
 * photographed near this coordinate", because the answer to that question is
 * how the deleted system produced a village footbridge for Piz d'Esan and a
 * lake for Cima Rossa. Sub-kilometre proximity does not identify an Alpine
 * summit; ridges carry many named tops inside a kilometre.
 *
 * Two candidates come out of the article, and they are NOT equally good:
 *
 *   P18   Wikidata's "image" statement. A curated claim: an editor asserted
 *         "this is a picture of this thing". Preferred.
 *   LEAD  Wikipedia's `pageimages`. A LAYOUT HEURISTIC — the extension scores
 *         candidates on size, position and aspect ratio and "has no idea what
 *         is in the picture". On a stub the winner is the infobox locator map,
 *         which is why 47 of these peaks currently render a relief map of
 *         Italy or Austria captioned as the mountain. Used only as a fallback,
 *         and filtered hard.
 *
 * ---------------------------------------------------------------------------
 * THE GATE THAT DOES THE REAL WORK: CORROBORATION
 * ---------------------------------------------------------------------------
 *
 * Measured on this data, splitting candidates by whether the filename repeats
 * the subject's name: corroborated candidates are right about 87.5% of the
 * time (n=24), non-corroborated ones about 34.8% (n=23). The failures in the
 * second group are exactly the catalogue TrailPlate was written to end — a
 * village, a lake, a hut, a flatly different mountain.
 *
 * So a candidate ships only if the filename repeats a DISTINCTIVE word of the
 * peak's name or of its article's title. `Pizzo Canciano` illustrated with
 * `Piz Scalino 2008.jpg` fails; `Dufourspitze` via `it:Punta Dufour` matching
 * `Dufourspitze.jpg` passes on the article title.
 *
 * This deliberately throws away good images. `fr:Dent du Géant` leads with
 * `Dente_del_Gigante.JPG` — correct, in Italian, and dropped, because the
 * filter cannot tell that from the wrong-mountain cases. Fewer photographs,
 * all of them of this summit, is the trade the trek set already made.
 *
 * On top of corroboration sit the rejections corroboration cannot make:
 *
 *   QUALIFIER CONFLICT   `Motta di Pleté Orientale` was being illustrated with
 *                        `Motta di Pleté occidentale.JPG` — the wrong twin
 *                        summit, and perfectly corroborated. Directional, size
 *                        and position qualifiers are therefore read out of both
 *                        names and required not to contradict. This also stops
 *                        `Kleiner Hafner` being given `Großer Hafner`.
 *   NOT A PHOTOGRAPH     maps, diagrams, coats of arms, portraits, statues,
 *                        plaques, stamps, book plates, engravings. `Torre di
 *                        Brenta` led with `Torre di Brenta, Compton.jpg` — a
 *                        19th-century pen-and-ink drawing by the alpine artist
 *                        E. T. Compton, which passes every other test.
 *   OLD PUBLIC DOMAIN    `public/img/CREDITS.md` warns that "a public-domain
 *                        mountaineering image is almost always old ARTWORK".
 *                        A bare-PD file dated before 1940 is refused.
 *   HOW COMMONS FILED IT  the categories are a second opinion the filename does
 *                         not give: `Mont Taou Blanc.jpg` is perfectly named
 *                         and sits in "Summit crosses in Aosta Valley".
 *
 * ---------------------------------------------------------------------------
 * AND THEN SOMEBODY LOOKS AT ALL OF THEM
 * ---------------------------------------------------------------------------
 *
 * Measured on this harvest, 2026-09-08. A random 40 of the machine-filtered
 * set were reviewed as a contact sheet and 4 were wrong — 10%. Every one of
 * the four taught the filter something (a revolving restaurant, an annotated
 * panorama, a summit that the filename could not distinguish from its twin, a
 * peak illustrated by its parent massif), and after those fixes a fresh random
 * 20 were all correct.
 *
 * All 608 survivors were then reviewed, and 28 more failed — 4.6%. That
 * residue is not a filter that needs tuning; it is the part no API can see:
 * six annotated panoramas with peak names lettered across the sky, two
 * 19th-century printed plates, a topographic map saved as a PNG, wooden
 * crosses, lift stations, a stone barn, a chapel, a hiker, a stream. Exactly
 * the list `src/treks/credits.ts` predicted. They live in
 * `scripts/peak-photo-rejects.json`, keyed by Commons file name, and this
 * script honours that file forever.
 *
 * WHAT THE EYE STILL CANNOT CATCH, and the reason not to call this verified:
 * a photograph of a plausible-looking Alpine summit that is actually the
 * neighbouring one. Nothing in this pipeline can see that, so the claim it
 * makes is narrower than it looks — an article or entity says this file is
 * this mountain, the filename agrees, the licence permits it, and a person
 * confirmed it is a photograph of a mountain rather than a map, a hut or a
 * drawing.
 *
 * ---------------------------------------------------------------------------
 * LICENSING
 * ---------------------------------------------------------------------------
 *
 * ICEFALL is a commercial product. Every kept image must have, recorded:
 * the peak it belongs to, the source URL, the author, the licence, and the
 * article or entity it came from. Missing any one of the five and it is
 * dropped — including the author, even for CC0 where attribution is not owed,
 * because a credits row with a hole in it is how an unattributed CC BY file
 * gets shipped later.
 *
 * Non-commercial and no-derivatives licences are refused. So is GFDL-only:
 * it requires the full licence text to travel with the work, which an app
 * cannot do. So is anything carrying a `Restrictions` flag.
 *
 * ---------------------------------------------------------------------------
 * STORAGE — AN INDEX OF COMMONS URLS BY DEFAULT, LOCAL FILES ON REQUEST
 * ---------------------------------------------------------------------------
 *
 * The Alpine harvest this grew from downloaded every survivor into
 * `public/img/peaks/` — 580 files, a contact sheet a person could review.
 * The worldwide catalogue resolves tens of thousands of entities, and at the
 * 800 px, quality-68 JPEG used here the one file already on disk weighs
 * 151 KB. Ten thousand of those is ~1.5 GB in a repository whose entire
 * image directory is 84 MB. That is not a deployment.
 *
 * So the default output is the INDEX ALONE: for every peak that passes, the
 * Commons thumbnail URL the API rendered at `iiurlwidth`, the photographer,
 * the licence, the file title and the entity or article that vouched for the
 * subject. The app loads the photograph from Commons at view time — the same
 * host the live resolver already uses, and the service worker already caches
 * `upload.wikimedia.org` for offline (`vite.config.ts`). Every filter in
 * this file runs identically in both modes; only the last step differs.
 *
 * `--download` restores the local-file behaviour, for a review pass or a
 * subset. In that mode a file on disk is what the index points at.
 *
 * WHAT THIS COSTS, SAID PLAINLY: the contact-sheet review that caught 28 of
 * 608 Alpine survivors (4.6%) cannot be repeated by eye across the world set
 * in one sitting. Entries a person has looked at carry `r: 1` in the index,
 * from `scripts/peak-photo-reviewed.json`; the rest passed the machine
 * filters only, and the index says so by omission of that flag.
 *
 * ---------------------------------------------------------------------------
 * POLITENESS
 * ---------------------------------------------------------------------------
 *
 * One request at a time, a floor of 220 ms between them, a real User-Agent
 * naming the project and a contact address as
 * https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
 * requires, and `Retry-After` honoured on 429/503. Every API response is
 * cached to `.harvest-cache/`, so a re-run costs nothing but the downloads it
 * has not already done, and an interrupted run resumes where it stopped.
 *
 * Thumbnails are requested from the API at the width we want (`iiurlwidth`).
 * Never construct an `upload.wikimedia.org/.../NNNpx-` URL by hand: only the
 * buckets the API has already rendered are served, and the rest return 400.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const PEAKS = join(APP, "public/data/peaks.json");
const OUT_DIR = join(APP, "public/img/peaks");
const CACHE_DIR = join(APP, ".harvest-cache/peak-photos");
const INDEX_OUT = join(APP, "public/data/peak-photos.json");
const REJECTS = join(HERE, "peak-photo-rejects.json");
/** Commons file titles a person has looked at and accepted. Add, never prune. */
const REVIEWED = join(HERE, "peak-photo-reviewed.json");

const UA =
  "IcefallPeakHarvest/1.0 (https://github.com/Chrispapado06/icefall; icefallapp@gmail.com) node/" +
  process.versions.node;

/** Wide enough for a full-bleed card on a 2x phone screen, and no wider. */
const IMAGE_WIDTH = 800;
const JPEG_QUALITY = 68;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LIMIT = Number(value("limit", "0")) || 0;
const REFRESH = flag("refresh");
const REPORT_ONLY = flag("report");
const DOWNLOAD = flag("download");

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

/* -------------------------------------------------------------------------- */
/* Polite HTTP                                                                */
/* -------------------------------------------------------------------------- */

const MIN_GAP_MS = 220;
let lastRequest = 0;
let requestCount = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url, { binary = false, attempt = 0 } = {}) {
  const wait = MIN_GAP_MS - (Date.now() - lastRequest);
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  requestCount += 1;

  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: binary ? "*/*" : "application/json" },
    });
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(2000 * (attempt + 1));
    return politeFetch(url, { binary, attempt: attempt + 1 });
  }

  if (res.status === 429 || res.status === 503 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`HTTP ${res.status} after ${attempt} retries`);
    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(60000, 2000 * 2 ** attempt);
    process.stdout.write(`\n  ${res.status} — backing off ${Math.round(backoff / 1000)}s\n`);
    await sleep(backoff);
    return politeFetch(url, { binary, attempt: attempt + 1 });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/* -------------------------------------------------------------------------- */
/* Cache — one JSON file per stage, so a re-run refetches nothing             */
/* -------------------------------------------------------------------------- */

function loadCache(name) {
  const path = join(CACHE_DIR, `${name}.json`);
  if (REFRESH || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}
/*
 * ATOMIC, for the same reason `harvest-peak-facts.mjs` gives: `loadCache`
 * returns `{}` for a file that will not parse, so a kill landing inside a
 * plain `writeFileSync` — this run was stopped mid-stage once already, on
 * 2026-09-10 at 19:03, with 19,648 of 33,488 labels fetched — would have
 * turned a truncated cache into a silent restart of the whole stage. Write
 * beside the file and rename: the cache is the old file or the new one, never
 * half of either.
 */
function saveCache(name, data) {
  const dest = join(CACHE_DIR, `${name}.json`);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), "utf8");
  renameSync(tmp, dest);
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

/** Fold to bare lowercase letters and digits. Underscores are NOT word gaps
 *  to a regex `\b`, which is why every filter here normalises first: `\brelief\b`
 *  does not match `Italy_relief_location_map`, and all 47 relief maps sailed
 *  through the filter that was supposed to stop them. */
const fold = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ß]/g, "ss")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .toLowerCase();

/** Words, with punctuation and underscores treated as gaps. */
const words = (s) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** One run-together string — matches across the compounding German does. */
const compact = (s) => fold(s).replace(/[^a-z0-9]+/g, "");

/**
 * Words that name a KIND of mountain rather than THIS mountain. "Piz", "Cima",
 * "Spitze" and "Punta" identify nothing: half the catalogue starts with one.
 */
const GENERIC = new Set([
  "mont", "monte", "mount", "montagne", "montagna", "berg", "bergen", "monti",
  "piz", "pizzo", "pizzi", "punta", "pointe", "point", "pic", "peak", "cima",
  "cime", "corno", "cresta", "croda", "torre", "testa", "tete", "dent", "dents",
  "aiguille", "aiguilles", "becca", "roche", "rocher", "rocca", "sasso", "sass",
  "spitz", "spitze", "spitzen", "kogel", "kopf", "koepfl", "kofel", "wand",
  "eck", "joch", "horn", "hoerner", "gipfel", "huegel", "hugel", "kuppe",
  "col", "colle", "passo", "pass", "sella", "forcella", "scharte", "kar",
  "monts", "massif", "massiccio", "gruppe", "kette", "grat", "kamm", "ridge",
  "di", "de", "del", "della", "delle", "dei", "degli", "da", "das", "der",
  "die", "den", "des", "du", "dos", "la", "le", "les", "il", "lo", "gli", "el",
  "am", "im", "in", "auf", "an", "zum", "zur", "von", "vom", "and", "of", "the",
  "et", "e", "y", "a", "al", "alla", "allo",
]);

/**
 * Qualifiers that distinguish two summits sharing a name, mapped to a family
 * and a symbol. Two names conflict when they use the same family and no
 * symbol in common — which is how `Motta di Pleté Orientale` stops being
 * illustrated with `Motta di Pleté occidentale.JPG`.
 */
const QUALIFIER_SPELLINGS = {
  // east / west
  orientale: "EW:E", orientali: "EW:E", oriental: "EW:E", est: "EW:E", east: "EW:E",
  eastern: "EW:E", ost: "EW:E", östlich: "EW:E", östliche: "EW:E", östlicher: "EW:E",
  oestlich: "EW:E", oestliche: "EW:E", oestlicher: "EW:E",
  occidentale: "EW:W", occidentali: "EW:W", occidental: "EW:W", ovest: "EW:W",
  west: "EW:W", western: "EW:W", westlich: "EW:W", westliche: "EW:W", westlicher: "EW:W",
  // north / south
  settentrionale: "NS:N", nord: "NS:N", north: "NS:N", northern: "NS:N",
  nördlich: "NS:N", nördliche: "NS:N", nördlicher: "NS:N",
  noerdlich: "NS:N", noerdliche: "NS:N", noerdlicher: "NS:N",
  meridionale: "NS:S", sud: "NS:S", south: "NS:S", southern: "NS:S", süd: "NS:S",
  südlich: "NS:S", südliche: "NS:S", südlicher: "NS:S",
  sued: "NS:S", suedlich: "NS:S", suedliche: "NS:S", suedlicher: "NS:S",
  // big / small
  grande: "SZ:B", grand: "SZ:B", gran: "SZ:B", großer: "SZ:B", große: "SZ:B",
  großes: "SZ:B", groß: "SZ:B", großen: "SZ:B",
  grosser: "SZ:B", grosse: "SZ:B", grosses: "SZ:B", gross: "SZ:B", grossen: "SZ:B",
  great: "SZ:B", maggiore: "SZ:B",
  piccolo: "SZ:S", piccola: "SZ:S", petit: "SZ:S", petite: "SZ:S", kleiner: "SZ:S",
  kleine: "SZ:S", kleines: "SZ:S", klein: "SZ:S", kleinen: "SZ:S", minore: "SZ:S",
  // upper / lower / front / back
  superiore: "PO:U", ober: "PO:U", obere: "PO:U", oberer: "PO:U", oberes: "PO:U",
  upper: "PO:U", haut: "PO:U", haute: "PO:U", alto: "PO:U", alta: "PO:U",
  inferiore: "PO:L", unter: "PO:L", untere: "PO:L", unterer: "PO:L", unteres: "PO:L",
  lower: "PO:L", bas: "PO:L", basso: "PO:L", bassa: "PO:L",
  vorder: "PO:F", vordere: "PO:F", vorderer: "PO:F", vorderes: "PO:F",
  hinter: "PO:R", hintere: "PO:R", hinterer: "PO:R", hinteres: "PO:R",
  // middle — its own family, because a "Centrale" summit is not resolved by
  // knowing that the file is not the eastern one.
  centrale: "CT:C", central: "CT:C", centro: "CT:C", mediana: "CT:C",
  middle: "CT:C", mittel: "CT:C", mittlere: "CT:C", mittlerer: "CT:C",
  mitte: "CT:C", milieu: "CT:C",
  // high / low — a real distinguishing pair (Hoher vs Niederer Dachstein),
  // not decoration.
  hoch: "PO:U", hohe: "PO:U", hoher: "PO:U", hohes: "PO:U", hohen: "PO:U",
  nieder: "PO:L", niedere: "PO:L", niederer: "PO:L", niederes: "PO:L",
  /*
   * German writes the qualifier INTO the noun. `Parstleswand Westgipfel` was
   * given `ParstleswandFromE.JPG` because "westgipfel" is one token and the
   * table only knew the free-standing "west" — so the peak counted as
   * unqualified and a photograph of the massif from the east stood in for its
   * western top.
   */
  westgipfel: "EW:W", westspitze: "EW:W", westkopf: "EW:W",
  ostgipfel: "EW:E", ostspitze: "EW:E", ostkopf: "EW:E",
  nordgipfel: "NS:N", nordspitze: "NS:N", nordkopf: "NS:N",
  südgipfel: "NS:S", suedgipfel: "NS:S", südspitze: "NS:S", suedspitze: "NS:S",
  mittelgipfel: "CT:C", mittelspitze: "CT:C",
  vorgipfel: "PO:F", hauptgipfel: "PO:U",
};

/**
 * THE KEYS ARE FOLDED, NOT WRITTEN OUT FOLDED.
 *
 * `words()` strips diacritics, so `Südliche Sexegertenspitze` arrives here as
 * "sudliche" — and the first version of this table only listed the "suedliche"
 * transliteration. The lookup therefore missed, the peak counted as unqualified,
 * and it shipped `Sexegertenspitze and other mountains.jpg`: a cirque of summits
 * with no way to tell which one is the southern top. Caught in the review pass.
 * Folding the keys through the same function that folds the text is the only
 * version of this that cannot drift.
 */
const QUALIFIERS = Object.fromEntries(
  Object.entries(QUALIFIER_SPELLINGS).map(([k, v]) => [fold(k).replace(/[^a-z0-9]/g, ""), v]),
);

function qualifiers(text) {
  const out = new Map();
  for (const w of words(text)) {
    const q = QUALIFIERS[w];
    if (!q) continue;
    const [family, symbol] = q.split(":");
    if (!out.has(family)) out.set(family, new Set());
    out.get(family).add(symbol);
  }
  return out;
}

/**
 * Whether this filename can be said to show THIS summit rather than its twin.
 *
 * A qualifier in the peak's name — Orientale, Centrale, Kleiner, Vordere — is
 * there because the mountain shares its name with another top on the same
 * ridge. Two things then have to hold, and the second is the one that was
 * missed on the first run:
 *
 *   CONTRADICTION   `Motta di Pleté Orientale` given `Motta di Pleté
 *                   occidentale.JPG`, or `Kleiner Hafner` given the Großer.
 *   SILENCE         `Breithorn Centrale` AND `Breithorn Orientale / Ostgipfel`
 *                   were both handed `Breithorn002.JPG`. One file, two summits,
 *                   at most one of them right — and nothing in the filename
 *                   says which. A photograph that does not distinguish the
 *                   twins is not a photograph of either.
 *
 * So a qualified peak requires a filename qualified the same way. This costs
 * real coverage — `Breithorn.jpg` is dropped from the Westgipfel, which is the
 * main summit and almost certainly what it shows — and that is the trade the
 * plate exists to make.
 */
function qualifierConflict(peakName, fileName) {
  const a = qualifiers(peakName);
  const b = qualifiers(fileName);
  for (const [family, mine] of a) {
    const theirs = b.get(family);
    if (!theirs) return `${family} ${[...mine]} — filename says nothing`;
    if (![...mine].some((s) => theirs.has(s))) return `${family} ${[...mine]} vs ${[...theirs]}`;
  }
  return null;
}

/** The words in a name that actually identify it. */
function distinctive(name) {
  return words(name).filter((w) => !GENERIC.has(w) && !QUALIFIERS[w] && w.length >= 4);
}

/**
 * Does this filename repeat the subject's name?
 *
 * The measured difference between candidates that do and candidates that do
 * not is 87.5% correct against 34.8%. Either the peak's own name or its
 * article's title may corroborate: OSM calls one summit `Dufourspitze` and
 * links it to `it:Punta Dufour`, and `Dufourspitze.jpg` is a photograph of it
 * under either name.
 */
/** `Hoher Weißzint - Punta Bianca`, `Pointe de Rome / Punta Roma`: one summit,
 *  two languages, one string. Either name may corroborate. */
function nameVariants(name) {
  return String(name)
    .split(/\s*[/|]\s*|\s+[-–—]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * THE HEAD NOUN, NOT ANY WORD.
 *
 * The first version accepted a filename containing ANY distinctive word of the
 * peak's name, and `Punta Nera della Grivola` therefore shipped `Grivola con
 * vette.jpg` — an annotated panorama of the whole Grivola, with the Punta Nera
 * one of six labels pointing into it. "Grivola" is in the peak's name, so the
 * check passed; it is the PARENT the peak belongs to, so the photograph is of
 * something else.
 *
 * A subsidiary summit is almost always named `<its own name> di/della/de
 * <parent>`, which means the word that identifies it comes FIRST and the
 * parent's name comes last. Requiring the first distinctive word separates the
 * two: `Punta Nera …` needs "nera", `Punta Pousset` needs "pousset".
 */
function corroborates(fileName, names) {
  const file = compact(fileName);
  for (const name of names) {
    if (!name) continue;
    for (const variant of nameVariants(name)) {
      const whole = compact(variant);
      if (whole && file.includes(whole)) return true;
      const head = distinctive(variant)[0];
      if (head && file.includes(head)) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Subject rejections                                                         */
/* -------------------------------------------------------------------------- */

/** Not a photograph of anything: cartography, heraldry, paper. */
const NOT_A_PHOTOGRAPH = [
  // maps and diagrams
  "map", "maps", "karte", "karten", "landkarte", "reliefkarte", "mappa", "mapa",
  "carte", "kaart", "locator", "location", "topo", "topographic", "topografica",
  "diagram", "diagramm", "schema", "schematic", "profile", "profil", "querschnitt",
  "section", "plan", "grundriss", "chart", "legend", "isohypse", "hillshade",
  "orthophoto", "landsat", "sentinel", "dem", "srtm",
  // heraldry and marks
  "wappen", "coa", "arms", "blason", "escudo", "stemma", "flag", "flagge",
  "bandiera", "drapeau", "logo", "emblem", "siegel", "seal",
  // paper and reproduction
  "stamp", "briefmarke", "francobollo", "postcard", "ansichtskarte", "cartolina",
  "poster", "plakat", "titelblatt", "frontispiece", "titlepage", "buchcover",
  "manuscript", "handschrift", "urkunde", "document", "dokument", "scan",
  "engraving", "stich", "kupferstich", "holzschnitt", "woodcut", "lithograph",
  "lithographie", "litografia", "lithographie", "radierung", "etching",
  "painting", "gemaelde", "dipinto", "peinture", "aquarell", "watercolor",
  "watercolour", "acquerello", "zeichnung", "drawing", "dessin", "disegno",
  "sketch", "skizze", "illustration", "grafik", "graphic",
  // named alpine painters whose plates are on Commons as PD and read as photos
  // in a filename: "Torre di Brenta, Compton.jpg" is a pen-and-ink drawing.
  "compton", "loppe", "calame",
  // people and objects named after the mountain
  "portrait", "portraet", "ritratto", "selfie", "bust", "bueste", "statue",
  "denkmal", "monument", "memorial", "plaque", "gedenktafel", "targa",
  "grave", "grab", "tomb", "friedhof", "cemetery",
  /*
   * ON the mountain, not OF it.
   *
   * `Pizzo Ligoncio` shipped "Summit cross of Pizzo Ligoncio, Lombardia,
   * Italia.jpg" — a wrought-iron cross on a pile of rock against the sky. It
   * corroborates perfectly, it is genuinely up there, and as the picture of a
   * mountain it tells the reader nothing about the mountain. The same is true
   * of a shot of the final scree slope: `Fenneregg - Schlussanstieg.JPG` is
   * the ground under the photographer's boots.
   *
   * "kreuz" is safe as a WORD because `words()` splits on punctuation only:
   * `Kreuzspitze` is the single token "kreuzspitze" and is untouched.
   */
  "cross", "kreuz", "gipfelkreuz", "croce", "croix", "cruz", "crocifisso",
  "anstieg", "aufstieg", "abstieg", "schlussanstieg", "ascent", "descent",
  "klettersteig", "ferrata", "klettern", "abseil", "rappel",
  /*
   * Buildings and installations ON the mountain. `Mittelallalin` shipped
   * "Drehrestaurant Mittelallalin.jpg" — a revolving restaurant sitting in the
   * snow, correctly named, correctly filed, and a photograph of a building.
   * This costs genuine frames: "Matterhorn von der Hörnlihütte" is a picture
   * of the Matterhorn and is dropped with the rest. The exemption below keeps
   * a peak whose own name contains one of these words.
   */
  "restaurant", "drehrestaurant", "hotel", "gasthaus", "museum", "bahnhof",
  "station", "bergstation", "talstation", "seilbahn", "gondel", "sessellift",
  "lift", "huette", "hutte", "hut", "rifugio", "refuge", "cabane", "biwak",
  "bivacco", "bivouac", "kapelle", "chapel", "chapelle", "kirche", "chiesa",
  "church", "sternwarte", "observatory", "observatorium", "antenne", "sendemast",
  "turm", "tower",
];

const NOT_A_PHOTOGRAPH_SET = new Set(NOT_A_PHOTOGRAPH);

/**
 * Words that, WHEN THEY LEAD THE FILENAME, mean the file is named after
 * something that is not the mountain — the pass below it, the hut on it, the
 * valley it stands over. `Monte Gavia` was given `Passo del Gavia.jpg` (a
 * refuge and its car park) and `Cima di Entrelor` was given `Vallone
 * d'Entrelor` (a valley), both corroborated, both about the place rather than
 * the peak.
 *
 * Only the LEADING word counts. "Piz Palü vom Passo Bernina" names the
 * mountain first and is a photograph of it; "Passo del Gavia" is not.
 */
const LEADING_NOT_THE_PEAK = new Set([
  "passo", "pass", "col", "colle", "joch", "scharte", "sattel", "furka",
  "forcella", "vallone", "vallon", "valle", "val", "vallée", "tal", "conca",
  "lago", "laghi", "lac", "lai", "see", "lake", "seen",
  "alpe", "alp", "alm", "malga", "baita", "grange", "chalet", "casera",
  "rifugio", "hutte", "huette", "capanna", "cabane", "refuge", "biwak",
  "borgo", "paese", "dorf", "village", "ville", "stadt", "citta",
  "kirche", "chiesa", "chapelle", "kapelle", "bahnhof", "station", "hotel",
  "restaurant", "museo", "museum", "gletscher", "ghiacciaio", "glacier",
  "kees", "ferner", "blick", "aussicht", "vista",
  /* NOT "panorama": "Panorama of Mont Blanc du Tacul, Mont Maudit and Mont
     Blanc from the Aiguille du Midi" is exactly what a card wants, and it was
     the only photograph Mont Blanc had. */
]);

function subjectRejection(fileName, peakName = "") {
  /* A peak actually called Hüttenkopf or Kreuzspitze must not be rejected for
     saying so. Its own name is never evidence about the photograph. */
  const own = compact(peakName);
  const mine = (w) => own.includes(w);
  const list = words(fileName);
  for (const w of list) {
    if (NOT_A_PHOTOGRAPH_SET.has(w) && !mine(w)) return `filename says "${w}"`;
  }
  const lead = list.find((w) => !/^\d+$/.test(w));
  if (lead && LEADING_NOT_THE_PEAK.has(lead) && !own.includes(lead)) {
    return `filename leads with "${lead}", so it is named after somewhere else`;
  }

  // Compounds: German runs the word in, e.g. "Alpenvereinskarte", "Uebersichtskarte".
  const joined = compact(fileName);
  for (const w of [
    "karte", "wappen", "gemaelde", "reliefkarte", "panoramakarte", "skizze",
    "gipfelkreuz", "schlussanstieg", "summitcross",
    "restaurant", "bahnhof", "seilbahn", "bergstation", "rifugio", "sternwarte",
    /* NOT "telecabine"/"telesiege": tried, and it cost the Mont Blanc du Tacul,
       Pointe Whymper and Pointe Marguerite their photographs. A lift in the
       filename usually says where the photographer STOOD, not what is in the
       frame. The one case it was meant to catch — cables strung across the
       Gros Rognon — is in peak-photo-rejects.json, where a judgement about
       one image belongs. */
    "grange",
  ]) {
    if (joined.includes(w) && !own.includes(w)) return `filename compounds "${w}"`;
  }
  return null;
}

/**
 * What OTHER people filed this photograph as.
 *
 * The filename is chosen by one uploader and is often silent. The categories
 * are added by many, and they say things the filename does not:
 * `Mont Taou Blanc.jpg` is a perfectly named file whose categories include
 * "Summit crosses in Aosta Valley" — because it is a picture of the cross on
 * top, with the view behind it. `Grivola con vette.jpg` reads as a photograph
 * until its own description says "con l'indicazione delle vette vicine": it is
 * a panorama with the summits labelled in yellow over the sky.
 *
 * This is a second, independent opinion on the subject, and it is free — the
 * same request already returns it.
 */
const CATEGORY_REJECT =
  /summit cross|gipfelkreuz|croci? di vetta|croix de sommet|annotated|beschriftet|labell?ed|maps? of|karten|diagram|coats? of arms|wappen|paintings|gem[äa]lde|drawings|zeichnungen|engravings|lithograph|postcards|ansichtskarten|stamps of|briefmarken|huts? in|h[üu]tten in|mountain huts|refuges|rifugi|restaurants|cable cars|seilbahnen|aerial tramways|funiculars|railway stations|chapels|kapellen|churches|kirchen|memorials|denkm[äa]ler|statues|gravestones/i;

const DESCRIPTION_REJECT =
  /\bannotat|beschriftet|beschriftung|indicazione delle vette|con i nomi|con nomi|with the names|with names labell?ed|labell?ed panorama|nomi delle cime/i;

function metadataRejection(info) {
  for (const cat of info.categories ?? []) {
    const m = CATEGORY_REJECT.exec(cat);
    if (m) return `Commons files it under "${cat}"`;
  }
  const desc = strip(info.meta?.ImageDescription?.value);
  if (DESCRIPTION_REJECT.test(desc)) return `its own description says "${desc.slice(0, 60)}"`;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Licence                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * "No machine-readable author provided. Rubenfr assumed (based on copyright
 * claims)." is what Commons writes into the Artist field when the uploader
 * did not fill it, and 111 rows of the first world harvest carried it
 * verbatim into the caption. It is reduced to the name Commons itself
 * assumed — the attribution Commons displays for the file. A row with no
 * name at all is still rejected below ("no author recorded").
 */
const ASSUMED_AUTHOR =
  /^No machine-readable author provided\.\s*(.+?)\s+assumed\s*\(based on copyright claims\)\.?$/i;

const strip = (html) => {
  const text = (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const assumed = ASSUMED_AUTHOR.exec(text);
  return assumed ? assumed[1] : text;
};

/**
 * Commercial use, or it does not ship.
 *
 * Commons policy already says "Commercial use of the work must be allowed",
 * and a sweep of the files behind this catalogue found no NC and no ND. The
 * check stays in the pipeline permanently anyway: en.wikipedia hosts non-free
 * fair-use files locally, and a licence that is fine for an encyclopedia is
 * not automatically fine for a product.
 */
function licenceVerdict(meta) {
  const short = strip(meta.LicenseShortName?.value);
  const code = fold(strip(meta.License?.value));
  const terms = fold(strip(meta.UsageTerms?.value));
  const restrictions = strip(meta.Restrictions?.value);
  const blob = `${fold(short)} ${code} ${terms}`;

  if (!short && !code) return { ok: false, reason: "no licence recorded" };
  if (restrictions) return { ok: false, reason: `restricted: ${restrictions.slice(0, 40)}` };
  if (/\bnc\b|non-?commercial|noncommercial/.test(blob)) return { ok: false, reason: "non-commercial" };
  if (/\bnd\b|no-?deriv/.test(blob)) return { ok: false, reason: "no-derivatives" };
  if (/fair use|non-?free|all rights reserved|copyright(ed)? by|unfree/.test(blob))
    return { ok: false, reason: "not free" };
  // GFDL wants the full licence text carried with the work. An app cannot.
  // Dual-licensed files name the CC option too, and those are fine.
  if (/gfdl|gnu free documentation/.test(blob) && !/\bcc[\s-]/.test(blob) && !/public domain|cc0/.test(blob))
    return { ok: false, reason: "GFDL-only" };

  const free =
    /^cc0/.test(code) ||
    /^cc-by(-sa)?-[1-4]/.test(code) ||
    /^pd|^public/.test(code) ||
    /cc0|cc by|cc-by|public domain|copyrighted free use|attribution/.test(blob);
  if (!free) return { ok: false, reason: `unrecognised licence "${short || code}"` };

  return { ok: true, license: short || strip(meta.License?.value) };
}

/** A bare-PD mountaineering image from before 1940 is almost always artwork. */
function oldPublicDomain(meta, license) {
  if (!/public domain|^pd|cc0/i.test(license)) return null;
  const raw = strip(meta.DateTimeOriginal?.value) || strip(meta.DateTime?.value);
  const year = /(1[6-9]\d\d|20\d\d)/.exec(raw)?.[1];
  if (!year) return null;
  return Number(year) < 1940 ? `public domain, dated ${year}` : null;
}

/* -------------------------------------------------------------------------- */
/* Stage 1 — the articles                                                     */
/* -------------------------------------------------------------------------- */

function parseTag(tag) {
  const m = /^([a-z-]{2,12}):(.+)$/i.exec(String(tag || "").trim());
  if (!m) return null;
  const title = m[2].trim();
  return title ? { lang: m[1].toLowerCase(), title } : null;
}

function titleResolver(query) {
  const alias = new Map();
  for (const n of query.normalized ?? []) alias.set(n.from, n.to);
  for (const r of query.redirects ?? []) alias.set(r.from, r.to);
  return (title) => {
    let cur = title;
    for (let i = 0; i < 5 && alias.has(cur); i++) cur = alias.get(cur);
    return cur;
  };
}

async function resolveArticles(peaks, cache) {
  const byLang = new Map();
  for (const p of peaks) {
    const tag = parseTag(p.w);
    if (!tag) continue;
    if (cache[`${tag.lang}:${tag.title}`]) continue;
    if (!byLang.has(tag.lang)) byLang.set(tag.lang, new Set());
    byLang.get(tag.lang).add(tag.title);
  }

  for (const [lang, set] of byLang) {
    const titles = [...set];
    for (let i = 0; i < titles.length; i += 40) {
      const chunk = titles.slice(i, i + 40);
      const url =
        `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=1&redirects=1` +
        "&prop=pageimages|pageprops&ppprop=wikibase_item&piprop=thumbnail|name&pithumbsize=1200" +
        `&titles=${encodeURIComponent(chunk.join("|"))}`;
      const json = await politeFetch(url);
      const pages = Object.values(json.query?.pages ?? {});
      const byTitle = new Map(pages.map((p) => [p.title, p]));
      const back = titleResolver(json.query ?? {});
      for (const t of chunk) {
        const page = byTitle.get(back(t)) ?? null;
        cache[`${lang}:${t}`] = page && page.pageid
          ? {
              title: page.title,
              qid: page.pageprops?.wikibase_item ?? null,
              lead: page.pageimage ? page.pageimage.replace(/_/g, " ") : null,
            }
          : { missing: true };
      }
      process.stdout.write(
        `\r  articles ${lang}: ${Math.min(i + 40, titles.length)}/${titles.length}   `,
      );
      saveCache("articles", cache);
    }
    process.stdout.write("\n");
  }
  return cache;
}

/* -------------------------------------------------------------------------- */
/* Stage 2 — Wikidata P18, in bulk                                            */
/* -------------------------------------------------------------------------- */

async function resolveP18(qids, cache) {
  const todo = qids.filter((q) => !(q in cache));
  for (let i = 0; i < todo.length; i += 300) {
    const chunk = todo.slice(i, i + 300);
    const sparql =
      "SELECT ?item ?img WHERE { VALUES ?item {" +
      chunk.map((q) => `wd:${q}`).join(" ") +
      "} ?item wdt:P18 ?img . }";
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
    const json = await politeFetch(url);
    for (const q of chunk) cache[q] = null;
    for (const row of json.results?.bindings ?? []) {
      const qid = row.item.value.split("/").pop();
      const file = decodeURIComponent(row.img.value.split("/").pop()).replace(/_/g, " ");
      if (!cache[qid]) cache[qid] = file;
    }
    process.stdout.write(`\r  wikidata P18: ${Math.min(i + 300, todo.length)}/${todo.length}   `);
    saveCache("p18", cache);
  }
  if (todo.length) process.stdout.write("\n");
  return cache;
}

/**
 * Stage 2b — every name Wikidata knows the entity by.
 *
 * OSM's tag sometimes points at an article with a DIFFERENT NAME, and that is
 * usually correct rather than wrong: `Dufourspitze` is tagged `it:Punta
 * Dufour`, `Piz Faschalba` is tagged `de:Grenzeckkopf`, and Wikidata carries
 * both names on one item in each case. So a filename that names the article
 * but not the peak is fine — PROVIDED the entity agrees that the peak's name
 * is one of its names. Where it does not, the only thing linking this
 * photograph to this summit is a single OSM tag nobody has corroborated, and
 * that is not enough to put a photographer's name under.
 */
async function resolveLabels(qids, cache) {
  const todo = qids.filter((q) => !(q in cache));
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&formatversion=2" +
      `&props=labels|aliases&ids=${chunk.join("|")}`;
    const json = await politeFetch(url);
    for (const q of chunk) cache[q] = [];
    for (const [qid, ent] of Object.entries(json.entities ?? {})) {
      const names = new Set();
      for (const v of Object.values(ent.labels ?? {})) names.add(v.value);
      for (const list of Object.values(ent.aliases ?? {})) for (const v of list) names.add(v.value);
      cache[qid] = [...names];
    }
    process.stdout.write(`\r  wikidata labels: ${Math.min(i + 50, todo.length)}/${todo.length}   `);
    saveCache("labels", cache);
  }
  if (todo.length) process.stdout.write("\n");
  return cache;
}

/** Does the entity accept this as one of its own names? */
function entityKnowsName(names, peakName) {
  const parts = peakName.split("/").map((s) => compact(s)).filter(Boolean);
  for (const label of names) {
    const l = compact(label);
    if (!l) continue;
    for (const p of parts) if (p === l || p.includes(l) || l.includes(p)) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Stage 3 — Commons metadata                                                 */
/* -------------------------------------------------------------------------- */

async function resolveFiles(files, cache) {
  const todo = files.filter((f) => !(f in cache));
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40);
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=1" +
      "&prop=imageinfo|categories&cllimit=200&clshow=!hidden" +
      "&iiprop=url|size|mediatype|extmetadata" +
      "&iiextmetadatafilter=Artist|Credit|LicenseShortName|License|UsageTerms|Restrictions|ObjectName|ImageDescription|DateTimeOriginal|DateTime" +
      `&iiurlwidth=${IMAGE_WIDTH}` +
      `&titles=${encodeURIComponent(chunk.map((f) => `File:${f}`).join("|"))}`;
    const json = await politeFetch(url);
    const pages = Object.values(json.query?.pages ?? {});
    const back = titleResolver(json.query ?? {});
    const byTitle = new Map(pages.map((p) => [p.title, p]));
    for (const f of chunk) {
      const page = byTitle.get(back(`File:${f}`)) ?? byTitle.get(`File:${f}`);
      const info = page?.imageinfo?.[0];
      cache[f] = info
        ? {
            title: page.title.replace(/^File:/, ""),
            mediatype: info.mediatype,
            width: info.width,
            height: info.height,
            thumburl: info.thumburl ?? null,
            url: info.url,
            descriptionurl: info.descriptionurl,
            meta: info.extmetadata ?? {},
            categories: (page.categories ?? []).map((c) =>
              c.title.replace(/^Category:/, ""),
            ),
          }
        : { missing: true };
    }
    process.stdout.write(`\r  commons files: ${Math.min(i + 40, todo.length)}/${todo.length}   `);
    saveCache("files-v2", cache);
  }
  if (todo.length) process.stdout.write("\n");
  return cache;
}

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

function slugify(name) {
  return (
    fold(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "peak"
  );
}

/** Names repeat across the Alps, so the slug carries the coordinate's hash. */
function slugFor(peak) {
  let h = 2166136261;
  for (const ch of `${peak.a.toFixed(4)},${peak.o.toFixed(4)}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `${slugify(peak.n)}-${(h >>> 0).toString(36).slice(0, 5)}`;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

const peaks = JSON.parse(readFileSync(PEAKS, "utf8"));
const QID_RE = /^Q\d+$/;
/** OSM's own entity id, where it has one. The exact link, and the cheap one. */
const qidOfPeak = (p) => (QID_RE.test(p.d ?? "") ? p.d : null);
const tagged = peaks.filter((p) => qidOfPeak(p) || parseTag(p.w));
const scope = LIMIT ? tagged.slice(0, LIMIT) : tagged;

const withQid = tagged.filter(qidOfPeak).length;
const withArticle = tagged.filter((p) => parseTag(p.w)).length;

console.log(`ICEFALL peak photograph harvest`);
console.log(`  ${peaks.length} peaks in the catalogue`);
console.log(`  ${withQid} carry a wikidata id, ${withArticle} a wikipedia tag, ${tagged.length} at least one`);
console.log(`  working on ${scope.length}\n`);

/**
 * THE EYEBALL PASS, WRITTEN DOWN.
 *
 * `src/treks/credits.ts` records why this file has to exist: "No filter
 * catches a map whose filename never says 'map', a bronze plaque with the
 * route etched on it, or an aerial that is really a satellite frame — all
 * three got through and were caught by eye."
 *
 * The same is true here. `Romariswandköpfe.jpg` is correctly named, correctly
 * licensed, correctly categorised, and has six peak names painted across the
 * sky in yellow. Nothing in any API says so. A human looked at every image in
 * this harvest and the ones that failed are listed here BY COMMONS FILE NAME,
 * so a re-run — or a later peak that resolves to the same file — never brings
 * them back. Deleting a line here undoes a review; add, don't prune.
 */
const manualRejects = existsSync(REJECTS)
  ? JSON.parse(readFileSync(REJECTS, "utf8"))
  : {};
const reviewed = new Set(existsSync(REVIEWED) ? JSON.parse(readFileSync(REVIEWED, "utf8")) : []);

const articles = loadCache("articles");
const p18 = loadCache("p18");
const labels = loadCache("labels");
const files = loadCache("files-v2");

if (!REPORT_ONLY) {
  /*
   * Only peaks WITHOUT an entity id need an article resolved, and that is the
   * whole saving: the article round-trip existed to discover a QID that OSM
   * was already carrying for most peaks.
   */
  await resolveArticles(scope.filter((p) => !qidOfPeak(p)), articles);
  saveCache("articles", articles);

  const qids = [
    ...new Set(
      scope
        .map((p) => {
          const own = qidOfPeak(p);
          if (own) return own;
          const tag = parseTag(p.w);
          return tag ? articles[`${tag.lang}:${tag.title}`]?.qid : null;
        })
        .filter(Boolean),
    ),
  ];
  await resolveP18(qids, p18);
  saveCache("p18", p18);
  await resolveLabels(qids, labels);
  saveCache("labels", labels);
}

/*
 * Choose one candidate file per peak: P18 first, article lead second.
 *
 * A peak can arrive by either of two identity links and they are not equally
 * good. OSM's own `wikidata` tag names the ENTITY, and P18 is a claim made on
 * that entity — "this is a picture of this thing" — so the chain is two
 * assertions, both by hand, neither of them about position. The article path
 * is a step longer and its fallback (`pageimages`) is a layout heuristic that
 * "has no idea what is in the picture"; on a stub it returns the infobox
 * locator map, which is how 47 peaks came to be illustrated with a relief map
 * of Italy.
 */
const candidates = [];
const rejected = [];
for (const peak of scope) {
  const tag = parseTag(peak.w);
  const found = tag ? articles[`${tag.lang}:${tag.title}`] : null;
  const article = found && !found.missing ? found : null;

  // OSM's own id wins: it is the shortest path to the entity and needs no
  // article to exist at all.
  const qid = qidOfPeak(peak) ?? article?.qid ?? null;
  const fromP18 = qid ? p18[qid] : null;
  const file = fromP18 || article?.lead || null;

  if (!file) {
    rejected.push({
      peak: peak.n,
      reason: qid ? "entity has no P18 image" : article ? "article has no image" : "no article",
    });
    continue;
  }

  candidates.push({
    peak,
    tag,
    article,
    qid,
    /*
     * Every name this peak is known by, for corroboration. The peak's own name
     * always counts; an article title counts because one summit routinely has
     * two names in two languages (`Dufourspitze` is tagged `it:Punta Dufour`);
     * and for a peak that arrived by entity id alone the entity's own labels
     * and aliases are the equivalent pool. Filled in after the labels load.
     */
    altNames: [article?.title, tag?.title].filter(Boolean),
    file,
    origin: fromP18 ? "wikidata-p18" : "article-lead",
    entity: fromP18
      ? `https://www.wikidata.org/wiki/${qid}`
      : `https://${tag.lang}.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
  });
}

if (!REPORT_ONLY) {
  await resolveFiles([...new Set(candidates.map((c) => c.file))], files);
  saveCache("files-v2", files);
}

/* -------------------------------------------------------------------------- */
/* Filter                                                                     */
/* -------------------------------------------------------------------------- */

const kept = [];
const reasons = new Map();
const note = (reason) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1);

for (const c of candidates) {
  const info = files[c.file];
  if (!info || info.missing) {
    rejected.push({ peak: c.peak.n, file: c.file, reason: "file not on Commons" });
    note("file not on Commons");
    continue;
  }
  const name = info.title;

  if (info.mediatype !== "BITMAP") {
    rejected.push({ peak: c.peak.n, file: name, reason: `mediatype ${info.mediatype}` });
    note("not a bitmap");
    continue;
  }

  /*
   * The peak's own vocabulary, so a summit genuinely called Kreuzspitze or
   * Hüttenkopf is not rejected for saying so. For an entity-only peak the
   * entity's labels stand in for the article title.
   */
  const known = c.qid ? (labels[c.qid] ?? []) : [];
  const alt = c.altNames.length ? c.altNames : known.slice(0, 12);
  const vocabulary = [c.peak.n, ...alt].join(" ");

  const subject = subjectRejection(name, vocabulary);
  if (subject) {
    rejected.push({ peak: c.peak.n, file: name, reason: subject });
    note("not a photograph of a mountain");
    continue;
  }

  if (manualRejects[name]) {
    rejected.push({ peak: c.peak.n, file: name, reason: `reviewed by eye: ${manualRejects[name]}` });
    note("rejected by eye in review");
    continue;
  }

  const filed = metadataRejection(info);
  if (filed) {
    rejected.push({ peak: c.peak.n, file: name, reason: filed });
    note("Commons files it as something other than a photograph of the peak");
    continue;
  }

  const byPeakName = corroborates(name, [c.peak.n]);
  if (!byPeakName && !corroborates(name, alt)) {
    rejected.push({ peak: c.peak.n, file: name, reason: "filename does not name the peak" });
    note("filename does not name the peak");
    continue;
  }

  /*
   * The filename names the ARTICLE but not the PEAK. That is routine and
   * usually right — one summit, two languages — but only Wikidata can say so.
   */
  if (!byPeakName) {
    if (!entityKnowsName(known, c.peak.n)) {
      rejected.push({
        peak: c.peak.n,
        file: name,
        reason: `filename names "${alt[0] ?? "another name"}", and Wikidata does not call this peak that`,
      });
      note("filename names the article, not the peak, and Wikidata does not link the names");
      continue;
    }
  }

  const conflict = qualifierConflict(vocabulary, name);
  if (conflict) {
    rejected.push({ peak: c.peak.n, file: name, reason: `qualifier conflict (${conflict})` });
    note("qualifier conflict — a different summit of the same name");
    continue;
  }

  const licence = licenceVerdict(info.meta);
  if (!licence.ok) {
    rejected.push({ peak: c.peak.n, file: name, reason: licence.reason });
    note(`licence: ${licence.reason}`);
    continue;
  }

  const artwork = oldPublicDomain(info.meta, licence.license);
  if (artwork) {
    rejected.push({ peak: c.peak.n, file: name, reason: artwork });
    note("old public domain — probably artwork");
    continue;
  }

  const artist = strip(info.meta.Artist?.value) || strip(info.meta.Credit?.value);
  if (!artist) {
    rejected.push({ peak: c.peak.n, file: name, reason: "no author recorded" });
    note("no author recorded");
    continue;
  }

  if (!info.thumburl) {
    rejected.push({ peak: c.peak.n, file: name, reason: "no thumbnail rendered" });
    note("no thumbnail rendered");
    continue;
  }

  kept.push({
    ...c,
    slug: slugFor(c.peak),
    id: `osm:${c.peak.a.toFixed(4)},${c.peak.o.toFixed(4)}`,
    fileTitle: name,
    artist: artist.slice(0, 160),
    license: licence.license,
    descUrl:
      info.descriptionurl ||
      `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name.replace(/ /g, "_"))}`,
    thumburl: info.thumburl,
    original: info.url,
  });
}

/**
 * NO PHOTOGRAPH IS USED TWICE — the rule `src/treks/credits.ts` already keeps.
 *
 * 46 files are the lead image for 148 of these peaks. Some of that is
 * legitimate on Commons and dishonest in a card: one frame of the Grandes
 * Jorasses ridge is the article image for all four of its named summits, and
 * `Dôme du Goûter.jpg` serves both Bosses. Corroboration catches most of it,
 * because a subsidiary summit's name is rarely in the massif's filename. What
 * survives is a genuine ambiguity, and the honest reading of one file offered
 * for two peaks is that at most one of them is right and nothing here can say
 * which.
 *
 * The exception is an exact hit: when the file is named after one of the
 * peaks and not the other, that peak keeps it.
 */
const byFile = new Map();
for (const k of kept) {
  if (!byFile.has(k.fileTitle)) byFile.set(k.fileTitle, []);
  byFile.get(k.fileTitle).push(k);
}
const deduped = [];
for (const [fileTitle, group] of byFile) {
  if (group.length === 1) {
    deduped.push(group[0]);
    continue;
  }
  const file = compact(fileTitle);
  const exact = group.filter((k) => file.includes(compact(k.peak.n)));
  if (exact.length === 1) {
    deduped.push(exact[0]);
    for (const k of group) {
      if (k === exact[0]) continue;
      rejected.push({ peak: k.peak.n, file: fileTitle, reason: "file belongs to another peak" });
      note("shared file — kept for the peak it is named after");
    }
  } else {
    for (const k of group) {
      rejected.push({ peak: k.peak.n, file: fileTitle, reason: `file shared with ${group.length - 1} other peak(s)` });
    }
    note("shared file — cannot say which summit it shows");
  }
}
kept.length = 0;
kept.push(...deduped);

console.log(`\n  candidates ${candidates.length} → kept ${kept.length}`);
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(5)}  ${reason}`);
}

/* -------------------------------------------------------------------------- */
/* Download                                                                   */
/* -------------------------------------------------------------------------- */

if (!REPORT_ONLY && DOWNLOAD) {
  let done = 0;
  let fetched = 0;
  for (const k of kept) {
    const out = join(OUT_DIR, `${k.slug}.jpg`);
    done += 1;
    if (existsSync(out) && statSync(out).size > 4000) continue;
    try {
      const buf = await politeFetch(k.thumburl, { binary: true });
      const tmp = join(CACHE_DIR, "tmp-download");
      writeFileSync(tmp, buf);
      // sips ships with macOS; it re-encodes PNG/TIFF leads to JPEG and caps
      // the width, so a card never decodes more pixels than it can show.
      execFileSync("sips", [
        "-s", "format", "jpeg",
        "-s", "formatOptions", String(JPEG_QUALITY),
        "-Z", String(IMAGE_WIDTH),
        tmp, "--out", out,
      ], { stdio: "ignore" });
      rmSync(tmp, { force: true });
      fetched += 1;
    } catch (err) {
      k.failed = String(err.message || err);
    }
    if (done % 25 === 0 || done === kept.length) {
      process.stdout.write(`\r  images ${done}/${kept.length} (${fetched} newly fetched)   `);
    }
  }
  process.stdout.write("\n");
}

/*
 * Every survivor is in the index. The credits files in `public/img/peaks/`
 * describe the files that are actually IN that directory — an image that did
 * not land is not a credit row there — while the index is the record for the
 * rest. `src/services/peakPhotos.ts` reads the index; nothing reads the
 * directory listing.
 */
const onDisk = (k) => existsSync(join(OUT_DIR, `${k.slug}.jpg`));
const shipped = kept;
/*
 * The API's `thumburl` mixes two hosts for the same path — measured on one
 * run: 82 of 101 answered `thumb.wikimedia.org`, 19 `upload.wikimedia.org`.
 * Both serve the file (checked with HEAD, both HTTP 200). The canonical,
 * documented host is `upload`, and it is the one the service worker's
 * offline rule in `vite.config.ts` matches, so every URL is normalised to
 * it. The analytics query string Commons appends is dropped: it is not part
 * of the path and would only bloat the index.
 */
const stripUtm = (u) =>
  String(u).split("?")[0].replace(/^https:\/\/thumb\.wikimedia\.org\//, "https://upload.wikimedia.org/");
/** The API's thumbnail URL minus the host prefix every entry shares. */
const THUMB_BASE = "https://upload.wikimedia.org/wikipedia/commons/thumb/";
const packedSrc = (k) =>
  onDisk(k)
    ? `/img/peaks/${k.slug}.jpg`
    : stripUtm(k.thumburl).startsWith(THUMB_BASE)
      ? stripUtm(k.thumburl).slice(THUMB_BASE.length)
      : stripUtm(k.thumburl);

/* -------------------------------------------------------------------------- */
/* Emit                                                                       */
/* -------------------------------------------------------------------------- */

const attributionNeeded = (license) => !/^cc0|^public domain|^pd/i.test(license.trim());

const creditRows = shipped
  .filter(onDisk)
  .map((k) => ({
    slug: k.slug,
    peakId: k.id,
    peak: k.peak.n,
    title: k.fileTitle,
    license: k.license,
    artist: k.artist,
    descUrl: k.descUrl,
    url: k.original,
    source: k.origin,
    article: k.entity,
  }))
  .sort((a, b) => a.slug.localeCompare(b.slug));

/*
 * The five fields are the contract, so they are asserted rather than assumed:
 * which peak, where it came from, who took it, under what licence, and which
 * article or entity vouched for the subject. A row with a hole in it is how an
 * unattributed CC BY file ends up in a shipped directory, so this throws
 * rather than writing a partial credits file.
 */
for (const k of kept) {
  for (const field of ["id", "original", "artist", "license", "entity", "thumburl"]) {
    if (!k[field]) throw new Error(`photograph ${k.slug} has no ${field}`);
  }
}

writeFileSync(join(OUT_DIR, "_credits.json"), JSON.stringify(creditRows, null, 2) + "\n", "utf8");

const reviewedCount = kept.filter((k) => reviewed.has(k.fileTitle)).length;
const md = [
  "# ICEFALL — peak photograph credits",
  "",
  `${kept.length} of the ${peaks.length} peaks in \`public/data/peaks.json\` have a photograph, indexed in`,
  "`public/data/peak-photos.json` with the photographer, the licence, the Commons file title and the",
  "Wikidata entity or Wikipedia article that vouched for the subject. Every one comes from",
  "[Wikimedia Commons](https://commons.wikimedia.org) and was resolved through the peak's own entity or",
  "article — never by looking at what happens to be photographed nearby.",
  "",
  `${creditRows.length} of them are also stored in this directory (\`--download\`); the rest are served from`,
  "Commons at the width the API rendered. Regenerate with `node scripts/harvest-peak-photos.mjs`.",
  "",
  `**Looked at by a person: ${reviewedCount}. Machine-filtered only: ${kept.length - reviewedCount}.** The`,
  "machine filters get a set to roughly 95% correct and no further: they cannot see an annotated panorama",
  "with peak names lettered across the sky, a 19th-century printed plate, a map saved as a PNG, a summit",
  "cross, a lift station or a barn. 608 Alpine candidates were reviewed as contact sheets and 28 rejected by",
  "eye; those are listed in `scripts/peak-photo-rejects.json` so a re-run cannot bring them back, and the",
  "accepted ones in `scripts/peak-photo-reviewed.json`. Entries outside that set carry no review flag.",
  "",
  "**What this does NOT claim.** Each image is a photograph of a mountain that the peak's own Wikidata",
  "entity or Wikipedia article points to, whose filename names the peak, under a licence that permits",
  "commercial use. It is not proof that the summit in the frame is this summit rather than its neighbour",
  "on the same ridge — no step here can establish that, and the contour plate remains the honest answer",
  `for the ${peaks.length - kept.length} peaks with nothing.`,
  "",
  "Files marked CC0 / public domain need no attribution; the rest are CC BY or CC BY-SA and",
  "**require the credit shown** wherever the image is displayed publicly. The app prints it under every one.",
  "",
  ...(creditRows.length
    ? [
        "## Files in this directory",
        "",
        "| File | Peak | Source title | Licence | Attribution required | Resolved via | Link |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...creditRows.map(
          (r) =>
            `| \`${r.slug}.jpg\` | ${r.peak.replace(/\|/g, "/")} | ${r.title.replace(/\|/g, "/")} | ${r.license} | ${
              attributionNeeded(r.license) ? r.artist.replace(/\|/g, "/") : "—"
            } | ${r.source === "wikidata-p18" ? "Wikidata P18" : "article lead"} | [source](${r.descUrl}) |`,
        ),
      ]
    : []),
  "",
].join("\n");
writeFileSync(join(OUT_DIR, "CREDITS.md"), md, "utf8");

/**
 * The runtime index, in the shape `public/data/trails/photos.json` already
 * uses, keyed by the id `src/services/peaks.ts` mints for every peak
 * (`osm:<lat 4dp>,<lon 4dp>` — verified distinct for all 4,193).
 *
 * `kind` is "of" throughout: nothing in this file is a photograph of somewhere
 * near the peak, because nothing near the peak was ever asked for.
 */
const index = {
  v: 3,
  built: new Date().toISOString().slice(0, 10),
  /*
   * THE EYEBALL PASS, CARRIED INTO THE APP.
   *
   * 28 files that reached the contact sheet and were rejected by a person: six
   * annotated panoramas, two printed plates from the 1800s, a topographic map
   * saved as a PNG, a summit cross, two lift stations, a stone barn, a chapel.
   * No machine test in this script caught any of them.
   *
   * They are shipped alongside the photographs because THE APP STILL RESOLVES
   * IMAGES AT RUNTIME for the ~519 tagged peaks this harvest did not ship and
   * for anything found through live Overpass. That path takes the Wikipedia
   * lead image, which is the same candidate pool these 28 came out of — so
   * without this list the app would quietly serve, live, the exact files a
   * person already looked at and refused.
   *
   * Keyed by Commons file name, which is what both the harvest and
   * `src/services/peakPhotos.ts` can key on. The value is the reason, kept so
   * the next person does not have to re-derive the judgement.
   */
  rejects: manualRejects,
  /*
   * PACKED, because there are tens of thousands of rows and the file is
   * fetched by phones. `src/services/peakPhotos.ts` unpacks:
   *   s  Commons thumbnail path under upload.wikimedia.org/wikipedia/commons/
   *      thumb/ (or a local /img/peaks/ path when --download put it there)
   *   f  Commons file title — the page URL derives from it
   *   a  photographer, as Commons records it
   *   l  licence short name
   *   q  the Wikidata QID that vouched for the subject, or the article URL
   *   v  "p18" (Wikidata image statement) or "lead" (article lead image)
   *   r  1 when a person looked at this file and accepted it; absent otherwise
   */
  photos: Object.fromEntries(
    shipped.map((k) => [
      k.id,
      {
        s: packedSrc(k),
        f: k.fileTitle,
        a: k.artist,
        l: k.license,
        q: k.origin === "wikidata-p18" && k.qid ? k.qid : k.entity,
        v: k.origin === "wikidata-p18" ? "p18" : "lead",
        ...(reviewed.has(k.fileTitle) ? { r: 1 } : {}),
      },
    ]),
  ),
};
writeFileSync(INDEX_OUT, JSON.stringify(index), "utf8");

writeFileSync(
  join(CACHE_DIR, "rejected.json"),
  JSON.stringify(rejected, null, 2),
  "utf8",
);

/*
 * Prune. A peak that passed the filter on an earlier run and fails it now has
 * a file on disk and no credits row, which is an uncredited photograph in a
 * shipped directory — the exact breach the credits file exists to prevent.
 * `--limit` only ever looks at a prefix of the catalogue, so it must not
 * delete the rest of the harvest.
 */
if (!LIMIT && DOWNLOAD) {
  const wanted = new Set(shipped.map((k) => `${k.slug}.jpg`));
  for (const f of readdirSync(OUT_DIR)) {
    if (!f.endsWith(".jpg") || wanted.has(f)) continue;
    rmSync(join(OUT_DIR, f), { force: true });
  }
}

const bytes = readdirSync(OUT_DIR)
  .filter((f) => f.endsWith(".jpg"))
  .reduce((n, f) => n + statSync(join(OUT_DIR, f)).size, 0);

console.log("");
console.log(`  indexed        ${shipped.length} photographs (${reviewedCount} looked at by a person)`);
console.log(`  on disk        ${creditRows.length} files, ${(bytes / 1e6).toFixed(1)} MB in public/img/peaks/${DOWNLOAD ? "" : "  (index mode — pass --download to fetch files)"}`);
console.log(`  index size     ${(JSON.stringify(index).length / 1024).toFixed(0)} KB raw`);
console.log(`  credits        public/img/peaks/CREDITS.md + _credits.json`);
console.log(`  runtime index  public/data/peak-photos.json`);
console.log(`  api requests   ${requestCount}`);
console.log("");
console.log(`  ${peaks.length - shipped.length} peaks keep the contour plate.`);
