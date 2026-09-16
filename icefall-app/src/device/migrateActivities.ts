/**
 * MOVING RECORDED ACTIVITIES OUT OF THE BROWSER BUCKET (plan §2.4, §8 item 8).
 *
 * The bucket holds about 5 MB and `tracking/store.ts` throws away everything
 * but the newest twenty activities when it fills. This moves every athlete's
 * history into the on-device database, once, automatically.
 *
 * The order is what makes it safe:
 *
 *   1. Copy every activity into the database, in small batches, skipping any
 *      already there unchanged — so a run killed half way resumes.
 *   2. Read the copy back and compare count, ids and a checksum per record.
 *      Any mismatch stops here; nothing is deleted.
 *   3. Record "switched" in the database.
 *   4. In ONE synchronous step, re-read the bucket. If anything was saved while
 *      we were copying, go round again. Otherwise delete the bucket copy and
 *      flip the local marker. No save can land between that check and the
 *      delete, because nothing else runs in between.
 *
 * Until the marker flips, the bucket stays the only source of truth and the
 * app behaves exactly as before. If the database is missing or refuses, the
 * migration reports it in words and the bucket keeps working.
 *
 * This module must not import `tracking/store.ts`: the store imports this.
 */

import type { RecordedActivity } from "@/tracking/types";
import { deviceStore, kvGet, kvSet, openDeviceStorage, deviceStorageStatus } from "./db";
import type { StoredActivity } from "./types";

export const ACTIVITIES_KEY = "icefall.activities.v1";
/** "device" once the history lives in the database. A fast, synchronous hint; the database's own record decides. */
export const ACTIVITIES_LOCATION_KEY = "icefall.activities.location.v1";
/** Device-mode saves the database refused, kept here so they are not lost with the session. */
export const ACTIVITIES_UNSAVED_KEY = "icefall.activities.unsaved.v1";
/** Deletes the database refused, so a deleted activity does not come back next launch. */
export const ACTIVITIES_DELETED_KEY = "icefall.activities.deleted.v1";
export const MIGRATION_KV_KEY = "activities.migration";

const BATCH = 25;
const MAX_PASSES = 3;

/* -------------------------------------------------------------------------- */
/* Reading a stored record                                                     */
/* -------------------------------------------------------------------------- */

/**
 * PH-01 — points were removed from the system, not just from the code. Records
 * already on a phone still carry `points_awarded` / `pointsBreakdown`, so they
 * are stripped on the one read path everything goes through. `points` (the GPS
 * track) is untouched.
 *
 * `origin` is required on `RecordedActivity` but predates most stored records;
 * every one of those was recorded in ICEFALL, so that is the only default.
 */
type LegacyFields = { points_awarded?: unknown; pointsBreakdown?: unknown; origin?: RecordedActivity["origin"] };

export function normaliseActivity(raw: unknown): RecordedActivity {
  const { points_awarded: _p, pointsBreakdown: _b, origin, ...rest } = (raw ?? {}) as RecordedActivity & LegacyFields;
  return { ...rest, origin: origin ?? { kind: "icefall" } } as RecordedActivity;
}

