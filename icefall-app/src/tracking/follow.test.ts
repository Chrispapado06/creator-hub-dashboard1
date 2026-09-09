/**
 * THE FOLLOW ENGINE, MEASURED AGAINST LINES WHOSE ANSWERS ARE KNOWN.
 *
 * WHY THIS FILE EXISTS. Every number this feature puts on a walker's screen —
 * how far off the line they are, which way the next point lies, how much route
 * is left — comes out of `follow.ts`, and a green typecheck says nothing about
 * whether a projection lands where it should. So the geometry is checked here
 * against synthetic routes built from metre offsets, where the right answer is
 * arithmetic rather than opinion, and against the two cases that would be most
 * dangerous to get wrong: a walker declared ON route while standing on a
 * different path, and a stale fix presented as a live position.
 *
 * It follows the four suites beside it exactly: a plain TypeScript program with
 * a small harness, inside `src/` so `npm run typecheck` checks it against the
 * same types the app uses. Nothing in the app imports it.
 */

import {
  AT_END_M,
  DIRECTION_MIN_M,
  OFF_ROUTE_M,
  bearing,
  buildFollowRoute,
  compassPoint,
  decodeBoundRoute,
  encodeBoundRoute,
  followReadout,
  project,
} from "./follow";
import type { LatLon } from "@/services/trails";

/* -------------------------------------------------------------------------- */
/* Harness — the same thirty lines as the four suites beside it               */
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

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/* -------------------------------------------------------------------------- */
/* A metre grid, so every expected answer is arithmetic                        */
/* -------------------------------------------------------------------------- */

/** Chamonix, near enough — the cosine matters and 46° is where this app lives. */
const ORIGIN = { lat: 45.9237, lon: 6.8694 };
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

/**
 * A point `east` metres east and `north` metres north of the origin.
 *
 * A FLAT GRID LAID ON A ROUND EARTH, and the tests below allow for it rather
 * than pretending otherwise. `follow.ts` measures with haversine — the great
 * circle — and a great circle between two points on the same parallel is
 * slightly shorter than the distance along that parallel. Measured here: a
 * kilometre of this grid is 998.9 haversine metres at 45.9°, so the grid's
 * metre labels are right to about 0.11%, and any test spanning a kilometre
 * carries a tolerance that says so. The alternative — trimming the engine's
 * answer to match the grid — would be testing the fixture, not the code.
 */
const at = (east: number, north: number): LatLon => ({
  lat: ORIGIN.lat + north / M_PER_DEG_LAT,
  lon: ORIGIN.lon + east / M_PER_DEG_LON,
});

/** A straight line running due east, a point every `stepM` metres. */
const eastLine = (lengthM: number, stepM: number): LatLon[] => {
  const pts: LatLon[] = [];
  for (let d = 0; d <= lengthM; d += stepM) pts.push(at(d, 0));
  return pts;
};

const LIVE = { accuracyM: 10, signalLost: false, gpsAvailable: true, permissionDenied: false };

/* -------------------------------------------------------------------------- */

testCase("Building the route");
{
  check("no line at all is not a route", buildFollowRoute([]) === null);
  check("a single point is not a route", buildFollowRoute([[at(0, 0)]]) === null);

  const r = buildFollowRoute([eastLine(1000, 100)])!;
  check("one path", r.pieces === 1);
  check("length is measured, not assumed", near(r.totalM, 1000, 2), `${r.totalM.toFixed(1)} m — the grid's own 0.11%`);

  const two = buildFollowRoute([eastLine(1000, 100), [at(3000, 0), at(4000, 0)]])!;
  check("two unjoined pieces stay two", two.pieces === 2);
  check(
    "the gap between pieces is NOT counted as route",
    near(two.totalM, 2000, 4),
    `${two.totalM.toFixed(1)} m — the 2 km gap is not in it`,
  );
}

