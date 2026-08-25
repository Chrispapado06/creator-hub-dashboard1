#!/usr/bin/env node
/**
 * Builds `public/data/trails/manifest.json` — the map of which countries have a
 * prebuilt trail index, each with its bounding box.
 *
 * The manifest is what lets a search around a POINT use the country files: the
 * app checks which boxes contain the point, fetches those files (one, or two on
 * a border), and filters by distance — all client-side, all CDN-speed. Without
 * it only country-name searches could use the indexes, and a search around
 * Vienna would still wait ten-plus seconds on the public Overpass queue while
 * Austria's 10,334 trails sat in a file the app already had.
 *
 * Run it after any build-trail-index run. It derives boxes from the trail
 * coordinates themselves, so a file and its box can never disagree.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/data/trails");

const countries = [];
for (const file of readdirSync(DIR).filter((f) => /^r\d+\.json$/.test(f))) {
  const data = JSON.parse(readFileSync(resolve(DIR, file), "utf8"));
  const trails = data.trails ?? [];
  if (!trails.length) {
    console.log(`  ${file}: empty — skipped`);
    continue;
  }
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const [, , lat, lon] of trails) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  countries.push({
    rel: data.rel,
    n: trails.length,
    // Rounded outward, so a point on the edge still matches.
    bbox: [
      Math.floor(minLat * 100) / 100,
      Math.floor(minLon * 100) / 100,
      Math.ceil(maxLat * 100) / 100,
      Math.ceil(maxLon * 100) / 100,
    ],
  });
  console.log(`  r${data.rel}: ${trails.length} trails, bbox ${JSON.stringify(countries.at(-1).bbox)}`);
}

writeFileSync(
  resolve(DIR, "manifest.json"),
  JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), countries }),
);
console.log(`manifest.json — ${countries.length} countries`);
