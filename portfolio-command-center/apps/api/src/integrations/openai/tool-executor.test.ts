import { describe, expect, it } from "vitest";
import { unavailable, type AccountSummary, type LiveData, type MarketData, type PortfolioAllocation, type Position } from "@pcc/shared";
import type { MarketDataSource, PortfolioDataSource } from "../../domain/data-sources/index.js";
import type { IbkrPortfolioDataSource } from "../ibkr/ibkr-portfolio-data-source.js";
import { TOOL_EXECUTORS, type ToolServices } from "./tool-executor.js";
import { PORTFOLIO_AI_TOOLS } from "./tool-definitions.js";

const LIVE_META = { source: "IBKR", status: "live" as const, timestamp: new Date().toISOString() };

const SAMPLE_POSITIONS: Position[] = [
  {
    symbol: "WDC",
    shares: 10,
    averageCost: 50,
    currentPrice: 60,
    marketValue: 600,
    unrealizedPnl: 100,
    unrealizedPnlPercent: 20,
    weight: 60,
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
  {
    symbol: "CLS",
    shares: 5,
    averageCost: 80,
    currentPrice: 80,
    marketValue: 400,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    weight: 40,
    dailyChangePercent: -0.5,
    contractId: 2,
    description: "CELESTICA INC",
    currency: "USD",
    assetClass: "STK",
    sector: "Technology",
    country: "CA",
    realizedPnl: 0,
    dailyPnl: null,
  },
];

function fakeServices(overrides: Partial<ToolServices> = {}): ToolServices {
  const portfolioDataSource: PortfolioDataSource = {
    getAccountSummary: async (): Promise<LiveData<AccountSummary>> => ({
      data: {
        netLiquidation: 1000,
        dailyPnl: null,
        ytdPnl: null,
        cash: 100,
        buyingPower: 200,
        excessLiquidity: 150,
        margin: 50,
        leverage: 1,
        realizedPnl: 0,
        unrealizedPnl: 100,
      },
      meta: LIVE_META,
    }),
    getPositions: async (): Promise<LiveData<Position[]>> => ({ data: SAMPLE_POSITIONS, meta: LIVE_META }),
  };

  const ibkrPortfolioDataSource = {
    getAllocation: async (): Promise<LiveData<PortfolioAllocation>> => ({
      data: { bySector: [{ label: "Technology", weight: 100 }], byAssetClass: [{ label: "STK", weight: 100 }] },
      meta: LIVE_META,
    }),
    getPerformance: async (): Promise<LiveData<unknown>> => unavailable("IBKR", "Performance history requires portfolio snapshot history."),
  } as unknown as IbkrPortfolioDataSource;

  const marketDataSource: MarketDataSource = {
    getQuote: async (symbol: string): Promise<LiveData<MarketData>> => unavailable("market-data", `No market data for ${symbol}.`),
    getQuotes: async (): Promise<LiveData<MarketData[]>> => unavailable("market-data", "Market data integration is not connected yet."),
  };

  return { portfolioDataSource, ibkrPortfolioDataSource, marketDataSource, ...overrides };
}

describe("tool-definitions and tool-executor stay in sync", () => {
  it("has exactly one executor per declared tool", () => {
    const declaredNames = PORTFOLIO_AI_TOOLS.map((t) => t.name).sort();
    const executorNames = Object.keys(TOOL_EXECUTORS).sort();
    expect(executorNames).toEqual(declaredNames);
  });
});

describe("read tools delegate to real application services", () => {
  it("getAccountSummary returns the PortfolioDataSource result untouched", async () => {
    const result = (await TOOL_EXECUTORS.getAccountSummary!("user-1", {}, fakeServices())) as LiveData<AccountSummary>;
    expect(result.data?.netLiquidation).toBe(1000);
    expect(result.meta.status).toBe("live");
  });

  it("getPositions returns the full list", async () => {
    const result = (await TOOL_EXECUTORS.getPositions!("user-1", {}, fakeServices())) as LiveData<Position[]>;
    expect(result.data).toHaveLength(2);
  });

  it("getPosition finds a held symbol case-insensitively", async () => {
    const result = (await TOOL_EXECUTORS.getPosition!("user-1", { symbol: "wdc" }, fakeServices())) as LiveData<Position>;
    expect(result.data?.symbol).toBe("WDC");
  });

  it("getPosition returns null data with a reason for a symbol not held — never a fabricated position", async () => {
    const result = (await TOOL_EXECUTORS.getPosition!("user-1", { symbol: "NOPE" }, fakeServices())) as LiveData<Position>;
    expect(result.data).toBeNull();
    expect(result.meta.reason).toContain("NOPE");
  });

  it("getPortfolioAllocation delegates to IbkrPortfolioDataSource", async () => {
    const result = (await TOOL_EXECUTORS.getPortfolioAllocation!("user-1", {}, fakeServices())) as LiveData<PortfolioAllocation>;
    expect(result.data?.bySector[0]?.label).toBe("Technology");
  });

  it("getMarketData returns live price/change for a held symbol without a new IBKR call", async () => {
    const result = (await TOOL_EXECUTORS.getMarketData!("user-1", { symbol: "WDC" }, fakeServices())) as LiveData<MarketData>;
    expect(result.data?.price).toBe(60);
    expect(result.data?.changePercent).toBe(1.5);
  });

  it("getMarketData falls back to MarketDataSource (honestly unavailable in this phase) for a symbol not held", async () => {
    const result = (await TOOL_EXECUTORS.getMarketData!("user-1", { symbol: "MSFT" }, fakeServices())) as LiveData<MarketData>;
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });

  it("getPortfolioContext combines summary, top positions, and allocation", async () => {
    const result = (await TOOL_EXECUTORS.getPortfolioContext!("user-1", {}, fakeServices())) as LiveData<{
      positionCount: number;
      topPositions: unknown[];
    }>;
    expect(result.data?.positionCount).toBe(2);
    expect(result.data?.topPositions).toHaveLength(2);
  });
});

describe("unimplemented-feature tools are honest, not fake", () => {
  it("getRecentTrades reports unavailable with a real reason, never an empty fabricated list", async () => {
    const result = (await TOOL_EXECUTORS.getRecentTrades!("user-1", {}, fakeServices())) as LiveData<unknown>;
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
    expect(result.meta.reason).toBeTruthy();
  });

  it("getOpenOrders reports unavailable", async () => {
    const result = (await TOOL_EXECUTORS.getOpenOrders!("user-1", {}, fakeServices())) as LiveData<unknown>;
    expect(result.meta.status).toBe("unavailable");
  });

  it("getHistoricalPortfolioSnapshots reports unavailable", async () => {
    const result = (await TOOL_EXECUTORS.getHistoricalPortfolioSnapshots!("user-1", {}, fakeServices())) as LiveData<unknown>;
    expect(result.meta.status).toBe("unavailable");
  });

  it("getRiskMetrics reports unavailable", async () => {
    const result = (await TOOL_EXECUTORS.getRiskMetrics!("user-1", {}, fakeServices())) as LiveData<unknown>;
    expect(result.meta.status).toBe("unavailable");
  });

  it("getPortfolioPerformance reports unavailable (no snapshot history yet)", async () => {
    const result = (await TOOL_EXECUTORS.getPortfolioPerformance!("user-1", {}, fakeServices())) as LiveData<unknown>;
    expect(result.meta.status).toBe("unavailable");
  });
});

describe("IBKR-unavailable propagates honestly through every tool that needs it", () => {
  it("getAccountSummary and getPositions surface the real unavailable reason when the underlying source is down", async () => {
    const services = fakeServices({
      portfolioDataSource: {
        getAccountSummary: async () => unavailable("IBKR", "IBKR session expired — re-authenticate at the gateway."),
        getPositions: async () => unavailable("IBKR", "IBKR session expired — re-authenticate at the gateway."),
      },
    });
    const summary = (await TOOL_EXECUTORS.getAccountSummary!("user-1", {}, services)) as LiveData<AccountSummary>;
    expect(summary.data).toBeNull();
    expect(summary.meta.status).toBe("unavailable");
    expect(summary.meta.reason).toContain("re-authenticate");

    const position = (await TOOL_EXECUTORS.getPosition!("user-1", { symbol: "WDC" }, services)) as LiveData<Position>;
    expect(position.data).toBeNull();
    expect(position.meta.status).toBe("unavailable");
  });
});
