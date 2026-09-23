import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import type { PrismaClient } from "@pcc/db";
import type { AppConfig } from "./config.js";
import { buildLoggerOptions } from "./logger.js";
import contextPlugin, { type AppContext } from "./plugins/context.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import { healthRoutes, healthRoutesV1 } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { portfolioRoutes } from "./routes/portfolio.js";
import { connectionsRoutes } from "./routes/connections.js";
import { systemHealthRoutes } from "./routes/system-health.js";
import { ibkrRoutes } from "./routes/ibkr.js";
import { aiRoutes } from "./routes/ai.js";
import { newsRoutes } from "./routes/news.js";
import { analystsRoutes } from "./routes/analysts.js";
import { earningsRoutes } from "./routes/earnings.js";
import { catalystsRoutes } from "./routes/catalysts.js";
import { riskRoutes } from "./routes/risk.js";
import { alertsRoutes } from "./routes/alerts.js";
import { monitoringRoutes } from "./routes/monitoring.js";
import { NotConnectedMarketDataSource } from "./integrations/market/not-connected-market-data-source.js";
import { FinnhubNewsProvider } from "./integrations/news/finnhub-provider.js";
import { NewsService } from "./integrations/news/news-service.js";
import { NewsIntegrationDataSource } from "./integrations/news/news-integration-data-source.js";
import { FinnhubAnalystProvider } from "./integrations/analyst/finnhub-analyst-provider.js";
import { AnalystService } from "./integrations/analyst/analyst-service.js";
import { AnalystIntegrationDataSource } from "./integrations/analyst/analyst-integration-data-source.js";
import { FinnhubEarningsProvider } from "./integrations/earnings/finnhub-earnings-provider.js";
import { EarningsService } from "./integrations/earnings/earnings-service.js";
import { EarningsIntegrationDataSource } from "./integrations/earnings/earnings-integration-data-source.js";
import { CatalystService } from "./integrations/catalysts/catalyst-service.js";
import { CatalystIntegrationDataSource } from "./integrations/catalysts/catalyst-integration-data-source.js";
import { RiskService } from "./integrations/risk/risk-service.js";
import { AlertEngine } from "./integrations/alerts/alert-engine.js";
import { AlertService } from "./integrations/alerts/alert-service.js";
import { InAppNotificationProvider } from "./integrations/alerts/in-app-notification-provider.js";
import { Scheduler } from "./integrations/scheduler/scheduler.js";
import { SystemEventLogger } from "./integrations/scheduler/system-event-logger.js";
import { buildJobs } from "./integrations/scheduler/jobs.js";
import { IbkrConnectionManager } from "./integrations/ibkr/connection-manager.js";
import { IbkrPortfolioDataSource } from "./integrations/ibkr/ibkr-portfolio-data-source.js";
import { OpenAIProvider } from "./integrations/openai/openai-provider.js";
import { PortfolioAiAgent } from "./integrations/openai/agent.js";
import { ConversationService } from "./integrations/openai/conversation-service.js";

export interface BuildAppOptions {
  config: AppConfig;
  prisma: PrismaClient;
}

