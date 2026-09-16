/**
 * The Now tab's pure logic: the on-phone sun calculation against published
 * values, the day label's date guard, the altitude error bar and ascent rule.
 *
 * Reference times are from the sunrise-sunset.org API (UTC, fetched 14 Sep
 * 2026) for the coordinates given, all for a sea-level horizon, so every
 * comparison uses altitude null.
 *
 * Civil twilight has one definition (sun 6 degrees down) and must agree within
 * 30 seconds: that proves the sun's position. Sunrise and sunset do NOT agree
 * exactly, on purpose: that service puts the horizon about 0.27 degrees lower
 * than NOAA's standard 90.833 degrees, so its days run 2-11 minutes longer.
 * ICEFALL keeps NOAA's value, which is the cautious side — so the check is
 * that our sunset is never LATER than the reference, and not far earlier.
 *
 * Run: npm run test:mountain-now
 */

import { clockLooksWrong, daylightAt, horizonDipDeg, sunDay } from "./daylight";
import {
  altitudeReading,
  ascentLabel,
  compassPoint,
  countdownDigits,
  dayLabel,
  FORECAST_FAILED,
  FORECAST_NO_COORDS,
  FORECAST_NO_SIGNAL,
  forecastFigures,
  forecastSubject,
  forecastView,
  nearestCamp,
  NEXT_FROM_ITINERARY,
  NO_PLAN_STATUS,
  NO_PLAN_TIMES,
  NO_ROUTE_ORDER,
  NO_TRACK_IN_WINDOW,
  NO_TRIP_OPEN,
  NOT_ENOUGH_WATCHED,
  paceAscentLabel,
  paceOverWindow,
  paceUnavailable,
  placeReading,
  placeRowSpecs,
  speedLabel,
  splitUnit,
  trueBearing,
  verticalRateLabel,
  type NowConditions,
  type PacePoint,
} from "./nowModel";
import type { KnownPosition } from "./position";
import type { MountainTrip } from "./tripModel";

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

/** Within `tolMin` minutes of an ISO time. */
function near(name: string, gotMs: number | null, wantIso: string, tolMin = 2) {
  const want = Date.parse(wantIso);
  const diff = gotMs === null ? Infinity : Math.abs(gotMs - want) / 60_000;
  check(
    name,
    diff <= tolMin,
    gotMs === null
      ? "got null"
      : `got ${new Date(gotMs).toISOString()}, want ${wantIso}, off ${diff.toFixed(2)} min`,
  );
}

/* -------------------------------------------------------------------------- */
console.log("\nSun: published values");

const cases: Array<{
  name: string;
  date: string;
  lat: number;
  lon: number;
  sunrise: string;
  sunset: string;
  dawn?: string;
  dusk?: string;
}> = [
  {
    name: "Mont Blanc, 21 Jun 2026",
    date: "2026-06-21",
    lat: 45.8326,
    lon: 6.8652,
    sunrise: "2026-06-21T03:40:37Z",
    sunset: "2026-06-21T19:28:06Z",
    dawn: "2026-06-21T03:04:04Z",
    dusk: "2026-06-21T20:04:39Z",
  },
  {
    name: "Everest, 21 Dec 2026",
    date: "2026-12-21",
    lat: 27.9881,
    lon: 86.925,
    sunrise: "2026-12-21T00:57:55Z",
    sunset: "2026-12-21T11:22:33Z",
    dawn: "2026-12-21T00:33:30Z",
    dusk: "2026-12-21T11:46:58Z",
  },
  {
    name: "Kilimanjaro, 20 Mar 2026 (south of the equator)",
    date: "2026-03-20",
    lat: -3.0674,
    lon: 37.3556,
    sunrise: "2026-03-20T03:33:38Z",
    sunset: "2026-03-20T15:42:29Z",
    dusk: "2026-03-20T16:02:06Z",
  },
  {
    name: "Denali, 21 Jun 2026 (sunset on the next UTC day)",
    date: "2026-06-21",
    lat: 63.0692,
    lon: -151.007,
    sunrise: "2026-06-21T11:49:41Z",
    sunset: "2026-06-22T08:22:11Z",
  },
  {
    name: "Aconcagua, 14 Sep 2026 (west, south)",
    date: "2026-09-14",
    lat: -32.6532,
    lon: -70.0109,
    sunrise: "2026-09-14T10:38:33Z",
    sunset: "2026-09-14T22:32:30Z",
    dawn: "2026-09-14T10:15:16Z",
    dusk: "2026-09-14T22:55:48Z",
  },
];

