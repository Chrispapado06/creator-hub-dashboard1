import { useMemo } from "react";
import { useDayKey } from "@/lib/useDayKey";
import { fmtDateShort } from "@/lib/format";
import { parseBlockLabel, type BlockKind } from "@/tracking/training";
import { useTraining } from "@/tracking/training";
import type { TrainingDay, TrainingPlan, TrainingWeek } from "@/types";

/**
 * THE ONE SOURCE OF TRUTH FOR EVERY COUNT, WEEK, PERCENTAGE AND DAY TOTAL
 * THE COACH SECTION PRINTS — brief `coach-1to1-spec.md` §4.2.
 *
 * Hub, Plan → Schedule and Plan → Progress must all read this hook rather
 * than compute their own arithmetic over `useTraining()`'s plan. That is the
 * actual fix for the mockup's self-contradicting numbers (45% vs 13/243,
 * "Base · Complete" while still in week 12, 106+136 ≠ 242): those conflicts
 * only exist because the mockup's three screens each did their own sum. One
 * function doing it once cannot disagree with itself.
 *
 * NOTHING HERE IS INVENTED. Every field comes from `useTraining()`, which is
 * itself the plan generator (`tracking/training.ts`) plus the athlete's own
 * adjustments and completions. A goal-less athlete gets `null` back, and a
 * screen must render its own "no objective" state rather than pass a
 * fabricated number through.
 */

/* -------------------------------------------------------------------------- */
/* Dates — local-calendar, never through `Date#toISOString`                   */
/* -------------------------------------------------------------------------- */

