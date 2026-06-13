import { describe, expect, it } from "vitest";
import {
  RUBRIC_WEIGHTS, DEFAULT_GUIDANCE, bandForScore, scoreViability,
  deriveNicheDemand, deriveContentSupply, scoreCompetitorBenchmark, scoreConversionHistory,
} from "./rubric";
import type { ViabilityInputs, MatchStats } from "./types";

const base: ViabilityInputs = {
  creatorName: "Test",
  creatorId: null,
  niche: [],
  startingKarma: 0,
  startingAccountAgeDays: 0,
  contentPiecesPerWeek: 0,
  redditNativeContent: false,
  verificationWilling: false,
  competitorAvgUpvotes: 0,
  conversionHistoryPct: 0,
};
const noMatches: MatchStats = { matchCount: 0, combinedMembers: 0 };

describe("RUBRIC_WEIGHTS", () => {
  it("are the five calculated criteria summing to 100", () => {
    const keys = Object.keys(RUBRIC_WEIGHTS).sort();
    expect(keys).toEqual([
      "competitor_benchmark", "content_supply", "conversion_history",
      "niche_demand", "verification_willingness",
    ]);
    expect(Object.values(RUBRIC_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("bandForScore", () => {
  it("maps to the right band", () => {
    expect(bandForScore(80)).toBe("strong");
    expect(bandForScore(60)).toBe("viable");
    expect(bandForScore(40)).toBe("marginal");
    expect(bandForScore(10)).toBe("skip");
  });
});

describe("derivations", () => {
  it("niche_demand rises with match count + combined reach", () => {
    const low = deriveNicheDemand({ matchCount: 1, combinedMembers: 1000 }, DEFAULT_GUIDANCE).norm;
    const high = deriveNicheDemand({ matchCount: 8, combinedMembers: 10_000_000 }, DEFAULT_GUIDANCE).norm;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeCloseTo(1, 5);
    expect(deriveNicheDemand({ matchCount: 0, combinedMembers: 0 }, DEFAULT_GUIDANCE).norm).toBe(0);
  });

  it("content_supply penalises studio (non-reddit-native) content", () => {
    const native = deriveContentSupply(7, true, DEFAULT_GUIDANCE).norm;
    const studio = deriveContentSupply(7, false, DEFAULT_GUIDANCE).norm;
    expect(native).toBeCloseTo(1, 5);
    expect(studio).toBeCloseTo(DEFAULT_GUIDANCE.studioPenalty, 5);
  });

  it("manual benchmarks normalise against their targets and cap at 1", () => {
    expect(scoreCompetitorBenchmark(300, DEFAULT_GUIDANCE).norm).toBeCloseTo(1, 5);
    expect(scoreCompetitorBenchmark(150, DEFAULT_GUIDANCE).norm).toBeCloseTo(0.5, 5);
    expect(scoreCompetitorBenchmark(9999, DEFAULT_GUIDANCE).norm).toBe(1);
    expect(scoreConversionHistory(10, DEFAULT_GUIDANCE).norm).toBeCloseTo(1, 5);
    expect(scoreConversionHistory(5, DEFAULT_GUIDANCE).norm).toBeCloseTo(0.5, 5);
  });
});

describe("scoreViability", () => {
  it("an all-zero prospect scores 0 / skip", () => {
    const r = scoreViability(base, noMatches);
    expect(r.score).toBe(0);
    expect(r.band).toBe("skip");
  });

  it("a maxed-out prospect scores 100 / strong", () => {
    const inputs: ViabilityInputs = {
      ...base,
      contentPiecesPerWeek: 7,
      redditNativeContent: true,
      verificationWilling: true,
      competitorAvgUpvotes: 300,
      conversionHistoryPct: 10,
    };
    const r = scoreViability(inputs, { matchCount: 8, combinedMembers: 10_000_000 });
    expect(r.score).toBeCloseTo(100, 1);
    expect(r.band).toBe("strong");
  });

  it("tags each criterion as derived or manual with a derivation string", () => {
    const r = scoreViability(base, noMatches);
    const niche = r.breakdown.find((c) => c.key === "niche_demand")!;
    const bench = r.breakdown.find((c) => c.key === "competitor_benchmark")!;
    expect(niche.source).toBe("derived");
    expect(bench.source).toBe("manual");
    expect(niche.derivation).toBeTruthy();
  });

  it("verification willingness contributes its full weight when willing", () => {
    const r = scoreViability({ ...base, verificationWilling: true }, noMatches);
    const v = r.breakdown.find((c) => c.key === "verification_willingness")!;
    expect(v.points).toBe(v.weight);
  });
});
