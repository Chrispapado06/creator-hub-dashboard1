/**
 * The trip pack: measured sizes, two kinds of age, and the merge rule that a
 * failed download never replaces a part that is already on the phone.
 *
 * Run: npm run test:trip-pack
 */

import {
  __resetDeviceStorageForTests,
  __useBrokenDeviceStorage,
  __useMemoryDeviceStorage,
  deviceStore,
} from "@/device/db";
import type { TripPackPart } from "@/device/types";
import type { TrainingPlan } from "@/types";

import {
  OFFLINE_MAP_LICENCE,
  PACK_KINDS,
  collectForecast,
  collectLocalParts,
  collectMap,
  forecastIsEmpty,
  measureBytes,
  mergePack,
  mergePackPart,
  offlineMapSource,
  packAge,
  packBand,
  packRows,
  packSizeLabel,
  packTotals,
  refreshTripPack,
  registerOfflineMapSource,
  sessionFor,
  shouldRefreshPack,
  subjectFromTrip,
  weekFor,
  type PartOutcome,
  type TripPackSubject,
} from "./tripPack";
import type { MountainTrip } from "./tripModel";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-09-15T08:00:00Z");

const subject = (over: Partial<TripPackSubject> = {}): TripPackSubject => ({
  tripId: "trip-1",
  tripName: "Mont Blanc · Goûter Route",
  mountainId: "mont-blanc",
  peakName: "Mont Blanc",
  peakElevationM: 4806,
  summit: { lat: 45.8326, lon: 6.8652 },
  routeName: "Goûter Route",
  today: "2026-09-15",
  itinerary: null,
  plan: null,
  ownEmergencyInfo: null,
  ...over,
});

const collected = (value: unknown): PartOutcome => ({
  status: "collected",
  part: { kind: "forecast", origin: "downloaded", dataDate: null, sourceNote: "Open-Meteo", value },
});

const storedPart = (over: Partial<TripPackPart> = {}): TripPackPart => ({
  id: "trip-1:forecast",
  tripId: "trip-1",
  kind: "forecast",
  label: "Forecast",
  savedAt: NOW - 3 * HOUR,
  sizeBytes: 100,
  sourceNote: "Open-Meteo",
  data: { origin: "downloaded", dataDate: null, value: { current: { windKph: { value: 20 } } } },
  ...over,
});

