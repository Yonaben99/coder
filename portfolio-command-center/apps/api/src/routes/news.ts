import type { FastifyInstance } from "fastify";
import type { LiveData, NewsCategory, NewsItem } from "@pcc/shared";
import { buildRequireAuth } from "../auth/middleware.js";

const SINCE_WINDOWS = ["hour", "today", "24h", "7d", "latest"] as const;
type SinceWindow = (typeof SINCE_WINDOWS)[number];

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

function parseLimit(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function parseSince(raw: string | undefined): SinceWindow | null {
  return SINCE_WINDOWS.includes(raw as SinceWindow) ? (raw as SinceWindow) : null;
}

function sinceCutoff(window: SinceWindow): Date | null {
  const now = Date.now();
  switch (window) {
    case "hour":
      return new Date(now - 60 * 60 * 1000);
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "latest":
      return null;
  }
}

/** Applies `since`/`category` filters after the fact — the underlying fetch is already normalized and cached, so filtering here doesn't cost another provider call. */
function applyFilters(result: LiveData<NewsItem[]>, since: SinceWindow | null, category: NewsCategory | null): LiveData<NewsItem[]> {
  if (!result.data) return result;
  let data = result.data;
  const cutoff = since ? sinceCutoff(since) : null;
  if (cutoff) data = data.filter((item) => new Date(item.publishedAt) >= cutoff);
  if (category) data = data.filter((item) => item.categories.includes(category));
  return { data, meta: result.meta };
}

interface RecentQuery {
  limit?: string;
  since?: string;
  category?: string;
}

interface SymbolParams {
  symbol: string;
}

interface SymbolQuery {
  limit?: string;
  since?: string;
}

interface ArticleParams {
  id: string;
}

export async function newsRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.get<{ Querystring: RecentQuery }>("/news", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, DEFAULT_LIMIT);
    const since = parseSince(request.query.since);
    const category = (request.query.category as NewsCategory | undefined) ?? null;
    const result = await app.newsDataSource.getRecentNews(limit);
    return applyFilters(result, since, category);
  });

  app.get<{ Querystring: { limit?: string } }>("/news/recent", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, DEFAULT_LIMIT);
    return app.newsDataSource.getRecentNews(limit);
  });

  app.get<{ Querystring: SymbolQuery }>("/news/portfolio", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 50);
    const since = parseSince(request.query.since);
    const result = await app.newsDataSource.getPortfolioNews(request.user!.id, limit);
    return applyFilters(result, since, null);
  });

  app.get("/news/portfolio/summary", { preHandler: requireAuth }, async (request) => {
    return app.newsDataSource.getPortfolioNewsSummary(request.user!.id);
  });

  app.get<{ Params: SymbolParams; Querystring: SymbolQuery }>(
    "/news/symbol/:symbol",
    { preHandler: requireAuth },
    async (request) => {
      const limit = parseLimit(request.query.limit, 20);
      const since = parseSince(request.query.since);
      const result = await app.newsDataSource.getNewsForSymbol(request.params.symbol.toUpperCase(), limit);
      return applyFilters(result, since, null);
    },
  );

  app.get<{ Params: ArticleParams }>("/news/:id", { preHandler: requireAuth }, async (request, reply) => {
    const article = await app.newsDataSource.getArticleById(request.params.id);
    if (!article) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "News article not found." } });
    }
    return { article };
  });
}
