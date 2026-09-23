import { describe, expect, it, vi } from "vitest";
import { unavailable, type AccountSummary, type LiveData, type NewsItem, type Position } from "@pcc/shared";
import type { PortfolioDataSource } from "../../domain/data-sources/index.js";
import { NewsIntegrationDataSource } from "./news-integration-data-source.js";
import type { NewsService } from "./news-service.js";

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

const SAMPLE_ARTICLE: NewsItem = {
  id: "a1",
  symbol: "WDC",
  relatedSymbols: ["WDC"],
  headline: "Test",
  source: "Reuters",
  provider: "finnhub",
  url: "https://example.com/a1",
  publishedAt: new Date().toISOString(),
  retrievedAt: new Date().toISOString(),
  categories: ["earnings"],
  relevance: "high",
  summary: null,
};

function fakeNewsService(overrides: Partial<NewsService> = {}): NewsService {
  return {
    getCompanyNews: vi.fn(async () => ({ data: [SAMPLE_ARTICLE], meta: LIVE_META }) as LiveData<NewsItem[]>),
    getMarketNews: vi.fn(async () => ({ data: [SAMPLE_ARTICLE], meta: LIVE_META }) as LiveData<NewsItem[]>),
    getPortfolioNews: vi.fn(async () => ({ data: [SAMPLE_ARTICLE], meta: LIVE_META }) as LiveData<NewsItem[]>),
    getPortfolioNewsSummary: vi.fn(async () => ({ data: [{ symbol: "WDC", updateCount: 1 }], meta: LIVE_META })),
    getArticleById: vi.fn(async () => SAMPLE_ARTICLE),
    ...overrides,
  } as unknown as NewsService;
}

describe("NewsIntegrationDataSource — no holdings resolvable", () => {
  it("reports unavailable rather than inventing a symbol list when IBKR has no positions", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "not connected"),
      getPositions: async (): Promise<LiveData<Position[]>> => unavailable("IBKR", "IBKR is not connected yet."),
    };
    const newsService = fakeNewsService();
    const ds = new NewsIntegrationDataSource(newsService, portfolioDataSource);

    const result = await ds.getPortfolioNews("user-1");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
    expect(newsService.getPortfolioNews).not.toHaveBeenCalled();
  });

  it("reports unavailable for the summary too, with the same honest reason", async () => {
    const portfolioDataSource: PortfolioDataSource = {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "not connected"),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: [], meta: LIVE_META }),
    };
    const ds = new NewsIntegrationDataSource(fakeNewsService(), portfolioDataSource);

    const result = await ds.getPortfolioNewsSummary("user-1");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });
});

describe("NewsIntegrationDataSource — holdings resolved from PortfolioDataSource", () => {
  function fakePortfolio(): PortfolioDataSource {
    return {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "n/a"),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: [makePosition("WDC"), makePosition("wdc")], meta: LIVE_META }),
    };
  }

  it("passes deduplicated, uppercased held symbols to NewsService.getPortfolioNews", async () => {
    const newsService = fakeNewsService();
    const ds = new NewsIntegrationDataSource(newsService, fakePortfolio());

    await ds.getPortfolioNews("user-1");
    expect(newsService.getPortfolioNews).toHaveBeenCalledWith(["WDC"], 50);
  });

  it("getRecentNews delegates straight to NewsService.getMarketNews", async () => {
    const newsService = fakeNewsService();
    const ds = new NewsIntegrationDataSource(newsService, fakePortfolio());
    const result = await ds.getRecentNews(10);
    expect(newsService.getMarketNews).toHaveBeenCalledWith(10);
    expect(result.data).toHaveLength(1);
  });

  it("getNewsForSymbol delegates straight to NewsService.getCompanyNews", async () => {
    const newsService = fakeNewsService();
    const ds = new NewsIntegrationDataSource(newsService, fakePortfolio());
    await ds.getNewsForSymbol("AAPL", 5);
    expect(newsService.getCompanyNews).toHaveBeenCalledWith("AAPL", 5);
  });

  it("getMaterialPortfolioUpdates filters to medium/high relevance only", async () => {
    const lowRelevance: NewsItem = { ...SAMPLE_ARTICLE, id: "a2", relevance: "low" };
    const newsService = fakeNewsService({
      getPortfolioNews: vi.fn(async () => ({ data: [SAMPLE_ARTICLE, lowRelevance], meta: LIVE_META }) as LiveData<NewsItem[]>),
    });
    const ds = new NewsIntegrationDataSource(newsService, fakePortfolio());

    const result = await ds.getMaterialPortfolioUpdates("user-1");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.id).toBe("a1");
  });

  it("getArticleById delegates straight to NewsService", async () => {
    const newsService = fakeNewsService();
    const ds = new NewsIntegrationDataSource(newsService, fakePortfolio());
    const result = await ds.getArticleById("a1");
    expect(result?.id).toBe("a1");
  });
});