async function run() {
  /* ---------------------------------------------------------------- sizes */
  console.log("\n\x1b[1m1 — Sizes are measured\x1b[0m");
  eq("empty object", measureBytes({}), 2);
  eq("ascii is one byte a character", measureBytes("ab"), 4); // JSON adds the quotes
  eq("a non-ascii name costs more than its characters", measureBytes("Goûter") > "Goûter".length + 2, true);
  eq("undefined is zero, not NaN", measureBytes(undefined), 0);
  check(
    "a circular value returns 0 rather than throwing",
    (() => {
      const a: Record<string, unknown> = {};
      a.self = a;
      return measureBytes(a) === 0;
    })(),
  );
  eq("size label bytes", packSizeLabel(512), "512 B");
  eq("size label kilobytes", packSizeLabel(4096), "4 KB");
  eq("size label megabytes", packSizeLabel(3_800_000), "3.6 MB");

  /* ------------------------------------------------------------------ ages */
  console.log("\n\x1b[1m2 — Ages, per kind\x1b[0m");
  eq("a 2 h forecast is fresh", packBand("forecast", 2 * HOUR), "fresh");
  eq("a 10 h forecast shows its age", packBand("forecast", 10 * HOUR), "aged");
  eq("a 30 h forecast is greyed", packBand("forecast", 30 * HOUR), "stale");
  eq("a 4-day forecast goes silent", packBand("forecast", 4 * DAY), "silent");
  eq("a 10-day map shows its age", packBand("map", 10 * DAY), "aged");
  eq("a 40-day map is greyed", packBand("map", 40 * DAY), "stale");
  eq("a map never goes silent", packBand("map", 400 * DAY), "stale");
  eq("camps under a year are fresh", packBand("camps", 300 * DAY), "fresh");
  eq("camps over a year are greyed, never silent", packBand("camps", 400 * DAY), "stale");
  eq("costs at 7 months show their age", packBand("costs", 210 * DAY), "aged");
  eq("a phone number never ages out", packBand("emergency", 5000 * DAY), "fresh");

  const forecastAge = packAge(storedPart(), NOW);
  eq("a downloaded part ages from when it arrived", [forecastAge.basis, forecastAge.text], ["saved", "Saved 3 h ago"]);
  const costsAge = packAge(
    storedPart({
      kind: "costs",
      savedAt: NOW - 60_000,
      data: { origin: "in-app", dataDate: "2026-03-15", value: { lines: [1] } },
    }),
    NOW,
  );
  check(
    "a permit price copied a minute ago is still six months old",
    costsAge.basis === "read" && costsAge.band === "aged" && costsAge.text === "Read 184 days ago",
    JSON.stringify(costsAge),
  );
  eq(
    "an emergency part carries no bare date",
    packAge(storedPart({ kind: "emergency", data: { origin: "in-app", dataDate: null, value: { numbers: [1] } } }), NOW)
      .text,
    null,
  );
  eq(
    "a row with a broken envelope still ages from its save time",
    packAge(storedPart({ data: "not an envelope" }), NOW).text,
    "Saved 3 h ago",
  );

  /* ----------------------------------------------------------------- merge */
  console.log("\n\x1b[1m3 — The merge never loses a good part\x1b[0m");
  const good = storedPart();

  const failed = mergePackPart(good, { status: "failed", kind: "forecast", reason: "No signal." }, "trip-1", NOW);
  check(
    "a failed download writes nothing and keeps the stored part with its age",
    failed.write === null && failed.keptExisting && failed.row.status === "saved" && failed.row.age?.text === "Saved 3 h ago",
    JSON.stringify(failed.row),
  );
  eq("and the failure is shown beside it", failed.row.sentence, "No signal.");

  const empty = mergePackPart(good, collected({}), "trip-1", NOW);
  check("an empty answer is a failure, not a download", empty.write === null && empty.keptExisting);

  const fresh = mergePackPart(good, collected({ current: { windKph: { value: 31 } } }), "trip-1", NOW);
  check(
    "new bytes are written with today's date",
    fresh.write !== null && fresh.write.savedAt === NOW && fresh.write.id === "trip-1:forecast",
    JSON.stringify(fresh.write?.savedAt),
  );
  eq("and the size is measured, not carried over", fresh.write?.sizeBytes, measureBytes(fresh.write?.data));

  const same = mergePackPart(good, collected({ current: { windKph: { value: 20 } } }), "trip-1", NOW);
  check(
    "identical bytes do not restamp the date — nothing newer reached this phone",
    same.write === null && same.row.age?.text === "Saved 3 h ago",
    JSON.stringify(same.row.age),
  );

  const nothing = mergePackPart(
    undefined,
    { status: "nothing-to-download", kind: "map", sentence: "nothing here" },
    "trip-1",
    NOW,
  );
  check(
    "nothing to download shows its sentence and no figure",
    nothing.write === null && nothing.row.status === "nothing-to-download" && nothing.row.sizeBytes === null,
  );
  const nothingButStored = mergePackPart(
    storedPart({ id: "trip-1:map", kind: "map" }),
    { status: "nothing-to-download", kind: "map", sentence: "nothing here" },
    "trip-1",
    NOW,
  );
  check(
    "and it never deletes an older copy that is already saved",
    nothingButStored.write === null && nothingButStored.row.status === "saved",
  );

  const missing = mergePackPart(undefined, { status: "failed", kind: "forecast", reason: "No signal." }, "trip-1", NOW);
  check(
    "with nothing stored, a failure is a missing row and no number",
    missing.row.status === "missing" && missing.row.sizeBytes === null && missing.row.sentence === "No signal.",
  );

  const pack = mergePack(
    [good, storedPart({ id: "trip-1:camps", kind: "camps", sizeBytes: 900, savedAt: NOW - DAY })],
    [{ status: "failed", kind: "forecast", reason: "No signal." }],
    "trip-1",
    NOW,
  );
  eq("a part nobody collected is still listed", pack.rows.map((r) => r.kind).sort(), ["camps", "forecast"]);
  eq("rows come back in display order", pack.rows.map((r) => r.kind), ["camps", "forecast"]);
  eq("the failure is reported once", pack.failed, [{ kind: "forecast", reason: "No signal." }]);
  eq("totals add the measured sizes", packTotals(pack.rows).bytes, 1000);
  eq("totals count what is saved", packTotals(pack.rows).saved, 2);
  eq(
    "totals name what is missing",
    packTotals(mergePack([], [{ status: "failed", kind: "map", reason: "x" }], "trip-1", NOW).rows).missing,
    ["map"],
  );

  /* ------------------------------------------------------------ collectors */
  console.log("\n\x1b[1m4 — What is collected for a real mountain\x1b[0m");
  const plan: TrainingPlan = {
    id: "plan-1",
    goalId: "goal-1",
    title: "Mont Blanc — 16 weeks",
    totalWeeks: 16,
    currentWeek: 16,
    weeks: [
      {
        index: 16,
        block: "Taper",
        startDate: "2026-09-14",
        days: [
          { date: "2026-09-14", focus: "rest", title: "Rest", difficulty: 1, completed: false },
          { date: "2026-09-15", focus: "endurance", title: "Easy hour", difficulty: 1, completed: false },
        ],
      },
    ],
  };
  const outcomes = collectLocalParts(subject({ plan, itinerary: null }));
  const byKind = new Map(outcomes.map((o) => [o.status === "collected" ? o.part.kind : o.kind, o]));
  for (const kind of ["mountain", "route", "camps", "hazards", "costs", "emergency", "plan", "session"] as const) {
    check(`${kind} is collected from the app file`, byKind.get(kind)?.status === "collected");
  }
  eq(
    "an absent itinerary is honest, not empty",
    byKind.get("itinerary")?.status,
    "nothing-to-download",
  );
  const mountainPart = byKind.get("mountain");
  check(
    "the mountain part carries the source read date",
    mountainPart?.status === "collected" && mountainPart.part.dataDate !== null && mountainPart.part.origin === "in-app",
  );
  const routePart = byKind.get("route");
  check(
    "the route part says there is no line to navigate by",
    routePart?.status === "collected" &&
      (routePart.part.value as { lineHeld: boolean }).lineHeld === false &&
      (routePart.part.sourceNote ?? "").includes("no route line"),
  );
  const campsPart = byKind.get("camps");
  check(
    "camps carry the OSM harvest date and the credit",
    campsPart?.status === "collected" &&
      campsPart.part.dataDate === "2026-09-11" &&
      (campsPart.part.sourceNote ?? "").includes("OpenStreetMap"),
  );
  const costsPart = byKind.get("costs");
  check(
    "costs are aged from the issuer's page, not from today",
    costsPart?.status === "collected" && /^\d{4}-\d{2}-\d{2}$/.test(costsPart.part.dataDate ?? ""),
  );
  const emergencyPart = byKind.get("emergency");
  check(
    "the emergency part holds numbers but not the athlete's own card",
    emergencyPart?.status === "collected" &&
      Array.isArray((emergencyPart.part.value as { numbers: unknown[] }).numbers) &&
      JSON.stringify(emergencyPart.part.value).includes("ownInfoOnThisPhone") &&
      !JSON.stringify(emergencyPart.part.value).includes("policyRef"),
  );
  eq("today's session is the day in the plan", sessionFor(plan, "2026-09-15")?.title, "Easy hour");
  eq("this week is the week holding today", weekFor(plan, "2026-09-15")?.index, 16);
  eq("a day outside the plan has no session", sessionFor(plan, "2026-10-01"), null);

  const noMountain = collectLocalParts(subject({ mountainId: null, routeName: null, plan: null }));
  check(
    "a trip with no curated mountain collects nothing and says why",
    noMountain.every((o) => o.status === "nothing-to-download"),
    JSON.stringify(noMountain.map((o) => o.status)),
  );

  /* -------------------------------------------------------------- forecast */
  console.log("\n\x1b[1m5 — Forecast and map\x1b[0m");
  eq("an all-null forecast is empty", forecastIsEmpty({ current: { windKph: { value: null } } }), true);
  eq("a forecast with one reading is not", forecastIsEmpty({ current: { windKph: { value: 4 } } }), false);

  const okForecast = await collectForecast(subject(), async () => ({ current: { windKph: { value: 12 } } }));
  check("a forecast that arrives is collected as downloaded", okForecast.status === "collected");
  const deadForecast = await collectForecast(subject(), async () => {
    throw new Error("Network request failed.");
  });
  eq("a forecast that fails reports the reason", deadForecast.status === "failed" && deadForecast.reason, "Network request failed.");
  const noCoords = await collectForecast(subject({ summit: null }), async () => ({ current: {} }));
  eq("with no coordinates it is never asked for", noCoords.status, "nothing-to-download");

  const mapOutcome = await collectMap(subject());
  check(
    "with no map source registered the map part states the licence position",
    mapOutcome.status === "nothing-to-download" && mapOutcome.sentence.includes(OFFLINE_MAP_LICENCE.slice(0, 40)),
  );
  eq("and nothing is registered by default", offlineMapSource(), null);

  registerOfflineMapSource({
    id: "test",
    licenceNote: "Test source.",
    async download() {
      return { value: { tiles: 3 }, dataDate: "2026-09-01", sourceNote: "Built from OpenStreetMap data." };
    },
  });
  const withSource = await collectMap(subject());
  check(
    "a registered source fills the same part and keeps both credits",
    withSource.status === "collected" &&
      (withSource.part.sourceNote ?? "").includes("OpenStreetMap") &&
      (withSource.part.sourceNote ?? "").includes("Test source."),
  );
  registerOfflineMapSource(null);

  /* --------------------------------------------------------------- refresh */
  console.log("\n\x1b[1m6 — Refreshing against the phone's database\x1b[0m");
  __useMemoryDeviceStorage();
  const offlineReport = await refreshTripPack(subject({ plan }), { confirmedOnline: false, now: NOW });
  check(
    "with no signal the local parts are still saved",
    offlineReport.written.includes("mountain") && offlineReport.written.includes("camps"),
    JSON.stringify(offlineReport.written),
  );
  eq("and the forecast is reported as needing a signal", offlineReport.failed.map((f) => f.kind), ["forecast"]);
  check("the pack has a measured total", offlineReport.totals.bytes > 0);

  const stored = await deviceStore("tripPacks").byIndex("tripId", "trip-1");
  eq("one row per part", stored.length, offlineReport.written.length);
  check("every row knows its trip", stored.every((r) => r.tripId === "trip-1"));

  const online = await refreshTripPack(subject({ plan }), {
    confirmedOnline: true,
    now: NOW + 60_000,
    fetchForecast: async () => ({ current: { windKph: { value: 22 } } }),
  });
  eq("a confirmed connection adds the forecast", online.written, ["forecast"]);
  check("and rewrites nothing that did not change", online.written.length === 1);

  const afterFailure = await refreshTripPack(subject({ plan }), {
    confirmedOnline: true,
    now: NOW + 2 * HOUR,
    fetchForecast: async () => {
      throw new Error("Timed out.");
    },
  });
  const forecastRow = afterFailure.rows.find((r) => r.kind === "forecast");
  check(
    "a failed refresh keeps the good forecast and shows its age",
    forecastRow?.status === "saved" && forecastRow.age?.text === "Saved 2 h ago" && forecastRow.sentence === "Timed out.",
    JSON.stringify(forecastRow),
  );

  eq(
    "rows are rebuilt from the stored parts, not frozen in the report",
    packRows(await deviceStore("tripPacks").byIndex("tripId", "trip-1"), NOW + 5 * HOUR)
      .find((r) => r.kind === "forecast")?.age?.text,
    "Saved 5 h ago",
  );

  __resetDeviceStorageForTests();
  __useBrokenDeviceStorage("no database");
  const broken = await refreshTripPack(subject({ plan }), { confirmedOnline: false, now: NOW });
  check(
    "a phone with no database says so and saves nothing",
    !broken.storageOk && broken.written.length === 0 && (broken.storageSentence ?? "").length > 0,
  );
  __resetDeviceStorageForTests();

  /* ---------------------------------------------------------- when to ask */
  console.log("\n\x1b[1m7 — When an automatic refresh is due\x1b[0m");
  eq("never with no confirmed connection", shouldRefreshPack({ parts: [], now: NOW, confirmedOnline: false }), false);
  eq("yes when nothing is saved", shouldRefreshPack({ parts: [], now: NOW, confirmedOnline: true }), true);
  eq(
    "no while the forecast is fresh",
    shouldRefreshPack({ parts: [storedPart({ savedAt: NOW - HOUR })], now: NOW, confirmedOnline: true }),
    false,
  );
  eq(
    "yes once it has aged",
    shouldRefreshPack({ parts: [storedPart({ savedAt: NOW - 8 * HOUR })], now: NOW, confirmedOnline: true }),
    true,
  );
  eq(
    "and never twice inside ten minutes",
    shouldRefreshPack({ parts: [], now: NOW, confirmedOnline: true, lastAttemptAt: NOW - 60_000 }),
    false,
  );

  /* --------------------------------------------------------------- subject */
  console.log("\n\x1b[1m8 — The subject\x1b[0m");
  eq("no trip, no pack", subjectFromTrip(null, { today: "2026-09-15" }), null);
  const trip: MountainTrip = {
    source: "trip",
    id: "t9",
    name: "Matterhorn",
    mountainId: "matterhorn",
    peakName: "Matterhorn",
    peakElevationM: 4478,
    summit: { lat: 45.9766, lon: 7.6585 },
    routeName: null,
    startDate: "2026-09-14",
    endDate: "2026-09-16",
    record: null,
    itinerary: null,
    notice: null,
  };
  const s = subjectFromTrip(trip, { today: "2026-09-15", ownEmergencyInfo: { filled: true, savedAt: NOW } });
  eq("the pack is keyed by the trip", [s?.tripId, s?.mountainId], ["t9", "matterhorn"]);
  eq("every kind has a label", PACK_KINDS.every((k) => k.length > 0), true);

  console.log(`\n${failures.length === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failures.length} failed\x1b[0m`);
  for (const f of failures) console.log(`  - ${f}`);
  if (failures.length) {
    const proc = (globalThis as { process?: { exitCode?: number } }).process;
    if (proc) proc.exitCode = 1;
  }
}

void run();
