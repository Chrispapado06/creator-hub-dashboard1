/**
 * TEST SET FOR WHAT A WATCH IMPORT IS ALLOWED TO CLAIM.
 *
 * `npm run test:watch-map` — esbuild to node, like every other suite here.
 *
 * WHAT IT IS ACTUALLY PROVING. That translating a vendor's activity into an
 * ICEFALL record adds no fact the vendor did not state. The failure mode this
 * guards against is not a crash: it is a cross-country ski appearing in
 * somebody's history as a downhill run because "skiing" sounded close enough,
 * an e-bike ride counting as mountain biking in their training load, or an
 * imported summary quietly growing a GPS track and a maximum altitude it never
 * had.
 *
 *   Suite 1  the Suunto table is Suunto's own table — every key is an id that
 *            exists in the published list, every value is a real ICEFALL type.
 *   Suite 2  the entries ICEFALL deliberately REFUSES to make, one assertion
 *            each, so a later session cannot quietly add the nearest-sounding
 *            guess without a test turning red.
 *   Suite 3  the fallthrough is visible: "other", the vendor's own word kept,
 *            and the miss recorded so it can be reported.
 *   Suite 4  nothing measured is invented — no track, no altitude, no pace,
 *            and a one-duration vendor never produces a "moving time".
 *
 * WHAT IT DOES NOT PROVE. That any vendor has ever sent one of these. Suunto
 * gates its API behind a signed agreement and no Suunto activity has reached
 * this function; the table is written from Suunto's own published document,
 * and this suite fixes it in place so it stays that way.
 */

import { watchActivityToRecorded } from "./map";
import { recordUnmappedSport, unmappedSports, clearUnmappedSports } from "./unmappedSports";
import { ACTIVITY_TYPES } from "@/tracking/activities";
import type { ActivityTypeId } from "@/tracking/types";
import type { WatchActivity } from "./types";

/* A localStorage that exists only for this process. `unmappedSports.ts` is
   written to degrade to a silent no-op where storage is absent, which is
   correct in a private window and useless in a test — so the test supplies
   one rather than asserting nothing happened. */
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return;
  failures++;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

const KNOWN_TYPES = new Set<string>(ACTIVITY_TYPES.map((t) => t.id));

function sample(over: Partial<WatchActivity> = {}): WatchActivity {
  return {
    providerActivityId: "w-1",
    sport: "11",
    name: null,
    startedAt: "2026-09-01T05:30:00.000Z",
    utcOffsetMinutes: 120,
    durationSec: 7200,
    movingSec: null,
    distanceM: 12000,
    elevationGainM: 900,
    elevationLossM: 880,
    avgHeartRateBpm: 132,
    maxHeartRateBpm: 168,
    calories: 900,
    deviceName: "Suunto Vertical",
    vendorEntered: null,
    ...over,
  };
}

const typeOf = (sport: string) =>
  watchActivityToRecorded(sample({ sport }), "suunto").activityTypeId;

/* ---------------------------------------------------------------- Suite 1 -- */
/* Every id below appears in Suunto's published Activity ID list (read
   2026-09-11) with the name given beside it. This is the half of the table
   that IS claimed. */
const CLAIMED: [string, string, ActivityTypeId][] = [
  ["1", "Running", "outdoor-run"],
  ["2", "Cycling", "road-cycling"],
  ["10", "Mountain biking", "mountain-biking"],
  ["11", "Hiking", "hiking"],
  ["13", "Downhill skiing", "skiing"],
  ["21", "Swimming", "swimming"],
  ["22", "Trail running", "trail-run"],
  ["29", "Climbing", "rock-climbing"],
  ["30", "Snowboarding", "snowboarding"],
  ["31", "Ski touring", "ski-touring"],
  ["52", "Indoor cycling", "indoor-cycling"],
  ["53", "Treadmill", "treadmill-run"],
  ["61", "Standup paddling", "paddleboarding"],
  ["65", "Snow shoeing", "snowshoeing"],
  ["70", "Trekking", "trekking"],
  ["72", "Kayaking", "kayaking"],
  ["83", "Mountaineering", "mountaineering"],
  ["84", "Telemark skiing", "skiing"],
  ["85", "Openwater swimming", "swimming"],
  ["99", "Gravel cycling", "gravel-cycling"],
  ["103", "Track running", "track-run"],
  ["107", "Backcountry skiing", "ski-touring"],
  ["115", "Vertical running", "trail-run"],
  ["116", "Ski mountaineering", "ski-mountaineering"],
];

for (const [id, label, expected] of CLAIMED) {
  check(`suunto ${id} (${label}) → ${expected}`, typeOf(id) === expected, `got ${typeOf(id)}`);
  check(`${expected} is a real ICEFALL type`, KNOWN_TYPES.has(expected));
}

/* ---------------------------------------------------------------- Suite 2 -- */
/* THE REFUSALS. Each of these has an ICEFALL type that sounds close, and each
   of those types would state something Suunto did not. If a later session maps
   one of them, this suite says so. */