/** Ours minus the reference, in minutes. */
const offMin = (got: number | null, iso: string) =>
  got === null ? NaN : (got - Date.parse(iso)) / 60_000;

for (const c of cases) {
  const d = sunDay(c.date, c.lat, c.lon, null);
  const set = offMin(d.sunset, c.sunset);
  const rise = offMin(d.sunrise, c.sunrise);
  check(
    `${c.name}: sunset never later than the reference, within 6 min`,
    set <= 0 && set > -6,
    `${set.toFixed(2)} min`,
  );
  check(
    `${c.name}: sunrise never earlier than the reference, within 6 min`,
    rise >= 0 && rise < 6,
    `${rise.toFixed(2)} min`,
  );
  const noon = ((d.sunrise as number) + (d.sunset as number)) / 2;
  const refNoon = (Date.parse(c.sunrise) + Date.parse(c.sunset)) / 2;
  check(
    `${c.name}: solar noon within 30 s`,
    Math.abs(noon - refNoon) <= 30_000,
    `${((noon - refNoon) / 1000).toFixed(0)} s`,
  );
  if (c.dawn) near(`${c.name}: civil dawn`, d.civilDawn, c.dawn, 0.5);
  if (c.dusk) near(`${c.name}: civil dusk`, d.civilDusk, c.dusk, 0.5);
  eq(`${c.name}: not polar`, d.polar, null);
}

console.log("\nSun: polar days");
{
  const winter = sunDay("2026-12-21", 69.65, 18.96, null);
  eq("Tromsø, 21 Dec: polar night", winter.polar, "polar-night");
  eq("Tromsø, 21 Dec: no sunrise", winter.sunrise, null);
  near("Tromsø, 21 Dec: civil twilight still begins", winter.civilDawn, "2026-12-21T08:31:12Z", 1);
  near("Tromsø, 21 Dec: civil twilight still ends", winter.civilDusk, "2026-12-21T12:53:11Z", 1);

  const summer = sunDay("2026-06-21", 69.65, 18.96, null);
  eq("Tromsø, 21 Jun: midnight sun", summer.polar, "midnight-sun");
  eq("Tromsø, 21 Jun: no sunset", summer.sunset, null);
  eq(
    "Tromsø, 21 Jun: daylightAt says midnight sun",
    daylightAt(Date.parse("2026-06-21T12:00:00Z"), "2026-06-21", "2026-06-22", 69.65, 18.96).kind,
    "midnight-sun",
  );
}

console.log("\nSun: altitude");
{
  eq("no dip at sea level", horizonDipDeg(0), 0);
  eq("no dip for an unknown altitude", horizonDipDeg(null), 0);
  eq("no dip below sea level", horizonDipDeg(-20), 0);
  const low = sunDay("2026-06-21", 45.8326, 6.8652, null);
  const high = sunDay("2026-06-21", 45.8326, 6.8652, 4000);
  const laterMin = ((high.sunset as number) - (low.sunset as number)) / 60_000;
  check(
    "4,000 m sets roughly ten minutes later than sea level",
    laterMin > 8 && laterMin < 16,
    `${laterMin.toFixed(1)} min`,
  );
  const earlierMin = ((low.sunrise as number) - (high.sunrise as number)) / 60_000;
  check(
    "…and rises earlier by the same",
    Math.abs(earlierMin - laterMin) < 1.5,
    `${earlierMin.toFixed(1)} vs ${laterMin.toFixed(1)}`,
  );
  eq("altitude does not move civil dusk", high.civilDusk, low.civilDusk);
}

