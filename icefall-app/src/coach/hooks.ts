import { useMemo } from "react";
import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { useDebriefs } from "@/tracking/debrief";
import { debriefSignals } from "@/tracking/debriefEffects";
import { useTraining } from "@/tracking/training";
import { useVitals } from "@/tracking/sources/useOura";
import { coachVitalInputs } from "@/tracking/sources/vitals";
import { computeTrainingLoad, type TrainingLoad } from "@/coach/load";
import { assessRecovery, type RecoveryAssessment } from "@/coach/recovery";
import { computeReadiness, type Readiness } from "@/coach/readiness";
import { buildMemory, type CoachMemory } from "@/coach/memory";
import { buildBriefing, type Briefing } from "@/coach/briefing";
import type { TrainingDay, TrainingPlan, TrainingWeek } from "@/types";
import { useDayKey } from "@/lib/useDayKey";

/**
 * The Coach's view of the athlete.
 *
 * Every screen in Coach reads from this one hook, so the readiness number on
 * the dashboard, the number in the chat and the number behind an adapted
 * session are the same number computed once. The pure modules underneath hold
 * all the logic; this is only the wiring.
 *
 * Note what is NOT here: nothing is invented to fill a gap. If the athlete has
 * not checked in, recovery reports "unknown" and readiness drops a component
 * rather than assuming an average day.
 */
export interface CoachIntel {
  firstName: string;
  load: TrainingLoad;
  recovery: RecoveryAssessment;
  readiness: Readiness;
  memory: CoachMemory;
  briefing: Briefing;
  plan: TrainingPlan | null;
  currentWeek: TrainingWeek | null;
  today?: TrainingDay;
  goal?: {
    id: string;
    name: string;
    preparation: number;
    elevationM?: number;
    targetDate: string;
    /**
     * Whether a human-written ICEFALL record backs this objective. False for
     * a reference entry — every coach surface that prints the plan for one
     * must say it is a general altitude programme (`REFERENCE_PLAN_NOTE`),
     * and none may print a grade or a readiness judgement for it.
     */
    surveyed: boolean;
  };
  /** True until the athlete has recorded enough for any of this to mean much. */
  cold: boolean;
}

