import type { FinnhubPriceTarget, FinnhubRecommendationTrend, FinnhubUpgradeDowngrade } from "./types.js";

export interface NormalizedEstimate {
  provider: string;
  externalId: string;
  averageTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  consensusRating: string | null;
  analystCount: number | null;
  source: string;
  asOf: Date;
}

export interface NormalizedRevision {
  provider: string;
  externalId: string;
  firm: string | null;
  previousValue: string | null;
  newValue: string | null;
  ratingChange: string | null;
  source: string;
  revisedAt: Date;
}

/**
 * Deterministic label derived from Finnhub's recommendation-trend counts —
 * a documented formula, not a prediction of our own. Weighted score:
 * (strongBuy*2 + buy*1 + hold*0 + sell*-1 + strongSell*-2) / totalAnalysts,
 * bucketed into 5 labels. See docs/RISK_AND_CATALYSTS.md §1.
 */
export function deriveConsensusRating(trend: FinnhubRecommendationTrend): string | null {
  const total = trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell;
  if (total === 0) return null;
  const score = (trend.strongBuy * 2 + trend.buy * 1 + trend.hold * 0 + trend.sell * -1 + trend.strongSell * -2) / total;
  if (score > 1) return "Strong Buy";
  if (score > 0.3) return "Buy";
  if (score > -0.3) return "Hold";
  if (score > -1) return "Sell";
  return "Strong Sell";
}

/**
 * Combines the most recent recommendation trend (for the consensus rating
 * and analyst count) with the price-target response (for target figures)
 * into one normalized snapshot. Either input may be missing — the result
 * has null fields rather than being skipped, since a partial snapshot is
 * still real, attributed data.
 */
export function normalizeAnalystEstimate(
  symbol: string,
  latestTrend: FinnhubRecommendationTrend | null,
  target: FinnhubPriceTarget | null,
): NormalizedEstimate {
  const asOf = target?.lastUpdated ? new Date(target.lastUpdated) : latestTrend ? new Date(latestTrend.period) : new Date();
  const totalAnalysts = latestTrend ? latestTrend.strongBuy + latestTrend.buy + latestTrend.hold + latestTrend.sell + latestTrend.strongSell : null;

  return {
    provider: "finnhub",
    externalId: `${symbol}-${latestTrend?.period ?? asOf.toISOString().slice(0, 10)}`,
    averageTarget: target?.targetMean ?? null,
    highTarget: target?.targetHigh ?? null,
    lowTarget: target?.targetLow ?? null,
    consensusRating: latestTrend ? deriveConsensusRating(latestTrend) : null,
    analystCount: totalAnalysts,
    source: "Finnhub consensus",
    asOf,
  };
}

export function normalizeUpgradeDowngrade(symbol: string, raw: FinnhubUpgradeDowngrade): NormalizedRevision {
  return {
    provider: "finnhub",
    externalId: `${symbol}-${raw.company}-${raw.gradeTime}`,
    firm: raw.company || null,
    previousValue: raw.fromGrade || null,
    newValue: raw.toGrade || null,
    ratingChange: raw.action || null,
    source: "Finnhub",
    revisedAt: new Date(raw.gradeTime * 1000),
  };
}
