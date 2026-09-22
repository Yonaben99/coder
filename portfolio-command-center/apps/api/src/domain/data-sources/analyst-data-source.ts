import type { AnalystEstimateSummary, LiveData } from "@pcc/shared";

export interface AnalystDataSource {
  getAnalystEstimate(symbol: string): Promise<LiveData<AnalystEstimateSummary>>;
}
