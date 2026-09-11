/**
 * TEST SET FOR THE CLOCK.
 *
 * `npm run test:time-of-day` — esbuild to node, like every other suite here.
 *
 * WHAT IT IS ACTUALLY PROVING. That the coach's picture of when somebody trains
 * is made of times that were recorded, and says nothing where nothing was. The
 * failure mode this guards against is not a crash: it is a coach confidently
 * telling an athlete they "usually start around midday" because the app itself
 * placed five untimed sessions at midday, or re-reading a 04:30 alpine start in
 * Nepal as a 07:45 lie-in in Cyprus because the phone came home.
 *
 *   Suite 1  the local clock is the clock WHERE THEY WERE. The same instant,
 *            read with the offset that was stored with it, gives the same time
 *            whatever zone this test happens to run in — and gives NOTHING at
 *            all when no offset was stored.
 *   Suite 2  the parts of the day, and one definition of "before five".
 *   Suite 3  a stated start is recorded as the athlete's; an absent one is
 *            inferred, labelled, and never stamped into the future.
 *   Suite 4  the habit: claimed only from enough clustered REAL starts, never
 *            from starts the app placed itself, and refused outright when the
 *            starts are scattered across the day.
 *   Suite 5  recovery in hours, and alpine starts counted.
 *   Suite 6  the prompt lines never state a clock or a habit the data does not
 *            hold.
 *   Suite 7  PRIVACY: what a post may carry has no start time in it, by shape.
 *
 * WHAT IT DOES NOT PROVE. That any screen renders any of this. That is a call
 * site, verified by reading it.
 */
import {
  MIN_PATTERN_SESSIONS,
  describeTrainingClock,
  readTrainingClock,
} from "@/coach/timeOfDay";
import {
  ALPINE_START_BEFORE_HOUR,
  describeHoursSince,
  exactLocalStart,
  formatLocalClock,
  parseLocalClock,
  partOfDay,
  startClockLabel,
} from "@/tracking/timeOfDay";
import { buildManualActivity } from "@/tracking/manual";
import { activityForPost } from "@/social/posts";
import type { CheckIn } from "@/coach/types";
import type { RecordedActivity } from "@/tracking/types";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* A fixed clock. Every figure below is the same figure on every run, in every
   time zone this is run in — which is the only way a suite about time zones
   means anything. */
const NOW = new Date("2026-09-11T09:00:00.000Z");

/** Cyprus in summer: three hours east. The fixtures' home zone. */
const HOME = 180;
/** Nepal: five and three-quarter hours east, and the reason offsets are stored. */
const NEPAL = 345;

/**
 * A recording, reduced to the fields this module reads.
 *
 * Cast rather than fully built: `RecordedActivity` carries thirty fields about
 * distance, sensors and provenance, none of which the clock looks at, and a
 * fixture that filled them all in would hide what each test is actually varying.
 */
function activity(p: {
  startedAt: string;
  offset?: number | null;
  zone?: string | null;
  source?: "measured" | "reported" | "inferred";
  ascent?: number;
  movingSec?: number;
  title?: string;
}): RecordedActivity {
  return {
    id: `a-${p.startedAt}`,
    title: p.title ?? "Session",
    activityTypeId: "hiking",
    startedAt: p.startedAt,
    endedAt: p.startedAt,
    startUtcOffsetMin: p.offset === undefined ? HOME : p.offset,
    startTimeZone: p.zone ?? null,
    startTimeSource: p.source ?? "measured",
    simulated: false,
    origin: { kind: "icefall" },
    elevationGainM: p.ascent ?? 100,
    movingSec: p.movingSec ?? 3600,
    durationSec: p.movingSec ?? 3600,
    distanceM: 8000,
  } as unknown as RecordedActivity;
}

const clockOf = (a: RecordedActivity) => exactLocalStart(a)?.clock ?? null;

/* ========================================================================== */
/* Suite 1 — the clock where they were                                        */
/* ========================================================================== */

/* 01:30 UTC is 04:30 in Cyprus and 07:15 in Nepal. Both are the SAME INSTANT,
   and a coach told "yesterday" about either of them knows neither. */
ok(clockOf(activity({ startedAt: "2026-09-05T01:30:00.000Z" })) === "04:30", "1.1 home clock");
ok(
  clockOf(activity({ startedAt: "2026-09-05T01:30:00.000Z", offset: NEPAL })) === "07:15",
  "1.2 the same instant, read where the athlete actually was",
);
ok(
  clockOf(activity({ startedAt: "2026-09-05T01:30:00.000Z", offset: null })) === null,
  "1.3 no offset stored means NO local clock — never the device's",
);
ok(
  exactLocalStart(activity({ startedAt: "not a date" })) === null,
  "1.4 an unparseable instant answers null rather than throwing",
);

