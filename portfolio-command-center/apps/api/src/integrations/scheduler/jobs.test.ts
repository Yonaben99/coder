import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@pcc/db";
import { buildJobs } from "./jobs.js";
import type { IbkrPortfolioDataSource } from "../ibkr/ibkr-portfolio-data-source.js";
import type { NewsService } from "../news/news-service.js";
import type { AnalystService } from "../analyst/analyst-service.js";
import type { EarningsService } from "../earnings/earnings-service.js";
import type { AlertEngine } from "../alerts/alert-engine.js";

const LIVE_META = { source: "test", status: "live" as const, timestamp: new Date().toISOString() };
const RUN = Date.now().toString(36).toUpperCase();
const email = `jobs-test-${RUN}@example.com`;
let userId: string;

afterAll(async () => {
  await prisma.portfolioSnapshot.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.iBKRConnection.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.user.delete({ where: { email } }).catch(() => undefined);
  await prisma.$disconnect();
});

function makePosition(symbol: string) {
  return {
    symbol,
    shares: 1,
    averageCost: 1,
    currentPrice: 1,
    marketValue: 100,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    weight: 100,
    dailyChangePercent: 0,
    contractId: 1,
    description: symbol,
    currency: "USD",
    assetClass: "STK",
    sector: "Technology",
    country: "US",
    realizedPnl: 0,
    dailyPnl: null,
  };
}

describe("buildJobs — no authenticated users", () => {
  it("every job no-ops safely when there are zero authenticated IBKR connections", async () => {
    const ibkrPortfolioDataSource = {
      getPositions: vi.fn(async () => ({ data: null, meta: LIVE_META })),
      getAccountSummary: vi.fn(async () => ({ data: null, meta: LIVE_META })),
    } as unknown as IbkrPortfolioDataSource;
    const newsService = { getMarketNews: vi.fn(async () => ({ data: [], meta: LIVE_META })), getCompanyNews: vi.fn() } as unknown as NewsService;
    const analystService = { getEstimate: vi.fn(), getRevisions: vi.fn() } as unknown as AnalystService;
    const earningsService = { getUpcomingForSymbols: vi.fn() } as unknown as EarningsService;
    const alertEngine = { evaluateForUser: vi.fn() } as unknown as AlertEngine;

    const jobs = buildJobs({ prisma, ibkrPortfolioDataSource, newsService, analystService, earningsService, alertEngine });
    for (const job of jobs) await expect(job.run()).resolves.toBeUndefined();

    expect(newsService.getMarketNews).toHaveBeenCalled();
    expect(newsService.getCompanyNews).not.toHaveBeenCalled(); // no held symbols to refresh
    expect(alertEngine.evaluateForUser).not.toHaveBeenCalled(); // no authenticated users to evaluate
  });

  it("registers exactly the five documented jobs with their own intervals", () => {
    const jobs = buildJobs({
      prisma,
      ibkrPortfolioDataSource: {} as IbkrPortfolioDataSource,
      newsService: {} as NewsService,
      analystService: {} as AnalystService,
      earningsService: {} as EarningsService,
      alertEngine: {} as AlertEngine,
    });
    expect(jobs.map((j) => j.name).sort()).toEqual(
      ["evaluateAlerts", "refreshAnalystData", "refreshEarnings", "refreshNews", "refreshPortfolioState"].sort(),
    );
    for (const job of jobs) expect(job.intervalMinutes).toBeGreaterThan(0);
  });
});

describe("buildJobs — with an authenticated user", () => {
  it("refreshPortfolioState writes a PortfolioSnapshot and PositionSnapshot for each authenticated user", async () => {
    const user = await prisma.user.create({ data: { email, passwordHash: "x" } });
    userId = user.id;
    await prisma.iBKRConnection.create({ data: { userId, status: "AUTHENTICATED" } });

    const ibkrPortfolioDataSource = {
      getPositions: vi.fn(async () => ({ data: [makePosition(`JOB${RUN}`)], meta: LIVE_META })),
      getAccountSummary: vi.fn(async () => ({
        data: { netLiquidation: 100, dailyPnl: 0, ytdPnl: 0, cash: 0, buyingPower: 0, excessLiquidity: 0, margin: 0, realizedPnl: 0, unrealizedPnl: 0, leverage: 1 },
        meta: LIVE_META,
      })),
    } as unknown as IbkrPortfolioDataSource;
    const newsService = { getMarketNews: vi.fn(async () => ({ data: [], meta: LIVE_META })), getCompanyNews: vi.fn(async () => ({ data: [], meta: LIVE_META })) } as unknown as NewsService;
    const analystService = { getEstimate: vi.fn(async () => ({ data: null, meta: LIVE_META })), getRevisions: vi.fn(async () => ({ data: [], meta: LIVE_META })) } as unknown as AnalystService;
    const earningsService = { getUpcomingForSymbols: vi.fn(async () => ({ data: [], meta: LIVE_META })) } as unknown as EarningsService;
    const alertEngine = { evaluateForUser: vi.fn(async () => undefined) } as unknown as AlertEngine;

    const jobs = buildJobs({ prisma, ibkrPortfolioDataSource, newsService, analystService, earningsService, alertEngine });
    const refreshPortfolioState = jobs.find((j) => j.name === "refreshPortfolioState")!;
    const refreshNews = jobs.find((j) => j.name === "refreshNews")!;
    const evaluateAlerts = jobs.find((j) => j.name === "evaluateAlerts")!;

    await refreshPortfolioState.run();
    const snapshot = await prisma.portfolioSnapshot.findFirst({ where: { userId }, include: { positions: true } });
    expect(snapshot?.source).toBe("scheduler");
    expect(snapshot?.positions).toHaveLength(1);

    await refreshNews.run();
    expect(newsService.getCompanyNews).toHaveBeenCalledWith(`JOB${RUN}`);

    await evaluateAlerts.run();
    expect(alertEngine.evaluateForUser).toHaveBeenCalledWith(userId);
  });
});
