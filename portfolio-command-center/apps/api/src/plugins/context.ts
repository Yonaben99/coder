import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@pcc/db";
import type { AppConfig } from "../config.js";
import type { PortfolioDataSource, MarketDataSource, NewsDataSource } from "../domain/data-sources/index.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    portfolioDataSource: PortfolioDataSource;
    marketDataSource: MarketDataSource;
    newsDataSource: NewsDataSource;
  }
}

export interface AppContext {
  prisma: PrismaClient;
  config: AppConfig;
  portfolioDataSource: PortfolioDataSource;
  marketDataSource: MarketDataSource;
  newsDataSource: NewsDataSource;
}

export default fp(async function contextPlugin(app: FastifyInstance, context: AppContext) {
  app.decorate("prisma", context.prisma);
  app.decorate("config", context.config);
  app.decorate("portfolioDataSource", context.portfolioDataSource);
  app.decorate("marketDataSource", context.marketDataSource);
  app.decorate("newsDataSource", context.newsDataSource);
});