testCase("Projection onto the line");
{
  const r = buildFollowRoute([eastLine(1000, 100)])!;

  const onIt = project(r, at(250, 0));
  check("a point on the line measures ~0 off it", onIt.offM < 1, `${onIt.offM.toFixed(2)} m`);
  check("and knows how far along it is", near(onIt.alongM, 250, 1), `${onIt.alongM.toFixed(1)} m`);

  const beside = project(r, at(250, 80));
  check("80 m north of the line measures 80 m off", near(beside.offM, 80, 1), `${beside.offM.toFixed(1)} m`);
  check("without moving along it", near(beside.alongM, 250, 1), `${beside.alongM.toFixed(1)} m`);

  /* PAST THE END, the nearest point is the end — not an extrapolation of the
     line beyond where OSM drew it. */
  const past = project(r, at(1200, 0));
  check("past the end clamps to the end", near(past.alongM, 1000, 2), `${past.alongM.toFixed(1)} m`);
  check("and reports the 200 m gap as distance off", near(past.offM, 200, 2), `${past.offM.toFixed(1)} m`);

  /* THE SEARCH IS EXHAUSTIVE. A second projection must not inherit the first's
     best distance — the bug this test exists to catch is a shared minimum that
     makes every projection after the first report the first one's answer. */
  const a = project(r, at(100, 5));
  const b = project(r, at(900, 300));
  check(
    "consecutive projections do not contaminate each other",
    a.offM < 6 && near(b.offM, 300, 2),
    `${a.offM.toFixed(1)} m then ${b.offM.toFixed(1)} m`,
  );
}

testCase("Off route, and what accuracy is allowed to excuse");
{
  const r = buildFollowRoute([eastLine(2000, 50)])!;
  const track = [at(0, 0), at(500, 0)];

  const on = followReadout(r, { ...LIVE, track: [...track, at(1000, 12)] });
  check("12 m off a line is on the line", on.value !== null && !on.value.offRoute);

  const off = followReadout(r, { ...LIVE, track: [...track, at(1000, 220)] });
  check(
    "220 m off with a ±10 m fix is off the line",
    off.value !== null && off.value.offRoute && near(off.value.offM, 220, 2),
    off.value ? `${off.value.offM.toFixed(0)} m off` : "",
  );

  /* A READING A BAD FIX CAN EXPLAIN IS NOT AN ALARM. */
  const vague = followReadout(r, {
    ...LIVE,
    accuracyM: 90,
    track: [...track, at(1000, 80)],
  });
  check(
    "80 m off from a ±90 m fix raises nothing",
    vague.value !== null && !vague.value.offRoute,
    `threshold ${OFF_ROUTE_M} m + the fix's own ±90 m`,
  );
  check(
    "but the measured distance is still reported",
    vague.value !== null && near(vague.value.offM, 80, 2),
    vague.value ? `${vague.value.offM.toFixed(0)} m` : "",
  );
}

testCase("Direction is measured from the walker's own track, never assumed");
{
  const r = buildFollowRoute([eastLine(2000, 50)])!;

  const tooEarly = followReadout(r, { ...LIVE, track: [at(0, 0), at(20, 0)] });
  check(
    `under ${DIRECTION_MIN_M} m of walking, direction is unknown`,
    tooEarly.value !== null && tooEarly.value.direction === null,
  );
  check(
    "and nothing is called 'remaining'",
    tooEarly.value !== null && tooEarly.value.remainingM === null,
  );
  check(
    "though both ends are still measured",
    tooEarly.value !== null &&
      near(tooEarly.value.toStartM, 20, 2) &&
      near(tooEarly.value.toEndM, 1980, 4),
    tooEarly.value ? `${tooEarly.value.toStartM.toFixed(1)} m back, ${tooEarly.value.toEndM.toFixed(1)} m on` : "",
  );

  /* SMALL STEPS STILL ADD UP. A walker taking 8 m between fixes needs six of
     them to clear the forty, and the search has to be willing to reach the
     first point of the track to find them — a bound written as "stop before
     index 1" would silently never look that far on any track this short. */
  const shuffling = Array.from({ length: 7 }, (_, i) => at(i * 8, 0));
  const crept = followReadout(r, { ...LIVE, track: shuffling });
  check(
    "seven eight-metre steps are enough to read a direction",
    crept.value?.direction === "forwards",
    `${shuffling.length} fixes over ${(shuffling.length - 1) * 8} m`,
  );

  const fwd = followReadout(r, { ...LIVE, track: [at(0, 0), at(100, 0), at(300, 0)] });
  check("walking with the line reads forwards", fwd.value?.direction === "forwards");
  check(
    "remaining is the distance to the line's end",
    fwd.value !== null && near(fwd.value.remainingM!, 1700, 4),
    fwd.value?.remainingM?.toFixed(0),
  );

  const back = followReadout(r, { ...LIVE, track: [at(1500, 0), at(1200, 0), at(1000, 0)] });
  check("walking against the line reads backwards", back.value?.direction === "backwards");
  check(
    "and remaining counts down to the line's start",
    back.value !== null && near(back.value.remainingM!, 1000, 3),
    back.value?.remainingM?.toFixed(0),
  );

  check(
    "the two ends always sum to the whole line",
    fwd.value !== null && near(fwd.value.toStartM + fwd.value.toEndM, r.totalM, 1),
  );
}

