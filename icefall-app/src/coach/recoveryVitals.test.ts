/**
 * TEST SET FOR MEASURED VITALS IN RECOVERY.
 *
 * `npm run test:recovery-vitals` — esbuild to node, like every other suite here.
 *
 * WHAT IT IS ACTUALLY PROVING. That a figure an instrument measured and a
 * figure a person typed stay different things all the way through the recovery
 * model, and that a figure with a doubtful provenance is never scored as if it
 * were this morning's. The failure modes it guards against are not crashes:
 *
 *   · a recovery screen showing a four-day-old resting heart rate as today's,
 *     because Oura's cloud only received last night when the person next opened
 *     the Oura app;
 *   · a measured night and a "how did you sleep, one to five" being averaged
 *     into one "sleep", after which nobody can say which was which;
 *   · a resting heart rate scored against population figures because no
 *     baseline of the athlete's own was available;
 *   · an absence with no name — a score quietly renormalised over what was left
 *     and presented with the same confidence as a complete one;
 *   · an Oura reading reaching a language model while the developer agreement
 *     that governs it is unresolved.
 *
 *   Suite 1  the three states of a vital: no instrument, instrument with
 *            nothing, and a measurement.
 *   Suite 2  the reading's own time. No date, a stale date, and a date in the
 *            future are all unscoreable, and all say so with the date attached.
 *   Suite 3  measured sleep genuinely moves the score, and never merges with
 *            the check-in's sleep slider.
 *   Suite 4  resting heart rate is scored only against the athlete's own
 *            baseline, and the MISSING PART named is the baseline, not the
 *            reading.
 *   Suite 5  what recovery could not see is named, every time.
 *   Suite 6  the prompt seam: no measured figure appears in the string that
 *            goes to the model, and the gate is shut.
 *   Suite 7  the resolver's three states survive the trip from vitals.ts.
 *
 * WHAT IT DOES NOT PROVE. That any screen renders any of this — that is a call
 * site, verified by reading it.
 */
import { assessRecovery, type RecoveryVitals } from "@/coach/recovery";
import { VITALS_MAY_REACH_MODEL, VITALS_WITHHELD_FROM_MODEL } from "@/coach/vitalsPolicy";
import { coachVitalInputs } from "@/tracking/sources/vitals";
import type { CheckIn, MeasuredVital } from "@/coach/types";
import type { Vitals, Vital, VitalId } from "@/tracking/sources/vitals";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* A fixed clock, so "last night" is the same night on every run and in every
   time zone. Read as a LOCAL date by the module, which is why the fixtures
   below are built from the same local parts rather than from a UTC slice. */
const NOW = new Date(2026, 8, 11, 9, 0, 0); // 11 September 2026, 09:00 local
const TODAY = "2026-09-11";
const YESTERDAY = "2026-09-10";
const FOUR_NIGHTS_AGO = "2026-09-07";
const TOMORROW = "2026-09-12";

/** A middling check-in, so the score has somewhere to move in both directions. */
const CHECK_IN: CheckIn = {
  date: TODAY,
  energy: 3,
  soreness: 3,
  sleep: 3,
  stress: 3,
  motivation: 3,
};

const measured = (value: number, measuredOn: string): MeasuredVital => ({
  value,
  source: "oura",
  measuredOn,
});

const noInstrument: MeasuredVital = { value: undefined, reason: "not-connected" };
const instrumentSilent: MeasuredVital = { value: null, reason: "no-data", source: "oura" };

const vitals = (over: Partial<RecoveryVitals> = {}): RecoveryVitals => ({
  sleep: noInstrument,
  restingHeartRate: noInstrument,
  ...over,
});

const assess = (over: Partial<Parameters<typeof assessRecovery>[0]> = {}) =>
  assessRecovery({ checkIn: CHECK_IN, now: NOW, ...over });

const vital = (id: "sleepDuration" | "restingHeartRate", r: ReturnType<typeof assess>) => {
  const found = r.vitals.find((v) => v.id === id);
  if (!found) throw new Error(`no vital report for ${id}`);
  return found;
};

