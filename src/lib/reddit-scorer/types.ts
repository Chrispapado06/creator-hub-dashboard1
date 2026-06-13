import { z } from "zod";

/**
 * Reddit Viability Scorer — shared types and validation.
 *
 * The verdict is CALCULATED from five rubric criteria — never a subjective
 * "how good is she" rating. Three criteria are DERIVED (read-only) from
 * objective facts; two are MANUAL numbers scored against agency guidance:
 *
 *   niche_demand             (30) — derived from subreddit match results
 *   competitor_benchmark     (25) — manual: avg upvotes of comparable creators
 *   content_supply           (15) — derived from profile (pieces/wk + reddit-native)
 *   verification_willingness (15) — derived from profile (boolean)
 *   conversion_history       (15) — manual: observed Reddit→OF conversion %
 *
 * All scoring numbers live in rubric.ts / settings.ts; nothing here touches
 * the network or the DB.
 */

// ── Bands ────────────────────────────────────────────────────────────────────
export const BANDS = ["strong", "viable", "marginal", "skip"] as const;
export type Band = (typeof BANDS)[number];

// ── Assessment inputs (the form) ─────────────────────────────────────────────
// Objective profile facts + two manual benchmark numbers. No 0–10 "rate her"
// sliders — every scored value is derived or measured.
export const ViabilityInputsSchema = z.object({
  creatorName: z.string().min(1, "Creator name is required"),
  creatorId: z.string().uuid().nullable().optional(),

  // Matching profile → drives niche_demand (via subreddit matching) and
  // subreddit eligibility. Not scored directly.
  niche: z.array(z.string()).default([]),
  startingKarma: z.number().int().min(0).default(0),
  startingAccountAgeDays: z.number().int().min(0).default(0),

  // content_supply (derived): how much fresh, Reddit-suitable content exists.
  contentPiecesPerWeek: z.number().min(0).default(0),
  redditNativeContent: z.boolean().default(false),

  // verification_willingness (derived): unlocks verification-gated subs.
  verificationWilling: z.boolean().default(false),

  // competitor_benchmark (manual): avg upvotes comparable creators get in the
  // same niche. Scored against the agency benchmark target.
  competitorAvgUpvotes: z.number().min(0).default(0),

  // conversion_history (manual): observed/expected Reddit→OF conversion (% of
  // clicks that subscribe) for this creator or close comparables. Scored
  // against the agency conversion target.
  conversionHistoryPct: z.number().min(0).default(0),
});
export type ViabilityInputs = z.infer<typeof ViabilityInputsSchema>;

// ── Scoring output ───────────────────────────────────────────────────────────
export type CriterionKey =
  | "niche_demand"
  | "competitor_benchmark"
  | "content_supply"
  | "verification_willingness"
  | "conversion_history";

export type CriterionBreakdown = {
  key: CriterionKey;
  label: string;
  /** "derived" = read-only, computed from facts; "manual" = a measured number. */
  source: "derived" | "manual";
  weight: number;       // weight out of 100
  normalized: number;   // 0..1 score for this criterion
  points: number;       // contribution to the final score (weight * normalized)
  /** Human-readable explanation of HOW this criterion got its value. */
  derivation: string;
};

export type ViabilityResult = {
  score: number;        // 0..100, rounded to 1dp
  band: Band;
  breakdown: CriterionBreakdown[];
};

/** Objective signals niche_demand is derived from (the subreddit match roll-up). */
export type MatchStats = {
  matchCount: number;
  combinedMembers: number;
};

// ── Account / proxy sizing ───────────────────────────────────────────────────
export type AccountPlan = {
  band: Band;
  targetDailyPosts: number;
  postsPerAccountPerDay: number;
  baseAccounts: number;       // before buffer
  accountsNeeded: number;     // after shadowban buffer
  proxiesNeeded: number;      // dedicated mobile proxies per account
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
