export type IntegrationKey =
  | "ibkr"
  | "openai"
  | "market_data"
  | "news"
  | "analyst"
  | "database"
  | "scheduled_jobs";

/**
 * "not_configured" is distinct from "failed": it means the integration has
 * no implementation/credentials wired up yet (expected in early phases),
 * while "failed" means it was configured but a real connection test failed.
 */
export type IntegrationHealthStatus = "operational" | "degraded" | "failed" | "not_configured";

export interface IntegrationHealth {
  key: IntegrationKey;
  label: string;
  status: IntegrationHealthStatus;
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  detail?: string;
}

export type ConnectionActionCapability = "test_connection" | "reconnect";

export interface ConnectionInfo extends IntegrationHealth {
  capabilities: ConnectionActionCapability[];
}