testCase("The next point is a real point on the line, and it is ahead of you");
{
  /* A dogleg: 500 m east, then 500 m north. The nodes are 10 m apart, so the
     literal "next point" would always be 10 m away and useless; the corner is
     what carries the route's shape and what a walker wants pointed at. */
  const leg1: LatLon[] = [];
  for (let d = 0; d <= 500; d += 10) leg1.push(at(d, 0));
  for (let d = 10; d <= 500; d += 10) leg1.push(at(500, d));
  const r = buildFollowRoute([leg1])!;

  const walking = followReadout(r, { ...LIVE, track: [at(0, 0), at(100, 0), at(200, 0)] });
  const next = walking.value?.next;
  check("there is a next point", !!next);
  check(
    "it is the corner, not the node ten metres away",
    !!next && near(next.distanceM, 300, 12),
    next ? `${next.distanceM.toFixed(0)} m ahead` : "",
  );
  check(
    "and it lies due east of the walker",
    !!next && near(next.bearingDeg, 90, 2),
    next ? `${next.bearingDeg.toFixed(1)}° true` : "",
  );

  /* PAST THE CORNER the next point is north, which is the whole point: the
     bearing follows the line rather than the walker's heading. */
  const turned = followReadout(r, {
    ...LIVE,
    track: [at(300, 0), at(450, 0), at(500, 100)],
  });
  check(
    "round the corner the next point lies north",
    !!turned.value?.next && near(turned.value.next.bearingDeg, 0, 3),
    turned.value?.next ? `${turned.value.next.bearingDeg.toFixed(1)}° true` : "",
  );

  /* WALKING BACK, the next point must be behind, not ahead. Getting this
     backwards would point a returning walker at the far end of the route. */
  const returning = followReadout(r, {
    ...LIVE,
    track: [at(500, 300), at(500, 100), at(400, 0)],
  });
  check(
    "walking back, the next point lies west",
    returning.value?.direction === "backwards" &&
      !!returning.value.next &&
      near(returning.value.next.bearingDeg, 270, 5),
    returning.value?.next ? `${returning.value.next.bearingDeg.toFixed(1)}° true` : "",
  );
}

testCase("The end of the line");
{
  const r = buildFollowRoute([eastLine(1000, 50)])!;
  const arrived = followReadout(r, { ...LIVE, track: [at(700, 0), at(900, 0), at(985, 0)] });
  check(
    `within ${AT_END_M} m of the last point, atEnd is true`,
    arrived.value?.atEnd === true,
    `${arrived.value?.remainingM?.toFixed(0)} m of line left`,
  );

  const notYet = followReadout(r, { ...LIVE, track: [at(500, 0), at(700, 0), at(800, 0)] });
  check("200 m short of it, atEnd is false", notYet.value?.atEnd === false);

  /* STANDING ON THE LAST POINT there is nothing ahead to point at, and the
     bearing between a point and itself is a convention rather than a
     measurement — so there is no next point at all. */
  const onTheLastPoint = followReadout(r, { ...LIVE, track: [at(800, 0), at(950, 0), at(1000, 0)] });
  check(
    "on the last point, there is no next point rather than one 0 m away",
    onTheLastPoint.value?.next === null,
    `remaining ${onTheLastPoint.value?.remainingM?.toFixed(0)} m`,
  );
  check("and it is still reported as the end of the line", onTheLastPoint.value?.atEnd === true);

  /* A POINT FURTHER OFF THAN THE FIX CAN RESOLVE is still a real target. */
  const wellShort = followReadout(r, { ...LIVE, track: [at(0, 0), at(100, 0), at(300, 0)] });
  check(
    "a point genuinely ahead survives the floor",
    !!wellShort.value?.next && wellShort.value.next.distanceM > 5,
    wellShort.value?.next ? `${wellShort.value.next.distanceM.toFixed(0)} m` : "",
  );

  /* atEnd is about the LINE, not about the walk, and it must not fire on
     somebody who happens to be near the start while walking towards the end. */
  const atStart = followReadout(r, { ...LIVE, track: [at(200, 0), at(100, 0), at(30, 0)] });
  check(
    "walking backwards, the line's start is the end being approached",
    atStart.value?.direction === "backwards" && atStart.value.atEnd === true,
  );
}

