import { z } from "zod";

/**
 * Reddit Viability Scorer — shared types and validation.
 *
 * All business numbers (weights, bands, posting limits, formula) live as named
 * constants in the sibling pure-logic modules (rubric.ts, accounts.ts,
 * matching.ts) so they're trivially auditable and unit-tested. Nothing here
 * touches the network or the DB.
 */

// ── Bands ────────────────────────────────────────────────────────────────────
export const BANDS = ["strong", "viable", "marginal", "skip"] as const;
export type Band = (typeof BANDS)[number];

// ── Assessment inputs (the form) ─────────────────────────────────────────────
// Rubric criteria are rated 0–10; booleans gate the binary criteria.
export const ViabilityInputsSchema = z.object({
  creatorName: z.string().min(1, "Creator name is required"),
  creatorId: z.string().uuid().nullable().optional(),

  // Weighted rubric criteria
  nicheFit: z.number().min(0).max(10),            // demand: content maps to active subs
  contentVolume: z.number().min(0).max(10),       // can sustain fresh posting cadence
  visualAppeal: z.number().min(0).max(10),        // production quality / selling power
  existingReach: z.number().min(0).max(10),       // starting karma assets / off-platform reach
  verificationWilling: z.boolean(),               // unlocks verification-gated subs
  complianceOk: z.boolean(),                       // content allowed on Reddit (no banned categories)

  // Matching profile (not scored, used to rank subreddits)
  niche: z.array(z.string()).default([]),         // creator content tags
  startingKarma: z.number().int().min(0).default(0),
  startingAccountAgeDays: z.number().int().min(0).default(0),
});
export type ViabilityInputs = z.infer<typeof ViabilityInputsSchema>;

// ── Scoring output ───────────────────────────────────────────────────────────
export type CriterionBreakdown = {
  key: string;
  label: string;
  weight: number;       // weight out of 100
  normalized: number;   // 0..1 score for this criterion
  points: number;       // weight * normalized (contribution to final score)
};

export type ViabilityResult = {
  score: number;        // 0..100, rounded to 1dp
  band: Band;
  breakdown: CriterionBreakdown[];
};

// ── Account / proxy sizing ───────────────────────────────────────────────────
export type AccountPlan = {
  band: Band;
  targetDailyPosts: number;
  postsPerAccountPerDay: number;
  baseAccounts: number;       // before buffer
  accountsNeeded: number;     // after 20% shadowban buffer
  proxiesNeeded: number;      // 1 dedicated 4G mobile proxy per account
};

// ── Subreddit catalog + matching ─────────────────────────────────────────────
export type CatalogSubreddit = {
  id: string;
  name: string;
  display_name: string | null;
  subscribers: number;
  nsfw: boolean;
  niche: string[];
  verification_required: boolean;
  min_karma: number;
  min_account_age_days: number;
  allows_promo: boolean;
  posting_notes: string | null;
  last_verified: string | null; // ISO date
  active: boolean;
};

export type SubredditMatch = {
  subreddit: CatalogSubreddit;
  score: number;          // ranking score (higher = better fit)
  nicheOverlap: string[]; // matched tags
  eligibleNow: boolean;   // account meets karma + age gates today
  stale: boolean;         // last_verified missing or 45+ days old
  reasons: string[];      // human-readable ranking notes
};
