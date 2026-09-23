import { unavailable, type Catalyst, type LiveData } from "@pcc/shared";
import type { CatalystDataSource, PortfolioDataSource } from "../../domain/data-sources/index.js";
import type { CatalystService } from "./catalyst-service.js";

const NO_HOLDINGS_REASON = "No portfolio holdings to derive catalysts for. Connect IBKR in Settings → Connections.";

export class CatalystIntegrationDataSource implements CatalystDataSource {
  constructor(
    private readonly catalystService: CatalystService,
    private readonly portfolioDataSource: PortfolioDataSource,
  ) {}

  async getCatalystsForSymbol(symbol: string, limit = 30): Promise<LiveData<Catalyst[]>> {
    return this.catalystService.getCatalystsForSymbol(symbol, limit);
  }

  async getPortfolioCatalysts(userId: string, limit = 50): Promise<LiveData<Catalyst[]>> {
    const positions = await this.portfolioDataSource.getPositions(userId);
    if (!positions.data || positions.data.length === 0) {
      return unavailable<Catalyst[]>("catalyst-engine", positions.meta.reason ?? NO_HOLDINGS_REASON);
    }
    const symbols = [...new Set(positions.data.map((p) => p.symbol.toUpperCase()))];
    return this.catalystService.getPortfolioCatalysts(symbols, limit);
  }
}
