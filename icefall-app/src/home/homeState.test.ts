import assert from "node:assert/strict";
import { detectHomeState, findJustBack, dayDiff, localDay, pickHomeGoal, TRIP_PREP_DAYS, JUST_BACK_DAYS } from "./homeState";
import { MOUNTAINS } from "@/data/mock/mountains";
import { STEPPING_STONE_QUOTES } from "./steppingStones";
import { goalIdsWithTheirTrip, pickPrimaryGoal, pickTripGoal } from "@/objectives/primaryGoal";

/** An objective date as the app stores it: 06:00–08:00 LOCAL on that day, as an instant. */
const at = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 8).toISOString();
};

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const base = {
  today: "2027-03-01",
  goalTargetDay: "2027-07-12",
  runningTrip: false,
  justBack: null,
  todaySession: { rest: false, done: false },
  hasHistory: true,
};

test("dayDiff counts calendar days across a clock change", () => {
  assert.equal(dayDiff("2027-03-27", "2027-03-29"), 2);
  assert.equal(dayDiff("2027-07-12", "2027-07-01"), -11);
});

test("localDay keeps a day key and converts an instant", () => {
  assert.equal(localDay("2027-07-12"), "2027-07-12");
  assert.match(localDay(new Date(2027, 6, 12, 23, 30).toISOString()), /^2027-07-12$/);
});

test("default, done and rest follow today's planned day", () => {
  assert.equal(detectHomeState(base), "default");
  assert.equal(detectHomeState({ ...base, todaySession: { rest: false, done: true } }), "done");
  assert.equal(detectHomeState({ ...base, todaySession: { rest: true, done: false } }), "rest");
  assert.equal(detectHomeState({ ...base, todaySession: null }), "default");
});

test("trip prep starts exactly TRIP_PREP_DAYS out and not before", () => {
  assert.equal(detectHomeState({ ...base, today: "2027-06-28" }), "two-weeks");
  assert.equal(dayDiff("2027-06-28", "2027-07-12"), TRIP_PREP_DAYS);
  assert.equal(detectHomeState({ ...base, today: "2027-06-27" }), "default");
  assert.equal(detectHomeState({ ...base, today: "2027-07-12" }), "two-weeks");
});

test("a running trip outranks everything, then just back", () => {
  assert.equal(detectHomeState({ ...base, runningTrip: true, justBack: "travelled" }), "on-trip");
  assert.equal(detectHomeState({ ...base, justBack: "travelled", goalTargetDay: null }), "just-back");
});

test("no objective vs a brand-new device", () => {
  assert.equal(detectHomeState({ ...base, goalTargetDay: null, todaySession: null }), "no-objective");
  assert.equal(
    detectHomeState({ ...base, goalTargetDay: null, todaySession: null, hasHistory: false }),
    "new",
  );
});

const goal = { id: "g1", name: "Mont Blanc", status: "active", targetDate: at("2027-07-12") };

test("an ended trip is 'just back' for JUST_BACK_DAYS, then not", () => {
  const trips = [{ goalId: "g1", peakName: "Mont Blanc", name: "Chamonix", startDate: "2027-07-11", endDate: "2027-07-14", endedAt: null , createdAt: "2027-07-11T08:00:00" }];
  const back = findJustBack({ today: "2027-07-15", trips, goals: [goal], debriefs: [] });
  assert.equal(back?.goalId, "g1");
  assert.equal(back?.endedOn, "2027-07-14");
  assert.equal(back?.kind, "date-passed");
  const later = `2027-07-${14 + JUST_BACK_DAYS + 1}`;
  assert.equal(findJustBack({ today: later, trips, goals: [goal], debriefs: [] }), null);
});

test("a trip still inside its dates is not 'just back'", () => {
  const trips = [{ goalId: "g1", peakName: "Mont Blanc", name: "x", startDate: "2027-07-11", endDate: "2027-07-14", endedAt: null , createdAt: "2027-07-11T08:00:00" }];
  assert.equal(findJustBack({ today: "2027-07-14", trips, goals: [goal], debriefs: [] }), null);
});

