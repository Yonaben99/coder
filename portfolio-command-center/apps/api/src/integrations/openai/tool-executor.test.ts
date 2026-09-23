import { describe, expect, it } from "vitest";
import {
  unavailable,
  type AccountSummary,
  type AlertItem,
  type AnalystEstimateSummary,
  type AnalystRevisionItem,
  type Catalyst,
  type EarningsEvent,
  type LiveData,
  type MarketData,
  type MonitoringStatus,
  type NewsItem,
  type PortfolioAllocation,
  type PortfolioNewsSummary,
  type PortfolioRiskSummary,
  type Position,
} from "@pcc/shared";
import type {
  AnalystDataSource,
  CatalystDataSource,
  EarningsDataSource,
  MarketDataSource,
  NewsDataSource,
  PortfolioDataSource,
  RiskDataSource,
} from "../../domain/data-sources/index.js";
import type { IbkrPortfolioDataSource } from "../ibkr/ibkr-portfolio-data-source.js";
import type { AlertService } from "../alerts/alert-service.js";
import type { Scheduler } from "../scheduler/scheduler.js";
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

  const SAMPLE_ARTICLE: NewsItem = {
    id: "article-1",
    symbol: "WDC",
    relatedSymbols: ["WDC"],
    headline: "Western Digital reports quarterly earnings beat",
    source: "Reuters",
    provider: "finnhub",
    url: "https://example.com/article-1",
    publishedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    categories: ["earnings"],
    relevance: "high",
    summary: null,
  };

  const newsDataSource: NewsDataSource = {
    getRecentNews: async (): Promise<LiveData<NewsItem[]>> => ({ data: [SAMPLE_ARTICLE], meta: LIVE_META }),
    getPortfolioNews: async (): Promise<LiveData<NewsItem[]>> => ({ data: [SAMPLE_ARTICLE], meta: LIVE_META }),
    getNewsForSymbol: async (): Promise<LiveData<NewsItem[]>> => ({ data: [SAMPLE_ARTICLE], meta: LIVE_META }),
    getPortfolioNewsSummary: async (): Promise<LiveData<PortfolioNewsSummary[]>> => ({
      data: [{ symbol: "WDC", updateCount: 1 }],
      meta: LIVE_META,
    }),
    getMaterialPortfolioUpdates: async (): Promise<LiveData<NewsItem[]>> => ({ data: [SAMPLE_ARTICLE], meta: LIVE_META }),
    getArticleById: async (): Promise<NewsItem | null> => SAMPLE_ARTICLE,
  };

  const SAMPLE_ESTIMATE: AnalystEstimateSummary = {
    symbol: "WDC",
    averageTarget: 75,
    highTarget: 90,
    lowTarget: 60,
    consensusRating: "Buy",
    analystCount: 12,
    source: "Finnhub consensus",
    provider: "finnhub",
    asOf: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
  };
  const SAMPLE_REVISION: AnalystRevisionItem = {
    id: "revision-1",
    symbol: "WDC",
    firm: "Morgan Stanley",
    previousValue: "Hold",
    newValue: "Buy",
    ratingChange: "up",
    source: "Finnhub",
    provider: "finnhub",
    revisedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
  };
  const analystDataSource: AnalystDataSource = {
    getAnalystEstimate: async (): Promise<LiveData<AnalystEstimateSummary>> => ({ data: SAMPLE_ESTIMATE, meta: LIVE_META }),
    getAnalystRevisions: async (): Promise<LiveData<AnalystRevisionItem[]>> => ({ data: [SAMPLE_REVISION], meta: LIVE_META }),
  };

  const SAMPLE_EARNINGS: EarningsEvent = {
    id: "earnings-1",
    symbol: "WDC",
    period: "Q3 2026",
    reportDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    announcementTiming: "amc",
    estimatedEps: 1.5,
    estimatedRevenue: 4_000_000_000,
    actualEps: null,
    actualRevenue: null,
    status: "estimated",
    source: "Finnhub",
    provider: "finnhub",
    retrievedAt: new Date().toISOString(),
  };
  const earningsDataSource: EarningsDataSource = {
    getEarningsForSymbol: async (): Promise<LiveData<EarningsEvent[]>> => ({ data: [SAMPLE_EARNINGS], meta: LIVE_META }),
    getUpcomingPortfolioEarnings: async (): Promise<LiveData<EarningsEvent[]>> => ({ data: [SAMPLE_EARNINGS], meta: LIVE_META }),
  };

  const SAMPLE_CATALYST: Catalyst = {
    id: "catalyst-1",
    symbol: "WDC",
    type: "earnings",
    title: "WDC earnings (Q3 2026)",
    description: "est. EPS 1.5",
    expectedDate: SAMPLE_EARNINGS.reportDate,
    dateConfirmed: false,
    status: "upcoming",
    relevance: "high",
    source: "Finnhub",
    url: null,
    publishedAt: null,
    retrievedAt: new Date().toISOString(),
  };
  const catalystDataSource: CatalystDataSource = {
    getCatalystsForSymbol: async (): Promise<LiveData<Catalyst[]>> => ({ data: [SAMPLE_CATALYST], meta: LIVE_META }),
    getPortfolioCatalysts: async (): Promise<LiveData<Catalyst[]>> => ({ data: [SAMPLE_CATALYST], meta: LIVE_META }),
  };

  const SAMPLE_RISK_SUMMARY: PortfolioRiskSummary = {
    metrics: [
      {
        key: "largest_position_weight",
        label: "Largest Position Weight",
        value: 60,
        unit: "percent",
        severity: "high",
        explanation: "WDC is the largest position at 60.0% of net liquidation.",
        formula: "max(position.weight) across all current positions",
        source: "Computed from current IBKR positions",
        asOf: new Date().toISOString(),
      },
    ],
    bySector: [{ label: "Technology", weight: 100 }],
    byCountry: [{ label: "US", weight: 60 }],
    byAssetType: [{ label: "Individual Equity", weight: 100 }],
    topPositions: [{ label: "WDC", weight: 60 }],
    asOf: new Date().toISOString(),
  };
  const riskDataSource: RiskDataSource = {
    getPortfolioRiskSummary: async (): Promise<LiveData<PortfolioRiskSummary>> => ({ data: SAMPLE_RISK_SUMMARY, meta: LIVE_META }),
  };

  const SAMPLE_ALERT: AlertItem = {
    id: "alert-1",
    category: "price_movement",
    symbol: "WDC",
    severity: "warning",
    title: "WDC moved +6.0% today",
    explanation: "WDC's daily change (6.0%) exceeds the 5% threshold.",
    sourceUrl: null,
    readState: "new",
    firstDetectedAt: new Date().toISOString(),
    lastDetectedAt: new Date().toISOString(),
  };
  const alertService = {
    getActiveAlerts: async () => [SAMPLE_ALERT],
    getRecentAlerts: async () => [SAMPLE_ALERT],
    getAlertHistory: async () => [SAMPLE_ALERT],
  } as unknown as AlertService;

  const SAMPLE_MONITORING_STATUS: MonitoringStatus = {
    schedulerRunning: true,
    jobs: [{ name: "refreshNews", intervalMinutes: 10, lastRunAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), lastError: null }],
  };
  const scheduler = { getStatus: () => SAMPLE_MONITORING_STATUS } as unknown as Scheduler;

  return {
    portfolioDataSource,
    ibkrPortfolioDataSource,
    marketDataSource,
    newsDataSource,
    analystDataSource,
    earningsDataSource,
    catalystDataSource,
    riskDataSource,
    alertService,
    scheduler,
    ...overrides,
  };
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

