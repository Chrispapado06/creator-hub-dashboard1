import type {
  Band, CriterionBreakdown, CriterionKey, MatchStats, ViabilityInputs, ViabilityResult,
} from "./types";

/**
 * Weighted viability rubric — the verdict is CALCULATED, never chosen.
 *
 * Five criteria, each normalised to 0..1, combined by weight. Three are
 * derived from objective facts (niche_demand, content_supply,
 * verification_willingness); two are measured numbers scored against agency
 * guidance (competitor_benchmark, conversion_history).
 *
 * Weights + guidance thresholds are tunable in the Settings tab; the constants
 * here are the defaults (and what the migration seeds).
 */
export const RUBRIC_WEIGHTS = {
  niche_demand: 30,
  competitor_benchmark: 25,
  content_supply: 15,
  verification_willingness: 15,
  conversion_history: 15,
} as const;

export type RubricWeights = Record<CriterionKey, number>;

export const RUBRIC_LABELS: Record<CriterionKey, string> = {
  niche_demand: "Niche demand",
  competitor_benchmark: "Competitor benchmark",
  content_supply: "Content supply",
  verification_willingness: "Verification willingness",
  conversion_history: "Conversion history",
};

export const CRITERION_SOURCE: Record<CriterionKey, "derived" | "manual"> = {
  niche_demand: "derived",
  competitor_benchmark: "manual",
  content_supply: "derived",
  verification_willingness: "derived",
  conversion_history: "manual",
};

/** Guidance thresholds the criteria are scored against (tunable in Settings). */
export type ScoringGuidance = {
  /** Matched subreddit count that counts as full niche demand. */
  targetMatches: number;
  /** Combined audience (members across matched subs) that counts as full reach. */
  targetCombinedMembers: number;
  /** Content cadence (pieces/week) that counts as full supply. */
  targetPiecesPerWeek: number;
  /** Multiplier applied to supply when content is NOT Reddit-native (studio). */
  studioPenalty: number;
  /** Avg upvotes (vs comparable creators) that counts as a full benchmark. */
  benchmarkTargetUpvotes: number;
  /** Reddit→OF conversion % that counts as full conversion history. */
  conversionTargetPct: number;
};

export const DEFAULT_GUIDANCE: ScoringGuidance = {
  targetMatches: 8,
  targetCombinedMembers: 10_000_000,
  targetPiecesPerWeek: 7,
  studioPenalty: 0.6,
  benchmarkTargetUpvotes: 300,
  conversionTargetPct: 10,
};

// ── Bands ────────────────────────────────────────────────────────────────────
export const BAND_THRESHOLDS: { band: Band; min: number }[] = [
  { band: "strong", min: 75 },
  { band: "viable", min: 55 },
  { band: "marginal", min: 35 },
  { band: "skip", min: 0 },
];

