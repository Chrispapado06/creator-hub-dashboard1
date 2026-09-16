/**
 * Mountain mode foundation: the boot decision, the trip day, the turnaround
 * phases, position freshness, the route set, the example-trip gate and the
 * wake lock's three fixed defects.
 *
 * Run: npm run test:mountain
 */

import { __resetBootForTests, bootRedirectFor, decideBoot, type BootInput } from "./boot";
import { buildExampleTrip } from "./exampleTrip";
import { MOUNTAIN_PATHS, isLiveTrackerPath, isMountainModePath } from "./paths";
import { positionFreshness, type KnownPosition } from "./position";
import { tripDay, tripRunningToday } from "./tripModel";
import {
  AMBER_WINDOW_MS,
  MAX_SNOOZES,
  __resetTurnaroundForTests,
  observeTurnaround,
  readTurnaround,
  snoozeTurnaround,
  turnaroundPhase,
  type TurnaroundSetting,
} from "./turnaround";
import { ScreenWakeLock } from "@/tracking/wakeLock";

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

async function run() {
  console.log("\n\x1b[1m1 — The boot decision\x1b[0m");
  const base: BootInput = {
    reachability: "unknown",
    offlineBundle: false,
    forced: false,
    ownTripToday: false,
    unfinishedRecording: false,
    exampleTrip: false,
  };
  eq("online, nothing running: today's behaviour", decideBoot(base), null);
  eq("online, unfinished recording: today's behaviour", decideBoot({ ...base, unfinishedRecording: true }), null);
  eq("online, own trip today: Now", decideBoot({ ...base, ownTripToday: true }), MOUNTAIN_PATHS.now);
  eq("no network, nothing: nothing-running", decideBoot({ ...base, reachability: "unreachable" }), MOUNTAIN_PATHS.root);
  eq(
    "no network, unfinished recording: Now",
    decideBoot({ ...base, reachability: "unreachable", unfinishedRecording: true }),
    MOUNTAIN_PATHS.now,
  );
  eq(
    "no network, example trip: Now",
    decideBoot({ ...base, reachability: "unreachable", exampleTrip: true }),
    MOUNTAIN_PATHS.now,
  );
  eq(
    "offline review bundle never auto-enters",
    decideBoot({ ...base, offlineBundle: true, reachability: "unreachable", ownTripToday: true }),
    null,
  );
  eq(
    "offline bundle WITH the force switch enters",
    decideBoot({ ...base, offlineBundle: true, forced: true, reachability: "unreachable", exampleTrip: true }),
    MOUNTAIN_PATHS.now,
  );
  __resetBootForTests();
  eq("a deep link is never intercepted", bootRedirectFor("/settings"), null);
  eq("... and the answer is kept for the page load", bootRedirectFor("/home"), null);
  __resetBootForTests();

  console.log("\n\x1b[1m2 — Trip day, never negative, never past the end\x1b[0m");
  const t = { startDate: "2026-09-13", endDate: "2026-09-14" };
  eq("before", tripDay(t, "2026-09-07"), { kind: "before", daysToGo: 6 });
  eq("first day", tripDay(t, "2026-09-13"), { kind: "during", dayNumber: 1, totalDays: 2 });
  eq("after", tripDay(t, "2026-12-14"), { kind: "after", daysSinceEnd: 91 });
  check("running today inside dates", tripRunningToday({ ...t, endedAt: null }, "2026-09-14"));
  check("a closed trip is not running", !tripRunningToday({ ...t, endedAt: "2026-09-14T08:00:00Z" }, "2026-09-14"));

  console.log("\n\x1b[1m3 — The example trip is absent from an ordinary build\x1b[0m");
  eq("no env flags → no example trip", buildExampleTrip(), null);

  console.log("\n\x1b[1m4 — Turnaround phases, from the wall clock\x1b[0m");
  const at = Date.parse("2026-09-14T11:00:00Z");
  const setting: TurnaroundSetting = {
    tripId: "t1",
    at: new Date(at).toISOString(),
    date: "2026-09-14",
    time: "13:00",
    timeZone: "Europe/Paris",
    setAt: new Date(at - 6 * 3600_000).toISOString(),
    snoozedUntil: null,
    snoozeCount: 0,
    turnedAt: null,
    lastObservedAt: new Date(at - 6 * 3600_000).toISOString(),
    missedAt: null,
    missedSeenAt: null,
  };
  eq("unset", turnaroundPhase(null).kind, "unset");
  eq("set, an hour out", turnaroundPhase(setting, at - 3600_000).kind, "set");
  eq("amber inside 30 min", turnaroundPhase(setting, at - AMBER_WINDOW_MS + 1).kind, "countdown");
  eq("due once passed", turnaroundPhase(setting, at + 1000).kind, "due");
  eq("overdue after max snoozes", turnaroundPhase({ ...setting, snoozeCount: MAX_SNOOZES }, at + 1000).kind, "overdue");
  eq("turned around wins", turnaroundPhase({ ...setting, turnedAt: "x" }, at + 1000).kind, "turned");

  __resetTurnaroundForTests({ t1: { ...setting } });
  observeTurnaround("t1", new Date(at + 40 * 60_000));
  eq("first look 40 min late records a missed alarm", turnaroundPhase(readTurnaround("t1"), at + 40 * 60_000).kind, "missed");
  __resetTurnaroundForTests({ t1: { ...setting, lastObservedAt: new Date(at - 5000).toISOString() } });
  observeTurnaround("t1", new Date(at + 30_000));
  eq("watched through the moment: due, not missed", turnaroundPhase(readTurnaround("t1"), at + 30_000).kind, "due");
  // On screen 5 s before and 2 s after the moment (inside the write throttle),
  // then locked for 20 min: it did sound, so it must not come back as missed.
  __resetTurnaroundForTests({ t1: { ...setting, lastObservedAt: new Date(at - 5000).toISOString() } });
  observeTurnaround("t1", new Date(at + 2000));
  observeTurnaround("t1", new Date(at + 20 * 60_000));
  eq("seen as it came due, then locked: due, not missed", turnaroundPhase(readTurnaround("t1"), at + 20 * 60_000).kind, "due");
  __resetTurnaroundForTests({ t1: { ...setting, lastObservedAt: new Date(at - 5000).toISOString() } });
  for (let i = 0; i < MAX_SNOOZES; i++) snoozeTurnaround("t1", new Date(at + 60_000));
  check("a fourth snooze is refused", !snoozeTurnaround("t1", new Date(at + 60_000)));
  __resetTurnaroundForTests();

  console.log("\n\x1b[1m5 — Position freshness\x1b[0m");
  const pos: KnownPosition = { lat: 45.85, lon: 6.83, accuracyM: 8, altitudeM: 3815, altitudeAccuracyM: 12, at: 0 };
  eq("20 s fresh", positionFreshness(pos, 20_000), "fresh");
  eq("4 min aged", positionFreshness(pos, 240_000), "aged");
  eq("40 min stale", positionFreshness(pos, 2_400_000), "stale");
  eq("2 h silent", positionFreshness(pos, 7_200_000), "silent");
  eq("dated an hour in the future (clock moved): silent, never fresh", positionFreshness({ ...pos, at: 3_600_000 }, 0), "silent");

  console.log("\n\x1b[1m6 — Route set\x1b[0m");
  check("/mountain is Mountain mode", isMountainModePath("/mountain"));
  check("/mountain/body/check is Mountain mode", isMountainModePath("/mountain/body/check"));
  check("/mountain/goal-mont-blanc is the command centre, not Mountain mode", !isMountainModePath("/mountain/goal-mont-blanc"));
  check("/activity/live/hike is the tracker", isLiveTrackerPath("/activity/live/hike"));

  console.log("\n\x1b[1m7 — Wake lock: re-acquired, never orphaned, never silent\x1b[0m");
  const g = globalThis as Record<string, unknown>;
  let requests = 0;
  let live = 0;
  let visibility = "visible";
  const docListeners = new Map<string, () => void>();
  g.document = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (type: string, fn: () => void) => docListeners.set(type, fn),
    removeEventListener: (type: string) => docListeners.delete(type),
  };
  const sentinels: { released: boolean; fire: () => void }[] = [];
  let refuse = false;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      wakeLock: {
        request: async () => {
          requests++;
          if (refuse) throw new Error("NotAllowedError");
          live++;
          let onRelease = () => {};
          const s = {
            released: false,
            release: async () => {
              if (!s.released) {
                s.released = true;
                live--;
                onRelease();
              }
            },
            addEventListener: (_: string, fn: () => void) => {
              onRelease = fn;
            },
            fire: () => void s.release(),
          };
          sentinels.push(s);
          return s;
        },
      },
    },
  });

  const lock = new ScreenWakeLock();
  await Promise.all([lock.acquire(), lock.acquire()]);
  eq("two concurrent acquires make one request", requests, 1);
  await lock.acquire();
  eq("a third acquire while held makes none", requests, 1);
  eq("held", lock.getState().status, "held");

  visibility = "hidden";
  sentinels[0].fire();
  eq("released by the system while hidden: waiting", lock.getState().status, "waiting");
  visibility = "visible";
  docListeners.get("visibilitychange")?.();
  await new Promise((r) => setTimeout(r, 0));
  eq("re-acquired on return", requests, 2);
  eq("... and held again", lock.getState().status, "held");

  lock.release();
  eq("release lets go of every sentinel", live, 0);

  refuse = true;
  const refused = await new ScreenWakeLock().acquire();
  eq("a refusal is reported", refused.status, "refused");
  check("... with a sentence", typeof refused.sentence === "string" && refused.sentence.length > 0);

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length && proc) proc.exitCode = 1;
}

void run();
