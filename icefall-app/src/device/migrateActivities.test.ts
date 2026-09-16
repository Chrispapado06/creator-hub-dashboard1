/**
 * The activities migration, against the in-memory database and a fake
 * browser bucket. The real IndexedDB path is for the Playwright run.
 */

class FakeStorage {
  data = new Map<string, string>();
  hook: ((key: string) => void) | null = null;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.hook?.(k);
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}
const storage = new FakeStorage();
(globalThis as unknown as { localStorage: FakeStorage }).localStorage = storage;

import { __resetDeviceStorageForTests, __useBrokenDeviceStorage, __useMemoryDeviceStorage, deviceStore, kvGet } from "./db";
import {
  ACTIVITIES_DELETED_KEY,
  ACTIVITIES_KEY,
  ACTIVITIES_LOCATION_KEY,
  ACTIVITIES_UNSAVED_KEY,
  MIGRATION_KV_KEY,
  __relaunchActivitiesForTests,
  activitiesStorageSentence,
  activitiesStorageStatus,
  activityChecksum,
  checksum,
  normaliseActivity,
  setChecksum,
  startActivitiesStorage,
} from "./migrateActivities";
import { deleteActivity, loadActivities, saveActivity } from "@/tracking/store";
import type { RecordedActivity } from "@/tracking/types";

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

/* Test fixtures only: shapes, not real sessions. */
const act = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, title: `t-${id}`, startedAt: "2026-01-01T08:00:00Z", points: [], origin: { kind: "icefall" }, ...extra }) as unknown as RecordedActivity;

const ids = (list: RecordedActivity[]) => list.map((a) => a.id);
const activities = deviceStore("activities");

function fresh(bucket?: unknown) {
  storage.clear();
  storage.hook = null;
  __resetDeviceStorageForTests();
  __useMemoryDeviceStorage();
  if (bucket !== undefined) storage.setItem(ACTIVITIES_KEY, JSON.stringify(bucket));
  __relaunchActivitiesForTests();
}

await test("checksums: identical content matches, any change does not, set order does not matter", () => {
  eq(checksum("abc"), checksum("abc"));
  ok(checksum("abc") !== checksum("abd"), "one char changes it");
  eq(checksum("").length, 16);
  eq(setChecksum([{ id: "a", sum: "1" }, { id: "b", sum: "2" }]), setChecksum([{ id: "b", sum: "2" }, { id: "a", sum: "1" }]));
  ok(activityChecksum(act("a")) !== activityChecksum(act("a", { title: "x" })), "content counts");
});

await test("normalise strips removed points fields and defaults origin", () => {
  const n = normaliseActivity({ id: "a", points_awarded: 5, pointsBreakdown: [], points: [1] }) as unknown as Record<string, unknown>;
  eq(n.points_awarded, undefined);
  eq(n.pointsBreakdown, undefined);
  eq(n.points, [1]);
  eq(n.origin, { kind: "icefall" });
});

await test("moves every activity, verifies, then deletes the bucket copy; reads are unchanged", async () => {
  fresh([act("c"), { id: "b", title: "old", points: [], points_awarded: 9 }, act("a")]);
  const before = loadActivities();
  const s = await startActivitiesStorage();
  eq(s.state, "done");
  ok(s.onDevice, "on device");
  eq(s.moved, 3);
  eq(storage.getItem(ACTIVITIES_KEY), null, "bucket copy deleted");
  eq(storage.getItem(ACTIVITIES_LOCATION_KEY), "device");
  eq(await activities.count(), 3);
  eq(loadActivities(), before, "same list, same order, same content");
  eq((await kvGet<{ state: string }>(MIGRATION_KV_KEY))?.value.state, "switched");
  eq(activitiesStorageSentence(), null);
});

await test("a new athlete with nothing saved switches straight to the database", async () => {
  fresh();
  eq((await startActivitiesStorage()).state, "done");
  ok(activitiesStorageStatus().onDevice, "on device");
  eq(loadActivities(), []);
});

await test("no database: fails in words, deletes nothing, the bucket keeps working", async () => {
  fresh([act("a")]);
  __useBrokenDeviceStorage("blocked");
  const s = await startActivitiesStorage();
  eq(s.state, "failed");
  ok(!s.onDevice, "still in the bucket");
  ok(storage.getItem(ACTIVITIES_KEY), "bucket untouched");
  ok((activitiesStorageSentence() ?? "").includes("Nothing was deleted"), "honest sentence");
  saveActivity(act("b"));
  eq(ids(loadActivities()), ["b", "a"], "saves still go to the bucket");
});

await test("resumes an interrupted run: skips identical copies, fixes differing ones, drops stale ones", async () => {
  fresh([act("a"), act("b"), act("c")]);
  await activities.putAll([
    { id: "a", savedAt: 1, activity: normaliseActivity(act("a")) },
    { id: "b", savedAt: 1, activity: normaliseActivity(act("b", { title: "half-written" })) },
    { id: "gone", savedAt: 1, activity: normaliseActivity(act("gone")) },
  ]);
  eq((await startActivitiesStorage()).state, "done");
  eq((await activities.keys()).sort(), ["a", "b", "c"]);
  eq((await activities.get("b"))?.activity.title, "t-b");
  eq(ids(loadActivities()), ["a", "b", "c"]);
});

