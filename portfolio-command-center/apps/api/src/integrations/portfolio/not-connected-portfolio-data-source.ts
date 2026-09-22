import { unavailable, type AccountSummary, type LiveData, type Position } from "@pcc/shared";
import type { PortfolioDataSource } from "../../domain/data-sources/index.js";

/**
 * Active implementation of PortfolioDataSource until Phase 2 wires up IBKR.
 * It is not a mock: it truthfully reports that no broker is connected,
 * which is the correct behavior for every route that uses it today. When
 * `IbkrPortfolioDataSource` is implemented, it is swapped in via the same
 * interface and this class is deleted.
 */
export class NotConnectedPortfolioDataSource implements PortfolioDataSource {
  async getAccountSummary(_userId: string): Promise<LiveData<AccountSummary>> {
    return unavailable<AccountSummary>("IBKR", "IBKR is not connected yet. Connect it in Settings → Connections.");
  }

  async getPositions(_userId: string): Promise<LiveData<Position[]>> {
    return unavailable<Position[]>("IBKR", "IBKR is not connected yet. Connect it in Settings → Connections.");
  }
}
