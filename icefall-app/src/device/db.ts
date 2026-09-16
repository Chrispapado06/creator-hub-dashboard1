/**
 * THE ON-DEVICE DATABASE (brief M1, plan §2.4).
 *
 * ============================================================================
 * WHY THERE IS ONE AT ALL
 * ============================================================================
 *
 * Everything ICEFALL keeps is in the browser's small bucket, which holds about
 * five megabytes in total. One recorded activity, thinned to 900 points, is
 * roughly 90 KB — so at about fifty activities `tracking/store.ts` starts
 * failing, and its own fallback THROWS AWAY EVERYTHING BUT THE NEWEST TWENTY
 * (store.ts, the `catch` around `setItem`). Photographs, documents, a
 * downloaded map and a breadcrumb track have nowhere to live at all.
 *
 * ============================================================================
 * WHAT IS NOT IN HERE, AND WHY
 * ============================================================================
 *
 * This database is ASYNCHRONOUS. Everything that must draw on the first frame
 * with no wait stays in the browser bucket where it already is: the trip
 * record, the turnaround time, the last known position, the athlete's emergency
 * info, the settings and the theme. A spinner in front of somebody's own
 * coordinates is the failure Mountain mode exists to prevent (plan §2.4 B).
 *
 * ============================================================================
 * WHY IT IS HAND-WRITTEN
 * ============================================================================
 *
 * `idb` is on this machine, but only as a dependency of Workbox — importing it
 * would work today and break the first time Workbox dropped it. The wrapper it
 * replaces is the file below, and the whole of it is here.
 *
 * ============================================================================
 * IT NEVER PRETENDS TO HAVE WORKED
 * ============================================================================
 *
 * Every call returns a promise that REJECTS when the phone refuses, and
 * `deviceStorageStatus()` says so in words. There is no in-memory fallback in
 * production: a photograph that vanishes at the end of the session, silently,
 * is worse than a screen saying the phone would not keep it. The memory
 * backend below exists for the tests, and is opt-in by an exported call that
 * only a test ever makes.
 */

import type { DeviceStoreName, DeviceStoreTypes, KvRecord } from "./types";

export type * from "./types";

export const DEVICE_DB_NAME = "icefall-device";
/**
 * Bump this AND add an upgrade step below. Never change a store's keyPath in
 * place: a device holding rows under the old key would be silently unreadable.
 */
export const DEVICE_DB_VERSION = 1;

export interface IndexSchema {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
}

export interface StoreSchema {
  name: DeviceStoreName;
  keyPath: string | string[];
  indexes?: IndexSchema[];
}

/** The whole schema, in one list, so a reader can see the device's contents at a glance. */
export const DEVICE_SCHEMA: readonly StoreSchema[] = [
  { name: "tripPacks", keyPath: "id", indexes: [{ name: "tripId", keyPath: "tripId" }] },
  /* Compound key: a track's crumbs are already in time order on disk, so
     reading one track's line is one range read and needs no sort. */
  { name: "breadcrumbs", keyPath: ["trackId", "t"], indexes: [{ name: "trackId", keyPath: "trackId" }] },
  {
    name: "checkIns",
    keyPath: "id",
    indexes: [
      { name: "at", keyPath: "at" },
      { name: "date", keyPath: "date" },
    ],
  },
  { name: "journal", keyPath: "id", indexes: [{ name: "at", keyPath: "at" }, { name: "tripId", keyPath: "tripId" }] },
  { name: "journalPhotos", keyPath: "id", indexes: [{ name: "entryId", keyPath: "entryId" }] },
  { name: "documents", keyPath: "id", indexes: [{ name: "tripId", keyPath: "tripId" }] },
  { name: "gearTicks", keyPath: "id", indexes: [{ name: "scopeId", keyPath: "scopeId" }] },
  { name: "contacts", keyPath: "id", indexes: [{ name: "tripId", keyPath: "tripId" }] },
  { name: "activities", keyPath: "id", indexes: [{ name: "savedAt", keyPath: "savedAt" }] },
  { name: "syncQueue", keyPath: "id", indexes: [{ name: "nextAttemptAt", keyPath: "nextAttemptAt" }, { name: "state", keyPath: "state" }] },
  { name: "kv", keyPath: "key" },
];