const REFUSED: [string, string, string][] = [
  ["0", "Walking", "ICEFALL has no walking type; hiking is a different activity"],
  ["3", "Cross-country skiing", "ICEFALL's `skiing` means downhill"],
  ["24", "Nordic walking", "still walking"],
  ["56", "Roller skiing", "not snow, not downhill"],
  ["59", "Track and field", "includes throws and jumps; `track-run` asserts running"],
  ["82", "Canoeing", "a canoe is not a kayak"],
  ["90", "Snorkeling", "Suunto files it under swimming; it is not swim training"],
  ["105", "E-biking", "a motor changes what the training was"],
  ["106", "E-mtb", "a motor changes what the training was"],
  ["110", "Splitboarding", "the ascent is the point and `snowboarding` drops it"],
  ["114", "Cyclocross", "no ICEFALL equivalent; gravel would be a different surface"],
  ["117", "Skate skiing", "cross-country, not downhill"],
  ["118", "Classic skiing", "cross-country, not downhill"],
  ["23", "Gym", "ICEFALL has no strength type at all"],
];

for (const [id, label, why] of REFUSED) {
  check(
    `suunto ${id} (${label}) stays "other" — ${why}`,
    typeOf(id) === "other",
    `got ${typeOf(id)}`,
  );
}

/* Nothing may be mapped for the three vendors whose sport values nobody has
   read. An entry appearing here would be a guess by definition. */
for (const provider of ["coros", "polar", "garmin"] as const) {
  const r = watchActivityToRecorded(sample({ sport: "11" }), provider);
  check(`${provider} maps nothing yet`, r.activityTypeId === "other", `got ${r.activityTypeId}`);
}

/* ---------------------------------------------------------------- Suite 3 -- */
clearUnmappedSports("suunto");
const unknown = watchActivityToRecorded(
  sample({ sport: "4242", providerActivityId: "w-unknown" }),
  "suunto",
);
check("an unknown sport is imported, not dropped", unknown.id === "import:suunto:w-unknown");
check("an unknown sport lands on other", unknown.activityTypeId === "other");
check(
  "the vendor's own word is kept",
  unknown.origin.kind === "imported" && unknown.origin.vendorSport === "4242",
);
check(
  "the miss is recorded so it can be reported",
  unmappedSports("suunto").some((u) => u.sport === "4242" && u.count === 1),
);
recordUnmappedSport("suunto", "4242", "w-again");
check(
  "a second sighting counts rather than duplicating",
  unmappedSports("suunto").filter((u) => u.sport === "4242").length === 1 &&
    unmappedSports("suunto").find((u) => u.sport === "4242")?.count === 2,
);

const mappedOne = watchActivityToRecorded(sample({ sport: "83" }), "suunto");
check(
  "a sport that mapped is NOT recorded as missing",
  !unmappedSports("suunto").some((u) => u.sport === "83"),
);
check(
  "a mapped sport still keeps the vendor's word",
  mappedOne.origin.kind === "imported" && mappedOne.origin.vendorSport === "83",
);

const noSport = watchActivityToRecorded(
  sample({ sport: "", providerActivityId: "w-none" }),
  "suunto",
);
check(
  "no sport at all reads as null, not an empty string",
  noSport.origin.kind === "imported" && noSport.origin.vendorSport === null,
);
check(
  "and is still recorded — a vendor that sends no sport is itself a finding",
  unmappedSports("suunto").some((u) => u.sport === ""),
);

clearUnmappedSports("suunto");
check("disconnecting clears the notes", unmappedSports("suunto").length === 0);

/* ---------------------------------------------------------------- Suite 4 -- */
/* NOTHING MEASURED IS INVENTED. A summary with no track must not grow one. */
const r = watchActivityToRecorded(sample(), "suunto");
check("no track", r.points.length === 0);
check("no splits", r.splits.length === 0);
check("no max altitude", r.maxAltitudeM === null);
check("no min altitude", r.minAltitudeM === null);
check("no average pace", r.avgPaceSecPerKm === null);
check("no average speed", r.avgSpeedMps === null);
check("no cadence", r.avgCadenceSpm === null);
check("no temperature", r.temperatureC === null);
check("no vertical rate", r.verticalRateMPerH === null);
check(
  "no capability is claimed",
  Object.values(r.capabilities).every((v) => v === false),
);
check(
  "a one-duration vendor never claims a measured moving time",
  r.origin.kind === "imported" &&
    r.origin.movingSecMeasured === false &&
    r.movingSec === r.durationSec,
);
const withMoving = watchActivityToRecorded(sample({ movingSec: 6600 }), "suunto");
check(
  "a vendor that DID measure moving time is believed",
  withMoving.origin.kind === "imported" &&
    withMoving.origin.movingSecMeasured === true &&
    withMoving.movingSec === 6600,
);
check("the vendor's own offset survives", r.startUtcOffsetMin === 120);
check("no zone name is invented", r.startTimeZone === null);
check("an import is never marked simulated", r.simulated === false);

if (failures) {
  console.error(`\n${failures} failing check(s).`);
  process.exit(1);
}
console.log("watch map: all checks passed");
