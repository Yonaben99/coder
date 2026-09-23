/**
 * Raw shape as returned by Finnhub's earnings calendar endpoint — see
 * docs/RISK_AND_CATALYSTS.md §1 for the provider decision and the
 * network-policy caveat on verifying exact field names from this sandbox.
 */
export interface FinnhubEarningsEntry {
  symbol: string;
  date: string; // "YYYY-MM-DD"
  year: number;
  quarter: number;
  /** "bmo" (before market open) / "amc" (after market close) / "dmh" (during market hours), when Finnhub reports it. */
  hour: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export interface FinnhubEarningsCalendarResponse {
  earningsCalendar: FinnhubEarningsEntry[];
}
