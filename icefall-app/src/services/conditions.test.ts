/**
 * Conditions tests — the honesty invariants the objective card rests on.
 *
 * WHY THIS FILE EXISTS. Every rule below was already written down in
 * `conditions.ts`, in prose, and two of them were broken anyway: a series
 * shorter than the current hour printed its LAST value as the current one
 * ("130 m visibility" seventeen hours after the fog lifted), and the column
 * labelled "Now" was the next hour for twenty-nine minutes out of every sixty.
 * Both were found by driving the app, not by running anything, because there
 * was nothing to run. A prose rule with no test is a rule the next edit breaks.
 *
 * It follows `src/tracking/tracking.test.ts` exactly: a plain TypeScript
 * program with a small harness, inside `src/` so `npm run typecheck` checks it
 * against the same types the app uses, bundled and run by `npm test`. Nothing
 * in the app imports it.
 *
 * WHAT IT CAN AND CANNOT PROVE. It drives the REAL `getMountainConditions`
 * against synthetic Open-Meteo payloads on a fake clock. That proves the
 * indexing, the absence handling and the wording. It does not prove what the
 * provider actually sends, and it does not prove anything about how the widget
 * renders — those were checked in the running app and are listed at the foot of
 * this file.
 */

import {
  HOURLY_OUTLOOK_HOURS,
  describeWeatherCode,
  getMountainConditions,
  peakLocalClock,
  weatherKind,
  type MountainConditions,
} from "./conditions";
import { fmtTempCoarse, fmtVisibility, minus } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
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