console.log("\nDaylight now");
{
  const args = ["2026-06-21", "2026-06-22", 45.8326, 6.8652, null] as const;
  const at = (iso: string) => daylightAt(Date.parse(iso), ...args);

  const before = at("2026-06-21T02:00:00Z");
  eq("02:00 UTC is before sunrise", before.kind, "before-sunrise");

  const day = at("2026-06-21T18:28:06Z");
  eq("an hour before sunset is day", day.kind, "day");
  if (day.kind === "day") {
    near(
      "…msToSunset reaches sunset",
      Date.parse("2026-06-21T18:28:06Z") + day.msToSunset,
      "2026-06-21T19:26:19Z",
      1,
    );
    check(
      "…twilight after sunset is about 36 min",
      day.msTwilight !== null && Math.abs(day.msTwilight / 60_000 - 38.3) < 2,
      String(day.msTwilight),
    );
  }

  eq("between sunset and civil dusk is twilight", at("2026-06-21T19:45:00Z").kind, "twilight");

  const dark = at("2026-06-21T22:00:00Z");
  eq("after civil dusk is dark", dark.kind, "dark");
  if (dark.kind === "dark") {
    check(
      "…next sunrise is tomorrow morning",
      dark.nextSunrise !== null &&
        Math.abs(dark.nextSunrise - Date.parse("2026-06-22T03:40:50Z")) < 3 * 60_000,
    );
  }
}

console.log("\nPhone clock check");
{
  eq("Paris summer time on Mont Blanc is fine", clockLooksWrong(120, 6.8652), false);
  eq("Nepal time on Everest is fine", clockLooksWrong(345, 86.925), false);
  eq("China time on the north side of Everest is fine", clockLooksWrong(480, 86.925), false);
  eq("Alaska summer time on Denali is fine", clockLooksWrong(-480, -151.007), false);
  eq("Argentina time on Aconcagua is fine", clockLooksWrong(-180, -70.0109), false);
  eq("a Paris phone on Everest is flagged", clockLooksWrong(120, 86.925), true);
  eq("a New York phone on Mont Blanc is flagged", clockLooksWrong(-240, 6.8652), true);
  eq("across the date line: NZ time at 179°W is fine", clockLooksWrong(720, -179), false);
}

/* -------------------------------------------------------------------------- */
console.log("\nDay label");

const trip = (over: Partial<MountainTrip> = {}): MountainTrip => ({
  source: "trip",
  id: "t1",
  name: "Mont Blanc trip",
  mountainId: "mont-blanc",
  peakName: "Mont Blanc",
  peakElevationM: 4806,
  summit: null,
  routeName: null,
  startDate: "2026-09-13",
  endDate: "2026-09-17",
  record: null,
  itinerary: null,
  notice: null,
  ...over,
});

eq("no trip", dayLabel(null, null, null, false), NO_TRIP_OPEN);
eq(
  "before: never a negative day",
  dayLabel(trip(), { kind: "before", daysToGo: 6 }, null, false),
  "Mont Blanc · starts in 6 days",
);
eq(
  "before: one day",
  dayLabel(trip(), { kind: "before", daysToGo: 1 }, null, false),
  "Mont Blanc · starts in 1 day",
);
eq(
  "after: never day 92",
  dayLabel(trip(), { kind: "after", daysSinceEnd: 88 }, null, false),
  "Mont Blanc · dates have passed",
);
eq(
  "during but closed",
  dayLabel(trip(), { kind: "during", dayNumber: 2, totalDays: 5 }, null, false),
  "Mont Blanc · trip ended",
);
eq(
  "during, no itinerary",
  dayLabel(trip(), { kind: "during", dayNumber: 2, totalDays: 5 }, null, true),
  "Day 2 of 5 · Mont Blanc",
);
eq(
  "during, summit day of an itinerary",
  dayLabel(
    trip(),
    { kind: "during", dayNumber: 2, totalDays: 2 },
    { date: "2026-09-14", dayNumber: 2, label: "x", sleepAt: null, summitDay: true },
    true,
  ),
  "Day 2 · Summit · Mont Blanc",
);
eq(
  "no peak name falls back to the trip name",
  dayLabel(trip({ peakName: null }), { kind: "during", dayNumber: 1, totalDays: 1 }, null, true),
  "Day 1 of 1 · Mont Blanc trip",
);

