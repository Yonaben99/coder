import type { FinnhubEarningsEntry } from "./types.js";

/**
 * A single earnings-calendar vendor's API, in its own raw shape. Swapping
 * vendors means writing a new class implementing this interface — see
 * docs/RISK_AND_CATALYSTS.md §1.
 */
export interface EarningsProvider {
  readonly name: string;
  isConfigured(): boolean;
  getEarningsCalendar(symbol: string, fromDate: string, toDate: string): Promise<FinnhubEarningsEntry[]>;
}