const eq = (name: string, got: unknown, want: unknown) =>
  check(name, Object.is(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* -------------------------------------------------------------------------- */
/* A stubbed provider and a fake clock                                         */
/* -------------------------------------------------------------------------- */

const realNow = Date.now;
const HOUR = 3_600_000;

/**
 * Whole-hour naive stamps, exactly the shape `timezone=auto` returns.
 *
 * The offset is deliberately NOT added here. Open-Meteo's stamps are the
 * mountain's own wall clock — "2026-09-03T15:00" on Everest is 09:15 UTC — and
 * the offset is what the service subtracts to get back to a real instant. A
 * fixture that bakes the offset into the stamp is testing a payload the
 * provider never sends.
 */
function stamps(startLocalAsUtc: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(startLocalAsUtc + i * HOUR).toISOString().slice(0, 16),
  );
}

interface StubSpec {
  /** The first hourly stamp as the MOUNTAIN's wall clock, read as if it were UTC. */
  startEpochUtc: number;
  count: number;
  offsetSeconds?: number;
  temps?: (number | null)[];
  codes?: (number | null)[];
  isDay?: (number | null)[];
  visibility?: (number | null)[];
  freezing?: (number | null)[];
  current?: Record<string, number | string>;
  /** Reject instead of answering. */
  fail?: boolean;
}

/** Installs a fetch that answers with one crafted payload, and returns it. */
function stub(spec: StubSpec) {
  const offsetSeconds = spec.offsetSeconds ?? 0;
  const time = stamps(spec.startEpochUtc, spec.count);
  const hourly: Record<string, unknown> = { time };
  if (spec.temps) hourly.temperature_2m = spec.temps;
  if (spec.codes) hourly.weather_code = spec.codes;
  if (spec.isDay) hourly.is_day = spec.isDay;
  if (spec.visibility) hourly.visibility = spec.visibility;
  if (spec.freezing) hourly.freezing_level_height = spec.freezing;

  const payload = {
    elevation: 4806,
    utc_offset_seconds: offsetSeconds,
    current: spec.current ?? {},
    hourly,
    daily: { time: [] },
  };

  (globalThis as { fetch: unknown }).fetch = async () => {
    if (spec.fail) throw new Error("stubbed: no route to host");
    return { ok: true, status: 200, json: async () => payload };
  };
}

const ask = (): Promise<MountainConditions> =>
  getMountainConditions({ peakName: "Mont Blanc", elevationM: 4806, lat: 45.8326, lon: 6.8652 });

/** Freeze the clock at an exact instant so "now" is a fact, not a race. */
const at = (iso: string) => {
  const t = Date.parse(iso);
  Date.now = () => t;
  return t;
};

/* -------------------------------------------------------------------------- */

async function run() {
  /* ---------------------------------------------------------------------- */
  testCase("The window opens on the hour IN PROGRESS, never the nearest one");
  /* ---------------------------------------------------------------------- */

  const dayStart = Date.parse("2026-09-03T00:00:00Z");
  // Two days of stamps, so a window opening at 21:00 has six hours ahead of it
  // rather than running off the end of the day and testing the wrong thing.
  const SPAN = 48;
  const rampTemps = Array.from({ length: SPAN }, (_, i) => -i);

  for (const [minute, label] of [
    [5, ":05 — floor and nearest agree"],
    [29, ":29 — the last minute nearest is still right"],
    [31, ":31 — nearest starts rounding forward"],
    [45, ":45 — the case that shipped broken"],
    [59, ":59 — one minute before the turn"],
  ] as [number, string][]) {
    at(`2026-09-03T21:${String(minute).padStart(2, "0")}:00Z`);
    stub({
      startEpochUtc: dayStart,
      count: SPAN,
      temps: rampTemps,
      current: { time: "2026-09-03T21:00", temperature_2m: -9 },
    });
    const d = await ask();
    const first = d.hourly.hours[0];
    check(
      `${label}: the row starts at 21:00`,
      first?.hour === 21 && first?.temperatureC.value === -21,
      `hour ${first?.hour}, ${first?.temperatureC.value} °C`,
    );
    check(`${label}: that column is the one marked Now`, first?.isNow === true);
    check(
      `${label}: exactly one column claims to be Now`,
      d.hourly.hours.filter((h) => h.isNow).length === 1,
    );
  }

  at("2026-09-03T21:45:00Z");
  stub({ startEpochUtc: dayStart, count: SPAN, temps: rampTemps, current: { temperature_2m: -9 } });
  const window45 = await ask();
  eq(
    "the six labels run forward from the hour in progress",
    window45.hourly.hours.map((h) => h.label).join(" "),
    "9 PM 10 PM 11 PM 12 AM 1 AM 2 AM",
  );
  eq("six hours were asked for and six came back", window45.hourly.hours.length, HOURLY_OUTLOOK_HOURS);
  check("no shortfall is declared when the window is full", window45.hourly.shortfall === undefined);

  /* ---------------------------------------------------------------------- */
  testCase("An index past the end of a series is an ABSENCE, not the last value");
  /* ---------------------------------------------------------------------- */

  at("2026-09-03T21:15:00Z");
  stub({
    startEpochUtc: dayStart,
    count: SPAN,
    temps: rampTemps,
    // Morning fog only. The current hour, 21:00, is index 21 — far past the end.
    visibility: [130, 130, 130, 130, 130, 130],
    freezing: [2100, 2100, 2100, 2100, 2100, 2100],
    current: { time: "2026-09-03T21:15", temperature_2m: -9 },
  });
  const truncated = await ask();
  eq("visibility is absent, not the 05:00 whiteout", truncated.current.visibilityM.value, null);
  eq("the freezing level is absent too", truncated.current.freezingLevelM.value, null);
  check(
    "and the absence carries a reason the screen can state",
    truncated.current.visibilityM.reason === "no-data",
    String(truncated.current.visibilityM.reason),
  );

  stub({
    startEpochUtc: dayStart,
    count: SPAN,
    temps: rampTemps,
    visibility: Array.from({ length: SPAN }, (_, i) => i * 1000),
    current: { time: "2026-09-03T21:15", temperature_2m: -9 },
  });
  const full = await ask();
  eq("a series that DOES reach now still reads the right hour", full.current.visibilityM.value, 21000);

  /* ---------------------------------------------------------------------- */
  testCase("A measured zero is a zero — three falsy values that are all real");
  /* ---------------------------------------------------------------------- */

  at("2026-09-03T21:15:00Z");
  stub({
    startEpochUtc: dayStart,
    count: SPAN,
    temps: Array.from({ length: SPAN }, () => 0),
    codes: Array.from({ length: SPAN }, () => 0),
    isDay: Array.from({ length: SPAN }, () => 0),
    visibility: Array.from({ length: SPAN }, () => 0),
    current: { time: "2026-09-03T21:15", temperature_2m: 0, weather_code: 0, is_day: 0, precipitation: 0 },
  });
  const zeros = await ask();
  eq("0 °C survives as a reading", zeros.current.temperatureC.value, 0);
  eq("WMO code 0 survives — clear sky, not a missing code", zeros.current.weatherCode.value, 0);
  eq("is_day 0 survives as night, not as unknown", zeros.current.isDay, false);
  eq("0 mm of precipitation survives", zeros.current.precipitationMm.value, 0);
  eq("0 m of visibility survives — that is a whiteout, not a gap", zeros.current.visibilityM.value, 0);
  eq("the hour row keeps its zero too", zeros.hourly.hours[0].temperatureC.value, 0);
  eq("and its zero code", zeros.hourly.hours[0].weatherCode.value, 0);
  eq("0 renders as \"0°\", never as a dash", fmtTempCoarse(0), "0°");
  eq("and a fraction below zero never renders as \"-0°\"", fmtTempCoarse(-0.3), "0°");

  /* ---------------------------------------------------------------------- */
  testCase("Nothing is padded, and a gap inside the window keeps its column");
  /* ---------------------------------------------------------------------- */

  at("2026-09-03T21:15:00Z");
  const gapped: (number | null)[] = Array.from({ length: SPAN }, (_, i) => -i);
  gapped[22] = null;
  gapped[23] = null;
  stub({ startEpochUtc: dayStart, count: SPAN, temps: gapped, current: { temperature_2m: -9 } });
  const gap = await ask();
  eq("the gapped hours are still there", gap.hourly.hours.length, 6);
  eq("labelled in order, nothing slid up", gap.hourly.hours.map((h) => h.label).join(" "), "9 PM 10 PM 11 PM 12 AM 1 AM 2 AM");
  eq("10 PM's reading is absent", gap.hourly.hours[1].temperatureC.value, null);
  eq("11 PM's is absent too", gap.hourly.hours[2].temperatureC.value, null);
  eq("midnight's is present", gap.hourly.hours[3].temperatureC.value, -24);
  check("a full window with interior gaps declares no shortfall", gap.hourly.shortfall === undefined);

  at("2026-09-03T21:15:00Z");
  stub({
    startEpochUtc: dayStart,
    count: 23, // the series stops at 22:00 — two hours from now
    temps: Array.from({ length: 23 }, (_, i) => (i === 21 ? null : -i)),
    current: { temperature_2m: 0 },
  });
  const short = await ask();
  eq("a short series stops where the series stops", short.hourly.hours.length, 2);
  eq("it is never topped up to six", short.hourly.hours.length < HOURLY_OUTLOOK_HOURS, true);
  eq("and it says so", short.hourly.shortfall, "short-series");
  eq(
    "the sentence counts TEMPERATURES, not columns, and does not call Now \"next\"",
    short.hourly.note,
    "Only one hour was forecast.",
  );

  at("2026-09-03T21:15:00Z");
  stub({
    startEpochUtc: dayStart,
    count: 24, // the series ends at 23:00, three hours from now
    temps: Array.from({ length: 24 }, (_, i) => (i >= 21 ? -i : null)),
    current: { temperature_2m: 0 },
  });
  const three = await ask();
  eq("three modelled hours are worded in the plural", three.hourly.note, "Only 3 hours were forecast.");

  /* ---------------------------------------------------------------------- */
  testCase("A series that does not reach now never borrows the word \"Now\"");
  /* ---------------------------------------------------------------------- */

  at("2026-09-04T09:00:00Z"); // long after the series ends
  stub({ startEpochUtc: dayStart, count: 12, temps: Array.from({ length: 12 }, (_, i) => -i), current: {} });
  const stale = await ask();
  eq("an entirely past series carries no hours", stale.hourly.hours.length, 0);
  eq("and says the forecast has run out rather than that none arrived", stale.hourly.shortfall, "past-series");
  eq("in words", stale.hourly.note, "The hourly forecast on hand ends before now.");

  at("2026-09-03T08:00:00Z"); // before the series starts
  stub({
    startEpochUtc: Date.parse("2026-09-03T12:00:00Z"),
    count: 12,
    temps: Array.from({ length: 12 }, (_, i) => -i),
    current: {},
  });
  const later = await ask();
  eq("a series starting later still shows its real hours", later.hourly.hours.length, 6);
  eq("beginning at its own first hour", later.hourly.hours[0].label, "12 PM");
  eq("and NOT ONE of them claims to be Now", later.hourly.hours.filter((h) => h.isNow).length, 0);

  /* ---------------------------------------------------------------------- */
  testCase("Hours are the MOUNTAIN's, whatever the viewer's clock says");
  /* ---------------------------------------------------------------------- */

  // Nepal, +05:45 — a peak whose hour boundary is not on anybody else's minute.
  // 09:20 UTC is 15:05 on the mountain, so the hour in progress there is 15:00.
  at("2026-09-03T09:20:00Z");
  stub({
    startEpochUtc: Date.parse("2026-09-03T00:00:00Z"),
    count: 48,
    offsetSeconds: 5 * 3600 + 45 * 60,
    temps: Array.from({ length: 48 }, (_, i) => i),
    current: { time: "2026-09-03T15:05" },
  });
  const nepal = await ask();
  eq("the row opens on the peak's 15:00, not the viewer's 09:00", nepal.hourly.hours[0].hour, 15);
  eq("labelled in the mountain's own words", nepal.hourly.hours[0].label, "3 PM");
  eq("and it is the hour in progress there", nepal.hourly.hours[0].isNow, true);
  eq("the clock line reads the peak's wall time", peakLocalClock("2026-09-03T15:05"), "15:05");
  eq("a stamp carrying a zone is refused rather than mislabelled", peakLocalClock("2026-09-03T15:05:00.000Z"), null);
  eq("and so is an offset stamp", peakLocalClock("2026-09-03T15:05+05:45"), null);

  /* ---------------------------------------------------------------------- */
  testCase("A request that did not arrive says so, and invents nothing");
  /* ---------------------------------------------------------------------- */

  at("2026-09-03T21:15:00Z");
  stub({ startEpochUtc: dayStart, count: SPAN, fail: true });
  const failed = await ask();
  check("the call still resolves — it never throws at a screen", failed !== null);
  check("an error is carried", Boolean(failed.error), String(failed.error));
  eq("temperature is absent", failed.current.temperatureC.value, null);
  eq("wind is absent", failed.current.windKph.value, null);
  eq("visibility is absent", failed.current.visibilityM.value, null);
  eq("no hours are invented", failed.hourly.hours.length, 0);
  eq("and the reason is stated", failed.hourly.shortfall, "request-failed");
  eq("in words", failed.hourly.note, "The hourly forecast could not be loaded.");

  /* ---------------------------------------------------------------------- */
  testCase("The glyph and the word describe the same weather");
  /* ---------------------------------------------------------------------- */

  eq("WMO 80 is a rain shower, not drizzle", weatherKind(80), "rain");
  eq("81 with it", weatherKind(81), "rain");
  eq("82 with it", weatherKind(82), "rain");
  check(
    "so 80/81/82 draw one icon between them",
    new Set([weatherKind(80), weatherKind(81), weatherKind(82)]).size === 1,
  );
  eq("and the word agrees with the glyph", describeWeatherCode(80), "Light showers");
  eq("real drizzle is still drizzle", weatherKind(53), "drizzle");
  eq("57 is the top of the drizzle range", weatherKind(57), "drizzle");
  eq("code 0 is clear, not unknown", weatherKind(0), "clear");
  eq("an unrecognised code draws NOTHING", weatherKind(4), null);
  eq("and is described as nothing", describeWeatherCode(4), null);
  eq("null is not clear weather", weatherKind(null), null);

  /* ---------------------------------------------------------------------- */
  testCase("Formatting a number nobody can misread");
  /* ---------------------------------------------------------------------- */

  eq("a negative temperature uses U+2212, not a hyphen", fmtTempCoarse(-3.4), "−3°");
  check("and there is no hyphen left in it", !fmtTempCoarse(-3.4).includes("-"));
  eq("minus() only touches a leading sign", minus("2026-09-03"), "2026-09-03");
  eq("1,500 m of visibility is 1.5 km, not 2", fmtVisibility(1500), "1.5 km");
  eq("under a kilometre it stays in metres", fmtVisibility(900), "900 m");
  eq("and past ten it drops the decimal", fmtVisibility(41000), "41 km");

  /* ---------------------------------------------------------------------- */

  Date.now = realNow;

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  \x1b[31m·\x1b[0m ${f}`));
    if (proc) proc.exitCode = 1;
  }
  console.log(
    "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: what Open-Meteo actually sends, how the\n" +
      "widget renders any of it, contrast, or that a screen left open refetches on\n" +
      "a real timer. Those were forced in the running app and belong there.\x1b[0m",
  );
}

void run();
