import type { AnalystEstimateSummary, AnalystRevisionItem, LiveData } from "@pcc/shared";
import { unavailable } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";
import { classifyAnalystError, AnalystError } from "./errors.js";
import { normalizeAnalystEstimate, normalizeUpgradeDowngrade } from "./normalizer.js";
import type { AnalystProvider } from "./analyst-provider.js";

// Analyst estimates/ratings move far less often than news or quotes — a
// short TTL would just burn Finnhub rate limit (3 calls per refresh: trend,
// target, upgrade/downgrade) for no real freshness gain. See
// docs/RISK_AND_CATALYSTS.md §1 "Cache policy".
const CACHE_TTL_MS = 60 * 60 * 1000;
const REVISIONS_LOOKBACK_DAYS = 90;

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toEstimateSummary(row: { averageTarget: unknown; highTarget: unknown; lowTarget: unknown; consensusRating: string | null; analystCount: number | null; source: string; provider: string; asOf: Date; retrievedAt: Date }, symbol: string): AnalystEstimateSummary {
  return {
    symbol,
    averageTarget: row.averageTarget !== null ? Number(row.averageTarget) : null,
    highTarget: row.highTarget !== null ? Number(row.highTarget) : null,
    lowTarget: row.lowTarget !== null ? Number(row.lowTarget) : null,
    consensusRating: row.consensusRating,
    analystCount: row.analystCount,
    source: row.source,
    provider: row.provider,
    asOf: row.asOf.toISOString(),
    retrievedAt: row.retrievedAt.toISOString(),
  };
}

function toRevisionItem(row: { id: string; firm: string | null; previousValue: string | null; newValue: string | null; ratingChange: string | null; source: string; provider: string; revisedAt: Date; retrievedAt: Date }, symbol: string): AnalystRevisionItem {
  return {
    id: row.id,
    symbol,
    firm: row.firm,
    previousValue: row.previousValue,
    newValue: row.newValue,
    ratingChange: row.ratingChange,
    source: row.source,
    provider: row.provider,
    revisedAt: row.revisedAt.toISOString(),
    retrievedAt: row.retrievedAt.toISOString(),
  };
}

/**
 * Owns everything analyst-data-shaped: fetching from the configured
 * AnalystProvider, caching, normalizing, and persisting to Postgres.
 * Mirrors NewsService's live/cached/unavailable pattern
 * (apps/api/src/integrations/news/news-service.ts) rather than inventing a
 * new one.
 */
export class AnalystService {
  private readonly estimateFetchedAt = new Map<string, Date>();
  private readonly revisionsFetchedAt = new Map<string, Date>();
  private lastSuccessfulFetchAt: Date | null = null;
  private lastError: AnalystError | null = null;

  constructor(
    private readonly provider: AnalystProvider,
    private readonly prisma: PrismaClient,
  ) {}

  get configured(): boolean {
    return this.provider.isConfigured();
  }

  /** Backs checkAnalyst() in health-checks.ts. */
  getStatus(): { configured: boolean; lastSuccessfulFetchAt: string | null; lastError: string | null } {
    return {
      configured: this.configured,
      lastSuccessfulFetchAt: this.lastSuccessfulFetchAt?.toISOString() ?? null,
      lastError: this.lastError?.message ?? null,
    };
  }

  private async resolveInstrument(symbol: string): Promise<string> {
    const instrument = await this.prisma.instrument.upsert({
      where: { symbol },
      create: { symbol },
      update: {},
    });
    return instrument.id;
  }

  private async refreshEstimate(symbol: string): Promise<void> {
    const [trends, target] = await Promise.all([
      this.provider.getRecommendationTrends(symbol),
      this.provider.getPriceTarget(symbol).catch(() => null), // a missing price target shouldn't fail the whole refresh — trend data alone is still useful
    ]);
    const latestTrend = [...trends].sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
    const normalized = normalizeAnalystEstimate(symbol, latestTrend, target);
    const instrumentId = await this.resolveInstrument(symbol);

    await this.prisma.analystEstimate.upsert({
      where: { provider_externalId: { provider: normalized.provider, externalId: normalized.externalId } },
      create: {
        instrumentId,
        averageTarget: normalized.averageTarget,
        highTarget: normalized.highTarget,
        lowTarget: normalized.lowTarget,
        consensusRating: normalized.consensusRating,
        analystCount: normalized.analystCount,
        source: normalized.source,
        provider: normalized.provider,
        externalId: normalized.externalId,
        asOf: normalized.asOf,
      },
      update: {
        averageTarget: normalized.averageTarget,
        highTarget: normalized.highTarget,
        lowTarget: normalized.lowTarget,
        consensusRating: normalized.consensusRating,
        analystCount: normalized.analystCount,
        retrievedAt: new Date(),
      },
    });
    this.estimateFetchedAt.set(symbol, new Date());
  }

