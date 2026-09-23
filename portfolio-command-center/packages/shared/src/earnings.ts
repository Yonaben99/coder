export type EarningsStatus = "estimated" | "confirmed" | "actual";

export interface EarningsEvent {
  id: string;
  symbol: string;
  period: string | null;
  reportDate: string | null;
  /** "bmo" (before market open) / "amc" (after market close) / "dmh" (during market hours), when the provider reports it. */
  announcementTiming: string | null;
  estimatedEps: number | null;
  estimatedRevenue: number | null;
  actualEps: number | null;
  actualRevenue: number | null;
  status: EarningsStatus;
  source: string;
  provider: string;
  retrievedAt: string;
}
