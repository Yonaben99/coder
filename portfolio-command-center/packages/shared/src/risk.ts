export type RiskSeverity = "low" | "medium" | "high";

export type RiskMetricKey =
  | "largest_position_weight"
  | "top5_concentration"
  | "top10_concentration"
  | "sector_concentration"
  | "country_concentration"
  | "etf_vs_equity_exposure"
  | "cash_exposure"
  | "single_name_exposure"
  | "gross_exposure"
  | "leverage"
  | "margin_utilization"
  | "unrealized_pnl_concentration"
  | "exposure_change_7d"
  | "concentration_change_7d";

export type RiskMetricUnit = "percent" | "ratio" | "currency";

/**
 * One deterministic, individually-measurable risk metric — never an
 * arbitrary composite "risk score". Every metric documents its own
 * formula/source/timestamp so a reader can verify it, per
 * docs/RISK_AND_CATALYSTS.md §3.
 */
export interface RiskMetric {
  key: RiskMetricKey;
  label: string;
  value: number | null;
  unit: RiskMetricUnit | null;
  severity: RiskSeverity | null;
  /** Why this is flagged — the source of the risk, not just a label. */
  explanation: string;
  /** The exact calculation, in words — see docs/RISK_AND_CATALYSTS.md §3 for the canonical table. */
  formula: string;
  source: string;
  asOf: string | null;
}

export interface ConcentrationSlice {
  label: string;
  weight: number;
}

export interface PortfolioRiskSummary {
  metrics: RiskMetric[];
  bySector: ConcentrationSlice[];
  byCountry: ConcentrationSlice[];
  /** Equity vs ETF vs unclassified — a heuristic, not authoritative; see docs/RISK_AND_CATALYSTS.md §3 "ETF vs equity" limitation. */
  byAssetType: ConcentrationSlice[];
  topPositions: ConcentrationSlice[];
  asOf: string;
}
