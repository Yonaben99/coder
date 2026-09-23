import { describe, expect, it } from "vitest";
import { normalizeFinnhubArticle } from "./normalizer.js";
import type { FinnhubNewsArticle } from "./types.js";

const RAW: FinnhubNewsArticle = {
  id: 7001,
  category: "company",
  datetime: 1732104000,
  headline: "Western Digital reports quarterly earnings beat, raises full-year guidance",
  related: "WDC,STX",
  source: "Reuters",
  summary: "Western Digital posted revenue and EPS above estimates.",
  url: "https://example.com/wdc-earnings-beat",
};

describe("normalizeFinnhubArticle", () => {
  it("maps provider/externalId/headline/source/url/summary straight through", () => {
    const result = normalizeFinnhubArticle(RAW, "WDC");
    expect(result.provider).toBe("finnhub");
    expect(result.externalId).toBe("7001");
    expect(result.headline).toBe(RAW.headline);
    expect(result.source).toBe("Reuters");
    expect(result.url).toBe(RAW.url);
    expect(result.summary).toBe(RAW.summary);
  });

  it("converts the unix-seconds datetime to a Date", () => {
    const result = normalizeFinnhubArticle(RAW, "WDC");
    expect(result.publishedAt.toISOString()).toBe(new Date(1732104000 * 1000).toISOString());
  });

  it("splits the comma-separated related field into distinct uppercase symbols", () => {
    const result = normalizeFinnhubArticle(RAW, null);
    expect(result.relatedSymbols).toEqual(["WDC", "STX"]);
  });

  it("always includes the queried symbol even when Finnhub's related field omits it", () => {
    const raw: FinnhubNewsArticle = { ...RAW, related: "" };
    const result = normalizeFinnhubArticle(raw, "wdc");
    expect(result.relatedSymbols).toContain("WDC");
  });

  it("deduplicates the queried symbol against related when both are present", () => {
    const result = normalizeFinnhubArticle(RAW, "wdc");
    expect(result.relatedSymbols.filter((s) => s === "WDC")).toHaveLength(1);
  });

  it("treats an empty or missing summary as null rather than an empty string", () => {
    const raw: FinnhubNewsArticle = { ...RAW, summary: "   " };
    const result = normalizeFinnhubArticle(raw, "WDC");
    expect(result.summary).toBeNull();
  });

  it("runs the deterministic categorizer over headline+summary", () => {
    const result = normalizeFinnhubArticle(RAW, "WDC");
    expect(result.categories).toContain("earnings");
    expect(result.relevance).toBe("high");
  });
});
