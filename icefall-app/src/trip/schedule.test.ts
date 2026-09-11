/**
 * SCHEDULE TESTS — the invariants that stop this module inventing a mountain.
 *
 * The rules under test are the ones that read as obvious in prose and get lost
 * in a refactor:
 *
 *   · it derives NO rate of its own — every figure traces to `ascentPaceFor`;
 *   · it invents NO altitude — a night with nothing recorded has no ceiling and
 *     says which night is missing;
 *   · it invents NO camp — there is no itinerary data in this app, and the
 *     absence is printed rather than filled;
 *   · a broken chain of recorded nights makes the cumulative gain NULL, not 0;
 *   · the narrowed caveat travels with the narrowed figure;
 *   · it is pure — the same trip and nights give the same schedule, and the
 *     only thing `today` may change is which row is marked today.
 */

import {
  ACCLIMATISATION_FLOOR_M,
  ASCENT_PACE_RELEVANT_M,
  ascentPaceFor,
} from "@/services/acclimatisation";

import { NO_ITINERARY_NOTE, buildSchedule, describeTonight } from "./schedule";
import type { Trip, TripNight } from "./trip";

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(`${currentCase} — ${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const eq = (name: string, got: unknown, want: unknown) =>
  check(name, Object.is(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const TODAY = "2026-10-05";

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: "trip:t1",
    name: "Test trip",
    goalId: "goal:g1",
    peakName: "Test Peak",
    peakElevationM: 6000,
    startDate: "2026-10-01",
    endDate: "2026-10-08",
    createdAt: "2026-09-01T00:00:00.000Z",
    endedAt: null,
    ...over,
  };
}

function nights(pairs: [string, number][]): TripNight[] {
  return pairs.map(([date, m]) => ({
    tripId: "trip:t1",
    date,
    sleptAtM: m,
    recordedAt: "2026-10-01T18:00:00.000Z",
  }));
}

/* -------------------------------------------------------------------------- */

function run() {
  /* ---------------------------------------------------------------------- */
  testCase("1 — No elevation, no schedule, and the reason is printed");

  const none = buildSchedule(trip({ peakElevationM: null }), [], null, TODAY);
  eq("state", none.state, "no-peak-elevation");
  eq("no rows are drawn", none.nights.length, 0);
  eq("no pace is invented", none.pace, null);
  check("the note says an elevation is what is missing", none.note.includes("no objective elevation"));
  check("... and that ICEFALL will not guess one", none.note.includes("will not guess"));

  /* ---------------------------------------------------------------------- */
  testCase("2 — Below the relevance threshold there is no schedule, and it says why");

  const low = buildSchedule(trip({ peakElevationM: 2400, peakName: "A Hill" }), [], null, TODAY);
  eq("state", low.state, "below-relevance");
  eq("no rows", low.nights.length, 0);
  check(
    "the note names the peak and the threshold",
    low.note.includes("A Hill") && low.note.includes("3,500 m"),
  );
  check(
    "... and refuses to read that as a clean bill of health",
    low.note.includes("not a clean bill of health"),
  );
  eq(
    "the module agrees with ascentPaceFor about where the line is",
    ascentPaceFor(ASCENT_PACE_RELEVANT_M - 1, null),
    null,
  );
  check(
    "and one metre above it, there IS a schedule",
    buildSchedule(trip({ peakElevationM: ASCENT_PACE_RELEVANT_M }), [], null, TODAY).state ===
      "usable",
  );

  /* ---------------------------------------------------------------------- */
  testCase("3 — Every figure traces to ascentPaceFor. None is derived here.");

  const pace = ascentPaceFor(6000, null);
  const s = buildSchedule(trip(), nights([["2026-10-01", 3800]]), null, TODAY);
  eq("state", s.state, "usable");
  eq("the gain figure is the policy's", s.pace?.maxSleepGainM, pace?.maxSleepGainM);
  eq("the rest figure is the policy's", s.pace?.restNightEveryM, pace?.restNightEveryM);

  const second = s.nights.find((n) => n.date === "2026-10-02");
  eq(
    "the second night's ceiling is last night plus the policy's gain",
    second?.ceilingM,
    3800 + (pace?.maxSleepGainM ?? 0),
  );
  check(
    "the attribution says the figures are not this module's",
    s.attribution.includes("derives no rate of its own"),
  );

  /* Every ceiling in the whole schedule is a recorded night plus that one
     constant — nothing else, ever. */
  const recorded = new Map(nights([["2026-10-01", 3800], ["2026-10-02", 4200]]).map((n) => [n.date, n.sleptAtM]));
  const s2 = buildSchedule(
    trip(),
    nights([
      ["2026-10-01", 3800],
      ["2026-10-02", 4200],
    ]),
    null,
    TODAY,
  );
  let derivedFromRecorded = 0;
  let ceilings = 0;
  for (const n of s2.nights) {
    if (n.ceilingM === null) continue;
    ceilings++;
    const prev = recorded.get(
      `${n.date.slice(0, 8)}${String(Number(n.date.slice(8)) - 1).padStart(2, "0")}`,
    );
    if (prev !== undefined && n.ceilingM === prev + (pace?.maxSleepGainM ?? 0)) derivedFromRecorded++;
  }
  eq("every ceiling drawn came from a recorded night", derivedFromRecorded, ceilings);
  check("and there was at least one to check", ceilings >= 2);

  /* ---------------------------------------------------------------------- */
  testCase("4 — Nothing is invented for a night nobody recorded");

  const empty = buildSchedule(trip(), [], null, TODAY);
  eq("a row exists for every date of the trip", empty.nights.length, 8);
  eq("every one has a null ceiling", empty.nights.filter((n) => n.ceilingM === null).length, 8);
  eq("every one has a null altitude", empty.nights.filter((n) => n.sleptAtM === null).length, 8);
  check(
    "each reason names the specific night that is missing",
    empty.nights.every((n) => /\d{4}-\d{2}-\d{2}/.test(n.ceilingReason)),
  );
  check(
    "the first night's reason names the night BEFORE the trip",
    empty.nights[0].ceilingReason.includes("2026-09-30"),
  );
  check(
    "no row claims a camp or a place",
    empty.nights.every((n) => !/camp|base camp|hut/i.test(n.ceilingReason)),
  );
  check(
    "the schedule states outright that ICEFALL holds no camps",
    empty.noItineraryNote === NO_ITINERARY_NOTE &&
      NO_ITINERARY_NOTE.includes("holds no camps"),
  );

  /* ---------------------------------------------------------------------- */
  testCase("5 — The floor is respected: no ceiling is derived from a night below it");

  const belowFloor = buildSchedule(trip(), nights([["2026-10-01", 2400]]), null, TODAY);
  const night2 = belowFloor.nights.find((n) => n.date === "2026-10-02");
  eq("no ceiling from a night below the floor", night2?.ceilingM, null);
  check(
    "and the reason names the floor",
    (night2?.ceilingReason ?? "").includes(`${ACCLIMATISATION_FLOOR_M.toLocaleString("en-GB")} m`),
  );

  /* ---------------------------------------------------------------------- */
  testCase("6 — Rest nights, cumulative gain, and the chain that breaks honestly");

  const climbing = buildSchedule(
    trip(),
    nights([
      ["2026-10-01", 3000],
      ["2026-10-02", 3500],
      ["2026-10-03", 4000],
      ["2026-10-04", 4000], // not higher — a rest night by definition
      ["2026-10-05", 4500],
    ]),
    null,
    TODAY,
  );
  const by = (d: string) => climbing.nights.find((n) => n.date === d);

  eq("gain accumulates above the floor", by("2026-10-02")?.gainSinceRestM, 500);
  eq("... and keeps accumulating", by("2026-10-03")?.gainSinceRestM, 1000);
  eq("a night no higher than the last is a rest night", by("2026-10-04")?.wasRestNight, true);
  eq("... and it resets the ledger to zero", by("2026-10-04")?.gainSinceRestM, 0);
  eq("... after which it counts again", by("2026-10-05")?.gainSinceRestM, 500);
  eq(
    "a rest night is due once the policy's interval is reached",
    by("2026-10-03")?.restNightDue,
    true,
  );
  eq("... and not before", by("2026-10-02")?.restNightDue, false);

  /* THE GAP. One missing night and the running total is null — never 0, and
     never carried across as if the gap had not happened. */
  const gapped = buildSchedule(
    trip(),
    nights([
      ["2026-10-01", 3000],
      ["2026-10-02", 3500],
      // 03 missing
      ["2026-10-04", 4400],
    ]),
    null,
    TODAY,
  );
  const g = (d: string) => gapped.nights.find((n) => n.date === d);
  eq("the missing night itself has a null ledger", g("2026-10-03")?.gainSinceRestM, null);
  eq("and the night after a gap does NOT resume a total", g("2026-10-04")?.gainSinceRestM, null);
  eq("... nor does it report zero", g("2026-10-04")?.gainSinceRestM === 0, false);
  eq("... and no rest night is claimed on unknown history", g("2026-10-04")?.restNightDue, false);
  eq("a gap also means no ceiling the night after", g("2026-10-04")?.ceilingM, null);

  /* ---------------------------------------------------------------------- */
  testCase("7 — Exceeding the ceiling is stated as arithmetic, not as a symptom");

  const over = buildSchedule(
    trip(),
    nights([
      ["2026-10-01", 4000],
      ["2026-10-02", 4800],
    ]),
    null,
    TODAY,
  );
  const o = over.nights.find((n) => n.date === "2026-10-02");
  eq("the ceiling was 4,500", o?.ceilingM, 4000 + (pace?.maxSleepGainM ?? 0));
  eq("and the excess is the difference", o?.exceededByM, 300);
  eq("a night at the ceiling is not an excess", over.nights.find((n) => n.date === "2026-10-01")?.exceededByM, null);

  /* ---------------------------------------------------------------------- */
  testCase("8 — The narrowed caveat travels with the narrowed figure");

  const serious = buildSchedule(trip(), nights([["2026-10-01", 4000]]), "serious", TODAY);
  const seriousPace = ascentPaceFor(6000, "serious");
  eq("the gain is the narrowed one", serious.pace?.maxSleepGainM, seriousPace?.maxSleepGainM);
  check("the caveat is carried", serious.caveat !== null && serious.caveat === seriousPace?.caveat);
  check(
    "the medical note is carried for a serious history",
    serious.medicalNote !== null && serious.medicalNote === seriousPace?.medicalNote,
  );
  check("the attribution says why it was narrowed", serious.attribution.includes("conservative end"));

  const never = buildSchedule(trip(), nights([["2026-10-01", 4000]]), "never", TODAY);
  eq('"never" buys nothing — same gain as silence', never.pace?.maxSleepGainM, pace?.maxSleepGainM);
  eq("... and carries no caveat", never.caveat, null);

  /* ---------------------------------------------------------------------- */
  testCase("9 — Pure: the clock only decides which row is today");

  const a = buildSchedule(trip(), nights([["2026-10-01", 3800]]), null, "2026-10-03");
  const b = buildSchedule(trip(), nights([["2026-10-01", 3800]]), null, "2026-10-06");
  const strip = (x: typeof a) =>
    JSON.stringify(x.nights.map(({ isToday, isPast, ...rest }) => (void isToday, void isPast, rest)));
  eq("everything except today/past markers is identical", strip(a), strip(b));
  eq("and exactly one row is today", a.nights.filter((n) => n.isToday).length, 1);
  eq("... in each", b.nights.filter((n) => n.isToday).length, 1);
  eq("and they are different rows", a.nights.findIndex((n) => n.isToday) === b.nights.findIndex((n) => n.isToday), false);

  /* ---------------------------------------------------------------------- */
  testCase("10 — describeTonight never says more than the grid does");

  const noCeiling = buildSchedule(trip(), [], null, "2026-10-03");
  const line = describeTonight(noCeiling, "2026-10-03");
  check("with no recorded night it reports the gap", line.includes("No sleeping altitude is recorded"));
  check("... and quotes no number as a ceiling", !/≤|no higher than/.test(line));

  const withCeiling = describeTonight(
    buildSchedule(trip(), nights([["2026-10-02", 4000]]), null, "2026-10-03"),
    "2026-10-03",
  );
  check(
    "with one it names the ceiling",
    withCeiling.includes(`${(4000 + (pace?.maxSleepGainM ?? 0)).toLocaleString("en-GB")}`),
  );

  const outside = describeTonight(buildSchedule(trip(), [], null, "2026-12-25"), "2026-12-25");
  check("a date outside the trip says so", outside.includes("not inside this trip"));

  /* ---------------------------------------------------------------------- */
  testCase("11 — Unreadable dates refuse rather than draw an empty grid");

  const backwards = buildSchedule(
    trip({ startDate: "2026-10-08", endDate: "2026-10-01" }),
    [],
    null,
    TODAY,
  );
  eq("state", backwards.state, "unreadable-dates");
  eq("no rows", backwards.nights.length, 0);

  /* ---------------------------------------------------------------------- */

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  \x1b[31m·\x1b[0m ${f}`));
    if (proc) proc.exitCode = 1;
  }
  console.log(
    "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that the athlete types in the right\n" +
      "altitude. Every sleeping height here is self-reported and the screen labels\n" +
      "it so — the schedule is only ever as good as what it was told.\x1b[0m",
  );
}

void run();
