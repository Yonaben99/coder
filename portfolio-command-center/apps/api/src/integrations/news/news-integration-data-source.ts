import { unavailable, type LiveData, type NewsItem, type PortfolioNewsSummary } from "@pcc/shared";
import type { NewsDataSource, PortfolioDataSource } from "../../domain/data-sources/index.js";
import type { NewsService } from "./news-service.js";

const NO_HOLDINGS_REASON = "No portfolio holdings to fetch news for. Connect IBKR in Settings → Connections.";

/**
 * Real NewsDataSource, backed by NewsService. Resolves "which symbols" via
 * the existing PortfolioDataSource (never invents holdings, never reads
 * IBKR directly) and delegates fetching/caching/normalization to
 * NewsService. Mirrors IbkrPortfolioDataSource's role: this class only
 * resolves "what does this user hold" and shapes the response; everything
 * vendor-specific lives in NewsService and its NewsProvider.
 */
export class NewsIntegrationDataSource implements NewsDataSource {
  constructor(
    private readonly newsService: NewsService,
    private readonly portfolioDataSource: PortfolioDataSource,
  ) {}

  async getRecentNews(limit = 30): Promise<LiveData<NewsItem[]>> {
    return this.newsService.getMarketNews(limit);
  }

  async getNewsForSymbol(symbol: string, limit = 20): Promise<LiveData<NewsItem[]>> {
    return this.newsService.getCompanyNews(symbol, limit);
  }

  private async resolveHeldSymbols(userId: string): Promise<{ symbols: string[]; reason?: string }> {
    const positions = await this.portfolioDataSource.getPositions(userId);
    if (!positions.data || positions.data.length === 0) {
      return { symbols: [], reason: positions.meta.reason ?? NO_HOLDINGS_REASON };
    }
    return { symbols: [...new Set(positions.data.map((p) => p.symbol.toUpperCase()))] };
  }

  async getPortfolioNews(userId: string, limit = 50): Promise<LiveData<NewsItem[]>> {
    const { symbols, reason } = await this.resolveHeldSymbols(userId);
    if (symbols.length === 0) return unavailable<NewsItem[]>("news", reason ?? NO_HOLDINGS_REASON);
    return this.newsService.getPortfolioNews(symbols, limit);
  }

  async getPortfolioNewsSummary(userId: string): Promise<LiveData<PortfolioNewsSummary[]>> {
    const { symbols, reason } = await this.resolveHeldSymbols(userId);
    if (symbols.length === 0) return unavailable<PortfolioNewsSummary[]>("news", reason ?? NO_HOLDINGS_REASON);
    return this.newsService.getPortfolioNewsSummary(symbols);
  }

  /** High/medium-relevance-only slice of getPortfolioNews — backs the AI tool of the same name. */
  async getMaterialPortfolioUpdates(userId: string): Promise<LiveData<NewsItem[]>> {
    const result = await this.getPortfolioNews(userId, 200);
    if (!result.data) return { data: null, meta: result.meta };
    return {
      data: result.data.filter((item) => item.relevance === "high" || item.relevance === "medium"),
      meta: result.meta,
    };
  }

  async getArticleById(id: string): Promise<NewsItem | null> {
    return this.newsService.getArticleById(id);
  }
}
