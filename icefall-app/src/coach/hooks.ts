import { useMemo } from "react";
import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { useTraining } from "@/tracking/training";
import { computeTrainingLoad, type TrainingLoad } from "@/coach/load";
import { assessRecovery, type RecoveryAssessment } from "@/coach/recovery";
import { computeReadiness, type Readiness } from "@/coach/readiness";
import { buildMemory, type CoachMemory } from "@/coach/memory";
import { buildBriefing, type Briefing } from "@/coach/briefing";
import type { TrainingDay, TrainingPlan, TrainingWeek } from "@/types";

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
  const activities = useRecordedActivities();
  const training = useTraining();

  return useMemo(() => {
    // The Coach reasons only about ground actually covered. Simulated recordings
    // exist so the tracker can be reviewed indoors; they are badged SIMULATED in
    // the feed and must not become training the athlete never did. Filtering
    // once here keeps load, readiness, memory and the briefing consistent —
    // mountainReadiness already drops them independently.
    const real = activities.filter((a) => !a.simulated);
    const load = computeTrainingLoad(real);

    // Resting heart rate and sleep would come from the Health bridge. No browser
    // exposes them, so they are explicitly absent rather than filled in — see
    // src/tracking/sources/health.ts for the same convention.
    const recovery = assessRecovery({
      checkIn: todaysCheckIn,
      // undefined, not null: null claims the source was consulted and had no
      // data for last night, which reads to the athlete as "you failed to log
      // it". There is no source at all — no browser exposes either metric.
      restingHeartRateBpm: undefined,
      sleepMinutes: undefined,
      recentLoad: { acute: load.acute, chronic: load.chronic },
      hardSessionHoursAgo: hoursSinceHardSession(real),
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
  }, [activities, todaysCheckIn, training, user.name, goals]);
}

/**
 * Hours since the last genuinely demanding session, which is the single biggest
 * driver of whether today should be hard. Returns null rather than a large
 * number when nothing qualifying has been recorded — "no hard session on
 * record" and "the last hard session was three weeks ago" are different claims.
 */
function hoursSinceHardSession(
  activities: { startedAt: string; elevationGainM: number; movingSec: number }[],
): number | null {
  const hard = activities.filter((a) => a.elevationGainM >= 600 || a.movingSec >= 3 * 3600);
  if (hard.length === 0) return null;

  const latest = hard.reduce((acc, a) => (a.startedAt > acc.startedAt ? a : acc), hard[0]);
  const ms = Date.now() - new Date(latest.startedAt).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}
