// Tiny client-side cache for "stale-while-revalidate" page loads.
//
// Pattern:
//   1. On page mount, hydrate state from the cache → instant render.
//   2. If the cache is fresh (< ttlMs old), skip the fetch entirely.
//   3. If it's stale (or missing), fetch in the background and write
//      the new snapshot back to the cache.
//   4. A manual refresh always bypasses the cache and re-fetches.
//
// Storage: localStorage (per-browser-per-user). Keys are namespaced
// with a "agency_cache:" prefix so we don't collide with other
// app state. Each entry stores { v, ts } so we can extend the
// schema without invalidating everything.
//
// JSON.stringify is used rather than a binary format because the
// payloads are small (a few dashboards × a few KB) and human-readable
// dumps make debugging from the browser devtools easy.

const PREFIX = "agency_cache:";

type Entry<T> = { v: T; ts: number };

/**
 * Read a cache entry. Returns null when:
 *   - no entry exists
 *   - the entry is older than ttlMs
 *   - the entry is malformed
 *
 * Pass `Infinity` for ttlMs to read regardless of age (used by
 * stale-while-revalidate to render the snapshot instantly even if
 * we're about to refresh it).
 */
export function getCached<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (typeof parsed?.ts !== "number") return null;
    if (Number.isFinite(ttlMs) && Date.now() - parsed.ts > ttlMs) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

/** Returns the entry's age in milliseconds (or null if no entry). */
export function getCachedAge(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<unknown>;
    if (typeof parsed?.ts !== "number") return null;
    return Date.now() - parsed.ts;
  } catch {
    return null;
  }
}

/** Write a snapshot. Quietly no-ops if storage is full / disabled. */
export function setCached<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const entry: Entry<T> = { v: value, ts: Date.now() };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* localStorage full / disabled — degrade gracefully */
  }
}

/** Remove a single entry (e.g. on logout, or to force re-fetch). */
export function clearCached(key: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/** Clear every cache entry — useful on sign-out. */
export function clearAllCached(): void {
  if (typeof window === "undefined") return;
  try {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) remove.push(k);
    }
    for (const k of remove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Convenience: 2 hours in ms. The dashboard's default TTL. */
export const TTL_2H = 2 * 60 * 60 * 1000;