/* The local calendar day is the day THERE. 21:30 UTC on the 4th is already the
   5th in Nepal, and a session filed under the wrong day is a session the plan
   cannot match. */
ok(
  exactLocalStart(activity({ startedAt: "2026-09-04T21:30:00.000Z", offset: NEPAL }))?.dateKey ===
    "2026-09-05",
  "1.5 the calendar day is the one where they were standing",
);

/* The label a screen shows: the zone is named only when it is not this one. */
const abroad = activity({
  startedAt: "2026-09-05T01:30:00.000Z",
  offset: NEPAL,
  zone: "Asia/Kathmandu",
});
ok(
  (startClockLabel(abroad, NOW) ?? "").startsWith("07:15"),
  "1.6 a screen shows the clock of the place it happened",
);
ok(
  startClockLabel(activity({ startedAt: "2026-09-05T01:30:00.000Z", source: "inferred" }), NOW) ===
    "04:30 · time not given",
  "1.7 a start nobody gave is labelled as one, on the screen as well as in the data",
);

/* ========================================================================== */
/* Suite 2 — parts of the day, one definition of "before five"                */
/* ========================================================================== */

ok(partOfDay(4) === "alpine-start", "2.1 04:00 is an alpine start");
ok(partOfDay(ALPINE_START_BEFORE_HOUR) !== "alpine-start", "2.2 05:00 is not");
ok(partOfDay(0) === "alpine-start" && partOfDay(23) === "night", "2.3 the ends of the day");
ok(
  partOfDay(9) === "morning" && partOfDay(13) === "midday" && partOfDay(19) === "evening",
  "2.4 the middle of the day",
);
ok(parseLocalClock("05:30") === 330, "2.5 a clock time parses");
ok(
  parseLocalClock("5:30") === null &&
    parseLocalClock("07:60") === null &&
    parseLocalClock("24:00") === null &&
    parseLocalClock("half five") === null &&
    parseLocalClock(530) === null &&
    parseLocalClock(undefined) === null,
  "2.6 anything that is not exactly HH:MM is REFUSED, never guessed at",
);
ok(formatLocalClock(330) === "05:30" && formatLocalClock(0) === "00:00", "2.7 and formats back");

/* ========================================================================== */
/* Suite 3 — logging a session from chat                                      */
/* ========================================================================== */

const stated = buildManualActivity(
  { date: "2026-09-05", timeLocal: "05:30", activityTypeId: "hiking", durationMin: 120, source: "coach" },
  NOW,
);
ok(clockOf(stated) === "05:30", "3.1 a stated time is the time it is stored at");
ok(stated.startTimeSource === "reported", "3.2 and is recorded as the athlete's own");

const placed = buildManualActivity(
  { date: "2026-09-05", activityTypeId: "hiking", durationMin: 120, source: "coach" },
  NOW,
);
ok(clockOf(placed) === "12:00", "3.3 no time given: the app places it at midday");
ok(
  placed.startTimeSource === "inferred",
  "3.4 and SAYS it placed it — this is the label the habit maths reads",
);

/* The correction the clock made necessary: a session reported at nine this
   morning must not be stamped at midday and end in the afternoon. */
const todayLocal = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 9, 0, 0, 0);
const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const todayKey = `${todayLocal.getFullYear()}-${p2(todayLocal.getMonth() + 1)}-${p2(todayLocal.getDate())}`;
const onToday = buildManualActivity(
  { date: todayKey, activityTypeId: "hiking", durationMin: 120, source: "coach" },
  todayLocal,
);
ok(
  new Date(onToday.endedAt).getTime() <= todayLocal.getTime(),
  "3.5 an inferred session on a day still running never ends in the future",
);
ok(
  new Date(onToday.startedAt).getTime() >=
    new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()).getTime(),
  "3.6 and never falls off the front of the day it belongs to",
);

/* ========================================================================== */
/* Suite 4 — the habit, and its refusals                                      */
/* ========================================================================== */

const read = (activities: RecordedActivity[], statedDays: number[] = [], checkIns: CheckIn[] = []) =>
  readTrainingClock({ activities, checkIns, todayKey: "2026-09-11", statedDays, now: NOW });

