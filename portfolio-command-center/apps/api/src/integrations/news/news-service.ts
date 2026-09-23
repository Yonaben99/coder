import type { LiveData, NewsCategory, NewsItem } from "@pcc/shared";
import { unavailable } from "@pcc/shared";
import type { NewsArticle as DbNewsArticle, NewsEvent as DbNewsEvent, PrismaClient } from "@pcc/db";
import { classifyNewsError, NewsError } from "./errors.js";
import { isLikelyDuplicate, normalizeUrlForDedup } from "./dedup.js";
import { normalizeFinnhubArticle, type NormalizedArticle } from "./normalizer.js";
import type { NewsProvider } from "./news-provider.js";

const RECENT_CACHE_TTL_MS = 10 * 60 * 1000; // news doesn't move second-to-second like a quote — see docs/NEWS_INTEGRATION.md §"Cache policy"
const COMPANY_NEWS_LOOKBACK_DAYS = 7;
const DEDUP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type ArticleWithEvents = DbNewsArticle & { events: DbNewsEvent[] };

const ARTICLE_INCLUDE = { events: true } as const;

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, what Finnhub's from/to expect
}

function toNewsItem(row: ArticleWithEvents): NewsItem {
  return {
    id: row.id,
    symbol: null, // filled in by the caller when querying for a specific symbol — see getCompanyNews
    relatedSymbols: row.relatedSymbols,
    headline: row.headline,
    source: row.source,
    provider: row.provider,
    url: row.url,
    publishedAt: row.publishedAt.toISOString(),
    retrievedAt: row.retrievedAt.toISOString(),
    categories: row.events.map((event) => event.eventType.toLowerCase() as NewsCategory),
    relevance: row.relevance ? (row.relevance.toLowerCase() as NewsItem["relevance"]) : null,
    summary: row.summary,
  };
}

/**
 * Owns everything news-shaped: fetching from the configured NewsProvider,
 * caching, normalizing, deduplicating, and persisting to Postgres. Returns
 * LiveData<NewsItem[]> — mapping happens here so routes and AI tools both
 * consume the same shape. Mirrors IbkrConnectionManager's
 * live/cached/unavailable pattern (docs/IBKR_INTEGRATION.md §4) rather than
 * inventing a new one.
 */
export class NewsService {
  private readonly companyNewsFetchedAt = new Map<string, Date>();
  private marketNewsFetchedAt: Date | null = null;
  private lastSuccessfulFetchAt: Date | null = null;
  private lastError: NewsError | null = null;

  constructor(
    private readonly provider: NewsProvider,
    private readonly prisma: PrismaClient,
  ) {}

  get configured(): boolean {
    return this.provider.isConfigured();
  }

  /** Backs checkNews() in health-checks.ts — "operational" only after a real successful fetch, mirroring checkIbkr/checkOpenAi. */
  getStatus(): { configured: boolean; lastSuccessfulFetchAt: string | null; lastError: string | null } {
    return {
      configured: this.configured,
      lastSuccessfulFetchAt: this.lastSuccessfulFetchAt?.toISOString() ?? null,
      lastError: this.lastError?.message ?? null,
    };
  }

