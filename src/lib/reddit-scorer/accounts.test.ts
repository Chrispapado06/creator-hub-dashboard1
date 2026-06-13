import { describe, expect, it } from "vitest";
import {
  ACCOUNT_BUFFER,
  POSTS_PER_NEW_ACCOUNT_PER_DAY,
  TARGET_DAILY_POSTS_BY_BAND,
  calcAccountsAndProxies,
} from "./accounts";

describe("calcAccountsAndProxies", () => {
  it("skip band needs zero accounts and proxies", () => {
    const p = calcAccountsAndProxies("skip");
    expect(p.accountsNeeded).toBe(0);
    expect(p.proxiesNeeded).toBe(0);
    expect(p.baseAccounts).toBe(0);
  });

  it("viable band: 12/2 = 6 -> x1.2 = 7.2 -> 8 accounts", () => {
    const p = calcAccountsAndProxies("viable");
    expect(p.targetDailyPosts).toBe(12);
    expect(p.baseAccounts).toBe(6);
    expect(p.accountsNeeded).toBe(8);
  });

  it("strong band: 20/2 = 10 -> x1.2 = 12 accounts", () => {
    const p = calcAccountsAndProxies("strong");
    expect(p.baseAccounts).toBe(10);
    expect(p.accountsNeeded).toBe(12);
  });

  it("marginal band: 6/2 = 3 -> x1.2 = 3.6 -> 4 accounts", () => {
    const p = calcAccountsAndProxies("marginal");
    expect(p.baseAccounts).toBe(3);
    expect(p.accountsNeeded).toBe(4);
  });

  it("always 1 dedicated proxy per account", () => {
    for (const band of ["strong", "viable", "marginal", "skip"] as const) {
      const p = calcAccountsAndProxies(band);
      expect(p.proxiesNeeded).toBe(p.accountsNeeded);
    }
  });

  it("applies at least the 20% buffer for non-zero bands", () => {
    for (const band of ["strong", "viable", "marginal"] as const) {
      const p = calcAccountsAndProxies(band);
      expect(p.accountsNeeded).toBeGreaterThanOrEqual(Math.ceil(p.baseAccounts * (1 + ACCOUNT_BUFFER)));
    }
  });

  it("uses the new-account posting limit for sizing", () => {
    expect(POSTS_PER_NEW_ACCOUNT_PER_DAY).toBe(2);
    const p = calcAccountsAndProxies("viable");
    expect(p.postsPerAccountPerDay).toBe(2);
    expect(p.baseAccounts).toBe(Math.ceil(TARGET_DAILY_POSTS_BY_BAND.viable / 2));
  });
});
