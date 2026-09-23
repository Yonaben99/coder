/**
 * Raw shapes as returned by Finnhub's analyst endpoints — see
 * docs/RISK_AND_CATALYSTS.md §1 for why this provider was chosen (reusing
 * the Phase 4 news integration's vendor and API key) and for why exact
 * field names weren't verifiable against live docs from this sandbox (same
 * network-policy constraint as Phase 2/3/4).
 */
export interface FinnhubRecommendationTrend {
  symbol: string;
  period: string; // "YYYY-MM-DD", first of the month the trend covers
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface FinnhubPriceTarget {
  symbol: string;
  targetHigh: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  lastUpdated: string; // ISO date string
}

export interface FinnhubUpgradeDowngrade {
  symbol: string;
  company: string; // analyst firm
  gradeTime: number; // unix seconds
  fromGrade: string;
  toGrade: string;
  action: "up" | "down" | "main" | "init" | "reit" | string;
}

export interface AnalystProviderConfig {
  apiKey: string | null;
  baseUrl: string;
}