testCase("No position is an absence with a reason, never a stale dot");
{
  const r = buildFollowRoute([eastLine(1000, 50)])!;
  const track = [at(0, 0), at(400, 0)];

  const denied = followReadout(r, { ...LIVE, track, permissionDenied: true });
  check("permission refused says so", denied.value === null && denied.reason === "needs-permission");

  const noGps = followReadout(r, { ...LIVE, track, gpsAvailable: false });
  check("no GPS at all says so", noGps.value === null && noGps.reason === "no-gps");

  const lost = followReadout(r, { ...LIVE, track, signalLost: true });
  check(
    "A LOST FIX IS NOT A POSITION",
    lost.value === null && lost.reason === "signal-lost",
    "the last point is still in the track and is still not where the walker is",
  );

  const nothingYet = followReadout(r, { ...LIVE, track: [] });
  check("before the first fix, acquiring", nothingYet.value === null && nothingYet.reason === "awaiting-signal");

  /* ⚠ THE MISSING THING HAS TO BE NAMED CORRECTLY. Before this, a route whose
     geometry had not arrived was reported as "awaiting-signal" — waiting for a
     fix — over a phone with an excellent one. Caught driving the Snowman Trek,
     whose relation Overpass takes twenty seconds to answer for. */
  const lineComing = followReadout(null, { ...LIVE, track });
  check(
    "a line that has not arrived says so, and does not blame the GPS",
    lineComing.value === null && lineComing.reason === "line-loading",
    `read ${lineComing.value === null ? lineComing.reason : "a value"}`,
  );

  const lineGone = followReadout(null, { ...LIVE, track, lineFailed: true });
  check(
    "and a line that is not coming is different news again",
    lineGone.value === null && lineGone.reason === "line-failed",
  );

  /* THE PHONE'S PROBLEMS STILL COME FIRST. With no fix at all, "no GPS" is the
     more useful answer than "no line", because the line will not help. */
  const neither = followReadout(null, { ...LIVE, track, gpsAvailable: false });
  check("no GPS outranks no line", neither.value === null && neither.reason === "no-gps");
}

testCase("Bearings are true, and named");
{
  check("due north is 0°", near(bearing(at(0, 0), at(0, 1000)), 0, 0.5));
  check("due east is 90°", near(bearing(at(0, 0), at(1000, 0)), 90, 0.5));
  check("due south is 180°", near(bearing(at(0, 0), at(0, -1000)), 180, 0.5));
  check("due west is 270°", near(bearing(at(0, 0), at(-1000, 0)), 270, 0.5));
  check("0° is N", compassPoint(0) === "N");
  check("90° is E", compassPoint(90) === "E");
  check("225° is SW", compassPoint(225) === "SW");
  check("350° wraps back to N", compassPoint(350) === "N");
}

