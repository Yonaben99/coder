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
import { NotConnectedMarketDataSource } from "./integrations/market/not-connected-market-data-source.js";
import { NotConnectedNewsDataSource } from "./integrations/news/not-connected-news-data-source.js";
import { IbkrConnectionManager } from "./integrations/ibkr/connection-manager.js";
import { IbkrPortfolioDataSource } from "./integrations/ibkr/ibkr-portfolio-data-source.js";

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

  const context: AppContext = {
    config,
    prisma,
    // Real, read-only IBKR-backed source (Phase 2). It reports an honest
    // "unavailable" LiveData envelope on its own when IBKR isn't
    // configured/authenticated — no separate NotConnected implementation
    // is needed. Market data and news remain Phase 1's honest stand-ins
    // until Phase 4.
    portfolioDataSource: ibkrPortfolioDataSource,
    marketDataSource: new NotConnectedMarketDataSource(),
    newsDataSource: new NotConnectedNewsDataSource(),
    ibkr,
    ibkrPortfolioDataSource,
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
    },
    { prefix: "/api/v1" },
  );

  return app;
}
