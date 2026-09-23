import { describe, expect, it } from "vitest";
import { isLikelyDuplicate, normalizeUrlForDedup } from "./dedup.js";

describe("normalizeUrlForDedup", () => {
  it("strips utm_ tracking params", () => {
    expect(normalizeUrlForDedup("https://example.com/story?utm_source=x&utm_medium=y")).toBe("https://example.com/story");
  });

  it("strips known referral params (ref, src, cmpid)", () => {
    expect(normalizeUrlForDedup("https://example.com/story?ref=abc&src=def&cmpid=123")).toBe("https://example.com/story");
  });

  it("strips a trailing slash", () => {
    expect(normalizeUrlForDedup("https://example.com/story/")).toBe("https://example.com/story");
  });

  it("lowercases the result", () => {
    expect(normalizeUrlForDedup("https://Example.com/Story")).toBe("https://example.com/story");
  });

  it("treats two trivially-different URLs for the same article as equal", () => {
    const a = normalizeUrlForDedup("https://example.com/story?utm_source=newsletter");
    const b = normalizeUrlForDedup("https://example.com/story/");
    expect(a).toBe(b);
  });

  it("falls back to a trimmed, lowercased string for an unparsable URL", () => {
    expect(normalizeUrlForDedup("  Not A URL  ")).toBe("not a url");
  });
});

const baseArticle = {
  headline: "Western Digital reports quarterly earnings beat, raises guidance",
  publishedAt: new Date("2026-01-15T14:00:00Z"),
  relatedSymbols: ["WDC"],
};

describe("isLikelyDuplicate", () => {
  it("flags near-identical headlines published close together for the same symbol", () => {
    const other = {
      headline: "Western Digital reports quarterly earnings beat and raises guidance",
      publishedAt: new Date("2026-01-15T14:05:00Z"),
      relatedSymbols: ["WDC"],
    };
    expect(isLikelyDuplicate(baseArticle, other)).toBe(true);
  });

  it("does not flag distinct stories with dissimilar headlines", () => {
    const other = {
      headline: "Western Digital announces new partnership with cloud storage provider",
      publishedAt: new Date("2026-01-15T14:05:00Z"),
      relatedSymbols: ["WDC"],
    };
    expect(isLikelyDuplicate(baseArticle, other)).toBe(false);
  });

  it("does not flag similar headlines that don't share a related symbol", () => {
    const other = {
      headline: "Western Digital reports quarterly earnings beat, raises guidance",
      publishedAt: new Date("2026-01-15T14:05:00Z"),
      relatedSymbols: ["CLS"],
    };
    expect(isLikelyDuplicate(baseArticle, other)).toBe(false);
  });

  it("does not flag similar headlines published more than 24h apart", () => {
    const other = {
      headline: "Western Digital reports quarterly earnings beat, raises guidance",
      publishedAt: new Date("2026-01-17T14:00:00Z"),
      relatedSymbols: ["WDC"],
    };
    expect(isLikelyDuplicate(baseArticle, other)).toBe(false);
  });
});
