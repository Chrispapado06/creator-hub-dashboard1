/**
 * Mountain mode Body tab: the one-question-per-screen walk, "Not sure", the
 * ceiling carried word for word from `trip/schedule.ts`, and the on-phone log.
 *
 * Run: esbuild src/mountain/body.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import {
  deviceStore,
  __resetDeviceStorageForTests,
  __useBrokenDeviceStorage,
  __useMemoryDeviceStorage,
} from "@/device/db";
import { KEPT_HERE, forgetOffline, saveOffline, savedSentenceFor } from "@/device/savedHere";
import { __resetSyncQueueForTests } from "@/device/syncQueue";
import { ACTIVITY_SYNC_KIND, activityDedupeKey } from "@/tracking/finalize";
import { ascentPaceFor } from "@/services/acclimatisation";
import { RED_FLAG_ORDER, scoreLakeLouise } from "@/trip/lakeLouise";
import { NO_ELEVATION_NOTE, buildSchedule, describeTonight } from "@/trip/schedule";
import type { Trip, TripNight } from "@/trip/trip";

import {
  BODY_LOG_KEY,
  BODY_SYNC_KIND,
  CHECK_STEPS,
  NO_TRIP_OPEN,
  bodyDedupeKey,
  bodyStorageSentence,
  checkInToday,
  emptyDraft,
  forgetBodyEvent,
  parseBodyLog,
  readBodyLog,
  recordBodyEvent,
  toAnswers,
  tonightView,
  unsureFlags,
  withCheckIn,
  withIntake,
  writeBodyLog,
} from "./body";
import { fromRecord, tripDay } from "./tripModel";

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

/* -------------------------------------------------------------------------- */

console.log("\n\x1b[1m1 — The glove-sized check\x1b[0m");
eq("ten steps", CHECK_STEPS.length, 10);
eq(
  "warning signs are asked first",
  CHECK_STEPS.slice(0, 5).map((s) => (s.kind === "flag" ? s.id : s.kind)),
  [...RED_FLAG_ORDER],
);
eq("functional question is last", CHECK_STEPS[9].kind, "functional");

{
  const d = emptyDraft();
  d.flags.ataxia = "unsure";
  d.flags.confusion = "no";
  const a = toAnswers(d);
  eq("'Not sure' is stored as not answered", a.redFlags.ataxia, null);
  eq("'No' stays no", a.redFlags.confusion, false);
  eq("unsure flags are listed", unsureFlags(d), ["ataxia"]);
  const r = scoreLakeLouise(a);
  check("'Not sure' is never read as no: warning signs not all answered", r.redFlagsAnswered === false);
  check("'Not sure' does not by itself escalate", r.escalation === "incomplete");

  const yes = emptyDraft();
  yes.flags["frothy-cough"] = "yes";
  eq("a yes fires the descent card on an otherwise empty form", scoreLakeLouise(toAnswers(yes)).escalation, "descend-now");

  const allNo = emptyDraft();
  for (const id of RED_FLAG_ORDER) allNo.flags[id] = "no";
  allNo.items = { headache: 0, gastrointestinal: 0, fatigue: 0, dizziness: 0 };
  allNo.functional = 0;
  const clear = scoreLakeLouise(toAnswers(allNo));
  eq("all clear: a score, not a diagnosis", [clear.escalation, clear.total], ["nothing-recorded", 0]);
  check("every result carries the not-a-diagnosis line", clear.notADiagnosis.length > 0);
}

/* -------------------------------------------------------------------------- */

console.log("\n\x1b[1m2 — Tonight's ceiling, word for word\x1b[0m");

const TODAY = "2026-09-14";
const record = (over: Partial<Trip> = {}): Trip => ({
  id: "t1",
  name: "Test trip",
  goalId: null,
  peakName: "Test peak",
  peakElevationM: 5895,
  startDate: "2026-09-12",
  endDate: "2026-09-18",
  createdAt: "2026-09-01T00:00:00Z",
  endedAt: null,
  ...over,
});
const night = (date: string, m: number): TripNight => ({ tripId: "t1", date, sleptAtM: m, recordedAt: `${date}T20:00:00Z` });