describe("Phase 6 tools delegate to AlertService/Scheduler", () => {
  it("getActiveAlerts returns the active alert list", async () => {
    const result = (await TOOL_EXECUTORS.getActiveAlerts!("user-1", {}, fakeServices())) as AlertItem[];
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe("price_movement");
  });

  it("getRecentAlerts returns the recent alert list", async () => {
    const result = (await TOOL_EXECUTORS.getRecentAlerts!("user-1", {}, fakeServices())) as AlertItem[];
    expect(result).toHaveLength(1);
  });

  it("getAlertHistory returns the alert history", async () => {
    const result = (await TOOL_EXECUTORS.getAlertHistory!("user-1", {}, fakeServices())) as AlertItem[];
    expect(result).toHaveLength(1);
  });

  it("getMonitoringStatus returns the scheduler's real status, never a fabricated 'live monitoring' claim", async () => {
    const result = (await TOOL_EXECUTORS.getMonitoringStatus!("user-1", {}, fakeServices())) as MonitoringStatus;
    expect(result.schedulerRunning).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.name).toBe("refreshNews");
  });
});

describe("Phase 5 tools delegate to AnalystDataSource/EarningsDataSource/CatalystDataSource/RiskDataSource", () => {
  it("getAnalystData uppercases the symbol and returns the estimate untouched", async () => {
    const result = (await TOOL_EXECUTORS.getAnalystData!("user-1", { symbol: "wdc" }, fakeServices())) as LiveData<{ symbol: string }>;
    expect(result.data?.symbol).toBe("WDC");
    expect(result.meta.status).toBe("live");
  });

  it("getAnalystRevisions returns the revision list", async () => {
    const result = (await TOOL_EXECUTORS.getAnalystRevisions!("user-1", { symbol: "WDC" }, fakeServices())) as LiveData<unknown[]>;
    expect(result.data).toHaveLength(1);
  });

  it("getUpcomingEarnings delegates with the userId, not a fabricated symbol list", async () => {
    const result = (await TOOL_EXECUTORS.getUpcomingEarnings!("user-1", {}, fakeServices())) as LiveData<unknown[]>;
    expect(result.data).toHaveLength(1);
  });

  it("getPortfolioCatalysts delegates with the userId", async () => {
    const result = (await TOOL_EXECUTORS.getPortfolioCatalysts!("user-1", {}, fakeServices())) as LiveData<unknown[]>;
    expect(result.data).toHaveLength(1);
  });

  it("getRiskMetrics returns the flattened metrics array, not the full summary", async () => {
    const result = (await TOOL_EXECUTORS.getRiskMetrics!("user-1", {}, fakeServices())) as LiveData<Array<{ key: string }>>;
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.key).toBe("largest_position_weight");
  });

  it("getPortfolioRiskSummary returns the full summary including concentration breakdowns", async () => {
    const result = (await TOOL_EXECUTORS.getPortfolioRiskSummary!("user-1", {}, fakeServices())) as LiveData<{
      metrics: unknown[];
      bySector: unknown[];
    }>;
    expect(result.data?.metrics).toHaveLength(1);
    expect(result.data?.bySector).toHaveLength(1);
  });

  it("Phase 5 tools surface an honest unavailable reason when their data source isn't connected", async () => {
    const services = fakeServices({
      analystDataSource: {
        getAnalystEstimate: async () => unavailable("analyst", "Analyst data integration is not connected yet."),
        getAnalystRevisions: async () => unavailable("analyst", "Analyst data integration is not connected yet."),
      },
      riskDataSource: {
        getPortfolioRiskSummary: async () => unavailable("risk-engine", "IBKR is not connected yet."),
      },
    });
    const analystResult = (await TOOL_EXECUTORS.getAnalystData!("user-1", { symbol: "WDC" }, services)) as LiveData<unknown>;
    expect(analystResult.data).toBeNull();
    expect(analystResult.meta.status).toBe("unavailable");

    const riskResult = (await TOOL_EXECUTORS.getRiskMetrics!("user-1", {}, services)) as LiveData<unknown>;
    expect(riskResult.data).toBeNull();
    expect(riskResult.meta.status).toBe("unavailable");
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

  it("getPortfolioPerformance reports unavailable (no snapshot history yet)", async () => {
    const result = (await TOOL_EXECUTORS.getPortfolioPerformance!("user-1", {}, fakeServices())) as LiveData<unknown>;
    expect(result.meta.status).toBe("unavailable");
  });
});

describe("news tools delegate to NewsDataSource, never a provider directly", () => {
  it("getRecentNews returns the NewsDataSource result untouched", async () => {
    const result = (await TOOL_EXECUTORS.getRecentNews!("user-1", {}, fakeServices())) as LiveData<NewsItem[]>;
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.headline).toContain("earnings");
  });

  it("getPortfolioNews delegates with the userId, not a fabricated symbol list", async () => {
    const result = (await TOOL_EXECUTORS.getPortfolioNews!("user-1", {}, fakeServices())) as LiveData<NewsItem[]>;
    expect(result.data).toHaveLength(1);
  });

  it("getNewsForSymbol uppercases the symbol before delegating", async () => {
    let seenSymbol: string | null = null;
    const services = fakeServices({
      newsDataSource: {
        getRecentNews: async () => ({ data: [], meta: LIVE_META }),
        getPortfolioNews: async () => ({ data: [], meta: LIVE_META }),
        getNewsForSymbol: async (symbol: string) => {
          seenSymbol = symbol;
          return { data: [], meta: LIVE_META };
        },
        getPortfolioNewsSummary: async () => ({ data: [], meta: LIVE_META }),
        getMaterialPortfolioUpdates: async () => ({ data: [], meta: LIVE_META }),
        getArticleById: async () => null,
      },
    });
    await TOOL_EXECUTORS.getNewsForSymbol!("user-1", { symbol: "wdc" }, services);
    expect(seenSymbol).toBe("WDC");
  });

  it("getMaterialPortfolioUpdates delegates to NewsDataSource's own relevance filtering", async () => {
    const result = (await TOOL_EXECUTORS.getMaterialPortfolioUpdates!("user-1", {}, fakeServices())) as LiveData<NewsItem[]>;
    expect(result.data?.[0]?.relevance).toBe("high");
  });

  it("news tools surface an honest unavailable reason when news isn't connected", async () => {
    const services = fakeServices({
      newsDataSource: {
        getRecentNews: async () => unavailable("news", "News integration is not connected yet."),
        getPortfolioNews: async () => unavailable("news", "News integration is not connected yet."),
        getNewsForSymbol: async () => unavailable("news", "News integration is not connected yet."),
        getPortfolioNewsSummary: async () => unavailable("news", "News integration is not connected yet."),
        getMaterialPortfolioUpdates: async () => unavailable("news", "News integration is not connected yet."),
        getArticleById: async () => null,
      },
    });
    const result = (await TOOL_EXECUTORS.getRecentNews!("user-1", {}, services)) as LiveData<NewsItem[]>;
    expect(result.data).toBeNull();
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
