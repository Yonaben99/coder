import { describe, expect, it } from "vitest";
import type { Position } from "@pcc/shared";
import { classifyAssetType } from "./asset-type.js";

function makePosition(overrides: Partial<Position>): Position {
  return {
    symbol: "TEST",
    shares: 1,
    averageCost: 1,
    currentPrice: 1,
    marketValue: 1,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    weight: 1,
    dailyChangePercent: 0,
    contractId: 1,
    description: null,
    currency: "USD",
    assetClass: "STK",
    sector: null,
    country: null,
    realizedPnl: 0,
    dailyPnl: null,
    ...overrides,
  };
}

describe("classifyAssetType", () => {
  it("treats a STK position with a sector as an individual equity", () => {
    expect(classifyAssetType(makePosition({ assetClass: "STK", sector: "Technology" }))).toBe("Individual Equity");
  });

  it("treats a STK position with no sector as a likely ETF", () => {
    expect(classifyAssetType(makePosition({ assetClass: "STK", sector: null }))).toBe("ETF");
  });

  it("treats a non-STK asset class as Other", () => {
    expect(classifyAssetType(makePosition({ assetClass: "BOND", sector: null }))).toBe("Other");
    expect(classifyAssetType(makePosition({ assetClass: null, sector: null }))).toBe("Other");
  });
});
