/**
 * Retrace maths: gaps, back-bearings, thinning, the phone compass, and when a
 * track rolls over.
 *
 * Run: esbuild src/mountain/geo.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --outfile=… && node …
 */

import { nextTrackRecord, type TrackRecord } from "./breadcrumbs";
import {
  AT_PLACE_RADIUS_M,
  CRUMB_GAP_MS,
  CRUMB_RULE,
  CRUMB_RULE_SAVER,
  backBearing,
  compassPoint,
  crumbDecision,
  haversine,
  headingFromOrientation,
  lastPlacePassed,
  nearestApproach,
  normaliseDeg,
  relativeBearing,
  splitTrack,
  trackShape,
  trueBearing,
  turnBetween,
  type TimedPoint,
} from "./geo";

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
  check(
    name,
    JSON.stringify(got) === JSON.stringify(want),
    `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
  );
const near = (name: string, got: number, want: number, tol: number) =>
  check(name, Math.abs(got - want) <= tol, `got ${got}, want ${want} ±${tol}`);

const T0 = Date.UTC(2026, 8, 14, 6, 0, 0);
const p = (
  minutes: number,
  lat: number,
  lon: number,
  accuracyM: number | null = 8,
): TimedPoint & { accuracyM: number | null } => ({
  t: T0 + minutes * 60_000,
  lat,
  lon,
  accuracyM,
});

console.log("\nAngles");
{
  eq("normalise wraps below zero", normaliseDeg(-90), 270);
  eq("normalise wraps above 360", normaliseDeg(450), 90);
  eq("back-bearing of north is south", backBearing(0), 180);
  eq("back-bearing of 200 is 20", backBearing(200), 20);
  eq("turn right 90", turnBetween(0, 90), 90);
  eq("turn left is negative", turnBetween(0, 270), -90);
  eq("turn takes the short way round", turnBetween(350, 10), 20);
  eq("bearing relative to a heading", relativeBearing(90, 45), 45);
  eq("relative bearing wraps", relativeBearing(10, 350), 20);
  near("true bearing north", trueBearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 0, 0.001);
  near("true bearing east", trueBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 90, 0.001);
  eq("compass point of 225", compassPoint(225), "SW");
}

console.log("\nA track with a hole in it is not one line");
{
  const points = [
    p(0, 45.8, 6.85),
    p(1, 45.801, 6.85),
    // Phone in a pocket for 40 minutes.
    p(41, 45.81, 6.85),
    p(42, 45.811, 6.85),
  ];
  const segs = splitTrack(points);
  eq(
    "split at the gap",
    segs.map((s) => s.length),
    [2, 2],
  );
  eq("no gap, one segment", splitTrack([p(0, 45.8, 6.85), p(4, 45.801, 6.85)]).length, 1);
  eq("gap threshold is 5 minutes", CRUMB_GAP_MS, 300_000);

  const shape = trackShape(points);
  eq("one break", shape.gaps, 1);
  eq("all four points kept", shape.points, 4);
  eq("first crumb is the start", shape.first?.t, T0);
  eq("last crumb is the newest", shape.last?.t, T0 + 42 * 60_000);
  eq("span is first to last", shape.spanMs, 42 * 60_000);
  // Two 0.001° hops of about 111 m each. The 40-minute hole is NOT counted.
  near("walked metres skip the hole", shape.walkedM, 222, 5);

  const unsorted = trackShape([p(2, 45.802, 6.85), p(0, 45.8, 6.85), p(1, 45.801, 6.85)]);
  eq("out-of-order input is sorted", unsorted.gaps, 0);
  eq("…and the start is still the oldest", unsorted.first?.t, T0);

  const empty = trackShape([]);
  eq("empty track has no start", empty.first, null);
  eq("empty track walked nothing", empty.walkedM, 0);
}

console.log("\nWhich camp the track was last at");
{
  const camp = { name: "Goûter Hut", lat: 45.8324, lon: 6.8365 };
  const other = { name: "Tête Rousse", lat: 45.8494, lon: 6.8347 };
  const points = [
    p(0, 45.8494, 6.8347), // at Tête Rousse
    p(120, 45.8324, 6.8365), // at the Goûter
    p(300, 45.84, 6.84), // on the way back down, between the two
  ];
  const passed = lastPlacePassed(points, [camp, other]);
  eq("the camp the track was at most recently", passed?.place.name, "Goûter Hut");
  eq("with the time it was there", passed?.at, T0 + 120 * 60_000);

  eq(
    "a camp the track never reached is not offered",
    lastPlacePassed([p(0, 45.9, 7.2)], [camp]),
    null,
  );
  eq("radius is 150 m", AT_PLACE_RADIUS_M, 150);

  const approach = nearestApproach(points, camp);
  near("closest approach is the crumb at the hut", approach?.distanceM ?? -1, 0, 1);
  eq("no track, no approach", nearestApproach([], camp), null);
}

console.log("\nThinning: enough crumbs to retrace, not enough to fill the phone");
{
  const first = p(0, 45.8, 6.85);
  eq("the first fix is always kept", crumbDecision(null, first), "keep");
  eq("a second fix a minute later is kept", crumbDecision(first, p(1, 45.8, 6.85)), "keep");
  eq(
    "a fix 10 s later, standing still, is not",
    crumbDecision(first, { ...first, t: first.t + 10_000 }),
    "too-soon",
  );
  eq(
    "…unless it moved 25 m",
    crumbDecision(first, { t: first.t + 10_000, lat: 45.8004, lon: 6.85, accuracyM: 8 }),
    "keep",
  );
  eq(
    "a 500 m-accurate fix is a guess, not a position",
    crumbDecision(first, p(5, 45.81, 6.85, 500)),
    "too-vague",
  );
  eq(
    "a fix with no stated accuracy is still kept",
    crumbDecision(first, p(5, 45.81, 6.85, null)),
    "keep",
  );
  eq(
    "an older fix arriving late is dropped",
    crumbDecision(p(5, 45.8, 6.85), p(2, 45.8, 6.85)),
    "out-of-order",
  );
  eq(
    "battery saver waits longer",
    crumbDecision(
      first,
      { t: first.t + 60_000, lat: 45.8, lon: 6.85, accuracyM: 8 },
      CRUMB_RULE_SAVER,
    ),
    "too-soon",
  );
  check(
    "saver writes less often than normal",
    CRUMB_RULE_SAVER.minIntervalMs > CRUMB_RULE.minIntervalMs,
  );
  check(
    "saver still refuses vague fixes",
    CRUMB_RULE_SAVER.worstAccuracyM === CRUMB_RULE.worstAccuracyM,
  );
}

console.log("\nThe phone's compass");
{
  eq(
    "iPhone heading is used as it comes",
    headingFromOrientation({ webkitCompassHeading: 214, webkitCompassAccuracy: 10 })?.headingDeg,
    214,
  );
  eq(
    "…and says where it came from",
    headingFromOrientation({ webkitCompassHeading: 214 })?.source,
    "ios",
  );
  eq(
    "an uncalibrated iPhone compass is no heading at all",
    headingFromOrientation({ webkitCompassHeading: 214, webkitCompassAccuracy: -1 }),
    null,
  );
  eq(
    "absolute alpha counts the other way round",
    headingFromOrientation({ alpha: 90, absolute: true })?.headingDeg,
    270,
  );
  eq("alpha 0 is north", headingFromOrientation({ alpha: 0, absolute: true })?.headingDeg, 0);
  eq(
    "a relative alpha is a number from nowhere",
    headingFromOrientation({ alpha: 90, absolute: false }),
    null,
  );
  eq("no alpha, no heading", headingFromOrientation({ absolute: true }), null);
  eq("no event, no heading", headingFromOrientation(null), null);
}

console.log("\nOne track per walk");
{
  const stored: TrackRecord = { id: "track-1", startedAt: T0, lastAt: T0 + 60 * 60_000 };
  eq(
    "a fix ten minutes later is the same walk",
    nextTrackRecord(stored, stored.lastAt + 600_000).id,
    "track-1",
  );
  eq(
    "…and moves the track on",
    nextTrackRecord(stored, stored.lastAt + 600_000).lastAt,
    stored.lastAt + 600_000,
  );
  check(
    "the next morning is a new walk",
    nextTrackRecord(stored, stored.lastAt + 13 * 60 * 60_000).id !== "track-1",
  );
  check(
    "a clock that went backwards starts a new walk",
    nextTrackRecord(stored, stored.lastAt - 60_000).id !== "track-1",
  );
  eq("nothing stored starts one", nextTrackRecord(null, T0).startedAt, T0);
}

console.log("\nDistance is the app's one implementation");
{
  near(
    "1° of latitude is about 111 km",
    haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }),
    111_195,
    200,
  );
  eq(
    "a point is no distance from itself",
    Math.round(haversine({ lat: 45.8, lon: 6.85 }, { lat: 45.8, lon: 6.85 })),
    0,
  );
}

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  if (proc) proc.exitCode = 1;
}
