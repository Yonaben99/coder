import { unavailable, type AnalystEstimateSummary, type AnalystRevisionItem, type LiveData } from "@pcc/shared";
import type { AnalystDataSource } from "../../domain/data-sources/index.js";

const REASON = "Analyst data integration is not connected yet.";

export class NotConnectedAnalystDataSource implements AnalystDataSource {
  async getAnalystEstimate(): Promise<LiveData<AnalystEstimateSummary>> {
    return unavailable<AnalystEstimateSummary>("analyst", REASON);
  }

  async getAnalystRevisions(): Promise<LiveData<AnalystRevisionItem[]>> {
    return unavailable<AnalystRevisionItem[]>("analyst", REASON);
  }
}
