#!/usr/bin/env node
/**
 * Fills in REAL measured length for every trail in the per-country indexes.
 *
 *   node scripts/build-trail-lengths.mjs            # every indexed country
 *   node scripts/build-trail-lengths.mjs 307787     # one relation id
 *
 * WHY THIS EXISTS. `build-trail-index.mjs` stores `lengthKm` only where OSM's
 * own `distance` tag happens to be set, which is a minority of relations —
 * Cyprus's E4 (557 km) and Beşparmak Trail (235 km) both carry none. Ranking
 * then had no way to tell a country-spanning mega-route from a 4 km nature
 * walk, so the mega-routes sat at the top of every country search where a real
 * day hike belonged.
 *
 * The obvious fix — download each relation's geometry and measure it — is
 * unaffordable: the E4's geometry alone is 1.3 MB, and there are ~77,000
 * relations. Overpass can do the measuring ITSELF. `convert` with `length()`
 * returns a computed length per relation and nothing else, so a whole country
 * costs one request and a few tens of kilobytes: measured 2026-08-25, all 175
 * Cyprus relations came back in 21 KB.
 *
 * This only ADDS measured lengths to existing index files; it never re-queries
 * the trail list itself, so it is safe to re-run and cheap to resume.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, "../public/data/trails");

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
        });
        const text = await res.text();
        if (!text.trimStart().startsWith("{")) continue;
        const json = JSON.parse(text);
        if (json.remark && /error/i.test(json.remark)) continue;
        return json.elements ?? [];
      } catch {
        /* next mirror */
      }
    }
    const wait = 15_000 * (attempt + 1);
    console.log(`  throttled — waiting ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error("No Overpass mirror answered after 6 attempts");
}

const only = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const files = readdirSync(DIR)
  .filter((n) => /^r\d+\.json$/.test(n))
  .filter((n) => only.length === 0 || only.includes(n.slice(1, -5)));

console.log(`${files.length} country file(s) to enrich\n`);

for (const file of files) {
  const path = resolve(DIR, file);
  const payload = JSON.parse(readFileSync(path, "utf8"));
  const rel = payload.rel;
  const rows = payload.trails ?? [];
  const missing = rows.filter((r) => r[5] == null).length;

  if (missing === 0) {
    console.log(`${file}: every length already known — skipped`);
    continue;
  }

  console.log(`${file}: ${rows.length} trails, ${missing} without a length — querying…`);

  let stats;
  try {
    stats = await overpass(
      `[out:json][timeout:300];area(${3_600_000_000 + Number(rel)})->.a;` +
        `rel["route"="hiking"]["name"](area.a)->.r;` +
        `foreach.r(convert stat ::id = id(), km = length() / 1000; out;);`,
    );
  } catch (err) {
    console.log(`  FAILED (${err.message}) — left as-is, safe to re-run`);
    continue;
  }

  const byId = new Map();
  for (const s of stats) {
    const km = Number(s.tags?.km);
    if (Number.isFinite(km) && km > 0) byId.set(s.id, Math.round(km * 10) / 10);
  }

  let filled = 0;
  for (const row of rows) {
    // Only fill genuine gaps. Where OSM states a distance, that stated value
    // is what the trail's own signage says and it stays authoritative.
    if (row[5] == null && byId.has(row[0])) {
      row[5] = byId.get(row[0]);
      filled++;
    }
  }

  payload.lengthsMeasured = new Date().toISOString().slice(0, 10);
  writeFileSync(path, JSON.stringify(payload));
  console.log(`  filled ${filled} of ${missing} (${byId.size} measured by Overpass)`);

  await new Promise((r) => setTimeout(r, 5_000));
}

console.log("\nDone.");
