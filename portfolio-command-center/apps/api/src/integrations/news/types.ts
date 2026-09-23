/**
 * Raw shapes as returned by Finnhub's news endpoints — see
 * docs/NEWS_INTEGRATION.md §2 for why this provider was chosen and §8 for
 * why exact field names weren't verifiable against live docs from this
 * sandbox (same network-policy constraint as Phase 2/3).
 */
export interface FinnhubNewsArticle {
  id: number;
  category?: string;
  datetime: number; // unix seconds
  headline: string;
  image?: string;
  related?: string; // comma-separated tickers, for company-news this is usually just the queried symbol
  source: string;
  summary?: string;
  url: string;
}

export interface NewsProviderConfig {
  apiKey: string | null;
  baseUrl: string;
}
