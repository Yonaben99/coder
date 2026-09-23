import type { IntegrationHealth } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";
import type { AppConfig } from "../../config.js";
import type { IbkrConnectionManager } from "../../integrations/ibkr/connection-manager.js";
import type { PortfolioAiAgent } from "../../integrations/openai/agent.js";
import type { NewsService } from "../../integrations/news/news-service.js";
import type { AnalystService } from "../../integrations/analyst/analyst-service.js";
import type { Scheduler } from "../../integrations/scheduler/scheduler.js";

/**
 * Every check here either performs a real test (database) or reports
 * "not_configured" based on whether credentials/URLs are present — it never
 * hardcodes "operational". See ARCHITECTURE.md §3.10 and SECURITY.md.
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

/**
 * Covers both the analyst and earnings integrations jointly — they share
 * the same Finnhub vendor and FINNHUB_API_KEY (docs/RISK_AND_CATALYSTS.md
 * §1), so a single real fetch from either one is evidence the connection
 * works. Mirrors checkNews/checkOpenAi's honesty rule.
 */
export function checkAnalyst(analystService: AnalystService): IntegrationHealth {
  const now = new Date().toISOString();
  const status = analystService.getStatus();

  if (!status.configured) {
    return {
      key: "analyst",
      label: "Analyst & Earnings Data",
      status: "not_configured",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: "Analyst/earnings data integration is not connected. Set FINNHUB_API_KEY and see docs/RISK_AND_CATALYSTS.md.",
    };
  }
  if (status.lastError && !status.lastSuccessfulFetchAt) {
    return {
      key: "analyst",
      label: "Analyst & Earnings Data",
      status: "failed",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: status.lastError,
    };
  }
  if (!status.lastSuccessfulFetchAt) {
    return {
      key: "analyst",
      label: "Analyst & Earnings Data",
      status: "degraded",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: null,
      detail: "Finnhub key is set but hasn't been verified by a successful fetch yet — open Analysts or Catalysts to test it.",
    };
  }
  return {
    key: "analyst",
    label: "Analyst & Earnings Data",
    status: status.lastError ? "degraded" : "operational",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: status.lastSuccessfulFetchAt,
    detail: status.lastError ?? undefined,
  };
}

/**
 * Real since Phase 6: the scheduler always runs (no credential gates it —
 * its jobs simply no-op when nothing is configured), so "not_configured"
 * no longer applies. "operational" requires the scheduler to actually be
 * running; "degraded" surfaces a job with a real lastError.
 */
export function checkScheduledJobs(scheduler: Scheduler): IntegrationHealth {
  const now = new Date().toISOString();
  const status = scheduler.getStatus();
  const failingJob = status.jobs.find((j) => j.lastError);
  const mostRecentSuccess = status.jobs
    .map((j) => j.lastSuccessAt)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);

  if (!status.schedulerRunning) {
    return {
      key: "scheduled_jobs",
      label: "Scheduled Jobs",
      status: "failed",
      lastCheckedAt: now,
      lastSuccessfulSyncAt: mostRecentSuccess ?? null,
      detail: "The scheduler is not running.",
    };
  }
  return {
    key: "scheduled_jobs",
    label: "Scheduled Jobs",
    status: failingJob ? "degraded" : "operational",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: mostRecentSuccess ?? null,
    detail: failingJob ? `${failingJob.name}: ${failingJob.lastError}` : `${status.jobs.length} job(s) registered.`,
  };
}

export async function getAllIntegrationHealth(
  prisma: PrismaClient,
  config: AppConfig,
  ibkr: IbkrConnectionManager,
  aiAgent: PortfolioAiAgent,
  newsService: NewsService,
  analystService: AnalystService,
  scheduler: Scheduler,
): Promise<IntegrationHealth[]> {
  const database = await checkDatabase(prisma);
  return [
    checkIbkr(ibkr),
    checkOpenAi(aiAgent),
    checkMarketData(config),
    checkNews(newsService),
    checkAnalyst(analystService),
    database,
    checkScheduledJobs(scheduler),
  ];
}