  private async refreshRevisions(symbol: string): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - REVISIONS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const raw = await this.provider.getUpgradesDowngrades(symbol, toDateParam(from), toDateParam(to));
    const instrumentId = await this.resolveInstrument(symbol);

    for (const item of raw) {
      const normalized = normalizeUpgradeDowngrade(symbol, item);
      await this.prisma.analystRevision.upsert({
        where: { provider_externalId: { provider: normalized.provider, externalId: normalized.externalId } },
        create: {
          instrumentId,
          firm: normalized.firm,
          previousValue: normalized.previousValue,
          newValue: normalized.newValue,
          ratingChange: normalized.ratingChange,
          source: normalized.source,
          provider: normalized.provider,
          externalId: normalized.externalId,
          revisedAt: normalized.revisedAt,
        },
        update: { retrievedAt: new Date() },
      });
    }
    this.revisionsFetchedAt.set(symbol, new Date());
  }

  async getEstimate(symbol: string): Promise<LiveData<AnalystEstimateSummary>> {
    const upper = symbol.toUpperCase();
    if (!this.configured) {
      return unavailable("analyst", "Analyst data integration is not connected yet. Set FINNHUB_API_KEY and see docs/RISK_AND_CATALYSTS.md.");
    }

    const fetchedAt = this.estimateFetchedAt.get(upper) ?? null;
    const isFresh = fetchedAt && Date.now() - fetchedAt.getTime() < CACHE_TTL_MS;
    let error: AnalystError | null = null;

    if (!isFresh) {
      try {
        await this.refreshEstimate(upper);
        this.lastSuccessfulFetchAt = new Date();
        this.lastError = null;
      } catch (err) {
        error = classifyAnalystError(err);
        this.lastError = error;
      }
    }

    const row = await this.prisma.analystEstimate.findFirst({
      where: { instrument: { symbol: upper } },
      orderBy: { asOf: "desc" },
    });

    if (!row) {
      return unavailable("finnhub", error?.message ?? "No analyst data available for this symbol.");
    }

    const data = toEstimateSummary(row, upper);
    if (!error) return { data, meta: { source: "finnhub", status: "live", timestamp: row.retrievedAt.toISOString() } };
    return { data, meta: { source: "finnhub", status: "cached", timestamp: row.retrievedAt.toISOString(), reason: error.message } };
  }

  async getRevisions(symbol: string, limit = 20): Promise<LiveData<AnalystRevisionItem[]>> {
    const upper = symbol.toUpperCase();
    if (!this.configured) {
      return unavailable("analyst", "Analyst data integration is not connected yet. Set FINNHUB_API_KEY and see docs/RISK_AND_CATALYSTS.md.");
    }

    const fetchedAt = this.revisionsFetchedAt.get(upper) ?? null;
    const isFresh = fetchedAt && Date.now() - fetchedAt.getTime() < CACHE_TTL_MS;
    let error: AnalystError | null = null;

    if (!isFresh) {
      try {
        await this.refreshRevisions(upper);
        this.lastSuccessfulFetchAt = new Date();
        this.lastError = null;
      } catch (err) {
        error = classifyAnalystError(err);
        this.lastError = error;
      }
    }

    const rows = await this.prisma.analystRevision.findMany({
      where: { instrument: { symbol: upper } },
      orderBy: { revisedAt: "desc" },
      take: limit,
    });

    const data = rows.map((row) => toRevisionItem(row, upper));
    if (!error) return { data, meta: { source: "finnhub", status: "live", timestamp: (this.revisionsFetchedAt.get(upper) ?? new Date()).toISOString() } };
    if (data.length > 0) {
      return { data, meta: { source: "finnhub", status: "cached", timestamp: (this.revisionsFetchedAt.get(upper) ?? new Date()).toISOString(), reason: error.message } };
    }
    return unavailable("finnhub", error.message);
  }
}
