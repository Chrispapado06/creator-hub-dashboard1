#!/usr/bin/env node
/**
 * THE EYEBALL PASS — lays every fact about a sample of matches side by side so
 * a human can say yes or no to each one.
 *
 *   node scripts/audit-trek-osm.mjs            # 25 matches, deterministically sampled
 *   node scripts/audit-trek-osm.mjs 40         # a bigger sample
 *   node scripts/audit-trek-osm.mjs --all      # every match
 *
 * A green run of the matching script is not evidence that the matches are
 * right; it is evidence that the rules ran. This prints, per match, the trek as
 * the catalogue states it and the relation as OSM states it — every name tag,
 * the ref, the network, the operator, `from`/`to`, the wikidata and wikipedia
 * links, the measured length and where the thing actually is — so the two can
 * be compared by a person rather than by the code that paired them.
 *
 * The sample is seeded, so the same run shows the same treks and a fix can be
 * checked against the same evidence.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const audit = JSON.parse(readFileSync(resolve(HERE, "trek-osm-audit.json"), "utf8"));

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 25);

const treks = (() => {
  const src = readFileSync(resolve(HERE, "../src/treks/records.ts"), "utf8");
  const body = src.slice(src.indexOf("= [") + 2, src.lastIndexOf("]") + 1).replace(/,(\s*\])/g, "$1");
  return new Map(JSON.parse(body).map((t) => [t.id, t]));
})();

const matched = audit.results.filter((r) => r.matched);

/** A stable shuffle: hash the id, sort by the hash. Same sample every run. */
const sample = ALL
  ? matched
  : matched
      .slice()
      .sort((a, b) =>
        createHash("sha1").update(a.id).digest("hex") < createHash("sha1").update(b.id).digest("hex") ? -1 : 1,
      )
      .slice(0, N);

console.log(`${matched.length} matches in total · showing ${sample.length}\n`);

/**
 * WIKIDATA, WHICH KNOWS NOTHING ABOUT THIS SCRIPT.
 *
 * Where the relation carries a `wikidata` tag, the label and description of
 * that item are an account of the route written by people who have never seen
 * this catalogue. It is the only genuinely independent check available here —
 * everything else on the line below comes from OSM, which is the thing being
 * checked. One request for the whole sample; nothing is written anywhere.
 */
const qids = [...new Set(sample.map((m) => m.tags?.wikidata).filter(Boolean))];
const labels = {};
for (let i = 0; i < qids.length; i += 45) {
  const chunk = qids.slice(i, i + 45);
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join("|")}` +
    `&props=labels%7Cdescriptions&languages=en&format=json&origin=*`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ICEFALL-app/1.0 (trek match audit)" } });
    const json = await res.json();
    for (const [id, ent] of Object.entries(json.entities ?? {}))
      labels[id] = `${ent.labels?.en?.value ?? "?"} — ${ent.descriptions?.en?.value ?? ""}`;
  } catch {
    /* the audit prints what it has; a missing label is not a failure */
  }
}


for (const [i, m] of sample.entries()) {
  const t = treks.get(m.id);
  console.log(`${String(i + 1).padStart(2)}. ${t.name}   [${m.confidence}]`);
  console.log(`    catalogue : ${t.country} · ${t.style} · ${t.difficulty ?? "—"} · ${t.durationDays ? t.durationDays.join("–") + " days" : "duration not stated"} · high point ${t.maxAltitudeM ?? "—"} m`);
  console.log(`    states    : ${m.statedKm ? m.statedKm.join("–") + " km" : "no distance in the summary"}`);
  console.log(`    relation  : r${m.osmId}  "${m.osmName}"   ${m.lengthKm} km · ${m.wayMembers ?? "?"} ways`);
  console.log(`    matched on: "${m.matchedName}"  (${m.tests?.name})`);
  console.log(`    country   : ${m.tests?.countryPolygon ?? "?"}`);
  console.log(`    tags      : ${Object.entries(m.tags ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("  ") || "—"}`);
  console.log(`    centre    : ${m.centre.lat.toFixed(4)}, ${m.centre.lon.toFixed(4)}   https://www.openstreetmap.org/relation/${m.osmId}`);
  if (m.tags?.wikidata) console.log(`    wikidata  : ${m.tags.wikidata}  ${labels[m.tags.wikidata] ?? "(not fetched)"}`);
  console.log(`    summary   : ${t.summary.slice(0, 160)}…`);
  console.log();
}
