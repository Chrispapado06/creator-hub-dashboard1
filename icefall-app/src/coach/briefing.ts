import type { TrainingDay, TrainingFocus } from "@/types";
import type { Readiness } from "@/coach/readiness";
import type { RecoveryAssessment } from "@/coach/recovery";
import type { TrainingLoad } from "@/coach/load";
import type { CoachMemory } from "@/coach/memory";

/**
 * The daily briefing — what the Coach opens with.
 *
 * It composes the other modules rather than computing anything itself, which
 * keeps one rule easy to enforce: when readiness is low or recovery is poor,
 * the briefing must not present a hard session as the plan. A dashboard that
 * cheerfully shows "intervals" on a day the athlete reported bottom-of-scale
 * energy is the exact failure this product cannot have.
 */

export interface Briefing {
  greeting: string;
  /** One line on where the athlete stands today. */
  status: string;
  training: { title: string; detail: string; focus: TrainingFocus } | null;
  recovery: string;
  nutrition: string;
  goalProgress: { name: string; preparation: number; delta?: string } | null;
  /** One specific, derived observation. Never filler. */
  note: string;
}

const HARD_FOCUS: TrainingFocus[] = ["intervals", "long-mountain", "strength"];

/** Low enough that a hard session should be actively discouraged. */
const LOW_READINESS = 50;

function greetingFor(now: Date, firstName: string): string {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${firstName}.`;
}

export function buildBriefing(args: {
  firstName: string;
  now?: Date;
  readiness: Readiness;
  recovery: RecoveryAssessment;
  load: TrainingLoad;
  today?: TrainingDay | null;
  goal?: { name: string; preparation: number } | null;
  memory?: CoachMemory;
}): Briefing {
  const now = args.now ?? new Date();
  const { readiness, recovery, load, memory } = args;

  const score = readiness.score.value;
  const plannedFocus = args.today?.focus ?? null;
  const plannedHard = plannedFocus !== null && HARD_FOCUS.includes(plannedFocus);

  // Any of these means today should be easier than the plan says.
  const easeOff =
    recovery.status === "poor" ||
    load.trend === "spike" ||
    (score !== null && score < LOW_READINESS);

  /* ---- Status ------------------------------------------------------------ */

  let status: string;
  if (easeOff) {
    status = "Recovery recommended today.";
  } else if (score === null) {
    status = "Not enough recorded yet to judge today — train to how you feel.";
  } else if (score >= 80) {
    status = "You're ready for a demanding session.";
  } else if (score >= 65) {
    status = "You're ready for a moderate training day.";
  } else {
    status = "Keep today controlled.";
  }

  /* ---- Training ---------------------------------------------------------- */

  let training: Briefing["training"] = null;
  if (args.today) {
    if (easeOff && plannedHard) {
      // Do not surface the prescribed hard session as today's plan. Say what
      // changed and why, so the athlete isn't left wondering where it went.
      training = {
        title: "Easy session or rest",
        detail: `Your plan has ${args.today.title.toLowerCase()} today. Given ${reasonForEasing(recovery, load, score)}, hold the intensity down — the session keeps its value later in the week.`,
        focus: "recovery",
      };
    } else {
      training = {
        title: args.today.title,
        detail: args.today.detail ?? readiness.guidance,
        focus: args.today.focus,
      };
    }
  } else if (easeOff) {
    training = {
      title: "Recovery",
      detail: "Nothing scheduled, and today isn't the day to add something hard.",
      focus: "recovery",
    };
  }

  /* ---- Recovery + nutrition --------------------------------------------- */

  const recoveryLine =
    recovery.status === "unknown"
      ? "Not reported today. A check-in takes a few seconds and sharpens everything else here."
      : recovery.summary;

  const nutrition = nutritionLine(training?.focus ?? null, args.today?.durationMin);

  /* ---- Note -------------------------------------------------------------- */

  const note = buildNote({ memory, load, readiness, easeOff });

  return {
    greeting: greetingFor(now, args.firstName),
    status,
    training,
    recovery: recoveryLine,
    nutrition,
    goalProgress: args.goal
      ? { name: args.goal.name, preparation: Math.round(args.goal.preparation) }
      : null,
    note,
  };
}

function reasonForEasing(
  recovery: RecoveryAssessment,
  load: TrainingLoad,
  score: number | null,
): string {
  if (recovery.status === "poor") return "what you reported this morning";
  if (load.trend === "spike") return "how far your last week sits above your normal pattern";
  if (score !== null && score < LOW_READINESS) return "where your readiness sits";
  return "the last few days";
}

function nutritionLine(focus: TrainingFocus | null, durationMin?: number): string {
  if (focus === "rest" || focus === null) {
    return "Nothing special needed today. Eat normally and keep fluids up.";
  }
  if (focus === "recovery") {
    return "Protein across the day matters more than carbohydrate timing on an easy day.";
  }
  if ((durationMin ?? 0) >= 150 || focus === "long-mountain") {
    return "Long day: carbohydrate before, and something every 45 minutes once you're moving.";
  }
  return "Prioritise carbohydrate around today's session, and drink to thirst.";
}

function buildNote(args: {
  memory?: CoachMemory;
  load: TrainingLoad;
  readiness: Readiness;
  easeOff: boolean;
}): string {
  const { memory, load, readiness, easeOff } = args;

  // A caution outranks an observation — if there is something to flag, that is
  // the note, not a compliment about last month's volume.
  if (load.caution) return load.caution;

  const moving = memory?.trends.find(
    (t) => t.direction === "improving" || t.direction === "declining",
  );
  if (moving) {
    const tail = easeOff
      ? " Today isn't the day to add to it."
      : " Hold that shape rather than adding intensity on top of it.";
    return `${moving.label}: ${moving.detail}${tail}`;
  }

  if (readiness.missing.length > 0) {
    return `Readiness is missing ${readiness.missing.join(" and ")}. Fill that in and the daily recommendation gets considerably sharper.`;
  }

  if (memory?.facts.length) return memory.facts[0];

  return "Record a few sessions and this becomes specific to you rather than generic.";
}
