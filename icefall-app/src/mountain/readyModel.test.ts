/** Unit tests for the "Ready for no signal" checklist (brief M8). Run under node. */

import { EMPTY_STORAGE_STATUS, type StorageStatus } from "@/device/storageStatus";

import {
  CARD_LEAD_DAYS,
  HOME_SCREEN_DESKTOP,
  LOCATION_DENIED,
  NO_TRIP_SENTENCE,
  readyItems,
  readySummary,
  shouldShowCard,
  type ReadyInput,
  type ReadyItem,
  type ReadyKey,
} from "./readyModel";
import { OFFLINE_MAP_LICENCE, type PackRow } from "./tripPack";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
  }
}

function eq<T>(actual: T, expected: T, what = "") {
  if (actual !== expected) throw new Error(`${what} expected ${String(expected)}, got ${String(actual)}`);
}

function ok(cond: boolean, what: string) {
  if (!cond) throw new Error(what);
}

/* -------------------------------------------------------------------------- */

function savedRow(kind: PackRow["kind"], sizeBytes: number): PackRow {
  return {
    kind,
    label: kind,
    status: "saved",
    origin: "in-app",
    sizeBytes,
    savedAt: 1_000,
    age: { ageMs: 0, band: "fresh", basis: "saved", text: "Saved just now", greyed: false, silent: false },
    sourceNote: null,
    sentence: null,
  };
}

function missingRow(kind: PackRow["kind"]): PackRow {
  return {
    kind,
    label: kind,
    status: "missing",
    origin: null,
    sizeBytes: null,
    savedAt: null,
    age: null,
    sourceNote: null,
    sentence: "It was tried and it did not arrive.",
  };
}

function storage(patch: Partial<StorageStatus> = {}): StorageStatus {
  return { ...EMPTY_STORAGE_STATUS, ...patch };
}

function input(patch: Partial<ReadyInput> = {}): ReadyInput {
  return {
    trip: { id: "t1", name: "Mont Blanc" },
    pack: { rows: [], loading: false, storageOk: true, storageSentence: null },
    offlineMapSource: false,
    emergency: null,
    turnaround: { set: false, label: null },
    storage: storage(),
    install: "unsupported",
    location: "unknown",
    ...patch,
  };
}

const item = (items: ReadyItem[], key: ReadyKey): ReadyItem => {
  const found = items.find((i) => i.key === key);
  if (!found) throw new Error(`no ${key} row`);
  return found;
};

/* -------------------------------------------------------------------------- */
/* The lines                                                                   */
/* -------------------------------------------------------------------------- */

check("every key appears exactly once, in order", () => {
  const keys = readyItems(input()).map((i) => i.key);
  eq(keys.join(","), "trip-data,map,contacts,insurance,home-screen,storage,turnaround,location");
});

check("every line carries a sentence", () => {
  for (const i of readyItems(input())) ok(i.detail.length > 10, `${i.key} has no detail`);
});

check("trip data: nothing saved is a to-do with a download", () => {
  const i = item(readyItems(input()), "trip-data");
  eq(i.state, "todo");
  eq(i.fix?.kind, "action");
  eq(i.value, null, "no size is invented");
});

check("trip data: while the read is in flight there is no fix to press", () => {
  const i = item(readyItems(input({ pack: { rows: [], loading: true, storageOk: true, storageSentence: null } })), "trip-data");
  eq(i.fix, null);
});

check("trip data: all saved shows the measured total, map excluded", () => {
  const rows = [savedRow("mountain", 2048), savedRow("camps", 1024), savedRow("map", 9_000_000)];
  const i = item(readyItems(input({ pack: { rows, loading: false, storageOk: true, storageSentence: null } })), "trip-data");
  eq(i.state, "ready");
  eq(i.value, "3 KB");
});

check("trip data: a missing part names it and stays a to-do", () => {
  const rows = [savedRow("mountain", 2048), missingRow("forecast")];
  const i = item(readyItems(input({ pack: { rows, loading: false, storageOk: true, storageSentence: null } })), "trip-data");
  eq(i.state, "todo");
  ok(i.detail.includes("Forecast"), "names what is missing");
});

check("trip data: no trip is an info line, not a red tick box", () => {
  const i = item(readyItems(input({ trip: null })), "trip-data");
  eq(i.state, "info");
  eq(i.detail, NO_TRIP_SENTENCE);
  eq(i.fix, null);
});

check("trip data: no database says so and offers no fix", () => {
  const i = item(
    readyItems(input({ pack: { rows: [], loading: false, storageOk: false, storageSentence: "This phone cannot save." } })),
    "trip-data",
  );
  eq(i.state, "info");
  eq(i.detail, "This phone cannot save.");
  eq(i.fix, null);
});

check("map: with no offline source it is an info line carrying the licence position", () => {
  const i = item(readyItems(input()), "map");
  eq(i.state, "info");
  eq(i.fix, null);
  ok(i.detail.includes(OFFLINE_MAP_LICENCE), "states the licence position");
});

check("map: a registered source makes it a real check", () => {
  const todo = item(readyItems(input({ offlineMapSource: true })), "map");
  eq(todo.state, "todo");
  eq(todo.fix?.kind, "action");
  const rows = [savedRow("map", 3_800_000)];
  const done = item(readyItems(input({ offlineMapSource: true, pack: { rows, loading: false, storageOk: true, storageSentence: null } })), "map");
  eq(done.state, "ready");
  eq(done.value, "3.6 MB");
});

