#!/usr/bin/env node
/**
 * Builds `public/data/peaks.json` — ICEFALL's bundled peak catalogue.
 *
 *   node scripts/build-peak-catalogue.mjs [--world]
 *
 * The catalogue is the offline fallback and the instant-results set. Live
 * Overpass covers every named peak on earth at runtime, so this file only needs
 * the peaks worth carrying: by default the Alps above 3,000 m (~4,200 peaks,
 * ~260 KB). Pass --world to add the major ranges as well; that takes a lot
 * longer and Overpass mirrors are flaky, so it retries.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../public/data/peaks.json");

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const ALPS = { name: "Alps", bbox: [43.2, 4.5, 48.3, 16.8], minEle: 3000 };

/** Global scans time out, so the world is covered range by range. */
const WORLD = [
  { name: "Himalaya / Karakoram", bbox: [25, 70, 41, 101], minEle: 5500 },
  { name: "Andes", bbox: [-56, -82, 13, -60], minEle: 5000 },
  { name: "Alaska / Yukon", bbox: [55, -165, 70, -125], minEle: 3500 },
  { name: "Caucasus", bbox: [40, 39, 46, 51], minEle: 4000 },
  { name: "East Africa", bbox: [-7, 27, 7, 42], minEle: 4000 },
  { name: "Rockies / Sierra", bbox: [32, -126, 61, -100], minEle: 4000 },
  { name: "Pyrenees", bbox: [42, -2, 43.8, 3.5], minEle: 3000 },
  { name: "Scandinavia", bbox: [58, 4, 71, 32], minEle: 1900 },
  { name: "Britain / Ireland", bbox: [49.8, -11, 61, 2], minEle: 900 },
  { name: "Carpathians / Balkans", bbox: [40, 13, 49.5, 29], minEle: 2400 },
  { name: "Japan", bbox: [30, 129, 46, 146], minEle: 2500 },
  { name: "New Zealand", bbox: [-47, 166, -34, 179], minEle: 2400 },
];

async function overpass(query, attempt = 0) {
  const url = MIRRORS[attempt % MIRRORS.length];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "IcefallApp/0.1" },
      body: new URLSearchParams({ data: query }),
    });
    const text = await res.text();
    if (!text.trimStart().startsWith("{")) throw new Error("mirror returned an error page");
    const json = JSON.parse(text);
    if (json.remark && /error/i.test(json.remark)) throw new Error(json.remark.slice(0, 70));
    return json.elements ?? [];
  } catch (e) {
    if (attempt < 5) {
      process.stdout.write(`  retry (${e.message})\n`);
      await new Promise((r) => setTimeout(r, 4000));
      return overpass(query, attempt + 1);
    }
    process.stdout.write(`  ! skipped: ${e.message}\n`);
    return [];
  }
}

const seen = new Map();

function add(el) {
  const t = el.tags;
  if (!t?.name || !t.ele) return;
  const ele = parseFloat(String(t.ele).replace(",", "."));
  if (!Number.isFinite(ele) || ele < 100 || ele > 9000) return;
  const name = t.name.trim();
  if (!name || name.length > 60) return;
  // Peaks are frequently mapped twice by different surveys.
  const key = `${name}|${el.lat.toFixed(2)}|${el.lon.toFixed(2)}`;
  if (seen.has(key)) return;
  seen.set(key, {
    n: name,
    e: Math.round(ele),
    a: Number(el.lat.toFixed(4)),
    o: Number(el.lon.toFixed(4)),
    ...(t.wikipedia ? { w: t.wikipedia } : {}),
    ...(t.natural === "volcano" ? { v: 1 } : {}),
  });
}

const regions = process.argv.includes("--world") ? [ALPS, ...WORLD] : [ALPS];

for (const r of regions) {
  const [s, w, n, e] = r.bbox;
  const q =
    `[out:json][timeout:180];` +
    `node["natural"~"peak|volcano"]["name"]["ele"](${s},${w},${n},${e})` +
    `(if:number(t["ele"])>=${r.minEle});out body;`;
  const before = seen.size;
  const els = await overpass(q);
  els.forEach(add);
  process.stdout.write(`${r.name.padEnd(24)} +${String(seen.size - before).padStart(5)}  (total ${seen.size})\n`);
  await new Promise((res) => setTimeout(res, 1500));
}

const peaks = [...seen.values()].sort((a, b) => b.e - a.e);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(peaks));
process.stdout.write(`\n${peaks.length} peaks → ${OUT} (${(JSON.stringify(peaks).length / 1024).toFixed(0)} KB)\n`);