/**
 * `TrainingDay.date` / `TrainingWeek.startDate` are local-calendar
 * `YYYY-MM-DD` strings (`isoDate()` in `data/mock/clock.ts`). Parsing one with
 * `new Date(iso)` reads it as UTC midnight, which is the previous day in any
 * negative UTC offset — the exact bug `coach/shell.tsx`'s `daysUntil` was
 * written to avoid. This does the same local construction.
 */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(iso: string, n: number): string {
  const d = localDate(iso);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "14–20 Sep" for a week starting `startIso`, "28 Sep – 4 Oct" across months. */
export function weekRangeLabel(startIso: string): string {
  const endIso = addDays(startIso, 6);
  const start = localDate(startIso);
  const end = localDate(endIso);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = sameMonth ? String(start.getDate()) : fmtDateShort(startIso).replace(",", "");
  return `${startLabel}–${fmtDateShort(endIso)}`;
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

export type PhaseStatus = "complete" | "in-progress" | "not-started";

export const PHASE_LABEL: Record<BlockKind, string> = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
};

export interface PlanPhase {
  kind: BlockKind;
  /** "Base", "Build", "Peak", "Taper" — the app's own phase names.
   *  NOT the mockup's "Expedition": the plan generator (`tracking/training.ts`
   *  `BLOCK_PREFIX`) never produces that name, and inventing a fifth phase
   *  name the data does not carry would be exactly the kind of fabricated
   *  number §4.2 forbids. */
  label: string;
  weekStart: number;
  weekEnd: number;
  /** ISO date the phase's first week begins. */
  startDate: string;
  /** ISO date the phase's last week ends (its `startDate` + 6 days). */
  endDate: string;
  status: PhaseStatus;
}

/**
 * Groups `plan.weeks` into consecutive runs of the same phase. Week ranges
 * come from wherever the generator actually put the boundary for THIS plan's
 * length, not a fixed 1–12/13–28/29–40/41–46 table — a 30-week plan and a
 * 52-week plan split their four phases at different weeks, and only the
 * generator's own `blockFor` (read back through `parseBlockLabel`) knows
 * where.
 */
function derivePhases(plan: TrainingPlan, todayKey: string): PlanPhase[] {
  const phases: PlanPhase[] = [];
  for (const week of plan.weeks) {
    const parsed = parseBlockLabel(week.block);
    // A week whose block string this parser cannot read (should not happen
    // for a generated plan) is skipped rather than guessed into a phase.
    if (!parsed) continue;
    const last = phases[phases.length - 1];
    if (last && last.kind === parsed.kind) {
      last.weekEnd = week.index;
      last.endDate = addDays(week.startDate, 6);
    } else {
      phases.push({
        kind: parsed.kind,
        label: PHASE_LABEL[parsed.kind],
        weekStart: week.index,
        weekEnd: week.index,
        startDate: week.startDate,
        endDate: addDays(week.startDate, 6),
        status: "not-started",
      });
    }
  }

  for (const phase of phases) {
    // A phase is "Complete" only once its LAST week has actually ended —
    // being in week 12 of a Base phase that runs to week 12 is "in progress",
    // never "Complete", however close the week count looks.
    if (todayKey > phase.endDate) phase.status = "complete";
    else if (todayKey >= phase.startDate) phase.status = "in-progress";
    else phase.status = "not-started";
  }
  return phases;
}

/* -------------------------------------------------------------------------- */
/* Sessions — prescribed vs completed, never a "readiness" figure             */
/* -------------------------------------------------------------------------- */

function isPrescribed(day: TrainingDay): boolean {
  return day.focus !== "rest";
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

export interface CoachPlanSummary {
  plan: TrainingPlan;
  totalWeeks: number;
  totalDays: number;

  currentWeek: TrainingWeek;
  /** "14–20 Sep". */
  currentWeekRangeLabel: string;
  /** Parsed from `currentWeek.block` — never re-derived per screen. */
  currentPhaseKind: BlockKind;
  /** "Base", "Build", "Peak", "Taper". */
  currentPhaseLabel: string;
  isDeloadWeek: boolean;

  /** Calendar days into the whole plan, clamped to [0, totalDays]. */
  daysCompleted: number;
  /** `totalDays - daysCompleted`. The two always sum to `totalDays` exactly —
   *  the mockup's own "106 + 136 ≠ 242" is a bug this construction cannot
   *  reproduce. */
  daysRemaining: number;

  /** This week only — the Hub's "1 of 6 sessions" / progress segments. */
  thisWeek: {
    prescribed: number;
    completed: number;
    remaining: number;
  };

  /** The whole plan, non-rest days only. */
  sessions: {
    /** Prescribed sessions whose date has arrived (today inclusive). */
    prescribedToDate: number;
    /** Of those, how many are marked done. */
    completedToDate: number;
    /**
     * `completedToDate / prescribedToDate`, rounded, or 0 with nothing
     * prescribed yet. Label this EXACTLY as the brief's §4.2 requires:
     * "of prescribed sessions — not a readiness figure". It is a plain
     * completion ratio with no confidence discount — `useCoachIntel().readiness`
     * is the separate, actual readiness figure, and the two must never be
     * printed as if they were the same number.
     */
    percentOfPrescribed: number;
    /** Prescribed sessions across the ENTIRE plan, past and future. */
    prescribedTotal: number;
    /** `prescribedTotal - completedToDate` — sessions still to come. */
    remainingTotal: number;
  };

  today: TrainingDay | undefined;
  todayCompleted: boolean;

  phases: PlanPhase[];
}

export function useCoachPlanSummary(): CoachPlanSummary | null {
  const { plan, currentWeek, completedByDate } = useTraining();
  const todayKey = useDayKey();

  return useMemo(() => {
    if (!plan || !currentWeek) return null;

    const totalDays = plan.totalWeeks * 7;
    const planStart = plan.weeks[0]?.startDate ?? currentWeek.startDate;
    const elapsedDays = Math.floor(
      (localDate(todayKey).getTime() - localDate(planStart).getTime()) / 86_400_000,
    );
    const daysCompleted = Math.max(0, Math.min(totalDays, elapsedDays));
    const daysRemaining = totalDays - daysCompleted;

    const parsedCurrent = parseBlockLabel(currentWeek.block);

    const thisWeekDays = currentWeek.days.filter(isPrescribed);
    const thisWeekCompleted = thisWeekDays.filter(
      (d) => completedByDate.get(d.date) ?? d.completed,
    ).length;

    let prescribedTotal = 0;
    let prescribedToDate = 0;
    let completedToDate = 0;
    for (const week of plan.weeks) {
      for (const day of week.days) {
        if (!isPrescribed(day)) continue;
        prescribedTotal++;
        if (day.date <= todayKey) {
          prescribedToDate++;
          if (completedByDate.get(day.date) ?? day.completed) completedToDate++;
        }
      }
    }
    const percentOfPrescribed =
      prescribedToDate > 0 ? Math.round((completedToDate / prescribedToDate) * 100) : 0;

    const today = plan.weeks.flatMap((w) => w.days).find((d) => d.date === todayKey);

    return {
      plan,
      totalWeeks: plan.totalWeeks,
      totalDays,

      currentWeek,
      currentWeekRangeLabel: weekRangeLabel(currentWeek.startDate),
      currentPhaseKind: parsedCurrent?.kind ?? "base",
      currentPhaseLabel: parsedCurrent ? PHASE_LABEL[parsedCurrent.kind] : "Base",
      isDeloadWeek: parsedCurrent?.deload ?? false,

      daysCompleted,
      daysRemaining,

      thisWeek: {
        prescribed: thisWeekDays.length,
        completed: thisWeekCompleted,
        remaining: thisWeekDays.length - thisWeekCompleted,
      },

      sessions: {
        prescribedToDate,
        completedToDate,
        percentOfPrescribed,
        prescribedTotal,
        remainingTotal: prescribedTotal - completedToDate,
      },

      today,
      todayCompleted: today ? (completedByDate.get(today.date) ?? today.completed) : false,

      phases: derivePhases(plan, todayKey),
    };
  }, [plan, currentWeek, completedByDate, todayKey]);
}
