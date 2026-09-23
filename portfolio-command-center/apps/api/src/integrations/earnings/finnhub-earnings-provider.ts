import { FinnhubHttpClient, type EarningsHttpClient } from "./client.js";
import { EarningsError } from "./errors.js";
import type { EarningsProvider } from "./earnings-provider.js";
import type { FinnhubEarningsCalendarResponse, FinnhubEarningsEntry } from "./types.js";

export class FinnhubEarningsProvider implements EarningsProvider {
  readonly name = "finnhub";
  private readonly client: EarningsHttpClient | null;

  constructor(apiKey: string | null, injectedClient?: EarningsHttpClient) {
    this.client = injectedClient ?? (apiKey ? new FinnhubHttpClient(apiKey) : null);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async getEarningsCalendar(symbol: string, fromDate: string, toDate: string): Promise<FinnhubEarningsEntry[]> {
    if (!this.client) throw new EarningsError("not_configured");
    const result = await this.client.get<FinnhubEarningsCalendarResponse>("calendar/earnings", { symbol, from: fromDate, to: toDate });
    if (!result || !Array.isArray(result.earningsCalendar)) throw new EarningsError("malformed_response");
    return result.earningsCalendar;
  }
}