/** What an upgrade must create, given what the database already has. Pure, so it is tested without a browser. */
export interface SchemaChanges {
  createStores: DeviceStoreName[];
  createIndexes: { store: DeviceStoreName; index: IndexSchema }[];
}

export function planSchemaChanges(
  existing: Partial<Record<string, readonly string[]>>,
  schema: readonly StoreSchema[] = DEVICE_SCHEMA,
): SchemaChanges {
  const out: SchemaChanges = { createStores: [], createIndexes: [] };
  for (const s of schema) {
    const have = existing[s.name];
    if (!have) out.createStores.push(s.name);
    for (const index of s.indexes ?? []) {
      if (!have || !have.includes(index.name)) out.createIndexes.push({ store: s.name, index });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The small query language                                                    */
/* -------------------------------------------------------------------------- */

export type DeviceKey = IDBValidKey;

export interface DeviceQuery {
  /** An index name from the schema. Omitted: the store's own key. */
  index?: string;
  /** Exactly this key. */
  only?: DeviceKey;
  /** Inclusive bounds. Either end may be omitted. */
  from?: DeviceKey;
  to?: DeviceKey;
  limit?: number;
  /** "prev" walks from the highest key down — newest first on a time index. */
  direction?: "next" | "prev";
}

export interface DeviceStore<T> {
  get(key: DeviceKey): Promise<T | undefined>;
  getAll(query?: DeviceQuery): Promise<T[]>;
  keys(query?: DeviceQuery): Promise<DeviceKey[]>;
  /** Every row whose index `index` equals `key`, in index order. Shorthand for getAll({ index, only }). */
  byIndex(index: string, key: DeviceKey, opts?: Pick<DeviceQuery, "limit" | "direction">): Promise<T[]>;
  put(value: T): Promise<void>;
  /** One transaction for the lot: a batch of breadcrumbs costs one commit, not fifty. */
  putAll(values: T[]): Promise<void>;
  delete(key: DeviceKey): Promise<void>;
  deleteAll(keys: DeviceKey[]): Promise<void>;
  count(query?: DeviceQuery): Promise<number>;
  clear(): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Backends                                                                    */
/* -------------------------------------------------------------------------- */

interface Backend {
  kind: "indexeddb" | "memory";
  get(store: DeviceStoreName, key: DeviceKey): Promise<unknown>;
  getAll(store: DeviceStoreName, q?: DeviceQuery): Promise<unknown[]>;
  keys(store: DeviceStoreName, q?: DeviceQuery): Promise<DeviceKey[]>;
  put(store: DeviceStoreName, values: unknown[]): Promise<void>;
  del(store: DeviceStoreName, keys: DeviceKey[]): Promise<void>;
  count(store: DeviceStoreName, q?: DeviceQuery): Promise<number>;
  clear(store: DeviceStoreName): Promise<void>;
  close(): void;
  erase(): Promise<void>;
}

export class DeviceStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceStorageError";
  }
}

/* --- IndexedDB ------------------------------------------------------------ */

function rangeFor(q?: DeviceQuery): IDBKeyRange | undefined {
  if (!q) return undefined;
  if (q.only !== undefined) return IDBKeyRange.only(q.only);
  if (q.from !== undefined && q.to !== undefined) return IDBKeyRange.bound(q.from, q.to);
  if (q.from !== undefined) return IDBKeyRange.lowerBound(q.from);
  if (q.to !== undefined) return IDBKeyRange.upperBound(q.to);
  return undefined;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new DeviceStorageError(req.error?.message ?? "the phone refused the write"));
  });
}

