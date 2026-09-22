export type RiskSeverity = "low" | "medium" | "high";

export interface RiskMetric {
  key: string;
  label: string;
  value: number | null;
  severity: RiskSeverity | null;
  /** Why this is flagged — the source of the risk, not just a label. */
  explanation: string;
}
