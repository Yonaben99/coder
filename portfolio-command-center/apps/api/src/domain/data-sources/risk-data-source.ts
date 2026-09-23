import type { LiveData, PortfolioRiskSummary } from "@pcc/shared";

/**
 * The rest of the application depends only on this interface — never on
 * RiskService's internal calculations directly. Like CatalystDataSource,
 * there is no separate "not connected" implementation: the risk engine has
 * no vendor credential of its own — its honesty comes from the
 * PortfolioDataSource it's computed over. See docs/RISK_AND_CATALYSTS.md §3.
 */
export interface RiskDataSource {
  getPortfolioRiskSummary(userId: string): Promise<LiveData<PortfolioRiskSummary>>;
}
