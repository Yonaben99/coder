import { unavailable, type LiveData, type PortfolioRiskSummary } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";
import type { PortfolioDataSource, RiskDataSource } from "../../domain/data-sources/index.js";
import { computeConcentrationSlices, computeCurrentRiskMetrics } from "./risk-engine.js";
import { computeHistoricalRiskMetrics } from "./historical-risk.js";

/**
 * Orchestrates the deterministic risk engine (risk-engine.ts,
 * historical-risk.ts — pure functions, no I/O of their own) against real
 * portfolio data from the existing PortfolioDataSource. Inherits IBKR's
 * own honesty: if positions/account summary are unavailable, risk metrics
 * are unavailable too — never computed from a fabricated or zeroed
 * portfolio. Implements RiskDataSource directly (no separate "integration"
 * wrapper) since it already has exactly that interface's shape.
 */
export class RiskService implements RiskDataSource {
  constructor(
    private readonly portfolioDataSource: PortfolioDataSource,
    private readonly prisma: PrismaClient,
  ) {}

  async getPortfolioRiskSummary(userId: string): Promise<LiveData<PortfolioRiskSummary>> {
    const [positionsResult, summaryResult] = await Promise.all([
      this.portfolioDataSource.getPositions(userId),
      this.portfolioDataSource.getAccountSummary(userId),
    ]);

    if (!positionsResult.data || !summaryResult.data) {
      return unavailable<PortfolioRiskSummary>("risk-engine", positionsResult.meta.reason ?? summaryResult.meta.reason ?? "Portfolio data unavailable.");
    }

    const asOf = positionsResult.meta.timestamp ?? new Date().toISOString();
    const currentMetrics = computeCurrentRiskMetrics(positionsResult.data, summaryResult.data, asOf);
    const historicalMetrics = await computeHistoricalRiskMetrics(this.prisma, userId);
    const slices = computeConcentrationSlices(positionsResult.data);

    const status = positionsResult.meta.status === "live" && summaryResult.meta.status === "live" ? "live" : "cached";

    return {
      data: {
        metrics: [...currentMetrics, ...historicalMetrics],
        bySector: slices.bySector,
        byCountry: slices.byCountry,
        byAssetType: slices.byAssetType,
        topPositions: slices.topPositions,
        asOf,
      },
      meta: { source: "risk-engine", status, timestamp: asOf, reason: positionsResult.meta.reason ?? summaryResult.meta.reason },
    };
  }
}
