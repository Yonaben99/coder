import type { FinnhubNewsArticle } from "./types.js";

/**
 * A single news vendor's API, in its own raw shape. Swapping vendors means
 * writing a new class implementing this interface — nothing above this
 * layer (normalizer, service, routes, AI tools) knows which vendor is
 * behind it. See docs/NEWS_INTEGRATION.md §2/§4.
 */
export interface NewsProvider {
  readonly name: string;
  isConfigured(): boolean;
  getCompanyNews(symbol: string, fromDate: string, toDate: string): Promise<FinnhubNewsArticle[]>;
  getMarketNews(): Promise<FinnhubNewsArticle[]>;
}