console.log("\nCountdown digits");
eq("4 h 12 min", countdownDigits(4 * 3600_000 + 12 * 60_000 + 59_000).digits, "4:12");
eq("exactly an hour", countdownDigits(3600_000).digits, "1:00");
eq("28 min 5 s", countdownDigits(28 * 60_000 + 5_000).digits, "28:05");
eq("never negative", countdownDigits(-5000).digits, "0:00");

console.log("\nA number and its unit (the mockup sets the unit lighter)");
eq("metres split off", splitUnit("4,180 m"), { value: "4,180", unit: "m" });
eq("an approximation keeps its sign", splitUnit("≈4,100 m"), { value: "≈4,100", unit: "m" });
eq("kilometres", splitUnit("1.9 km"), { value: "1.9", unit: "km" });
eq("a temperature", splitUnit("−7 °C"), { value: "−7", unit: "°C" });
eq("a duration is never cut in half", splitUnit("9 h 10 min"), {
  value: "9 h 10 min",
  unit: null,
});
eq("a word has no unit to lighten", splitUnit("Dark"), { value: "Dark", unit: null });
eq("nor does a sentence", splitUnit("No turnaround time set."), {
  value: "No turnaround time set.",
  unit: null,
});

check(
  "the plan-status slot says it cannot be computed, and does not guess",
  NO_PLAN_STATUS.startsWith("Not known.") && NO_PLAN_STATUS.includes("no planned times"),
);

/* -------------------------------------------------------------------------- */
console.log("\nAltitude and ascent");

const pos = (over: Partial<KnownPosition> = {}): KnownPosition => ({
  lat: 45.85,
  lon: 6.82,
  accuracyM: 8,
  altitudeM: 3790.4,
  altitudeAccuracyM: 12.3,
  at: 0,
  ...over,
});

eq("with accuracy", altitudeReading(pos(), "fresh"), {
  kind: "reading",
  figure: "3,790 m",
  qualifier: "± 12 m · GPS",
  subtractable: true,
});
eq(
  "no stated accuracy: nearest 50 m, said so",
  altitudeReading(pos({ altitudeAccuracyM: null, altitudeM: 4128 }), "aged"),
  {
    kind: "reading",
    figure: "≈4,150 m",
    qualifier: "GPS, this phone did not say how accurate",
    subtractable: false,
  },
);
eq("an hour-old fix is withheld", altitudeReading(pos(), "silent").kind, "none");
eq("no fix at all", altitudeReading(null, null).kind, "none");
eq("a fix with no altitude", altitudeReading(pos({ altitudeM: null }), "fresh").kind, "none");

const hut = { name: "Refuge du Goûter", lat: 45.8506, lon: 6.8285, elevationM: 3835 };
{
  const r = placeReading(hut, pos(), "fresh");
  check(
    "distance to a hut ~ 700 m",
    r !== null && r.distanceM > 600 && r.distanceM < 800,
    String(r?.distanceM),
  );
  eq("ascent when both heights and an accuracy exist", r?.ascentM, 45);
  eq("a direction from a fresh fix", r?.direction, "E");
  eq("stale fix: no direction", placeReading(hut, pos(), "stale")?.direction, null);
  eq("silent fix: no reading at all", placeReading(hut, pos(), "silent"), null);
  const noAcc = placeReading(hut, pos({ altitudeAccuracyM: null }), "fresh");
  eq("unknown vertical accuracy withholds ascent", noAcc?.ascentM, null);
  check("…and says why", !!noAcc?.ascentMissing);
  eq(
    "a place with no recorded height has no ascent",
    placeReading({ ...hut, elevationM: null }, pos(), "fresh")?.ascentM,
    null,
  );
}
eq("ascent label up", ascentLabel(280), "280 m to climb");
eq("ascent label down", ascentLabel(-1200), "1,200 m below you");
eq("ascent label level", ascentLabel(4), "About level with you");