  private async ingest(articles: NormalizedArticle[]): Promise<void> {
    for (const article of articles) {
      const existing = await this.prisma.newsArticle.findUnique({
        where: { provider_externalId: { provider: article.provider, externalId: article.externalId } },
      });

      if (existing) {
        await this.prisma.newsArticle.update({ where: { id: existing.id }, data: { retrievedAt: new Date() } });
        continue;
      }

      const normalizedUrl = normalizeUrlForDedup(article.url);
      const windowStart = new Date(article.publishedAt.getTime() - DEDUP_LOOKBACK_MS);
      const windowEnd = new Date(article.publishedAt.getTime() + DEDUP_LOOKBACK_MS);
      const candidates = await this.prisma.newsArticle.findMany({
        where: { status: "ACTIVE", publishedAt: { gte: windowStart, lte: windowEnd }, relatedSymbols: { hasSome: article.relatedSymbols } },
      });
      const duplicateOf = candidates.find(
        (candidate) =>
          normalizeUrlForDedup(candidate.url) === normalizedUrl ||
          isLikelyDuplicate(article, candidate) ||
          isLikelyDuplicate(candidate, { headline: article.headline, publishedAt: article.publishedAt, relatedSymbols: article.relatedSymbols }),
      );

      const created = await this.prisma.newsArticle.create({
        data: {
          provider: article.provider,
          externalId: article.externalId,
          headline: article.headline,
          summary: article.summary,
          source: article.source,
          url: article.url,
          publishedAt: article.publishedAt,
          relatedSymbols: article.relatedSymbols,
          relevance: article.relevance.toUpperCase() as "LOW" | "MEDIUM" | "HIGH",
          status: duplicateOf ? "DUPLICATE" : "ACTIVE",
          duplicateOfId: duplicateOf?.id,
        },
      });

      if (!duplicateOf) {
        await this.prisma.newsEvent.createMany({
          data: article.categories.map((category) => ({ articleId: created.id, eventType: category.toUpperCase() as never })),
        });
      }
    }
  }