export async function buildApp({ config, prisma }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: buildLoggerOptions(config) });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.APP_BASE_URL,
    credentials: true,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });

  const ibkr = new IbkrConnectionManager(config.IBKR_GATEWAY_BASE_URL ?? null);
  const ibkrPortfolioDataSource = new IbkrPortfolioDataSource(ibkr, prisma);
  const marketDataSource = new NotConnectedMarketDataSource();

  const newsProvider = new FinnhubNewsProvider(config.FINNHUB_API_KEY ?? null);
  const newsService = new NewsService(newsProvider, prisma);
  const newsDataSource = new NewsIntegrationDataSource(newsService, ibkrPortfolioDataSource);

  // Phase 5 — analysts, earnings, catalysts, risk. Analyst/earnings reuse
  // the Phase 4 Finnhub key (same vendor, see docs/RISK_AND_CATALYSTS.md §1).
  const analystProvider = new FinnhubAnalystProvider(config.FINNHUB_API_KEY ?? null);
  const analystService = new AnalystService(analystProvider, prisma);
  const analystDataSource = new AnalystIntegrationDataSource(analystService);

  const earningsProvider = new FinnhubEarningsProvider(config.FINNHUB_API_KEY ?? null);
  const earningsService = new EarningsService(earningsProvider, prisma);
  const earningsDataSource = new EarningsIntegrationDataSource(earningsService, ibkrPortfolioDataSource);

  const catalystService = new CatalystService(newsDataSource, analystDataSource, earningsDataSource, prisma);
  const catalystDataSource = new CatalystIntegrationDataSource(catalystService, ibkrPortfolioDataSource);

  const riskDataSource = new RiskService(ibkrPortfolioDataSource, prisma);

  // Phase 6 — alerts and monitoring. Deterministic detection only (no LLM
  // call anywhere in AlertEngine or its detectors, see
  // docs/ALERTS_AND_MONITORING.md §7) over the same application services
  // Phase 2-5 already built — never a vendor call of its own.
  const systemEvents = new SystemEventLogger(prisma);
  const notificationProvider = new InAppNotificationProvider(systemEvents);
  const alertEngine = new AlertEngine(
    prisma,
    { portfolioDataSource: ibkrPortfolioDataSource, newsDataSource, analystDataSource, earningsDataSource, catalystDataSource, riskDataSource, ibkr },
    notificationProvider,
    systemEvents,
  );
  const alertService = new AlertService(prisma);

  const scheduler = new Scheduler(systemEvents);
  for (const job of buildJobs({ prisma, ibkrPortfolioDataSource, newsService, analystService, earningsService, alertEngine })) {
    scheduler.register(job);
  }

  const aiProvider = new OpenAIProvider(config.OPENAI_API_KEY ?? null, config.OPENAI_MODEL);
  const conversations = new ConversationService(prisma);
  const aiAgent = new PortfolioAiAgent(
    aiProvider,
    {
      portfolioDataSource: ibkrPortfolioDataSource,
      ibkrPortfolioDataSource,
      marketDataSource,
      newsDataSource,
      analystDataSource,
      earningsDataSource,
      catalystDataSource,
      riskDataSource,
      alertService,
      scheduler,
    },
    conversations,
  );

  const context: AppContext = {
    config,
    prisma,
    // Real, read-only IBKR-backed source (Phase 2). It reports an honest
    // "unavailable" LiveData envelope on its own when IBKR isn't
    // configured/authenticated — no separate NotConnected implementation
    // is needed. Market data remains Phase 1's honest stand-in; news
    // (Phase 4) and analysts/earnings/catalysts/risk (Phase 5) are now
    // real, backed by Finnhub and the existing PortfolioDataSource.
    portfolioDataSource: ibkrPortfolioDataSource,
    marketDataSource,
    newsDataSource,
    newsService,
    analystDataSource,
    analystService,
    earningsDataSource,
    catalystDataSource,
    riskDataSource,
    ibkr,
    ibkrPortfolioDataSource,
    aiAgent,
    conversations,
    alertService,
    scheduler,
  };
  await app.register(contextPlugin, context);
  await app.register(errorHandlerPlugin);

  await app.register(healthRoutes);
  await app.register(
    async (versioned) => {
      await versioned.register(healthRoutesV1);
      await versioned.register(authRoutes);
      await versioned.register(portfolioRoutes);
      await versioned.register(connectionsRoutes);
      await versioned.register(systemHealthRoutes);
      await versioned.register(ibkrRoutes);
      await versioned.register(aiRoutes);
      await versioned.register(newsRoutes);
      await versioned.register(analystsRoutes);
      await versioned.register(earningsRoutes);
      await versioned.register(catalystsRoutes);
      await versioned.register(riskRoutes);
      await versioned.register(alertsRoutes);
      await versioned.register(monitoringRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