function indexedDbBackend(db: IDBDatabase): Backend {
  const tx = (store: DeviceStoreName, mode: IDBTransactionMode) => db.transaction(store, mode).objectStore(store);
  const source = (store: DeviceStoreName, mode: IDBTransactionMode, q?: DeviceQuery) => {
    const os = tx(store, mode);
    return q?.index ? os.index(q.index) : os;
  };

  /** Cursor walk — the only way to honour `direction: "prev"` and a limit together. */
  async function walk(store: DeviceStoreName, q: DeviceQuery, want: "values" | "keys"): Promise<unknown[]> {
    const src = source(store, "readonly", q);
    const out: unknown[] = [];
    const limit = q.limit ?? Infinity;
    await new Promise<void>((resolve, reject) => {
      const req = src.openCursor(rangeFor(q), q.direction ?? "next");
      req.onerror = () => reject(new DeviceStorageError(req.error?.message ?? "read failed"));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || out.length >= limit) return resolve();
        out.push(want === "values" ? cursor.value : cursor.primaryKey);
        cursor.continue();
      };
    });
    return out;
  }

  return {
    kind: "indexeddb",
    get: (store, key) => request(tx(store, "readonly").get(key)),
    getAll: (store, q) =>
      q?.direction === "prev" || (q?.limit !== undefined && q.index !== undefined)
        ? walk(store, q, "values")
        : request(source(store, "readonly", q).getAll(rangeFor(q), q?.limit)),
    keys: (store, q) =>
      q?.direction === "prev"
        ? (walk(store, q, "keys") as Promise<DeviceKey[]>)
        : request(source(store, "readonly", q).getAllKeys(rangeFor(q), q?.limit)),
    put: (store, values) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        const os = t.objectStore(store);
        for (const v of values) os.put(v);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(new DeviceStorageError(t.error?.message ?? "the phone refused the write"));
        t.onabort = () => reject(new DeviceStorageError(t.error?.message ?? "the write was cancelled"));
      }),
    del: (store, keys) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        const os = t.objectStore(store);
        for (const k of keys) os.delete(k);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(new DeviceStorageError(t.error?.message ?? "delete failed"));
        t.onabort = () => reject(new DeviceStorageError(t.error?.message ?? "the delete was cancelled"));
      }),
    count: (store, q) => request(source(store, "readonly", q).count(rangeFor(q))),
    clear: (store) => request(tx(store, "readwrite").clear()).then(() => undefined),
    close: () => db.close(),
    erase: () =>
      new Promise((resolve, reject) => {
        db.close();
        const req = indexedDB.deleteDatabase(DEVICE_DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new DeviceStorageError("the phone would not delete its ICEFALL database"));
        /* Another tab holding the connection open blocks the delete. Resolve
           anyway: the caller has already emptied every store, so nothing is
           left in it, and hanging here would leave "Erase all data" spinning. */
        req.onblocked = () => resolve();
      }),
  };
}

/* --- In memory, for the tests -------------------------------------------- */

/** IndexedDB's own key ordering, for the subset of key types this app stores. */
function compareKeys(a: DeviceKey, b: DeviceKey): number {
  const rank = (k: DeviceKey) => (typeof k === "number" ? 0 : typeof k === "string" ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] === undefined) return -1;
      if (b[i] === undefined) return 1;
      const c = compareKeys(a[i] as DeviceKey, b[i] as DeviceKey);
      if (c !== 0) return c;
    }
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function extract(value: unknown, keyPath: string | string[]): DeviceKey {
  const one = (p: string) => (value as Record<string, DeviceKey>)[p];
  return Array.isArray(keyPath) ? keyPath.map(one) : one(keyPath);
}

