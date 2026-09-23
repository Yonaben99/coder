import type { PrismaClient } from "@pcc/db";
import type { NewsService } from "../news/news-service.js";
import type { AnalystService } from "../analyst/analyst-service.js";
import type { EarningsService } from "../earnings/earnings-service.js";
import type { AlertEngine } from "../alerts/alert-engine.js";
import type { IbkrPortfolioDataSource } from "../ibkr/ibkr-portfolio-data-source.js";
import type { JobDefinition } from "./job.js";

/** Every user with an authenticated IBKR session — the only users whose holdings actually exist to refresh/monitor. */
async function authenticatedUserIds(prisma: PrismaClient): Promise<string[]> {
  const connections = await prisma.iBKRConnection.findMany({ where: { status: "AUTHENTICATED" }, select: { userId: true } });
  return connections.map((c) => c.userId);
}

/** The union of every authenticated user's held symbols — batched so news/analyst/earnings refresh happens once per symbol, not once per user (§6.14). */
async function heldSymbolUniverse(prisma: PrismaClient, ibkrPortfolioDataSource: IbkrPortfolioDataSource): Promise<string[]> {
  const userIds = await authenticatedUserIds(prisma);
  const symbols = new Set<string>();
  for (const userId of userIds) {
    const positions = await ibkrPortfolioDataSource.getPositions(userId);
    for (const position of positions.data ?? []) symbols.add(position.symbol.toUpperCase());
  }
  return [...symbols];
}

export interface JobFactoryServices {
  prisma: PrismaClient;
  ibkrPortfolioDataSource: IbkrPortfolioDataSource;
  newsService: NewsService;
  analystService: AnalystService;
  earningsService: EarningsService;
  alertEngine: AlertEngine;
}

/**
 * Builds the standard job set. Intervals are deliberately conservative
 * (§6.14, §6.6) — this app has no live credentials in most environments,
 * so these jobs mostly no-op safely (zero authenticated users ⇒ zero
 * external calls) until IBKR/Finnhub are actually configured; see
 * docs/ALERTS_AND_MONITORING.md §5 for the full interval table and the
 * reasoning behind each one.
 */
export function buildJobs(services: JobFactoryServices): JobDefinition[] {
  const { prisma, ibkrPortfolioDataSource, newsService, analystService, earningsService, alertEngine } = services;

  return [
    {
      name: "refreshPortfolioState",
      intervalMinutes: 15,
      async run() {
        const userIds = await authenticatedUserIds(prisma);
        for (const userId of userIds) {
          const [positions, summary] = await Promise.all([
            ibkrPortfolioDataSource.getPositions(userId),
            ibkrPortfolioDataSource.getAccountSummary(userId),
          ]);
          if (!positions.data || !summary.data) continue;

          await prisma.portfolioSnapshot.create({
            data: {
              userId,
              netLiquidation: summary.data.netLiquidation,
              cash: summary.data.cash,
              buyingPower: summary.data.buyingPower,
              excessLiquidity: summary.data.excessLiquidity,
              margin: summary.data.margin,
              realizedPnl: summary.data.realizedPnl,
              unrealizedPnl: summary.data.unrealizedPnl,
              dailyPnl: summary.data.dailyPnl,
              source: "scheduler",
              positions: {
                create: await Promise.all(
                  positions.data.map(async (position) => {
                    const instrument = await prisma.instrument.upsert({
                      where: { symbol: position.symbol },
                      create: { symbol: position.symbol, sector: position.sector, assetClass: position.assetClass },
                      update: { sector: position.sector, assetClass: position.assetClass },
                    });
                    return {
                      instrumentId: instrument.id,
                      quantity: position.shares,
                      averageCost: position.averageCost,
                      marketPrice: position.currentPrice,
                      marketValue: position.marketValue,
                      unrealizedPnl: position.unrealizedPnl,
                      dailyChange: position.dailyChangePercent,
                      weight: position.weight,
                    };
                  }),
                ),
              },
            },
          });
        }
      },
    },
    {
      name: "refreshNews",
      intervalMinutes: 10,
      async run() {
        const symbols = await heldSymbolUniverse(prisma, ibkrPortfolioDataSource);
        await newsService.getMarketNews();
        for (const symbol of symbols) await newsService.getCompanyNews(symbol);
      },
    },
    {
      name: "refreshAnalystData",
      intervalMinutes: 60,
      async run() {
        const symbols = await heldSymbolUniverse(prisma, ibkrPortfolioDataSource);
        for (const symbol of symbols) {
          await analystService.getEstimate(symbol);
          await analystService.getRevisions(symbol);
        }
      },
    },
    {
      name: "refreshEarnings",
      intervalMinutes: 360,
      async run() {
        const symbols = await heldSymbolUniverse(prisma, ibkrPortfolioDataSource);
        if (symbols.length > 0) await earningsService.getUpcomingForSymbols(symbols);
      },
    },
    {
      name: "evaluateAlerts",
      intervalMinutes: 15,
      async run() {
        const userIds = await authenticatedUserIds(prisma);
        for (const userId of userIds) await alertEngine.evaluateForUser(userId);
      },
    },
  ];
}
