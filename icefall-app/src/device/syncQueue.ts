/**
 * The sync queue (plan 2.6): things with a server destination, waiting for a
 * confirmed signal.
 *
 * Never on a timer. Something else decides the connection is confirmed (the
 * reachability check, M2) and calls `runSyncQueue()`; a queue polling in a tent
 * wakes the radio all night. Back-off is stored on the row (`nextAttemptAt`),
 * so it survives the app being closed.
 *
 * Things with no server table are refused by name and reported as "kept on
 * this phone" — queueing them would be a progress bar in front of an upload
 * that never happens.
 */

import { deviceStore, kvGet, kvSet } from "./db";
import type { SyncItem } from "./types";

/* -------------------------------------------------------------------------- */
/* Kinds                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Kinds that have no server table. Trips, tracks, check-ins, the journal and
 * the rest live on the phone and nowhere else.
 */
export const KEPT_ON_PHONE_KINDS = [
  "trip",
  "activity",
  "recording",
  "breadcrumbs",
  "checkIn",
  "drinkEat",
  "journal",
  "journalPhoto",
  "document",
  "gearTick",
  "contact",
  "debrief",
  "coach.conversation",
  "emergencyInfo",
] as const;

export type KeptOnPhoneKind = (typeof KEPT_ON_PHONE_KINDS)[number];

