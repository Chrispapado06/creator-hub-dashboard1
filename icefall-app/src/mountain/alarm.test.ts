/**
 * The turnaround alarm: store timing (including a turnaround that passes while
 * the phone is locked, and snooze), which surface shows, the screen lock
 * window, the words, the setter's checks, time-to-summit at pace, and daylight.
 *
 * Run: npx esbuild src/mountain/alarm.test.ts --bundle --platform=node --format=esm
 *        --define:import.meta.env={} --alias:@=./src --outfile=node_modules/.icefall-tests/alarm.test.mjs
 *      && node node_modules/.icefall-tests/alarm.test.mjs
 */

import {
  PACE_MIN_GAIN_M,
  alarmSurface,
  checkTurnaroundInput,
  dayOptions,
  daylightLines,
  daylightView,
  defaultDay,
  lineText,
  missedLines,
  setTimeLabel,
  snoozeLabel,
  summitEtaAtPace,
  wantsAttention,
  wantsWakeLock,
  zoneWarning,
  type PacePoint,
} from "./alarmModel";
import { solarDateISO } from "./daylight";
import type { KnownPosition } from "./position";
import {
  MAX_SNOOZES,
  SNOOZE_MS,
  __resetTurnaroundForTests,
  markTurnedAround,
  observeTurnaround,
  readTurnaround,
  setTurnaround,
  snoozeTurnaround,
  turnaroundPhase,
} from "./turnaround";

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

const TRIP = "trip-1";
/** A local wall-clock moment on 14 Sep 2026. */
const at = (h: number, m: number, s = 0) => new Date(2026, 8, 14, h, m, s);
const phaseAt = (d: Date) => turnaroundPhase(readTurnaround(TRIP), d.getTime());
const kind = (d: Date) => phaseAt(d).kind;
const OFF = { onNowTab: false, onSos: false };

function arm() {
  __resetTurnaroundForTests();
  const r = setTurnaround(TRIP, "2026-09-14", "13:00", at(10, 0));
  if ("error" in r) throw new Error(r.error);
  return r;
}

console.log("\n\x1b[1m1 — Phases from the wall clock\x1b[0m");
{
  arm();
  eq("3 h out: set", kind(at(10, 0)), "set");
  eq("15 min out: countdown", kind(at(12, 45)), "countdown");
  eq("countdown shows a line off the Now tab", alarmSurface(phaseAt(at(12, 45)), OFF), { kind: "line", tone: "countdown" });
  eq("countdown draws nothing on the Now tab", alarmSurface(phaseAt(at(12, 45)), { onNowTab: true, onSos: false }), { kind: "none" });
  check("screen lock wanted in the last 30 min", wantsWakeLock(phaseAt(at(12, 45))));
  check("screen lock NOT wanted 3 h out", !wantsWakeLock(phaseAt(at(10, 0))));
  eq("same setting + same clock = same phase", phaseAt(at(12, 50)), phaseAt(at(12, 50)));
  eq("set draws nothing", alarmSurface(phaseAt(at(10, 0)), OFF), { kind: "none" });
  eq("unset draws nothing", alarmSurface(turnaroundPhase(null), OFF), { kind: "none" });
}

console.log("\n\x1b[1m2 — Watching when it comes due\x1b[0m");
{
  arm();
  observeTurnaround(TRIP, at(12, 59, 40));
  observeTurnaround(TRIP, at(13, 0, 10));
  check("no missed mark when the screen was watching", readTurnaround(TRIP)?.missedAt === null);
  eq("13:00:10: due", kind(at(13, 0, 10)), "due");
  eq("due is full screen", alarmSurface(phaseAt(at(13, 0, 10)), OFF), { kind: "full", reason: "due" });
  check("full screen asks for sound and vibration", wantsAttention(alarmSurface(phaseAt(at(13, 0, 10)), OFF)));
  eq("due on the SOS screen is only a line", alarmSurface(phaseAt(at(13, 0, 10)), { onNowTab: false, onSos: true }), {
    kind: "line",
    tone: "due",
  });
  check("no sound over SOS", !wantsAttention(alarmSurface(phaseAt(at(13, 0, 10)), { onNowTab: false, onSos: true })));
}

