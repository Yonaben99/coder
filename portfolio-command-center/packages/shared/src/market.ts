export interface MarketData {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
}

export type NewsCategory =
  | "earnings"
  | "guidance"
  | "merger_acquisition"
  | "regulation"
  | "litigation"
  | "management_change"
  | "product"
  | "capital_allocation"
  | "buyback"
  | "dividend"
  | "financing"
  | "supply_chain"
  | "customer"
  | "partnership"
  | "macro"
  | "analyst_action"
  | "price_movement"
  | "contract"
  | "other";

/** Deterministic information-relevance signal — not an investment recommendation. */
export type NewsRelevance = "low" | "medium" | "high";

export interface NewsItem {
  id: string;
  /** The symbol this item was queried/matched for, when applicable. */
  symbol: string | null;
  /** Every ticker this article mentions or relates to. */
  relatedSymbols: string[];
  headline: string;
  source: string;
  /** Which news API this came from (e.g. "finnhub") — distinct from `source`, the original publisher. */
  provider: string;
  url: string;
  publishedAt: string;
  /** When our system last confirmed this article via the provider — distinct from publishedAt. */
  retrievedAt: string;
  categories: NewsCategory[];
  relevance: NewsRelevance | null;
  summary: string | null;
}

export interface PortfolioNewsSummary {
  symbol: string;
  updateCount: number;
}

export interface AnalystEstimateSummary {
  symbol: string;
  averageTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  consensusRating: string | null;
  analystCount: number | null;
  asOf: string;
}

export interface Catalyst {
  id: string;
  symbol: string | null;
  description: string;
  expectedDate: string | null;
}
