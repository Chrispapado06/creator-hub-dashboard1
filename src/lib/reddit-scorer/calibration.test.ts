import { describe, it, expect } from "vitest";
import { computeCalibration, calibrationAccuracy, type AssessmentLite, type PerformanceLite } from "./calibration";

const assess = (creatorKey: string, score: number, createdAt = "2026-01-01"): AssessmentLite => ({
  creatorKey, creatorName: creatorKey, score, band: "viable", createdAt,
});

describe("computeCalibration", () => {
  it("ranks predicted vs actual and flags misalignment", () => {
    const assessments: AssessmentLite[] = [assess("a", 90), assess("b", 50)];
    // b actually earns more than a → ranks disagree.
    const perf: PerformanceLite[] = [
      { creatorKey: "a", revenueAttributed: 100 },
      { creatorKey: "b", revenueAttributed: 500 },
    ];
    const rows = computeCalibration(assessments, perf);
    const a = rows.find((r) => r.creatorKey === "a")!;
    expect(a.predictedRank).toBe(1);
    expect(a.actualRank).toBe(2);
    expect(a.rankDelta).toBe(-1); // over-rated
    expect(a.alignment).toBe("close");
  });

  it("drops creators missing either side", () => {
    const rows = computeCalibration([assess("a", 90)], [{ creatorKey: "b", revenueAttributed: 100 }]);
    expect(rows).toHaveLength(0);
  });

  it("uses the latest assessment per creator", () => {
    const rows = computeCalibration(
      [assess("a", 30, "2026-01-01"), assess("a", 80, "2026-02-01")],
      [{ creatorKey: "a", revenueAttributed: 100 }],
    );
    expect(rows[0].score).toBe(80);
  });

  it("sums revenue across months", () => {
    const rows = computeCalibration(
      [assess("a", 90)],
      [{ creatorKey: "a", revenueAttributed: 100 }, { creatorKey: "a", revenueAttributed: 250 }],
    );
    expect(rows[0].revenue).toBe(350);
  });

  it("calibrationAccuracy is the aligned share", () => {
    const rows = computeCalibration(
      [assess("a", 90), assess("b", 50)],
      [{ creatorKey: "a", revenueAttributed: 500 }, { creatorKey: "b", revenueAttributed: 100 }],
    );
    expect(calibrationAccuracy(rows)).toBe(100);
  });
});