test("'You climbed' needs the athlete's own summited debrief", () => {
  const debriefs = [{ goalId: "g1", endedOn: "2027-07-14", outcome: "summited" }];
  const done = { ...goal, status: "completed", completedAt: "2027-07-15" };
  const back = findJustBack({ today: "2027-07-16", trips: [], goals: [done], debriefs });
  assert.equal(back?.kind, "summited");
  assert.equal(back?.completed, true);
  assert.equal(back?.debriefed, true);
  const turned = findJustBack({
    today: "2027-07-16",
    trips: [],
    goals: [done],
    debriefs: [{ ...debriefs[0], outcome: "turned-around" }],
  });
  assert.equal(turned?.kind, "turned-around");
});

test("a passed objective date with no trip counts as just back — after a day of grace", () => {
  // The day after: maybe still the summit day somewhere west of where the date was set.
  assert.equal(findJustBack({ today: "2027-07-13", trips: [], goals: [goal], debriefs: [] }), null);
  const back = findJustBack({ today: "2027-07-14", trips: [], goals: [goal], debriefs: [] });
  assert.equal(back?.goalId, "g1");
  assert.equal(back?.kind, "date-passed");
});

test("a trip closed before it began is ignored (reviewer C1)", () => {
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "x", startDate: "2027-07-09", endDate: "2027-07-13", endedAt: "2027-06-30T10:00:00" , createdAt: "2027-07-09T08:00:00" },
  ];
  assert.equal(findJustBack({ today: "2027-06-30", trips, goals: [goal], debriefs: [] }), null);
});

test("a trip closed after it began is 'travelled', dated the day it closed", () => {
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "x", startDate: "2027-07-09", endDate: "2027-07-13", endedAt: "2027-07-11T18:00:00" , createdAt: "2027-07-09T08:00:00" },
  ];
  const back = findJustBack({ today: "2027-07-12", trips, goals: [goal], debriefs: [] });
  assert.equal(back?.kind, "travelled");
  assert.equal(back?.endedOn, "2027-07-11");
});

test("an unrelated earlier trip does not hide a passed objective date (reviewer C3)", () => {
  const trips = [{ goalId: "g1", peakName: "Mont Blanc", name: "practice", startDate: "2027-06-01", endDate: "2027-06-03", endedAt: null , createdAt: "2027-06-01T08:00:00" }];
  const back = findJustBack({ today: "2027-07-15", trips, goals: [goal], debriefs: [] });
  assert.equal(back?.goalId, "g1");
  assert.equal(back?.endedOn, "2027-07-12");
});

test("a removed objective never holds Home on 'just back' (reviewer C8)", () => {
  const trips = [{ goalId: "gone", peakName: "Old peak", name: "x", startDate: "2027-07-01", endDate: "2027-07-03", endedAt: "2027-07-03T12:00:00" , createdAt: "2027-07-01T08:00:00" }];
  assert.equal(findJustBack({ today: "2027-07-05", trips, goals: [goal], debriefs: [] }), null);
});

test("'did not travel' debriefs move Home on (reviewer C7/C13)", () => {
  const done = { ...goal, status: "completed", completedAt: "2027-07-12" };
  const debriefs = [{ goalId: "g1", endedOn: "2027-07-12", outcome: "did-not-travel" }];
  assert.equal(findJustBack({ today: "2027-07-13", trips: [], goals: [done], debriefs }), null);
});

test("an objective left open after its date does not hide the next one (reviewer C2)", () => {
  const past = { id: "a", status: "active", targetDate: at("2026-09-12") };
  const next = { id: "b", status: "active", targetDate: at("2026-09-24") };
  const done = { id: "c", status: "completed", targetDate: at("2026-09-20") };
  assert.equal(pickHomeGoal([past, next, done], "2026-09-16")?.id, "b");
  assert.equal(pickHomeGoal([past, done], "2026-09-16")?.id, "a");
  assert.equal(pickHomeGoal([], "2026-09-16"), undefined);
});

test("once debriefed and a new objective is active, Home moves on", () => {
  const debriefs = [{ goalId: "g1", endedOn: "2027-07-14", outcome: "summited" }];
  const done = { ...goal, status: "completed", completedAt: "2027-07-15" };
  const next = { id: "g2", name: "Gran Paradiso", status: "active", targetDate: "2028-06-01" };
  assert.equal(findJustBack({ today: "2027-07-16", trips: [], goals: [done, next], debriefs }), null);
});

