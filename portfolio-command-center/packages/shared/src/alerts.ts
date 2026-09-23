export type AlertCategory =
  | "price_movement"
  | "pnl_change"
  | "high_relevance_news"
  | "earnings_approaching"
  | "earnings_released"
  | "analyst_target_revision"
  | "analyst_rating_change"
  | "major_catalyst"
  | "concentration_change"
  | "margin_liquidity_threshold"
  | "exposure_change"
  | "data_connection_failure"
  | "stale_data"
  | "ibkr_connection_status";

export type AlertSeverity = "info" | "warning" | "critical";

/** The user's read/triage state — distinct from whether the underlying condition is still active. */
export type AlertReadState = "new" | "read" | "acknowledged";

export interface AlertItem {
  id: string;
  category: AlertCategory;
  symbol: string | null;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  sourceUrl: string | null;
  readState: AlertReadState;
  firstDetectedAt: string;
  lastDetectedAt: string;
}

export interface AlertRuleConfig {
  id: string;
  category: AlertCategory;
  symbol: string | null;
  enabled: boolean;
  threshold: number | null;
  severity: AlertSeverity;
  cooldownMinutes: number;
  notifyInApp: boolean;
}

export interface MonitoringJobStatus {
  name: string;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface MonitoringStatus {
  schedulerRunning: boolean;
  jobs: MonitoringJobStatus[];
}