console.log("\n\x1b[1m3 — It passed while the phone was locked\x1b[0m");
{
  arm(); // last observed 10:00, then the phone went in a pocket
  observeTurnaround(TRIP, at(13, 1, 30));
  eq("back 90 s late (inside grace): a normal due alarm", kind(at(13, 1, 30)), "due");

  arm();
  eq("before anything looks, 13:20 reads as due", kind(at(13, 20)), "due");
  observeTurnaround(TRIP, at(13, 20));
  const s = readTurnaround(TRIP);
  check("back at 13:20: missed is recorded", s?.missedAt === at(13, 20).toISOString(), JSON.stringify(s?.missedAt));
  eq("phase: missed", kind(at(13, 20)), "missed");
  eq("missed is full screen", alarmSurface(phaseAt(at(13, 20)), OFF), { kind: "full", reason: "missed" });
  const lines = missedLines(s!, s!.timeZone, at(13, 20).getTime());
  eq("missed wording", lines, [
    "This alarm did not sound.",
    "ICEFALL was closed or the screen was off.",
    "You set it for 13:00. It is now 13:20.",
  ]);
  check("screen lock held while the missed screen is up", wantsWakeLock(phaseAt(at(13, 20))));

  // Snooze from the missed screen.
  check("snooze from missed", snoozeTurnaround(TRIP, at(13, 21)));
  check("snooze marks the missed screen seen", !!readTurnaround(TRIP)?.missedSeenAt);
  const snoozed = phaseAt(at(13, 30));
  eq("13:30: snoozed", snoozed.kind, "snoozed");
  eq("6 min until it rings again", snoozed.kind === "snoozed" ? snoozed.msUntilSnoozeEnds : -1, 6 * 60_000);
  eq("snoozed is a line", alarmSurface(snoozed, OFF), { kind: "line", tone: "snoozed" });
  observeTurnaround(TRIP, at(13, 37));
  eq("13:37: due again, not missed twice", kind(at(13, 37)), "due");
}

console.log("\n\x1b[1m4 — A snooze that ends while the phone is locked\x1b[0m");
{
  arm();
  observeTurnaround(TRIP, at(13, 0, 5));
  snoozeTurnaround(TRIP, at(13, 5));
  observeTurnaround(TRIP, at(13, 5));
  eq("13:10 snoozed", kind(at(13, 10)), "snoozed");
  // Locked 13:10 → 13:50. Timers froze; the clock did not.
  observeTurnaround(TRIP, at(13, 50));
  eq("back at 13:50: rings at once (snooze ended while hidden)", kind(at(13, 50)), "due");
  check("not reported as missed — it had sounded", readTurnaround(TRIP)?.missedAt === null);
}

console.log("\n\x1b[1m5 — Three snoozes, then never quiet\x1b[0m");
{
  arm();
  let t = at(13, 0);
  for (let i = 0; i < MAX_SNOOZES; i++) {
    eq(`snooze label before snooze ${i + 1}`, snoozeLabel(readTurnaround(TRIP)!, MAX_SNOOZES), i === MAX_SNOOZES - 1 ? "Snooze 15 min · last one" : `Snooze 15 min · ${MAX_SNOOZES - i} left`);
    check(`snooze ${i + 1} accepted`, snoozeTurnaround(TRIP, t));
    t = new Date(t.getTime() + SNOOZE_MS);
  }
  check("a 4th snooze is refused", !snoozeTurnaround(TRIP, t));
  const over = phaseAt(at(14, 12));
  eq("14:12: overdue", over.kind, "overdue");
  eq("overdue is a permanent line", alarmSurface(over, { onNowTab: true, onSos: true }), { kind: "line", tone: "overdue" });
  const s = readTurnaround(TRIP)!;
  eq("overdue wording, plan §3.7", lineText("overdue", over, s, s.timeZone), "You passed your turnaround time at 13:00 — 1 h 12 min ago");
  check("overdue lets go of the screen lock", !wantsWakeLock(over));

  markTurnedAround(TRIP, at(14, 13));
  eq("turned around: nothing on screen", alarmSurface(phaseAt(at(14, 20)), OFF), { kind: "none" });
  observeTurnaround(TRIP, at(15, 0));
  check("turned around: observing records nothing", readTurnaround(TRIP)?.missedAt === null);
  arm();
  eq("setting a new time clears it all", [readTurnaround(TRIP)?.snoozeCount, readTurnaround(TRIP)?.turnedAt], [0, null]);
}