test("every stepping-stone line is quoted from the mountain record itself", () => {
  for (const [from, stone] of Object.entries(STEPPING_STONE_QUOTES)) {
    const target = MOUNTAINS.find((m) => m.id === stone.id);
    assert.ok(target, `${stone.id} missing`);
    assert.ok(MOUNTAINS.some((m) => m.id === from), `${from} missing`);
    const said = `${target!.summary} ${target!.requiredExperience ?? ""}`.toLowerCase();
    assert.ok(said.includes(stone.line.toLowerCase()), `${stone.id} no longer says "${stone.line}"`);
  }
});

test("a trip closed on its first day while the objective is still ahead never happened", () => {
  const future = { ...goal, targetDate: at("2026-09-26") };
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "x", startDate: "2026-09-16", endDate: "2026-09-28", endedAt: "2026-09-16T10:12:00" , createdAt: "2026-09-16T08:00:00" },
  ];
  assert.equal(findJustBack({ today: "2026-09-16", trips, goals: [future], debriefs: [] }), null);
});

test("a one-day trip on the objective's own date still counts", () => {
  const onDay = { ...goal, targetDate: at("2026-09-16") };
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "x", startDate: "2026-09-16", endDate: "2026-09-16", endedAt: "2026-09-16T19:00:00" , createdAt: "2026-09-16T08:00:00" },
  ];
  assert.equal(findJustBack({ today: "2026-09-17", trips, goals: [onDay], debriefs: [] })?.kind, "travelled");
});

test("a trip that ended before the objective date still says 'travelled'", () => {
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "x", startDate: "2027-07-05", endDate: "2027-07-11", endedAt: "2027-07-11T17:00:00" , createdAt: "2027-07-05T08:00:00" },
  ];
  const back = findJustBack({ today: "2027-07-16", trips, goals: [goal], debriefs: [] });
  assert.equal(back?.kind, "travelled");
  assert.equal(back?.endedOn, "2027-07-11");
});

test("a practice trip before an objective that is still ahead is not a return", () => {
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "warm-up", startDate: "2027-06-01", endDate: "2027-06-03", endedAt: "2027-06-03T18:00:00", createdAt: "2027-05-20T08:00:00" },
  ];
  assert.equal(findJustBack({ today: "2027-06-04", trips, goals: [goal], debriefs: [] }), null);
  assert.equal(findJustBack({ today: "2027-06-04", trips: [{ ...trips[0], endedAt: null }], goals: [goal], debriefs: [] }), null);
});

test("a trip planned ahead and abandoned on day one still happened", () => {
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "x", startDate: "2027-07-10", endDate: "2027-07-14", endedAt: "2027-07-10T15:00:00", createdAt: "2027-06-20T08:00:00" },
  ];
  // The trip covered the objective's date, so turning back on day one is a return — straight away…
  const back = findJustBack({ today: "2027-07-11", trips, goals: [goal], debriefs: [] });
  assert.equal(back?.kind, "travelled");
  assert.equal(back?.endedOn, "2027-07-10");
  // …and still after the date has passed, not "a date that merely passed".
  assert.equal(findJustBack({ today: "2027-07-13", trips, goals: [goal], debriefs: [] })?.kind, "travelled");
});

test("a date that merely passed does not hide the next objective's trip prep", () => {
  const input = { ...base, today: "2027-07-15", goalTargetDay: "2027-07-22", justBack: "date-passed" as const };
  assert.equal(detectHomeState(input), "two-weeks");
  assert.equal(detectHomeState({ ...input, goalTargetDay: "2027-09-01" }), "just-back");
  assert.equal(detectHomeState({ ...input, justBack: "travelled" }), "just-back");
});

test("the objective rule keeps yesterday's objective for one day of grace", () => {
  const a = { id: "a", status: "active", targetDate: at("2026-09-15") };
  const b = { id: "b", status: "active", targetDate: at("2026-10-01") };
  assert.equal(pickPrimaryGoal([a, b], new Date(2026, 8, 16, 9))?.id, "a");
  assert.equal(pickPrimaryGoal([a, b], new Date(2026, 8, 17, 9))?.id, "b");
});