await test("a save during the copy sends it round again and nothing is lost", async () => {
  fresh([act("a")]);
  let reads = 0;
  storage.hook = (k) => {
    if (k !== ACTIVITIES_KEY) return;
    reads += 1;
    if (reads === 2) {
      storage.hook = null;
      storage.setItem(ACTIVITIES_KEY, JSON.stringify([act("new"), act("a")]));
    }
  };
  eq((await startActivitiesStorage()).state, "done");
  eq(storage.getItem(ACTIVITIES_KEY), null);
  eq(ids(loadActivities()), ["new", "a"]);
});

await test("saves that never stop: gives up for now, keeps the bucket in charge", async () => {
  fresh([act("a")]);
  let n = 0;
  storage.hook = (k) => {
    if (k === ACTIVITIES_KEY) storage.data.set(ACTIVITIES_KEY, JSON.stringify([act(`x${(n += 1)}`), act("a")]));
  };
  const s = await startActivitiesStorage();
  storage.hook = null;
  eq(s.state, "retry-later");
  ok(!s.onDevice, "bucket still in charge");
  ok(storage.getItem(ACTIVITIES_KEY), "bucket kept");
  __relaunchActivitiesForTests();
  eq((await startActivitiesStorage()).state, "done", "finishes next launch");
});

await test("rows without an id and conflicting duplicates stay in the bucket and still show", async () => {
  fresh([act("a"), { title: "no id", points: [] }, act("a"), act("a", { title: "conflict" })]);
  const s = await startActivitiesStorage();
  eq(s.state, "done");
  eq(s.keptInBrowser, 2);
  const left = JSON.parse(storage.getItem(ACTIVITIES_KEY) as string) as { title: string }[];
  eq(left.map((r) => r.title), ["no id", "conflict"]);
  eq(loadActivities().map((a) => a.title), ["t-a", "no id"], "the database copy wins for its id");
  __relaunchActivitiesForTests();
  eq((await startActivitiesStorage()).keptInBrowser, 2, "a relaunch does not overwrite the database with the stale row");
  eq((await activities.get("a"))?.activity.title, "t-a");
});

await test("device mode: save and delete persist across a relaunch", async () => {
  fresh([act("a"), act("b")]);
  await startActivitiesStorage();
  eq(ids(saveActivity(act("c"))), ["c", "a", "b"]);
  saveActivity(act("a", { title: "edited" }));
  eq(ids(deleteActivity("b")), ["a", "c"]);
  await new Promise((r) => setTimeout(r, 0));
  __relaunchActivitiesForTests();
  eq(loadActivities(), [], "nothing before the database loads");
  await startActivitiesStorage();
  eq(ids(loadActivities()), ["a", "c"]);
  eq(loadActivities()[0].title, "edited");
  eq(storage.getItem(ACTIVITIES_DELETED_KEY), null, "tombstone cleared once deleted");
});

await test("device mode: a refused save is kept, counted, said, and retried next launch", async () => {
  fresh([act("a")]);
  await startActivitiesStorage();
  __useBrokenDeviceStorage("quota");
  saveActivity(act("z"));
  await new Promise((r) => setTimeout(r, 0));
  eq(activitiesStorageStatus().unsaved, 1);
  ok((activitiesStorageSentence() ?? "").startsWith("1 activity"), "sentence");
  ok(storage.getItem(ACTIVITIES_UNSAVED_KEY), "kept in the bucket");
  ok(ids(loadActivities()).includes("z"), "still listed");
  __useMemoryDeviceStorage();
  __relaunchActivitiesForTests();
  await startActivitiesStorage();
  eq(activitiesStorageStatus().unsaved, 0);
  eq(storage.getItem(ACTIVITIES_UNSAVED_KEY), null);
  ok(await activities.get("z"), "now in the database");
});

await test("marker lost after the switch: the database record still decides", async () => {
  fresh([act("a")]);
  await startActivitiesStorage();
  storage.removeItem(ACTIVITIES_LOCATION_KEY);
  __relaunchActivitiesForTests();
  eq(loadActivities(), [], "bucket mode until the database answers");
  await startActivitiesStorage();
  ok(activitiesStorageStatus().onDevice, "back on device");
  eq(ids(loadActivities()), ["a"]);
});

await test("a corrupt bucket is never deleted", async () => {
  fresh();
  storage.setItem(ACTIVITIES_KEY, "{not json");
  __relaunchActivitiesForTests();
  const s = await startActivitiesStorage();
  eq(s.state, "failed");
  eq(storage.getItem(ACTIVITIES_KEY), "{not json");
});

console.log(`migrateActivities: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
