import { describe, expect, it } from "vitest";
import { deriveConsensusRating, normalizeAnalystEstimate, normalizeUpgradeDowngrade } from "./normalizer.js";
import type { FinnhubPriceTarget, FinnhubRecommendationTrend, FinnhubUpgradeDowngrade } from "./types.js";

function trend(overrides: Partial<FinnhubRecommendationTrend>): FinnhubRecommendationTrend {
  return { symbol: "WDC", period: "2026-01-01", strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0, ...overrides };
}

describe("deriveConsensusRating", () => {
  it("derives Strong Buy when strongBuy dominates", () => {
    expect(deriveConsensusRating(trend({ strongBuy: 10 }))).toBe("Strong Buy");
  });

  it("derives Buy for a moderately bullish mix", () => {
    expect(deriveConsensusRating(trend({ buy: 8, hold: 2 }))).toBe("Buy");
  });

  it("derives Hold for a balanced mix", () => {
    expect(deriveConsensusRating(trend({ buy: 2, hold: 6, sell: 2 }))).toBe("Hold");
  });

  it("derives Sell for a moderately bearish mix", () => {
    expect(deriveConsensusRating(trend({ sell: 8, hold: 2 }))).toBe("Sell");
  });

  it("derives Strong Sell when strongSell dominates", () => {
    expect(deriveConsensusRating(trend({ strongSell: 10 }))).toBe("Strong Sell");
  });

  it("returns null when there are no analysts at all", () => {
    expect(deriveConsensusRating(trend({}))).toBeNull();
  });
});

describe("normalizeAnalystEstimate", () => {
  const TARGET: FinnhubPriceTarget = { symbol: "WDC", targetHigh: 90, targetLow: 60, targetMean: 75, targetMedian: 74, lastUpdated: "2026-01-15" };
  const TREND = trend({ period: "2026-01-01", buy: 8, hold: 2 });

  it("combines trend and target data into one snapshot", () => {
    const result = normalizeAnalystEstimate("WDC", TREND, TARGET);
    expect(result.averageTarget).toBe(75);
    expect(result.highTarget).toBe(90);
    expect(result.lowTarget).toBe(60);
    expect(result.consensusRating).toBe("Buy");
    expect(result.analystCount).toBe(10);
    expect(result.provider).toBe("finnhub");
  });

  it("produces a stable externalId keyed by symbol and trend period", () => {
    const result = normalizeAnalystEstimate("WDC", TREND, TARGET);
    expect(result.externalId).toBe("WDC-2026-01-01");
  });

  it("handles a missing price target without failing — null target fields, trend data still present", () => {
    const result = normalizeAnalystEstimate("WDC", TREND, null);
    expect(result.averageTarget).toBeNull();
    expect(result.consensusRating).toBe("Buy");
  });

  it("handles a missing trend without failing — null consensus, target fields still present", () => {
    const result = normalizeAnalystEstimate("WDC", null, TARGET);
    expect(result.consensusRating).toBeNull();
    expect(result.analystCount).toBeNull();
    expect(result.averageTarget).toBe(75);
  });
});

describe("normalizeUpgradeDowngrade", () => {
  const RAW: FinnhubUpgradeDowngrade = {
    symbol: "WDC",
    company: "Morgan Stanley",
    gradeTime: 1732104000,
    fromGrade: "Hold",
    toGrade: "Buy",
    action: "up",
  };

  it("maps firm/previous/new/action straight through", () => {
    const result = normalizeUpgradeDowngrade("WDC", RAW);
    expect(result.firm).toBe("Morgan Stanley");
    expect(result.previousValue).toBe("Hold");
    expect(result.newValue).toBe("Buy");
    expect(result.ratingChange).toBe("up");
  });

  it("converts the unix-seconds gradeTime to a Date", () => {
    const result = normalizeUpgradeDowngrade("WDC", RAW);
    expect(result.revisedAt.toISOString()).toBe(new Date(1732104000 * 1000).toISOString());
  });

  it("produces a stable externalId keyed by symbol, firm, and gradeTime", () => {
    const result = normalizeUpgradeDowngrade("WDC", RAW);
    expect(result.externalId).toBe("WDC-Morgan Stanley-1732104000");
  });
});
