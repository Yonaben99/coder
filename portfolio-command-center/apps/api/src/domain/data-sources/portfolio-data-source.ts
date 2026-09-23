import type { AccountSummary, LiveData, Position } from "@pcc/shared";

/**
 * The rest of the application depends only on this interface, never on IBKR
 * (or any other broker) directly. Today there is no implementation — every
 * route that needs portfolio data must use a `NotConnectedPortfolioDataSource`
 * (or equivalent) rather than fabricating values. When IBKR read access
 * lands in Phase 2, `IbkrPortfolioDataSource` implements this same
 * interface and nothing above this layer changes. See ARCHITECTURE.md §5.
 */
export interface PortfolioDataSource {
  getAccountSummary(userId: string): Promise<LiveData<AccountSummary>>;
  getPositions(userId: string): Promise<LiveData<Position[]>>;
}
