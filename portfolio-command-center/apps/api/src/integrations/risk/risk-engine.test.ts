import { describe, expect, it } from "vitest";
import type { AccountSummary, Position } from "@pcc/shared";
import { computeConcentrationSlices, computeCurrentRiskMetrics } from "./risk-engine.js";

function makePosition(overrides: Partial<Position>): Position {
  return {
    symbol: "TEST",
    shares: 1,
    averageCost: 1,
    currentPrice: 1,
    marketValue: 1,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    weight: 0,
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

const ACCOUNT: AccountSummary = {
  netLiquidation: 1000,
  dailyPnl: null,
  ytdPnl: null,
  cash: 100,
  buyingPower: 200,
  excessLiquidity: 150,
  margin: 50,
  leverage: 1.1,
  realizedPnl: 0,
  unrealizedPnl: 100,
};

const POSITIONS: Position[] = [
  makePosition({ symbol: "WDC", weight: 60, marketValue: 600, unrealizedPnl: 100, sector: "Technology", country: "US" }),
  makePosition({ symbol: "CLS", weight: 30, marketValue: 300, unrealizedPnl: -20, sector: "Technology", country: "CA" }),
  makePosition({ symbol: "VTI", weight: 10, marketValue: 100, unrealizedPnl: 5, sector: null, country: "US" }),
];

describe("computeCurrentRiskMetrics", () => {
  const metrics = computeCurrentRiskMetrics(POSITIONS, ACCOUNT, "2026-01-01T00:00:00Z");
  const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]));

  it("computes largest position weight as the single biggest holding", () => {
    expect(byKey.largest_position_weight?.value).toBe(60);
    expect(byKey.largest_position_weight?.severity).toBe("high");
  });

  it("computes top-5 and top-10 concentration as the sum of the largest weights", () => {
    expect(byKey.top5_concentration?.value).toBe(100); // only 3 positions exist
    expect(byKey.top10_concentration?.value).toBe(100);
  });

  it("computes sector concentration as the largest single-sector weight sum", () => {
    // Technology = WDC(60) + CLS(30) = 90
    expect(byKey.sector_concentration?.value).toBe(90);
  });

  it("computes country concentration as the largest single-country weight sum", () => {
    // US = WDC(60) + VTI(10) = 70
    expect(byKey.country_concentration?.value).toBe(70);
  });

  it("computes ETF vs equity exposure using the sector-based heuristic", () => {
    // Individual equities = WDC + CLS = 90% (VTI has no sector, heuristically an ETF)
    expect(byKey.etf_vs_equity_exposure?.value).toBe(90);
  });

  it("computes cash exposure from account.cash / netLiquidation", () => {
    expect(byKey.cash_exposure?.value).toBeCloseTo(10, 5);
  });

  it("computes single-name exposure as the count of positions over 10% weight", () => {
    expect(byKey.single_name_exposure?.value).toBe(2); // WDC and CLS
  });

  it("computes gross exposure as sum(abs(marketValue)) / netLiquidation", () => {
    expect(byKey.gross_exposure?.value).toBeCloseTo(100, 5); // 600+300+100 = 1000 / 1000
  });

  it("passes through IBKR's own leverage figure rather than recomputing it", () => {
    expect(byKey.leverage?.value).toBe(1.1);
    expect(byKey.leverage?.source).toContain("IBKR");
  });

  it("computes margin utilization from account.margin / netLiquidation", () => {
    expect(byKey.margin_utilization?.value).toBeCloseTo(5, 5);
  });

  it("computes unrealized P&L concentration as the largest mover's share of total |P&L|", () => {
    // total abs pnl = 100+20+5 = 125; largest mover = WDC at 100 -> 80%
    expect(byKey.unrealized_pnl_concentration?.value).toBeCloseTo(80, 5);
  });

  it("never substitutes a zero for a missing required input — reports null with an explanation instead", () => {
    const emptyAccount: AccountSummary = { ...ACCOUNT, cash: null, netLiquidation: null };
    const empty = computeCurrentRiskMetrics([], emptyAccount, "2026-01-01T00:00:00Z");
    const cash = empty.find((m) => m.key === "cash_exposure");
    expect(cash?.value).toBeNull();
    expect(cash?.explanation).toBeTruthy();
    const largest = empty.find((m) => m.key === "largest_position_weight");
    expect(largest?.value).toBeNull();
  });

  it("every metric documents its own formula and source", () => {
    for (const metric of metrics) {
      expect(metric.formula).toBeTruthy();
      expect(metric.source).toBeTruthy();
    }
  });
});

describe("computeConcentrationSlices", () => {
  const slices = computeConcentrationSlices(POSITIONS);

  it("groups by sector, largest first", () => {
    expect(slices.bySector[0]).toEqual({ label: "Technology", weight: 90 });
  });

  it("groups by country, largest first", () => {
    expect(slices.byCountry[0]).toEqual({ label: "US", weight: 70 });
  });

  it("groups by heuristic asset type", () => {
    const etf = slices.byAssetType.find((s) => s.label === "ETF");
    expect(etf?.weight).toBe(10);
  });

  it("lists top positions sorted by weight descending", () => {
    expect(slices.topPositions.map((p) => p.label)).toEqual(["WDC", "CLS", "VTI"]);
  });
});
