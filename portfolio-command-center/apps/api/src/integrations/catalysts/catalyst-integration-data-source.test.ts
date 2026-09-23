import { describe, expect, it, vi } from "vitest";
import { unavailable, type AccountSummary, type Catalyst, type LiveData, type Position } from "@pcc/shared";
import type { PortfolioDataSource } from "../../domain/data-sources/index.js";
import { CatalystIntegrationDataSource } from "./catalyst-integration-data-source.js";
import type { CatalystService } from "./catalyst-service.js";

const LIVE_META = { source: "catalyst-engine", status: "live" as const, timestamp: new Date().toISOString() };

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

function fakeCatalystService(): CatalystService {
  return {
    getCatalystsForSymbol: vi.fn(async () => ({ data: [], meta: LIVE_META }) as LiveData<Catalyst[]>),
    getPortfolioCatalysts: vi.fn(async () => ({ data: [], meta: LIVE_META }) as LiveData<Catalyst[]>),
  } as unknown as CatalystService;
}

describe("CatalystIntegrationDataSource — no holdings resolvable", () => {
  it("reports unavailable rather than inventing a symbol list", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "not connected"),
      getPositions: async (): Promise<LiveData<Position[]>> => unavailable("IBKR", "IBKR is not connected yet."),
    };
    const catalystService = fakeCatalystService();
    const ds = new CatalystIntegrationDataSource(catalystService, portfolioDataSource);

    const result = await ds.getPortfolioCatalysts("user-1");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
    expect(catalystService.getPortfolioCatalysts).not.toHaveBeenCalled();
  });
});

describe("CatalystIntegrationDataSource — holdings resolved", () => {
  it("passes deduplicated, uppercased held symbols to CatalystService", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "n/a"),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: [makePosition("WDC"), makePosition("wdc")], meta: LIVE_META }),
    };
    const catalystService = fakeCatalystService();
    const ds = new CatalystIntegrationDataSource(catalystService, portfolioDataSource);

    await ds.getPortfolioCatalysts("user-1");
    expect(catalystService.getPortfolioCatalysts).toHaveBeenCalledWith(["WDC"], 50);
  });

  it("getCatalystsForSymbol delegates straight to CatalystService", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "n/a"),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: [], meta: LIVE_META }),
    };
    const catalystService = fakeCatalystService();
    const ds = new CatalystIntegrationDataSource(catalystService, portfolioDataSource);

    await ds.getCatalystsForSymbol("AAPL", 10);
    expect(catalystService.getCatalystsForSymbol).toHaveBeenCalledWith("AAPL", 10);
  });
});
