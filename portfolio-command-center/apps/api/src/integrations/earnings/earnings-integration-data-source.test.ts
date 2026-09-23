import { describe, expect, it, vi } from "vitest";
import { unavailable, type AccountSummary, type EarningsEvent, type LiveData, type Position } from "@pcc/shared";
import type { PortfolioDataSource } from "../../domain/data-sources/index.js";
import { EarningsIntegrationDataSource } from "./earnings-integration-data-source.js";
import type { EarningsService } from "./earnings-service.js";

const LIVE_META = { source: "finnhub", status: "live" as const, timestamp: new Date().toISOString() };

function makePosition(symbol: string): Position {
  return {
    symbol,
    shares: 1,
    averageCost: 1,
    currentPrice: 1,
    marketValue: 1,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    weight: 1,
    dailyChangePercent: 0,
    contractId: 1,
    description: symbol,
    currency: "USD",
    assetClass: "STK",
    sector: null,
    country: null,
    realizedPnl: 0,
    dailyPnl: null,
  };
}

function fakeEarningsService(): EarningsService {
  return {
    getForSymbol: vi.fn(async () => ({ data: [], meta: LIVE_META }) as LiveData<EarningsEvent[]>),
    getUpcomingForSymbols: vi.fn(async () => ({ data: [], meta: LIVE_META }) as LiveData<EarningsEvent[]>),
  } as unknown as EarningsService;
}

describe("EarningsIntegrationDataSource — no holdings resolvable", () => {
  it("reports unavailable rather than inventing a symbol list", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "not connected"),
      getPositions: async (): Promise<LiveData<Position[]>> => unavailable("IBKR", "IBKR is not connected yet."),
    };
    const earningsService = fakeEarningsService();
    const ds = new EarningsIntegrationDataSource(earningsService, portfolioDataSource);

    const result = await ds.getUpcomingPortfolioEarnings("user-1");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
    expect(earningsService.getUpcomingForSymbols).not.toHaveBeenCalled();
  });
});

describe("EarningsIntegrationDataSource — holdings resolved from PortfolioDataSource", () => {
  it("passes deduplicated, uppercased held symbols to EarningsService", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "n/a"),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: [makePosition("WDC"), makePosition("wdc")], meta: LIVE_META }),
    };
    const earningsService = fakeEarningsService();
    const ds = new EarningsIntegrationDataSource(earningsService, portfolioDataSource);

    await ds.getUpcomingPortfolioEarnings("user-1");
    expect(earningsService.getUpcomingForSymbols).toHaveBeenCalledWith(["WDC"], 30);
  });

  it("getEarningsForSymbol delegates straight to EarningsService", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "n/a"),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: [], meta: LIVE_META }),
    };
    const earningsService = fakeEarningsService();
    const ds = new EarningsIntegrationDataSource(earningsService, portfolioDataSource);

    await ds.getEarningsForSymbol("AAPL", 5);
    expect(earningsService.getForSymbol).toHaveBeenCalledWith("AAPL", 5);
  });
});
