import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@pcc/db";
import type { AppConfig } from "../config.js";
import type {
  AnalystDataSource,
  CatalystDataSource,
  EarningsDataSource,
  MarketDataSource,
  NewsDataSource,
  PortfolioDataSource,
  RiskDataSource,
} from "../domain/data-sources/index.js";
import type { IbkrConnectionManager } from "../integrations/ibkr/connection-manager.js";
import type { IbkrPortfolioDataSource } from "../integrations/ibkr/ibkr-portfolio-data-source.js";
import type { PortfolioAiAgent } from "../integrations/openai/agent.js";
import type { ConversationService } from "../integrations/openai/conversation-service.js";
import type { NewsService } from "../integrations/news/news-service.js";
import type { AnalystService } from "../integrations/analyst/analyst-service.js";
import type { AlertService } from "../integrations/alerts/alert-service.js";
import type { Scheduler } from "../integrations/scheduler/scheduler.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    portfolioDataSource: PortfolioDataSource;
    marketDataSource: MarketDataSource;
    newsDataSource: NewsDataSource;
    newsService: NewsService;
    // Phase 5 — analysts, earnings, catalysts, risk
    analystDataSource: AnalystDataSource;
    analystService: AnalystService;
    earningsDataSource: EarningsDataSource;
    catalystDataSource: CatalystDataSource;
    riskDataSource: RiskDataSource;
    ibkr: IbkrConnectionManager;
    ibkrPortfolioDataSource: IbkrPortfolioDataSource;
    aiAgent: PortfolioAiAgent;
    conversations: ConversationService;
    // Phase 6 — alerts and monitoring
    alertService: AlertService;
    scheduler: Scheduler;
  }
}

export interface AppContext {
  prisma: PrismaClient;
  config: AppConfig;
  portfolioDataSource: PortfolioDataSource;
  marketDataSource: MarketDataSource;
  newsDataSource: NewsDataSource;
  newsService: NewsService;
  analystDataSource: AnalystDataSource;
  analystService: AnalystService;
  earningsDataSource: EarningsDataSource;
  catalystDataSource: CatalystDataSource;
  riskDataSource: RiskDataSource;
  ibkr: IbkrConnectionManager;
  ibkrPortfolioDataSource: IbkrPortfolioDataSource;
  aiAgent: PortfolioAiAgent;
  conversations: ConversationService;
  alertService: AlertService;
  scheduler: Scheduler;
}

export default fp(async function contextPlugin(app: FastifyInstance, context: AppContext) {
  app.decorate("prisma", context.prisma);
  app.decorate("config", context.config);
  app.decorate("portfolioDataSource", context.portfolioDataSource);
  app.decorate("marketDataSource", context.marketDataSource);
  app.decorate("newsDataSource", context.newsDataSource);
  app.decorate("newsService", context.newsService);
  app.decorate("analystDataSource", context.analystDataSource);
  app.decorate("analystService", context.analystService);
  app.decorate("earningsDataSource", context.earningsDataSource);
  app.decorate("catalystDataSource", context.catalystDataSource);
  app.decorate("riskDataSource", context.riskDataSource);
  app.decorate("ibkr", context.ibkr);
  app.decorate("ibkrPortfolioDataSource", context.ibkrPortfolioDataSource);
  app.decorate("aiAgent", context.aiAgent);
  app.decorate("conversations", context.conversations);
  app.decorate("alertService", context.alertService);
  app.decorate("scheduler", context.scheduler);

  context.ibkr.start();
  context.scheduler.start();
  app.addHook("onClose", async () => {
    context.ibkr.stop();
    context.scheduler.stop();
  });
});