const input = (id: string, r: ReturnType<typeof assess>) => {
  const found = r.inputs.find((i) => i.id === id);
  if (!found) throw new Error(`no input row for ${id}`);
  return found;
};

/* ========================================================================== */
/* Suite 1 — the three states                                                 */
/* ========================================================================== */

{
  const none = assess({ vitals: vitals() });
  const sleepNone = vital("sleepDuration", none);
  ok(sleepNone.value === null, "1.1 no instrument yields no figure");
  ok(sleepNone.scored === false, "1.2 and nothing is scored from it");
  ok(sleepNone.reason === "not-connected", "1.3 and the reason is that nothing is connected");
  ok(
    sleepNone.source === undefined && sleepNone.sourceLabel === undefined,
    "1.4 and no instrument is named, because none took a reading",
  );

  const silent = assess({ vitals: vitals({ sleep: instrumentSilent }) });
  ok(
    vital("sleepDuration", silent).reason === "no-data",
    "1.5 an instrument that answered with nothing is NOT reported as disconnected",
  );

  const real = assess({ vitals: vitals({ sleep: measured(7 * 60, TODAY) }) });
  const sleepReal = vital("sleepDuration", real);
  ok(sleepReal.value === 7, "1.6 minutes are reported to the athlete in hours");
  ok(sleepReal.unit === "h", "1.7 with the unit beside the number");
  ok(sleepReal.source === "oura", "1.8 and the instrument travels with it");
  ok(
    sleepReal.sourceLabel === "your Oura ring",
    "1.9 named in words the athlete would recognise",
  );
  ok(sleepReal.scored === true, "1.10 and a fresh reading is counted");

  ok(
    assess({}).vitals.length === 2,
    "1.11 omitting vitals entirely still reports both, as absent rather than as nothing",
  );
  ok(
    vital("sleepDuration", assess({})).value === null &&
      vital("restingHeartRate", assess({})).value === null,
    "1.12 and neither is defaulted to a figure",
  );
}

/* ========================================================================== */
/* Suite 2 — the reading's own time                                           */
/* ========================================================================== */

{
  const undated = assess({
    vitals: vitals({ sleep: { value: 7 * 60, source: "oura" } }),
  });
  const u = vital("sleepDuration", undated);
  ok(u.value === 7, "2.1 an undated reading is still shown");
  ok(u.scored === false, "2.2 but it is NOT scored — no date means it cannot be today's");
  ok(
    u.note.includes("did not say which day"),
    "2.3 and the note says exactly why, rather than implying a sensor fault",
  );

  const lastNight = vital("sleepDuration", assess({ vitals: vitals({ sleep: measured(420, TODAY) }) }));
  ok(lastNight.when === "last night", "2.4 a reading dated today IS last night");
  ok(lastNight.note.includes("11 September"), "2.5 and the note carries the date itself");

  const nightBefore = vital(
    "sleepDuration",
    assess({ vitals: vitals({ sleep: measured(420, YESTERDAY) }) }),
  );
  ok(
    nightBefore.when === "the night before last",
    "2.6 a reading dated yesterday is named as the night before last, never as last night",
  );
  ok(
    nightBefore.scored === true,
    "2.7 and it is still counted — an Oura app that has not been opened is not a stale night",
  );

  const stale = vital(
    "sleepDuration",
    assess({ vitals: vitals({ sleep: measured(420, FOUR_NIGHTS_AGO) }) }),
  );
  ok(stale.value === 7, "2.8 an old reading is not hidden");
  ok(stale.scored === false, "2.9 but it never moves today's score");
  ok(stale.when === "4 nights ago", "2.10 and the screen is told how old it is");
  ok(
    stale.note.includes("7 September") && stale.note.includes("not counted"),
    "2.11 with the date it belongs to and the fact that it was not counted",
  );
  ok(
    stale.note.includes("open the Oura app"),
    "2.12 and Oura's own freshness problem is explained to the person who can fix it",
  );

  const future = vital(
    "sleepDuration",
    assess({ vitals: vitals({ sleep: measured(420, TOMORROW) }) }),
  );
  ok(
    future.scored === false && future.when === "dated in the future",
    "2.13 a reading dated in the future is described as such, not accepted as today's",
  );
}

