/**
 * Going in (brief M3): what "Start today" does on each screen, and the words
 * the no-signal row uses on a trip date.
 */

import { isMountainModeActive, __resetMountainModeForTests } from "./mode";
import { offerMessage } from "./offerCopy";
import {
  goalDate,
  planStartToday,
  startMountainTrip,
  type StartGoal,
  type StartInput,
} from "./start";

let pass = 0;
const failures: string[] = [];

function eq(name: string, got: unknown, want: unknown) {
  if (Object.is(got, want)) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  }
}

function ok(name: string, got: boolean) {
  eq(name, got, true);
}

const TODAY = "2026-09-15";

const GOAL: StartGoal = {
  id: "goal-1",
  name: "Mont Blanc",
  targetDate: "2026-10-02",
  elevationM: 4808,
  mountainId: "mont-blanc",
};

function trip(over: Partial<NonNullable<StartInput["trip"]>> = {}) {
  return {
    id: "trip-1",
    name: "Gouter",
    goalId: "goal-1",
    startDate: TODAY,
    endDate: "2026-09-20",
    endedAt: null,
    ...over,
  };
}

function plan(over: Partial<StartInput> = {}) {
  return planStartToday({ today: TODAY, trip: null, goal: GOAL, ...over });
}

/* -------------------------------------------------------------------------- */
console.log("\n\x1b[1m1 — A trip already running today\x1b[0m");

const running = plan({ trip: trip({ startDate: "2026-09-13" }) });
eq("nothing is written", running.action, "enter");
eq("the button opens it", running.label, "Open Mountain mode");
ok("the day number is the trip's own", running.detail.startsWith("Day 3 of Gouter."));
eq("it keeps the trip's window", running.endDate, "2026-09-20");

const other = plan({ trip: trip({ goalId: "goal-9", name: "Aconcagua" }) });
eq("another objective's trip is not repointed", other.action, "enter");
ok("and the row says whose trip it is", other.detail.includes("Aconcagua is already running"));
ok("and says it is not this objective", other.detail.includes("not this objective"));

const noGoal = plan({ goal: null, trip: trip({ goalId: "goal-9" }) });
ok("with no objective on screen there is nothing to disagree with", noGoal.detail.startsWith("Day 1 of Gouter."));

/* -------------------------------------------------------------------------- */
console.log("\n\x1b[1m2 — A trip that starts later\x1b[0m");

const later = plan({ trip: trip({ startDate: "2026-09-18", endDate: "2026-09-25" }) });
eq("its start date moves to today", later.action, "bring-forward");
eq("today is the new start", later.startDate, TODAY);
eq("the end date is untouched", later.endDate, "2026-09-25");
eq("it is the same trip", later.tripId, "trip-1");
ok("and the row says so before the tap", later.detail.includes("Moves Gouter to start today"));

/* -------------------------------------------------------------------------- */
console.log("\n\x1b[1m3 — A trip whose dates have passed\x1b[0m");

const past = plan({ trip: trip({ startDate: "2026-06-01", endDate: "2026-06-10" }) });
eq("a finished trip is never shortened — a new one is written", past.action, "create");
eq("no trip id, because there is not one yet", past.tripId, null);
ok("and the old one is kept", past.detail.includes("keeps that one"));
eq("the new window starts today", past.startDate, TODAY);
eq("and ends on the objective's date", past.endDate, "2026-10-02");

const closed = plan({ trip: trip({ endedAt: "2026-09-14T10:00:00.000Z" }) });
eq("a closed trip is not running, whatever its dates say", closed.action, "create");

/* -------------------------------------------------------------------------- */
console.log("\n\x1b[1m4 — No trip at all\x1b[0m");

const fresh = plan();
eq("one is created", fresh.action, "create");
eq("from today", fresh.startDate, TODAY);
eq("to the objective's date", fresh.endDate, "2026-10-02");
ok("and it says where it lives", fresh.detail.includes("Kept on this phone"));

const passedGoal = plan({ goal: { ...GOAL, targetDate: "2026-08-01" } });
eq("an objective date in the past is never used as an end date", passedGoal.endDate, TODAY);
ok("the row asks for the end date instead", passedGoal.detail.includes("set the end date in Trip mode"));

const noDate = plan({ goal: { id: "g", name: "Somewhere" } });
eq("no target date, so today only", noDate.endDate, TODAY);

eq("no objective at all still starts today", plan({ goal: null }).endDate, TODAY);

/* -------------------------------------------------------------------------- */
console.log("\n\x1b[1m5 — Reading an objective's date\x1b[0m");

eq("a plain calendar date", goalDate({ id: "g", name: "n", targetDate: "2026-10-02" }), "2026-10-02");
eq(
  "a full timestamp is read as its local date",
  // Built as the app writes it — a LOCAL morning — so the test holds in every timezone.
  goalDate({ id: "g", name: "n", targetDate: new Date(2026, 9, 2, 9).toISOString() }),
  "2026-10-02",
);
eq("rubbish is refused rather than parsed", goalDate({ id: "g", name: "n", targetDate: "soon" }), null);
eq("2026-13-40 is not a date", goalDate({ id: "g", name: "n", targetDate: "2026-13-40" }), null);
eq("no date", goalDate({ id: "g", name: "n" }), null);
eq("no objective", goalDate(null), null);

/* -------------------------------------------------------------------------- */
console.log("\n\x1b[1m6 — Carrying a plan out\x1b[0m");

__resetMountainModeForTests();
const made = startMountainTrip(plan(), { goal: GOAL, goalMountainId: "mont-blanc" });
ok("a trip is written", made.ok);
ok("and Mountain mode is on", isMountainModeActive());

__resetMountainModeForTests();
const tooLong = startMountainTrip(
  { ...plan(), endDate: "2030-01-01" },
  { goal: GOAL, goalMountainId: "mont-blanc" },
);
eq("a window the store refuses fails", tooLong.ok, false);
eq("Mountain mode is NOT entered on a failed write", isMountainModeActive(), false);
ok("and the reason is the store's own words", !tooLong.ok && tooLong.error.length > 0);

__resetMountainModeForTests();
const entered = startMountainTrip(plan({ trip: trip({ startDate: "2026-09-13" }) }), { goal: GOAL });
ok("opening a running trip succeeds", entered.ok);
ok("and turns Mountain mode on", isMountainModeActive());
__resetMountainModeForTests();

/* -------------------------------------------------------------------------- */
console.log("\n\x1b[1m7 — The no-signal row on a trip date\x1b[0m");

eq(
  "no trip: the plain question",
  offerMessage({ dismissed: false, tripName: null, dayNumber: null }),
  "No signal — switch to Mountain mode?",
);
eq(
  "a trip date names the trip and the day",
  offerMessage({ dismissed: false, tripName: "Gouter", dayNumber: 3 }),
  "No signal · day 3 of Gouter. Switch to Mountain mode?",
);
eq(
  "a trip with no day number is not given one",
  offerMessage({ dismissed: false, tripName: "Gouter", dayNumber: null }),
  "No signal — switch to Mountain mode?",
);
eq(
  "dismissed says what is still readable, and claims nothing else",
  offerMessage({ dismissed: true, tripName: "Gouter", dayNumber: 3 }),
  "No signal — pages you have already opened are saved on this phone.",
);

console.log(`\n\x1b[1m${pass} passed, ${failures.length} failed\x1b[0m`);
if (failures.length) {
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
