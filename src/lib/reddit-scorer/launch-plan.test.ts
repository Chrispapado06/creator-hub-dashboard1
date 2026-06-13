import { describe, expect, it } from "vitest";
import { buildLaunchPlanPrompt } from "./launch-plan";
import type { AccountPlan, SubredditMatch, ViabilityResult } from "./types";

const result: ViabilityResult = {
  score: 62,
  band: "viable",
  breakdown: [
    { key: "nicheFit", label: "Niche fit / demand", weight: 30, normalized: 0.8, points: 24 },
  ],
};

const accountPlan: AccountPlan = {
  band: "viable",
  targetDailyPosts: 12,
  postsPerAccountPerDay: 2,
  baseAccounts: 6,
  accountsNeeded: 8,
  proxiesNeeded: 8,
};

const matches: SubredditMatch[] = [
  {
    subreddit: {
      id: "1", name: "fitgirls", display_name: null, subscribers: 250000, nsfw: true,
      niche: ["fitness"], verification_required: false, min_karma: 0, min_account_age_days: 0,
      allows_promo: true, posting_notes: null, last_verified: "2026-06-01", active: true,
    },
    score: 65, nicheOverlap: ["fitness"], eligibleNow: true, stale: false, reasons: [],
  },
];

describe("buildLaunchPlanPrompt", () => {
  it("includes the creator name, band, accounts and proxies", () => {
    const p = buildLaunchPlanPrompt({ creatorName: "Marissa", result, accountPlan, matches });
    expect(p).toContain("Marissa");
    expect(p).toContain("VIABLE");
    expect(p).toContain("8"); // accounts / proxies
    expect(p).toContain("r/fitgirls");
  });

  it("instructs the model not to recompute infrastructure", () => {
    const p = buildLaunchPlanPrompt({ creatorName: "X", result, accountPlan, matches });
    expect(p.toLowerCase()).toContain("do not recompute");
  });

  it("handles an empty match list gracefully", () => {
    const p = buildLaunchPlanPrompt({ creatorName: "X", result, accountPlan, matches: [] });
    expect(p).toContain("none matched");
  });
});