/** cyrb53 — not cryptographic; it only has to catch a copy that differs from its source. */
export function checksum(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export const activityChecksum = (a: RecordedActivity): string => checksum(JSON.stringify(a));

/** One checksum over a whole set, independent of order. */
export function setChecksum(rows: { id: string; sum: string }[]): string {
  return checksum(
    rows
      .map((r) => `${r.id}:${r.sum}`)
      .sort()
      .join("\n"),
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export type ActivitiesStorageState =
  /** Not started this session. The bucket is in charge. */
  | "idle"
  | "running"
  /** History is in the database. */
  | "done"
  /** Stopped before deleting anything. The bucket is still in charge and still works. */
  | "failed"
  /** Activities kept being saved during the copy. Tries again next launch. */
  | "retry-later";

export interface ActivitiesStorageStatus {
  state: ActivitiesStorageState;
  onDevice: boolean;
  /** Activities in the database after the last pass. */
  moved: number;
  /** Rows left in the bucket that could not be moved safely (no id, or a conflicting duplicate). */
  keptInBrowser: number;
  /** Saves the database refused this session or earlier, waiting in the bucket or in memory. */
  unsaved: number;
  reason: string | null;
}

let status: ActivitiesStorageStatus = {
  state: "idle",
  onDevice: false,
  moved: 0,
  keptInBrowser: 0,
  unsaved: 0,
  reason: null,
};
const listeners = new Set<() => void>();

function setStatus(patch: Partial<ActivitiesStorageStatus>) {
  status = { ...status, ...patch, onDevice: mode === "device", unsaved: unsaved.size };
  listeners.forEach((l) => l());
}

export function activitiesStorageStatus(): ActivitiesStorageStatus {
  return status;
}

/** Fires when the stored list or the status changes — e.g. when the database finishes loading. */
export function onActivitiesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** One plain sentence for the screen, or null when there is nothing to say. */
export function activitiesStorageSentence(s: ActivitiesStorageStatus = status): string | null {
  if (s.unsaved > 0) {
    return s.unsaved === 1
      ? "1 activity isn't in this phone's database yet. It's kept in browser storage for now."
      : `${s.unsaved} activities aren't in this phone's database yet. They're kept in browser storage for now.`;
  }
  if (s.state === "failed") {
    return s.onDevice
      ? `Your saved activities couldn't be read from this phone's database. Nothing was deleted. (${s.reason ?? "unknown reason"})`
      : `Your activities couldn't be moved to this phone's database, so they stay in browser storage, which is small. Nothing was deleted. (${s.reason ?? "unknown reason"})`;
  }
  if (s.state === "retry-later") return "Moving your activities to this phone's database will finish next time you open ICEFALL.";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Local bucket helpers                                                        */
/* -------------------------------------------------------------------------- */

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown[]): boolean {
  const s = ls();
  if (!s) return false;
  try {
    if (value.length === 0) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* The in-memory copy the synchronous store reads                              */
/* -------------------------------------------------------------------------- */

type Mode = "bucket" | "device";

let mode: Mode = ls()?.getItem(ACTIVITIES_LOCATION_KEY) === "device" ? "device" : "bucket";
const mirror = new Map<string, StoredActivity>();
const unsaved = new Map<string, StoredActivity>(
  readJson<StoredActivity[]>(ACTIVITIES_UNSAVED_KEY, []).map((r) => [r.id, r]),
);
const deleted = new Set<string>(readJson<string[]>(ACTIVITIES_DELETED_KEY, []));
let lastSavedAt = 0;

const store = deviceStore("activities");

/** A strictly increasing save time, so two saves in one millisecond keep their order. */
function nextSavedAt(): number {
  lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
  return lastSavedAt;
}

function mergeIntoMirror(rows: StoredActivity[]) {
  for (const r of rows) {
    if (deleted.has(r.id)) continue;
    const have = mirror.get(r.id);
    if (!have || have.savedAt < r.savedAt) mirror.set(r.id, r);
    lastSavedAt = Math.max(lastSavedAt, r.savedAt);
  }
}

export function isActivitiesOnDevice(): boolean {
  return mode === "device";
}

/**
 * The whole list in device mode, newest save first; null in bucket mode, where
 * `tracking/store.ts` reads the bucket exactly as it always has.
 *
 * Dual read: database rows, overlaid by saves the database refused, followed by
 * anything still in the bucket under an id the database does not have.
 */
export function readDeviceActivities(): RecordedActivity[] | null {
  if (mode !== "device") return null;
  const byId = new Map(mirror);
  for (const [id, r] of unsaved) {
    const have = byId.get(id);
    if (!have || have.savedAt <= r.savedAt) byId.set(id, r);
  }
  const out = [...byId.values()]
    .filter((r) => !deleted.has(r.id))
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((r) => normaliseActivity(r.activity));
  const leftovers = readJson<unknown[]>(ACTIVITIES_KEY, []);
  if (Array.isArray(leftovers)) {
    for (const raw of leftovers) {
      const id = (raw as { id?: unknown })?.id;
      if (typeof id === "string" && (byId.has(id) || deleted.has(id))) continue;
      out.push(normaliseActivity(raw));
    }
  }
  return out;
}

/** Device mode only. Updates the list at once; the database write follows, and a refusal is kept and reported. */
export function writeDeviceActivity(a: RecordedActivity): void {
  const row: StoredActivity = { id: a.id, savedAt: nextSavedAt(), activity: a };
  if (deleted.delete(a.id)) writeJson(ACTIVITIES_DELETED_KEY, [...deleted]);
  mirror.set(a.id, row);
  listeners.forEach((l) => l());
  void store.put(row).then(
    () => {
      const waiting = unsaved.get(a.id);
      if (waiting && waiting.savedAt <= row.savedAt) {
        unsaved.delete(a.id);
        writeJson(ACTIVITIES_UNSAVED_KEY, [...unsaved.values()]);
        setStatus({});
      }
    },
    (err) => {
      unsaved.set(a.id, row);
      const kept = writeJson(ACTIVITIES_UNSAVED_KEY, [...unsaved.values()]);
      setStatus({
        reason: kept
          ? errorText(err)
          : `${errorText(err)}. Browser storage is full too, so this activity is only kept until ICEFALL closes`,
      });
    },
  );
}

/** Device mode only. */
export function removeDeviceActivity(id: string): void {
  mirror.delete(id);
  if (unsaved.delete(id)) writeJson(ACTIVITIES_UNSAVED_KEY, [...unsaved.values()]);
  deleted.add(id);
  writeJson(ACTIVITIES_DELETED_KEY, [...deleted]);
  listeners.forEach((l) => l());
  void store.delete(id).then(
    () => {
      deleted.delete(id);
      writeJson(ACTIVITIES_DELETED_KEY, [...deleted]);
    },
    () => {
      /* The tombstone stays; the next launch retries the delete. */
    },
  );
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* -------------------------------------------------------------------------- */
/* Start-up                                                                    */
/* -------------------------------------------------------------------------- */

interface MigrationRecord {
  state: "copying" | "switched";
  total: number;
  copied: number;
  sourceChecksum: string | null;
}

let running: Promise<ActivitiesStorageStatus> | null = null;

/**
 * Call once at app start. Safe to call again; it returns the same run.
 * Never rejects — failure is a status, and the bucket keeps working.
 */
export function startActivitiesStorage(): Promise<ActivitiesStorageStatus> {
  if (!running) running = run();
  return running;
}

async function run(): Promise<ActivitiesStorageStatus> {
  setStatus({ state: "running", reason: null });
  if (!ls()) {
    setStatus({ state: "failed", reason: "this browser has no storage" });
    return status;
  }
  if (!(await openDeviceStorage())) {
    setStatus({ state: "failed", reason: deviceStorageStatus().reason ?? "this phone has no database" });
    return status;
  }
  try {
    const record = (await kvGet<MigrationRecord>(MIGRATION_KV_KEY))?.value;
    if (mode === "bucket" && record?.state === "switched") {
      const raw = ls()?.getItem(ACTIVITIES_KEY) ?? null;
      /* Switched but the marker never landed: the database is in charge unless the bucket changed since. */
      if (raw === null || checksum(raw) === record.sourceChecksum) flipToDevice();
    }
    if (mode === "device") await hydrate();
    await retryPending();
    return await migrate();
  } catch (err) {
    setStatus({ state: "failed", reason: errorText(err) });
    return status;
  }
}

function flipToDevice() {
  mode = "device";
  try {
    ls()?.setItem(ACTIVITIES_LOCATION_KEY, "device");
  } catch {
    /* The database's "switched" record still decides on the next launch. */
  }
}

async function hydrate() {
  mergeIntoMirror(await store.getAll());
  setStatus({ moved: mirror.size });
}

/** A refusal here is not a failed migration: the rows stay waiting and the sentence counts them. */
async function retryPending() {
  if (mode !== "device") return;
  try {
    await retryPendingOnce();
  } catch {
    setStatus({});
  }
}

async function retryPendingOnce() {
  if (unsaved.size) {
    const rows = [...unsaved.values()];
    await store.putAll(rows);
    rows.forEach((r) => unsaved.delete(r.id));
    mergeIntoMirror(rows);
    writeJson(ACTIVITIES_UNSAVED_KEY, [...unsaved.values()]);
  }
  if (deleted.size) {
    await store.deleteAll([...deleted]);
    deleted.clear();
    writeJson(ACTIVITIES_DELETED_KEY, []);
  }
}

async function migrate(): Promise<ActivitiesStorageStatus> {
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const raw = ls()?.getItem(ACTIVITIES_KEY) ?? null;
    if (raw === null && mode === "device") {
      setStatus({ state: "done", moved: mirror.size, keptInBrowser: 0, reason: null });
      return status;
    }
    let source: unknown[] = [];
    if (raw !== null) {
      try {
        source = JSON.parse(raw);
      } catch {
        setStatus({ state: "failed", reason: "the saved activity list could not be read" });
        return status;
      }
      if (!Array.isArray(source)) {
        setStatus({ state: "failed", reason: "the saved activity list is not a list" });
        return status;
      }
    }

    const existing = new Map((await store.getAll()).map((r) => [r.id, r]));
    const chosen = new Map<string, { a: RecordedActivity; sum: string }>();
    const keep: unknown[] = [];
    const toPut: StoredActivity[] = [];
    /* Position in the bucket, newest highest. Always below a real save time, and unchanged for a row when a new save is prepended. */
    const savedAtFor = (i: number) => source.length - i;

    source.forEach((row, i) => {
      const a = normaliseActivity(row);
      const id = (row as { id?: unknown })?.id;
      if (typeof id !== "string" || id === "") {
        keep.push(row);
        return;
      }
      const sum = activityChecksum(a);
      const first = chosen.get(id);
      if (first) {
        /* A second row under the same id: drop it only if it is identical to the one being moved. */
        if (first.sum !== sum) keep.push(row);
        return;
      }
      const have = existing.get(id);
      const same = have !== undefined && activityChecksum(normaliseActivity(have.activity)) === sum;
      const placed = same && (mode === "device" || have.savedAt === savedAtFor(i));
      if (mode === "device") {
        /* The database is in charge; a differing bucket row is older. Keep it, never overwrite. */
        if (have && !same) {
          keep.push(row);
          return;
        }
      }
      chosen.set(id, { a, sum });
      if (!placed) toPut.push({ id, savedAt: mode === "device" && have ? have.savedAt : savedAtFor(i), activity: a });
    });

    /* Bucket mode: the bucket is in charge, so database rows it does not have are stale copies of a deleted activity. */
    const stale = mode === "bucket" ? [...existing.keys()].filter((id) => !chosen.has(id)) : [];
    const sourceChecksum = raw === null ? null : checksum(raw);

    if (toPut.length || stale.length) {
      let copied = 0;
      await kvSet<MigrationRecord>(MIGRATION_KV_KEY, { state: "copying", total: toPut.length, copied, sourceChecksum });
      await store.deleteAll(stale);
      for (let i = 0; i < toPut.length; i += BATCH) {
        await store.putAll(toPut.slice(i, i + BATCH));
        copied = Math.min(toPut.length, i + BATCH);
        await kvSet<MigrationRecord>(MIGRATION_KV_KEY, { state: "copying", total: toPut.length, copied, sourceChecksum });
      }
    }

    /* Verify: every chosen record is in the database, byte-identical, and (bucket mode) nothing else is. */
    const readBack = await store.getAll();
    const back = new Map(readBack.map((r) => [r.id, r]));
    const wanted = [...chosen].map(([id, c]) => ({ id, sum: c.sum }));
    const got = wanted
      .filter((w) => back.has(w.id))
      .map((w) => ({ id: w.id, sum: activityChecksum(normaliseActivity(back.get(w.id)!.activity)) }));
    const countOk = got.length === wanted.length && (mode === "device" || readBack.length === wanted.length);
    if (!countOk || setChecksum(got) !== setChecksum(wanted)) {
      setStatus({ state: "failed", reason: "the copy in the database did not match, so nothing was deleted" });
      return status;
    }

    await kvSet<MigrationRecord>(MIGRATION_KV_KEY, {
      state: "switched",
      total: wanted.length,
      copied: wanted.length,
      sourceChecksum,
    });

    /* ---- one synchronous step: no save can land between this check and the delete ---- */
    if ((ls()?.getItem(ACTIVITIES_KEY) ?? null) !== raw) continue;
    const keptOk = raw === null || keep.length === source.length || writeJson(ACTIVITIES_KEY, keep);
    if (!keptOk) {
      setStatus({ state: "failed", reason: "browser storage refused the change, so nothing was deleted" });
      return status;
    }
    flipToDevice();
    mergeIntoMirror(readBack);
    /* ---- end of synchronous step ---- */

    if (keep.length !== source.length || raw === null) {
      await kvSet<MigrationRecord>(MIGRATION_KV_KEY, {
        state: "switched",
        total: wanted.length,
        copied: wanted.length,
        sourceChecksum: keep.length ? checksum(JSON.stringify(keep)) : null,
      });
    }
    setStatus({ state: "done", moved: mirror.size, keptInBrowser: keep.length, reason: null });
    return status;
  }
  setStatus({ state: "retry-later", reason: null });
  return status;
}

/** TESTS ONLY. Forget the in-memory state and re-read the bucket, as a fresh launch would. */
export function __relaunchActivitiesForTests(): void {
  running = null;
  mode = ls()?.getItem(ACTIVITIES_LOCATION_KEY) === "device" ? "device" : "bucket";
  mirror.clear();
  unsaved.clear();
  readJson<StoredActivity[]>(ACTIVITIES_UNSAVED_KEY, []).forEach((r) => unsaved.set(r.id, r));
  deleted.clear();
  readJson<string[]>(ACTIVITIES_DELETED_KEY, []).forEach((id) => deleted.add(id));
  lastSavedAt = 0;
  listeners.clear();
  status = { state: "idle", onDevice: mode === "device", moved: 0, keptInBrowser: 0, unsaved: unsaved.size, reason: null };
}
