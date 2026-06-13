import type { CatalogSubreddit, SubredditMatch, ViabilityInputs } from "./types";

/**
 * Subreddit ranked matching. Pure — `now` is injected so staleness is
 * deterministic in tests.
 *
 * Hard exclusions:
 *   - inactive subs
 *   - verification-required subs when the creator is not verification_willing
 *
 * Soft signals (affect rank, don't exclude):
 *   - niche tag overlap (primary driver)
 *   - subscriber size (log-scaled)
 *   - eligibility now (karma + account-age gates) — ineligible subs are kept
 *     but down-weighted, since accounts warm up over time
 *   - staleness (last_verified missing or 45+ days) — down-weighted
 *   - allows_promo = false — heavily down-weighted (can't drop links)
 */
export const STALE_DAYS = 45;

// Ranking weights (relative, internal to matching only).
const NICHE_OVERLAP_WEIGHT = 40; // per matched tag
const SIZE_WEIGHT = 10;          // multiplied by log10(subscribers)
const STALE_MULTIPLIER = 0.6;    // applied when stale
const INELIGIBLE_MULTIPLIER = 0.7;
const NO_PROMO_MULTIPLIER = 0.3;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function isStale(lastVerified: string | null, now: Date): boolean {
  if (!lastVerified) return true;
  const verified = new Date(lastVerified + "T00:00:00Z");
  if (Number.isNaN(verified.getTime())) return true;
  return daysBetween(now, verified) >= STALE_DAYS;
}

function scoreOne(
  sub: CatalogSubreddit,
  profile: Pick<ViabilityInputs, "niche" | "startingKarma" | "startingAccountAgeDays">,
  now: Date,
): SubredditMatch {
  const profileNiche = new Set(profile.niche.map((n) => n.toLowerCase().trim()));
  const nicheOverlap = sub.niche.filter((tag) => profileNiche.has(tag.toLowerCase().trim()));

  const eligibleNow =
    profile.startingKarma >= sub.min_karma &&
    profile.startingAccountAgeDays >= sub.min_account_age_days;
  const stale = isStale(sub.last_verified, now);

  const reasons: string[] = [];

  let score = 0;
  score += nicheOverlap.length * NICHE_OVERLAP_WEIGHT;
  if (nicheOverlap.length) reasons.push(`Niche match: ${nicheOverlap.join(", ")}`);

  const sizeScore = sub.subscribers > 0 ? Math.log10(sub.subscribers) * SIZE_WEIGHT : 0;
  score += sizeScore;

  if (!eligibleNow) {
    score *= INELIGIBLE_MULTIPLIER;
    reasons.push(
      `Needs warming: requires ${sub.min_karma} karma / ${sub.min_account_age_days}d age`,
    );
  }
  if (stale) {
    score *= STALE_MULTIPLIER;
    reasons.push(`Stale: not verified in ${STALE_DAYS}+ days`);
  }
  if (!sub.allows_promo) {
    score *= NO_PROMO_MULTIPLIER;
    reasons.push("Promo/links restricted");
  }
  if (sub.verification_required) {
    reasons.push("Verification required");
  }

  return {
    subreddit: sub,
    score: Math.round(score * 100) / 100,
    nicheOverlap,
    eligibleNow,
    stale,
    reasons,
  };
}

/**
 * Rank the catalog for a creator profile. Returns matches sorted by score
 * descending. `limit` caps the result (default: all).
 */
export function rankSubreddits(
  profile: Pick<ViabilityInputs, "niche" | "startingKarma" | "startingAccountAgeDays" | "verificationWilling">,
  catalog: CatalogSubreddit[],
  now: Date,
  limit?: number,
): SubredditMatch[] {
  const eligible = catalog.filter((sub) => {
    if (!sub.active) return false;
    if (sub.verification_required && !profile.verificationWilling) return false;
    return true;
  });

  const ranked = eligible
    .map((sub) => scoreOne(sub, profile, now))
    .sort((a, b) => b.score - a.score);

  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}
