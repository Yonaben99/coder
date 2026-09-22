export interface MarketData {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
}

export interface NewsItem {
  id: string;
  symbol: string | null;
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  importance: number | null;
  summary: string | null;
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
