import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@pcc/db";
import { NewsError } from "./errors.js";
import { NewsService } from "./news-service.js";
import type { NewsProvider } from "./news-provider.js";
import type { FinnhubNewsArticle } from "./types.js";

/**
 * Fixture-based only — no real Finnhub credentials or network calls. This
 * fake stands in for the whole NewsProvider so NewsService's own
 * caching/ingestion/dedup logic can be exercised deterministically against
 * the real (local) Postgres instance, exactly like IbkrConnectionManager's
 * tests use a RoutedFakeClient instead of a live gateway.
 */
class FakeNewsProvider implements NewsProvider {
  readonly name = "finnhub";
  private _configured = true;
  companyArticles = new Map<string, FinnhubNewsArticle[]>();
  marketArticles: FinnhubNewsArticle[] = [];
  shouldFail = false;
  calls = 0;

  set configured(value: boolean) {
    this._configured = value;
  }

  isConfigured(): boolean {
    return this._configured;
  }

  async getCompanyNews(symbol: string): Promise<FinnhubNewsArticle[]> {
    this.calls++;
    if (this.shouldFail) throw new NewsError("unavailable");
    return this.companyArticles.get(symbol) ?? [];
  }

  async getMarketNews(): Promise<FinnhubNewsArticle[]> {
    this.calls++;
    if (this.shouldFail) throw new NewsError("unavailable");
    return this.marketArticles;
  }
}

// Every article id created by this test file is offset from a per-run base
// (well outside Finnhub's real id range) and recorded here, so cleanup can
// delete exactly the rows this file created without truncating the table
// or risking a collision with another test file/run.
const BASE_ID = Date.now() * 1000;
const usedExternalIds: string[] = [];

// Every test uses its own synthetic symbol rather than sharing "WDC" —
// dedup candidate lookups match on shared relatedSymbols, so without this,
// one test's article would show up as a duplicate (or extra row) in
// another test's query against the same live Postgres instance.
const RUN = BASE_ID.toString(36).toUpperCase();
const sym = (n: number): string => `T${RUN}${n}`;

function makeArticle(overrides: Partial<FinnhubNewsArticle> & { id: number }): FinnhubNewsArticle {
  const id = BASE_ID + overrides.id;
  usedExternalIds.push(String(id));
  return {
    category: "company",
    datetime: Math.floor(Date.now() / 1000),
    headline: "Test headline",
    related: "",
    source: "Test Source",
    summary: "Test summary.",
    url: `https://example.com/article-${id}`,
    ...overrides,
    id,
  };
}

afterAll(async () => {
  if (usedExternalIds.length > 0) {
    await prisma.newsArticle.deleteMany({ where: { provider: "finnhub", externalId: { in: usedExternalIds } } });
  }
});

describe("NewsService — not configured", () => {
  it("reports unavailable without ever calling the provider", async () => {
    const provider = new FakeNewsProvider();
    provider.configured = false;
    const service = new NewsService(provider, prisma);

    const result = await service.getMarketNews();
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
    expect(provider.calls).toBe(0);
  });
});