console.log("\n\x1b[1m6 — Words and the phone's time zone\x1b[0m");
{
  const s = arm();
  eq("same zone: the typed time", setTimeLabel(s, s.timeZone), "13:00");
  eq("no zone warning in the same zone", zoneWarning(s, s.timeZone), null);
  const moved = { ...s, timeZone: "Europe/Paris" };
  eq("zone moved: named", setTimeLabel(moved, "Asia/Kathmandu"), "13:00 (Europe/Paris time)");
  eq(
    "zone warning",
    zoneWarning(moved, "Asia/Kathmandu"),
    "Set on Europe/Paris time. This phone is now on Asia/Kathmandu. Check the phone's clock.",
  );
  eq("countdown line", lineText("countdown", phaseAt(at(12, 36)), s, s.timeZone), "Turn around in 24 min · 13:00");
}

console.log("\n\x1b[1m7 — Setting the time\x1b[0m");
{
  const now = at(10, 0).getTime();
  check("empty time: asks for one, never pre-fills", !checkTurnaroundInput("2026-09-14", "", now).ok);
  check("unreadable time refused", !checkTurnaroundInput("2026-09-14", "25:00", now).ok);
  const past = checkTurnaroundInput("2026-09-14", "09:30", now);
  eq("a past time refused", past.ok ? null : past.error, "That time has already passed. Pick a later one.");
  const ok = checkTurnaroundInput("2026-09-14", "13:00", now);
  eq("13:00 from 10:00 is 3 h ahead", ok.ok ? ok.msAhead : null, 3 * 3_600_000);

  const trip = {
    startDate: "2026-09-13",
    endDate: "2026-09-14",
    itinerary: [
      { date: "2026-09-13", dayNumber: 1, label: "Up to the hut", sleepAt: null, summitDay: false },
      { date: "2026-09-14", dayNumber: 2, label: "Summit, then down", sleepAt: null, summitDay: true },
    ],
  };
  const opts = dayOptions(trip, "2026-09-13");
  eq("both days offered", opts.map((o) => o.label), ["Day 1 · Up to the hut", "Day 2 · Summit, then down"]);
  eq("defaults to the itinerary's summit day", defaultDay(opts), "2026-09-14");
  eq("past days are not offered", dayOptions(trip, "2026-09-14").map((o) => o.date), ["2026-09-14"]);
  eq("a real trip with no itinerary", dayOptions({ startDate: "2026-09-14", endDate: "2026-09-16", itinerary: null }, "2026-09-15").map((o) => o.label), ["Day 2", "Day 3"]);
  eq("default with no summit day: first day", defaultDay(dayOptions({ startDate: "2026-09-14", endDate: "2026-09-16", itinerary: null }, "2026-09-15")), "2026-09-15");
  eq("an ended trip offers today only", dayOptions({ startDate: "2026-09-01", endDate: "2026-09-03", itinerary: null }, "2026-09-14"), [
    { date: "2026-09-14", label: "Today", summitDay: false },
  ]);
  eq("no trip offers today only", dayOptions(null, "2026-09-14").length, 1);
}

console.log("\n\x1b[1m8 — Time to the summit at current pace\x1b[0m");
{
  const summit = { lat: 45.8326, lon: 6.8652 };
  const summitElevationM = 4806;
  const now = at(12, 30).getTime();
  /** One point a minute for `mins`, climbing `mPerH`, ending at `endAlt`, `lastAgeMs` before now. */
  const climb = (mins: number, mPerH: number, endAlt: number, lastAgeMs = 0, where = { lat: 45.84, lon: 6.86 }): PacePoint[] =>
    Array.from({ length: mins + 1 }, (_, i) => {
      const minsBeforeEnd = mins - i;
      return {
        t: now - lastAgeMs - minsBeforeEnd * 60_000,
        lat: where.lat,
        lon: where.lon,
        altitudeM: endAlt - (mPerH * minsBeforeEnd) / 60,
      };
    });

  const good = summitEtaAtPace({ points: climb(30, 300, 4150), now, summit, summitElevationM });
  check("a real climb gives a figure", good !== null);
  check("rate ≈ 300 m/h", !!good && Math.abs(good.rateMPerH - 300) < 1, String(good?.rateMPerH));
  check("656 m left at 300 m/h ≈ 2 h 11 min", !!good && Math.abs(good.msToSummit - (656 / 300) * 3_600_000) < 60_000);

  eq("no recording: no line", summitEtaAtPace({ points: null, now, summit, summitElevationM }), null);
  eq("no summit height: no line", summitEtaAtPace({ points: climb(30, 300, 4150), now, summit, summitElevationM: null }), null);
  eq("no summit place: no line", summitEtaAtPace({ points: climb(30, 300, 4150), now, summit: null, summitElevationM }), null);
  eq("only 10 min of track: no line", summitEtaAtPace({ points: climb(10, 300, 4150), now, summit, summitElevationM }), null);
  eq("last fix 10 min old: no line", summitEtaAtPace({ points: climb(30, 300, 4150, 10 * 60_000), now, summit, summitElevationM }), null);
  eq("not climbing (flat): no line", summitEtaAtPace({ points: climb(30, 0, 4150), now, summit, summitElevationM }), null);
  eq(`gain under ${PACE_MIN_GAIN_M} m (GPS noise): no line`, summitEtaAtPace({ points: climb(30, 100, 4150), now, summit, summitElevationM }), null);
  eq("descending: no line", summitEtaAtPace({ points: climb(30, -300, 4150), now, summit, summitElevationM }), null);
  eq("already above the summit height: no line", summitEtaAtPace({ points: climb(30, 300, 4900), now, summit, summitElevationM }), null);
  eq("recording 100 km away: no line", summitEtaAtPace({ points: climb(30, 300, 4150, 0, { lat: 46.8, lon: 6.86 }), now, summit, summitElevationM }), null);
  eq(
    "altitude-less fixes are not a pace",
    summitEtaAtPace({ points: climb(30, 300, 4150).map((p) => ({ ...p, altitudeM: null })), now, summit, summitElevationM }),
    null,
  );
}

