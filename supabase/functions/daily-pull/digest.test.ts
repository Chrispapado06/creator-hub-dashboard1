import { describe, it, expect } from "vitest";
import {
  buildDigestInput,
  sanitizeItem,
  generateDailyDigest,
  type DigestExperiment,
} from "./digest";

// ── fixtures ─────────────────────────────────────────────────────────────────
function exp(over: Partial<DigestExperiment> & Pick<DigestExperiment, "id" | "status">): DigestExperiment {
  return {
    creator_name: "Aria",
    changed_on: "2026-06-10",
    action: "replaced",
    new_keywords: ["petite", "gamer girl"],
    baseline_start: "2026-06-03",
    baseline_end: "2026-06-09",
    observation_start: "2026-06-11",
    observation_end: "2026-06-17",
    metrics: null,
    confounded_reason: null,
    ...over,
  };
}

const CONCLUDED_METRICS = {
  baseline_fans_per_day: 10, observed_fans_per_day: 15, fans_lift_pct: 50,
  baseline_income_per_day: 100, observed_income_per_day: 150, income_lift_pct: 50,
  baseline_fans_per_dollar: 2, observed_fans_per_dollar: 3, fans_per_dollar_lift_pct: 50,
};

// ── sanitizer: the code-enforced hard rules ──────────────────────────────────
describe("sanitizeItem enforces the hard rules regardless of model output", () => {
  it("CONFOUNDED → forces unreadable + a warning, even if the model said scale", () => {
    const e = exp({ id: "e1", status: "confounded", confounded_reason: "Another change on 2026-06-13." });
    const out = sanitizeItem(
      { experiment_id: "e1", status_line: "Big winner!", read: "Keyword X clearly drove +200%", recommended_action: "scale", confound_warning: null },
      e,
    );
    expect(out.recommended_action).toBe("unreadable"); // model's "scale" overridden
    expect(out.confound_warning).toContain("2026-06-13");
  });

  it("RUNNING → downgrades scale/kill to hold (no winner on an unfinished window)", () => {
    const e = exp({ id: "e2", status: "running" });
    const out = sanitizeItem({ experiment_id: "e2", status_line: "...", read: "...", recommended_action: "scale", confound_warning: null }, e);
    expect(out.recommended_action).toBe("hold");
    expect(out.confound_warning).toMatch(/still open|early/i);
  });

  it("INSUFFICIENT_DATA → forces unreadable", () => {
    const e = exp({ id: "e3", status: "insufficient_data" });
    const out = sanitizeItem({ experiment_id: "e3", status_line: "...", read: "...", recommended_action: "kill", confound_warning: null }, e);
    expect(out.recommended_action).toBe("unreadable");
  });

  it("CONCLUDED → a real scale/kill verdict passes through unchanged", () => {
    const e = exp({ id: "e4", status: "concluded", metrics: CONCLUDED_METRICS });
    const out = sanitizeItem({ experiment_id: "e4", status_line: "+50% fans/day", read: "Strong, sustained lift", recommended_action: "scale", confound_warning: null }, e);
    expect(out.recommended_action).toBe("scale");
    expect(out.confound_warning).toBeNull();
  });

  it("clamps an unknown action to unreadable", () => {
    const e = exp({ id: "e5", status: "concluded", metrics: CONCLUDED_METRICS });
    const out = sanitizeItem({ experiment_id: "e5", status_line: "x", read: "y", recommended_action: "yolo" as any, confound_warning: null }, e);
    expect(out.recommended_action).toBe("unreadable");
  });
});

// ── input builder ────────────────────────────────────────────────────────────
describe("buildDigestInput", () => {
  it("exposes status + windows and only includes movement when concluded", () => {
    const input = buildDigestInput([
      exp({ id: "a", status: "running" }),
      exp({ id: "b", status: "concluded", metrics: CONCLUDED_METRICS }),
    ]) as any;
    expect(input.experiments[0].status).toBe("running");
    expect(input.experiments[0].movement).toBeNull();
    expect(input.experiments[1].movement.fans_lift_pct).toBe(50);
  });
});

// ── rule-based generation still re-enforces the hard rules ───────────────────
describe("generateDailyDigest (rule-based)", () => {
  it("builds reads deterministically and never lets a confounded window carry a verdict", async () => {
    const experiments = [
      exp({ id: "e1", status: "confounded", confounded_reason: "overlapping change" }),
      exp({ id: "e2", status: "concluded", metrics: CONCLUDED_METRICS }),
    ];
    const out = await generateDailyDigest(experiments);

    const e1 = out.items.find((i) => i.experiment_id === "e1")!;
    const e2 = out.items.find((i) => i.experiment_id === "e2")!;
    expect(e1.recommended_action).toBe("unreadable"); // confounded → never a verdict
    expect(e1.confound_warning).toBeTruthy();
    expect(e2.recommended_action).toBe("scale"); // +50% income & efficiency → scale
    expect(out.model).toBe("rule-based"); // no LLM
    expect(out.prose).toMatch(/2 experiments/);
  });

  it("running window stays an early read (never scale/kill)", async () => {
    const out = await generateDailyDigest([exp({ id: "r1", status: "running", metrics: CONCLUDED_METRICS })]);
    expect(out.items[0].recommended_action).toBe("hold");
    expect(out.items[0].confound_warning).toMatch(/still open|early/i);
  });

  it("returns an empty digest with no experiments", async () => {
    const out = await generateDailyDigest([]);
    expect(out.items).toEqual([]);
    expect(out.prose).toMatch(/no running/i);
  });
});
