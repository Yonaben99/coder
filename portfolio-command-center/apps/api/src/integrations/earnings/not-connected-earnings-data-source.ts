import { unavailable, type EarningsEvent, type LiveData } from "@pcc/shared";
import type { EarningsDataSource } from "../../domain/data-sources/index.js";

const REASON = "Earnings data integration is not connected yet.";

export class NotConnectedEarningsDataSource implements EarningsDataSource {
  async getEarningsForSymbol(): Promise<LiveData<EarningsEvent[]>> {
    return unavailable<EarningsEvent[]>("earnings", REASON);
  }

  async getUpcomingPortfolioEarnings(): Promise<LiveData<EarningsEvent[]>> {
    return unavailable<EarningsEvent[]>("earnings", REASON);
  }
}
