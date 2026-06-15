import { describe, it, expect } from "vitest";
import {
  addDays,
  computeWindows,
  isConfounded,
  evaluateExperiment,
  type DailyDatum,
  type ExperimentRow,
} from "./experiment-engine";

// ── helpers ──────────────────────────────────────────────────────────────────
const CHANGE = "2026-06-10";
const WIN = computeWindows(CHANGE); // baseline 06-03…06-09, observation 06-11…06-17

const runningExp = (): ExperimentRow => ({
  status: "running",
  baseline_start: WIN.baseline_start,
  baseline_end: WIN.baseline_end,
  observation_start: WIN.observation_start,
  observation_end: WIN.observation_end,
});

/** `count` consecutive days from `start`, each with the same fans/income/spend. */
function days(
  start: string,
  count: number,
  fans: number,
  income: number,
  spend: number | null,
): DailyDatum[] {
  return Array.from({ length: count }, (_, i) => ({
    date: addDays(start, i),
    direct_fans: fans,
    direct_income_usd: income,
    onlyfinder_spend_usd: spend,
  }));
}

// ── windows ──────────────────────────────────────────────────────────────────
describe("computeWindows", () => {
  it("is D-7…D-1 baseline and D+1…D+7 observation (change day excluded)", () => {
    expect(WIN).toEqual({
      baseline_start: "2026-06-03",
      baseline_end: "2026-06-09",
      observation_start: "2026-06-11",
      observation_end: "2026-06-17",
    });
  });
});

// ── 1) clean concluded ───────────────────────────────────────────────────────
describe("clean concluded experiment", () => {
  it("computes per-day, income, and fans-per-dollar lift, status=concluded", () => {
    const daily = [
      ...days("2026-06-03", 7, 10, 100, 5), // baseline: 10 fans, $100, $5 spend / day
      ...days("2026-06-11", 7, 15, 150, 5), // observation: 15 fans, $150, $5 spend / day
    ];
    const res = evaluateExperiment(runningExp(), {
      today: "2026-06-17", // observation_end reached
      otherChangeDates: [], // no confound
      daily,
    });

    expect(res.changed).toBe(true);
    if (!res.changed || res.status !== "concluded") throw new Error("expected concluded");

    const m = res.metrics;
    expect(m.baseline_fans_per_day).toBe(10);
    expect(m.observed_fans_per_day).toBe(15);
    expect(m.fans_lift_pct).toBe(50); // (15-10)/10

    expect(m.baseline_income_per_day).toBe(100);
    expect(m.observed_income_per_day).toBe(150);
    expect(m.income_lift_pct).toBe(50);

    // Σfans / Σspend: baseline 70/35 = 2, observation 105/35 = 3 → +50%
    expect(m.baseline_fans_per_dollar).toBe(2);
    expect(m.observed_fans_per_dollar).toBe(3);
    expect(m.fans_per_dollar_lift_pct).toBe(50);
  });

  it("tolerates a missing manual spend value (fans-per-dollar = null, no crash)", () => {
    const daily = [
      ...days("2026-06-03", 7, 10, 100, 5),
      ...days("2026-06-11", 6, 15, 150, 5),
      { date: "2026-06-17", direct_fans: 15, direct_income_usd: 150, onlyfinder_spend_usd: null }, // spend not logged
    ];
    const res = evaluateExperiment(runningExp(), { today: "2026-06-17", otherChangeDates: [], daily });
    if (!res.changed || res.status !== "concluded") throw new Error("expected concluded");
    // Fan/income metrics still computed; fans-per-dollar nulled out because a day's spend is missing.
    expect(res.metrics.observed_fans_per_day).toBe(15);
    expect(res.metrics.observed_fans_per_dollar).toBeNull();
    expect(res.metrics.fans_per_dollar_lift_pct).toBeNull();
  });
});

// ── 2) confounded ────────────────────────────────────────────────────────────
describe("confounded experiment", () => {
  it("flags confounded with a reason and NO metrics when another change is in-window", () => {
    const daily = [...days("2026-06-03", 7, 10, 100, 5), ...days("2026-06-11", 7, 15, 150, 5)];
    const res = evaluateExperiment(runningExp(), {
      today: "2026-06-17",
      otherChangeDates: ["2026-06-13"], // inside [06-03, 06-17]
      daily,
    });
    expect(res.changed).toBe(true);
    if (!res.changed || res.status !== "confounded") throw new Error("expected confounded");
    expect(res.metrics).toBeNull(); // hard rule #4 — confounded never gets a verdict
    expect(res.confounded_reason).toContain("2026-06-13");
  });

  it("a change OUTSIDE the window does not confound", () => {
    expect(isConfounded(WIN, ["2026-06-18"]).confounded).toBe(false); // day after observation_end
    expect(isConfounded(WIN, ["2026-06-02"]).confounded).toBe(false); // day before baseline_start
  });

  it("window boundaries are inclusive", () => {
    expect(isConfounded(WIN, ["2026-06-03"]).confounded).toBe(true); // == baseline_start
    expect(isConfounded(WIN, ["2026-06-17"]).confounded).toBe(true); // == observation_end
  });
});

// ── 3) insufficient data ─────────────────────────────────────────────────────
describe("insufficient data", () => {
  it("does not conclude with a misleading verdict when a window is too sparse", () => {
    const daily = [
      ...days("2026-06-03", 7, 10, 100, 5), // full baseline
      ...days("2026-06-11", 2, 15, 150, 5), // only 2 observation days (< 5)
    ];
    const res = evaluateExperiment(runningExp(), { today: "2026-06-17", otherChangeDates: [], daily });
    expect(res.changed).toBe(true);
    if (!res.changed || res.status !== "insufficient_data") throw new Error("expected insufficient_data");
    expect(res.metrics).toBeNull();
    expect(res.reason).toContain("2 observation");
  });
});

// ── still observing ──────────────────────────────────────────────────────────
describe("still running", () => {
  it("returns no change before observation_end with no confound", () => {
    const daily = [...days("2026-06-03", 7, 10, 100, 5), ...days("2026-06-11", 3, 15, 150, 5)];
    const res = evaluateExperiment(runningExp(), { today: "2026-06-13", otherChangeDates: [], daily });
    expect(res.changed).toBe(false);
  });

  it("leaves terminal experiments untouched", () => {
    const res = evaluateExperiment(
      { ...runningExp(), status: "concluded" },
      { today: "2026-06-30", otherChangeDates: ["2026-06-12"], daily: [] },
    );
    expect(res.changed).toBe(false);
  });
});
