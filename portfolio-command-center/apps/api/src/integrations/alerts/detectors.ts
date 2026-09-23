import type { AlertServices, Detector, RaiseAlert } from "./types.js";

/** Fallback thresholds used when a user hasn't set one on their AlertRule — conservative, per docs/ALERTS_AND_MONITORING.md §3. */
const DEFAULT_THRESHOLDS = {
  priceMovementPercent: 5,
  pnlChangePercent: 3,
  earningsApproachingDays: 3,
  concentrationChangePercent: 10,
  exposureChangePercent: 10,
  marginUtilizationPercent: 50,
  staleDataMinutes: 60,
};

const NEWS_WINDOW_MS = 24 * 60 * 60 * 1000;
const EARNINGS_RELEASED_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

function num(rule: { threshold: unknown } | null, fallback: number): number {
  if (!rule?.threshold) return fallback;
  return Number(rule.threshold);
}

export const detectPriceMovement: Detector = async (userId, rule, services, raise) => {
  const positions = await services.portfolioDataSource.getPositions(userId);
  if (!positions.data) return;
  const threshold = num(rule, DEFAULT_THRESHOLDS.priceMovementPercent);

  for (const position of positions.data) {
    if (rule?.symbol && rule.symbol.toUpperCase() !== position.symbol.toUpperCase()) continue;
    const change = position.dailyChangePercent;
    if (change === null || Math.abs(change) < threshold) continue;
    await raise({
      category: "PRICE_MOVEMENT",
      symbol: position.symbol,
      severity: Math.abs(change) >= threshold * 2 ? "CRITICAL" : "WARNING",
      title: `${position.symbol} moved ${change >= 0 ? "+" : ""}${change.toFixed(1)}% today`,
      explanation: `${position.symbol}'s daily change (${change.toFixed(1)}%) exceeds the ${threshold}% threshold.`,
      condition: { threshold, actualValue: change },
      dedupeKey: `PRICE_MOVEMENT:${position.symbol}`,
      cooldownMinutes: rule?.cooldownMinutes ?? 60,
    });
  }
};

export const detectPnlChange: Detector = async (userId, rule, services, raise) => {
  const [summary] = await Promise.all([services.portfolioDataSource.getAccountSummary(userId)]);
  if (!summary.data || summary.data.netLiquidation === null || summary.data.dailyPnl === null) return;
  const threshold = num(rule, DEFAULT_THRESHOLDS.pnlChangePercent);
  const percent = (summary.data.dailyPnl / summary.data.netLiquidation) * 100;
  if (Math.abs(percent) < threshold) return;

  await raise({
    category: "PNL_CHANGE",
    symbol: null,
    severity: Math.abs(percent) >= threshold * 2 ? "CRITICAL" : "WARNING",
    title: `Portfolio P&L moved ${percent >= 0 ? "+" : ""}${percent.toFixed(1)}% today`,
    explanation: `Daily P&L (${percent.toFixed(1)}% of net liquidation) exceeds the ${threshold}% threshold.`,
    condition: { threshold, actualValue: percent },
    dedupeKey: "PNL_CHANGE:portfolio",
    cooldownMinutes: rule?.cooldownMinutes ?? 60,
  });
};

export const detectHighRelevanceNews: Detector = async (userId, rule, services, raise) => {
  const result = await services.newsDataSource.getMaterialPortfolioUpdates(userId);
  if (!result.data) return;
  const now = Date.now();

  for (const item of result.data) {
    if (now - new Date(item.publishedAt).getTime() > NEWS_WINDOW_MS) continue;
    await raise({
      category: "HIGH_RELEVANCE_NEWS",
      symbol: item.symbol ?? item.relatedSymbols[0] ?? null,
      severity: item.relevance === "high" ? "WARNING" : "INFO",
      title: item.headline,
      explanation: `${item.relevance ?? "medium"}-relevance news for ${item.relatedSymbols.join(", ") || "your portfolio"}: ${item.headline}`,
      sourceUrl: item.url,
      condition: { articleId: item.id, relevance: item.relevance },
      dedupeKey: `HIGH_RELEVANCE_NEWS:${item.id}`,
      cooldownMinutes: rule?.cooldownMinutes ?? 1440,
    });
  }
};

