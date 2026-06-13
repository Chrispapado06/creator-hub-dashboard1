import { describe, expect, it } from "vitest";
import { isStale, rankSubreddits } from "./matching";
import type { CatalogSubreddit, ViabilityInputs } from "./types";

const NOW = new Date("2026-06-13T00:00:00Z");

function sub(overrides: Partial<CatalogSubreddit>): CatalogSubreddit {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    name: "test",
    display_name: null,
    subscribers: 100000,
    nsfw: true,
    niche: [],
    verification_required: false,
    min_karma: 0,
    min_account_age_days: 0,
    allows_promo: true,
    posting_notes: null,
    last_verified: "2026-06-01",
    active: true,
    ...overrides,
  };
}

const profile: Pick<
  ViabilityInputs,
  "niche" | "startingKarma" | "startingAccountAgeDays" | "verificationWilling"
> = {
  niche: ["fitness", "cosplay"],
  startingKarma: 50,
  startingAccountAgeDays: 10,
  verificationWilling: false,
};

describe("isStale", () => {
  it("null last_verified is stale", () => {
    expect(isStale(null, NOW)).toBe(true);
  });
  it("44 days ago is not stale", () => {
    expect(isStale("2026-04-30", NOW)).toBe(false); // 44 days
    expect(isStale("2026-05-30", NOW)).toBe(false); // 14 days
  });
  it("exactly 45 days is stale", () => {
    expect(isStale("2026-04-29", NOW)).toBe(true);
  });
});

describe("rankSubreddits exclusions", () => {
  it("excludes inactive subs", () => {
    const out = rankSubreddits(profile, [sub({ name: "x", active: false })], NOW);
    expect(out).toHaveLength(0);
  });

  it("excludes verification-required subs when creator won't verify", () => {
    const out = rankSubreddits(
      profile,
      [sub({ name: "v", verification_required: true })],
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it("includes verification subs when creator will verify", () => {
    const out = rankSubreddits(
      { ...profile, verificationWilling: true },
      [sub({ name: "v", verification_required: true })],
      NOW,
    );
    expect(out).toHaveLength(1);
  });
});

describe("rankSubreddits ordering", () => {
  it("ranks niche-matching subs above non-matching", () => {
    const out = rankSubreddits(profile, [
      sub({ name: "nomatch", niche: ["gaming"], subscribers: 500000 }),
      sub({ name: "match", niche: ["fitness"], subscribers: 1000 }),
    ], NOW);
    expect(out[0].subreddit.name).toBe("match");
    expect(out[0].nicheOverlap).toContain("fitness");
  });

  it("down-weights stale subs", () => {
    const fresh = rankSubreddits(profile, [sub({ name: "fresh", niche: ["fitness"], last_verified: "2026-06-10" })], NOW)[0];
    const stale = rankSubreddits(profile, [sub({ name: "stale", niche: ["fitness"], last_verified: "2026-01-01" })], NOW)[0];
    expect(stale.stale).toBe(true);
    expect(stale.score).toBeLessThan(fresh.score);
  });

  it("flags ineligible (needs warming) subs but keeps them", () => {
    const out = rankSubreddits(profile, [sub({ name: "gated", niche: ["fitness"], min_karma: 1000, min_account_age_days: 90 })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].eligibleNow).toBe(false);
  });

  it("respects the limit", () => {
    const subs = Array.from({ length: 10 }, (_, i) => sub({ name: `s${i}`, niche: ["fitness"] }));
    expect(rankSubreddits(profile, subs, NOW, 3)).toHaveLength(3);
  });
});