{
  const camps = [
    { ...hut, kind: "hut" as const, osmTag: "", osmType: "node" as const, osmId: 1 },
    {
      name: "Far",
      lat: 45.9,
      lon: 6.9,
      elevationM: 3000,
      kind: "hut" as const,
      osmTag: "",
      osmType: "node" as const,
      osmId: 2,
    },
  ];
  eq("nearest camp", nearestCamp(camps, pos())?.name, "Refuge du Goûter");
  eq("nearest camp of none", nearestCamp([], pos()), null);
}

eq("bearing due north", compassPoint(trueBearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })), "N");
eq("bearing due west", compassPoint(trueBearing({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })), "W");

/* -------------------------------------------------------------------------- */
console.log("\nWhich places are drawn, and on what grounds");

{
  const camps = [
    { ...hut, kind: "hut" as const, osmTag: "", osmType: "node" as const, osmId: 1 },
    {
      name: "Tête Rousse",
      lat: 45.86,
      lon: 6.82,
      elevationM: 3167,
      kind: "hut" as const,
      osmTag: "",
      osmType: "node" as const,
      osmId: 2,
    },
  ];
  const base = {
    summit: { lat: 45.8326, lon: 6.8652 },
    peakName: "Mont Blanc",
    peakElevationM: 4806,
    camps,
    pos: pos(),
  };

  const noPlan = placeRowSpecs({ ...base, itinerarySleep: null });
  eq(
    "with no itinerary: summit, then the NEAREST hut",
    noPlan.map((r) => r.heading),
    ["Summit", "Nearest recorded hut"],
  );
  eq("and it says it cannot know which is next", noPlan[1].basis, NO_ROUTE_ORDER);

  // Tonight is the FURTHER of the two huts — the plan, not the closest thing.
  const planned = placeRowSpecs({ ...base, itinerarySleep: camps[1] });
  eq(
    "with an itinerary the next camp comes first",
    planned.map((r) => r.heading),
    ["Next camp", "Summit", "Nearest recorded hut"],
  );
  eq("the next camp is the itinerary's, not the closest", planned[0].place.name, "Tête Rousse");
  eq("and it says where that came from", planned[0].basis, NEXT_FROM_ITINERARY);
  eq(
    "only camps carry the OpenStreetMap credit",
    planned.filter((r) => r.source === "camp").map((r) => r.heading),
    ["Next camp", "Nearest recorded hut"],
  );

  const sameHut = placeRowSpecs({ ...base, itinerarySleep: hut });
  eq(
    "the same hut is never drawn twice",
    sameHut.map((r) => r.heading),
    ["Next camp", "Summit"],
  );
  eq("no position: no rows at all", placeRowSpecs({ ...base, itinerarySleep: hut, pos: null }), []);
  eq(
    "no recorded camps: the summit alone",
    placeRowSpecs({ ...base, itinerarySleep: null, camps: null }).map((r) => r.heading),
    ["Summit"],
  );
}

/* -------------------------------------------------------------------------- */
console.log("\nPace over the last hour");

const NOW = Date.parse("2026-09-14T12:00:00Z");
/** A fix `minAgo` minutes back, `northM` metres north of the hut, at `alt`. */
const crumb = (
  minAgo: number,
  northM: number,
  alt: number | null = null,
  over: { accuracyM?: number | null; altitudeAccuracyM?: number | null } = {},
): PacePoint => ({
  t: NOW - minAgo * 60_000,
  lat: 45.85 + northM / 111_320,
  lon: 6.82,
  altitudeM: alt,
  accuracyM: over.accuracyM === undefined ? 8 : over.accuracyM,
  altitudeAccuracyM: over.altitudeAccuracyM === undefined ? 5 : over.altitudeAccuracyM,
});

eq("no crumbs at all", paceOverWindow([], NOW), { kind: "none", reason: NO_TRACK_IN_WINDOW });
eq(
  "only crumbs older than the window",
  paceOverWindow([[crumb(180, 0), crumb(120, 500)]], NOW).kind,
  "none",
);
eq("two minutes of track is not a pace", paceOverWindow([[crumb(3, 0), crumb(1, 200)]], NOW), {
  kind: "none",
  reason: NOT_ENOUGH_WATCHED,
});