export const detectEarningsApproaching: Detector = async (userId, rule, services, raise) => {
  const result = await services.earningsDataSource.getUpcomingPortfolioEarnings(userId);
  if (!result.data) return;
  const days = num(rule, DEFAULT_THRESHOLDS.earningsApproachingDays);
  const now = Date.now();

  for (const event of result.data) {
    if (!event.reportDate || event.status === "actual") continue;
    const daysUntil = (new Date(event.reportDate).getTime() - now) / (24 * 60 * 60 * 1000);
    if (daysUntil < 0 || daysUntil > days) continue;
    await raise({
      category: "EARNINGS_APPROACHING",
      symbol: event.symbol,
      severity: "INFO",
      title: `${event.symbol} reports earnings in ${Math.max(0, Math.round(daysUntil))} day(s)`,
      explanation: `${event.symbol}'s ${event.period ?? "upcoming"} earnings are expected ${new Date(event.reportDate).toLocaleDateString()}.`,
      condition: { earningsId: event.id, reportDate: event.reportDate },
      dedupeKey: `EARNINGS_APPROACHING:${event.id}`,
      cooldownMinutes: rule?.cooldownMinutes ?? 1440,
    });
  }
};

export const detectEarningsReleased: Detector = async (userId, rule, services, raise) => {
  const result = await services.earningsDataSource.getUpcomingPortfolioEarnings(userId, 100);
  if (!result.data) return;
  const now = Date.now();

  for (const event of result.data) {
    if (event.status !== "actual" || !event.reportDate) continue;
    if (now - new Date(event.reportDate).getTime() > EARNINGS_RELEASED_WINDOW_MS) continue;
    await raise({
      category: "EARNINGS_RELEASED",
      symbol: event.symbol,
      severity: "INFO",
      title: `${event.symbol} reported earnings`,
      explanation: `${event.symbol} reported ${event.period ?? ""} results: EPS ${event.actualEps ?? "—"} vs. estimate ${event.estimatedEps ?? "—"}.`,
      condition: { earningsId: event.id, actualEps: event.actualEps, estimatedEps: event.estimatedEps },
      dedupeKey: `EARNINGS_RELEASED:${event.id}`,
      cooldownMinutes: rule?.cooldownMinutes ?? 1440,
    });
  }
};

async function heldSymbols(userId: string, services: AlertServices): Promise<string[]> {
  const positions = await services.portfolioDataSource.getPositions(userId);
  return [...new Set((positions.data ?? []).map((p) => p.symbol.toUpperCase()))];
}

export const detectAnalystTargetRevision: Detector = async (userId, rule, services, raise) => {
  const now = Date.now();
  for (const symbol of await heldSymbols(userId, services)) {
    const result = await services.analystDataSource.getAnalystRevisions(symbol, 5);
    if (!result.data) continue;
    for (const rev of result.data) {
      if (now - new Date(rev.revisedAt).getTime() > NEWS_WINDOW_MS) continue;
      await raise({
        category: "ANALYST_TARGET_REVISION",
        symbol,
        severity: "INFO",
        title: `${rev.firm ?? "An analyst"} revised ${symbol}: ${rev.previousValue ?? "?"} → ${rev.newValue ?? "?"}`,
        explanation: `${rev.firm ?? "An analyst"} changed their rating on ${symbol} from ${rev.previousValue ?? "?"} to ${rev.newValue ?? "?"}.`,
        condition: { revisionId: rev.id, previousValue: rev.previousValue, newValue: rev.newValue },
        dedupeKey: `ANALYST_TARGET_REVISION:${rev.id}`,
        cooldownMinutes: rule?.cooldownMinutes ?? 1440,
      });
    }
  }
};