testCase("A circuit knows that its two ends are one place");
{
  /* A square kilometre loop, closed: 1 km east, 1 km north, 1 km west, 1 km
     back — the Tour du Mont Blanc's shape in miniature. */
  const loop: LatLon[] = [];
  for (let d = 0; d <= 1000; d += 50) loop.push(at(d, 0));
  for (let d = 50; d <= 1000; d += 50) loop.push(at(1000, d));
  for (let d = 950; d >= 0; d -= 50) loop.push(at(d, 1000));
  for (let d = 950; d >= 0; d -= 50) loop.push(at(0, d));
  const r = buildFollowRoute([loop])!;
  check("the loop is recognised as closed", r.closed === true);

  const open = buildFollowRoute([eastLine(1000, 50)])!;
  check("a line that does not return is not", open.closed === false);

  const read = followReadout(r, { ...LIVE, track: [at(0, 200), at(0, 100), at(0, 5)] });
  check("the reading carries the circuit through to the screen", read.value?.closed === true);
  /* `atEnd` IS TRUE HERE, AND THAT IS THE CORRECT ANSWER. It is a claim about
     the LINE — "you are within 60 m of the end you are walking towards" — and
     on the closing leg of a loop that is exactly where this walker is. What it
     is NOT is a claim that they have walked the circuit: the same coordinates
     are also the start, `closed` is how the screen says so, and no figure here
     pretends to tell one from the other. */
  check(
    "coming down the closing leg, the end of the line is the end of the line",
    read.value?.direction === "forwards" && read.value.atEnd === true,
    `${read.value?.remainingM?.toFixed(0)} m of line left`,
  );

  /* ARRIVING AT THE JOIN FROM THE OTHER SIDE is a jump of a whole loop in
     along-line terms, and nobody walked that in forty metres. The engine
     declines to read a direction from it rather than inventing one. */
  const acrossTheJoin = followReadout(r, { ...LIVE, track: [at(200, 0), at(100, 0), at(5, 0)] });
  check(
    "walking back into the start, direction is refused rather than guessed",
    acrossTheJoin.value?.direction === "backwards" || acrossTheJoin.value?.direction === null,
    `read ${acrossTheJoin.value?.direction}`,
  );
}

testCase("Crossing a gap between pieces");
{
  /* Two pieces 2 km apart — the Snowman Trek's shape, in miniature. */
  const r = buildFollowRoute([eastLine(1000, 50), [at(3000, 0), at(3500, 0), at(4000, 0)]])!;
  const inGap = followReadout(r, { ...LIVE, track: [at(1500, 0), at(1800, 0), at(2000, 0)] });
  check("the walk is still measured against the nearest piece", inGap.value !== null);
  check(
    "and standing in the gap reads as off the line",
    inGap.value?.offRoute === true,
    inGap.value ? `${(inGap.value.offM / 1000).toFixed(2)} km from the mapped line` : "",
  );
  check("the pieces are counted, so the UI can say so", inGap.value?.pieces === 2);
}

testCase("Binding a route to an activity survives a round trip");
{
  const bound = { osmId: 16287, name: "West Highland Way" };
  const back = decodeBoundRoute(new URLSearchParams(encodeBoundRoute(bound)));
  check("id survives", back?.osmId === 16287);
  check("name survives", back?.name === "West Highland Way");
  check(
    "a name with a slash and an accent survives too",
    decodeBoundRoute(
      new URLSearchParams(encodeBoundRoute({ osmId: 9, name: "Tour du Mont Blanc / TMB" })),
    )?.name === "Tour du Mont Blanc / TMB",
  );
  check("no route param is no binding", decodeBoundRoute(new URLSearchParams("")) === null);
  check("a junk id is no binding", decodeBoundRoute(new URLSearchParams("route=nonsense")) === null);
}

/* -------------------------------------------------------------------------- */

console.log(
  failures.length === 0
    ? `\n\x1b[1m${passCount} passed, 0 failed\x1b[0m`
    : `\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m\n${failures.map((f) => `  · ${f}`).join("\n")}`,
);
console.log(
  "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that the line any of this is measured\n" +
    "against is the right line. That is the trek↔OSM match, tested next door in\n" +
    "route.test.ts and read by hand in scripts/audit-trek-osm.mjs. Nor does it\n" +
    "prove the screen renders what the engine returns — that was driven in the\n" +
    "running app.\x1b[0m",
);
if (failures.length > 0 && proc) proc.exitCode = 1;