{
  // 30 min, 1,500 m north, 3,000 m → 3,300 m.
  const run = [crumb(30, 0, 3000), crumb(15, 750, 3150), crumb(0, 1500, 3300)];
  const p = paceOverWindow([run], NOW);
  check("a half-hour run is a pace", p.kind === "pace");
  if (p.kind === "pace") {
    check("~1.5 km walked", Math.abs(p.walkedM - 1500) < 20, String(p.walkedM));
    eq("watched time is the run, not the hour", p.watchedMs, 30 * 60_000);
    eq("speed over the watched time", speedLabel(p.metresPerHour), "3.0 km/h");
    eq("net height gain", p.ascent, { kind: "gain", netM: 300, plusMinusM: 10 });
    eq("vertical rate", p.verticalMPerHour, 600);
    eq("no breaks", p.gaps, 0);
  }
}

{
  // Two runs with a hole between them: the hole is neither walked nor watched.
  const p = paceOverWindow(
    [
      [crumb(50, 0, 3000), crumb(40, 500, 3100)],
      [crumb(20, 2000, 3400), crumb(5, 2500, 3500)],
    ],
    NOW,
  );
  check("two runs still give a pace", p.kind === "pace");
  if (p.kind === "pace") {
    eq("one break counted", p.gaps, 1);
    check("the gap's distance is not counted", p.walkedM < 1100, String(p.walkedM));
    eq("nor its time", p.watchedMs, 25 * 60_000);
    eq("height is measured end to end, which a gap does not break", p.ascent, {
      kind: "gain",
      netM: 500,
      plusMinusM: 10,
    });
  }
}

{
  // Standing at a hut: every leg is inside the fix's own error.
  const scatter = [crumb(30, 0), crumb(20, 4), crumb(10, -3), crumb(0, 2)];
  const p = paceOverWindow([scatter], NOW);
  check("standing still is not walking", p.kind === "pace" && p.walkedM === 0);
  eq(
    "and it is not called a speed",
    p.kind === "pace" ? speedLabel(p.metresPerHour) : "",
    "under 0.1 km/h",
  );
}

{
  const noAcc = paceOverWindow(
    [
      [
        crumb(30, 0, 3000, { altitudeAccuracyM: null }),
        crumb(0, 1500, 3300, { altitudeAccuracyM: null }),
      ],
    ],
    NOW,
  );
  eq(
    "heights with no stated accuracy give no climb",
    noAcc.kind === "pace" ? noAcc.ascent.kind : "",
    "none",
  );
  const noise = paceOverWindow([[crumb(30, 0, 3000), crumb(0, 1500, 3006)]], NOW);
  eq(
    "a 6 m change between two ± 5 m fixes is not a climb",
    noAcc.kind === "pace" && noise.kind === "pace" ? noise.ascent : null,
    { kind: "within-error", plusMinusM: 10 },
  );
  eq(
    "…and it says so in words",
    paceAscentLabel({ kind: "within-error", plusMinusM: 10 }),
    "No clear height change — less than the ± 10 m these fixes are worth.",
  );
}

eq(
  "ascent label",
  paceAscentLabel({ kind: "gain", netM: 1200, plusMinusM: 8 }),
  "1,200 m up · ± 8 m",
);
eq(
  "descent label",
  paceAscentLabel({ kind: "loss", netM: 240, plusMinusM: 8 }),
  "240 m down · ± 8 m",
);
eq("vertical up", verticalRateLabel(310), "310 m an hour up");
eq("vertical down", verticalRateLabel(-180), "180 m an hour down");
eq("fast speeds lose the decimal", speedLabel(12_400), "12 km/h");
check(
  "there is no plan to compare against, and it says so",
  NO_PLAN_TIMES.includes("nothing to compare"),
);
eq(
  "a refused location is the real reason, not an empty track",
  paceUnavailable("denied", null)?.startsWith("Location is off"),
  true,
);
eq(
  "a phone that will not keep the track says that instead",
  paceUnavailable("recording", "No room."),
  "No room.",
);
eq(
  "a recording phone with no problem uses the pace's own reason",
  paceUnavailable("recording", null),
  null,
);

