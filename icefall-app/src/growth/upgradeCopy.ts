import { usePrimaryGoalWithProgress } from "@/tracking/training";
import { daysUntil } from "@/growth/readinessTest";

/**
 * Objective-aware upgrade copy.
 *
 * The strongest, most honest reason to upgrade in ICEFALL is the athlete's OWN
 * objective and its date: "Aconcagua is 74 days away." So the growth prompts do
 * not talk about "features" in the abstract — they talk about the mountain the
 * person is training for and the time they have left. When there is no dated
 * objective, the copy quietly falls back to a plain description of what the
 * feature adds. It NEVER invents urgency: the days-to-go is a fact off the
 * athlete's own calendar, not a countdown we manufactured (see UpgradePrompt's
 * "no pressure" rule).
 */

export type UpgradeContext = "analytics" | "coach";

export interface UpgradeCopy {
  title: string;
  body: string;
}

export function useUpgradeCopy(context: UpgradeContext): UpgradeCopy {
  const goal = usePrimaryGoalWithProgress();
  const days = goal ? daysUntil(goal.targetDate) : null;
  const mountain = goal?.name;
  // Only reference the objective when it's genuinely ahead of the athlete.
  const ahead = mountain && days !== null && days > 0
    ? { mountain, when: days === 1 ? "tomorrow" : `${days.toLocaleString("en-GB")} days away` }
    : null;

  switch (context) {
    case "analytics":
      return {
        title: "See what this session did to your training load.",
        body: ahead
          ? `Load, trends and benchmarks show whether you're on track for ${ahead.mountain} — ${ahead.when}. Advanced analytics with ICEFALL Pro.`
          : "Training load, trends and benchmarks — advanced analytics with ICEFALL Pro.",
      };
    case "coach":
      return {
        title: "That's your free Coach conversations for this month.",
        body: ahead
          ? `Unlimited Coach with ICEFALL Pro — every day of preparation, right up to ${ahead.mountain}, ${ahead.when}.`
          : "Unlimited Coach with ICEFALL Pro — ask as often as you train.",
      };
  }
}
