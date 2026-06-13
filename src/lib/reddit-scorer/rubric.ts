import type { Band, CriterionBreakdown, ViabilityInputs, ViabilityResult } from "./types";

/**
 * Weighted viability rubric. Weights sum to 100. Edit these constants to retune
 * the model — every consumer reads from here, and rubric.test.ts asserts the
 * weights still total 100.
 */
export const RUBRIC_WEIGHTS = {
  nicheFit: 30,
  contentVolume: 20,
  visualAppeal: 20,
  verificationWilling: 15,
  existingReach: 10,
  complianceOk: 5,
} as const;

export const RUBRIC_LABELS: Record<keyof typeof RUBRIC_WEIGHTS, string> = {
  nicheFit: "Niche fit / demand",
  contentVolume: "Content volume",
  visualAppeal: "Visual appeal",
  verificationWilling: "Verification willingness",
  existingReach: "Existing reach",
  complianceOk: "Compliance",
};

/**
 * Score band thresholds (inclusive lower bound). A score >= 75 is Strong, etc.
 */
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

/** Normalise each criterion to 0..1. 0–10 ratings divide by 10; booleans are 1/0. */
function normalize(inputs: ViabilityInputs): Record<keyof typeof RUBRIC_WEIGHTS, number> {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  return {
    nicheFit: clamp01(inputs.nicheFit / 10),
    contentVolume: clamp01(inputs.contentVolume / 10),
    visualAppeal: clamp01(inputs.visualAppeal / 10),
    verificationWilling: inputs.verificationWilling ? 1 : 0,
    existingReach: clamp01(inputs.existingReach / 10),
    complianceOk: inputs.complianceOk ? 1 : 0,
  };
}

/**
 * Compute the weighted viability score (0..100), its band, and the per-criterion
 * breakdown. Pure — no side effects.
 */
export function scoreViability(inputs: ViabilityInputs): ViabilityResult {
  const normalized = normalize(inputs);
  const keys = Object.keys(RUBRIC_WEIGHTS) as (keyof typeof RUBRIC_WEIGHTS)[];

  const breakdown: CriterionBreakdown[] = keys.map((key) => {
    const weight = RUBRIC_WEIGHTS[key];
    const norm = normalized[key];
    return {
      key,
      label: RUBRIC_LABELS[key],
      weight,
      normalized: norm,
      points: Math.round(weight * norm * 100) / 100,
    };
  });

  const rawScore = breakdown.reduce((sum, c) => sum + c.weight * c.normalized, 0);
  const score = Math.round(rawScore * 10) / 10;

  return { score, band: bandForScore(score), breakdown };
}
