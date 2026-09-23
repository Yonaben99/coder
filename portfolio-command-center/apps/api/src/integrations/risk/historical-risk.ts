import type { RiskMetric } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";

const MIN_GAP_MS = 5 * 24 * 60 * 60 * 1000; // "7d change" needs a comparison snapshot at least ~5 days older
const SNAPSHOT_SOURCE = "Computed from PortfolioSnapshot/PositionSnapshot history";

function unavailableMetric(key: "exposure_change_7d" | "concentration_change_7d", label: string, formula: string, snapshotCount: number): RiskMetric {
  return {
    key,
    label,
    value: null,
    unit: null,
    severity: null,
    explanation:
      snapshotCount === 0
        ? "No portfolio snapshot history exists yet — the scheduled refreshPortfolioState job (Phase 6) needs to run at least twice, roughly a week apart, before this metric can be computed."
        : `Only ${snapshotCount} snapshot(s) exist within the last 30 days, none old enough (need one at least ~5 days before the latest) — this metric cannot be computed yet.`,
    formula,
    source: SNAPSHOT_SOURCE,
    asOf: null,
  };
}

/**
 * "Change since ~7 days ago" — never a substituted zero when history is
 * insufficient (Phase 5.7's explicit requirement). Depends on
 * PortfolioSnapshot/PositionSnapshot rows written by the Phase 6
 * refreshPortfolioState scheduled job; before that job has run at least
 * twice, both metrics are honestly unavailable.
 */
export async function computeHistoricalRiskMetrics(prisma: PrismaClient, userId: string): Promise<RiskMetric[]> {
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { userId },
    orderBy: { takenAt: "desc" },
    take: 30,
    include: { positions: true },
  });

  if (snapshots.length === 0) {
    return [
      unavailableMetric("exposure_change_7d", "Gross Exposure Change (~7d)", "gross exposure now - gross exposure ~7 days ago", 0),
      unavailableMetric("concentration_change_7d", "Top-5 Concentration Change (~7d)", "top-5 concentration now - top-5 concentration ~7 days ago", 0),
    ];
  }

  const latest = snapshots[0]!;
  const comparison = snapshots.find((s) => latest.takenAt.getTime() - s.takenAt.getTime() >= MIN_GAP_MS) ?? null;

  if (!comparison) {
    return [
      unavailableMetric("exposure_change_7d", "Gross Exposure Change (~7d)", "gross exposure now - gross exposure ~7 days ago", snapshots.length),
      unavailableMetric("concentration_change_7d", "Top-5 Concentration Change (~7d)", "top-5 concentration now - top-5 concentration ~7 days ago", snapshots.length),
    ];
  }

  const grossExposureAt = (snapshot: typeof latest): number | null => {
    if (!snapshot.netLiquidation || Number(snapshot.netLiquidation) === 0) return null;
    const gross = snapshot.positions.reduce((sum, p) => sum + Math.abs(Number(p.marketValue ?? 0)), 0);
    return (gross / Number(snapshot.netLiquidation)) * 100;
  };

  const top5ConcentrationAt = (snapshot: typeof latest): number | null => {
    const weighted = snapshot.positions.filter((p) => p.weight !== null).map((p) => Number(p.weight));
    if (weighted.length === 0) return null;
    return weighted
      .sort((a, b) => b - a)
      .slice(0, 5)
      .reduce((sum, w) => sum + w, 0);
  };

  const latestGross = grossExposureAt(latest);
  const comparisonGross = grossExposureAt(comparison);
  const latestTop5 = top5ConcentrationAt(latest);
  const comparisonTop5 = top5ConcentrationAt(comparison);

  const daysApart = Math.round((latest.takenAt.getTime() - comparison.takenAt.getTime()) / (24 * 60 * 60 * 1000));

  const exposureChange: RiskMetric =
    latestGross !== null && comparisonGross !== null
      ? {
          key: "exposure_change_7d",
          label: "Gross Exposure Change (~7d)",
          value: latestGross - comparisonGross,
          unit: "percent",
          severity: Math.abs(latestGross - comparisonGross) >= 20 ? "high" : Math.abs(latestGross - comparisonGross) >= 10 ? "medium" : "low",
          explanation: `Gross exposure moved from ${comparisonGross.toFixed(1)}% to ${latestGross.toFixed(1)}% of net liquidation over the last ${daysApart} day(s).`,
          formula: "gross exposure now - gross exposure at the comparison snapshot",
          source: SNAPSHOT_SOURCE,
          asOf: latest.takenAt.toISOString(),
        }
      : unavailableMetric("exposure_change_7d", "Gross Exposure Change (~7d)", "gross exposure now - gross exposure ~7 days ago", snapshots.length);

  const concentrationChange: RiskMetric =
    latestTop5 !== null && comparisonTop5 !== null
      ? {
          key: "concentration_change_7d",
          label: "Top-5 Concentration Change (~7d)",
          value: latestTop5 - comparisonTop5,
          unit: "percent",
          severity: Math.abs(latestTop5 - comparisonTop5) >= 15 ? "high" : Math.abs(latestTop5 - comparisonTop5) >= 7 ? "medium" : "low",
          explanation: `Top-5 position concentration moved from ${comparisonTop5.toFixed(1)}% to ${latestTop5.toFixed(1)}% over the last ${daysApart} day(s).`,
          formula: "top-5 concentration now - top-5 concentration at the comparison snapshot",
          source: SNAPSHOT_SOURCE,
          asOf: latest.takenAt.toISOString(),
        }
      : unavailableMetric("concentration_change_7d", "Top-5 Concentration Change (~7d)", "top-5 concentration now - top-5 concentration ~7 days ago", snapshots.length);

  return [exposureChange, concentrationChange];
}
