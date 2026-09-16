/**
 * Reachability check (plan §2.7, brief M2). Runs on a fake clock, so "~10 s of
 * failures" is asserted in milliseconds rather than waited for.
 */

import {
  createReachability,
  reachabilityLabel,
  REACH_ATTEMPT_GAP_MS,
  REACH_ATTEMPTS,
  REACH_FRESH_MS,
  REACH_TIMEOUT_MS,
  type ReachabilitySnapshot,
} from "./reachability";
import {
  NOTHING_REACHABLE,
  readConnectivity,
  setNothingReachable,
  subscribeConnectivity,
  UNKNOWN,
} from "@/trip/connectivity";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
let passCount = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Fake clock                                                                  */
/* -------------------------------------------------------------------------- */

const realTick = () => new Promise<void>((r) => globalThis.setTimeout(r, 0));

function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    async advance(ms: number) {
      const target = now + ms;
      await realTick();
      for (;;) {
        let nextId = -1;
        let nextAt = Infinity;
        for (const [id, t] of timers) if (t.at < nextAt) [nextId, nextAt] = [id, t.at];
        if (nextId < 0 || nextAt > target) break;
        const t = timers.get(nextId)!;
        timers.delete(nextId);
        now = t.at;
        t.fn();
        await realTick();
      }
      now = target;
      await realTick();
    },
  };
}

type Behaviour = "ok" | "fail" | "hang" | "wrong-body";

function setup(script: Behaviour[], opts: { down?: boolean; disabled?: string } = {}) {
  const clock = fakeClock();
  const calls: number[] = [];
  const verdicts: boolean[] = [];
  let down = opts.down ?? false;
  const engine = createReachability({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    interfaceDown: () => down,
    onVerdict: (v) => verdicts.push(v),
    disabledReason: opts.disabled ?? null,
    probe: (signal) => {
      calls.push(clock.now());
      const b = script[calls.length - 1] ?? "fail";
      if (b === "ok") return Promise.resolve(true);
      if (b === "wrong-body") return Promise.resolve(false);
      if (b === "fail") return Promise.reject(new TypeError("Failed to fetch"));
      return new Promise<boolean>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    },
  });
  return { clock, engine, calls, verdicts, setDown: (v: boolean) => (down = v) };
}

