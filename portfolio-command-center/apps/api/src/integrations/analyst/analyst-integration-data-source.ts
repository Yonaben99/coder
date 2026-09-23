import type { AnalystEstimateSummary, AnalystRevisionItem, LiveData } from "@pcc/shared";
import type { AnalystDataSource } from "../../domain/data-sources/index.js";
import type { AnalystService } from "./analyst-service.js";

/** Real AnalystDataSource, backed by AnalystService. Thin by design — AnalystService already owns caching/normalization; this class only exists so routes/AI tools depend on the interface, not the concrete service. */
export class AnalystIntegrationDataSource implements AnalystDataSource {
  constructor(private readonly analystService: AnalystService) {}

  async getAnalystEstimate(symbol: string): Promise<LiveData<AnalystEstimateSummary>> {
    return this.analystService.getEstimate(symbol);
  }

  async getAnalystRevisions(symbol: string, limit = 20): Promise<LiveData<AnalystRevisionItem[]>> {
    return this.analystService.getRevisions(symbol, limit);
  }
}