  private async refreshCompanyNews(symbol: string): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - COMPANY_NEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const raw = await this.provider.getCompanyNews(symbol, toDateParam(from), toDateParam(to));
    await this.ingest(raw.map((article) => normalizeFinnhubArticle(article, symbol)));
    this.companyNewsFetchedAt.set(symbol.toUpperCase(), new Date());
  }

  private async refreshMarketNews(): Promise<void> {
    const raw = await this.provider.getMarketNews();
    await this.ingest(raw.map((article) => normalizeFinnhubArticle(article, null)));
    this.marketNewsFetchedAt = new Date();
  }

  private async withFreshness<T>(
    cacheKey: string,
    lastFetchedAt: Date | null,
    refresh: () => Promise<void>,
    query: () => Promise<T[]>,
  ): Promise<LiveData<T[]>> {
    if (!this.configured) {
      return unavailable("news", "News integration is not connected yet. Set FINNHUB_API_KEY and see docs/NEWS_INTEGRATION.md.");
    }

    const isFresh = lastFetchedAt && Date.now() - lastFetchedAt.getTime() < RECENT_CACHE_TTL_MS;
    let error: NewsError | null = null;

    if (!isFresh) {
      try {
        await refresh();
        this.lastSuccessfulFetchAt = new Date();
        this.lastError = null;
      } catch (err) {
        error = classifyNewsError(err);
        this.lastError = error;
      }
    }

    const data = await query();
    const freshAt = cacheKey === "market" ? this.marketNewsFetchedAt : this.companyNewsFetchedAt.get(cacheKey);

    if (!error) {
      return { data, meta: { source: "finnhub", status: "live", timestamp: (freshAt ?? new Date()).toISOString() } };
    }
    if (freshAt) {
      return { data, meta: { source: "finnhub", status: "cached", timestamp: freshAt.toISOString(), reason: error.message } };
    }
    if (data.length > 0) {
      // We have DB rows from a previous session but no in-memory fetch timestamp (e.g. after a restart).
      return { data, meta: { source: "finnhub", status: "cached", timestamp: new Date(0).toISOString(), reason: error.message } };
    }
    return unavailable("finnhub", error.message);
  }

  async getCompanyNews(symbol: string, limit = 20): Promise<LiveData<NewsItem[]>> {
    const upper = symbol.toUpperCase();
    return this.withFreshness(
      upper,
      this.companyNewsFetchedAt.get(upper) ?? null,
      () => this.refreshCompanyNews(upper),
      async () => {
        const rows = await this.prisma.newsArticle.findMany({
          where: { relatedSymbols: { has: upper }, status: "ACTIVE" },
          orderBy: { publishedAt: "desc" },
          take: limit,
          include: ARTICLE_INCLUDE,
        });
        return rows.map((row) => ({ ...toNewsItem(row), symbol: upper }));
      },
    );
  }

  async getMarketNews(limit = 30): Promise<LiveData<NewsItem[]>> {
    return this.withFreshness(
      "market",
      this.marketNewsFetchedAt,
      () => this.refreshMarketNews(),
      async () => {
        const rows = await this.prisma.newsArticle.findMany({
          where: { status: "ACTIVE" },
          orderBy: { publishedAt: "desc" },
          take: limit,
          include: ARTICLE_INCLUDE,
        });
        return rows.map((row) => toNewsItem(row));
      },
    );
  }

  /** Portfolio-aware: news for any of the given symbols, most recent first. Does not itself know what the user holds — see IbkrPortfolioDataSource for that. */
  async getPortfolioNews(symbols: string[], limit = 50): Promise<LiveData<NewsItem[]>> {
    if (symbols.length === 0) {
      return { data: [], meta: { source: "finnhub", status: "live", timestamp: new Date().toISOString() } };
    }
    const upperSymbols = symbols.map((s) => s.toUpperCase());
    // Ensure each held symbol has been queried at least once this cache window.
    let anyError: NewsError | null = null;
    if (this.configured) {
      for (const symbol of upperSymbols) {
        const fetchedAt = this.companyNewsFetchedAt.get(symbol);
        if (fetchedAt && Date.now() - fetchedAt.getTime() < RECENT_CACHE_TTL_MS) continue;
        try {
          await this.refreshCompanyNews(symbol);
          this.lastSuccessfulFetchAt = new Date();
          this.lastError = null;
        } catch (err) {
          anyError = classifyNewsError(err);
          this.lastError = anyError;
        }
      }
    }

    if (!this.configured) {
      return unavailable("news", "News integration is not connected yet. Set FINNHUB_API_KEY and see docs/NEWS_INTEGRATION.md.");
    }

    const rows = await this.prisma.newsArticle.findMany({
      where: { relatedSymbols: { hasSome: upperSymbols }, status: "ACTIVE" },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: ARTICLE_INCLUDE,
    });

    if (rows.length === 0 && anyError) return unavailable("finnhub", anyError.message);

    const oldestSuccessfulFetch = upperSymbols
      .map((s) => this.companyNewsFetchedAt.get(s))
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return {
      data: rows.map((row) => toNewsItem(row)),
      meta: {
        source: "finnhub",
        status: anyError ? "cached" : "live",
        timestamp: (oldestSuccessfulFetch ?? new Date()).toISOString(),
        reason: anyError?.message,
      },
    };
  }

  /** Counts of medium/high-relevance active articles per symbol — backs the "PORTFOLIO NEWS" summary view (docs/NEWS_INTEGRATION.md §"Portfolio news view"). */
  async getPortfolioNewsSummary(symbols: string[]): Promise<LiveData<Array<{ symbol: string; updateCount: number }>>> {
    const newsResult = await this.getPortfolioNews(symbols, 200);
    if (!newsResult.data) return { data: null, meta: newsResult.meta };

    const counts = new Map<string, number>();
    for (const symbol of symbols.map((s) => s.toUpperCase())) counts.set(symbol, 0);
    for (const item of newsResult.data) {
      if (item.relevance !== "medium" && item.relevance !== "high") continue;
      for (const symbol of item.relatedSymbols) {
        if (counts.has(symbol)) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      }
    }

    return {
      data: [...counts.entries()].map(([symbol, updateCount]) => ({ symbol, updateCount })),
      meta: newsResult.meta,
    };
  }

  async getArticleById(id: string): Promise<NewsItem | null> {
    const row = await this.prisma.newsArticle.findUnique({ where: { id }, include: ARTICLE_INCLUDE });
    return row && row.status === "ACTIVE" ? toNewsItem(row) : null;
  }
}
