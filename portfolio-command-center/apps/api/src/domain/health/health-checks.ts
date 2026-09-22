import type { IntegrationHealth } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";
import type { AppConfig } from "../../config.js";
import type { IbkrConnectionManager } from "../../integrations/ibkr/connection-manager.js";

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

export function checkOpenAi(config: AppConfig): IntegrationHealth {
  const now = new Date().toISOString();
  return {
    key: "openai",
    label: "OpenAI API",
    status: "not_configured",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: null,
    detail: config.OPENAI_API_KEY
      ? "OpenAI key is set, but the Phase 3 integration is not implemented yet."
      : "Portfolio AI integration ships in Phase 3.",
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
      ? "Market data key is set, but the Phase 4 integration is not implemented yet."
      : "Market data integration ships in Phase 4.",
  };
}

export function checkNews(config: AppConfig): IntegrationHealth {
  const now = new Date().toISOString();
  return {
    key: "news",
    label: "News",
    status: "not_configured",
    lastCheckedAt: now,
    lastSuccessfulSyncAt: null,
    detail: config.MARKET_INTEL_API_KEY
      ? "News data key is set, but the Phase 4 integration is not implemented yet."
      : "News integration ships in Phase 4.",
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
): Promise<IntegrationHealth[]> {
  const database = await checkDatabase(prisma);
  return [checkIbkr(ibkr), checkOpenAi(config), checkMarketData(config), checkNews(config), database, checkScheduledJobs()];
}
