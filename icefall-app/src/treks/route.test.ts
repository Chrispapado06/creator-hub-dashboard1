/**
 * THE TREK ↔ OpenStreetMap MAPPING, CHECKED AGAINST THE CATALOGUE IT CLAIMS TO
 * DESCRIBE.
 *
 * WHY THIS FILE EXISTS. `osmRoutes.ts` is generated, and what it generates is a
 * claim of the most dangerous kind this app makes: that the line OSM holds
 * under relation N is the route this trek describes. A walker opens the map,
 * exports the GPX and follows it. Get one row wrong and somebody is on a
 * different mountain — which is why the matching script declines twice as often
 * as it matches, and why the shipped result is re-tested here rather than
 * trusted because a script wrote it.
 *
 * WHAT IT CAN AND CANNOT PROVE. It proves the file is internally coherent and
 * that the load-bearing test — the relation's measured length against the
 * distance the trek's own summary states — still holds for every row that ships.
 * It cannot prove a match is the right route; only reading the relation can do
 * that, and 55 of them were read by hand (see `scripts/audit-trek-osm.mjs`).
 * A regeneration that quietly relaxed the length rule, a hand-edit, or a trek
 * id that no longer exists would all fail here.
 *
 * It follows the three suites beside it exactly: a plain TypeScript program
 * with a small harness, inside `src/` so `npm run typecheck` checks it against
 * the same types the app uses. Nothing in the app imports it.
 */

import { TREK_RECORDS } from "./records";
import { TREK_ROUTES } from "./osmRoutes";
import type { TrekRoute } from "./route";

