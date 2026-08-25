import { activityById } from "@/tracking/activities";
import { known, unavailable } from "@/coach/types";
import type { Component, Score, Unavailable } from "@/coach/types";
import type { TrainingLoad } from "@/coach/load";
import type { RecoveryAssessment, RecoveryStatus } from "@/coach/recovery";
import type { RecordedActivity } from "@/tracking/types";
import type { TrainingFocus } from "@/types";

/**
 * ICEFALL Readiness.
 *
 * A planning aid, not a measurement of the body. Readiness says how well today
 * suits a hard session given what ICEFALL can actually see — recorded training,
 * a self-reported check-in, how regularly the athlete has been out, and whether
 * that work resembles what the objective demands. It is NOT a physiological or
 * medical assessment: it does not measure fatigue, fitness, illness, injury or
 * altitude tolerance, and no output here should be read as a clinical claim.
 * Pain, persistent exhaustion or breathlessness belong with a doctor.
 *
 * The whole module exists to avoid the failure mode of every readiness score on
 * the market: quietly averaging over the parts it cannot see. A component with
 * no data is EXCLUDED and the weights renormalise around it. Lose two of the
 * four and the number is withdrawn entirely, because at that point the score
 * would be an opinion about one thing dressed up as a verdict on everything.
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

export interface Readiness {
  /** 0..100, null when too little is known. */
  score: Score;
  components: Component[];
  /** One paragraph explaining the number in plain language. */
  explanation: string;
  /** What today's session should look like given the score. */
  guidance: string;
  /** Labels of components that could not be computed, so the UI can say so. */
  missing: string[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** The consistency and specificity windows. Four clean weeks. */
const WINDOW_DAYS = 28;

/**
 * Same definition of "hard" the rest of Coach uses (see hooks.ts). Kept as a
 * shared threshold rather than a per-module opinion so the chat, the briefing
 * and this score never disagree about when the last hard day was.
 */
const HARD_ASCENT_M = 600;
const HARD_MOVING_SEC = 3 * 3600;

/**
 * Below this much observable history, consistency and specificity are noise:
 * two sessions in a fortnight can look like perfect regularity or none at all
 * depending on which fortnight you catch. Withhold rather than guess.
 */
const MIN_HISTORY_DAYS = 14;
const MIN_WINDOW_SESSIONS = 3;

/**
 * Product heuristics, not physiology. Four training days a week and roughly
 * 1,500 m of weekly ascent describe a serious but ordinary alpine build; they
 * are the point at which a component stops gaining, NOT a target the athlete is
 * told to hit. Nothing above these thresholds scores higher — see points.ts for
 * the same reasoning about why ICEFALL never pays for more.
 */
const FREQUENCY_CEILING_DAYS_PER_WEEK = 4;
const ASCENT_CEILING_M_PER_WEEK = 1500;

/** A gap this short is normal rest; beyond the far end regularity has gone. */
const GAP_FORGIVEN_DAYS = 3;
const GAP_EXHAUSTED_DAYS = 10;

/**
 * Weights across the four components. Training and recovery lead because they
 * describe today; consistency and specificity describe the block behind it.
 */
const WEIGHTS: Record<string, number> = {
  training: 0.3,
  recovery: 0.3,
  consistency: 0.2,
  "goal-alignment": 0.2,
};

/** Fewer than two computable components and the number is not worth printing. */
const MIN_COMPONENTS = 3;

/** Recovery at or below this never gets a hard recommendation. See guidance(). */
const RECOVERY_HOLD_BACK = 45;

const HARD_FOCUS: TrainingFocus[] = ["intervals", "long-mountain"];

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
/** Fraction 0..1 → a Score, via the shared clamp so 0–100 stays the contract. */
const fraction = (n: number): Score => known(clamp01(n) * 100);

function isHard(a: RecordedActivity): boolean {
  return a.elevationGainM >= HARD_ASCENT_M || a.movingSec >= HARD_MOVING_SEC;
}

/** Local calendar date key, so two sessions in one day count as one day out. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoursAgo(iso: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / MS_HOUR);
}

/** "48 hours" / "6 days" — the athlete does not want 132 hours. */
function describeElapsed(hours: number): string {
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/* -------------------------------------------------------------------------- */
/* Component: training                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Is the recent block productive rather than spiking?
 *
 * A ramp that the athlete has built into scores highest; a spike scores lowest,
 * deliberately, because a spike is the pattern this app must never reward. Note
 * the direction of the claim: a low score here means the recent PATTERN OF WORK
 * is unusual against the athlete's own history, not that anything is wrong with
 * the athlete.
 */
function trainingComponent(load: TrainingLoad): Component {
  if (load.trend === "insufficient-data" || load.ratio === null) {
    return {
      id: "training",
      label: "Training load",
      score: unavailable("too-little-history"),
      note: "Not enough recorded training yet to compare this week against your normal pattern.",
    };
  }

  const ratio = load.ratio;
  const ratioText = `Your last 7 days sit at ${ratio.toFixed(2)}× your 28-day average.`;

  switch (load.trend) {
    case "spike":
      return {
        id: "training",
        label: "Training load",
        // Scored low on purpose. The number should make an easy day the obvious
        // choice, never make "hold the spike" look like the winning move.
        score: known(32),
        note: `${ratioText} That is a sharp step up on your own recent pattern, so today is a poor day to add more.`,
      };
    case "ramping":
      return {
        id: "training",
        label: "Training load",
        score: known(84),
        note: `${ratioText} A controlled build — the load is rising at a rate your recent weeks support.`,
      };
    case "steady":
      return {
        id: "training",
        label: "Training load",
        score: known(90),
        note: `${ratioText} Load is level against your base, which is the most productive place to train from.`,
      };
    case "detraining":
      return {
        id: "training",
        label: "Training load",
        score: known(58),
        note: `${ratioText} Volume has dropped away from your base, so treat the return as a rebuild rather than a resumption.`,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Component: recovery                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Recovery is passed straight through. It is deliberately NOT re-derived here:
 * one module owns the self-report, and readiness must not invent a second
 * opinion about it. Recovery is a planning aid built from what the athlete told
 * us, not a measurement of their physiology.
 */
const RECOVERY_PHRASING: Record<RecoveryStatus, string> = {
  good: "Your own check-in reads as good recovery",
  moderate: "Your own check-in reads as partial recovery",
  poor: "Your own check-in reads as poor recovery",
  unknown: "Recovery has not been reported",
};

function recoveryComponent(recovery: RecoveryAssessment): Component {
  if (recovery.score.value === null) {
    return {
      id: "recovery",
      label: "Recovery",
      score: unavailable(recovery.score.reason ?? "not-reported"),
      note: "No check-in logged, so recovery is unknown rather than assumed to be average.",
    };
  }

  // The count of counted inputs travels with the number. A recovery score built
  // from two sliders and one built from five are not the same claim, and the
  // athlete is entitled to see which one is behind today's readiness.
  // Only what the athlete actually reported. The previous count included
  // derived inputs and resting heart rate — which carries zero weight and is
  // never scored — so the note claimed more self-report than existed.
  const counted = recovery.reportedCount;

  return {
    id: "recovery",
    label: "Recovery",
    // Passed through unchanged: one module owns the self-report, and readiness
    // must not invent a second opinion about it.
    score: { value: recovery.score.value },
    note: `${RECOVERY_PHRASING[recovery.status]} — ${recovery.score.value} out of 100 from ${counted} reported input${counted === 1 ? "" : "s"}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Component: consistency                                                      */
/* -------------------------------------------------------------------------- */

interface WindowFacts {
  /** Activities inside the 28-day window, oldest first. */
  window: RecordedActivity[];
  /** Distinct calendar days trained inside the window. */
  activeDays: number;
  /** Longest run of consecutive untrained days inside the observed stretch. */
  longestGapDays: number | null;
  /** Days between the first activity on record and now. */
  historyDays: number | null;
  totalAscentM: number;
  /** Sessions whose activity type is vertical-first, or that climbed properly. */
  specificSessions: number;
  /** Hours since the last session meeting the shared "hard" threshold. */
  lastHardHoursAgo: number | null;
  /** Hours since the most recent session of any kind. */
  lastSessionHoursAgo: number | null;
}

/**
 * One pass over the feed. Everything derived from activities is computed here so
 * the components and the explanation cannot drift apart — the paragraph quotes
 * the same numbers the score was built from.
 */
/**
 * Simulated recordings exist so the tracker can be reviewed indoors. They are
 * badged SIMULATED everywhere they appear, and they must not count as training
 * here either — twelve simulated 900 m days otherwise produced "well placed for
 * a demanding session" off ground that was never covered.
 */
function realOnly<T extends { simulated?: boolean }>(list: T[]): T[] {
  return list.filter((a) => a.simulated !== true);
}

function readWindow(activities: RecordedActivity[], now: Date): WindowFacts {
  const cutoff = now.getTime() - WINDOW_DAYS * MS_DAY;

  const sorted = [...activities].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const window = sorted.filter((a) => new Date(a.startedAt).getTime() >= cutoff);

  const days = [...new Set(window.map((a) => dayKey(a.startedAt)))].sort();

  /**
   * The longest silence, INCLUDING the one still running.
   *
   * The gap before the first recorded session is still excluded — that is a
   * stretch ICEFALL was not watching, and scoring it would punish someone for
   * having joined recently. The gap since the LAST session is the opposite: it
   * is the period ICEFALL was watching and nothing happened, and it is the one
   * that matters most. Leaving it out meant an athlete who trained four days
   * straight and then stopped a fortnight ago kept full regularity marks and was
   * told "longest gap 0 days" — the single most misleading thing this module
   * could say to someone deciding whether they are ready for a mountain.
   */
  let longestGapDays: number | null = null;
  if (days.length >= 1) {
    longestGapDays = 0;
    for (let i = 1; i < days.length; i++) {
      const gap = Math.round((+new Date(days[i]) - +new Date(days[i - 1])) / MS_DAY) - 1;
      if (gap > longestGapDays) longestGapDays = gap;
    }
    // Trailing gap: silent days between the last session and today. Same
    // formula, so "trained yesterday" is 0 silent days, not 1.
    const sinceLast =
      Math.round(
        (+new Date(dayKey(now.toISOString())) - +new Date(days[days.length - 1])) / MS_DAY,
      ) - 1;
    if (sinceLast > longestGapDays) longestGapDays = sinceLast;
  }

  const first = sorted[0];
  const historyDays = first
    ? Math.max(0, (now.getTime() - new Date(first.startedAt).getTime()) / MS_DAY)
    : null;

  let totalAscentM = 0;
  let specificSessions = 0;
  for (const a of window) {
    totalAscentM += a.elevationGainM;
    // "The kind of work a mountain asks for" is either the discipline itself or
    // a session that genuinely climbed. Both count; neither is inferred.
    if (activityById(a.activityTypeId).verticalFocus || a.elevationGainM >= 400) {
      specificSessions++;
    }
  }

  const hard = sorted.filter(isHard);
  const lastHard = hard.length ? hard[hard.length - 1] : null;
  const lastSession = sorted.length ? sorted[sorted.length - 1] : null;

  return {
    window,
    activeDays: days.length,
    longestGapDays,
    historyDays,
    totalAscentM,
    specificSessions,
    lastHardHoursAgo: lastHard ? hoursAgo(lastHard.startedAt, now) : null,
    lastSessionHoursAgo: lastSession ? hoursAgo(lastSession.startedAt, now) : null,
  };
}

/**
 * Frequency and regularity over four weeks — how reliably the athlete trains,
 * not how hard. Regularity matters on a mountain because the body adapts to
 * repetition, and because a build made of bursts is the one that falls apart in
 * the last month before an objective.
 */
function consistencyComponent(facts: WindowFacts): Component {
  const id = "consistency";
  const label = "Consistency";

  if (facts.historyDays === null) {
    return {
      id,
      label,
      score: unavailable("no-data"),
      note: "Nothing recorded yet, so there is no pattern to read.",
    };
  }

  if (facts.historyDays < MIN_HISTORY_DAYS || facts.window.length < MIN_WINDOW_SESSIONS) {
    return {
      id,
      label,
      score: unavailable("too-little-history"),
      note: `${facts.window.length} session${facts.window.length === 1 ? "" : "s"} on record in the last ${WINDOW_DAYS} days — too few to judge a pattern.`,
    };
  }

  const perWeek = facts.activeDays / (WINDOW_DAYS / 7);
  const frequency = clamp01(perWeek / FREQUENCY_CEILING_DAYS_PER_WEEK);

  // Regularity ignores gaps of up to three days: rest is training, and a score
  // that punished rest days would push the athlete to train through them.
  const gap = facts.longestGapDays ?? 0;
  const regularity = clamp01(
    1 - (gap - GAP_FORGIVEN_DAYS) / (GAP_EXHAUSTED_DAYS - GAP_FORGIVEN_DAYS),
  );

  return {
    id,
    label,
    score: fraction(0.6 * frequency + 0.4 * regularity),
    note: `${facts.activeDays} training days in the last ${WINDOW_DAYS} — ${perWeek.toFixed(1)} a week, longest gap ${gap} day${gap === 1 ? "" : "s"}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Component: goal alignment                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Is recent work the KIND of work the objective needs?
 *
 * Scope note, because the distinction is easy to lose: this asks whether the
 * shape of the last four weeks is mountain-specific — vertical, on the right
 * ground — not whether it is SUFFICIENT for a particular route. Sufficiency
 * belongs to computePreparation, which knows the peak; this module only knows
 * the resulting percentage, so it is folded in as a minority term rather than
 * restated as a verdict.
 */
function goalAlignmentComponent(facts: WindowFacts, goalPreparation?: number | null): Component {
  const id = "goal-alignment";
  const label = "Goal alignment";

  if (goalPreparation === null || goalPreparation === undefined) {
    return {
      id,
      label,
      score: unavailable("no-data"),
      note: "No objective set, so there is nothing to align your training against.",
    };
  }

  if (facts.window.length < MIN_WINDOW_SESSIONS) {
    return {
      id,
      label,
      score: unavailable("too-little-history"),
      note: `Only ${facts.window.length} session${facts.window.length === 1 ? "" : "s"} in the last ${WINDOW_DAYS} days — not enough to say what kind of work you have been doing.`,
    };
  }

  const ascentPerWeek = facts.totalAscentM / (WINDOW_DAYS / 7);
  const vertical = clamp01(ascentPerWeek / ASCENT_CEILING_M_PER_WEEK);
  const specificity = clamp01(facts.specificSessions / facts.window.length);

  const shape = 0.55 * vertical + 0.45 * specificity;
  const prepared = clamp01(goalPreparation / 100);

  return {
    id,
    label,
    score: fraction(0.7 * shape + 0.3 * prepared),
    note: `${Math.round(ascentPerWeek).toLocaleString("en-GB")} m of ascent a week, ${facts.specificSessions} of ${facts.window.length} sessions on mountain-specific ground.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Which reason to show when the score itself is withheld. "Too little history"
 * is the most actionable of the set, so it wins; a flat "no data" is the last
 * resort rather than the default.
 */
const REASON_PRIORITY: Unavailable[] = [
  "too-little-history",
  "not-reported",
  "needs-permission",
  "not-connected",
  "no-data",
];

function dominantReason(components: Component[]): Unavailable {
  const reasons = components
    .map((c) => c.score.reason)
    .filter((r): r is Unavailable => r !== undefined);
  for (const candidate of REASON_PRIORITY) {
    if (reasons.includes(candidate)) return candidate;
  }
  return "no-data";
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/** Descriptive, never a verdict on the athlete. */
function band(score: number): string {
  if (score >= 80) return "well placed for a demanding session";
  if (score >= 65) return "in good shape for the session as prescribed";
  if (score >= 50) return "workable, with the intensity kept honest";
  if (score >= 35) return "better suited to easy work today";
  return "pointing firmly towards rest or very easy movement";
}

function joinSentences(parts: (string | null)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(" ");
}

function listLabels(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0].toLowerCase();
  return `${labels
    .slice(0, -1)
    .map((l) => l.toLowerCase())
    .join(", ")} and ${labels[labels.length - 1].toLowerCase()}`;
}

function buildExplanation(
  score: number | null,
  components: Component[],
  missingLabels: string[],
  facts: WindowFacts,
): string {
  const hardLine =
    facts.lastHardHoursAgo === null
      ? facts.lastSessionHoursAgo === null
        ? "Nothing is recorded yet, so there is no session history behind this."
        : `Nothing on record meets ICEFALL's threshold for a hard session; your most recent activity of any kind was ${describeElapsed(facts.lastSessionHoursAgo)}.`
      : `Your last hard session was ${describeElapsed(facts.lastHardHoursAgo)}.`;

  if (score === null) {
    const needed = listLabels(missingLabels);
    return joinSentences([
      `ICEFALL is not putting a number on today: ${missingLabels.length} of the four components cannot be computed — ${needed}.`,
      hardLine,
      "A readiness score built on one or two components would read like a verdict on everything, so it is withheld until there is more to go on.",
    ]);
  }

  const byId = new Map(components.map((c) => [c.id, c]));
  const training = byId.get("training");
  const recovery = byId.get("recovery");
  const consistency = byId.get("consistency");
  const alignment = byId.get("goal-alignment");

  return joinSentences([
    `Readiness is ${score} out of 100 — ${band(score)}.`,
    hardLine,
    training?.score.value !== null ? (training?.note ?? null) : null,
    recovery?.score.value !== null ? (recovery?.note ?? null) : null,
    consistency?.score.value !== null ? (consistency?.note ?? null) : null,
    alignment?.score.value !== null ? (alignment?.note ?? null) : null,
    missingLabels.length
      ? `${missingLabels.join(" and ")} could not be computed, so the number rests on the remaining components rather than an assumed average.`
      : null,
  ]);
}

/**
 * Guidance is ordered by consequence, not by score. The hold-back cases are
 * checked first and each one returns immediately, so there is no arrangement of
 * inputs where a poor recovery report, a load spike or a session finished
 * yesterday can be outvoted into a recommendation to go hard.
 */
function buildGuidance(args: {
  score: number | null;
  missingLabels: string[];
  recovery: RecoveryAssessment;
  trendSpike: boolean;
  facts: WindowFacts;
  plannedFocusToday?: TrainingFocus | null;
}): string {
  const { score, missingLabels, recovery, trendSpike, facts, plannedFocusToday } = args;

  const planned = plannedFocusToday ?? null;
  const plannedHard = planned !== null && HARD_FOCUS.includes(planned);
  const recentHard = facts.lastHardHoursAgo !== null && facts.lastHardHoursAgo < 24;
  const recoveryScore = recovery.score.value;

  // 0. The athlete has reported something that belongs with a professional.
  //    Readiness has no business scoring around it, and no arithmetic below is
  //    allowed to talk past it.
  if (recovery.flagForProfessional) {
    return joinSentences([
      "Have this assessed before you train hard again.",
      recovery.flagReason ?? null,
      "ICEFALL cannot judge symptoms — a doctor or a physiotherapist can. Until then, keep any movement easy and stop at the first sign it makes things worse.",
    ]);
  }

  // 1. Self-reported recovery is poor. Nothing else in this function can
  //    override it — this is the case the whole ordering exists to protect.
  if (
    recovery.status === "poor" ||
    (recoveryScore !== null && recoveryScore <= RECOVERY_HOLD_BACK)
  ) {
    return joinSentences([
      "Keep today easy: conversational effort, flat ground, and stop while it still feels comfortable.",
      plannedHard
        ? "The hard session in the plan is worth moving rather than forcing — a key session done well later beats a poor one today."
        : null,
      "If it still feels heavy after two easy days, take the rest day rather than the deload, and see a doctor about anything painful or persistent.",
    ]);
  }

  // 2. Load has stepped up sharply against the athlete's own recent weeks.
  if (trendSpike) {
    return joinSentences([
      "Hold the volume where it is today. Your last seven days are already well above your own recent pattern, and adding to that is where builds come apart.",
      plannedHard
        ? "Take the prescribed session at the shorter, easier end of what is written, or swap it for recovery movement."
        : "Easy aerobic work or full rest, and pick the build back up next week.",
    ]);
  }

  // 3. A hard day inside the last 24 hours.
  if (recentHard) {
    return joinSentences([
      `Your last hard session finished ${describeElapsed(facts.lastHardHoursAgo ?? 0)}, so today is an easy day.`,
      "Move gently, eat properly and let that work consolidate. Adaptation happens on days like this one.",
    ]);
  }

  // 4. No number to stand on.
  if (score === null) {
    return joinSentences([
      `Train to how you feel today and keep it moderate, because ICEFALL cannot see enough to advise properly — ${listLabels(missingLabels)} ${missingLabels.length === 1 ? "is" : "are"} missing.`,
      "Log a check-in and record your sessions, and the guidance sharpens quickly.",
    ]);
  }

  // 5. Normal cases, from the number.
  if (score >= 75) {
    return joinSentences([
      plannedHard
        ? "The key session can go ahead as written. Warm up properly, hold the efforts honest, and end it if the quality drops rather than grinding out the last repetition."
        : "Today is a good day for the prescribed session, and a good day to add vertical rather than pace if you have the choice.",
      "Judge it on the session, not on the number.",
    ]);
  }

  if (score >= 55) {
    return joinSentences([
      plannedHard
        ? "Take the session as prescribed but at the conservative end — full warm-up, one fewer repetition than written, and stop if the quality goes."
        : "Take the prescribed session as written and keep the easy parts genuinely easy.",
      "Nothing here calls for extra work on top.",
    ]);
  }

  if (score >= 40) {
    return joinSentences([
      "Keep today aerobic and comfortable — time on feet rather than intensity.",
      plannedHard
        ? "Move the hard session to a day when more of this lines up; it is worth more then."
        : "Hold the prescribed session at the easy end of its range.",
    ]);
  }

  return joinSentences([
    "Rest, or thirty minutes of easy movement at most.",
    "Nothing in the next few days depends on training today, and a rest day taken deliberately is the cheapest one you will ever buy.",
  ]);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function computeReadiness(args: {
  load: TrainingLoad;
  recovery: RecoveryAssessment;
  activities: RecordedActivity[];
  /** 0..100 from computePreparation. Null when no objective is set. */
  goalPreparation?: number | null;
  plannedFocusToday?: TrainingFocus | null;
  now?: Date;
}): Readiness {
  const now = args.now ?? new Date();
  const facts = readWindow(realOnly(args.activities), now);

  const components: Component[] = [
    trainingComponent(args.load),
    recoveryComponent(args.recovery),
    consistencyComponent(facts),
    goalAlignmentComponent(facts, args.goalPreparation),
  ];

  const available = components.filter((c) => c.score.value !== null);
  const missing = components.filter((c) => c.score.value === null);
  const missingLabels = missing.map((c) => c.label);

  // Renormalise over what survived. Averaging a missing component in at its
  // mean — the industry default — would let an unknown quantity vote, and vote
  // for "fine". Weights are redistributed proportionally instead.
  let score: Score;
  if (available.length < MIN_COMPONENTS) {
    score = unavailable(dominantReason(missing));
  } else {
    const totalWeight = available.reduce((sum, c) => sum + (WEIGHTS[c.id] ?? 0), 0);
    if (totalWeight <= 0) {
      score = unavailable(dominantReason(missing));
    } else {
      const weighted = available.reduce(
        (sum, c) => sum + (WEIGHTS[c.id] ?? 0) * (c.score.value as number),
        0,
      );
      score = { value: Math.round(Math.max(0, Math.min(100, weighted / totalWeight))) };
    }
  }

  return {
    score,
    components,
    explanation: buildExplanation(score.value, components, missingLabels, facts),
    guidance: buildGuidance({
      score: score.value,
      missingLabels,
      recovery: args.recovery,
      trendSpike: args.load.trend === "spike",
      facts,
      plannedFocusToday: args.plannedFocusToday,
    }),
    missing: missingLabels,
  };
}


/**
 * The one word for a readiness score.
 *
 * CoachHome and ReadinessScreen each had a private copy with the SAME bands and
 * DIFFERENT words — a 55 read "Moderate" on the Today card and "Workable" on
 * the screen it links to, which reads as two different judgements of the same
 * number. One function, so one score is always one word.
 */
export function readinessWord(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Ready";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Easy";
  return "Rest";
}
