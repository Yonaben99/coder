import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@pcc/db";
import { unavailable, type AnalystRevisionItem, type EarningsEvent, type LiveData, type NewsItem } from "@pcc/shared";
import type { AnalystDataSource, EarningsDataSource, NewsDataSource } from "../../domain/data-sources/index.js";
import { CatalystService } from "./catalyst-service.js";

const LIVE_META = { source: "test", status: "live" as const, timestamp: new Date().toISOString() };
const RUN = Date.now().toString(36).toUpperCase();
const sym = (n: number): string => `T${RUN}C${n}`;
const usedSymbols: string[] = [];

afterAll(async () => {
  if (usedSymbols.length > 0) {
    await prisma.instrument.deleteMany({ where: { symbol: { in: usedSymbols } } });
  }
  await prisma.$disconnect();
});

function makeNewsItem(symbol: string, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: `news-${symbol}-1`,
    symbol,
    relatedSymbols: [symbol],
    headline: `${symbol} announces major contract win`,
    source: "Reuters",
    provider: "finnhub",
    url: `https://example.com/${symbol}`,
    publishedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    categories: ["contract"],
    relevance: "high",
    summary: null,
    ...overrides,
  };
}

function makeEarningsEvent(symbol: string, overrides: Partial<EarningsEvent> = {}): EarningsEvent {
  return {
    id: `earnings-${symbol}-1`,
    symbol,
    period: "Q2 2026",
    reportDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    announcementTiming: "amc",
    estimatedEps: 1.5,
    estimatedRevenue: 4_000_000_000,
    actualEps: null,
    actualRevenue: null,
    status: "estimated",
    source: "Finnhub",
    provider: "finnhub",
    retrievedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRevision(symbol: string, overrides: Partial<AnalystRevisionItem> = {}): AnalystRevisionItem {
  return {
    id: `revision-${symbol}-1`,
    symbol,
    firm: "Morgan Stanley",
    previousValue: "Hold",
    newValue: "Buy",
    ratingChange: "up",
    source: "Finnhub",
    provider: "finnhub",
    revisedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeSources(overrides: { news?: NewsItem[]; earnings?: EarningsEvent[]; revisions?: AnalystRevisionItem[] } = {}) {
  const news: NewsDataSource = {
    getRecentNews: async () => ({ data: [], meta: LIVE_META }),
    getPortfolioNews: async () => ({ data: [], meta: LIVE_META }),
    getNewsForSymbol: async (): Promise<LiveData<NewsItem[]>> => ({ data: overrides.news ?? [], meta: LIVE_META }),
    getPortfolioNewsSummary: async () => ({ data: [], meta: LIVE_META }),
    getMaterialPortfolioUpdates: async () => ({ data: [], meta: LIVE_META }),
    getArticleById: async () => null,
  };
  const earnings: EarningsDataSource = {
    getEarningsForSymbol: async (): Promise<LiveData<EarningsEvent[]>> => ({ data: overrides.earnings ?? [], meta: LIVE_META }),
    getUpcomingPortfolioEarnings: async () => ({ data: [], meta: LIVE_META }),
  };
  const analyst: AnalystDataSource = {
    getAnalystEstimate: async () => unavailable("analyst", "n/a"),
    getAnalystRevisions: async (): Promise<LiveData<AnalystRevisionItem[]>> => ({ data: overrides.revisions ?? [], meta: LIVE_META }),
  };
  return { news, earnings, analyst };
}

describe("CatalystService", () => {
  it("syncs news, earnings, and analyst revisions into Catalyst rows for one symbol", async () => {
    const symbol = sym(1);
    usedSymbols.push(symbol);
    const { news, earnings, analyst } = fakeSources({
      news: [makeNewsItem(symbol)],
      earnings: [makeEarningsEvent(symbol)],
      revisions: [makeRevision(symbol)],
    });
    const service = new CatalystService(news, analyst, earnings, prisma);

    const result = await service.getCatalystsForSymbol(symbol);
    expect(result.meta.status).toBe("live");
    expect(result.data).toHaveLength(3);

    const types = result.data!.map((c) => c.type).sort();
    expect(types).toEqual(["analyst_revision", "earnings", "major_contract"]);
  });

  it("marks news-derived catalysts as completed and dateConfirmed (a reported fact), earnings as upcoming and unconfirmed", async () => {
    const symbol = sym(2);
    usedSymbols.push(symbol);
    const { news, earnings, analyst } = fakeSources({
      news: [makeNewsItem(symbol)],
      earnings: [makeEarningsEvent(symbol)],
    });
    const service = new CatalystService(news, analyst, earnings, prisma);

    const result = await service.getCatalystsForSymbol(symbol);
    const newsCatalyst = result.data!.find((c) => c.type === "major_contract")!;
    const earningsCatalyst = result.data!.find((c) => c.type === "earnings")!;

    expect(newsCatalyst.status).toBe("completed");
    expect(newsCatalyst.dateConfirmed).toBe(true);
    expect(earningsCatalyst.status).toBe("upcoming");
    expect(earningsCatalyst.dateConfirmed).toBe(false);
  });

  it("re-syncing the same underlying events upserts the same Catalyst rows instead of duplicating them", async () => {
    const symbol = sym(3);
    usedSymbols.push(symbol);
    const { news, earnings, analyst } = fakeSources({ news: [makeNewsItem(symbol)] });
    const service = new CatalystService(news, analyst, earnings, prisma);

    await service.getCatalystsForSymbol(symbol);
    const result = await service.getCatalystsForSymbol(symbol);
    expect(result.data).toHaveLength(1);
  });

  it("getPortfolioCatalysts aggregates across multiple symbols", async () => {
    const symbolA = sym(4);
    const symbolB = sym(5);
    usedSymbols.push(symbolA, symbolB);
    let call = 0;
    const news: NewsDataSource = {
      getRecentNews: async () => ({ data: [], meta: LIVE_META }),
      getPortfolioNews: async () => ({ data: [], meta: LIVE_META }),
      getNewsForSymbol: async (symbol: string): Promise<LiveData<NewsItem[]>> => {
        call++;
        return { data: [makeNewsItem(symbol)], meta: LIVE_META };
      },
      getPortfolioNewsSummary: async () => ({ data: [], meta: LIVE_META }),
      getMaterialPortfolioUpdates: async () => ({ data: [], meta: LIVE_META }),
      getArticleById: async () => null,
    };
    const { earnings, analyst } = fakeSources();
    const service = new CatalystService(news, analyst, earnings, prisma);

    const result = await service.getPortfolioCatalysts([symbolA, symbolB]);
    expect(call).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it("reports unavailable when every underlying source is unavailable and there is no cached catalyst data", async () => {
    const symbol = sym(6);
    usedSymbols.push(symbol);
    const news: NewsDataSource = {
      getRecentNews: async () => ({ data: [], meta: LIVE_META }),
      getPortfolioNews: async () => ({ data: [], meta: LIVE_META }),
      getNewsForSymbol: async (): Promise<LiveData<NewsItem[]>> => unavailable("news", "News integration is not connected yet."),
      getPortfolioNewsSummary: async () => ({ data: [], meta: LIVE_META }),
      getMaterialPortfolioUpdates: async () => ({ data: [], meta: LIVE_META }),
      getArticleById: async () => null,
    };
    const earnings: EarningsDataSource = {
      getEarningsForSymbol: async (): Promise<LiveData<EarningsEvent[]>> => unavailable("earnings", "Earnings data integration is not connected yet."),
      getUpcomingPortfolioEarnings: async () => ({ data: [], meta: LIVE_META }),
    };
    const analyst: AnalystDataSource = {
      getAnalystEstimate: async () => unavailable("analyst", "n/a"),
      getAnalystRevisions: async (): Promise<LiveData<AnalystRevisionItem[]>> => unavailable("analyst", "Analyst data integration is not connected yet."),
    };
    const service = new CatalystService(news, analyst, earnings, prisma);

    const result = await service.getCatalystsForSymbol(symbol);
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });
});
