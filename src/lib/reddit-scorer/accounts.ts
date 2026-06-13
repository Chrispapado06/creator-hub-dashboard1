import type { AccountPlan, Band } from "./types";

/**
 * Deterministic account + proxy sizing.
 *
 * Domain rules (do not change without sign-off):
 *  - 1 dedicated 4G mobile proxy per Reddit account. Never shared.
 *  - Always add a 20% buffer for shadowban replacement.
 *  - Launch accounts start as NEW (warming up) and post conservatively.
 */
export const ACCOUNT_BUFFER = 0.2; // +20% shadowban replacement buffer

/** Safe posting limits per account per day, by warm-up tier (for reference/UI). */
export const POSTS_PER_DAY_BY_TIER = {
  new: 2,      // 0–30 days, warming up
  aged: 5,     // 30+ days, warmed
  trusted: 8,  // 90+ days, high karma
} as const;

/** New accounts drive launch sizing — fresh accounts post at the "new" limit. */
export const POSTS_PER_NEW_ACCOUNT_PER_DAY = POSTS_PER_DAY_BY_TIER.new;

/** Target daily posting volume by viability band — drives how many accounts we need. */
export const TARGET_DAILY_POSTS_BY_BAND: Record<Band, number> = {
  strong: 20,
  viable: 12,
  marginal: 6,
  skip: 0,
};

/**
 * Calculate accounts and proxies for a launch.
 *   base       = ceil(targetDailyPosts / postsPerNewAccountPerDay)
 *   accounts   = ceil(base * (1 + buffer))
 *   proxies    = accounts (1:1, dedicated)
 * Pure and deterministic.
 */
export function calcAccountsAndProxies(band: Band): AccountPlan {
  const targetDailyPosts = TARGET_DAILY_POSTS_BY_BAND[band];
  const postsPerAccountPerDay = POSTS_PER_NEW_ACCOUNT_PER_DAY;

  const baseAccounts =
    targetDailyPosts === 0 ? 0 : Math.ceil(targetDailyPosts / postsPerAccountPerDay);
  const accountsNeeded = baseAccounts === 0 ? 0 : Math.ceil(baseAccounts * (1 + ACCOUNT_BUFFER));
  const proxiesNeeded = accountsNeeded; // 1 dedicated proxy per account

  return {
    band,
    targetDailyPosts,
    postsPerAccountPerDay,
    baseAccounts,
    accountsNeeded,
    proxiesNeeded,
  };
}
