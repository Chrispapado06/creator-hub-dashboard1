import type { Difficulty, TrainingDay, TrainingFocus, TrainingPlan, TrainingWeek } from "@/types";
import { isoDate, startOfWeek } from "./clock";

/**
 * A 32-week periodised build toward Mont Blanc, generated rather than hand
 * written so the plan always sits correctly around today's date and adapts if
 * the target moves. Blocks follow a conventional base → build → peak → taper.
 */

const TOTAL_WEEKS = 32;
const CURRENT_WEEK = 12;

interface DayTemplate {
  focus: TrainingFocus;
  title: string;
  detail?: string;
  difficulty: Difficulty;
  distanceKm?: number;
  elevationM?: number;
  durationMin?: number;
}

/** Monday-first week shape. Volume scales by block. */
function weekTemplate(block: string, load: number): DayTemplate[] {
  const s = (n: number) => Math.round(n * load);
  return [
    {
      focus: "recovery",
      title: "Recovery",
      detail: "Easy movement, mobility, 30 min",
      difficulty: 1,
      durationMin: 30,
    },
    {
      focus: "endurance",
      title: "Endurance Run",
      detail: "Steady and conversational throughout",
      difficulty: 2,
      distanceKm: s(12),
      elevationM: s(420),
      durationMin: s(75),
    },
    {
      focus: "strength",
      title: "Strength — Lower Body",
      detail: "Split squats, step-ups, calf raises, core",
      difficulty: 3,
      durationMin: s(60),
    },
    { focus: "rest", title: "Rest", detail: "Full rest. Adaptation happens here.", difficulty: 1 },
    {
      focus: block.startsWith("Peak") ? "intervals" : "technical",
      title: block.startsWith("Peak") ? "Uphill Intervals" : "Technical Session",
      detail: block.startsWith("Peak")
        ? "6 × 4 min hard uphill, 3 min easy"
        : "Crampon and axe work, rope systems",
      difficulty: 4,
      durationMin: s(70),
    },
    {
      focus: "long-mountain",
      title: "Long Mountain Session",
      detail: "Sustained vertical with a loaded pack",
      difficulty: 4,
      distanceKm: s(18),
      elevationM: s(1200),
      durationMin: s(300),
    },
    {
      focus: "recovery",
      title: "Recovery Walk",
      detail: "Flat, conversational pace",
      difficulty: 1,
      distanceKm: s(6),
      durationMin: s(60),
    },
  ];
}

function blockFor(week: number): { name: string; load: number } {
  if (week <= 8) return { name: `Base ${Math.ceil(week / 3)}`, load: 0.8 };
  if (week <= 20) return { name: `Build ${Math.ceil((week - 8) / 4)}`, load: 1 };
  if (week <= 28) return { name: `Peak ${Math.ceil((week - 20) / 4)}`, load: 1.25 };
  return { name: "Taper", load: 0.6 };
}

function buildWeeks(): TrainingWeek[] {
  // Anchor so that CURRENT_WEEK is the week containing today.
  const thisMonday = startOfWeek();
  const weeks: TrainingWeek[] = [];

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const offset = w - CURRENT_WEEK;
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() + offset * 7);

    const { name, load } = blockFor(w);
    // Every fourth week is a deload — a real plan is not monotonic.
    const isDeload = w % 4 === 0 && w < 29;
    const tpl = weekTemplate(name, isDeload ? load * 0.65 : load);

    const days: TrainingDay[] = tpl.map((d, i) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);
      const past = date.getTime() < Date.now();
      return {
        date: isoDate(date),
        focus: d.focus,
        title: d.title,
        detail: d.detail,
        distanceKm: d.distanceKm,
        elevationM: d.elevationM,
        durationMin: d.durationMin,
        difficulty: d.difficulty,
        // Past sessions are mostly done; a couple of misses keeps it honest.
        completed: past && d.focus !== "rest" && (w + i) % 9 !== 0,
      };
    });

    weeks.push({
      index: w,
      block: isDeload ? `${name} · deload` : name,
      startDate: isoDate(monday),
      days,
    });
  }

  return weeks;
}

export const TRAINING_PLAN: TrainingPlan = {
  id: "plan-mont-blanc",
  goalId: "goal-mont-blanc",
  title: "Mont Blanc — 8 Months",
  totalWeeks: TOTAL_WEEKS,
  currentWeek: CURRENT_WEEK,
  weeks: buildWeeks(),
};

export const currentWeek = () =>
  TRAINING_PLAN.weeks.find((w) => w.index === TRAINING_PLAN.currentWeek) ?? TRAINING_PLAN.weeks[0];

/** Today's prescribed session, used by the dashboard's TODAY'S PLAN card. */
export function todaysSession(): TrainingDay | undefined {
  const today = isoDate(new Date());
  for (const w of TRAINING_PLAN.weeks) {
    const hit = w.days.find((d) => d.date === today);
    if (hit) return hit;
  }
  return undefined;
}
