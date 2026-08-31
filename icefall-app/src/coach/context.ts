import { useMemo } from "react";
import { useApp } from "@/state/AppState";
import { useCoachIntel, type CoachIntel } from "@/coach/hooks";
import { useRecordedActivities, useWeeklyProgress } from "@/tracking/feed";
import { daysUntil } from "@/growth/readinessTest";
import type { CheckIn as CoachCheckIn } from "@/coach/types";
import type { TrainingDay } from "@/types";

/**
 * Everything the Coach knows about this athlete, in one object.
 *
 * WHY THIS EXISTS. The chat used to be handed four things — name, goal, weekly
 * totals and today's session — while nine thousand lines of analysis sat one
 * import away. That produced two failures at once: answers were generic because
 * the coach could not see the athlete, and the chat could contradict the rest of
 * the app because it could not see the decisions the app had already made. The
 * worst case was real: on a day the briefing had downgraded a hard session to
 * rest, the chat would still tell the athlete to "hold the efforts honest".
 *
 * So this joins the two halves that were never joined:
 *
 *   1. WHO THEY TOLD US THEY ARE — the onboarding answers. Experience per
 *      discipline, the equipment they actually own, which days they can train,
 *      how long a session usually is, the technical skills they claim, the
 *      highest altitude they have genuinely reached. None of it is inferred:
 *      `technicalSkills` and `maxAltitudeM` in particular are self-reported and
 *      must never be guessed from activity, because on a glaciated objective a
 *      wrong assumption about someone's crevasse-rescue skill is dangerous.
 *
 *   2. WHAT WE HAVE MEASURED SINCE — training load, recovery, readiness, the
 *      six-week memory, the plan, and the briefing's own ease-off decision.
 *
 * Everything is nullable and honestly absent. A field that has not been supplied
 * is `null`, never a default that reads as a measurement.
 */

export interface AthleteProfileContext {
  firstName: string;
  experience: string;
  disciplines: string[];
  homeBase: string;
  memberSince: string;
  /** Onboarding: discipline id → self-reported level. */
  disciplineExperience: Record<string, string>;
  /** Onboarding: what they can actually train with. Constrains every session. */
  availableEquipment: string[];
  /** Onboarding: 0 = Sunday … 6 = Saturday. */
  trainingDays: number[];
  typicalSessionMin: number;
  /** Self-reported only. Never inferred — see the note above. */
  technicalSkills: string[];
  /** Self-reported highest altitude reached, or null if never given. */
  maxAltitudeM: number | null;
  /** Used for fuelling maths. Null when the athlete never set one. */
  bodyMassKg: number | null;
}

export interface ObjectiveContext {
  name: string;
  elevationM: number | null;
  targetDate: string;
  daysAway: number | null;
  preparationPct: number;
  /** The training block this week belongs to, e.g. "Base 3". */
  block: string | null;
  weekIndex: number | null;
}

export interface TodayContext {
  /** The full prescribed session, so callers keep every field the plan carries. */
  session: TrainingDay | null;
  /** True when the briefing has decided today should be easier than prescribed. */
  easeOff: boolean;
  /** The briefing's own words for what it decided and why. */
  briefingStatus: string;
  briefingTraining: string | null;
  briefingNote: string;
  checkIn: CoachCheckIn | null;
}

export interface RecentActivityContext {
  title: string;
  startedAt: string;
  distanceKm: number;
  elevationGainM: number;
  movingMin: number;
}

export interface WeeklyContext {
  activities: number;
  distanceKm: number;
  elevationM: number;
  timeHours: number;
}

export interface CoachContext {
  athlete: AthleteProfileContext;
  weekly: WeeklyContext;
  objective: ObjectiveContext | null;
  today: TodayContext;
  /** The measured state — load, recovery, readiness, memory. */
  intel: CoachIntel;
  recent: RecentActivityContext[];
  /** True until there is enough recorded for any of this to mean much. */
  cold: boolean;
}

/**
 * Days until a target, tolerant of BOTH shapes the app stores.
 *
 * `daysUntil` takes a "YYYY-MM-DD" key, but goals store a full ISO instant, so
 * calling it directly returned null and the coach said "date not set" for a goal
 * that plainly had one. The instant is converted using its LOCAL calendar day —
 * slicing the UTC string instead would land on the previous day for anyone west
 * of Greenwich, which is the timezone bug this codebase has already fixed
 * several times elsewhere.
 */