export const detectAnalystRatingChange: Detector = async (userId, rule, services, raise) => {
  const now = Date.now();
  for (const symbol of await heldSymbols(userId, services)) {
    const result = await services.analystDataSource.getAnalystRevisions(symbol, 5);
    if (!result.data) continue;
    for (const rev of result.data) {
      if (rev.ratingChange !== "up" && rev.ratingChange !== "down") continue;
      if (now - new Date(rev.revisedAt).getTime() > NEWS_WINDOW_MS) continue;
      await raise({
        category: "ANALYST_RATING_CHANGE",
        symbol,
        severity: rev.ratingChange === "down" ? "WARNING" : "INFO",
        title: `${symbol} ${rev.ratingChange === "up" ? "upgraded" : "downgraded"} by ${rev.firm ?? "an analyst"}`,
        explanation: `${rev.firm ?? "An analyst"} ${rev.ratingChange === "up" ? "upgraded" : "downgraded"} ${symbol}.`,
        condition: { revisionId: rev.id, action: rev.ratingChange },
        dedupeKey: `ANALYST_RATING_CHANGE:${rev.id}`,
        cooldownMinutes: rule?.cooldownMinutes ?? 1440,
      });
    }
  }
};

export const detectMajorCatalyst: Detector = async (userId, rule, services, raise) => {
  const result = await services.catalystDataSource.getPortfolioCatalysts(userId, 50);
  if (!result.data) return;

  for (const catalyst of result.data) {
    if (catalyst.relevance !== "high") continue;
    await raise({
      category: "MAJOR_CATALYST",
      symbol: catalyst.symbol,
      severity: "INFO",
      title: catalyst.title,
      explanation: catalyst.description,
      sourceUrl: catalyst.url,
      condition: { catalystId: catalyst.id, type: catalyst.type, expectedDate: catalyst.expectedDate },
      dedupeKey: `MAJOR_CATALYST:${catalyst.id}`,
      cooldownMinutes: rule?.cooldownMinutes ?? 1440,
    });
  }
};

export const detectConcentrationChange: Detector = async (userId, rule, services, raise) => {
  const result = await services.riskDataSource.getPortfolioRiskSummary(userId);
  const metric = result.data?.metrics.find((m) => m.key === "concentration_change_7d");
  if (!metric || metric.value === null) return; // insufficient snapshot history — silently skip, never fabricate
  const threshold = num(rule, DEFAULT_THRESHOLDS.concentrationChangePercent);
  if (Math.abs(metric.value) < threshold) return;

  await raise({
    category: "CONCENTRATION_CHANGE",
    symbol: null,
    severity: "WARNING",
    title: `Portfolio concentration changed ${metric.value >= 0 ? "+" : ""}${metric.value.toFixed(1)}pp`,
    explanation: metric.explanation,
    condition: { threshold, actualValue: metric.value },
    dedupeKey: "CONCENTRATION_CHANGE:portfolio",
    cooldownMinutes: rule?.cooldownMinutes ?? 1440,
  });
};

export const detectExposureChange: Detector = async (userId, rule, services, raise) => {
  const result = await services.riskDataSource.getPortfolioRiskSummary(userId);
  const metric = result.data?.metrics.find((m) => m.key === "exposure_change_7d");
  if (!metric || metric.value === null) return;
  const threshold = num(rule, DEFAULT_THRESHOLDS.exposureChangePercent);
  if (Math.abs(metric.value) < threshold) return;

  await raise({
    category: "EXPOSURE_CHANGE",
    symbol: null,
    severity: "WARNING",
    title: `Portfolio gross exposure changed ${metric.value >= 0 ? "+" : ""}${metric.value.toFixed(1)}pp`,
    explanation: metric.explanation,
    condition: { threshold, actualValue: metric.value },
    dedupeKey: "EXPOSURE_CHANGE:portfolio",
    cooldownMinutes: rule?.cooldownMinutes ?? 1440,
  });
};

export const detectMarginLiquidityThreshold: Detector = async (userId, rule, services, raise) => {
  const result = await services.riskDataSource.getPortfolioRiskSummary(userId);
  const metric = result.data?.metrics.find((m) => m.key === "margin_utilization");
  if (!metric || metric.value === null) return;
  const threshold = num(rule, DEFAULT_THRESHOLDS.marginUtilizationPercent);
  if (metric.value < threshold) return;

  await raise({
    category: "MARGIN_LIQUIDITY_THRESHOLD",
    symbol: null,
    severity: metric.value >= threshold * 1.5 ? "CRITICAL" : "WARNING",
    title: `Margin utilization at ${metric.value.toFixed(1)}%`,
    explanation: metric.explanation,
    condition: { threshold, actualValue: metric.value },
    dedupeKey: "MARGIN_LIQUIDITY_THRESHOLD:portfolio",
    cooldownMinutes: rule?.cooldownMinutes ?? 60,
  });
};

