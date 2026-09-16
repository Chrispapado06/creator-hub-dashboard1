/** The sync queue against the in-memory database: back-off, dedupe, give-up, safety re-check. */

import { __resetDeviceStorageForTests, __useBrokenDeviceStorage, __useMemoryDeviceStorage, deviceStore } from "./db";
import {
  BACKOFF_MAX_MS,
  GIVE_UP_AFTER_MS,
  KEPT_ON_PHONE_KINDS,
  STALE_SENDING_MS,
  __resetSyncQueueForTests,
  backoffDelay,
  dequeueSync,
  enqueueSync,
  isKeptOnPhoneKind,
  onSyncQueueChange,
  readLastSyncResult,
  readSyncQueue,
  registerSyncHandler,
  retrySyncItem,
  runSyncQueue,
  syncedLabel,
  waitingLabel,
  type SendOutcome,
} from "./syncQueue";

let passed = 0;
let failed = 0;

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(v: unknown, msg: string) {
  if (!v) throw new Error(msg);
}

async function test(name: string, fn: () => Promise<void> | void) {
  __resetDeviceStorageForTests();
  __useMemoryDeviceStorage();
  __resetSyncQueueForTests();
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${err instanceof Error ? err.message : String(err)}`);
  }
}

const S = 1000;
const M = 60 * S;

await test("back-off: 30 s, 2 min, 8 min, then capped at 6 h", () => {
  eq(backoffDelay(0), 0, "no failures");
  eq(backoffDelay(1), 30 * S, "1");
  eq(backoffDelay(2), 2 * M, "2");
  eq(backoffDelay(3), 8 * M, "3");
  eq(backoffDelay(4), 32 * M, "4");
  eq(backoffDelay(20), BACKOFF_MAX_MS, "cap");
  eq(BACKOFF_MAX_MS, 6 * 60 * M, "cap is 6 h");
});

await test("labels", () => {
  eq(waitingLabel(0), null, "zero says nothing");
  eq(waitingLabel(1), "1 thing waiting to send", "one");
  eq(waitingLabel(3), "3 things waiting to send", "three");
  eq(syncedLabel(0), null, "zero");
  eq(syncedLabel(3), "Synced 3 items", "three");
});

await test("kinds with no server are kept on the phone, never stored", async () => {
  for (const k of KEPT_ON_PHONE_KINDS) ok(isKeptOnPhoneKind(k), k);
  const r = await enqueueSync({ kind: "journal", payload: { text: "x" } });
  eq(r.status, "kept-on-phone", "status");
  eq((await readSyncQueue()).waiting, 0, "nothing waiting");
  let threw = false;
  try {
    registerSyncHandler("activity", { send: async () => ({ ok: true }) });
  } catch {
    threw = true;
  }
  ok(threw, "cannot register a sender for a kept-on-phone kind");
});

await test("dedupe: same kind + key is one row; different kind or null key is not", async () => {
  const a = await enqueueSync({ kind: "coach.question", dedupeKey: "q1", payload: 1 }, 1000);
  const b = await enqueueSync({ kind: "coach.question", dedupeKey: "q1", payload: 2 }, 2000);
  eq(a.status, "queued", "first");
  eq(b.status, "duplicate", "second");
  if (a.status === "queued" && b.status === "duplicate") eq(b.item.id, a.item.id, "same row returned");
  await enqueueSync({ kind: "post", dedupeKey: "q1", payload: 3 }, 3000);
  await enqueueSync({ kind: "coach.question", payload: 4 }, 4000);
  await enqueueSync({ kind: "coach.question", payload: 5 }, 5000);
  eq((await readSyncQueue()).waiting, 4, "four rows");
});

await test("dedupe holds for two enqueues fired together", async () => {
  const [a, b] = await Promise.all([
    enqueueSync({ kind: "post", dedupeKey: "p", payload: 1 }, 1000),
    enqueueSync({ kind: "post", dedupeKey: "p", payload: 1 }, 1000),
  ]);
  eq([a.status, b.status], ["queued", "duplicate"], "statuses");
  eq((await readSyncQueue()).waiting, 1, "one row");
});

await test("dedupe key frees up once the first is sent", async () => {
  registerSyncHandler("post", { send: async () => ({ ok: true }) });
  await enqueueSync({ kind: "post", dedupeKey: "p", payload: 1 }, 1000);
  const r = await runSyncQueue(() => 1000);
  eq(r.sent, 1, "sent");
  eq((await enqueueSync({ kind: "post", dedupeKey: "p", payload: 1 }, 2000)).status, "queued", "re-queued");
});

await test("retry: failure schedules the stored back-off, and nothing is tried early", async () => {
  let clock = 10_000;
  const calls: number[] = [];
  let outcome: SendOutcome = { ok: false, retry: true, error: "timeout" };
  registerSyncHandler("post", {
    send: async (_p, ctx) => {
      calls.push(ctx.attempt);
      return outcome;
    },
  });
  const q = await enqueueSync({ kind: "post", payload: 1 }, clock);
  const id = q.status === "queued" ? q.item.id : "";

  let r = await runSyncQueue(() => clock);
  eq([r.sent, r.retrying], [0, 1], "first run fails");
  let row = await deviceStore("syncQueue").get(id);
  eq([row?.attempts, row?.nextAttemptAt, row?.lastError], [1, clock + 30 * S, "timeout"], "stored back-off");

  clock += 29 * S;
  r = await runSyncQueue(() => clock);
  eq(calls.length, 1, "not tried before the gap");

  clock += 1 * S;
  r = await runSyncQueue(() => clock);
  eq(calls, [1, 2], "second attempt");
  row = await deviceStore("syncQueue").get(id);
  eq(row?.nextAttemptAt, clock + 2 * M, "gap grows to 2 min");

  clock += 2 * M;
  outcome = { ok: true };
  r = await runSyncQueue(() => clock);
  eq(r.sent, 1, "sent");
  eq((await readSyncQueue()).waiting, 0, "gone");
  eq((await readLastSyncResult())?.sent, 1, "last result kept");
});

await test("a thrown send counts as retry, with the same idempotency key each time", async () => {
  const keys: string[] = [];
  registerSyncHandler("post", {
    send: async (_p, ctx) => {
      keys.push(ctx.idempotencyKey);
      throw new Error("offline");
    },
  });
  await enqueueSync({ kind: "post", payload: 1 }, 0);
  await runSyncQueue(() => 0);
  await runSyncQueue(() => 60 * M);
  eq(keys.length, 2, "tried twice");
  eq(keys[0], keys[1], "stable key");
});

await test("gives up after 7 days and keeps the row to show", async () => {
  registerSyncHandler("post", { send: async () => ({ ok: false, retry: true, error: "no" }) });
  await enqueueSync({ kind: "post", payload: 1 }, 0);
  const r = await runSyncQueue(() => GIVE_UP_AFTER_MS);
  eq(r.stopped, 1, "stopped");
  const snap = await readSyncQueue();
  eq([snap.waiting, snap.stopped.length, snap.stopped[0]?.state], [0, 1, "given-up"], "shown, not dropped");
  ok(await retrySyncItem(snap.stopped[0].id, GIVE_UP_AFTER_MS), "retry");
  eq((await readSyncQueue()).waiting, 1, "back to waiting");
  await dequeueSync(snap.stopped[0].id);
  eq((await readSyncQueue()).stopped.length + (await readSyncQueue()).waiting, 0, "dismissed");
});

await test("safety re-check runs before send; a block or a crash stops it", async () => {
  let sent = 0;
  let rule: (p: string) => string | null = () => null;
  registerSyncHandler<string>("coach.question", {
    beforeSend: (p) => rule(p),
    send: async () => {
      sent += 1;
      return { ok: true };
    },
  });
  await enqueueSync({ kind: "coach.question", payload: "chest pain" }, 0);
  rule = (p) => (p.includes("chest") ? "Call emergency services" : null);
  let r = await runSyncQueue(() => 0);
  eq([r.stopped, sent], [1, 0], "blocked, not sent");
  eq((await readSyncQueue()).stopped[0]?.lastError, "Call emergency services", "reason kept");

  rule = () => {
    throw new Error("boom");
  };
  await enqueueSync({ kind: "coach.question", payload: "knees" }, 0);
  r = await runSyncQueue(() => 0);
  eq([r.stopped, sent], [1, 0], "crashing check blocks");
});

await test("no handler: left waiting, not faked as sent", async () => {
  await enqueueSync({ kind: "report", payload: 1 }, 0);
  const r = await runSyncQueue(() => 0);
  eq([r.sent, r.noHandler], [0, 1], "counts");
  eq((await readSyncQueue()).waiting, 1, "still waiting");
});

await test("a row left 'sending' by a closed app goes back to waiting", async () => {
  registerSyncHandler("post", { send: async () => ({ ok: true }) });
  await deviceStore("syncQueue").put({
    id: "x", kind: "post", dedupeKey: null, payload: 1, createdAt: 0, attempts: 0,
    nextAttemptAt: 0, lastError: null, state: "sending", finishedAt: null,
  });
  eq((await runSyncQueue(() => STALE_SENDING_MS - 1)).sent, 0, "too soon to call it interrupted");
  eq((await runSyncQueue(() => STALE_SENDING_MS)).sent, 1, "resent");
});

await test("concurrent runs don't double-send; an item added mid-run still goes", async () => {
  let sends = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  registerSyncHandler("post", {
    send: async () => {
      sends += 1;
      if (sends === 1) await gate;
      return { ok: true };
    },
  });
  await enqueueSync({ kind: "post", payload: 1 }, 0);
  const first = runSyncQueue(() => 0);
  await new Promise((r) => setTimeout(r, 5));
  await enqueueSync({ kind: "post", payload: 2 }, 0);
  const second = runSyncQueue(() => 0);
  release();
  await Promise.all([first, second]);
  eq(sends, 2, "each sent once");
  eq((await readSyncQueue()).waiting, 0, "empty");
});

await test("listeners hear enqueue and runs", async () => {
  let n = 0;
  const off = onSyncQueueChange(() => (n += 1));
  await enqueueSync({ kind: "post", payload: 1 }, 0);
  await runSyncQueue(() => 0);
  off();
  ok(n >= 2, `heard ${n}`);
});

await test("no database: calls reject rather than pretend", async () => {
  __resetDeviceStorageForTests();
  __useBrokenDeviceStorage("blocked");
  let threw = false;
  try {
    await enqueueSync({ kind: "post", payload: 1 }, 0);
  } catch {
    threw = true;
  }
  ok(threw, "enqueue rejects");
});

console.log(`sync queue: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