/* ========================================================================== */
/* Suite 3 — measured sleep moves the score, and never merges                 */
/* ========================================================================== */

{
  const blind = assess({ vitals: vitals() });
  const short = assess({ vitals: vitals({ sleep: measured(4 * 60, TODAY) }) });
  const long = assess({ vitals: vitals({ sleep: measured(8 * 60, TODAY) }) });

  ok(
    blind.score.value !== null && short.score.value !== null && long.score.value !== null,
    "3.1 all three produce a score, because the athlete checked in",
  );
  ok(
    (short.score.value as number) < (blind.score.value as number),
    "3.2 a measured four-hour night LOWERS recovery — the wiring genuinely moves it",
  );
  ok(
    (long.score.value as number) > (blind.score.value as number),
    "3.3 and a measured eight-hour night raises it",
  );

  ok(
    short.reportedCount === blind.reportedCount,
    "3.4 a measurement never inflates the count of things the ATHLETE reported",
  );

  const sleepSlider = input("sleep", long);
  const sleepMeasured = input("sleepDuration", long);
  ok(
    sleepSlider.id !== sleepMeasured.id && sleepSlider.value === 3 && sleepMeasured.value === 8,
    "3.5 the reported sleep rating and the measured night are two separate inputs",
  );
  ok(
    sleepSlider.kind === "self-reported" && sleepMeasured.kind === "measured",
    "3.6 and they are labelled as two different kinds of evidence",
  );
  ok(sleepMeasured.source === "oura", "3.7 the measured one names its instrument");
  ok(sleepMeasured.measuredOn === TODAY, "3.8 and the day it was measured");
  ok(
    input("loadRatio", long).kind === "derived" && input("hardSession", long).kind === "derived",
    "3.9 arithmetic over recorded sessions is a third kind, not a self-report",
  );

  /* `counted` is what a screen splits its "what went into it" list on. It must
     track the arithmetic, not the presence of a number. */
  ok(input("sleepDuration", long).counted === true, "3.11 a counted row says it was counted");
  const staleRow = input(
    "sleepDuration",
    assess({ vitals: vitals({ sleep: measured(420, FOUR_NIGHTS_AGO) }) }),
  );
  ok(
    staleRow.value === 7 && staleRow.counted === false,
    "3.12 a stale reading keeps its figure and is NOT listed as counted",
  );
  ok(
    input(
      "restingHeartRate",
      assess({ vitals: vitals({ restingHeartRate: measured(52, TODAY) }) }),
    ).counted === false,
    "3.13 nor is a resting heart rate with no baseline to read it against",
  );
  ok(
    long.inputs.filter((i) => i.counted).length ===
      long.inputs.filter((i) => i.value !== null && i.counted).length,
    "3.14 nothing is ever counted without a value behind it",
  );

  /* WITHOUT THE ATHLETE, NO SCORE. A ring can say how somebody slept; it cannot
     say how they are, and recovery is a claim about the second thing. */
  const noCheckIn = assessRecovery({
    now: NOW,
    vitals: vitals({ sleep: measured(8 * 60, TODAY), restingHeartRate: measured(48, TODAY) }),
  });
  ok(
    noCheckIn.score.value === null && noCheckIn.status === "unknown",
    "3.10 measured vitals alone never produce a recovery score",
  );
  ok(
    noCheckIn.summary.includes("only you can give that"),
    "3.11 and the copy says why, instead of claiming no health signals exist",
  );
  ok(
    noCheckIn.summary.includes("no health signals are available") === false,
    "3.12 — that old sentence would be a plain falsehood with a ring connected",
  );
}

/* ========================================================================== */
/* Suite 4 — resting heart rate needs the athlete's own baseline              */
/* ========================================================================== */

