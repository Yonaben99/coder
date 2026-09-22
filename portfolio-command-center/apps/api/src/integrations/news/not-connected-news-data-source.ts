import { unavailable, type LiveData, type NewsItem } from "@pcc/shared";
import type { NewsDataSource } from "../../domain/data-sources/index.js";

export class NotConnectedNewsDataSource implements NewsDataSource {
  async getPortfolioNews(_userId: string): Promise<LiveData<NewsItem[]>> {
    return unavailable<NewsItem[]>("news", "News integration is not connected yet.");
  }

  async getNewsForSymbol(_symbol: string): Promise<LiveData<NewsItem[]>> {
    return unavailable<NewsItem[]>("news", "News integration is not connected yet.");
  }
}