export function bandForScore(score: number): Band {
  for (const { band, min } of BAND_THRESHOLDS) {
    if (score >= min) return band;
  }
  return "skip";
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const fmtMembers = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : `${Math.round(n)}`;

// ── Per-criterion derivations (each → 0..1 + a "why") ────────────────────────

/** niche_demand — derived from the subreddit match roll-up (count + reach). */
export function deriveNicheDemand(stats: MatchStats, g: ScoringGuidance): { norm: number; derivation: string } {
  const matchComp = clamp01(stats.matchCount / Math.max(1, g.targetMatches));
  // Reach on a log scale so a couple of huge subs don't dominate a wide niche.
  const reachComp = stats.combinedMembers <= 0
    ? 0
    : clamp01(Math.log10(stats.combinedMembers + 1) / Math.log10(g.targetCombinedMembers + 1));
  const norm = 0.5 * matchComp + 0.5 * reachComp;
  return {
    norm,
    derivation: stats.matchCount === 0
      ? "No matching subreddits in the catalog — add subs or broaden the niche."
      : `${stats.matchCount} matched sub${stats.matchCount === 1 ? "" : "s"} · ${fmtMembers(stats.combinedMembers)} combined members`,
  };
}

/** content_supply — derived from cadence × Reddit-native penalty. */
export function deriveContentSupply(piecesPerWeek: number, redditNative: boolean, g: ScoringGuidance): { norm: number; derivation: string } {
  const cadence = clamp01(piecesPerWeek / Math.max(1, g.targetPiecesPerWeek));
  const norm = cadence * (redditNative ? 1 : g.studioPenalty);
  return {
    norm,
    derivation: `${piecesPerWeek}/wk · ${redditNative ? "Reddit-native" : `studio (×${g.studioPenalty})`}`,
  };
}

/** verification_willingness — derived boolean. */
export function deriveVerification(willing: boolean): { norm: number; derivation: string } {
  return { norm: willing ? 1 : 0, derivation: willing ? "Willing to verify" : "Won't verify — verification-gated subs excluded" };
}

/** competitor_benchmark — measured avg upvotes scored against the target. */
export function scoreCompetitorBenchmark(avgUpvotes: number, g: ScoringGuidance): { norm: number; derivation: string } {
  const norm = clamp01(avgUpvotes / Math.max(1, g.benchmarkTargetUpvotes));
  return { norm, derivation: `${Math.round(avgUpvotes)} avg upvotes vs ${g.benchmarkTargetUpvotes} target` };
}

/** conversion_history — measured Reddit→OF CVR scored against the target. */
export function scoreConversionHistory(cvrPct: number, g: ScoringGuidance): { norm: number; derivation: string } {
  const norm = clamp01(cvrPct / Math.max(0.01, g.conversionTargetPct));
  return { norm, derivation: `${cvrPct}% conversion vs ${g.conversionTargetPct}% target` };
}

// ── The weighted verdict ─────────────────────────────────────────────────────

/**
 * Compute the viability score, band, and per-criterion breakdown from the five
 * criteria. `matchStats` carries the niche_demand inputs (from the subreddit
 * matcher); everything else comes off `inputs`. Pure — no side effects.
 */
export function scoreViability(
  inputs: ViabilityInputs,
  matchStats: MatchStats,
  opts?: { weights?: Partial<RubricWeights>; guidance?: Partial<ScoringGuidance> },
): ViabilityResult {
  const weights: RubricWeights = { ...RUBRIC_WEIGHTS, ...(opts?.weights ?? {}) };
  const g: ScoringGuidance = { ...DEFAULT_GUIDANCE, ...(opts?.guidance ?? {}) };

  const derived: Record<CriterionKey, { norm: number; derivation: string }> = {
    niche_demand: deriveNicheDemand(matchStats, g),
    competitor_benchmark: scoreCompetitorBenchmark(inputs.competitorAvgUpvotes, g),
    content_supply: deriveContentSupply(inputs.contentPiecesPerWeek, inputs.redditNativeContent, g),
    verification_willingness: deriveVerification(inputs.verificationWilling),
    conversion_history: scoreConversionHistory(inputs.conversionHistoryPct, g),
  };

  const keys = Object.keys(RUBRIC_WEIGHTS) as CriterionKey[];
  const totalWeight = keys.reduce((s, k) => s + (weights[k] || 0), 0) || 1;

  const breakdown: CriterionBreakdown[] = keys.map((key) => {
    const weight = weights[key] || 0;
    const { norm, derivation } = derived[key];
    return {
      key,
      label: RUBRIC_LABELS[key],
      source: CRITERION_SOURCE[key],
      weight,
      normalized: norm,
      points: Math.round(weight * norm * 100) / 100,
      derivation,
    };
  });

  const raw = breakdown.reduce((s, c) => s + c.weight * c.normalized, 0);
  const score = Math.round((raw / totalWeight) * 100 * 10) / 10;

  return { score, band: bandForScore(score), breakdown };
}
