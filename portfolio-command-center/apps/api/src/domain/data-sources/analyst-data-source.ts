import type { AnalystEstimateSummary, AnalystRevisionItem, LiveData } from "@pcc/shared";

/**
 * The rest of the application depends only on this interface, never on a
 * specific analyst-data vendor directly — see ARCHITECTURE.md §5 and
 * docs/RISK_AND_CATALYSTS.md §1. `NotConnectedAnalystDataSource` implements
 * this honestly before a provider is configured; `AnalystIntegrationDataSource`
 * (Phase 5) implements it for real, backed by `AnalystService`.
 */
export interface AnalystDataSource {
  getAnalystEstimate(symbol: string): Promise<LiveData<AnalystEstimateSummary>>;
  getAnalystRevisions(symbol: string, limit?: number): Promise<LiveData<AnalystRevisionItem[]>>;
}