{
  eq("no trip", tonightView(null, null, [], null, TODAY), { kind: "no-trip", sentence: NO_TRIP_OPEN });

  const before = fromRecord(record({ startDate: "2026-09-20", endDate: "2026-09-25" }), null);
  const vb = tonightView(before, tripDay(before, TODAY), [], null, TODAY);
  check("before the trip: silent, never a negative day", vb.kind === "silent" && vb.sentence.includes("starts in 6 days"), vb.sentence);

  const after = fromRecord(record({ startDate: "2026-09-01", endDate: "2026-09-05" }), null);
  const va = tonightView(after, tripDay(after, TODAY), [], null, TODAY);
  check("after the trip: silent", va.kind === "silent" && !/\d,?\d{3} m/.test(va.sentence));

  const noElev = fromRecord(record({ peakElevationM: null }), null);
  const vn = tonightView(noElev, tripDay(noElev, TODAY), [], null, TODAY);
  eq("no elevation: the schedule's own note", vn.sentence, NO_ELEVATION_NOTE);
  eq("no elevation: silent", vn.kind, "silent");

  const low = fromRecord(record({ peakElevationM: 1500 }), null);
  const vl = tonightView(low, tripDay(low, TODAY), [], null, TODAY);
  const lowSchedule = buildSchedule(low.record!, [], null, TODAY);
  eq("below relevance: the schedule's own note", [vl.kind, vl.sentence], ["silent", lowSchedule.note]);

  const t = fromRecord(record(), null);
  const missing = tonightView(t, tripDay(t, TODAY), [], null, TODAY);
  eq(
    "missing last night: silent with describeTonight's reason",
    [missing.kind, missing.sentence],
    ["silent", describeTonight(buildSchedule(t.record!, [], null, TODAY), TODAY)],
  );

  const belowFloor = [night("2026-09-13", 2500)];
  const vf = tonightView(t, tripDay(t, TODAY), belowFloor, null, TODAY);
  eq(
    "below the floor: silent with describeTonight's reason",
    [vf.kind, vf.sentence],
    ["silent", describeTonight(buildSchedule(t.record!, belowFloor, null, TODAY), TODAY)],
  );

  const nights = [night("2026-09-12", 3300), night("2026-09-13", 3600)];
  const vc = tonightView(t, tripDay(t, TODAY), nights, null, TODAY);
  const pace = ascentPaceFor(5895, null)!;
  check("recorded last night: a ceiling", vc.kind === "ceiling");
  if (vc.kind === "ceiling") {
    eq("ceiling is last night plus the policy's own gain", vc.ceilingM, 3600 + pace.maxSleepGainM);
    eq("sentence is describeTonight's, word for word", vc.sentence, describeTonight(buildSchedule(t.record!, nights, null, TODAY), TODAY));
  }

  const example = { ...t, source: "example" as const, record: null };
  const ve = tonightView(example, tripDay(example, TODAY), nights, null, TODAY);
  check("the example trip never borrows the athlete's nights", ve.kind === "silent");
}

/* -------------------------------------------------------------------------- */

console.log("\n\x1b[1m3 — Check-in, drink, eat: kept on this phone\x1b[0m");
{
  eq("nothing stored: nothing logged", parseBodyLog(null), { checkIn: null, drinkAt: null, eatAt: null });
  eq("garbage: nothing logged", parseBodyLog("{not json"), { checkIn: null, drinkAt: null, eatAt: null });
  eq(
    "bad fields are dropped, never guessed",
    parseBodyLog(JSON.stringify({ checkIn: { choice: "fine", date: "x", at: 5 }, drinkAt: -1, eatAt: "now" })),
    { checkIn: null, drinkAt: null, eatAt: null },
  );

  const at = new Date(2026, 8, 14, 9, 30).getTime();
  const log = withCheckIn(parseBodyLog(null), "unwell", at);
  eq("check-in is dated by the phone's local day", log.checkIn?.date, "2026-09-14");
  check("today's check-in shows today", checkInToday(log, "2026-09-14") !== null);
  eq("yesterday's check-in is never shown as today's", checkInToday(log, "2026-09-15"), null);

  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  const next = withIntake(withIntake(log, "drink", at + 1000), "eat", at + 2000);
  check("write reports that it was kept", writeBodyLog(next, store));
  check("stored under its own key", mem.has(BODY_LOG_KEY));
  eq("read back", readBodyLog(store), next);
  eq("undo restores the earlier value", withIntake(next, "drink", null).drinkAt, null);

  const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  check("a refused write is reported, not assumed", writeBodyLog(next, broken) === false);
  const throwingRead = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
  eq("a refused read is nothing logged", readBodyLog(throwingRead), { checkIn: null, drinkAt: null, eatAt: null });
}

