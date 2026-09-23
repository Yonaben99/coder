import type { LiveData, NewsItem, PortfolioNewsSummary } from "@pcc/shared";

/**
 * The rest of the application depends only on this interface, never on a
 * specific news vendor directly — see ARCHITECTURE.md §5 and
 * docs/NEWS_INTEGRATION.md §2. `NotConnectedNewsDataSource` implements this
 * honestly before a provider is configured; `NewsIntegrationDataSource`
 * (Phase 4) implements it for real, backed by `NewsService`.
 */
export interface NewsDataSource {
  getRecentNews(limit?: number): Promise<LiveData<NewsItem[]>>;
  getPortfolioNews(userId: string, limit?: number): Promise<LiveData<NewsItem[]>>;
  getNewsForSymbol(symbol: string, limit?: number): Promise<LiveData<NewsItem[]>>;
  getPortfolioNewsSummary(userId: string): Promise<LiveData<PortfolioNewsSummary[]>>;
  getMaterialPortfolioUpdates(userId: string): Promise<LiveData<NewsItem[]>>;
  getArticleById(id: string): Promise<NewsItem | null>;
}
