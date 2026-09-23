import { unavailable, type LiveData, type MarketData, type Position } from "@pcc/shared";
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

export interface ToolServices {
  portfolioDataSource: PortfolioDataSource;
  ibkrPortfolioDataSource: IbkrPortfolioDataSource;
  marketDataSource: MarketDataSource;
  newsDataSource: NewsDataSource;
  analystDataSource: AnalystDataSource;
  earningsDataSource: EarningsDataSource;
  catalystDataSource: CatalystDataSource;
  riskDataSource: RiskDataSource;
  alertService: AlertService;
  scheduler: Scheduler;
}

export type ToolExecutor = (userId: string, args: Record<string, unknown>, services: ToolServices) => Promise<unknown>;

function notImplemented<T>(feature: string, phaseNote: string): LiveData<T> {
  return unavailable<T>(feature, phaseNote);
}

interface PortfolioContext {
  account: Awaited<ReturnType<PortfolioDataSource["getAccountSummary"]>>["data"];
  topPositions: Array<Pick<Position, "symbol" | "shares" | "marketValue" | "unrealizedPnlPercent" | "weight">>;
  positionCount: number;
  allocation: Awaited<ReturnType<IbkrPortfolioDataSource["getAllocation"]>>["data"];
}

async function getPortfolioContext(userId: string, services: ToolServices): Promise<LiveData<PortfolioContext>> {
  const [summary, positions, allocation] = await Promise.all([
    services.portfolioDataSource.getAccountSummary(userId),
    services.portfolioDataSource.getPositions(userId),
    services.ibkrPortfolioDataSource.getAllocation(userId),
  ]);

  if (!summary.data || !positions.data) {
    return { data: null, meta: summary.meta };
  }

  const topPositions = [...positions.data]
    .sort((a, b) => Math.abs(b.marketValue ?? 0) - Math.abs(a.marketValue ?? 0))
    .slice(0, 8)
    .map(({ symbol, shares, marketValue, unrealizedPnlPercent, weight }) => ({ symbol, shares, marketValue, unrealizedPnlPercent, weight }));

  return {
    data: {
      account: summary.data,
      topPositions,
      positionCount: positions.data.length,
      allocation: allocation.data,
    },
    meta: summary.meta,
  };
}

/**
 * One executor per tool in tool-definitions.ts. Every function calls an
 * existing application service (PortfolioDataSource / IbkrPortfolioDataSource
 * / MarketDataSource) — none of them talk to IBKR directly, and none
 * fabricate a value: an unimplemented feature returns a real LiveData
 * "unavailable" envelope with an honest reason, the same as a live
 * integration failure would.
 */
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  async getAccountSummary(userId, _args, services) {
    return services.portfolioDataSource.getAccountSummary(userId);
  },

  async getPositions(userId, _args, services) {
    return services.portfolioDataSource.getPositions(userId);
  },

  async getPosition(userId, args, services) {
    const symbol = String(args.symbol ?? "").toUpperCase();
    const result = await services.portfolioDataSource.getPositions(userId);
    if (!result.data) return { data: null, meta: result.meta };
    const position = result.data.find((p) => p.symbol.toUpperCase() === symbol) ?? null;
    return {
      data: position,
      meta: position ? result.meta : { ...result.meta, reason: result.meta.reason ?? `No current position found for ${symbol}.` },
    };
  },

  async getPortfolioAllocation(userId, _args, services) {
    return services.ibkrPortfolioDataSource.getAllocation(userId);
  },

  async getPortfolioPerformance(_userId, _args, services) {
    return services.ibkrPortfolioDataSource.getPerformance();
  },

  async getMarketData(userId, args, services): Promise<LiveData<MarketData>> {
    const symbol = String(args.symbol ?? "").toUpperCase();
    const positions = await services.portfolioDataSource.getPositions(userId);
    const held = positions.data?.find((p) => p.symbol.toUpperCase() === symbol);
    if (held) {
      return {
        data: { symbol: held.symbol, price: held.currentPrice, changePercent: held.dailyChangePercent, volume: null },
        meta: positions.meta,
      };
    }
    return services.marketDataSource.getQuote(symbol);
  },

  async getRecentTrades() {
    return notImplemented("Trades", "Trade history sync isn't implemented yet — a later phase.");
  },

  async getOpenOrders() {
    return notImplemented("Orders", "Open-order sync isn't implemented yet — a later phase.");
  },

  async getHistoricalPortfolioSnapshots() {
    return notImplemented("Portfolio Snapshots", "No portfolio snapshot history exists yet — scheduled snapshots are a later phase.");
  },

  async getRiskMetrics(userId, _args, services) {
    const result = await services.riskDataSource.getPortfolioRiskSummary(userId);
    if (!result.data) return { data: null, meta: result.meta };
    return { data: result.data.metrics, meta: result.meta };
  },

  async getPortfolioContext(userId, _args, services) {
    return getPortfolioContext(userId, services);
  },

  async getRecentNews(_userId, args, services) {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.newsDataSource.getRecentNews(limit);
  },

  async getPortfolioNews(userId, args, services) {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.newsDataSource.getPortfolioNews(userId, limit);
  },

  async getNewsForSymbol(_userId, args, services) {
    const symbol = String(args.symbol ?? "").toUpperCase();
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.newsDataSource.getNewsForSymbol(symbol, limit);
  },

  async getMaterialPortfolioUpdates(userId, _args, services) {
    return services.newsDataSource.getMaterialPortfolioUpdates(userId);
  },

  async getAnalystData(_userId, args, services) {
    const symbol = String(args.symbol ?? "").toUpperCase();
    return services.analystDataSource.getAnalystEstimate(symbol);
  },

  async getAnalystRevisions(_userId, args, services) {
    const symbol = String(args.symbol ?? "").toUpperCase();
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.analystDataSource.getAnalystRevisions(symbol, limit);
  },

  async getUpcomingEarnings(userId, args, services) {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.earningsDataSource.getUpcomingPortfolioEarnings(userId, limit);
  },

  async getPortfolioCatalysts(userId, args, services) {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.catalystDataSource.getPortfolioCatalysts(userId, limit);
  },

  async getPortfolioRiskSummary(userId, _args, services) {
    return services.riskDataSource.getPortfolioRiskSummary(userId);
  },

  async getActiveAlerts(userId, args, services) {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.alertService.getActiveAlerts(userId, limit);
  },

  async getRecentAlerts(userId, args, services) {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.alertService.getRecentAlerts(userId, limit);
  },

  async getAlertHistory(userId, args, services) {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return services.alertService.getAlertHistory(userId, limit);
  },

  async getMonitoringStatus(_userId, _args, services) {
    return services.scheduler.getStatus();
  },
};
