import type { LiveData, NewsItem } from "@pcc/shared";

export interface NewsDataSource {
  getPortfolioNews(userId: string): Promise<LiveData<NewsItem[]>>;
  getNewsForSymbol(symbol: string): Promise<LiveData<NewsItem[]>>;
}
