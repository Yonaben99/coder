import type { AccountSummary, ConcentrationSlice, Position, RiskMetric, RiskMetricKey, RiskSeverity } from "@pcc/shared";
import { classifyAssetType } from "./asset-type.js";

const IBKR_SOURCE = "IBKR (via PortfolioDataSource)";
const COMPUTED_SOURCE = "Computed from current IBKR positions";

function severityFromThresholds(value: number, medium: number, high: number): RiskSeverity {
  if (value >= high) return "high";
  if (value >= medium) return "medium";
  return "low";
}

function groupWeight(positions: Position[], keyFn: (p: Position) => string): ConcentrationSlice[] {
  const totals = new Map<string, number>();
  for (const position of positions) {
    if (position.weight === null) continue;
    const key = keyFn(position);
    totals.set(key, (totals.get(key) ?? 0) + position.weight);
  }
  return [...totals.entries()].map(([label, weight]) => ({ label, weight })).sort((a, b) => b.weight - a.weight);
}

function metric(
  key: RiskMetricKey,
  label: string,
  value: number | null,
  unit: RiskMetric["unit"],
  severity: RiskSeverity | null,
  explanation: string,
  formula: string,
  source: string,
  asOf: string | null,
): RiskMetric {
  return { key, label, value, unit, severity, explanation, formula, source, asOf };
}

/**
 * Every metric here is an individually-measurable, documented calculation
 * — never an arbitrary composite "risk score". See
 * docs/RISK_AND_CATALYSTS.md §3 for the canonical formula table and
 * severity thresholds. Metrics whose required input is missing return
 * value: null with an explanation — never a substituted zero or assumed
 * value (Phase 5.7's explicit requirement).
 */
