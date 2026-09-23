/** Friendly, non-technical labels for the tool-call transparency badges — never the raw function name. */
export const TOOL_LABELS: Record<string, string> = {
  getAccountSummary: "Checking account summary",
  getPositions: "Checking positions",
  getPosition: "Checking a position",
  getPortfolioAllocation: "Checking allocation",
  getPortfolioPerformance: "Checking performance history",
  getMarketData: "Checking market data",
  getRecentTrades: "Checking recent trades",
  getOpenOrders: "Checking open orders",
  getHistoricalPortfolioSnapshots: "Checking portfolio history",
  getRiskMetrics: "Checking risk metrics",
  getPortfolioContext: "Analyzing portfolio",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}
