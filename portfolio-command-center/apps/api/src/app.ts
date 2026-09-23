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
import { NotConnectedMarketDataSource } from "./integrations/market/not-connected-market-data-source.js";
import { FinnhubNewsProvider } from "./integrations/news/finnhub-provider.js";
import { NewsService } from "./integrations/news/news-service.js";
import { NewsIntegrationDataSource } from "./integrations/news/news-integration-data-source.js";
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

  const aiProvider = new OpenAIProvider(config.OPENAI_API_KEY ?? null, config.OPENAI_MODEL);
  const conversations = new ConversationService(prisma);
  const aiAgent = new PortfolioAiAgent(
    aiProvider,
    { portfolioDataSource: ibkrPortfolioDataSource, ibkrPortfolioDataSource, marketDataSource, newsDataSource },
    conversations,
  );

  const context: AppContext = {
    config,
    prisma,
    // Real, read-only IBKR-backed source (Phase 2). It reports an honest
    // "unavailable" LiveData envelope on its own when IBKR isn't
    // configured/authenticated — no separate NotConnected implementation
    // is needed. Market data remains Phase 1's honest stand-in; news
    // (Phase 4) is now real, backed by Finnhub via NewsService.
    portfolioDataSource: ibkrPortfolioDataSource,
    marketDataSource,
    newsDataSource,
    newsService,
    ibkr,
    ibkrPortfolioDataSource,
    aiAgent,
    conversations,
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
    },
    { prefix: "/api/v1" },
  );

  return app;
}