/* -------------------------------------------------------------------------- */

console.log("\n\x1b[1m4 — The history, and what the sync queue makes of it\x1b[0m");
{
  eq("every body event has a queue kind", Object.keys(BODY_SYNC_KIND).sort(), [
    "check-in",
    "drink",
    "eat",
    "symptom-check",
  ]);
  eq("drink and food share one kind", BODY_SYNC_KIND.drink, BODY_SYNC_KIND.eat);
  eq("a check-in and a symptom check share one kind", BODY_SYNC_KIND["check-in"], BODY_SYNC_KIND["symptom-check"]);
  eq("the tab's line is the queue's own answer", bodyStorageSentence(), KEPT_HERE);
  eq("a recorded session says the same", savedSentenceFor(ACTIVITY_SYNC_KIND), KEPT_HERE);
  eq("one queue row per session id", activityDedupeKey("act-1"), "activity:act-1");

  eq("a double tap in the same millisecond is one thing", bodyDedupeKey("drink", 100), bodyDedupeKey("drink", 100));
  check("a later drink is its own thing", bodyDedupeKey("drink", 100) !== bodyDedupeKey("drink", 101));
  check("drink and food never merge", bodyDedupeKey("drink", 100) !== bodyDedupeKey("eat", 100));
  check("today's second check-in never merges into the first", bodyDedupeKey("check-in", 9) !== bodyDedupeKey("check-in", 10));
}

await (async () => {
  __resetSyncQueueForTests();
  __useMemoryDeviceStorage();

  const at = new Date(2026, 8, 14, 9, 30).getTime();
  const saved = await recordBodyEvent({ kind: "check-in", at, tripId: "trip-1", choice: "unwell" });
  eq("a check-in is kept on this phone, not queued", saved.where.state, "kept-on-phone");
  eq("and says so in one line", saved.where.sentence, KEPT_HERE);
  eq("nothing is put in the waiting list", saved.where.queueId, null);
  eq("no row reaches the queue", (await deviceStore("syncQueue").getAll()).length, 0);

  const rows = await deviceStore("checkIns").getAll();
  eq("the history keeps one row", rows.length, 1);
  eq("stamped with its own day", rows[0]?.date, "2026-09-14");
  eq("with the kind it was", rows[0]?.kind, "check-in");
  eq("and what was tapped", rows[0]?.choice, "unwell");

  const drink = await recordBodyEvent({ kind: "drink", at: at + 1000, tripId: null, choice: null });
  eq("a drink joins the history", (await deviceStore("checkIns").getAll()).length, 2);
  await forgetBodyEvent(drink);
  eq("undo takes the mis-tap back out", (await deviceStore("checkIns").getAll()).length, 1);

  // Proves the sentence is read from the queue rather than written into the screen:
  // a kind WITH a destination goes in and is counted as waiting.
  const sendable = await saveOffline({ kind: "test.upload", payload: { n: 1 }, dedupeKey: "t:1" });
  eq("a kind with a destination waits to send", sendable.state, "waiting");
  check("waiting copy says when it will go", sendable.sentence.includes("next time you open it with a signal"));
  eq("and it is in the queue", (await deviceStore("syncQueue").getAll()).length, 1);
  await forgetOffline(sendable);
  eq("taking it back out empties the queue", (await deviceStore("syncQueue").getAll()).length, 0);

  __useBrokenDeviceStorage("no database");
  const noDb = await recordBodyEvent({ kind: "eat", at: at + 2000, tripId: null, choice: null });
  eq("a phone with no database still reports plainly", noDb.where.state, "kept-on-phone");
  await forgetBodyEvent(noDb);
  check("undo on a phone with no database does not throw", true);

  __resetDeviceStorageForTests();
  __resetSyncQueueForTests();
})();

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  if (proc) proc.exitCode = 1;
}
