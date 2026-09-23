import type { EarningsEvent, LiveData } from "@pcc/shared";

/**
 * The rest of the application depends only on this interface, never on a
 * specific earnings-calendar vendor directly — see ARCHITECTURE.md §5 and
 * docs/RISK_AND_CATALYSTS.md §1.
 */
export interface EarningsDataSource {
  getEarningsForSymbol(symbol: string, limit?: number): Promise<LiveData<EarningsEvent[]>>;
  getUpcomingPortfolioEarnings(userId: string, limit?: number): Promise<LiveData<EarningsEvent[]>>;
}