{
  const noBaseline = assess({ vitals: vitals({ restingHeartRate: measured(52, TODAY) }) });
  const r = vital("restingHeartRate", noBaseline);
  ok(r.value === 52, "4.1 the reading is shown");
  ok(r.scored === false, "4.2 and is NOT scored without a baseline of the athlete's own");
  ok(
    input("restingHeartRate", noBaseline).value === 52,
    "4.3 it still appears in the input list, so the screen can say what was read",
  );
  ok(
    noBaseline.score.value === assess({ vitals: vitals() }).score.value,
    "4.4 and it moves the number by exactly nothing",
  );
  ok(
    r.note.includes("baseline") && r.note.includes("not counted"),
    "4.5 the note says the baseline is what is missing, not the reading",
  );

  const withBaseline = (bpm: number) =>
    assess({
      vitals: vitals({
        restingHeartRate: measured(bpm, TODAY),
        restingHeartRateBaseline: { bpm: 50, fromNights: 14, source: "oura" },
      }),
    });

  const atBaseline = withBaseline(50);
  const wellAbove = withBaseline(62);
  ok(
    vital("restingHeartRate", atBaseline).scored === true,
    "4.6 with a baseline, the reading is scored",
  );
  ok(
    (wellAbove.score.value as number) < (atBaseline.score.value as number),
    "4.7 and a resting heart rate well above the athlete's own lowers recovery",
  );
  ok(
    (withBaseline(44).score.value as number) === (atBaseline.score.value as number),
    "4.8 a reading BELOW the baseline scores the same as at it — never better than recovered",
  );
  ok(
    vital("restingHeartRate", atBaseline).note.includes("question for a doctor"),
    "4.9 and the copy states the comparison without telling anyone what it means about them",
  );
  ok(
    vital("restingHeartRate", atBaseline).note.includes("14 of your own nights"),
    "4.10 naming how much of their own history the baseline was built from",
  );

  const staleRhr = assess({
    vitals: vitals({
      restingHeartRate: measured(62, FOUR_NIGHTS_AGO),
      restingHeartRateBaseline: { bpm: 50, fromNights: 14, source: "oura" },
    }),
  });
  ok(
    vital("restingHeartRate", staleRhr).scored === false &&
      staleRhr.score.value === assess({ vitals: vitals() }).score.value,
    "4.11 a baseline does not rescue a four-night-old reading",
  );
}

/* ========================================================================== */
/* Suite 5 — name the part you could not see                                  */
/* ========================================================================== */

{
  const blind = assess({ vitals: vitals() });
  ok(blind.missingVitals.length === 2, "5.1 both vitals are named when neither is available");
  ok(
    blind.summary.includes("Recovery could not see"),
    "5.2 and the summary says so rather than presenting a thin score as a full one",
  );

  const half = assess({ vitals: vitals({ sleep: measured(7 * 60, TODAY) }) });
  ok(
    half.missingVitals.length === 1 && half.missingVitals[0].includes("resting heart rate"),
    "5.3 only the part that is actually missing is named",
  );

  const baselineMissing = assess({ vitals: vitals({ restingHeartRate: measured(52, TODAY) }) });
  ok(
    baselineMissing.missingVitals.some((m) => m.includes("baseline")),
    "5.4 a reading without a baseline names the BASELINE as the gap",
  );
  ok(
    baselineMissing.missingVitals.some((m) => m === "your resting heart rate") === false,
    "5.5 and never claims the reading itself is missing while looking straight at it",
  );

  const complete = assess({
    vitals: vitals({
      sleep: measured(7 * 60, TODAY),
      restingHeartRate: measured(50, TODAY),
      restingHeartRateBaseline: { bpm: 50, fromNights: 14, source: "oura" },
    }),
  });
  ok(complete.missingVitals.length === 0, "5.6 nothing is named when nothing is missing");
  ok(
    complete.summary.includes("Recovery could not see") === false,
    "5.7 and the sentence disappears rather than reading as an empty list",
  );

  const stale = assess({ vitals: vitals({ sleep: measured(420, FOUR_NIGHTS_AGO) }) });
  ok(
    stale.missingVitals.some((m) => m.includes("older than last night")),
    "5.8 a stale night is named as a freshness gap, not as an absent sensor",
  );
}

/* ========================================================================== */
/* Suite 6 — the prompt seam                                                  */
/* ========================================================================== */

