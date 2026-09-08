#!/usr/bin/env node
/**
 * Corrects claims in `public/data/trails/photos.json` that the evidence in the
 * file itself does not support. Data only — it adds nothing, fetches nothing,
 * and touches no code.
 *
 *   node scripts/fix-photo-claims.mjs --dry-run    # report, change nothing
 *   node scripts/fix-photo-claims.mjs             # apply, with a backup
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY. `src/services/trailImagery.ts` states the rule this file enforces:
 *
 *     `kind` is the whole point of this file and must never be collapsed into
 *     one generic "verified photo" type.
 *
 *   "of"    someone recorded a link from THIS OSM relation to THIS file.
 *           Captioned unqualified: "Long circular walk in Troodos · Mboesch ·
 *           CC BY-SA 4.0 · Wikimedia Commons".
 *   "near"  proximity plus a human-chosen subject class. Captioned with the
 *           category and the word "near", because a claim stronger than the
 *           evidence is a lie the user cannot see.
 *
 * THE RULE WAS BEING BROKEN BY THE DATA, NOT THE CODE. Audited 2026-09-08:
 * 4,572 entries are labelled "of". 1,903 of them carry no `distM` and came from
 * the Wikidata identity join. The other 2,669 carry a `distM` — a measured
 * distance from the trail, median 554 m, hard-capped at 999 m — and a Commons
 * category. A distance is the signature of a PROXIMITY search. Those entries
 * were selected by how close the photograph was and then labelled as being OF
 * the trail. Two of them, rendered live on :5210 before this ran:
 *
 *   Tour du Val de Bagnes            <- "Cabane Brunet.JPG", 511 m away,
 *                                       category "Alpine huts in the canton of
 *                                       Valais"
 *   Santa Cruz de La Palma-Puerto    <- "Cumbre Nueva - Cloudfall 02.jpg",
 *     de Tazacorte                      878 m away
 *
 * Both were captioned as photographs of the trail. That is the Chamonix war
 * memorial — the failure this codebase deleted a whole subsystem to avoid —
 * arriving back through the data instead of through the code. The fix costs no
 * harvesting: every one of the 2,669 already carries the distance and the
 * category that make an honest "near" caption, so the correction is a relabel,
 * not a deletion. 2,664 of them even keep a category, so most read as
 * "Alpine huts in the canton of Valais near Tour du Val de Bagnes · …".
 *
 * AND EIGHT ENTRIES CARRY NO PHOTOGRAPHER. `photoCaption` renders those as
 * "Unknown photographer", which under CC BY-SA is not an attribution — it is a
 * statement that the attribution is missing. Two of the eight also have the
 * literal string "See Wikimedia Commons" where a licence should be, so their
 * terms are not merely uncredited but unknown. An image that cannot carry
 * credit + licence + source does not ship; the harvest script refuses to write
 * one, and these predate it. They are removed, and the trails fall back to
 * satellite imagery of their own ground — a true picture, correctly credited.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. 1,428 entries are keyed on relation ids
 * that appear in no country file, so no list in the app can surface them. They
 * are NOT removed here. They are still reachable — `trailById()` resolves an
 * arbitrary relation through Overpass, so a deep link to one still renders —
 * and dropping a real, correctly-credited photograph to save 0.5 MB of a file
 * that is fetched once per session is a product regression dressed as a
 * cleanup. The number is reported so the decision can be made deliberately.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TRAILS_DIR = resolve(HERE, "../public/data/trails");
const PHOTOS = resolve(TRAILS_DIR, "photos.json");

const dryRun = process.argv.includes("--dry-run");

const file = JSON.parse(readFileSync(PHOTOS, "utf8"));
if (file.v !== 2) throw new Error(`photos.json is v${file.v}; this script knows v2`);
const photos = file.photos;

/** Every relation id any list in the app can actually offer. */
const indexed = new Set();
const manifest = JSON.parse(readFileSync(resolve(TRAILS_DIR, "manifest.json"), "utf8"));
for (const c of manifest.countries) {
  const country = JSON.parse(readFileSync(resolve(TRAILS_DIR, `r${c.rel}.json`), "utf8"));
  for (const t of country.trails) indexed.add(t[0]);
}

let relabelled = 0;
let dropped = 0;
let orphans = 0;
const droppedIds = [];

for (const [id, e] of Object.entries(photos)) {
  if (!indexed.has(Number(id))) orphans++;

  /* No photographer means no attribution, and under CC BY-SA no right to
   * publish. Checked BEFORE the relabel so a dropped entry is not also
   * counted as corrected. */
  if (!e.credit) {
    droppedIds.push(`${id} ${e.license} ${e.file ?? e.src}`);
    delete photos[id];
    dropped++;
    continue;
  }

  /* A distance is proof the entry was chosen by proximity. Proximity is
   * "near". There is no case in which a distance was measured AND an identity
   * link existed — the identity paths in harvest-trail-photos.mjs measure
   * nothing — so this needs no exceptions. */
  if (e.kind === "of" && e.distM != null) {
    e.kind = "near";
    relabelled++;
  }
}

const kinds = Object.values(photos).reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] ?? 0) + 1 }), {});

console.log(`entries       ${Object.keys(photos).length} (was ${Object.keys(photos).length + dropped})`);
console.log(`relabelled    ${relabelled}  "of" -> "near" (carried a measured distance)`);
console.log(`dropped       ${dropped}  no photographer`);
for (const d of droppedIds) console.log(`              ${d}`);
console.log(`kinds now     of ${kinds.of ?? 0} · near ${kinds.near ?? 0}`);
console.log(`orphans       ${orphans} entries whose relation is in no country file (kept — see header)`);

if (dryRun) {
  console.log("\n--dry-run: nothing written");
} else {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  /*
   * THE BACKUP GOES OUTSIDE public/.
   *
   * Five earlier backups — photos.v2, photos.pre-attrib, photos.pre-fullrun and
   * two dated ones — sit in `public/data/trails/`, which `vite build` copies
   * wholesale into `dist/`. Measured 2026-09-08: 17.3 MB of superseded photo
   * indexes are deployed and publicly fetchable at guessable paths like
   * `/data/trails/photos.pre-attrib.json`, and nothing in the app reads any of
   * them. They are harmless in content and pure weight in a deployment, so this
   * one is written to the gitignored `.harvest/` folder instead of joining them.
   */
  const backupDir = resolve(HERE, "../.harvest");
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(PHOTOS, resolve(backupDir, `photos.pre-claims-${stamp}.json`));
  /* `built` is stamped here because `merge()` in the harvest script never
   * rewrites it — which is why the file still claimed 2026-09-03 four days
   * after its last change. A date that lies about its own file is how an
   * exhausted source gets re-swept. */
  writeFileSync(PHOTOS, JSON.stringify({ ...file, built: new Date().toISOString().slice(0, 10), photos }));
  console.log(`\nwritten. backup: .harvest/photos.pre-claims-${stamp}.json`);
}
