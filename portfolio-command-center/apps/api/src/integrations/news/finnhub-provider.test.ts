import { describe, expect, it } from "vitest";
import { FinnhubNewsProvider } from "./finnhub-provider.js";
import { NewsError } from "./errors.js";
import type { NewsHttpClient } from "./client.js";
import type { FinnhubNewsArticle } from "./types.js";
import companyNewsFixture from "./__fixtures__/finnhub-company-news.json" with { type: "json" };
import marketNewsFixture from "./__fixtures__/finnhub-market-news.json" with { type: "json" };

class FakeHttpClient implements NewsHttpClient {
  lastPath: string | null = null;
  lastQuery: Record<string, string> | null = null;
  response: unknown = [];

  async get<T>(path: string, query: Record<string, string>): Promise<T> {
    this.lastPath = path;
    this.lastQuery = query;
    return this.response as T;
  }
}

describe("FinnhubNewsProvider — not configured", () => {
  it("reports not configured without constructing an HTTP client", () => {
    const provider = new FinnhubNewsProvider(null);
    expect(provider.isConfigured()).toBe(false);
  });

  it("throws NewsError(not_configured) rather than making a request", async () => {
    const provider = new FinnhubNewsProvider(null);
    await expect(provider.getCompanyNews("WDC", "2026-01-01", "2026-01-08")).rejects.toMatchObject({ code: "not_configured" });
    await expect(provider.getMarketNews()).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("FinnhubNewsProvider — configured", () => {
  it("calls company-news with symbol/from/to and returns the raw fixture array untouched", async () => {
    const client = new FakeHttpClient();
    client.response = companyNewsFixture as FinnhubNewsArticle[];
    const provider = new FinnhubNewsProvider("test-key", client);

    const result = await provider.getCompanyNews("WDC", "2026-01-01", "2026-01-08");

    expect(client.lastPath).toBe("company-news");
    expect(client.lastQuery).toEqual({ symbol: "WDC", from: "2026-01-01", to: "2026-01-08" });
    expect(result).toEqual(companyNewsFixture);
  });

  it("calls news?category=general for market news", async () => {
    const client = new FakeHttpClient();
    client.response = marketNewsFixture as FinnhubNewsArticle[];
    const provider = new FinnhubNewsProvider("test-key", client);

    const result = await provider.getMarketNews();

    expect(client.lastPath).toBe("news");
    expect(client.lastQuery).toEqual({ category: "general" });
    expect(result).toEqual(marketNewsFixture);
  });

  it("throws NewsError(malformed_response) when the provider returns something that isn't an array", async () => {
    const client = new FakeHttpClient();
    client.response = { unexpected: "shape" };
    const provider = new FinnhubNewsProvider("test-key", client);

    await expect(provider.getCompanyNews("WDC", "2026-01-01", "2026-01-08")).rejects.toBeInstanceOf(NewsError);
    await expect(provider.getCompanyNews("WDC", "2026-01-01", "2026-01-08")).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("propagates a classified error thrown by the HTTP client", async () => {
    const client: NewsHttpClient = {
      get: async () => {
        throw new NewsError("rate_limited");
      },
    };
    const provider = new FinnhubNewsProvider("test-key", client);
    await expect(provider.getMarketNews()).rejects.toMatchObject({ code: "rate_limited" });
  });
});
