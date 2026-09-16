/**
 * Mountain mode Map and Trip tabs: the pure halves.
 *
 * Run: esbuild src/mountain/mapTrip.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --outfile=… && node …
 */

import { campsFor, HARVEST_DATE } from "@/data/mountainCamps";
import type { ChecklistItem } from "@/services/checklist";

import {
  MAP_NOT_SAVED,
  ROUTE_LINE_LABEL,
  campsAreOld,
  distanceLabel,
  placeReadings,
  type Place,
} from "./mapModel";
import type { KnownPosition } from "./position";
import { dateRange, dayHeadline, oldestSource, shortDate, visibleKit } from "./tripTabModel";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
let passCount = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const NOW = Date.UTC(2026, 8, 14, 9, 0, 0);
const fix = (ageMs: number, lat = 45.8, lon = 6.85): KnownPosition => ({
  lat,
  lon,
  accuracyM: 8,
  altitudeM: 3800,
  altitudeAccuracyM: 12,
  at: NOW - ageMs,
});
const north: Place = { name: "North", lat: 45.9, lon: 6.85, elevationM: null, kind: "Summit" };
const east: Place = { name: "East", lat: 45.8, lon: 6.95, elevationM: 3000, kind: "Mountain hut" };

console.log("\nMap: wording");
eq("the not-saved sentence is the plan's, word for word", MAP_NOT_SAVED,
  "ICEFALL shows the part of the map you have already looked at. It has not saved this area.");
eq("route label", ROUTE_LINE_LABEL, "Illustrative — not for navigation");
check("nothing claims a map was saved", !/saved \d|saved on|days ago/i.test(MAP_NOT_SAVED));

console.log("\nMap: distance and bearing only from a current fix");
eq("no fix → none", placeReadings([north], null, NOW).kind, "none");
{
  const r = placeReadings([north, east], fix(10_000), NOW);
  check("fresh fix → readings", r.kind === "readings");
  if (r.kind === "readings") {
    eq("due north is N", r.readings[0].point, "N");
    check("due north bearing ≈ 0°", r.readings[0].bearingDeg === 0, String(r.readings[0].bearingDeg));
    check("0.1° of latitude ≈ 11.1 km", Math.abs(r.readings[0].distanceM - 11_120) < 60, String(r.readings[0].distanceM));
    eq("due east is E", r.readings[1].point, "E");
    check("readings keep the place order", r.readings[1].place.name === "East");
  }
}
{
  const r = placeReadings([{ ...north, lat: 45.80005 }], fix(5000), NOW);
  check("a place inside the fix's accuracy is flagged, not given a bearing", r.kind === "readings" && r.readings[0].withinAccuracy);
  const far = placeReadings([north], fix(5000), NOW);
  check("a place 11 km away is not within accuracy", far.kind === "readings" && !far.readings[0].withinAccuracy);
}
eq("aged (4 min) still gives readings", placeReadings([north], fix(4 * 60_000), NOW).kind, "readings");
{
  const r = placeReadings([north], fix(40 * 60_000), NOW);
  check("stale (40 min) → withheld, no numbers", r.kind === "withheld");
  if (r.kind === "withheld") {
    check("withheld sentence states the age", r.sentence.startsWith("Your last position is 40 min old."), r.sentence);
    check("withheld sentence has no distance", !/\d+(\.\d)? ?(m|km)\b/.test(r.sentence.replace("40 min", "")), r.sentence);
  }
}
eq("silent (3 h) → withheld", placeReadings([north], fix(3 * 3600_000), NOW).kind, "withheld");
eq("a fix from the future is not trusted as older", placeReadings([north], fix(-5000), NOW).kind, "readings");

console.log("\nMap: labels");
eq("640 m", distanceLabel(637), "640 m");
eq("2.4 km", distanceLabel(2380), "2.4 km");
eq("38 km", distanceLabel(38_400), "38 km");
eq("never negative", distanceLabel(-3), "0 m");

console.log("\nMap: camp age (plan §3.0, 12 months)");
eq("harvest day is fresh", campsAreOld("2026-09-11", "2026-09-11"), false);
eq("one year to the day is still fresh", campsAreOld("2026-09-11", "2027-09-11"), false);
eq("a day over a year is old", campsAreOld("2026-09-11", "2027-09-12"), true);
eq("the shipped harvest date is fresh today", campsAreOld(HARVEST_DATE, "2026-09-14"), false);

console.log("\nMap: the example trip's hut is real data");
{
  const hut = campsFor("mont-blanc")?.camps.find((c) => c.name === "Refuge du Goûter");
  check("Refuge du Goûter exists in the camps data", !!hut);
  check("it carries real coordinates", !!hut && Number.isFinite(hut.lat) && Number.isFinite(hut.lon));
}

console.log("\nTrip: days and dates");
eq("during", dayHeadline({ kind: "during", dayNumber: 2, totalDays: 2 }), "Day 2 of 2");
eq("before, 6", dayHeadline({ kind: "before", daysToGo: 6 }), "Starts in 6 days");
eq("before, 1", dayHeadline({ kind: "before", daysToGo: 1 }), "Starts tomorrow");
eq("after, 3", dayHeadline({ kind: "after", daysSinceEnd: 3 }), "Dates ended 3 days ago");
eq("after, 1", dayHeadline({ kind: "after", daysSinceEnd: 1 }), "Dates ended yesterday");
eq("shortDate", shortDate("2026-09-13"), "13 Sep");
eq("same month range", dateRange("2026-09-13", "2026-09-14"), "13–14 Sep");
eq("cross-month range", dateRange("2026-09-30", "2026-10-02"), "30 Sep – 2 Oct");
eq("one-day range", dateRange("2026-09-14", "2026-09-14"), "14 Sep");

console.log("\nTrip: the numbers' age is the oldest read date");
{
  const src = (checked: string) => ({ source: { label: checked, url: "", kind: "issuer" as const, checked } });
  eq("oldest of three", oldestSource([src("2026-09-11"), src("2025-01-02"), src("2026-03-01")])?.checked, "2025-01-02");
  eq("none → null", oldestSource([]), null);
}

console.log("\nTrip: kit rows follow the full-app checklist rule");
{
  const item = (id: string, essential: boolean, category: ChecklistItem["category"] = "technical"): ChecklistItem => ({
    id, label: id, category, essential, thirdParty: true,
  });
  const items = [item("a", true), item("b", false), item("doc", true, "documents"), item("c", false)];
  eq("free plan: essentials, no documents", visibleKit(items, {}, { full: false, documents: false }).map((i) => i.id), ["a"]);
  eq("full plan: everything but documents", visibleKit(items, {}, { full: true, documents: false }).map((i) => i.id), ["a", "b", "c"]);
  eq("a recorded row always shows", visibleKit(items, { c: "have" }, { full: false, documents: false }).map((i) => i.id), ["a", "c"]);
  eq("documents with access", visibleKit(items, {}, { full: false, documents: true }).map((i) => i.id), ["a", "doc"]);
}

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  if (proc) proc.exitCode = 1;
}