export function isKeptOnPhoneKind(kind: string): boolean {
  return (KEPT_ON_PHONE_KINDS as readonly string[]).includes(kind);
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const KEPT_ON_THIS_PHONE =
  "Your trip, your track and your journal are kept on this phone. Nothing is uploaded, so there is nothing waiting — and no copy if you lose the phone.";

/** Web limit, stated plainly: Safari has no background sync. */
export const SENDS_WHEN_OPEN =
  "Waiting to send. ICEFALL sends these next time you open it with a signal.";

export function waitingLabel(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 thing waiting to send" : `${n} things waiting to send`;
}

export function syncedLabel(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "Synced 1 item" : `Synced ${n} items`;
}

/* -------------------------------------------------------------------------- */
/* Back-off                                                                    */
/* -------------------------------------------------------------------------- */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const BACKOFF_FIRST_MS = 30 * SECOND;
export const BACKOFF_FACTOR = 4;
export const BACKOFF_MAX_MS = 6 * HOUR;
export const GIVE_UP_AFTER_MS = 7 * 24 * HOUR;
/** A row left "sending" this long was interrupted (app closed mid-send). */
export const STALE_SENDING_MS = 2 * MINUTE;

/** Gap before the next try after `attempts` failures: 30 s, 2 min, 8 min, 32 min … capped at 6 h. */
export function backoffDelay(attempts: number): number {
  if (attempts <= 0) return 0;
  const d = BACKOFF_FIRST_MS * Math.pow(BACKOFF_FACTOR, attempts - 1);
  return Math.min(d, BACKOFF_MAX_MS);
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

export type SendOutcome =
  | { ok: true }
  /** Worth trying again later (network, 5xx). Thrown errors count as this. */
  | { ok: false; retry: true; error: string }
  /** Will never succeed as it is (rejected, safety re-check refused). Kept and shown. */
  | { ok: false; retry: false; error: string };

export interface SendContext {
  /** Stable across retries: the server uses it to ignore a repeat (the messaging `client_id` pattern). */
  idempotencyKey: string;
  attempt: number;
}

export interface SyncHandler<P = unknown> {
  /**
   * Runs again right before sending. A queued coach question must pass the
   * safety layer twice: a release between enqueue and send can widen the rules.
   * Return a reason to block, or null to send.
   */
  beforeSend?: (payload: P) => string | null | Promise<string | null>;
  send: (payload: P, ctx: SendContext) => Promise<SendOutcome>;
}

const handlers = new Map<string, SyncHandler>();

export function registerSyncHandler<P>(kind: string, handler: SyncHandler<P>): () => void {
  if (isKeptOnPhoneKind(kind)) throw new Error(`"${kind}" is kept on this phone and has no server to send to`);
  handlers.set(kind, handler as SyncHandler);
  return () => {
    if (handlers.get(kind) === handler) handlers.delete(kind);
  };
}

/* -------------------------------------------------------------------------- */
/* Change notification                                                         */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

export function onSyncQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      // A broken listener must not stop the queue.
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Enqueue / dequeue                                                           */
/* -------------------------------------------------------------------------- */

const queue = () => deviceStore("syncQueue");

export type EnqueueResult =
  | { status: "queued"; item: SyncItem }
  /** Same kind + dedupe key already waiting: the existing row is kept, not doubled. */
  | { status: "duplicate"; item: SyncItem }
  /** No server table for this kind. Nothing stored. */
  | { status: "kept-on-phone"; sentence: string };

let idCounter = 0;
function newId(now: number): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  idCounter += 1;
  return `sync-${now.toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface EnqueueInput<P> {
  kind: string;
  payload: P;
  /** Same key + same kind = the same thing asked twice. Null: never merge. */
  dedupeKey?: string | null;
}

// Enqueues run one at a time so a double tap can't slip two rows past the dedupe check.
let enqueueChain: Promise<unknown> = Promise.resolve();

export function enqueueSync<P>(input: EnqueueInput<P>, now: number = Date.now()): Promise<EnqueueResult> {
  const next = enqueueChain.then(() => enqueueOnce(input, now));
  enqueueChain = next.catch(() => undefined);
  return next;
}

async function enqueueOnce<P>(input: EnqueueInput<P>, now: number): Promise<EnqueueResult> {
  if (isKeptOnPhoneKind(input.kind)) return { status: "kept-on-phone", sentence: KEPT_ON_THIS_PHONE };
  const dedupeKey = input.dedupeKey ?? null;
  if (dedupeKey !== null) {
    const live = await activeItems();
    const existing = live.find((i) => i.kind === input.kind && i.dedupeKey === dedupeKey);
    if (existing) return { status: "duplicate", item: existing };
  }
  const item: SyncItem = {
    id: newId(now),
    kind: input.kind,
    dedupeKey,
    payload: input.payload,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    state: "waiting",
    finishedAt: null,
  };
  await queue().put(item);
  emit();
  return { status: "queued", item };
}

/** Removes a row for good — the athlete dismissing something given up on, or a sent item. */
export async function dequeueSync(id: string): Promise<void> {
  await queue().delete(id);
  emit();
}

/** "Try again" on a given-up or blocked row: back to waiting, due now, attempts and clock reset. */
export async function retrySyncItem(id: string, now: number = Date.now()): Promise<boolean> {
  const item = await queue().get(id);
  if (!item) return false;
  await queue().put({ ...item, state: "waiting", attempts: 0, createdAt: now, nextAttemptAt: now, lastError: null, finishedAt: null });
  emit();
  return true;
}

async function activeItems(): Promise<SyncItem[]> {
  const [waiting, sending] = await Promise.all([queue().byIndex("state", "waiting"), queue().byIndex("state", "sending")]);
  return [...waiting, ...sending];
}

export interface SyncQueueSnapshot {
  /** Waiting or mid-send: the "3 things waiting to send" count. */
  waiting: number;
  /** Stopped trying. Shown, never quietly dropped. */
  stopped: SyncItem[];
}

export async function readSyncQueue(): Promise<SyncQueueSnapshot> {
  const [active, givenUp, blocked] = await Promise.all([
    activeItems(),
    queue().byIndex("state", "given-up"),
    queue().byIndex("state", "blocked"),
  ]);
  return { waiting: active.length, stopped: [...givenUp, ...blocked].sort((a, b) => a.createdAt - b.createdAt) };
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                      */
/* -------------------------------------------------------------------------- */

export interface SyncRunResult {
  at: number;
  sent: number;
  /** Failed this run, will retry later. */
  retrying: number;
  /** Stopped trying this run (7 days, rejected, or safety-blocked). */
  stopped: number;
  /** Due, but nothing in this build knows how to send its kind. Left waiting. */
  noHandler: number;
}

export const LAST_SYNC_RESULT_KEY = "sync.lastResult";

let running: Promise<SyncRunResult> | null = null;

/**
 * Tries every due item once. Call it only when a connection is CONFIRMED
 * (reachability check passed) — this function does not check.
 * A call during a run gets one follow-up run, so an item added mid-run is not missed.
 */
export function runSyncQueue(now: () => number = Date.now): Promise<SyncRunResult> {
  if (running) {
    return running.then(() => (running ? running : runSyncQueue(now)));
  }
  running = runOnce(now).finally(() => {
    running = null;
  });
  return running;
}

async function runOnce(now: () => number): Promise<SyncRunResult> {
  const result: SyncRunResult = { at: now(), sent: 0, retrying: 0, stopped: 0, noHandler: 0 };
  const store = queue();
  const t0 = now();

  // Rows left "sending" by a closed app go back to waiting; the idempotency key covers a send that did land.
  for (const item of await store.byIndex("state", "sending")) {
    if (t0 - item.nextAttemptAt >= STALE_SENDING_MS) await store.put({ ...item, state: "waiting" });
  }

  const due = (await store.getAll({ index: "nextAttemptAt", to: t0 })).filter((i) => i.state === "waiting");

  for (const item of due) {
    const t = now();
    if (t - item.createdAt >= GIVE_UP_AFTER_MS) {
      await store.put({ ...item, state: "given-up", finishedAt: t, lastError: item.lastError ?? "Not sent within 7 days" });
      result.stopped += 1;
      continue;
    }
    const handler = handlers.get(item.kind);
    if (!handler) {
      result.noHandler += 1;
      continue;
    }

    const blockReason = handler.beforeSend ? await safeCall(() => handler.beforeSend!(item.payload)) : null;
    if (blockReason) {
      await store.put({ ...item, state: "blocked", finishedAt: t, lastError: blockReason });
      result.stopped += 1;
      continue;
    }

    const attempt = item.attempts + 1;
    await store.put({ ...item, state: "sending", nextAttemptAt: t });
    let outcome: SendOutcome;
    try {
      outcome = await handler.send(item.payload, { idempotencyKey: item.id, attempt });
    } catch (err) {
      outcome = { ok: false, retry: true, error: err instanceof Error ? err.message : String(err) };
    }
    const after = now();
    if (outcome.ok) {
      await store.delete(item.id);
      result.sent += 1;
    } else if (!outcome.retry) {
      await store.put({ ...item, attempts: attempt, state: "blocked", finishedAt: after, lastError: outcome.error });
      result.stopped += 1;
    } else {
      await store.put({
        ...item,
        attempts: attempt,
        state: "waiting",
        nextAttemptAt: after + backoffDelay(attempt),
        lastError: outcome.error,
      });
      result.retrying += 1;
    }
  }

  if (result.sent + result.retrying + result.stopped > 0) {
    try {
      await kvSet(LAST_SYNC_RESULT_KEY, result, result.at);
    } catch {
      // The in-memory result below still reaches the screen.
    }
  }
  lastResult = result;
  emit();
  return result;
}

async function safeCall(fn: () => string | null | Promise<string | null>): Promise<string | null> {
  try {
    return await fn();
  } catch (err) {
    // A safety check that crashes blocks the send; it never waves it through.
    return `Safety check failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

let lastResult: SyncRunResult | null = null;

/** The most recent run that did anything, from memory or the kv store. */
export async function readLastSyncResult(): Promise<SyncRunResult | null> {
  if (lastResult && lastResult.sent + lastResult.retrying + lastResult.stopped > 0) return lastResult;
  try {
    return (await kvGet<SyncRunResult>(LAST_SYNC_RESULT_KEY))?.value ?? null;
  } catch {
    return null;
  }
}

/** Tests only. */
export function __resetSyncQueueForTests(): void {
  handlers.clear();
  listeners.clear();
  running = null;
  lastResult = null;
  enqueueChain = Promise.resolve();
}
