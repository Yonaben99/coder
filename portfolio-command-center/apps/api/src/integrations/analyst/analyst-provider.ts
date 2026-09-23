import type { FinnhubPriceTarget, FinnhubRecommendationTrend, FinnhubUpgradeDowngrade } from "./types.js";

/**
 * A single analyst-data vendor's API, in its own raw shape. Swapping
 * vendors means writing a new class implementing this interface — nothing
 * above this layer (normalizer, service, routes, AI tools) knows which
 * vendor is behind it. See docs/RISK_AND_CATALYSTS.md §1.
 */
export interface AnalystProvider {
  readonly name: string;
  isConfigured(): boolean;
  getRecommendationTrends(symbol: string): Promise<FinnhubRecommendationTrend[]>;
  getPriceTarget(symbol: string): Promise<FinnhubPriceTarget | null>;
  getUpgradesDowngrades(symbol: string, fromDate: string, toDate: string): Promise<FinnhubUpgradeDowngrade[]>;
}