check("contacts and insurance read the athlete's own card", () => {
  const none = readyItems(input());
  eq(item(none, "contacts").state, "todo");
  eq(item(none, "insurance").state, "todo");
  eq(item(none, "contacts").fix?.kind, "link");

  const filled = readyItems(input({ emergency: { contacts: 2, insurance: true } }));
  eq(item(filled, "contacts").state, "ready");
  eq(item(filled, "contacts").value, "2 saved");
  eq(item(filled, "insurance").state, "ready");
});

check("home screen: installed is done, a prompt is a one-tap add, iOS gets steps", () => {
  eq(item(readyItems(input({ install: "installed" })), "home-screen").state, "ready");
  eq(item(readyItems(input({ storage: storage({ standalone: true }) })), "home-screen").state, "ready");

  const prompt = item(readyItems(input({ install: "prompt" })), "home-screen");
  eq(prompt.state, "todo");
  eq(prompt.fix?.kind === "action" ? prompt.fix.action : null, "install");

  const ios = item(readyItems(input({ install: "manual-ios" })), "home-screen");
  eq(ios.state, "todo");
  eq(ios.fix?.kind === "action" ? ios.fix.action : null, "install-steps");
});

check("home screen: a browser with no Home Screen is an info line", () => {
  const i = item(readyItems(input({ install: "unsupported" })), "home-screen");
  eq(i.state, "info");
  eq(i.detail, HOME_SCREEN_DESKTOP);
  eq(i.fix, null);
});

check("storage: granted is done, refused can be asked, unsupported can never go green", () => {
  eq(item(readyItems(input({ storage: storage({ persisted: "granted" }) })), "storage").state, "ready");

  const refused = item(readyItems(input({ storage: storage({ persisted: "refused" }) })), "storage");
  eq(refused.state, "todo");
  eq(refused.fix?.kind === "action" ? refused.fix.action : null, "persist");

  const unsupported = item(readyItems(input({ storage: storage({ persisted: "unsupported" }) })), "storage");
  eq(unsupported.state, "info");
  eq(unsupported.fix, null);
});

check("storage: the figures are shown when the browser gives them", () => {
  const i = item(readyItems(input({ storage: storage({ persisted: "granted", used: 41 * 1024 * 1024, available: 2 * 1024 ** 3 }) })), "storage");
  ok(i.detail.includes("41 MB"), "shows what is used");
  ok(i.detail.includes("estimate"), "calls the free figure an estimate");
});

check("turnaround: set shows the time, unset links to the setter, no trip is an info line", () => {
  const set = item(readyItems(input({ turnaround: { set: true, label: "13:00" } })), "turnaround");
  eq(set.state, "ready");
  eq(set.value, "13:00");

  const unset = item(readyItems(input()), "turnaround");
  eq(unset.state, "todo");
  eq(unset.fix?.kind === "link" ? unset.fix.to : null, "/mountain/now/turnaround");

  eq(item(readyItems(input({ trip: null })), "turnaround").state, "info");
});

check("location: denied is honest and offers no button that cannot work", () => {
  const i = item(readyItems(input({ location: "denied" })), "location");
  eq(i.state, "todo");
  eq(i.detail, LOCATION_DENIED);
  eq(i.fix, null);
});

check("location: unknown can still be settled by asking once", () => {
  const i = item(readyItems(input({ location: "unknown" })), "location");
  eq(i.state, "todo");
  eq(i.fix?.kind === "action" ? i.fix.label : null, "Check");
  eq(item(readyItems(input({ location: "granted" })), "location").state, "ready");
});

/* -------------------------------------------------------------------------- */
/* The summary                                                                 */
/* -------------------------------------------------------------------------- */

check("info lines are not counted as checks", () => {
  const items = readyItems(input());
  const infos = items.filter((i) => i.state === "info").length;
  const s = readySummary(items);
  eq(s.total, items.length - infos);
  eq(s.done + s.todo, s.total);
});

check("everything done reads as ready, not as a score", () => {
  const rows = [savedRow("mountain", 2048)];
  const s = readySummary(
    readyItems(
      input({
        pack: { rows, loading: false, storageOk: true, storageSentence: null },
        emergency: { contacts: 1, insurance: true },
        turnaround: { set: true, label: "13:00" },
        storage: storage({ persisted: "granted", standalone: true }),
        install: "installed",
        location: "granted",
      }),
    ),
  );
  eq(s.todo, 0);
  eq(s.allReady, true);
  eq(s.headline, "Ready for no signal");
});

check("a partial state reads as a count", () => {
  const s = readySummary(readyItems(input({ location: "granted" })));
  eq(s.headline, `${s.done} of ${s.total} done`);
  ok(s.done >= 1, "the granted line counts");
});

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

const someTodo = readySummary(readyItems(input()));
const allDone = { done: 7, total: 7, todo: 0, allReady: true, headline: "Ready for no signal" };

check("the card shows in the week before and during, never after or with no trip", () => {
  eq(shouldShowCard({ kind: "before", daysToGo: CARD_LEAD_DAYS }, someTodo), true);
  eq(shouldShowCard({ kind: "before", daysToGo: CARD_LEAD_DAYS + 1 }, someTodo), false);
  eq(shouldShowCard({ kind: "during", dayNumber: 2, totalDays: 6 }, someTodo), true);
  eq(shouldShowCard({ kind: "after", daysSinceEnd: 1 }, someTodo), false);
  eq(shouldShowCard(null, someTodo), false);
});

check("the card disappears once there is nothing left to do", () => {
  eq(shouldShowCard({ kind: "before", daysToGo: 2 }, allDone), false);
});

/* -------------------------------------------------------------------------- */

if (failures.length) {
  console.error(`${failures.length} failed:`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`ready-model: ${passed} passed, 0 failed`);