/* -------------------------------------------------------------------------- */
/* Harness — the same thirty lines as the three suites beside it               */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(`${currentCase} — ${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const rows = Object.entries(TREK_ROUTES) as [string, TrekRoute][];
const byId = new Map(TREK_RECORDS.map((t) => [t.id, t]));

/**
 * The distance the trek's own summary states, as a range — the same reading the
 * matching script does, deliberately re-implemented here rather than imported
 * from the script, so that a change to the script's parser cannot make this
 * test agree with it by construction.
 */
function statedKm(summary: string): [number, number] | null {
  const found: number[] = [];
  const re = /(\d[\d,.]*)\s*(?:to|–|—|-|and)?\s*(\d[\d,.]*)?\s*(km|kilometres|kilometers)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(summary))) {
    for (const raw of [m[1], m[2]]) {
      if (!raw) continue;
      const n = Number(String(raw).replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 3 && n <= 6000) found.push(n);
    }
  }
  return found.length ? [Math.min(...found), Math.max(...found)] : null;
}

/**
 * The same reading, discarded where the trek's own duration contradicts it.
 *
 * A number followed by "km" in a paragraph is not necessarily the route's
 * length — the Kumano Kodo's summary quotes 14 km for its hardest DAY, on a
 * four-to-six-day pilgrimage. Read as the whole route's distance it agreed with
 * a 12.2 km relation mapping a single pass, and that relation shipped as the
 * whole Kumano Kodo until 2026-09-09.
 *
 * Five kilometres a day at the bottom and forty at the top is the same band the
 * matching script holds an undistanced trek to, and it rejects only the grossly
 * implausible. Where the prose and the duration field disagree, the prose loses.
 */
function distanceStated(trek: { summary: string; durationDays: [number, number] | null }) {
  const stated = statedKm(trek.summary);
  if (!stated || !trek.durationDays) return stated;
  const [lo, hi] = trek.durationDays;
  return stated[1] / lo < 5 || stated[0] / hi > 40 ? null : stated;
}

/* -------------------------------------------------------------------------- */
/* 1 · Every row points at a trek that exists                                  */
/* -------------------------------------------------------------------------- */

testCase("Every mapped route belongs to a trek in the catalogue");

check(
  "there is at least one mapped route",
  rows.length > 0,
  `${rows.length} of ${TREK_RECORDS.length} treks have a line`,
);

const orphans = rows.filter(([id]) => !byId.has(id)).map(([id]) => id);
check("no row names a trek that does not exist", orphans.length === 0, orphans.join(", ") || "none");

/* -------------------------------------------------------------------------- */
/* 2 · No two treks claim the same line                                        */
/* -------------------------------------------------------------------------- */

/*
 * Two treks sharing one relation is not a tidiness problem. It means the app
 * would draw the same line under two different names, two durations and two
 * grades — so at least one of the two pages is lying about what it is showing.
 */
testCase("No relation is claimed by two treks");

const seen = new Map<number, string>();
const shared: string[] = [];
for (const [id, r] of rows) {
  const already = seen.get(r.osmId);
  if (already) shared.push(`r${r.osmId}: ${already} and ${id}`);
  else seen.set(r.osmId, id);
}
check("each OSM relation is used once", shared.length === 0, shared.join("; ") || "none");

/* -------------------------------------------------------------------------- */
/* 3 · The shape of every row                                                  */
/* -------------------------------------------------------------------------- */

testCase("Every row is a usable relation reference");

const badId = rows.filter(([, r]) => !Number.isInteger(r.osmId) || r.osmId <= 0);
check("every osmId is a positive integer", badId.length === 0, badId.map(([id]) => id).join(", ") || "none");

const badName = rows.filter(([, r]) => !r.osmName || r.osmName.trim().length === 0);
check("every row carries the relation's own name", badName.length === 0, badName.map(([id]) => id).join(", ") || "none");

const badLength = rows.filter(([, r]) => r.lengthKm !== null && !(r.lengthKm > 0));
check("no row carries a zero or negative length", badLength.length === 0, badLength.map(([id]) => id).join(", ") || "none");

const badBounds = rows.filter(([, r]) => {
  const [s, w, n, e] = r.bounds;
  return !(s < n) || !(w < e) || r.lat < s || r.lat > n || r.lon < w || r.lon > e;
});
check(
  "every bounding box is ordered and contains its own centre",
  badBounds.length === 0,
  badBounds.map(([id]) => id).join(", ") || "none",
);

const badConfidence = rows.filter(([, r]) => r.confidence !== "strong" && r.confidence !== "medium");
check("every row is graded strong or medium", badConfidence.length === 0, badConfidence.map(([id]) => id).join(", ") || "none");

/* -------------------------------------------------------------------------- */
/* 4 · Every row carries the evidence the page prints                          */
/* -------------------------------------------------------------------------- */

/*
 * The trek page shows these sentences under "How this line was matched". A row
 * with no evidence would put a line on the map with nothing behind it, which is
 * the one thing this whole mechanism exists to prevent.
 */
testCase("Every row carries its evidence");

const noEvidence = rows.filter(([, r]) => !Array.isArray(r.evidence) || r.evidence.length < 3);
check("every row lists at least three tests", noEvidence.length === 0, noEvidence.map(([id]) => id).join(", ") || "none");

const missingName = rows.filter(([, r]) => !r.evidence.some((e) => e.startsWith("name:")));
check("every row records what the name test found", missingName.length === 0, missingName.map(([id]) => id).join(", ") || "none");

const missingWays = rows.filter(([, r]) => !r.evidence.some((e) => /way members carry the line/.test(e)));
check("every row records that way members carry the line", missingWays.length === 0, missingWays.map(([id]) => id).join(", ") || "none");

const zeroWays = rows.filter(([, r]) => r.evidence.some((e) => /^0 way members/.test(e)));
check(
  "no row is a relation with no way members — the app would draw nothing",
  zeroWays.length === 0,
  zeroWays.map(([id]) => id).join(", ") || "none",
);

/* -------------------------------------------------------------------------- */
/* 5 · The length test still holds on the shipped data                         */
/* -------------------------------------------------------------------------- */

/*
 * THE ONE TEST THAT CAUGHT A REAL WRONG ANSWER. OSM maps the Pennine Way as
 * sections and as two dozen relations that all call themselves "Pennine Way",
 * the longest 190 km against the 431 km the catalogue states. Name agreement
 * alone would have handed a walker a third of the trail under the whole trail's
 * name; the distance the trek states is what refused it.
 */
testCase("A relation's measured length agrees with the distance its trek states");

const contradictions: string[] = [];
const untested: string[] = [];
for (const [id, r] of rows) {
  const trek = byId.get(id);
  if (!trek) continue;
  const stated = distanceStated(trek);
  if (!stated || r.lengthKm === null) {
    untested.push(id);
    continue;
  }
  const [lo, hi] = stated;
  if (r.lengthKm < lo * 0.7 || r.lengthKm > hi * 1.35)
    contradictions.push(`${id}: ${r.lengthKm} km mapped vs ${lo === hi ? lo : `${lo}–${hi}`} km stated`);
}
check("no shipped row contradicts its own summary", contradictions.length === 0, contradictions.join("; ") || "none");

/*
 * AND THE ROWS WITH NO USABLE DISTANCE ARE NOT UNTESTED. They fall to the band
 * the script holds them to instead — five to forty kilometres for each day the
 * catalogue says the route takes. It is a wide band on purpose: it exists to
 * catch a relation that maps a fragment of a route under the whole route's
 * name, which is the failure that put a 23.9 km line under the Annapurna Base
 * Camp Trek and a 12.2 km one under the whole Kumano Kodo.
 */
const implausible: string[] = [];
let banded = 0;
for (const id of untested) {
  const trek = byId.get(id);
  const r = TREK_ROUTES[id];
  if (!trek?.durationDays || !r || r.lengthKm === null) continue;
  banded++;
  const [lo, hi] = trek.durationDays;
  if (r.lengthKm < lo * 5 || r.lengthKm > hi * 40)
    implausible.push(`${id}: ${r.lengthKm} km for ${lo === hi ? lo : `${lo}–${hi}`} days`);
}
check(
  "no row without a stated distance is an implausible length for its own duration",
  implausible.length === 0,
  implausible.join("; ") || `${banded} rows held to the duration band`,
);
console.log(
  `  \x1b[2m${rows.length - untested.length} of ${rows.length} rows have a stated distance to test against;` +
    ` ${banded} more were held to the duration band, and ${rows.length - untested.length + banded} of ${rows.length}` +
    ` therefore had their length tested here.\x1b[0m`,
);

/* -------------------------------------------------------------------------- */

console.log(
  failures.length === 0
    ? `\n\x1b[1m${passCount} passed, 0 failed\x1b[0m`
    : `\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m\n${failures.map((f) => `  · ${f}`).join("\n")}`,
);
console.log(
  "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that any match is the right route. Only\n" +
    "reading the relation can prove that. 55 of these rows were read by hand on\n" +
    "2026-09-09 — every row that had changed, plus a seeded sample and every row\n" +
    "resting on the weakest evidence — against OSM's own API and, where the\n" +
    "relation carries one, its wikidata item. One was wrong and is no longer\n" +
    "here: the Via Francigena had taken the relation for its Italian leg.\x1b[0m",
);
if (failures.length > 0 && proc) proc.exitCode = 1;
