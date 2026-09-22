import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@pcc/db";
import type { AppConfig } from "../config.js";
import type { PortfolioDataSource, MarketDataSource, NewsDataSource } from "../domain/data-sources/index.js";
import type { IbkrConnectionManager } from "../integrations/ibkr/connection-manager.js";
import type { IbkrPortfolioDataSource } from "../integrations/ibkr/ibkr-portfolio-data-source.js";
import type { PortfolioAiAgent } from "../integrations/openai/agent.js";
import type { ConversationService } from "../integrations/openai/conversation-service.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    portfolioDataSource: PortfolioDataSource;
    marketDataSource: MarketDataSource;
    newsDataSource: NewsDataSource;
    ibkr: IbkrConnectionManager;
    ibkrPortfolioDataSource: IbkrPortfolioDataSource;
    aiAgent: PortfolioAiAgent;
    conversations: ConversationService;
  }
}

export interface AppContext {
  prisma: PrismaClient;
  config: AppConfig;
  portfolioDataSource: PortfolioDataSource;
  marketDataSource: MarketDataSource;
  newsDataSource: NewsDataSource;
  ibkr: IbkrConnectionManager;
  ibkrPortfolioDataSource: IbkrPortfolioDataSource;
  aiAgent: PortfolioAiAgent;
  conversations: ConversationService;
}

export default fp(async function contextPlugin(app: FastifyInstance, context: AppContext) {
  app.decorate("prisma", context.prisma);
  app.decorate("config", context.config);
  app.decorate("portfolioDataSource", context.portfolioDataSource);
  app.decorate("marketDataSource", context.marketDataSource);
  app.decorate("newsDataSource", context.newsDataSource);
  app.decorate("ibkr", context.ibkr);
  app.decorate("ibkrPortfolioDataSource", context.ibkrPortfolioDataSource);
  app.decorate("aiAgent", context.aiAgent);
  app.decorate("conversations", context.conversations);

  context.ibkr.start();
  app.addHook("onClose", async () => {
    context.ibkr.stop();
  });
});
