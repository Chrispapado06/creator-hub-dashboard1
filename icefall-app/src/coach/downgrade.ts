import type { Readiness } from "@/coach/readiness";
import type { RecoveryAssessment } from "@/coach/recovery";
import type { TrainingLoad } from "@/coach/load";

/**
 * HAS TODAY BEEN DOWNGRADED? — ONE DEFINITION, READ BY EVERYTHING THAT ACTS.
 *
 * ============================================================================
 * WHY THIS IS ITS OWN FILE
 * ============================================================================
 *
 * The decision already existed. `buildBriefing` computed it inline as `easeOff`
 * and used it to replace a prescribed hard session with "Easy session or rest"
 * on the dashboard, and `services/coach.ts` reads the result so the chat cannot
 * prescribe intervals on a day the dashboard has already taken away.
 *
 * Phase 2 gives a model tools that rearrange the plan, and one of those tools
 * can put a hard session on today. The rule the roadmap makes absolute — a day
 * readiness or recovery has downgraded can never be made harder, not by the
 * model, not by a tool, not by the athlete tapping through a confirmation —
 * therefore needs the same fact the briefing already has.
 *
 * A SECOND COPY OF THAT PREDICATE WOULD BE THE BUG. The dashboard would say
 * "recovery recommended today" while the guard let a long mountain day land on
 * it, and both would be reading something they each called the truth. So the
 * expression moved out of `buildBriefing` into here, and `buildBriefing` now
 * calls this. There is one definition. If it is ever tuned, it is tuned once.
 *
 * ============================================================================
 * WHAT IT COVERS, AND WHAT IT HONESTLY DOES NOT
 * ============================================================================
 *
 * READINESS AND RECOVERY ARE TODAY NUMBERS. `computeReadiness` scores the state
 * the athlete is in now, from a load curve that ends now and a check-in taken
 * this morning; `assessRecovery` reads that check-in directly. Neither computes
 * a figure for next Thursday, and nothing in ICEFALL does.
 *
 * So this assessment is about ONE DAY — today — and the guard that uses it says
 * so. A change that makes NEXT Thursday harder is not refused here, because
 * there is no measurement of next Thursday to refuse it with, and refusing on a
 * number nobody computed would be a different kind of dishonesty. What the
 * guard does instead is compare the plan's TODAY before and after every change,
 * whatever the change was aimed at — which catches the real vector, a hard
 * session being moved onto a day the athlete has been told to take easy.
 *
 * ============================================================================
 * THE THREE SIGNALS
 * ============================================================================
 *
 * All three are the briefing's, unchanged:
 *
 *   · RECOVERY POOR — what the athlete reported this morning. Self-reported,
 *     and it stays labelled as such in the reason.
 *   · LOAD SPIKE — the last week sits well above the established pattern.
 *     Derived from recorded activity only.
 *   · READINESS UNDER 50 — the composite, and only when it HAS a value.
 *     `score.value === null` means ICEFALL withheld the number; a withheld
 *     number is not a low one and must not be treated as one.
 *
 * Any one of them is enough. They are ORed rather than weighted because this is
 * not a score — it is a veto, and a veto that needed two reasons would let the
 * single strongest one through.
 */

/** How low the composite has to sit before today counts as downgraded. */
const LOW_READINESS = 50;

export interface DayDowngrade {
  /** True when today should be easier than the plan says. */
  downgraded: boolean;
  /**
   * Every signal that fired, in the app's own words and naming the real value.
   *
   * PLURAL ON PURPOSE. A refusal that says "your readiness is 38 out of 100"
   * can be checked by the athlete against the number on their own dashboard; a
   * refusal that says "you are not ready" cannot be checked against anything.
   */
  reasons: string[];
  /** The briefing's short form — one clause, for a sentence that needs one. */
  shortReason: string;
}

export function assessDowngrade(args: {
  readiness: Readiness;
  recovery: RecoveryAssessment;
  load: TrainingLoad;
}): DayDowngrade {
  const { readiness, recovery, load } = args;
  const score = readiness.score.value;
  const reasons: string[] = [];

  if (recovery.status === "poor") {
    /* Labelled as reported rather than measured — rule 5, and the same
       distinction `assessRecovery` itself draws with `reportedCount`. */
    reasons.push("you reported poor recovery in today's check-in");
  }
  if (load.trend === "spike") {
    reasons.push("your last week sits well above your established pattern");
  }
  if (score !== null && score < LOW_READINESS) {
    reasons.push(`today's readiness is ${Math.round(score)} out of 100`);
  }

  return {
    downgraded: reasons.length > 0,
    reasons,
    /* The briefing's own wording for the same three, in the same order, so the
       sentence on the dashboard and the sentence in a refusal agree. */
    shortReason:
      recovery.status === "poor"
        ? "what you reported this morning"
        : load.trend === "spike"
          ? "how far your last week sits above your normal pattern"
          : score !== null && score < LOW_READINESS
            ? "where your readiness sits"
            : "the last few days",
  };
}