test("a new trip belongs to an objective whose date just slipped, unless something closer is due", () => {
  const slipped = { id: "a", status: "active", targetDate: at("2026-09-10") };
  const next = { id: "b", status: "active", targetDate: at("2027-06-01") };
  const now = new Date(2026, 8, 18, 9);
  assert.equal(pickTripGoal([slipped, next], new Set(), now)?.id, "a");
  assert.equal(pickTripGoal([slipped, next], new Set(["a"]), now)?.id, "b");
  assert.equal(pickTripGoal([slipped, next], new Set(), now, new Set(["a"]))?.id, "b", "it already has a trip");
  const old = { ...slipped, targetDate: at("2026-08-01") };
  assert.equal(pickTripGoal([old, next], new Set(), now)?.id, "b");
  // An objective inside the trip-prep window is the one Home is preparing — it wins (review V1/V5).
  const soon = { id: "c", status: "active", targetDate: at("2026-09-24") };
  assert.equal(pickTripGoal([slipped, soon], new Set(), now)?.id, "c");
  const today = { id: "d", status: "active", targetDate: at("2026-09-18") };
  assert.equal(pickTripGoal([slipped, today], new Set(), now)?.id, "d");
});

test("with nothing upcoming, the most recently dated objective is the objective", () => {
  const march = { id: "march", status: "active", targetDate: at("2026-03-01") };
  const sept = { id: "sept", status: "active", targetDate: at("2026-09-10") };
  assert.equal(pickPrimaryGoal([march, sept], new Date(2026, 8, 16, 9))?.id, "sept");
});

test("a debriefed objective gets no day of grace", () => {
  const a = { id: "a", status: "active", targetDate: at("2026-09-15") };
  const b = { id: "b", status: "active", targetDate: at("2026-09-26") };
  const now = new Date(2026, 8, 16, 9);
  assert.equal(pickPrimaryGoal([a, b], now)?.id, "a");
  assert.equal(pickPrimaryGoal([a, b], now, new Set(["a"]))?.id, "b");
  assert.equal(pickTripGoal([a, b], new Set(["a"]), now)?.id, "b");
});

test("a warm-up trip waits out the day of grace too", () => {
  const trips = [
    { goalId: "g1", peakName: "Mont Blanc", name: "warm-up", startDate: "2027-07-01", endDate: "2027-07-03", endedAt: null, createdAt: "2027-06-20T08:00:00" },
  ];
  assert.equal(findJustBack({ today: "2027-07-13", trips, goals: [goal], debriefs: [] }), null);
  assert.equal(findJustBack({ today: "2027-07-14", trips, goals: [goal], debriefs: [] })?.endedOn, "2027-07-12");
});

test("only a trip that covered the objective's date counts as its trip", () => {
  const a = { id: "a", status: "active", targetDate: at("2026-09-10") };
  const b = { id: "b", status: "active", targetDate: at("2027-06-01") };
  const warmUp = { goalId: "a", startDate: "2026-08-20", endDate: "2026-08-22", endedAt: "2026-08-22T18:00:00" };
  const fixedDates = { goalId: "a", startDate: "2026-09-09", endDate: "2026-09-12", endedAt: "2026-09-07T10:00:00" };
  const real = { goalId: "a", startDate: "2026-09-08", endDate: "2026-09-11", endedAt: "2026-09-11T19:00:00" };
  assert.equal(goalIdsWithTheirTrip([a, b], [warmUp]).has("a"), false);
  assert.equal(goalIdsWithTheirTrip([a, b], [fixedDates]).has("a"), false);
  assert.equal(goalIdsWithTheirTrip([a, b], [real]).has("a"), true);
  const now = new Date(2026, 8, 13, 9);
  assert.equal(pickTripGoal([a, b], new Set(), now, goalIdsWithTheirTrip([a, b], [warmUp]))?.id, "a");
});

test("the day after an objective whose trip already happened, a new trip is for the next one", () => {
  const a = { id: "a", status: "active", targetDate: at("2026-09-15") };
  const b = { id: "b", status: "active", targetDate: at("2026-09-26") };
  const now = new Date(2026, 8, 16, 9);
  assert.equal(pickTripGoal([a, b], new Set(), now)?.id, "a");
  assert.equal(pickTripGoal([a, b], new Set(), now, new Set(["a"]))?.id, "b");
});

console.log(`home-state: ${passed} passed`);
