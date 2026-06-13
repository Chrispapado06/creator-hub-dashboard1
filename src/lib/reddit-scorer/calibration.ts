/**
 * Calibration: predicted viability vs. actual revenue, side by side.
 *
 * For every creator with BOTH a saved assessment and performance data, rank
 * them two ways — by latest assessment score (what the rubric predicted) and
 * by total attributed revenue (what actually happened). Rank disagreement is
 * the signal that the rubric weights need retuning. Pure functions only.
 *
 * Ported from the standalone scorer's calibration.ts, adapted to the
 * dashboard's reddit_assessments + scorer_creator_performance shapes.
 */
import type { Band } from "./types";

export type AssessmentLite = {
  creatorKey: string;     // creator_id, or a stable fallback (lowercased name)
  creatorName: string;
  score: number;
  band: Band;
  createdAt: string;      // ISO — latest per creator wins
};

export type PerformanceLite = {
  creatorKey: string;
  revenueAttributed: number;
};

export type CalibrationRow = {
  creatorKey: string;
  creatorName: string;
  band: Band;
  score: number;
  predictedRank: number;  // 1 = highest predicted score
  revenue: number;
  actualRank: number;     // 1 = highest actual revenue
  rankDelta: number;      // predicted − actual (+ = rubric under-rated them)
  alignment: "aligned" | "close" | "off";
};

function alignmentFor(delta: number): CalibrationRow["alignment"] {
  const d = Math.abs(delta);
  return d === 0 ? "aligned" : d === 1 ? "close" : "off";
}

export function computeCalibration(
  assessments: AssessmentLite[],
  performance: PerformanceLite[],
): CalibrationRow[] {
  // Latest assessment per creator.
  const latest = new Map<string, AssessmentLite>();
  for (const a of assessments) {
    const prev = latest.get(a.creatorKey);
    if (!prev || a.createdAt > prev.createdAt) latest.set(a.creatorKey, a);
  }

  // Total revenue per creator.
  const revenue = new Map<string, number>();
  for (const p of performance) {
    revenue.set(p.creatorKey, (revenue.get(p.creatorKey) ?? 0) + p.revenueAttributed);
  }

  // Only creators present on both sides.
  const joined = [...latest.values()]
    .filter((a) => revenue.has(a.creatorKey))
    .map((a) => ({ a, revenue: revenue.get(a.creatorKey)! }));

  const byPredicted = [...joined].sort((x, y) => y.a.score - x.a.score);
  const byActual = [...joined].sort((x, y) => y.revenue - x.revenue);
  const predictedRank = new Map(byPredicted.map((j, i) => [j.a.creatorKey, i + 1]));
  const actualRank = new Map(byActual.map((j, i) => [j.a.creatorKey, i + 1]));

  return byPredicted.map(({ a, revenue: rev }) => {
    const p = predictedRank.get(a.creatorKey)!;
    const r = actualRank.get(a.creatorKey)!;
    const delta = p - r;
    return {
      creatorKey: a.creatorKey,
      creatorName: a.creatorName,
      band: a.band,
      score: a.score,
      predictedRank: p,
      revenue: rev,
      actualRank: r,
      rankDelta: delta,
      alignment: alignmentFor(delta),
    };
  });
}

/** Share of rows where predicted rank matches actual rank exactly. */
export function calibrationAccuracy(rows: CalibrationRow[]): number {
  if (rows.length === 0) return 0;
  const aligned = rows.filter((r) => r.alignment === "aligned").length;
  return Math.round((aligned / rows.length) * 100);
}
