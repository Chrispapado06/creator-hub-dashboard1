import type { WatchProvider } from "./types";

/**
 * WHERE EACH WATCH IMPORT LEFT OFF — kept on the device, not the server.
 *
 * `watch_connections` holds no cursor (see the migration's header comment): the
 * server answers "what happened since X" for whatever X the client sends, and
 * never remembers a client's own pace for it. This module is that memory, one
 * per provider, so `importWatchActivities` can ask for only what is new instead
 * of re-pulling the whole window every time somebody taps "Check for new
 * activities".
 *
 * Wrapped in try/catch throughout: a private window, cleared site data, or a
 * browser that blocks storage must never crash an import — it should just
 * behave like a device that has never imported before.
 */

const KEY = "icefall.watch.import.v1";

export interface WatchCursor {
  /** The end of the window the last successful import actually covered, ISO. */
  through: string | null;
  /** When the last import attempt ran, ISO — shown to the athlete as "Last checked". */
  lastRunAt: string | null;
}

const EMPTY_CURSOR: WatchCursor = { through: null, lastRunAt: null };

interface CursorStore {
  [provider: string]: WatchCursor;
}

function readStore(): CursorStore {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as CursorStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: CursorStore) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore — a lost cursor just means the next import re-covers the window */
  }
}

export function readCursor(p: WatchProvider): WatchCursor {
  try {
    const store = readStore();
    const c = store[p];
    if (!c || typeof c !== "object") return EMPTY_CURSOR;
    return {
      through: typeof c.through === "string" ? c.through : null,
      lastRunAt: typeof c.lastRunAt === "string" ? c.lastRunAt : null,
    };
  } catch {
    return EMPTY_CURSOR;
  }
}

export function writeCursor(p: WatchProvider, c: WatchCursor): void {
  try {
    const store = readStore();
    store[p] = c;
    writeStore(store);
  } catch {
    /* ignore */
  }
}

/** Called on disconnect, so a later reconnect starts a clean window rather than resuming a stale one. */
export function clearCursor(p: WatchProvider): void {
  try {
    const store = readStore();
    delete store[p];
    writeStore(store);
  } catch {
    /* ignore */
  }
}
