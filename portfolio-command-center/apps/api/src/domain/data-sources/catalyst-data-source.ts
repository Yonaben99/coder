import type { Catalyst, LiveData } from "@pcc/shared";

/**
 * The rest of the application depends only on this interface — never on
 * CatalystService's internal news/earnings/analyst sync logic directly.
 * Unlike the vendor-backed data sources, there is no separate
 * "not connected" implementation: the catalyst engine has no credential of
 * its own, so its honesty comes entirely from the LiveData envelopes its
 * three inputs (NewsDataSource/EarningsDataSource/AnalystDataSource)
 * already return — see docs/RISK_AND_CATALYSTS.md §2.
 */
export interface CatalystDataSource {
  getCatalystsForSymbol(symbol: string, limit?: number): Promise<LiveData<Catalyst[]>>;
  getPortfolioCatalysts(userId: string, limit?: number): Promise<LiveData<Catalyst[]>>;
}
