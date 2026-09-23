import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@pcc/db";
import { unavailable, type AccountSummary, type LiveData, type Position } from "@pcc/shared";
import type { PortfolioDataSource } from "../../domain/data-sources/index.js";
import { RiskService } from "./risk-service.js";

const LIVE_META = { source: "IBKR", status: "live" as const, timestamp: new Date().toISOString() };

afterAll(async () => {
  await prisma.$disconnect();
});

describe("RiskService — portfolio data unavailable", () => {
  it("reports unavailable rather than computing metrics from missing data", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "IBKR is not connected yet."),
      getPositions: async (): Promise<LiveData<Position[]>> => unavailable("IBKR", "IBKR is not connected yet."),
    };
    const service = new RiskService(portfolioDataSource, prisma);
    const result = await service.getPortfolioRiskSummary("user-1");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });
});

describe("RiskService — portfolio data available", () => {
  const POSITIONS: Position[] = [
    {
      symbol: "WDC",
      shares: 10,
      averageCost: 50,
      currentPrice: 60,
      marketValue: 600,
      unrealizedPnl: 100,
      unrealizedPnlPercent: 20,
      weight: 100,
      dailyChangePercent: 1.5,
      contractId: 1,
      description: "WESTERN DIGITAL CORP",
      currency: "USD",
      assetClass: "STK",
      sector: "Technology",
      country: "US",
      realizedPnl: 0,
      dailyPnl: null,
    },
  ];
  const ACCOUNT: AccountSummary = {
    netLiquidation: 600,
    dailyPnl: null,
    ytdPnl: null,
    cash: 0,
    buyingPower: 0,
    excessLiquidity: 0,
    margin: 0,
    leverage: 1,
    realizedPnl: 0,
    unrealizedPnl: 100,
  };

  function fakePortfolio(status: "live" | "cached" = "live"): PortfolioDataSource {
    const meta = { ...LIVE_META, status };
    return {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => ({ data: ACCOUNT, meta }),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: POSITIONS, meta }),
    };
  }

  it("computes metrics and reports live status when the underlying data is live", async () => {
    const service = new RiskService(fakePortfolio("live"), prisma);
    const result = await service.getPortfolioRiskSummary("user-2");
    expect(result.meta.status).toBe("live");
    expect(result.data?.metrics.length).toBeGreaterThan(0);
    expect(result.data?.bySector[0]).toEqual({ label: "Technology", weight: 100 });
  });

  it("reports cached status when the underlying portfolio data is cached", async () => {
    const service = new RiskService(fakePortfolio("cached"), prisma);
    const result = await service.getPortfolioRiskSummary("user-3");
    expect(result.meta.status).toBe("cached");
  });
});
