import type { Position } from "@pcc/shared";

export type AssetTypeLabel = "ETF" | "Individual Equity" | "Other";

/**
 * IBKR's own position data has no explicit ETF flag — ETFs trade under the
 * same "STK" assetClass as individual stocks (see
 * apps/api/src/integrations/ibkr/portfolio-mapper.ts). This is a
 * best-effort heuristic, not authoritative: IBKR's sector classification
 * (GICS) is typically empty for ETFs since they aren't single-industry
 * companies, so assetClass === "STK" with no sector is treated as "likely
 * ETF". Documented as a limitation in docs/RISK_AND_CATALYSTS.md §3.
 */
export function classifyAssetType(position: Position): AssetTypeLabel {
  if (position.assetClass !== "STK") return "Other";
  return position.sector ? "Individual Equity" : "ETF";
}