async function run() {
  console.log("\n\x1b[1mReachability\x1b[0m");

  {
    const t = setup(["fail", "fail", "fail"]);
    void t.engine.check();
    await t.clock.advance(1);
    check("one failure is not offline", t.engine.get().state === "not-checked" && t.engine.get().checking);
    await t.clock.advance(REACH_ATTEMPT_GAP_MS);
    check("two failures are still not offline", t.engine.get().state === "not-checked" && t.verdicts.length === 0);
    await t.clock.advance(REACH_ATTEMPT_GAP_MS);
    check(`offline only after ${REACH_ATTEMPTS} failures`, t.engine.get().state === "nothing-reachable", t.engine.get().state);
    check("... spread over ~10 s", t.calls.join(",") === "0,5000,10000", t.calls.join(","));
    check("... and the verdict is pushed", t.verdicts.join(",") === "true");
  }

  {
    const t = setup(["hang", "hang", "hang"]);
    void t.engine.check();
    await t.clock.advance(REACH_TIMEOUT_MS - 1);
    check("a hanging request is still pending before the time limit", t.engine.get().lastCheckedAt === null);
    await t.clock.advance(1);
    check("... and counts as a failure at the time limit", t.engine.get().lastCheckedAt === REACH_TIMEOUT_MS);
    await t.clock.advance(20_000);
    check("three timeouts declare nothing reachable", t.engine.get().state === "nothing-reachable");
  }

  {
    const t = setup(["ok"]);
    await Promise.all([t.engine.check(), t.engine.check(), t.engine.check()]);
    check("success is confirmed at once", t.engine.get().state === "reachable" && t.engine.get().lastReachableAt === 0);
    check("concurrent checks share one request", t.calls.length === 1, String(t.calls.length));
    check("success clears the verdict", t.verdicts.join(",") === "false");
  }

  {
    const t = setup(["fail", "ok"]);
    void t.engine.check();
    await t.clock.advance(REACH_ATTEMPT_GAP_MS + 1);
    check("one success ends the run early", t.engine.get().state === "reachable" && t.calls.length === 2);
    await t.clock.advance(30_000);
    check("... with no third attempt", t.calls.length === 2);
  }

  {
    const t = setup(["wrong-body", "wrong-body", "wrong-body"]);
    void t.engine.check();
    await t.clock.advance(11_000);
    check("a captive portal answering 200 is not reachable", t.engine.get().state === "nothing-reachable");
  }

  {
    const t = setup(["ok"], { down: true });
    await t.engine.check();
    check("'no network' is trusted with no request", t.engine.get().state === "offline" && t.calls.length === 0);
  }

  {
    const t = setup(["hang", "ok"]);
    void t.engine.check();
    await t.clock.advance(100);
    t.setDown(true);
    t.engine.interfaceChanged();
    check("the interface dropping mid-check means offline", t.engine.get().state === "offline" && !t.engine.get().checking);
    await t.clock.advance(30_000);
    check("... the abandoned run makes no further request", t.calls.length === 1);
    check("... and never declares a verdict", t.verdicts.length === 0);
    t.setDown(false);
    t.engine.interfaceChanged();
    await t.clock.advance(1);
    check("the interface returning re-checks", t.engine.get().state === "reachable" && t.calls.length === 2);
  }

  {
    const t = setup(["fail", "fail", "fail", "ok"]);
    void t.engine.check();
    await t.clock.advance(11_000);
    t.engine.noteRequestFailed();
    check("a failed request right after a verdict does not re-probe", t.calls.length === 3);
    t.engine.noteRequestSucceeded();
    check("a real request succeeding means reachable, no probe", t.engine.get().state === "reachable" && t.calls.length === 3);
    check("... and clears the verdict", t.verdicts.join(",") === "true,false");
  }

  {
    const t = setup(["ok"], { disabled: "offline build" });
    await t.engine.check();
    t.engine.interfaceChanged();
    t.engine.noteRequestFailed();
    check("a disabled build never probes", t.calls.length === 0 && t.engine.get().state === "disabled");
  }

  console.log("\n\x1b[1mLabels\x1b[0m");
  const base: ReachabilitySnapshot = { state: "not-checked", checking: false, lastReachableAt: null, lastCheckedAt: null, disabledReason: null };
  const L = (p: Partial<ReachabilitySnapshot>, now = 0, synced = 0) => reachabilityLabel({ ...base, ...p }, now, synced);
  check("not checked", L({}) === "Signal not checked");
  check("checking", L({ checking: true }) === "Checking signal");
  check("fresh success", L({ state: "reachable", lastReachableAt: 0 }, 1000) === "Signal");
  check("synced count", L({ state: "reachable", lastReachableAt: 0 }, 1000, 3) === "Signal · synced 3 items");
  check("one item", L({ state: "reachable", lastReachableAt: 0 }, 1000, 1) === "Signal · synced 1 item");
  check(
    "an old success never reads as current",
    L({ state: "reachable", lastReachableAt: 0 }, REACH_FRESH_MS + 12 * 60_000) === "Last reachable 14 min ago",
    L({ state: "reachable", lastReachableAt: 0 }, REACH_FRESH_MS + 12 * 60_000),
  );
  check("no signal with history", L({ state: "nothing-reachable", lastReachableAt: 0 }, 3 * 3600_000) === "No signal · last reachable 3 h ago");
  check("offline with none", L({ state: "offline" }) === "No signal");
  check("disabled", L({ state: "disabled" }) === "Signal not checked");

  console.log("\n\x1b[1mConnectivity verdict\x1b[0m");
  let fired = 0;
  const off = subscribeConnectivity(() => fired++);
  check("starts unknown", readConnectivity() === UNKNOWN);
  setNothingReachable(true);
  check("a confirmed verdict reads unreachable", readConnectivity() === NOTHING_REACHABLE && readConnectivity().state === "unreachable");
  setNothingReachable(true);
  setNothingReachable(false);
  check("clearing it returns to unknown, never 'online'", readConnectivity() === UNKNOWN);
  check("listeners fire on change only", fired === 2, String(fired));
  off();
  setNothingReachable(true);
  check("unsubscribe works", fired === 2);
  setNothingReachable(false);

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  \x1b[31m·\x1b[0m ${f}`));
    if (proc) proc.exitCode = 1;
  }
}

void run();