function daysUntilLocal(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return daysUntil(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
}

export function useCoachContext(): CoachContext {
  const { user, coachProfile, bodyMassKgSet, todaysCheckIn } = useApp();
  const intel = useCoachIntel();
  const activities = useRecordedActivities();
  const weeklyProgress = useWeeklyProgress();

  return useMemo(() => {
    const real = activities.filter((a) => !a.simulated);

    const athlete: AthleteProfileContext = {
      firstName: user.name.split(" ")[0],
      experience: user.experience,
      disciplines: user.disciplines ?? [],
      homeBase: user.homeBase,
      memberSince: user.memberSince,
      disciplineExperience: coachProfile.disciplineExperience ?? {},
      availableEquipment: coachProfile.availableEquipment ?? [],
      trainingDays: coachProfile.trainingDays ?? [],
      typicalSessionMin: coachProfile.typicalSessionMin,
      technicalSkills: coachProfile.technicalSkills ?? [],
      maxAltitudeM: coachProfile.maxAltitudeM ?? null,
      // `bodyMassKg` falls back to 72 in AppState, so it cannot be told apart
      // from a real answer there. `bodyMassKgSet` is the raw stored value and
      // is null until the athlete gives one.
      //
      // This line used to read the DEFAULTED value and test it with `typeof
      // === "number"`, which is always true — so the null branch never ran and
      // the model was told "Body mass: 72 kg" as a fact about an athlete who
      // had never been asked, then planned nutrition and load against it. The
      // comment above described the defence; nothing implemented it. A guard
      // that reads an already-defaulted value is not a guard.
      bodyMassKg: bodyMassKgSet,
    };

    const objective: ObjectiveContext | null = intel.goal
      ? {
          name: intel.goal.name,
          elevationM: intel.goal.elevationM ?? null,
          targetDate: intel.goal.targetDate,
          daysAway: daysUntilLocal(intel.goal.targetDate),
          preparationPct: intel.goal.preparation,
          block: intel.currentWeek?.block ?? null,
          weekIndex: intel.currentWeek?.index ?? null,
        }
      : null;

    // The briefing already decided whether today should be eased off. Carrying
    // that decision here is what stops the chat contradicting the dashboard.
    const prescribed = intel.today;
    const easedTitle = intel.briefing.training?.title ?? null;
    const easeOff = Boolean(
      prescribed && easedTitle && easedTitle.toLowerCase() !== prescribed.title.toLowerCase(),
    );

    const today: TodayContext = {
      session: prescribed ?? null,
      easeOff,
      briefingStatus: intel.briefing.status,
      briefingTraining: intel.briefing.training
        ? `${intel.briefing.training.title} — ${intel.briefing.training.detail}`
        : null,
      briefingNote: intel.briefing.note,
      checkIn: todaysCheckIn ?? null,
    };

    const recent: RecentActivityContext[] = real
      .slice(0, 8)
      .map((a) => ({
        title: a.title,
        startedAt: a.startedAt,
        distanceKm: a.distanceM / 1000,
        elevationGainM: a.elevationGainM,
        movingMin: Math.round(a.movingSec / 60),
      }));

    const weekly: WeeklyContext = {
      activities: weeklyProgress.activities,
      distanceKm: weeklyProgress.distanceKm,
      elevationM: weeklyProgress.elevationM,
      timeHours: weeklyProgress.timeHours,
    };

    return { athlete, weekly, objective, today, intel, recent, cold: intel.cold };
  }, [user, coachProfile, bodyMassKgSet, todaysCheckIn, intel, activities, weeklyProgress]);
}

/* -------------------------------------------------------------------------- */
/* Serialisation for a language model                                         */
/* -------------------------------------------------------------------------- */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "not given" rather than a guess — the model must be able to tell them apart. */
const or = (v: string | number | null | undefined, fallback = "not given") =>
  v === null || v === undefined || v === "" ? fallback : String(v);

/**
 * The athlete, as prose a model can reason over.
 *
 * Deliberately states ABSENCES out loud. A model handed a profile with silent
 * gaps fills them in confidently; one told "max altitude: not given" asks.
 */
export function describeAthlete(ctx: CoachContext): string {
  const a = ctx.athlete;
  const lines: string[] = [];

  lines.push(`Name: ${a.firstName}`);
  lines.push(`Self-declared experience: ${or(a.experience)}`);
  lines.push(`Disciplines: ${a.disciplines.length ? a.disciplines.join(", ") : "not given"}`);
  lines.push(`Home base: ${or(a.homeBase)}`);

  const de = Object.entries(a.disciplineExperience);
  lines.push(
    `Experience per discipline (self-reported): ${
      de.length ? de.map(([k, v]) => `${k}=${v}`).join(", ") : "not given"
    }`,
  );
  lines.push(
    `Technical skills claimed (self-reported, NEVER inferred): ${
      a.technicalSkills.length ? a.technicalSkills.join(", ") : "none claimed"
    }`,
  );
  lines.push(`Highest altitude actually reached (self-reported): ${or(a.maxAltitudeM, "not given")}${a.maxAltitudeM ? " m" : ""}`);
  lines.push(
    `Equipment available: ${a.availableEquipment.length ? a.availableEquipment.join(", ") : "not given"}`,
  );
  lines.push(
    `Days they can train: ${
      a.trainingDays.length ? a.trainingDays.map((d) => DAY_NAMES[d]).join(", ") : "not given"
    }`,
  );
  lines.push(`Typical session length: ${a.typicalSessionMin} min`);
  lines.push(`Body mass: ${or(a.bodyMassKg, "not set")}${a.bodyMassKg ? " kg" : ""}`);

  return lines.join("\n");
}

/** The measured state — what ICEFALL has observed rather than been told. */
export function describeState(ctx: CoachContext): string {
  const { intel, weekly, objective, today } = ctx;
  const lines: string[] = [];

  if (objective) {
    lines.push(
      `Objective: ${objective.name}${objective.elevationM ? ` (${objective.elevationM} m)` : ""}, ` +
        `${objective.daysAway === null ? "date unknown" : `${objective.daysAway} days away`}, ` +
        `preparation ${objective.preparationPct}%` +
        (objective.block ? `, training block ${objective.block} (week ${objective.weekIndex})` : ""),
    );
  } else {
    lines.push("Objective: none set.");
  }

  lines.push(
    `This week: ${weekly.activities} activities, ${weekly.distanceKm.toFixed(1)} km, ` +
      `${Math.round(weekly.elevationM)} m ascent, ${weekly.timeHours.toFixed(1)} h.`,
  );

  const r = intel.readiness.score.value;
  lines.push(
    r === null
      ? `Readiness: NOT COMPUTABLE today (${intel.readiness.missing.join("; ") || "insufficient data"}). Do not state a readiness number.`
      : `Readiness: ${Math.round(r)}/100. ${intel.readiness.guidance}`,
  );

  lines.push(`Recovery: ${intel.recovery.summary ?? "unknown"}`);
  // acute/chronic are legitimately null until there is enough history. Rounding
  // a null to 0 would report "no training load" as a measurement.
  const acute = intel.load.acute;
  const chronic = intel.load.chronic;
  lines.push(
    acute === null || chronic === null
      ? `Training load: not yet computable (not enough recorded history).`
      : `Training load: acute ${Math.round(acute)}, chronic ${Math.round(chronic)}` +
          (intel.load.ratio !== null ? `, ratio ${intel.load.ratio.toFixed(2)}` : "") +
          (intel.load.caution ? ` — CAUTION: ${intel.load.caution}` : ""),
  );

  if (today.session) {
    lines.push(
      `Prescribed today: ${today.session.title} (focus ${today.session.focus}, difficulty ${today.session.difficulty}/5).`,
    );
  } else {
    lines.push("Prescribed today: nothing — treat as recovery.");
  }

  // The single most important line: the app has already made a call today, and
  // the coach must not contradict it.
  if (today.easeOff) {
    lines.push(
      `IMPORTANT — ICEFALL has ALREADY downgraded today to: ${today.briefingTraining}. ` +
        `Do NOT tell them to train hard today. Reinforce the easier session.`,
    );
  }

  if (today.checkIn) {
    lines.push(`Today's check-in: ${JSON.stringify(today.checkIn)}`);
  } else {
    lines.push("Today's check-in: not done. Recovery is therefore partly unknown.");
  }

  if (intel.memory.facts.length) {
    lines.push(`Known facts: ${intel.memory.facts.join(" ")}`);
  }
  if (ctx.recent.length) {
    lines.push(
      "Recent activities: " +
        ctx.recent
          .slice(0, 5)
          .map(
            (a) =>
              `${a.title} (${a.startedAt.slice(0, 10)}, ${a.distanceKm.toFixed(1)} km, ${a.elevationGainM} m, ${a.movingMin} min)`,
          )
          .join("; "),
    );
  }
  if (ctx.cold) {
    lines.push(
      "COLD START: fewer than 3 real activities recorded. Say plainly that there is not yet enough history, and ask rather than assert.",
    );
  }

  return lines.join("\n");
}

/**
 * The full system prompt.
 *
 * Carries the app's rules as well as the athlete, because a model that does not
 * know ICEFALL's constraints will happily invent a readiness score, clear
 * someone for a summit, or prescribe a hard day the app has already vetoed.
 */
export function systemPromptFor(ctx: CoachContext): string {
  return `You are the ICEFALL Coach, inside a mountaineering training app.

WHO YOU ARE TALKING TO
${describeAthlete(ctx)}

WHAT ICEFALL HAS MEASURED
${describeState(ctx)}

HOW YOU MUST BEHAVE
- Use the data above. Refer to their real sessions, numbers and objective. Never invent a figure.
- If something is "not given" or "not computable", say so and ask — do not estimate it.
- NEVER contradict the prescribed/downgraded session above.
- You are NOT a doctor. Defer anything medical (pain, injury, illness, altitude sickness,
  medication) to a doctor, and say so explicitly.
- You are NOT a guide. Defer route choice, glacier travel, avalanche and technical terrain
  judgement to a certified mountain guide. Never clear anyone as "ready" for a summit.
- Never infer technical skill or altitude experience they did not claim.
- Be concise and specific — a few short paragraphs, no lists of caveats.
- British English, plain and direct. No hype.`;
}
