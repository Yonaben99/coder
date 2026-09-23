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

/** Analyst-derived data — labeled as such, never presented as this application's own prediction. */
export interface AnalystEstimateSummary {
  symbol: string;
  averageTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  consensusRating: string | null;
  analystCount: number | null;
  source: string;
  provider: string;
  asOf: string;
  retrievedAt: string;
}

/** A single rating/target change from one analyst firm — analyst-derived, not our own conclusion. */
export interface AnalystRevisionItem {
  id: string;
  symbol: string;
  firm: string | null;
  previousValue: string | null;
  newValue: string | null;
  ratingChange: string | null;
  source: string;
  provider: string;
  revisedAt: string;
  retrievedAt: string;
}

export type CatalystType =
  | "earnings"
  | "guidance"
  | "product_launch"
  | "major_contract"
  | "regulatory_event"
  | "merger_acquisition"
  | "investor_day"
  | "capital_allocation"
  | "legal_regulatory_decision"
  | "analyst_revision"
  | "other";

export type CatalystStatus = "upcoming" | "completed";

/** An event, not a prediction — see docs/RISK_AND_CATALYSTS.md §2. */
export interface Catalyst {
  id: string;
  symbol: string | null;
  type: CatalystType;
  title: string;
  description: string;
  expectedDate: string | null;
  /** Whether expectedDate is company-confirmed vs. an estimate/inference. */
  dateConfirmed: boolean;
  status: CatalystStatus;
  relevance: NewsRelevance | null;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
  retrievedAt: string;
}
