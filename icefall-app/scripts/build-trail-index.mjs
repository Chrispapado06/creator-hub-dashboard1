#!/usr/bin/env node
/**
 * Builds `public/data/trails/r<relationId>.json` — per-country trail indexes.
 *
 *   node scripts/build-trail-index.mjs 16239 [21335 ...]   # OSM relation ids
 *   node scripts/build-trail-index.mjs --from file.json 16239
 *
 * WHY THIS EXISTS. A country-wide hiking query against public Overpass was
 * measured at **44 seconds** for Austria (10,334 relations) on 2026-08-23 —
 * more than double the app's 20-second client timeout, so a search for any
 * dense country failed every single time with "couldn't reach the trail
 * database". No query shaping fixes a server queue; even a 10 km circle
 * returning 7 KB took 11.4 s. The only honest way to a fast search is to stop
 * asking the question live: this script asks it ONCE, here, with no timeout
 * pressure, and the app then reads the answer from its own CDN in milliseconds.
 *
 * The output is a compact array-of-arrays (the same trick as peaks.json):
 *   [osmId, name, lat, lon, network, lengthKm, ref, sacScale]
 * with nulls for absences. Austria comes to ~600 KB raw, ~150 KB gzipped over
 * the wire — fetched on demand, never precached (the PWA glob is an allowlist).
 *
 * Data © OpenStreetMap contributors, ODbL. The app renders attribution.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../public/data/trails");

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/** Same tolerant parsing the app uses — "6 km" and "6,5" are both lengths. */
function distanceKm(value) {
  if (!value) return null;
  if (/\bmi(les?)?\b/i.test(value)) return null;
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

function pack(elements) {
  const rows = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (!t.name || !el.center) continue;
    rows.push([
      el.id,
      t.name,
      Math.round(el.center.lat * 1e5) / 1e5,
      Math.round(el.center.lon * 1e5) / 1e5,
      ["lwn", "rwn", "nwn", "iwn"].includes(t.network) ? t.network : null,
      distanceKm(t.distance),
      t.ref ?? null,
      t.sac_scale ?? null,
    ]);
  }
  return rows;
}

const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;
// When --from is absent, fromIdx is -1 and fromIdx+1 is 0 — which silently
// discarded the FIRST id and made every no-file invocation a no-op that
// exited 0. Eight countries "built" without one Overpass request being made.
const ids = args.filter((a, i) => /^\d+$/.test(a) && (fromIdx < 0 || i !== fromIdx + 1));

mkdirSync(OUT_DIR, { recursive: true });

for (const id of ids) {
  const out = resolve(OUT_DIR, `r${id}.json`);
  let elements;
  if (fromFile) {
    console.log(`r${id}: reading ${fromFile}`);
    elements = JSON.parse(readFileSync(fromFile, "utf8")).elements ?? [];
  } else {
    console.log(`r${id}: querying Overpass (this is the slow part, done once)…`);
    elements = await overpass(
      `[out:json][timeout:180];area(${3_600_000_000 + Number(id)})->.a;` +
        `relation["route"="hiking"]["name"](area.a);out tags center;`,
    );
  }
  const rows = pack(elements);
  const payload = {
    v: 1,
    rel: Number(id),
    built: new Date().toISOString().slice(0, 10),
    attribution: "Trail data © OpenStreetMap contributors (ODbL)",
    trails: rows,
  };
  writeFileSync(out, JSON.stringify(payload));
  console.log(`  wrote ${out.split("/").pop()} — ${rows.length} trails, ${(JSON.stringify(payload).length / 1024).toFixed(0)} KB`);
  if (!fromFile && ids.length > 1) await new Promise((r) => setTimeout(r, 8_000));
}
