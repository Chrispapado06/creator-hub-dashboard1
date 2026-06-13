import { describe, it, expect } from "vitest";
import { parseCsv, validateCsv } from "./csv";

describe("parseCsv", () => {
  it("parses quoted fields with commas and escaped quotes", () => {
    const grid = parseCsv('name,posting_notes\ngonewild,"hello, ""world"""');
    expect(grid).toEqual([
      ["name", "posting_notes"],
      ["gonewild", 'hello, "world"'],
    ]);
  });

  it("handles CRLF and skips blank lines", () => {
    const grid = parseCsv("name\r\nfoo\r\n\r\nbar\r\n");
    expect(grid).toEqual([["name"], ["foo"], ["bar"]]);
  });
});

describe("validateCsv", () => {
  it("maps header aliases and coerces types", () => {
    const v = validateCsv("subreddit,members,tags,verify\ngonewild,120000,fitness|cosplay,yes");
    expect(v.fileErrors).toEqual([]);
    expect(v.validCount).toBe(1);
    expect(v.rows[0].values).toMatchObject({
      name: "gonewild",
      subscribers: 120000,
      niche: ["fitness", "cosplay"],
      verification_required: true,
    });
  });

  it("flags a missing name column", () => {
    const v = validateCsv("members\n1000");
    expect(v.fileErrors[0]).toMatch(/name/i);
  });

  it("rejects in-file duplicate names", () => {
    const v = validateCsv("name\ngonewild\nGoneWild");
    expect(v.errorCount).toBe(1);
    expect(v.rows[1].errors[0]).toMatch(/duplicate/i);
  });

  it("only includes columns present in the CSV (partial update)", () => {
    const v = validateCsv("name,subscribers\ngonewild,5000");
    expect(Object.keys(v.rows[0].values!)).toEqual(
      expect.arrayContaining(["name", "subscribers"]),
    );
    expect(v.rows[0].values).not.toHaveProperty("posting_notes");
  });
});
