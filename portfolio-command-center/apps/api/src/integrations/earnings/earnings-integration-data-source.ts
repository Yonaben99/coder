import { unavailable, type EarningsEvent, type LiveData } from "@pcc/shared";
import type { EarningsDataSource, PortfolioDataSource } from "../../domain/data-sources/index.js";
import type { EarningsService } from "./earnings-service.js";

const NO_HOLDINGS_REASON = "No portfolio holdings to fetch earnings for. Connect IBKR in Settings → Connections.";

/** Real EarningsDataSource, backed by EarningsService. Resolves "which symbols" via the existing PortfolioDataSource — never invents holdings, mirrors NewsIntegrationDataSource. */
export class EarningsIntegrationDataSource implements EarningsDataSource {
  constructor(
    private readonly earningsService: EarningsService,
    private readonly portfolioDataSource: PortfolioDataSource,
  ) {}

  async getEarningsForSymbol(symbol: string, limit = 10): Promise<LiveData<EarningsEvent[]>> {
    return this.earningsService.getForSymbol(symbol, limit);
  }

  async getUpcomingPortfolioEarnings(userId: string, limit = 30): Promise<LiveData<EarningsEvent[]>> {
    const positions = await this.portfolioDataSource.getPositions(userId);
    if (!positions.data || positions.data.length === 0) {
      return unavailable<EarningsEvent[]>("earnings", positions.meta.reason ?? NO_HOLDINGS_REASON);
    }
    const symbols = [...new Set(positions.data.map((p) => p.symbol.toUpperCase()))];
    return this.earningsService.getUpcomingForSymbols(symbols, limit);
  }
}
