import { unavailable, type LiveData, type MarketData } from "@pcc/shared";
import type { MarketDataSource } from "../../domain/data-sources/index.js";

export class NotConnectedMarketDataSource implements MarketDataSource {
  async getQuote(_symbol: string): Promise<LiveData<MarketData>> {
    return unavailable<MarketData>("market-data", "Market data integration is not connected yet.");
  }

  async getQuotes(_symbols: string[]): Promise<LiveData<MarketData[]>> {
    return unavailable<MarketData[]>("market-data", "Market data integration is not connected yet.");
  }
}
