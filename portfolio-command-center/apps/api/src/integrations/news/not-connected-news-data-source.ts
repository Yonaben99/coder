import { unavailable, type LiveData, type NewsItem, type PortfolioNewsSummary } from "@pcc/shared";
import type { NewsDataSource } from "../../domain/data-sources/index.js";

const REASON = "News integration is not connected yet.";

export class NotConnectedNewsDataSource implements NewsDataSource {
  async getRecentNews(): Promise<LiveData<NewsItem[]>> {
    return unavailable<NewsItem[]>("news", REASON);
  }

  async getPortfolioNews(): Promise<LiveData<NewsItem[]>> {
    return unavailable<NewsItem[]>("news", REASON);
  }

  async getNewsForSymbol(): Promise<LiveData<NewsItem[]>> {
    return unavailable<NewsItem[]>("news", REASON);
  }

  async getPortfolioNewsSummary(): Promise<LiveData<PortfolioNewsSummary[]>> {
    return unavailable<PortfolioNewsSummary[]>("news", REASON);
  }

  async getMaterialPortfolioUpdates(): Promise<LiveData<NewsItem[]>> {
    return unavailable<NewsItem[]>("news", REASON);
  }

  async getArticleById(): Promise<NewsItem | null> {
    return null;
  }
}
