import { callClaude, getAnthropicKey } from "@/lib/bernard";
import { POSTS_PER_DAY_BY_TIER } from "./accounts";
import type { AccountPlan, SubredditMatch, ViabilityResult } from "./types";

/**
 * AI launch-plan narrative. The prompt builder is pure (and unit-tested); the
 * generate function wraps the agency's existing Claude helper (raw fetch to
 * api.anthropic.com, model claude-sonnet-4-6, key from agency_settings).
 */
export type LaunchPlanArgs = {
  creatorName: string;
  result: ViabilityResult;
  accountPlan: AccountPlan;
  matches: SubredditMatch[];
};

export function buildLaunchPlanPrompt(args: LaunchPlanArgs): string {
  const { creatorName, result, accountPlan, matches } = args;

  const topSubs = matches
    .slice(0, 15)
    .map((m, i) => {
      const flags = [
        m.stale ? "stale" : null,
        !m.eligibleNow ? "needs-warming" : null,
        m.subreddit.verification_required ? "verification" : null,
      ].filter(Boolean);
      return `${i + 1}. r/${m.subreddit.name} (${m.subreddit.subscribers.toLocaleString()} subs)${
        flags.length ? ` [${flags.join(", ")}]` : ""
      }`;
    })
    .join("\n");

  const breakdown = result.breakdown
    .map((c) => `- ${c.label}: ${c.points}/${c.weight}`)
    .join("\n");

  return [
    `Write a Reddit launch plan for the OnlyFans creator "${creatorName}".`,
    ``,
    `## Viability assessment`,
    `Score: ${result.score}/100 — band: ${result.band.toUpperCase()}`,
    `Rubric breakdown:`,
    breakdown,
    ``,
    `## Infrastructure (already calculated — do not recompute, just explain/justify)`,
    `- Target daily posts: ${accountPlan.targetDailyPosts}`,
    `- Reddit accounts to acquire: ${accountPlan.accountsNeeded} (includes 20% shadowban buffer)`,
    `- Dedicated 4G mobile proxies: ${accountPlan.proxiesNeeded} (1 per account, never shared)`,
    `- Warm-up posting limits: new ${POSTS_PER_DAY_BY_TIER.new}/day, aged ${POSTS_PER_DAY_BY_TIER.aged}/day, trusted ${POSTS_PER_DAY_BY_TIER.trusted}/day`,
    ``,
    `## Top matched subreddits`,
    topSubs || "(none matched — flag this as a blocker)",
    ``,
    `## What to produce`,
    `A concise, operator-ready launch plan with these sections:`,
    `1. **Verdict** — one paragraph on whether to launch and why, given the band.`,
    `2. **Account warm-up schedule** — week-by-week ramp from new to aged accounts.`,
    `3. **Subreddit rollout** — which subs to hit first, posting cadence, and how to handle stale/verification-gated ones.`,
    `4. **Risks & watch-items** — shadowban signals, niche-fit gaps, anything from the rubric scoring low.`,
    `If the band is SKIP, say so plainly and explain what would need to change to make ${creatorName} viable.`,
  ].join("\n");
}

export async function generateLaunchPlan(args: LaunchPlanArgs): Promise<string> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    throw new Error(
      "No Anthropic API key configured. Add it in Settings (agency_settings.anthropic_api_key).",
    );
  }
  return callClaude(apiKey, buildLaunchPlanPrompt(args), { maxTokens: 2000 });
}
