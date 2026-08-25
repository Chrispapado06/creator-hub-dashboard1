#!/usr/bin/env node
/**
 * Resolves country names to their OSM relation ids via Photon, then hands each
 * to build-trail-index.mjs. Sequential and deliberately slow — this competes
 * with real users for the public Overpass queue, so it waits between countries.
 *
 *   node scripts/build-trail-countries.mjs Slovakia Greece Cyprus
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

async function relationId(name) {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=5&lang=en&osm_tag=place`,
  );
  const json = await res.json();
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    if (p.osm_type === "R" && ["country", "state", "region", "island"].includes(p.osm_value)) {
      return { id: p.osm_id, matched: `${p.name} (${p.osm_value})` };
    }
  }
  return null;
}

for (const name of process.argv.slice(2)) {
  const hit = await relationId(name);
  if (!hit) {
    console.log(`✗ ${name}: no relation found — skipped`);
    continue;
  }
  console.log(`▸ ${name} → r${hit.id} ${hit.matched}`);
  try {
    execFileSync("node", [resolve(HERE, "build-trail-index.mjs"), String(hit.id)], {
      stdio: "inherit",
    });
  } catch {
    console.log(`✗ ${name}: build failed — continuing`);
  }
  await new Promise((r) => setTimeout(r, 12_000));
}
