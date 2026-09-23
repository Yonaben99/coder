import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@pcc/db";
import { unavailable, type AccountSummary, type LiveData, type Position } from "@pcc/shared";
import type { AnalystDataSource, CatalystDataSource, EarningsDataSource, NewsDataSource, RiskDataSource } from "../../domain/data-sources/index.js";
import type { IbkrConnectionManager } from "../ibkr/connection-manager.js";
import { AlertEngine } from "./alert-engine.js";
import { SystemEventLogger } from "../scheduler/system-event-logger.js";
import type { NotificationProvider } from "./notification-provider.js";
import type { AlertServices } from "./types.js";

const LIVE_META = { source: "test", status: "live" as const, timestamp: new Date().toISOString() };
const RUN = Date.now().toString(36).toUpperCase();
const email = `alert-engine-test-${RUN}@example.com`;
let userId: string;

function makePosition(symbol: string, dailyChangePercent: number): Position {
  return {
    symbol,
    shares: 1,
    averageCost: 1,
    currentPrice: 1,
    marketValue: 100,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    weight: 100,
    dailyChangePercent,
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

function emptyServices(overrides: Partial<AlertServices> = {}): AlertServices {
  return {
    portfolioDataSource: {
      getAccountSummary: async (): Promise<LiveData<AccountSummary>> => unavailable("IBKR", "not connected"),
      getPositions: async (): Promise<LiveData<Position[]>> => ({ data: [], meta: LIVE_META }),
    },
    newsDataSource: {
      getRecentNews: async () => unavailable("news", "n/a"),
      getPortfolioNews: async () => unavailable("news", "n/a"),
      getNewsForSymbol: async () => unavailable("news", "n/a"),
      getPortfolioNewsSummary: async () => unavailable("news", "n/a"),
      getMaterialPortfolioUpdates: async () => ({ data: [], meta: LIVE_META }),
      getArticleById: async () => null,
    } as unknown as NewsDataSource,
    analystDataSource: {
      getAnalystEstimate: async () => unavailable("analyst", "n/a"),
      getAnalystRevisions: async () => ({ data: [], meta: LIVE_META }),
    } as unknown as AnalystDataSource,
    earningsDataSource: {
      getEarningsForSymbol: async () => unavailable("earnings", "n/a"),
      getUpcomingPortfolioEarnings: async () => ({ data: [], meta: LIVE_META }),
    } as unknown as EarningsDataSource,
    catalystDataSource: {
      getCatalystsForSymbol: async () => unavailable("catalyst-engine", "n/a"),
      getPortfolioCatalysts: async () => ({ data: [], meta: LIVE_META }),
    } as unknown as CatalystDataSource,
    riskDataSource: {
      getPortfolioRiskSummary: async () => unavailable("risk-engine", "n/a"),
    } as unknown as RiskDataSource,
    ibkr: {
      getSessionState: () => ({ configured: false, gatewayReachable: false, authenticated: false, lastCheckedAt: null, lastError: null, lastSuccessfulAuthAt: null }),
    } as unknown as IbkrConnectionManager,
    ...overrides,
  };
}

function fakeNotificationProvider(): NotificationProvider {
  return { name: "in-app", notify: vi.fn(async () => undefined) };
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email, passwordHash: "x" } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.alert.deleteMany({ where: { userId } });
  await prisma.alertRule.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { email } });
  await prisma.$disconnect();
});