/* -------------------------------------------------------------------------- */
console.log("\nForecast row");

const conditions = (over: Partial<NowConditions["current"]> = {}): NowConditions => ({
  current: {
    temperatureC: { value: -7.4 },
    feelsLikeC: { value: -14.2 },
    windKph: { value: 38 },
    windDirectionDeg: { value: 315 },
    freezingLevelM: { value: 3200 },
    visibilityM: { value: 24_000 },
    ...over,
  },
});

const view = (over: Partial<Parameters<typeof forecastView>[0]> = {}) =>
  forecastView({
    hasCoords: true,
    conditions: conditions(),
    conditionWord: "Light snow",
    band: "fresh",
    ageSentence: null,
    loading: false,
    online: true,
    failure: null,
    ...over,
  });

eq("no coordinates: it says it cannot ask", view({ hasCoords: false }), {
  kind: "none",
  reason: FORECAST_NO_COORDS,
});
eq("no signal and nothing held: it says so", view({ conditions: null, online: false }), {
  kind: "none",
  reason: FORECAST_NO_SIGNAL,
});
eq("waiting on the first answer", view({ conditions: null, loading: true }).kind, "loading");
eq("a failed request is not silence", view({ conditions: null, failure: FORECAST_FAILED }), {
  kind: "none",
  reason: FORECAST_FAILED,
});

{
  const fresh = view();
  check("a fresh reading is shown", fresh.kind === "reading");
  if (fresh.kind === "reading") {
    eq("the big figure is rounded", fresh.headline?.figure, "-7 °C");
    eq("feels-like is the caption", fresh.headline?.caption, "feels like -14 °C");
    eq("wind carries its direction", fresh.figures[0], { label: "Wind", value: "38 km/h NW" });
    eq("freezing level", fresh.figures[1], { label: "Freezing level", value: "3,200 m" });
    eq("visibility", fresh.figures[2], { label: "Visibility", value: "24 km" });
    eq("nothing is greyed while it is fresh", [fresh.grey, fresh.ageSentence], [false, null]);
  }
}

{
  const old = view({
    band: "stale",
    ageSentence: "Read 4 h ago. Nothing newer has reached this phone.",
  });
  check("an old reading is greyed and carries its age", old.kind === "reading" && old.grey);
  eq(
    "and the age is printed",
    old.kind === "reading" ? old.ageSentence : null,
    "Read 4 h ago. Nothing newer has reached this phone.",
  );
}

eq(
  "past the silent threshold it is withheld, with the age as the reason",
  view({
    band: "silent",
    ageSentence: "The weather now is not shown: the last reading on this phone is 9 h old.",
  }),
  {
    kind: "none",
    reason: "The weather now is not shown: the last reading on this phone is 9 h old.",
  },
);

{
  const missing = view({
    conditions: conditions({ temperatureC: { value: null }, windKph: { value: null } }),
  });
  check("a missing figure is dropped, never zeroed", missing.kind === "reading");
  if (missing.kind === "reading") {
    eq("no temperature means no headline", missing.headline, null);
    eq(
      "and no wind row",
      missing.figures.map((f) => f.label),
      ["Freezing level", "Visibility"],
    );
  }
}

eq(
  "a wind with no direction still shows its speed",
  forecastFigures(conditions({ windDirectionDeg: { value: null } }))[0].value,
  "38 km/h",
);

eq(
  "a trip with no coordinates cannot be asked about",
  forecastSubject({ peakName: "X", name: "X", peakElevationM: 1000, summit: null }),
  null,
);
eq("a trip with a summit can", forecastSubject(trip({ summit: { lat: 45.8326, lon: 6.8652 } })), {
  peakName: "Mont Blanc",
  elevationM: 4806,
  lat: 45.8326,
  lon: 6.8652,
});

/* -------------------------------------------------------------------------- */
console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  if (proc) proc.exitCode = 1;
}
