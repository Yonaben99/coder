import type { EarningsStatus as SharedEarningsStatus } from "@pcc/shared";
import type { FinnhubEarningsEntry } from "./types.js";

export interface NormalizedEarnings {
  provider: string;
  externalId: string;
  period: string | null;
  reportDate: Date | null;
  announcementTiming: string | null;
  estimatedEps: number | null;
  estimatedRevenue: number | null;
  actualEps: number | null;
  actualRevenue: number | null;
  status: "ESTIMATED" | "ACTUAL"; // Finnhub gives a concrete date for every entry but no explicit "confirmed" flag — see docs/RISK_AND_CATALYSTS.md §1.
  source: string;
}

export function normalizeFinnhubEarnings(raw: FinnhubEarningsEntry): NormalizedEarnings {
  const hasActuals = raw.epsActual !== null || raw.revenueActual !== null;
  return {
    provider: "finnhub",
    externalId: `${raw.symbol}-${raw.year}-Q${raw.quarter}`,
    period: raw.quarter && raw.year ? `Q${raw.quarter} ${raw.year}` : null,
    reportDate: raw.date ? new Date(raw.date) : null,
    announcementTiming: raw.hour,
    estimatedEps: raw.epsEstimate,
    estimatedRevenue: raw.revenueEstimate,
    actualEps: raw.epsActual,
    actualRevenue: raw.revenueActual,
    status: hasActuals ? "ACTUAL" : "ESTIMATED",
    source: "Finnhub",
  };
}

export function toSharedEarningsStatus(status: "ESTIMATED" | "CONFIRMED" | "ACTUAL"): SharedEarningsStatus {
  return status.toLowerCase() as SharedEarningsStatus;
}