describe("AlertEngine — rule-gated detection", () => {
  it("does not run a detector for a category with no enabled rule", async () => {
    const services = emptyServices({
      portfolioDataSource: {
        getAccountSummary: async () => unavailable("IBKR", "n/a"),
        getPositions: async () => ({ data: [makePosition("WDC", 8)], meta: LIVE_META }),
      },
    });
    const notificationProvider = fakeNotificationProvider();
    const engine = new AlertEngine(prisma, services, notificationProvider, new SystemEventLogger(prisma));

    await engine.evaluateForUser(userId);
    const alerts = await prisma.alert.findMany({ where: { userId, category: "PRICE_MOVEMENT" } });
    expect(alerts).toHaveLength(0);
  });

  it("creates a new Alert the first time a rule-gated detector fires, and notifies once", async () => {
    const rule = await prisma.alertRule.create({
      data: { userId, category: "PRICE_MOVEMENT", enabled: true, threshold: 5, cooldownMinutes: 60 },
    });
    const services = emptyServices({
      portfolioDataSource: {
        getAccountSummary: async () => unavailable("IBKR", "n/a"),
        getPositions: async () => ({ data: [makePosition("WDC", 8)], meta: LIVE_META }),
      },
    });
    const notificationProvider = fakeNotificationProvider();
    const engine = new AlertEngine(prisma, services, notificationProvider, new SystemEventLogger(prisma));

    await engine.evaluateForUser(userId);

    const alerts = await prisma.alert.findMany({ where: { userId, category: "PRICE_MOVEMENT" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.status).toBe("TRIGGERED");
    expect(alerts[0]?.readState).toBe("NEW");
    expect(alerts[0]?.ruleId).toBe(rule.id);
    expect(notificationProvider.notify).toHaveBeenCalledTimes(1);

    await prisma.alertRule.delete({ where: { id: rule.id } });
    await prisma.alert.deleteMany({ where: { userId, category: "PRICE_MOVEMENT" } });
  });
});

describe("AlertEngine — cooldown and dedup", () => {
  it("re-detecting the same condition within the cooldown window updates lastDetectedAt but does not create a new row or renotify", async () => {
    const rule = await prisma.alertRule.create({
      data: { userId, category: "PRICE_MOVEMENT", enabled: true, threshold: 5, cooldownMinutes: 60 },
    });
    const services = emptyServices({
      portfolioDataSource: {
        getAccountSummary: async () => unavailable("IBKR", "n/a"),
        getPositions: async () => ({ data: [makePosition("WDC", 8)], meta: LIVE_META }),
      },
    });
    const notificationProvider = fakeNotificationProvider();
    const engine = new AlertEngine(prisma, services, notificationProvider, new SystemEventLogger(prisma));

    await engine.evaluateForUser(userId);
    await engine.evaluateForUser(userId); // second detection, still within cooldown

    const alerts = await prisma.alert.findMany({ where: { userId, category: "PRICE_MOVEMENT" } });
    expect(alerts).toHaveLength(1); // still one row, not two
    expect(notificationProvider.notify).toHaveBeenCalledTimes(1); // not renotified

    await prisma.alertRule.delete({ where: { id: rule.id } });
    await prisma.alert.deleteMany({ where: { userId, category: "PRICE_MOVEMENT" } });
  });

  it("re-detecting after the cooldown window has expired updates the existing row and notifies again", async () => {
    const rule = await prisma.alertRule.create({
      data: { userId, category: "PRICE_MOVEMENT", enabled: true, threshold: 5, cooldownMinutes: 60 },
    });
    const services = emptyServices({
      portfolioDataSource: {
        getAccountSummary: async () => unavailable("IBKR", "n/a"),
        getPositions: async () => ({ data: [makePosition("WDC", 8)], meta: LIVE_META }),
      },
    });
    const notificationProvider = fakeNotificationProvider();
    const engine = new AlertEngine(prisma, services, notificationProvider, new SystemEventLogger(prisma));

    await engine.evaluateForUser(userId);
    const first = await prisma.alert.findFirst({ where: { userId, category: "PRICE_MOVEMENT" } });

    // Simulate the cooldown having elapsed by backdating lastDetectedAt directly.
    await prisma.alert.update({ where: { id: first!.id }, data: { lastDetectedAt: new Date(Date.now() - 61 * 60 * 1000) } });

    await engine.evaluateForUser(userId);

    const alerts = await prisma.alert.findMany({ where: { userId, category: "PRICE_MOVEMENT" } });
    expect(alerts).toHaveLength(1); // same row, updated in place — not a second row
    expect(alerts[0]?.id).toBe(first!.id);
    expect(notificationProvider.notify).toHaveBeenCalledTimes(2); // notified again on re-trigger

    await prisma.alertRule.delete({ where: { id: rule.id } });
    await prisma.alert.deleteMany({ where: { userId, category: "PRICE_MOVEMENT" } });
  });
});

describe("AlertEngine — always-on detectors run without any rule", () => {
  it("detects an unreachable IBKR gateway regardless of user-configured rules", async () => {
    const services = emptyServices({
      ibkr: {
        getSessionState: () => ({
          configured: true,
          gatewayReachable: false,
          authenticated: false,
          lastCheckedAt: null,
          lastError: { message: "gateway unreachable" },
          lastSuccessfulAuthAt: null,
        }),
      } as unknown as IbkrConnectionManager,
    });
    const notificationProvider = fakeNotificationProvider();
    const engine = new AlertEngine(prisma, services, notificationProvider, new SystemEventLogger(prisma));

    await engine.evaluateForUser(userId);

    const alerts = await prisma.alert.findMany({ where: { userId, category: "DATA_CONNECTION_FAILURE" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("CRITICAL");

    await prisma.alert.deleteMany({ where: { userId, category: "DATA_CONNECTION_FAILURE" } });
  });
});