console.log("\n\x1b[1m9 — Sunrise, sunset and daylight left\x1b[0m");
{
  // The alarm and the Now tab share `daylight.ts` (checked against published
  // times in now.test.ts). London, 21 June 2024: sunset 21:21 BST (20:21 UTC).
  const noon = Date.UTC(2024, 5, 21, 12);
  const summitLondon = { lat: 51.5074, lon: -0.1278 };
  const fresh: KnownPosition = { lat: 51.5074, lon: -0.1278, accuracyM: 5, altitudeM: 20, altitudeAccuracyM: 10, at: noon - 60_000 };
  const v = daylightView({ now: noon, position: fresh, summit: null, peakName: null });
  check("fresh position: daylight from it", v.kind === "sun" && v.input.from.kind === "position");
  check(
    "≈ 8 h 21 min left at noon UTC",
    v.kind === "sun" && v.light.kind === "day" && Math.abs(v.light.msToSunset - (8 * 60 + 21) * 60_000) <= 3 * 60_000,
  );
  const old = { ...fresh, at: noon - 3 * 3_600_000 };
  const s = daylightView({ now: noon, position: old, summit: summitLondon, peakName: "Test Peak" });
  check("position hours old: falls back to the summit", s.kind === "sun" && s.input.from.kind === "summit");
  const sl = daylightLines(s);
  check("says which place and which clock it used", !!sl && sl.small.includes("the summit of Test Peak") && sl.small.includes("this phone's clock"));
  eq("old position and no summit: silent, no figure", daylightView({ now: noon, position: old, summit: null, peakName: null }), { kind: "silent" });
  eq("silent draws no lines", daylightLines({ kind: "silent" }), null);
  const dusk = daylightView({ now: Date.UTC(2024, 5, 21, 20, 40), position: null, summit: summitLondon, peakName: null });
  eq("after sunset, before dark: twilight", dusk.kind === "sun" ? dusk.light.kind : dusk.kind, "twilight");
  const night = daylightView({ now: Date.UTC(2024, 5, 21, 23, 30), position: null, summit: summitLondon, peakName: null });
  eq("late evening: dark, with tomorrow's sunrise", night.kind === "sun" ? night.light.kind : night.kind, "dark");
  check("... never 'hours of daylight' at night", !daylightLines(night)?.big.includes("of daylight"));
  const early = daylightView({ now: Date.UTC(2024, 5, 21, 2, 0), position: null, summit: summitLondon, peakName: null });
  eq("before dawn: before-sunrise, not a day's worth of daylight", early.kind === "sun" ? early.light.kind : early.kind, "before-sunrise");
  const polar = daylightView({ now: noon, position: null, summit: { lat: 69.65, lon: 18.96 }, peakName: null });
  eq("Tromsø midsummer: the sun does not set", daylightLines(polar)?.big, "The sun does not set today");
  // The day is the place's by the sun, whatever time zone the phone is on.
  eq("23:30 UTC is still 21 June in London", solarDateISO(Date.UTC(2024, 5, 21, 23, 30), -0.1278), "2024-06-21");
  eq("... and already 22 June on Everest", solarDateISO(Date.UTC(2024, 5, 21, 23, 30), 86.925), "2024-06-22");
}

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  if (proc) proc.exitCode = 1;
}
