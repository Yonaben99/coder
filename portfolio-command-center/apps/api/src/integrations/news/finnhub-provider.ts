import { FinnhubHttpClient, type NewsHttpClient } from "./client.js";
import { NewsError } from "./errors.js";
import type { NewsProvider } from "./news-provider.js";
import type { FinnhubNewsArticle } from "./types.js";

export class FinnhubNewsProvider implements NewsProvider {
  readonly name = "finnhub";
  private readonly client: NewsHttpClient | null;

  /** `injectedClient` lets tests substitute a fake NewsHttpClient — same pattern as IbkrConnectionManager. */
  constructor(apiKey: string | null, injectedClient?: NewsHttpClient) {
    this.client = injectedClient ?? (apiKey ? new FinnhubHttpClient(apiKey) : null);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async getCompanyNews(symbol: string, fromDate: string, toDate: string): Promise<FinnhubNewsArticle[]> {
    if (!this.client) throw new NewsError("not_configured");
    const result = await this.client.get<FinnhubNewsArticle[]>("company-news", { symbol, from: fromDate, to: toDate });
    if (!Array.isArray(result)) throw new NewsError("malformed_response");
    return result;
  }

  async getMarketNews(): Promise<FinnhubNewsArticle[]> {
    if (!this.client) throw new NewsError("not_configured");
    const result = await this.client.get<FinnhubNewsArticle[]>("news", { category: "general" });
    if (!Array.isArray(result)) throw new NewsError("malformed_response");
    return result;
  }
}