export function computeCurrentRiskMetrics(positions: Position[], account: AccountSummary, asOf: string): RiskMetric[] {
  const metrics: RiskMetric[] = [];
  const weighted = positions.filter((p) => p.weight !== null);
  const sortedByWeight = [...weighted].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  // Largest single position
  const largest = sortedByWeight[0] ?? null;
  metrics.push(
    metric(
      "largest_position_weight",
      "Largest Position Weight",
      largest?.weight ?? null,
      "percent",
      largest?.weight != null ? severityFromThresholds(largest.weight, 15, 25) : null,
      largest ? `${largest.symbol} is the largest position at ${largest.weight?.toFixed(1)}% of net liquidation.` : "No positions with a known weight.",
      "max(position.weight) across all current positions",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  // Top-N concentration
  const top5 = sortedByWeight.slice(0, 5).reduce((sum, p) => sum + (p.weight ?? 0), 0);
  const top10 = sortedByWeight.slice(0, 10).reduce((sum, p) => sum + (p.weight ?? 0), 0);
  metrics.push(
    metric(
      "top5_concentration",
      "Top 5 Concentration",
      weighted.length > 0 ? top5 : null,
      "percent",
      weighted.length > 0 ? severityFromThresholds(top5, 50, 75) : null,
      `The 5 largest positions make up ${top5.toFixed(1)}% of net liquidation.`,
      "sum(position.weight) for the 5 largest positions by weight",
      COMPUTED_SOURCE,
      asOf,
    ),
  );
  metrics.push(
    metric(
      "top10_concentration",
      "Top 10 Concentration",
      weighted.length > 0 ? top10 : null,
      "percent",
      weighted.length > 0 ? severityFromThresholds(top10, 70, 90) : null,
      `The 10 largest positions make up ${top10.toFixed(1)}% of net liquidation.`,
      "sum(position.weight) for the 10 largest positions by weight",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  // Sector concentration
  const bySector = groupWeight(weighted, (p) => p.sector ?? "Unclassified");
  const maxSector = bySector[0] ?? null;
  metrics.push(
    metric(
      "sector_concentration",
      "Largest Sector Concentration",
      maxSector?.weight ?? null,
      "percent",
      maxSector ? severityFromThresholds(maxSector.weight, 30, 50) : null,
      maxSector ? `${maxSector.label} is the largest sector at ${maxSector.weight.toFixed(1)}% of net liquidation.` : "No sector data available.",
      "max(sum(position.weight) grouped by position.sector)",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  // Country concentration
  const byCountry = groupWeight(weighted, (p) => p.country ?? "Unclassified");
  const maxCountry = byCountry[0] ?? null;
  metrics.push(
    metric(
      "country_concentration",
      "Largest Country Concentration",
      maxCountry?.weight ?? null,
      "percent",
      maxCountry ? severityFromThresholds(maxCountry.weight, 60, 85) : null,
      maxCountry ? `${maxCountry.label} is the largest country exposure at ${maxCountry.weight.toFixed(1)}% of net liquidation.` : "No country data available.",
      "max(sum(position.weight) grouped by position.country)",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  // ETF vs individual equity — heuristic, see asset-type.ts
  const byAssetType = groupWeight(weighted, (p) => classifyAssetType(p));
  const equitySlice = byAssetType.find((s) => s.label === "Individual Equity") ?? null;
  metrics.push(
    metric(
      "etf_vs_equity_exposure",
      "Individual Equity Exposure",
      weighted.length > 0 ? (equitySlice?.weight ?? 0) : null,
      "percent",
      null,
      `${(equitySlice?.weight ?? 0).toFixed(1)}% of net liquidation is in individual equities rather than ETFs/other (heuristic classification — see docs/RISK_AND_CATALYSTS.md §3).`,
      "sum(position.weight) where assetClass=STK and sector is non-null (heuristic for \"not an ETF\")",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  // Cash exposure
  const cashExposure = account.cash !== null && account.netLiquidation ? (account.cash / account.netLiquidation) * 100 : null;
  metrics.push(
    metric(
      "cash_exposure",
      "Cash Exposure",
      cashExposure,
      "percent",
      cashExposure !== null ? (cashExposure < 2 ? "medium" : "low") : null,
      cashExposure !== null ? `Cash is ${cashExposure.toFixed(1)}% of net liquidation.` : "Cash or net liquidation not available.",
      "account.cash / account.netLiquidation * 100",
      IBKR_SOURCE,
      asOf,
    ),
  );

  // Single-name exposure: count of positions individually over 10% of the account
  const concentratedCount = weighted.filter((p) => (p.weight ?? 0) > 10).length;
  metrics.push(
    metric(
      "single_name_exposure",
      "Concentrated Single-Name Positions",
      weighted.length > 0 ? concentratedCount : null,
      "ratio",
      weighted.length > 0 ? severityFromThresholds(concentratedCount, 1, 3) : null,
      `${concentratedCount} position(s) individually exceed 10% of net liquidation.`,
      "count(positions where weight > 10%)",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  // Gross exposure
  const grossExposure =
    account.netLiquidation && account.netLiquidation !== 0
      ? (positions.reduce((sum, p) => sum + Math.abs(p.marketValue ?? 0), 0) / account.netLiquidation) * 100
      : null;
  metrics.push(
    metric(
      "gross_exposure",
      "Gross Exposure",
      grossExposure,
      "percent",
      grossExposure !== null ? severityFromThresholds(grossExposure, 100, 130) : null,
      grossExposure !== null
        ? `Gross position value is ${grossExposure.toFixed(1)}% of net liquidation (100% = fully invested, long-only, no leverage).`
        : "Net liquidation not available.",
      "sum(abs(position.marketValue)) / account.netLiquidation * 100",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  // Leverage — pass through IBKR's own figure, not recomputed
  metrics.push(
    metric(
      "leverage",
      "Leverage",
      account.leverage,
      "ratio",
      account.leverage !== null ? severityFromThresholds(account.leverage, 1.3, 2) : null,
      account.leverage !== null ? `Reported leverage is ${account.leverage.toFixed(2)}x.` : "IBKR did not report a leverage figure.",
      "Reported directly by IBKR (gross position value / net liquidation, per IBKR's own account summary)",
      IBKR_SOURCE,
      asOf,
    ),
  );

  // Margin utilization
  const marginUtilization = account.margin !== null && account.netLiquidation ? (account.margin / account.netLiquidation) * 100 : null;
  metrics.push(
    metric(
      "margin_utilization",
      "Margin Utilization",
      marginUtilization,
      "percent",
      marginUtilization !== null ? severityFromThresholds(marginUtilization, 25, 50) : null,
      marginUtilization !== null ? `IBKR-reported margin requirement is ${marginUtilization.toFixed(1)}% of net liquidation.` : "Margin or net liquidation not available.",
      "account.margin / account.netLiquidation * 100",
      IBKR_SOURCE,
      asOf,
    ),
  );

  // Unrealized P&L concentration
  const totalAbsPnl = positions.reduce((sum, p) => sum + Math.abs(p.unrealizedPnl ?? 0), 0);
  const largestPnlMover = [...positions].sort((a, b) => Math.abs(b.unrealizedPnl ?? 0) - Math.abs(a.unrealizedPnl ?? 0))[0] ?? null;
  const pnlConcentration = totalAbsPnl > 0 && largestPnlMover ? (Math.abs(largestPnlMover.unrealizedPnl ?? 0) / totalAbsPnl) * 100 : null;
  metrics.push(
    metric(
      "unrealized_pnl_concentration",
      "Unrealized P&L Concentration",
      pnlConcentration,
      "percent",
      pnlConcentration !== null ? severityFromThresholds(pnlConcentration, 40, 65) : null,
      pnlConcentration !== null && largestPnlMover
        ? `${largestPnlMover.symbol} accounts for ${pnlConcentration.toFixed(1)}% of total unrealized P&L magnitude across the portfolio.`
        : "No unrealized P&L to measure.",
      "abs(largest position's unrealizedPnl) / sum(abs(every position's unrealizedPnl)) * 100",
      COMPUTED_SOURCE,
      asOf,
    ),
  );

  return metrics;
}

export function computeConcentrationSlices(positions: Position[]): {
  bySector: ConcentrationSlice[];
  byCountry: ConcentrationSlice[];
  byAssetType: ConcentrationSlice[];
  topPositions: ConcentrationSlice[];
} {
  const weighted = positions.filter((p) => p.weight !== null);
  return {
    bySector: groupWeight(weighted, (p) => p.sector ?? "Unclassified"),
    byCountry: groupWeight(weighted, (p) => p.country ?? "Unclassified"),
    byAssetType: groupWeight(weighted, (p) => classifyAssetType(p)),
    topPositions: [...weighted]
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 10)
      .map((p) => ({ label: p.symbol, weight: p.weight ?? 0 })),
  };
}
