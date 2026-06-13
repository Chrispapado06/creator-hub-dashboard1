import { describe, expect, it } from "vitest";
import { BAND_THRESHOLDS, RUBRIC_WEIGHTS, bandForScore, scoreViability } from "./rubric";
import type { ViabilityInputs } from "./types";

const base: ViabilityInputs = {
  creatorName: "Test",
  creatorId: null,
  nicheFit: 0,
  contentVolume: 0,
  visualAppeal: 0,
  existingReach: 0,
  verificationWilling: false,
  complianceOk: false,
  niche: [],
  startingKarma: 0,
  startingAccountAgeDays: 0,
};

describe("rubric weights", () => {
  it("sum to exactly 100", () => {
    const total = Object.values(RUBRIC_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe("scoreViability", () => {
  it("scores all-zero inputs as 0 / skip", () => {
    const r = scoreViability(base);
    expect(r.score).toBe(0);
    expect(r.band).toBe("skip");
  });

  it("scores perfect inputs as 100 / strong", () => {
    const r = scoreViability({
      ...base,
      nicheFit: 10,
      contentVolume: 10,
      visualAppeal: 10,
      existingReach: 10,
      verificationWilling: true,
      complianceOk: true,
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe("strong");
  });

  it("weights niche fit highest (30 pts at max)", () => {
    const r = scoreViability({ ...base, nicheFit: 10 });
    expect(r.score).toBe(30);
    const niche = r.breakdown.find((c) => c.key === "nicheFit");
    expect(niche?.points).toBe(30);
  });

  it("treats booleans as all-or-nothing", () => {
    const r = scoreViability({ ...base, verificationWilling: true, complianceOk: true });
    expect(r.score).toBe(RUBRIC_WEIGHTS.verificationWilling + RUBRIC_WEIGHTS.complianceOk);
  });

  it("breakdown points never exceed criterion weight", () => {
    const r = scoreViability({
      ...base,
      nicheFit: 10,
      contentVolume: 10,
      visualAppeal: 10,
      existingReach: 10,
    });
    for (const c of r.breakdown) expect(c.points).toBeLessThanOrEqual(c.weight);
  });
});

describe("bandForScore", () => {
  it.each([
    [100, "strong"],
    [75, "strong"],
    [74.9, "viable"],
    [55, "viable"],
    [54, "marginal"],
    [35, "marginal"],
    [34.9, "skip"],
    [0, "skip"],
  ] as const)("score %s -> %s", (score, band) => {
    expect(bandForScore(score)).toBe(band);
  });

  it("thresholds are descending and cover 0", () => {
    const mins = BAND_THRESHOLDS.map((b) => b.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(mins[mins.length - 1]).toBe(0);
  });
});