/* 03:15Z … 04:00Z with a +180 offset: mornings between 06:15 and 07:00, plus
   one evening. Four in five inside the band, so the habit is real. */
const mornings = [
  activity({ startedAt: "2026-09-01T03:15:00.000Z" }),
  activity({ startedAt: "2026-09-02T03:30:00.000Z" }),
  activity({ startedAt: "2026-09-03T03:45:00.000Z" }),
  activity({ startedAt: "2026-09-04T04:00:00.000Z" }),
  activity({ startedAt: "2026-09-07T16:00:00.000Z" }),
];
const habit = read(mornings);
ok(habit.usual !== null, "4.1 five clustered starts are a habit");
ok(habit.usual?.typical === "06:45", "4.2 the typical start is the middle one");
ok(
  habit.usual?.earliest === "06:15" && habit.usual?.latest === "07:00",
  "4.3 the band is the cluster, not the outlier",
);
ok(habit.usual?.inBand === 4 && habit.usual?.sessions === 5, "4.4 and it says how many of how many");

const scattered = read([
  activity({ startedAt: "2026-09-01T02:00:00.000Z" }),
  activity({ startedAt: "2026-09-02T06:00:00.000Z" }),
  activity({ startedAt: "2026-09-03T10:00:00.000Z" }),
  activity({ startedAt: "2026-09-04T14:00:00.000Z" }),
  activity({ startedAt: "2026-09-07T18:00:00.000Z" }),
]);
ok(scattered.usual === null, "4.5 starts spread across the day are NOT a habit");
ok(
  scattered.usualMissing.includes("spread"),
  "4.6 and the reason given is that they are spread, not that there are too few",
);

const tooFew = read(mornings.slice(0, MIN_PATTERN_SESSIONS - 1));
ok(tooFew.usual === null, "4.7 four starts are not enough to call a pattern");
ok(tooFew.usualMissing.includes("too few"), "4.8 and it says so");

/* THE ONE THAT MATTERS MOST. Five sessions the app itself placed at midday
   must never come back as "you train at midday". */
const appPlaced = read([
  activity({ startedAt: "2026-09-01T09:00:00.000Z", source: "inferred" }),
  activity({ startedAt: "2026-09-02T09:00:00.000Z", source: "inferred" }),
  activity({ startedAt: "2026-09-03T09:00:00.000Z", source: "inferred" }),
  activity({ startedAt: "2026-09-04T09:00:00.000Z", source: "inferred" }),
  activity({ startedAt: "2026-09-07T09:00:00.000Z", source: "inferred" }),
]);
ok(appPlaced.usual === null, "4.9 the app's own placements are never a habit");
ok(appPlaced.inferredSessions === 5, "4.10 they are counted and declared instead");

/* A session with no offset is in the picture but not in the pattern. */
const partlyTimed = read([
  ...mornings,
  activity({ startedAt: "2026-09-08T03:30:00.000Z", offset: null }),
]);
ok(
  partlyTimed.windowSessions === 6 && partlyTimed.timedSessions === 5,
  "4.11 coverage is stated: six sessions, five clocks",
);

/* Days said against days trained. 1 Sep is a Tuesday. */
/* Stated: Sunday, Monday, Saturday. The fixtures train Tue–Fri and Monday. */
const days = read(mornings, [0, 1, 6]);
ok(days.trainedDays.includes(2), "4.12 Tuesday was trained");
ok(days.unstatedDaysTrained.includes(2), "4.13 and Tuesday was never offered");
ok(
  days.statedDaysUnused.includes(0) && days.statedDaysUnused.includes(6),
  "4.14 the weekend days they offered were never used",
);

/* ========================================================================== */
/* Suite 5 — recovery in hours, and alpine starts                             */
/* ========================================================================== */

const hard = read([
  activity({ startedAt: "2026-09-10T19:00:00.000Z", ascent: 900, title: "Big day" }),
  activity({ startedAt: "2026-09-11T06:00:00.000Z", ascent: 120 }),
]);
ok(
  hard.hoursSinceLastHard !== null && Math.round(hard.hoursSinceLastHard) === 14,
  "5.1 the hard day was fourteen hours ago, not 'yesterday'",
);
ok(describeHoursSince(14) === "14 hours ago", "5.2 and is said in hours");
ok(describeHoursSince(60) === "3 days ago", "5.3 past two days, days read better");
ok(
  hard.hoursSinceLast !== null && Math.round(hard.hoursSinceLast) === 3,
  "5.4 the last session of any kind is separate from the last hard one",
);

