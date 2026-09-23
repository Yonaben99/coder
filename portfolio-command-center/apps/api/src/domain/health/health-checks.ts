import type { IntegrationHealth } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";
import type { AppConfig } from "../../config.js";
import type { IbkrConnectionManager } from "../../integrations/ibkr/connection-manager.js";
import type { PortfolioAiAgent } from "../../integrations/openai/agent.js";
import type { NewsService } from "../../integrations/news/news-service.js";

/**
 * Every check here either performs a real test (database) or reports
 * "not_configured" based on whether credentials/URLs are present — it never
 * hardcodes "operational". See ARCHITECTURE.md §3.8 and SECURITY.md.
 */
export async function checkDatabase(prisma: PrismaClient): Promise<IntegrationHealth> {
  const now = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      key: "database",
      label: "Database",
      status: "operational",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: now,
    };
  } catch (error) {
    return {
      key: "database",
      label: "Database",
      status: "failed",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

/**
 * Maps the four real IBKR session states (docs/IBKR_INTEGRATION.md §2) onto
 * the four-value IntegrationHealthStatus the rest of the app renders,
 * carrying the finer distinction (gateway vs. authentication) in `detail`
 * for the dedicated Settings → IBKR page to show verbatim.
 */
export function checkIbkr(ibkr: IbkrConnectionManager): IntegrationHealth {
  const now = new Date().toISOString();
  const state = ibkr.getSessionState();
  const lastSyncAt = ibkr.getLastSuccessfulSyncAt()?.toISOString() ?? null;

  if (!state.configured) {
    return {
      key: "ibkr",
      label: "IBKR API",
      status: "not_configured",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: "IBKR read-only integration is not connected. Set IBKR_GATEWAY_BASE_URL and see docs/IBKR_INTEGRATION.md.",
    };
  }
  if (!state.gatewayReachable) {
    return {
      key: "ibkr",
      label: "IBKR API",
      status: "failed",
      lastCheckedAt: state.lastCheckedAt?.toISOString() ?? now,
      lastSuccessfulSyncAt: lastSyncAt,
      detail: state.lastError?.message ?? "IBKR gateway is unreachable.",
    };
  }
  if (!state.authenticated) {
    return {
      key: "ibkr",
      label: "IBKR API",
      status: "degraded",
      lastCheckedAt: state.lastCheckedAt?.toISOString() ?? now,
      lastSuccessfulSyncAt: lastSyncAt,
      detail: state.lastSuccessfulAuthAt
        ? "IBKR brokerage session expired — log in again at the gateway's URL."
        : "IBKR gateway is running but not authenticated — log in at the gateway's URL (see Settings → IBKR).",
    };
  }
  return {
    key: "ibkr",
    label: "IBKR API",
    status: "operational",
    lastCheckedAt: state.lastCheckedAt?.toISOString() ?? now,
    lastSuccessfulSyncAt: lastSyncAt,
  };
}

/**
 * Mirrors checkIbkr's honesty rule: "operational" only after a real
 * successful call, never just because a key is present — polling this
 * endpoint must not itself spend OpenAI tokens (see
 * docs/OPENAI_INTEGRATION.md "Cost controls"), so we report the *last*
 * real call's outcome rather than making a fresh one here.
 */
export function checkOpenAi(aiAgent: PortfolioAiAgent): IntegrationHealth {
  const now = new Date().toISOString();
  const status = aiAgent.getProviderStatus();

  if (!status.configured) {
    return {
      key: "openai",
      label: "OpenAI API",
      status: "not_configured",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: "Portfolio AI is not connected. Set OPENAI_API_KEY and see docs/OPENAI_INTEGRATION.md.",
    };
  }
  if (status.lastError && !status.lastSuccessfulCallAt) {
    return {
      key: "openai",
      label: "OpenAI API",
      status: "failed",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: status.lastError,
    };
  }
  if (!status.lastSuccessfulCallAt) {
    return {
      key: "openai",
      label: "OpenAI API",
      status: "degraded",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: "OpenAI key is set but hasn't been verified by a successful call yet — send a message in AI Chat to test it.",
    };
  }
  return {
    key: "openai",
    label: "OpenAI API",
    status: status.lastError ? "degraded" : "operational",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: status.lastSuccessfulCallAt,
    detail: status.lastError ?? undefined,
  };
}

export function checkMarketData(config: AppConfig): IntegrationHealth {
  const now = new Date().toISOString();
  return {
    key: "market_data",
    label: "Market Data",
    status: "not_configured",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: null,
    detail: config.MARKET_INTEL_API_KEY
      ? "Market data key is set, but standalone market data isn't implemented yet — a later phase. Quotes for held positions come from IBKR."
      : "Standalone market data (for symbols not held) isn't implemented yet — a later phase.",
  };
}

/**
 * Mirrors checkOpenAi's honesty rule: "operational" only after a real
 * successful fetch, never just because FINNHUB_API_KEY is present.
 */
export function checkNews(newsService: NewsService): IntegrationHealth {
  const now = new Date().toISOString();
  const status = newsService.getStatus();

  if (!status.configured) {
    return {
      key: "news",
      label: "News",
      status: "not_configured",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: "News integration is not connected. Set FINNHUB_API_KEY and see docs/NEWS_INTEGRATION.md.",
    };
  }
  if (status.lastError && !status.lastSuccessfulFetchAt) {
    return {
      key: "news",
      label: "News",
      status: "failed",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: status.lastError,
    };
  }
  if (!status.lastSuccessfulFetchAt) {
    return {
      key: "news",
      label: "News",
      status: "degraded",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: "Finnhub key is set but hasn't been verified by a successful fetch yet — open News to test it.",
    };
  }
  return {
    key: "news",
    label: "News",
    status: status.lastError ? "degraded" : "operational",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: status.lastSuccessfulFetchAt,
    detail: status.lastError ?? undefined,
  };
}

export function checkScheduledJobs(): IntegrationHealth {
  const now = new Date().toISOString();
  return {
    key: "scheduled_jobs",
    label: "Scheduled Jobs",
    status: "not_configured",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: null,
    detail: "No scheduled jobs are defined yet — they ship starting Phase 4.",
  };
}

export async function getAllIntegrationHealth(
  prisma: PrismaClient,
  config: AppConfig,
  ibkr: IbkrConnectionManager,
  aiAgent: PortfolioAiAgent,
  newsService: NewsService,
): Promise<IntegrationHealth[]> {
  const database = await checkDatabase(prisma);
  return [checkIbkr(ibkr), checkOpenAi(aiAgent), checkMarketData(config), checkNews(newsService), database, checkScheduledJobs()];
}