function memoryBackend(): Backend {
  const data = new Map<DeviceStoreName, Map<string, unknown>>();
  for (const s of DEVICE_SCHEMA) data.set(s.name, new Map());
  const schemaOf = (name: DeviceStoreName) => DEVICE_SCHEMA.find((s) => s.name === name) as StoreSchema;
  const idOf = (key: DeviceKey) => JSON.stringify(key);
  /* IndexedDB stores a copy, not the caller's object; the tests must see the same. */
  const copy = <V>(v: V): V => structuredClone(v);

  function rows(store: DeviceStoreName, q?: DeviceQuery): { key: DeviceKey; value: unknown }[] {
    const schema = schemaOf(store);
    const path = q?.index
      ? (schema.indexes?.find((i) => i.name === q.index)?.keyPath ?? schema.keyPath)
      : schema.keyPath;
    let list = [...(data.get(store) ?? new Map()).values()].map((value) => ({
      key: extract(value, path),
      primary: extract(value, schema.keyPath),
      value,
    }));
    if (q?.only !== undefined) list = list.filter((r) => compareKeys(r.key, q.only as DeviceKey) === 0);
    if (q?.from !== undefined) list = list.filter((r) => compareKeys(r.key, q.from as DeviceKey) >= 0);
    if (q?.to !== undefined) list = list.filter((r) => compareKeys(r.key, q.to as DeviceKey) <= 0);
    /* IndexedDB orders rows with equal index keys by their primary key. */
    list.sort((a, b) => compareKeys(a.key, b.key) || compareKeys(a.primary, b.primary));
    if (q?.direction === "prev") list.reverse();
    if (q?.limit !== undefined) list = list.slice(0, q.limit);
    return list.map((r) => ({ key: r.primary, value: r.value }));
  }

  return {
    kind: "memory",
    get: async (store, key) => {
      const v = (data.get(store) as Map<string, unknown>).get(idOf(key));
      return v === undefined ? undefined : copy(v);
    },
    getAll: async (store, q) => rows(store, q).map((r) => copy(r.value)),
    keys: async (store, q) => rows(store, q).map((r) => r.key),
    put: async (store, values) => {
      const map = data.get(store) as Map<string, unknown>;
      const keyPath = schemaOf(store).keyPath;
      for (const v of values) {
        const key = extract(v, keyPath);
        if (key === undefined || (Array.isArray(key) && key.some((k) => k === undefined))) {
          throw new DeviceStorageError(`a ${store} row is missing its key`);
        }
        map.set(idOf(key), copy(v));
      }
    },
    del: async (store, keys) => {
      const map = data.get(store) as Map<string, unknown>;
      for (const k of keys) map.delete(idOf(k));
    },
    count: async (store, q) => rows(store, q).length,
    clear: async (store) => {
      data.set(store, new Map());
    },
    close: () => {},
    erase: async () => {
      for (const s of DEVICE_SCHEMA) data.set(s.name, new Map());
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Opening, once                                                               */
/* -------------------------------------------------------------------------- */

export type DeviceStorageState = "unopened" | "opening" | "ready" | "unavailable";

let backendPromise: Promise<Backend> | null = null;
let state: DeviceStorageState = "unopened";
let unavailableReason: string | null = null;
const listeners = new Set<() => void>();

function announce() {
  listeners.forEach((l) => l());
}

/** Subscribe to changes in whether the database is usable. */
export function onDeviceStorageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface DeviceStorageStatus {
  state: DeviceStorageState;
  /** Present only when `state` is "unavailable". Plain words, safe to render. */
  reason: string | null;
  /** True while the memory backend is in use — tests only; never in a shipped build. */
  inMemory: boolean;
}

let usingMemory = false;

export function deviceStorageStatus(): DeviceStorageStatus {
  return { state, reason: unavailableReason, inMemory: usingMemory };
}

/** What the athlete is told when the phone has no database at all. */
export const NO_DATABASE_SENTENCE =
  "This phone will not let ICEFALL keep files. Your trip, your checks and the numbers still work; photographs, documents and a downloaded map cannot be saved here.";

/* Some Safari versions leave `indexedDB.open` hanging with no event at all.
   Waiting forever would leave a photo "saving" for ever; say it failed. */
export const DEVICE_DB_OPEN_TIMEOUT_MS = 8000;

function openIndexedDb(): Promise<Backend> {
  return new Promise((resolveOuter, rejectOuter) => {
    let settled = false;
    const resolve = (b: Backend) => {
      if (settled) return b.close();
      settled = true;
      clearTimeout(timer);
      resolveOuter(b);
    };
    const reject = (e: DeviceStorageError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectOuter(e);
    };
    const timer = setTimeout(
      () => reject(new DeviceStorageError("This phone did not open ICEFALL's database in time.")),
      DEVICE_DB_OPEN_TIMEOUT_MS,
    );
    if (typeof indexedDB === "undefined") {
      reject(new DeviceStorageError("This browser has no database ICEFALL can use."));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DEVICE_DB_NAME, DEVICE_DB_VERSION);
    } catch (err) {
      /* Private windows in some browsers throw here instead of firing onerror. */
      reject(new DeviceStorageError(err instanceof Error ? err.message : "This browser blocked ICEFALL's database."));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction!;
      const existing: Record<string, string[]> = {};
      for (const name of Array.from(db.objectStoreNames)) {
        existing[name] = Array.from(tx.objectStore(name).indexNames);
      }
      const changes = planSchemaChanges(existing);
      for (const name of changes.createStores) {
        const s = DEVICE_SCHEMA.find((x) => x.name === name) as StoreSchema;
        db.createObjectStore(s.name, { keyPath: s.keyPath });
      }
      for (const { store, index } of changes.createIndexes) {
        tx.objectStore(store).createIndex(index.name, index.keyPath, { unique: index.unique });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      /* A newer tab upgrading the schema closes this one rather than letting
         two versions write side by side. The app re-opens on its next call. */
      db.onversionchange = () => {
        db.close();
        backendPromise = null;
        state = "unopened";
        announce();
      };
      resolve(indexedDbBackend(db));
    };
    req.onerror = () =>
      reject(new DeviceStorageError(req.error?.message ?? "This phone would not open ICEFALL's database."));
    req.onblocked = () =>
      reject(new DeviceStorageError("Another ICEFALL tab is open with an older version. Close it and try again."));
  });
}

function backendNow(): Promise<Backend> {
  if (!backendPromise) {
    state = "opening";
    backendPromise = openIndexedDb()
      .then((b) => {
        state = "ready";
        unavailableReason = null;
        announce();
        return b;
      })
      .catch((err: unknown) => {
        state = "unavailable";
        unavailableReason = err instanceof Error ? err.message : String(err);
        announce();
        backendPromise = null;
        throw err instanceof DeviceStorageError ? err : new DeviceStorageError(String(err));
      });
  }
  return backendPromise;
}

/** Opens the database if it is not open. Resolves false when this phone has none. */
export async function openDeviceStorage(): Promise<boolean> {
  try {
    await backendNow();
    return true;
  } catch {
    return false;
  }
}

/**
 * A typed handle on one store.
 *
 * Synchronous to obtain and lazy to open, so a module can hold one at the top
 * level without forcing the database open before anything needs it.
 */
export function deviceStore<K extends DeviceStoreName>(name: K): DeviceStore<DeviceStoreTypes[K]> {
  type T = DeviceStoreTypes[K];
  return {
    get: async (key) => (await (await backendNow()).get(name, key)) as T | undefined,
    getAll: async (q) => (await (await backendNow()).getAll(name, q)) as T[],
    byIndex: async (index, key, opts) =>
      (await (await backendNow()).getAll(name, { ...opts, index, only: key })) as T[],
    keys: async (q) => (await backendNow()).keys(name, q),
    put: async (value) => (await backendNow()).put(name, [value]),
    putAll: async (values) => (values.length ? (await backendNow()).put(name, values) : undefined),
    delete: async (key) => (await backendNow()).del(name, [key]),
    deleteAll: async (keys) => (keys.length ? (await backendNow()).del(name, keys) : undefined),
    count: async (q) => (await backendNow()).count(name, q),
    clear: async () => (await backendNow()).clear(name),
  };
}

/**
 * Everything this database holds, for the data export — blobs as their
 * particulars rather than their bytes, which a JSON file cannot carry.
 *
 * "Download my data" walks every `icefall.` key in the browser bucket; without
 * this, the day the activities moved in here would be the day they quietly
 * stopped being in the export.
 */
export async function exportDeviceData(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  let b: Backend;
  try {
    b = await backendNow();
  } catch (err) {
    return { "icefall-device": { unavailable: err instanceof Error ? err.message : String(err) } };
  }
  for (const s of DEVICE_SCHEMA) {
    const rows = (await b.getAll(s.name)) as Record<string, unknown>[];
    out[`icefall-device.${s.name}`] = rows.map((r) => {
      if (!(r.blob instanceof Blob)) return r;
      const { blob: _blob, ...rest } = r;
      return { ...rest, blob: "(binary file, not included in this export)" };
    });
  }
  return out;
}

/**
 * Delete everything. Called by "Erase all data" beside the localStorage clear.
 *
 * Empties every store first and deletes the database second, because a delete
 * blocked by another open tab would otherwise leave the data there while the
 * screen said it was gone.
 */
export async function eraseDeviceData(): Promise<void> {
  try {
    const b = await backendNow();
    for (const s of DEVICE_SCHEMA) await b.clear(s.name);
    await b.erase();
  } catch {
    /* No database means nothing to erase. */
  } finally {
    if (usingMemory) {
      backendPromise = Promise.resolve(memoryBackend());
      state = "ready";
    } else {
      backendPromise = null;
      state = "unopened";
    }
    announce();
  }
}

/* -------------------------------------------------------------------------- */
/* Small key/value                                                             */
/* -------------------------------------------------------------------------- */

const kvStore = deviceStore("kv");

/** The stored value, or undefined when there is none. Rejects with DeviceStorageError when the phone has no database. */
export async function kvGet<V>(key: string): Promise<KvRecord<V> | undefined> {
  return (await kvStore.get(key)) as KvRecord<V> | undefined;
}

export async function kvSet<V>(key: string, value: V, now: number = Date.now()): Promise<void> {
  await kvStore.put({ key, value, at: now });
}

export async function kvDelete(key: string): Promise<void> {
  await kvStore.delete(key);
}

/* -------------------------------------------------------------------------- */
/* Test seams                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * TESTS ONLY. Swaps in the in-memory backend.
 *
 * There is no fake-indexeddb in this repository and no new dependency is being
 * added for one, so the logic above the backend — the migration, the queue, the
 * ordering — is exercised against this, and the IndexedDB backend itself is
 * proved in the Playwright run, which has a real browser with a real database.
 */
export function __useMemoryDeviceStorage(): void {
  backendPromise = Promise.resolve(memoryBackend());
  usingMemory = true;
  state = "ready";
  unavailableReason = null;
  announce();
}

/** TESTS ONLY. Makes every call fail, the way a phone with no database does. */
export function __useBrokenDeviceStorage(reason = "no database on this phone"): void {
  backendPromise = Promise.reject(new DeviceStorageError(reason));
  /* Nothing awaits this until a caller does; mark it handled so Node does not
     kill the test run for an unhandled rejection. */
  void backendPromise.catch(() => {});
  usingMemory = false;
  state = "unavailable";
  unavailableReason = reason;
  announce();
}

/** TESTS ONLY. Back to a closed, unopened database. */
export function __resetDeviceStorageForTests(): void {
  backendPromise = null;
  usingMemory = false;
  state = "unopened";
  unavailableReason = null;
}