export const detectIbkrConnectionStatus: Detector = async (userId, rule, services, raise) => {
  const state = services.ibkr.getSessionState();
  if (!state.configured || !state.gatewayReachable) return; // covered by detectDataConnectionFailure
  if (state.authenticated) return;

  await raise({
    category: "IBKR_CONNECTION_STATUS",
    symbol: null,
    severity: "WARNING",
    title: "IBKR session needs re-authentication",
    explanation: state.lastSuccessfulAuthAt
      ? "The IBKR brokerage session expired — log in again at the gateway's URL."
      : "The IBKR gateway is running but not authenticated yet.",
    condition: { authenticated: state.authenticated },
    dedupeKey: "IBKR_CONNECTION_STATUS:portfolio",
    cooldownMinutes: rule?.cooldownMinutes ?? 360,
  });
};

export const detectDataConnectionFailure: Detector = async (userId, rule, services, raise) => {
  const state = services.ibkr.getSessionState();
  if (!state.configured || state.gatewayReachable) return;

  await raise({
    category: "DATA_CONNECTION_FAILURE",
    symbol: null,
    severity: "CRITICAL",
    title: "IBKR gateway is unreachable",
    explanation: state.lastError?.message ?? "The IBKR Client Portal Gateway could not be reached.",
    condition: { lastError: state.lastError?.message ?? null },
    dedupeKey: "DATA_CONNECTION_FAILURE:ibkr",
    cooldownMinutes: rule?.cooldownMinutes ?? 60,
  });
};

export const detectStaleData: Detector = async (userId, rule, services, raise) => {
  const result = await services.newsDataSource.getPortfolioNews(userId, 5);
  if (result.meta.status !== "cached" || !result.meta.timestamp) return;
  const staleMinutes = num(rule, DEFAULT_THRESHOLDS.staleDataMinutes);
  const ageMinutes = (Date.now() - new Date(result.meta.timestamp).getTime()) / (60 * 1000);
  if (ageMinutes < staleMinutes) return;

  await raise({
    category: "STALE_DATA",
    symbol: null,
    severity: "INFO",
    title: "Portfolio news data is stale",
    explanation: `News data hasn't refreshed in ${Math.round(ageMinutes)} minutes (${result.meta.reason ?? "provider refresh failing"}).`,
    condition: { staleMinutes, ageMinutes },
    dedupeKey: "STALE_DATA:news",
    cooldownMinutes: rule?.cooldownMinutes ?? 120,
  });
};

/** Rule-gated: only evaluated when the user has an enabled AlertRule for the category. */
export const RULE_GATED_DETECTORS: Record<string, Detector> = {
  PRICE_MOVEMENT: detectPriceMovement,
  PNL_CHANGE: detectPnlChange,
  HIGH_RELEVANCE_NEWS: detectHighRelevanceNews,
  EARNINGS_APPROACHING: detectEarningsApproaching,
  EARNINGS_RELEASED: detectEarningsReleased,
  ANALYST_TARGET_REVISION: detectAnalystTargetRevision,
  ANALYST_RATING_CHANGE: detectAnalystRatingChange,
  MAJOR_CATALYST: detectMajorCatalyst,
  CONCENTRATION_CHANGE: detectConcentrationChange,
  EXPOSURE_CHANGE: detectExposureChange,
  MARGIN_LIQUIDITY_THRESHOLD: detectMarginLiquidityThreshold,
  STALE_DATA: detectStaleData,
};

/** Always-on: connection health matters even before the user configures anything. */
export const ALWAYS_ON_DETECTORS: Detector[] = [detectIbkrConnectionStatus, detectDataConnectionFailure];

export type { RaiseAlert };
