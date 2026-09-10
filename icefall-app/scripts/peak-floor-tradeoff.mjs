#!/usr/bin/env node
/**
 * What the catalogue would hold at different floors — WITHOUT ASKING OVERPASS
 * ANYTHING.
 *
 *   node scripts/peak-floor-tradeoff.mjs
 *
 * `build-peak-catalogue.mjs` fetches each region ONCE, at its lower (doc)
 * floor, and decides the two admission tiers locally. That means the cache in
 * `.harvest-cache/peaks/` already contains every peak any stricter setting
 * could want, so the size question can be answered by re-sorting what is on
 * disk. Re-tiering 80,000 cached nodes takes about a second; re-fetching them
 * takes about an hour and a lot of somebody else's bandwidth.
 *
 * This exists because the answer is a JUDGEMENT CALL THAT IS NOT MINE. Charlie
 * asked for peaks that are "climbable at least", having been told the world set
 * would be roughly 15,000–35,000. The floors actually chosen land above that,
 * so the honest move is to show what each setting costs and let him pick,
 * rather than quietly tightening the thresholds to hit a number he named
 * before anyone had measured anything.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(HERE, "../.harvest-cache/peaks");

if (!existsSync(CACHE)) {
  console.error("No cache. Run `npm run peaks:world` first.");
  process.exit(1);
}

/** Same parser the builder uses — "2505 m", "2166,4", "2315.9м". */
function parseEle(raw) {
  const n = parseFloat(
    String(raw)
      .replace(/,(\d{3})\b/g, "$1")
      .replace(",", ".")
      .replace(/[^0-9.\-]/g, ""),
  );
  return Number.isFinite(n) ? n : null;
}

/* Load every cached region once. */
const regions = [];
for (const f of readdirSync(CACHE)) {
  if (!f.endsWith("--all.json")) continue;
  const { elements } = JSON.parse(readFileSync(join(CACHE, f), "utf8"));
  const peaks = [];
  for (const el of elements) {
    const ele = parseEle(el.tags?.ele);
    if (ele === null || !el.tags?.name) continue;
    peaks.push({ ele, documented: Boolean(el.tags.wikidata || el.tags.wikipedia) });
  }
  regions.push({ name: f.replace("--all.json", ""), peaks });
}

/**
 * Settings to compare. `coreLift` raises every region's admit-everything floor;
 * `docOnly` drops the documented band entirely, leaving only the core.
 *
 * The floors are per-region and stay per-region — a single worldwide cut is the
 * one thing the build must never do, because 900 m is a mountain in Scotland
 * and a foothill in Nepal. These are proportional shifts of the whole table.
 */
const SETTINGS = [
  { name: "as built", coreLift: 0, dropBand: false },
  { name: "no documented band (core floors only)", coreLift: 0, dropBand: true },
  { name: "core floors +200 m", coreLift: 200, dropBand: false },
  { name: "core floors +400 m", coreLift: 400, dropBand: false },
  { name: "core +400 m, no documented band", coreLift: 400, dropBand: true },
];

/*
 * The per-region floors, mirrored from the builder. Kept here rather than
 * imported because the builder runs its fetches at module scope — importing it
 * would start a world harvest as a side effect of asking a question about one.
 */
const FLOORS = {
  alps: [3000, 2200], pyrenees: [2600, 2000], iberia: [2000, 1400],
  "apennines-corsica": [1800, 1200], "britain-ireland": [900, 600],
  scandinavia: [1400, 900], iceland: [1000, 600], "carpathians-balkans": [2200, 1500],
  caucasus: [3500, 2500], "himalaya-karakoram": [5500, 4500],
  "tien-shan-pamir": [4500, 3500], "turkey-iran-caucasus-south": [3500, 2600],
  japan: [2400, 1600], "altai-sayan": [2800, 2000], kamchatka: [2000, 1400],
  "se-asia-borneo-new-guinea": [2500, 1800], atlas: [2500, 1800],
  "east-africa": [3000, 2200], "southern-africa": [2500, 1900],
  "atlantic-islands": [1500, 1000], "alaska-yukon": [2500, 1600],
  "rockies-sierra-cascades": [3000, 2300], "appalachians-eastern-na": [1200, 900],
  "greenland-baffin": [1800, 1200], hawaii: [2000, 1200],
  "mexico-central-america": [3000, 2200], andes: [5000, 4200],
  patagonia: [2000, 1200], "new-zealand": [2200, 1400], australia: [1200, 800],
  "ellsworth-antarctica": [1500, 500],
};

const BYTES_PER_PEAK = 78; // measured against the built file

console.log("Peaks the catalogue would hold, re-tiered from the cache.\n");
for (const s of SETTINGS) {
  let total = 0;
  for (const r of regions) {
    const floors = FLOORS[r.name];
    if (!floors) continue;
    const core = floors[0] + s.coreLift;
    const doc = floors[1];
    for (const p of r.peaks) {
      if (p.ele >= core) total += 1;
      else if (!s.dropBand && p.ele >= doc && p.documented) total += 1;
    }
  }
  const kb = (total * BYTES_PER_PEAK) / 1024;
  console.log(
    `  ${s.name.padEnd(38)} ${String(total).padStart(7)} peaks   ~${kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`} raw`,
  );
}

console.log("\nPer region, as built:\n");
const rows = [];
for (const r of regions) {
  const floors = FLOORS[r.name];
  if (!floors) continue;
  const [core, doc] = floors;
  let c = 0, d = 0, x = 0;
  for (const p of r.peaks) {
    if (p.ele >= core) c += 1;
    else if (p.ele >= doc && p.documented) d += 1;
    else if (p.ele >= doc) x += 1;
  }
  rows.push({ name: r.name, core, doc, c, d, x, total: c + d });
}
rows.sort((a, b) => b.total - a.total);
console.log(
  `  ${"region".padEnd(28)}${"core".padStart(6)}${"doc".padStart(6)}${"≥core".padStart(8)}${"+doc".padStart(7)}${"excluded".padStart(10)}${"total".padStart(8)}`,
);
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(28)}${String(r.core).padStart(6)}${String(r.doc).padStart(6)}` +
      `${String(r.c).padStart(8)}${String(r.d).padStart(7)}${String(r.x).padStart(10)}${String(r.total).padStart(8)}`,
  );
}
console.log(
  `\n  ${"TOTAL (before dedup across overlapping boxes)".padEnd(28)}` +
    `${String(rows.reduce((n, r) => n + r.total, 0)).padStart(29)}`,
);