{
  const full = assess({
    vitals: vitals({
      sleep: measured(7 * 60 + 12, TODAY),
      restingHeartRate: measured(47, TODAY),
      restingHeartRateBaseline: { bpm: 50, fromNights: 14, source: "oura" },
    }),
  });

  /* `summary` is written into the model's system prompt verbatim by
     coach/context.ts. If a measured figure ever migrates back into it, the
     policy gate in vitalsPolicy.ts leaks and this assertion is the only thing
     standing between an Oura reading and a third-party model. */
  ok(
    full.summary.includes("47") === false && full.summary.includes("7.2") === false,
    "6.1 no measured figure appears in the summary string that goes to the model",
  );
  ok(
    full.summary.includes("Oura") === false,
    "6.2 and no instrument is named in it either",
  );
  ok(
    full.vitals.some((v) => v.value === 47) && full.vitals.some((v) => v.value === 7.2),
    "6.3 the figures live in the structured list instead, where a screen can render them",
  );
  ok(
    VITALS_MAY_REACH_MODEL === false,
    "6.4 the gate is SHUT: Oura's AI clause is unresolved and the default is to withhold",
  );
  ok(
    VITALS_WITHHELD_FROM_MODEL.includes("not sent to you"),
    "6.5 and the model is told the readings are withheld, so it cannot claim ICEFALL is blind",
  );

  /* Determinism: same arguments, same answer. `now` is passed, so nothing here
     reads a clock. */
  ok(
    JSON.stringify(
      assess({ vitals: vitals({ sleep: measured(400, TODAY) }) }),
    ) ===
      JSON.stringify(assess({ vitals: vitals({ sleep: measured(400, TODAY) }) })),
    "6.6 the assessment is deterministic when it is given a clock",
  );
}

/* ========================================================================== */
/* Suite 7 — the resolver hands over the same three states                    */
/* ========================================================================== */

{
  const emptyVitals = (over: Partial<Record<VitalId, Partial<Vital>>>): Vitals => {
    const ids: VitalId[] = [
      "restingHeartRate",
      "sleepMinutes",
      "steps",
      "activeEnergy",
      "hrv",
      "respiratoryRate",
      "spo2",
      "temperatureDeviation",
      "deepSleepMinutes",
      "remSleepMinutes",
      "sleepEfficiency",
      "distance",
      "floors",
      "exerciseMinutes",
    ];
    const out = {} as Vitals;
    for (const id of ids) {
      out[id] = { id, label: id, unit: "", value: null, reason: "not-connected", ...over[id] };
    }
    return out;
  };

  const held = coachVitalInputs(
    emptyVitals({
      restingHeartRate: { reason: "legal-hold" },
      sleepMinutes: { reason: "legal-hold" },
    }),
  );
  ok(
    held.restingHeartRate.value === undefined && held.sleep.value === undefined,
    "7.1 ICEFALL's own legal hold is NO INSTRUMENT, not an instrument that answered with nothing",
  );

  const silent = coachVitalInputs(emptyVitals({ sleepMinutes: { reason: "no-data" } }));
  ok(
    silent.sleep.value === null,
    "7.2 a connected ring that recorded nothing IS an instrument that answered with nothing",
  );
  ok(
    silent.sleep.note === "Your ring did not record this.",
    "7.3 and the source's own sentence survives the narrowing to five coach reasons",
  );

  const stale = coachVitalInputs(
    emptyVitals({ sleepMinutes: { reason: "no-recent-data", measuredOn: FOUR_NIGHTS_AGO } }),
  );
  ok(
    stale.sleep.measuredOn === FOUR_NIGHTS_AGO,
    "7.4 the day of an absent-but-known reading is kept, because it is the useful half",
  );

  const real = coachVitalInputs(
    emptyVitals({
      sleepMinutes: { value: 430, source: "oura", measuredOn: TODAY, reason: undefined },
    }),
  );
  ok(
    real.sleep.value === 430 && real.sleep.source === "oura" && real.sleep.measuredOn === TODAY,
    "7.5 a real reading arrives with its instrument and its day",
  );
}

/* ========================================================================== */

if (failures.length) {
  console.error(`\n${failures.length} FAILED of ${failures.length + passCount}:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  if (proc) proc.exitCode = 1;
} else {
  console.log(`recovery-vitals: ${passCount}/${passCount} passed`);
}