export function useCoachIntel(): CoachIntel {
  const { user, todaysCheckIn, goals } = useApp();
  const day = useDayKey();
  const activities = useRecordedActivities();
  const training = useTraining();
  /* The post-activity debriefs. Read here rather than inside `assessRecovery`
     so the recovery model keeps taking plain arguments and stays testable
     without a store — the same reason `checkIn` is passed in. */
  const debriefs = useDebriefs();
  /* WHAT A RING OR A PHONE STORE MEASURED.
     `useVitals` is the resolver's hook, not Oura's: it asks every connected
     source, applies the fixed per-metric precedence in
     `tracking/sources/vitals.ts`, and attaches the winning instrument's name to
     each number. Read here, in the one hook every coach screen goes through, so
     the sleep behind the recovery score on the dashboard and the sleep behind
     the number in the chat are the same reading from the same instrument. */
  const { vitals } = useVitals();

  return useMemo(() => {
    // The Coach reasons only about ground actually covered. Simulated recordings
    // exist so the tracker can be reviewed indoors; they are badged SIMULATED in
    // the feed and must not become training the athlete never did. Filtering
    // once here keeps load, readiness, memory and the briefing consistent —
    // mountainReadiness already drops them independently.
    const real = activities.filter((a) => !a.simulated);
    const load = computeTrainingLoad(real);

    /*
      SLEEP AND RESTING HEART RATE NOW REACH RECOVERY.

      They used to be hard-coded `undefined` here with a comment explaining that
      no browser exposes either metric. That was true of the browser and was
      never the whole picture: `tracking/sources/vitals.ts` resolves both from
      an Oura ring and from Apple Health or Health Connect, and it already knew
      how to tell "no instrument is connected" from "an instrument answered with
      nothing". `coachVitalInputs` existed to hand that answer to this function
      and nothing had ever called it.

      The three-state distinction the old comment defended is not lost — it is
      now carried by the source rather than asserted here, which is stronger:
      `undefined` still means no instrument, `null` still means an instrument
      with nothing, and a number now arrives with the instrument's name and the
      day that instrument attributes it to. A ring that sat on a charger and a
      person who has no ring get different sentences, and neither gets a default.
    */
    const recovery = assessRecovery({
      checkIn: todaysCheckIn,
      vitals: coachVitalInputs(vitals),
      recentLoad: { acute: load.acute, chronic: load.chronic },
      hardSessionHoursAgo: hoursSinceHardSession(
        real,
        debriefSignals(debriefs).hardSessionHoursAgo,
      ),
    });

    const goal = training.goal
      ? {
          id: training.goal.id,
          name: training.goal.name,
          preparation: training.preparation?.percent ?? training.goal.preparation,
          elevationM: training.goal.elevationM,
          targetDate: training.goal.targetDate,
          surveyed: training.mountain !== undefined,
        }
      : undefined;

    const readiness = computeReadiness({
      load,
      recovery,
      activities: real,
      goalPreparation: goal?.preparation ?? null,
      plannedFocusToday: training.today?.focus ?? null,
    });

    const memory = buildMemory({
      activities: real,
      goals: goals.map((g) => ({ name: g.name, status: g.status, elevationM: g.elevationM })),
    });

    const briefing = buildBriefing({
      firstName: user.name.split(" ")[0],
      readiness,
      recovery,
      load,
      today: training.today ?? null,
      goal: goal ? { name: goal.name, preparation: goal.preparation } : null,
      memory,
    });

    return {
      firstName: user.name.split(" ")[0],
      load,
      recovery,
      readiness,
      memory,
      briefing,
      plan: training.plan,
      currentWeek: training.currentWeek,
      today: training.today,
      goal,
      cold: real.length < 3,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `day`: load and recovery are "as of today"
  }, [activities, todaysCheckIn, training, user.name, goals, debriefs, vitals, day]);
}

/**
 * Hours since the last genuinely demanding session, which is the single biggest
 * driver of whether today should be hard. Returns null rather than a large
 * number when nothing qualifying has been recorded — "no hard session on
 * record" and "the last hard session was three weeks ago" are different claims.
 *
 * TWO WAYS A SESSION COUNTS AS HARD, and the second one is new.
 *
 * The filter below is a PROXY: 600 m of ascent, or three hours moving. It is a
 * reasonable proxy and it is blind in one specific direction — it cannot see a
 * forty-minute session that emptied somebody. Hill reps, a heavy leg day, a
 * session done ill: all of them are under both thresholds, all of them leave a
 * body that should not be asked for another hard day tomorrow, and until now
 * recovery had no way of knowing any of it happened.
 *
 * `reportedHoursAgo` is the athlete's own answer to that, from the
 * post-activity debrief — a session they rated at or above `HARD_EFFORT`. It is
 * SELF-REPORTED, and the recovery model already keeps self-reported inputs
 * apart from derived ones (`reportedCount`, `SELF_REPORTED_INPUTS`), which is
 * where that distinction is preserved.
 *
 * The two are combined by taking the MORE RECENT, never by averaging. Both are
 * claims that a hard session happened; the question being answered is how long
 * ago the last one was, and the later of two events is the answer to that
 * whichever way it was established.
 */
function hoursSinceHardSession(
  activities: { startedAt: string; elevationGainM: number; movingSec: number }[],
  reportedHoursAgo: number | null = null,
): number | null {
  const hard = activities.filter((a) => a.elevationGainM >= 600 || a.movingSec >= 3 * 3600);
  if (hard.length === 0) return reportedHoursAgo;

  const latest = hard.reduce((acc, a) => (a.startedAt > acc.startedAt ? a : acc), hard[0]);
  const ms = Date.now() - new Date(latest.startedAt).getTime();
  const derived = ms > 0 ? ms / 3_600_000 : 0;
  return reportedHoursAgo === null ? derived : Math.min(derived, reportedHoursAgo);
}
