import type { AlertCategory, AlertRule } from "@pcc/db";
import type {
  AnalystDataSource,
  CatalystDataSource,
  EarningsDataSource,
  NewsDataSource,
  PortfolioDataSource,
  RiskDataSource,
} from "../../domain/data-sources/index.js";
import type { IbkrConnectionManager } from "../ibkr/connection-manager.js";

export interface AlertServices {
  portfolioDataSource: PortfolioDataSource;
  newsDataSource: NewsDataSource;
  analystDataSource: AnalystDataSource;
  earningsDataSource: EarningsDataSource;
  catalystDataSource: CatalystDataSource;
  riskDataSource: RiskDataSource;
  ibkr: IbkrConnectionManager;
}

export interface RaiseAlertInput {
  category: AlertCategory;
  symbol: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  explanation: string;
  sourceUrl?: string | null;
  condition: Record<string, unknown>;
  dedupeKey: string;
  cooldownMinutes: number;
}

export type RaiseAlert = (input: RaiseAlertInput) => Promise<void>;

/** One detector per alert category. `rule` is null for the always-on detectors (connection health) that don't require user configuration. */
export type Detector = (userId: string, rule: AlertRule | null, services: AlertServices, raise: RaiseAlert) => Promise<void>;
