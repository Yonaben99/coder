import { FinnhubHttpClient, type AnalystHttpClient } from "./client.js";
import { AnalystError } from "./errors.js";
import type { AnalystProvider } from "./analyst-provider.js";
import type { FinnhubPriceTarget, FinnhubRecommendationTrend, FinnhubUpgradeDowngrade } from "./types.js";

export class FinnhubAnalystProvider implements AnalystProvider {
  readonly name = "finnhub";
  private readonly client: AnalystHttpClient | null;

  /** `injectedClient` lets tests substitute a fake AnalystHttpClient — same pattern as FinnhubNewsProvider. */
  constructor(apiKey: string | null, injectedClient?: AnalystHttpClient) {
    this.client = injectedClient ?? (apiKey ? new FinnhubHttpClient(apiKey) : null);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async getRecommendationTrends(symbol: string): Promise<FinnhubRecommendationTrend[]> {
    if (!this.client) throw new AnalystError("not_configured");
    const result = await this.client.get<FinnhubRecommendationTrend[]>("stock/recommendation", { symbol });
    if (!Array.isArray(result)) throw new AnalystError("malformed_response");
    return result;
  }

  async getPriceTarget(symbol: string): Promise<FinnhubPriceTarget | null> {
    if (!this.client) throw new AnalystError("not_configured");
    const result = await this.client.get<FinnhubPriceTarget | Record<string, never>>("stock/price-target", { symbol });
    if (typeof result !== "object" || result === null) throw new AnalystError("malformed_response");
    if (!("symbol" in result)) return null; // Finnhub returns {} when no price target exists for this symbol.
    return result as FinnhubPriceTarget;
  }

  async getUpgradesDowngrades(symbol: string, fromDate: string, toDate: string): Promise<FinnhubUpgradeDowngrade[]> {
    if (!this.client) throw new AnalystError("not_configured");
    const result = await this.client.get<FinnhubUpgradeDowngrade[]>("stock/upgrade-downgrade", { symbol, from: fromDate, to: toDate });
    if (!Array.isArray(result)) throw new AnalystError("malformed_response");
    return result;
  }
}
