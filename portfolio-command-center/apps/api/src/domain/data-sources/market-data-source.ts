import type { LiveData, MarketData } from "@pcc/shared";

export interface MarketDataSource {
  getQuote(symbol: string): Promise<LiveData<MarketData>>;
  getQuotes(symbols: string[]): Promise<LiveData<MarketData[]>>;
}
