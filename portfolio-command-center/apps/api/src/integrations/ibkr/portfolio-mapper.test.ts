import { describe, expect, it } from "vitest";
import { applyPositionWeights, mapAccountSummary, mapPosition } from "./portfolio-mapper.js";
import type { IbkrAccountSummaryResponse, IbkrLedgerResponse, IbkrPosition } from "./types.js";

// Synthetic fixtures shaped to match IBKR's documented response fields —
// see __fixtures__/README.md. Not real account data.

const FIXTURE_POSITION_A: IbkrPosition = {
  conid: 111111,
  contractDesc: "TEST",
  ticker: "TEST",
  position: 10,
  avgCost: 100,
  avgPrice: 100,
  mktPrice: 110,
  mktValue: 1100,
  currency: "USD",
  unrealizedPnl: 100,
  realizedPnl: 0,
  assetClass: "STK",
  sector: "Technology",
  countryCode: "US",
};

const FIXTURE_POSITION_B: IbkrPosition = {
  conid: 222222,
  contractDesc: "SAMPLE",
  ticker: "SAMPLE",
  position: 5,
  avgCost: 200,
  mktPrice: 180,
  mktValue: 900,
  currency: "USD",
  unrealizedPnl: -100,
  realizedPnl: 50,
  assetClass: "STK",
  sector: "Healthcare",
  countryCode: "US",
};

const FIXTURE_SUMMARY: IbkrAccountSummaryResponse = {
  netliquidation: { amount: 2000, currency: "USD" },
  totalcashvalue: { amount: 1000, currency: "USD" },
  buyingpower: { amount: 4000, currency: "USD" },
  excessliquidity: { amount: 1800, currency: "USD" },
  maintmarginreq: { amount: 200, currency: "USD" },
  initmarginreq: { amount: 250, currency: "USD" },
  grosspositionvalue: { amount: 2000, currency: "USD" },
};

const FIXTURE_LEDGER: IbkrLedgerResponse = {
  BASE: { cashbalance: 1000, netliquidationvalue: 2000, currency: "USD" },
};

describe("mapPosition", () => {
  it("maps IBKR fields to Position, preferring a live quote price over the stale mktPrice", () => {
    const mapped = mapPosition(FIXTURE_POSITION_A, 115, 2.5);
    expect(mapped.symbol).toBe("TEST");
    expect(mapped.shares).toBe(10);
    expect(mapped.averageCost).toBe(100);
    expect(mapped.currentPrice).toBe(115);
    expect(mapped.marketValue).toBe(1100);
    expect(mapped.unrealizedPnl).toBe(100);
    expect(mapped.dailyChangePercent).toBe(2.5);
    expect(mapped.contractId).toBe(111111);
    expect(mapped.sector).toBe("Technology");
  });

  it("falls back to IBKR's own mktPrice when no live quote is available", () => {
    const mapped = mapPosition(FIXTURE_POSITION_A, null, null);
    expect(mapped.currentPrice).toBe(110);
  });

  it("computes unrealizedPnlPercent from unrealizedPnl and cost basis (IBKR doesn't return this directly)", () => {
    const mapped = mapPosition(FIXTURE_POSITION_A, null, null);
    // unrealizedPnl 100 / costBasis (100 * 10 = 1000) * 100 = 10%
    expect(mapped.unrealizedPnlPercent).toBeCloseTo(10);
  });

  it("leaves weight null — it is filled in later by applyPositionWeights", () => {
    const mapped = mapPosition(FIXTURE_POSITION_A, null, null);
    expect(mapped.weight).toBeNull();
  });

  it("returns null fields rather than throwing when optional data is missing", () => {
    const sparse: IbkrPosition = { conid: 333, position: 1 };
    const mapped = mapPosition(sparse, null, null);
    expect(mapped.symbol).toBe("333");
    expect(mapped.averageCost).toBeNull();
    expect(mapped.currentPrice).toBeNull();
    expect(mapped.sector).toBeNull();
  });
});

describe("applyPositionWeights", () => {
  it("computes weight_i = marketValue_i / netLiquidation, matching docs/IBKR_INTEGRATION.md §7", () => {
    const positions = [mapPosition(FIXTURE_POSITION_A, null, null), mapPosition(FIXTURE_POSITION_B, null, null)];
    const weighted = applyPositionWeights(positions, 2000);
    expect(weighted[0]?.weight).toBeCloseTo(55); // 1100 / 2000 * 100
    expect(weighted[1]?.weight).toBeCloseTo(45); // 900 / 2000 * 100
  });

  it("leaves weight null when netLiquidation is unavailable, never a guessed number", () => {
    const positions = [mapPosition(FIXTURE_POSITION_A, null, null)];
    const weighted = applyPositionWeights(positions, null);
    expect(weighted[0]?.weight).toBeNull();
  });
});

describe("mapAccountSummary", () => {
  it("reads the documented /summary fields", () => {
    const mapped = mapAccountSummary(FIXTURE_SUMMARY, FIXTURE_LEDGER, []);
    expect(mapped.netLiquidation).toBe(2000);
    expect(mapped.cash).toBe(1000);
    expect(mapped.buyingPower).toBe(4000);
    expect(mapped.excessLiquidity).toBe(1800);
    expect(mapped.margin).toBe(200); // maintenance margin preferred over initial
  });

  it("falls back to the ledger's BASE row when /summary omits a field", () => {
    const summaryWithoutNetLiq: IbkrAccountSummaryResponse = { ...FIXTURE_SUMMARY, netliquidation: undefined };
    const mapped = mapAccountSummary(summaryWithoutNetLiq, FIXTURE_LEDGER, []);
    expect(mapped.netLiquidation).toBe(2000);
  });

  it("aggregates unrealizedPnl/realizedPnl from positions rather than trusting a single account-level field", () => {
    const mapped = mapAccountSummary(FIXTURE_SUMMARY, FIXTURE_LEDGER, [FIXTURE_POSITION_A, FIXTURE_POSITION_B]);
    expect(mapped.unrealizedPnl).toBe(0); // 100 + (-100)
    expect(mapped.realizedPnl).toBe(50); // 0 + 50
  });

  it("leaves the PnL aggregate null if any position is missing that field, rather than under-counting silently", () => {
    const incomplete: IbkrPosition = { ...FIXTURE_POSITION_B, unrealizedPnl: undefined };
    const mapped = mapAccountSummary(FIXTURE_SUMMARY, FIXTURE_LEDGER, [FIXTURE_POSITION_A, incomplete]);
    expect(mapped.unrealizedPnl).toBeNull();
  });

  it("computes leverage = grossPositionValue / netLiquidation as a documented derivative, not an IBKR field", () => {
    const mapped = mapAccountSummary(FIXTURE_SUMMARY, FIXTURE_LEDGER, []);
    expect(mapped.leverage).toBeCloseTo(1); // 2000 / 2000
  });

  it("always returns dailyPnl null in Phase 2 (requires the PnL streaming endpoint, out of scope)", () => {
    const mapped = mapAccountSummary(FIXTURE_SUMMARY, FIXTURE_LEDGER, []);
    expect(mapped.dailyPnl).toBeNull();
  });

  it("returns nulls rather than throwing when both /summary and /ledger are empty", () => {
    const mapped = mapAccountSummary({}, null, []);
    expect(mapped.netLiquidation).toBeNull();
    expect(mapped.cash).toBeNull();
    expect(mapped.margin).toBeNull();
  });
});