const alpine = read([
  activity({ startedAt: "2026-09-05T01:30:00.000Z" }),
  activity({ startedAt: "2026-09-08T03:30:00.000Z" }),
]);
ok(alpine.alpineStarts === 1, "5.5 one start before five, counted");
ok(alpine.lastAlpineStart?.clock === "04:30", "5.6 and named");

/* An untimed session still answers "how long ago" — an interval has no zone. */
const untimed = read([activity({ startedAt: "2026-09-10T19:00:00.000Z", ascent: 900, offset: null })]);
ok(
  untimed.hoursSinceLastHard !== null && untimed.lastHard === null,
  "5.7 hours ago is known even when the local clock is not",
);

/* The check-in's own clock. */
const checkIn: CheckIn = {
  date: "2026-09-11",
  at: "2026-09-11T02:40:00.000Z",
  utcOffsetMin: HOME,
  timeZone: "Asia/Nicosia",
  energy: 3,
  soreness: 2,
  sleep: 3,
  stress: 2,
  motivation: 4,
};
const withCheckIn = read(mornings, [], [checkIn]);
ok(withCheckIn.checkIn?.clock === "05:40", "5.8 a check-in is a report made at a time");
ok(withCheckIn.checkIn?.part === "early-morning", "5.9 an early one reports on the night");
const oldCheckIn = read(mornings, [], [{ ...checkIn, at: undefined, utcOffsetMin: undefined }]);
ok(
  oldCheckIn.checkIn === null && oldCheckIn.checkInUntimed,
  "5.10 one stored before times were kept says so rather than guessing",
);

/* ========================================================================== */
/* Suite 6 — the prompt says only what is known                               */
/* ========================================================================== */

const lines = (c: ReturnType<typeof read>) => describeTrainingClock(c).join("\n");

const habitLines = lines(habit);
ok(habitLines.includes("06:45"), "6.1 a real habit reaches the prompt");
ok(
  habitLines.includes("Start times known for 5 of 5"),
  "6.2 with the coverage stated beside it",
);

const scatterLines = lines(scattered);
ok(
  scatterLines.includes("Usual start: not established"),
  "6.3 no habit produces no habit sentence",
);
ok(
  /Usual start: around/.test(scatterLines) === false,
  "6.4 and nothing that could be read as one",
);

const placedLines = lines(appPlaced);
ok(
  placedLines.includes("ICEFALL placed itself"),
  "6.5 the model is told which starts the app invented",
);
ok(
  placedLines.includes("Usual start: not established"),
  "6.6 and is given no habit to describe",
);

const noClockLines = lines(read([activity({ startedAt: "2026-09-10T19:00:00.000Z", offset: null })]));
ok(
  noClockLines.includes("Start times known for 0 of 1"),
  "6.7 a session with no clock is declared, not dropped silently",
);
ok(
  /started \d\d:\d\d local/.test(noClockLines) === false,
  "6.8 and no clock time is printed for it",
);

const hardLines = lines(hard);
ok(hardLines.includes("14 hours ago"), "6.9 recovery reaches the prompt in hours");
ok(
  lines(read([])).includes("none on record"),
  "6.10 no hard session says so rather than implying a recent one",
);

/* ========================================================================== */
/* Suite 7 — privacy: a post cannot carry a start time                        */
/* ========================================================================== */

const posted = activityForPost(
  activity({ startedAt: "2026-09-05T01:30:00.000Z", offset: NEPAL, zone: "Asia/Kathmandu" }),
);
const postedKeys = Object.keys(posted);
ok(
  !postedKeys.includes("id") &&
    !postedKeys.includes("startedAt") &&
    !postedKeys.includes("startUtcOffsetMin") &&
    !postedKeys.includes("startTimeZone") &&
    !postedKeys.includes("startTimeSource"),
  "7.1 what a post may show carries no start time and no id — an id is an epoch instant",
);
ok(posted.dateKey === "2026-09-05", "7.2 it carries the day");
ok(
  /^\d{4}-\d{2}-\d{2}$/.test(posted.dateKey),
  "7.3 and the day is a date, with no hour hiding in it",
);
ok(
  JSON.stringify(posted).includes("01:30") === false &&
    JSON.stringify(posted).includes("T01") === false,
  "7.4 and nothing anywhere in it serialises a time",
);

/* ========================================================================== */

if (failures.length) {
  console.error(`\n${failures.length} FAILED of ${failures.length + passCount}:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  if (proc) proc.exitCode = 1;
} else {
  console.log(`time-of-day: ${passCount}/${passCount} passed`);
}
