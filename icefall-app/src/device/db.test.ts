/**
 * The on-device database, without a browser.
 *
 * The in-memory backend stands in for IndexedDB here; the real IndexedDB
 * backend is proved in the Playwright run, which has a real database.
 */

import {
  DEVICE_SCHEMA,
  DeviceStorageError,
  NO_DATABASE_SENTENCE,
  __resetDeviceStorageForTests,
  __useBrokenDeviceStorage,
  __useMemoryDeviceStorage,
  deviceStorageStatus,
  deviceStore,
  eraseDeviceData,
  exportDeviceData,
  kvDelete,
  kvGet,
  kvSet,
  onDeviceStorageChange,
  openDeviceStorage,
  planSchemaChanges,
} from "./db";
import type { Breadcrumb, CheckInRecord, DeviceStoreName, JournalPhoto } from "./types";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${err instanceof Error ? err.message : String(err)}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} expected ${e}, got ${a}`);
}

function ok(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const crumb = (trackId: string, t: number): Breadcrumb => ({
  trackId,
  t,
  lat: 45.8,
  lon: 6.8,
  altitudeM: 3000,
  accuracyM: 10,
  altitudeAccuracyM: null,
});

const checkIn = (id: string, at: number, date: string): CheckInRecord => ({
  id,
  kind: "check-in",
  at,
  date,
  tripId: null,
  choice: "good",
  score: null,
  altitudeM: null,
  lat: null,
  lon: null,
  note: null,
});

async function main() {
  await test("schema: every brief store exists, names are unique", () => {
    const names = DEVICE_SCHEMA.map((s) => s.name);
    const want: DeviceStoreName[] = [
      "tripPacks",
      "breadcrumbs",
      "checkIns",
      "journal",
      "journalPhotos",
      "documents",
      "gearTicks",
      "contacts",
      "syncQueue",
      "activities",
      "kv",
    ];
    for (const n of want) ok(names.includes(n), `missing store ${n}`);
    eq(new Set(names).size, names.length, "unique store names");
    for (const s of DEVICE_SCHEMA) {
      const idx = (s.indexes ?? []).map((i) => i.name);
      eq(new Set(idx).size, idx.length, `unique index names in ${s.name}`);
    }
  });

  await test("planSchemaChanges: fresh database creates everything", () => {
    const c = planSchemaChanges({});
    eq(c.createStores.length, DEVICE_SCHEMA.length);
    eq(c.createIndexes.length, DEVICE_SCHEMA.reduce((n, s) => n + (s.indexes?.length ?? 0), 0));
  });

  await test("planSchemaChanges: up-to-date database creates nothing", () => {
    const existing: Record<string, string[]> = {};
    for (const s of DEVICE_SCHEMA) existing[s.name] = (s.indexes ?? []).map((i) => i.name);
    eq(planSchemaChanges(existing), { createStores: [], createIndexes: [] });
  });

  await test("planSchemaChanges: adds only a missing index on an existing store", () => {
    const existing: Record<string, string[]> = {};
    for (const s of DEVICE_SCHEMA) existing[s.name] = (s.indexes ?? []).map((i) => i.name);
    existing.checkIns = ["at"];
    const c = planSchemaChanges(existing);
    eq(c.createStores, []);
    eq(c.createIndexes.map((x) => `${x.store}.${x.index.name}`), ["checkIns.date"]);
  });

  __useMemoryDeviceStorage();

  await test("put / get / delete round-trip, and get returns a copy", async () => {
    const s = deviceStore("checkIns");
    const row = checkIn("a", 1000, "2026-09-15");
    await s.put(row);
    const got = await s.get("a");
    eq(got, row);
    (got as CheckInRecord).note = "mutated";
    eq((await s.get("a"))?.note, null, "stored row unaffected by caller mutation");
    await s.delete("a");
    eq(await s.get("a"), undefined);
  });

  await test("byIndex and ranges on a time index, newest first with a limit", async () => {
    const s = deviceStore("checkIns");
    await s.putAll([
      checkIn("1", 100, "2026-09-14"),
      checkIn("2", 300, "2026-09-15"),
      checkIn("3", 200, "2026-09-15"),
    ]);
    /* Equal index keys come back in primary-key order, as IndexedDB does. */
    eq((await s.byIndex("date", "2026-09-15")).map((r) => r.id), ["2", "3"]);
    eq((await s.byIndex("date", "2026-09-15", { direction: "prev", limit: 1 })).map((r) => r.id), ["3"]);
    eq((await s.getAll({ index: "at", from: 150 })).map((r) => r.id), ["3", "2"]);
    eq(await s.count({ index: "date", only: "2026-09-14" }), 1);
    eq(await s.keys({ index: "at", direction: "prev" }), ["2", "3", "1"]);
    await s.clear();
    eq(await s.count(), 0);
  });

  await test("breadcrumbs: compound key keeps tracks apart and in time order", async () => {
    const s = deviceStore("breadcrumbs");
    await s.putAll([crumb("b", 5), crumb("a", 20), crumb("a", 10), crumb("b", 1)]);
    eq((await s.byIndex("trackId", "a")).map((c) => c.t), [10, 20]);
    eq((await s.get(["b", 5]))?.t, 5);
    await s.put({ ...crumb("a", 10), lat: 1 });
    eq(await s.count({ index: "trackId", only: "a" }), 2, "same key overwrites");
    await s.deleteAll([
      ["a", 10],
      ["a", 20],
    ]);
    eq(await s.count(), 2);
  });

  await test("a row without its key is refused, not stored", async () => {
    const s = deviceStore("journal");
    let threw = false;
    try {
      await s.put({ text: "no id" } as never);
    } catch (err) {
      threw = err instanceof DeviceStorageError;
    }
    ok(threw, "expected DeviceStorageError");
  });

  await test("kv: set, get with its time, delete", async () => {
    await kvSet("activitiesMigrated", { count: 3 }, 42);
    eq(await kvGet<{ count: number }>("activitiesMigrated"), { key: "activitiesMigrated", value: { count: 3 }, at: 42 });
    await kvDelete("activitiesMigrated");
    eq(await kvGet("activitiesMigrated"), undefined);
  });

  await test("export strips blobs, erase empties every store", async () => {
    const photo: JournalPhoto = {
      id: "p1",
      entryId: "e1",
      at: 1,
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      mime: "image/jpeg",
      sizeBytes: 4,
    };
    await deviceStore("journalPhotos").put(photo);
    const got = await deviceStore("journalPhotos").get("p1");
    ok(got?.blob instanceof Blob, "blob survives storage");
    const out = await exportDeviceData();
    const rows = out["icefall-device.journalPhotos"] as Record<string, unknown>[];
    eq(rows[0].blob, "(binary file, not included in this export)");
    eq(rows[0].sizeBytes, 4);
    await eraseDeviceData();
    eq(await deviceStore("journalPhotos").count(), 0);
    eq(deviceStorageStatus().state, "ready");
  });

  await test("broken storage: every call rejects with DeviceStorageError, status says why", async () => {
    let heard = 0;
    const off = onDeviceStorageChange(() => {
      heard += 1;
    });
    __useBrokenDeviceStorage("private window");
    off();
    ok(heard >= 1, "listeners told");
    eq(deviceStorageStatus(), { state: "unavailable", reason: "private window", inMemory: false });
    eq(await openDeviceStorage(), false);
    let err: unknown;
    try {
      await deviceStore("documents").getAll();
    } catch (e) {
      err = e;
    }
    ok(err instanceof DeviceStorageError, "getAll rejects");
    let kvErr: unknown;
    try {
      await kvSet("x", 1);
    } catch (e) {
      kvErr = e;
    }
    ok(kvErr instanceof DeviceStorageError, "kvSet rejects");
    ok(NO_DATABASE_SENTENCE.length > 0, "honest sentence exists");
  });

  await test("no indexedDB global (Node): opening fails honestly", async () => {
    __resetDeviceStorageForTests();
    eq(deviceStorageStatus().state, "unopened");
    eq(await openDeviceStorage(), false);
    const st = deviceStorageStatus();
    eq(st.state, "unavailable");
    ok(st.reason && st.reason.length > 0, "reason given");
  });

  console.log(`device db: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  /* The open timeout timer from the last test would keep Node alive for 8 s. */
  process.exit(0);
}

void main();