describe("NewsService — configured, live fetch and ingestion", () => {
  let provider: FakeNewsProvider;
  let service: NewsService;

  beforeEach(() => {
    provider = new FakeNewsProvider();
    service = new NewsService(provider, prisma);
  });

  it("ingests articles, applies deterministic categorization/relevance, and reports live", async () => {
    const symbol = sym(1);
    provider.companyArticles.set(symbol, [
      makeArticle({ id: 1, headline: "Western Digital reports quarterly earnings beat, raises guidance", related: symbol }),
    ]);

    const result = await service.getCompanyNews(symbol);

    expect(result.meta.status).toBe("live");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.categories).toContain("earnings");
    expect(result.data?.[0]?.relevance).toBe("high");
    expect(result.data?.[0]?.symbol).toBe(symbol);
  });

  it("serves from cache within the TTL without re-fetching", async () => {
    const symbol = sym(2);
    provider.companyArticles.set(symbol, [makeArticle({ id: 2, related: symbol })]);
    await service.getCompanyNews(symbol);
    const callsAfterFirst = provider.calls;

    await service.getCompanyNews(symbol);
    expect(provider.calls).toBe(callsAfterFirst);
  });

  it("falls back to cached data (not unavailable) when a refresh fails after the TTL expires", async () => {
    const symbol = sym(3);
    vi.useFakeTimers();
    try {
      provider.companyArticles.set(symbol, [makeArticle({ id: 3, related: symbol })]);
      const first = await service.getCompanyNews(symbol);
      expect(first.meta.status).toBe("live");

      vi.advanceTimersByTime(11 * 60 * 1000); // past the 10-minute cache TTL
      provider.shouldFail = true;

      const second = await service.getCompanyNews(symbol);
      expect(second.meta.status).toBe("cached");
      expect(second.meta.reason).toBeTruthy();
      expect(second.data).toHaveLength(1); // last known good, not fabricated
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-fetching the same externalId past the TTL upserts the same row instead of creating a duplicate", async () => {
    const symbol = sym(4);
    provider.companyArticles.set(symbol, [makeArticle({ id: 4, related: symbol })]);
    vi.useFakeTimers();
    try {
      await service.getCompanyNews(symbol);
      vi.advanceTimersByTime(11 * 60 * 1000); // force a second refresh past the TTL
      const result = await service.getCompanyNews(symbol);
      expect(result.data).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a near-identical cross-provider-call article as a duplicate, keeping both rows but surfacing only the original", async () => {
    const symbol = sym(5);
    const publishedAt = Math.floor(Date.now() / 1000);
    const companyId = BASE_ID + 5;
    const marketId = BASE_ID + 6;
    provider.companyArticles.set(symbol, [
      makeArticle({ id: 5, headline: "Western Digital reports quarterly earnings beat, raises guidance", related: symbol, datetime: publishedAt }),
    ]);
    provider.marketArticles = [
      makeArticle({
        id: 6,
        headline: "Western Digital reports quarterly earnings beat and raises guidance",
        related: symbol,
        datetime: publishedAt + 60,
      }),
    ];

    await service.getCompanyNews(symbol);
    await service.getMarketNews();

    const rows = await prisma.newsArticle.findMany({
      where: { provider: "finnhub", externalId: { in: [String(companyId), String(marketId)] } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "DUPLICATE")).toHaveLength(1);

    const companyResult = await service.getCompanyNews(symbol);
    expect(companyResult.data).toHaveLength(1); // the duplicate is hidden from query results
  });

  it("getPortfolioNewsSummary counts only medium/high relevance articles per symbol", async () => {
    const symbolA = sym(7);
    const symbolB = sym(8);
    provider.companyArticles.set(symbolA, [
      makeArticle({ id: 7, headline: "Western Digital reports quarterly earnings beat", related: symbolA }),
      makeArticle({ id: 8, headline: "Western Digital opens new office", related: symbolA }), // "other"/low
    ]);
    provider.companyArticles.set(symbolB, [
      makeArticle({ id: 9, headline: "Celestica announces share buyback program", related: symbolB }),
    ]);

    const summary = await service.getPortfolioNewsSummary([symbolA, symbolB]);
    expect(summary.data).toEqual(
      expect.arrayContaining([
        { symbol: symbolA, updateCount: 1 },
        { symbol: symbolB, updateCount: 1 },
      ]),
    );
  });

  it("getArticleById returns the article for a real id and null for an unknown one", async () => {
    const symbol = sym(10);
    provider.companyArticles.set(symbol, [makeArticle({ id: 10, related: symbol })]);
    await service.getCompanyNews(symbol);
    const rows = await prisma.newsArticle.findMany({ where: { provider: "finnhub", externalId: String(BASE_ID + 10) } });
    const created = rows[0]!;

    const found = await service.getArticleById(created.id);
    expect(found?.id).toBe(created.id);

    const missing = await service.getArticleById("not-a-real-id");
    expect(missing).toBeNull();
  });
});
