/**
 * THE CATALOGUE ↔ CURATED LINK, CHECKED AGAINST THE FILE THAT SHIPS.
 *
 * WHY THIS FILE EXISTS. Fourteen mountains carry a human-written record — a
 * grade, the seasons, whether a guide is required. Every other row in
 * `public/data/peaks.json` is a reference entry whose page says "ICEFALL has
 * not surveyed it". The link between a catalogue row and its curated record is
 * made by NAME in `withCurated`, and a name that misses produces the worst
 * page this app can serve: a second, reference-tier page for a surveyed
 * mountain, asserting there is no grade and no guide advice for a summit whose
 * record says `requiresProfessionalSupport: true`.
 *
 * That happened. Measured 2026-09-11 on the 53,668-row world catalogue:
 * Aconcagua's node is "Cerro Aconcagua", Kilimanjaro's is "Uhuru Peak" and
 * Mount Olympus's is "Μύτικας" — three of fourteen unlinked, and the build
 * script's `must` list could not see it because it only asks whether a famous
 * name is PRESENT in the file, not whether the row is linked.
 *
 * WHAT IT PROVES. Every curated record resolves to at least one catalogue row;
 * no row links to a record it is not physically at; and the name search finds
 * the famous peak first under the name an English speaker types. It cannot
 * prove a curated coordinate is right — only a person can — but it will fail
 * the moment a rebuild renames a node out from under a record.
 *
 * It follows the suites beside it: a plain TypeScript program with a small
 * harness, inside `src/` so `npm run typecheck` checks it against the same
 * types the app uses. Nothing in the app imports it.
 */

import { readFileSync } from "node:fs";
import { MOUNTAINS } from "@/data/mock/mountains";
import { haversine } from "@/tracking/filters";
import { hydrateCatalogue, searchCatalogue, type Peak } from "./peaks";

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number; cwd?: () => string } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
}

function check(condition: boolean, detail: string) {
  if (condition) {
    passCount += 1;
  } else {
    failures.push(`${currentCase}: ${detail}`);
  }
}

/* -------------------------------------------------------------------------- */
/* The file that ships                                                         */
/* -------------------------------------------------------------------------- */

/** Repo-relative read. `npm test` runs with the package directory as cwd. */
const root = proc?.cwd?.() ?? ".";
const raw = JSON.parse(readFileSync(`${root}/public/data/peaks.json`, "utf8")) as Parameters<
  typeof hydrateCatalogue
>[0];
const all: Peak[] = hydrateCatalogue(raw);

testCase("the catalogue is the world file, not the Alpine one");
check(all.length > 50_000, `expected the world catalogue, got ${all.length} rows`);

/* -------------------------------------------------------------------------- */
/* Every curated record links                                                  */
/* -------------------------------------------------------------------------- */

testCase("every curated objective resolves to a catalogue row");
for (const m of MOUNTAINS) {
  const linked = all.filter((p) => p.curatedId === m.id);
  check(linked.length >= 1, `${m.id} links to no catalogue row`);
  for (const p of linked) {
    const km = haversine(p, { lat: m.coords.lat, lon: m.coords.lon }) / 1000;
    check(km < 2, `${m.id} linked to ${p.name} ${km.toFixed(1)} km away`);
    check(
      Math.abs(p.elevationM - m.elevationM) <= 50,
      `${m.id} linked to ${p.name} at ${p.elevationM} m against ${m.elevationM} m`,
    );
  }
}

testCase("the three that used to miss are linked by the node they are mapped under");
const byName = (n: string) => all.find((p) => p.name === n);
check(byName("Cerro Aconcagua")?.curatedId === "aconcagua", "Cerro Aconcagua is not Aconcagua");
check(byName("Uhuru Peak")?.curatedId === "kilimanjaro", "Uhuru Peak is not Kilimanjaro");
check(byName("Kibo")?.curatedId === "kilimanjaro", "Kibo is not Kilimanjaro");
check(byName("Mytikas")?.curatedId === "mount-olympus", "Mytikas is not Mount Olympus");

testCase("a neighbouring summit does not impersonate the curated one");
check(byName("Mont Blanc du Tacul")?.curatedId === undefined, "Mont Blanc du Tacul borrowed Mont Blanc");
check(byName("Cerro Aconcagua Sur")?.curatedId === undefined, "Aconcagua Sur borrowed Aconcagua");
check(byName("Everest South Peak")?.curatedId === undefined, "the south peak borrowed Everest");

/* -------------------------------------------------------------------------- */
/* Names an English speaker types                                              */
/* -------------------------------------------------------------------------- */

testCase("the English name survives beside a Latin local name");
const ararat = all.find((p) => p.name === "Ağrı Dağı" && p.elevationM === 5137);
check(ararat?.englishName === "Mount Ararat", "Ağrı Dağı lost its English name");
check(byName("Batian")?.englishName === "Mount Kenya", "Batian lost its English name");

testCase("a non-Latin local name is shown under its English name");
const fuji = all.find((p) => p.localName === "富士山");
check(fuji?.name === "Mount Fuji", `富士山 is shown as ${fuji?.name}`);

testCase("search finds the famous peak first");
const first = (q: string) => searchCatalogue(all, q, 6)[0];
check(first("everest")?.curatedId === "everest", `"everest" led with ${first("everest")?.name}`);
check(first("fuji")?.name === "Mount Fuji", `"fuji" led with ${first("fuji")?.name}`);
check(first("ararat")?.englishName === "Mount Ararat", `"ararat" led with ${first("ararat")?.name}`);
check(first("kilimanjaro")?.curatedId === "kilimanjaro", `"kilimanjaro" led with ${first("kilimanjaro")?.name}`);
check(first("aconcagua")?.curatedId === "aconcagua", `"aconcagua" led with ${first("aconcagua")?.name}`);
check(first("olympus")?.curatedId === "mount-olympus", `"olympus" led with ${first("olympus")?.name}`);
check(first("ben nevis")?.curatedId === undefined && first("ben nevis")?.elevationM === 1345,
  `"ben nevis" led with ${first("ben nevis")?.name} ${first("ben nevis")?.elevationM} m`);

testCase("one curated mountain is one search row");
const kili = searchCatalogue(all, "kilimanjaro", 30).filter((p) => p.curatedId === "kilimanjaro");
check(kili.length === 1, `Kilimanjaro appears ${kili.length} times`);
const acon = searchCatalogue(all, "aconcagua", 30);
check(
  acon.filter((p) => p.curatedId === "aconcagua").length === 1 &&
    !acon.some((p) => p.name === "Cerro Aconcagua" && !p.curatedId),
  "Aconcagua is listed as a reference entry beside its own record",
);

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

if (failures.length === 0) {
  console.log(`peaks: ${passCount} passed`);
} else {
  console.log(`peaks: ${passCount} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (proc) proc.exitCode = 1;
}
