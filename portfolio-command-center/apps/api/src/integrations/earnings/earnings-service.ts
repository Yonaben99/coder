import type { EarningsEvent, LiveData } from "@pcc/shared";
import { unavailable } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";
import { classifyEarningsError, EarningsError } from "./errors.js";
import { normalizeFinnhubEarnings } from "./normalizer.js";
import type { EarningsProvider } from "./earnings-provider.js";

// Earnings dates rarely change hour-to-hour — a longer TTL avoids burning
// rate limit for no real freshness gain. See docs/RISK_AND_CATALYSTS.md §1.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 120;

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toEarningsEvent(row: {
  id: string;
  period: string | null;
  reportDate: Date | null;
  announcementTiming: string | null;
  estimatedEps: unknown;
  estimatedRevenue: unknown;
  actualEps: unknown;
  actualRevenue: unknown;
  status: string;
  source: string;
  provider: string;
  retrievedAt: Date;
}, symbol: string): EarningsEvent {
  return {
    id: row.id,
    symbol,
    period: row.period,
    reportDate: row.reportDate ? row.reportDate.toISOString() : null,
    announcementTiming: row.announcementTiming,
    estimatedEps: row.estimatedEps !== null ? Number(row.estimatedEps) : null,
    estimatedRevenue: row.estimatedRevenue !== null ? Number(row.estimatedRevenue) : null,
    actualEps: row.actualEps !== null ? Number(row.actualEps) : null,
    actualRevenue: row.actualRevenue !== null ? Number(row.actualRevenue) : null,
    status: row.status.toLowerCase() as EarningsEvent["status"],
    source: row.source,
    provider: row.provider,
    retrievedAt: row.retrievedAt.toISOString(),
  };
}

/** Owns fetching/caching/normalizing/persisting earnings calendar entries. Mirrors NewsService/AnalystService's live/cached/unavailable pattern. */
export class EarningsService {
  private readonly fetchedAt = new Map<string, Date>();
  private lastSuccessfulFetchAt: Date | null = null;
  private lastError: EarningsError | null = null;

  constructor(
    private readonly provider: EarningsProvider,
    private readonly prisma: PrismaClient,
  ) {}

  get configured(): boolean {
    return this.provider.isConfigured();
  }

  getStatus(): { configured: boolean; lastSuccessfulFetchAt: string | null; lastError: string | null } {
    return {
      configured: this.configured,
      lastSuccessfulFetchAt: this.lastSuccessfulFetchAt?.toISOString() ?? null,
      lastError: this.lastError?.message ?? null,
    };
  }

  private async resolveInstrument(symbol: string): Promise<string> {
    const instrument = await this.prisma.instrument.upsert({ where: { symbol }, create: { symbol }, update: {} });
    return instrument.id;
  }

  private async refresh(symbol: string): Promise<void> {
    const to = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const raw = await this.provider.getEarningsCalendar(symbol, toDateParam(from), toDateParam(to));
    const instrumentId = await this.resolveInstrument(symbol);

    for (const entry of raw) {
      const normalized = normalizeFinnhubEarnings(entry);
      await this.prisma.earnings.upsert({
        where: { provider_externalId: { provider: normalized.provider, externalId: normalized.externalId } },
        create: {
          instrumentId,
          period: normalized.period,
          reportDate: normalized.reportDate,
          announcementTiming: normalized.announcementTiming,
          estimatedEps: normalized.estimatedEps,
          estimatedRevenue: normalized.estimatedRevenue,
          actualEps: normalized.actualEps,
          actualRevenue: normalized.actualRevenue,
          status: normalized.status,
          source: normalized.source,
          provider: normalized.provider,
          externalId: normalized.externalId,
        },
        update: {
          reportDate: normalized.reportDate,
          announcementTiming: normalized.announcementTiming,
          estimatedEps: normalized.estimatedEps,
          estimatedRevenue: normalized.estimatedRevenue,
          actualEps: normalized.actualEps,
          actualRevenue: normalized.actualRevenue,
          status: normalized.status,
          retrievedAt: new Date(),
        },
      });
    }
    this.fetchedAt.set(symbol, new Date());
  }

  /** Earnings events for one symbol, nearest report first (past LOOKBACK_DAYS through LOOKAHEAD_DAYS). */
  async getForSymbol(symbol: string, limit = 10): Promise<LiveData<EarningsEvent[]>> {
    const upper = symbol.toUpperCase();
    if (!this.configured) {
      return unavailable("earnings", "Earnings data integration is not connected yet. Set FINNHUB_API_KEY and see docs/RISK_AND_CATALYSTS.md.");
    }

    const fetchedAt = this.fetchedAt.get(upper) ?? null;
    const isFresh = fetchedAt && Date.now() - fetchedAt.getTime() < CACHE_TTL_MS;
    let error: EarningsError | null = null;

    if (!isFresh) {
      try {
        await this.refresh(upper);
        this.lastSuccessfulFetchAt = new Date();
        this.lastError = null;
      } catch (err) {
        error = classifyEarningsError(err);
        this.lastError = error;
      }
    }

    const rows = await this.prisma.earnings.findMany({
      where: { instrument: { symbol: upper } },
      orderBy: { reportDate: "asc" },
      take: limit,
    });

    const data = rows.map((row) => toEarningsEvent(row, upper));
    const freshAt = this.fetchedAt.get(upper);
    if (!error) return { data, meta: { source: "finnhub", status: "live", timestamp: (freshAt ?? new Date()).toISOString() } };
    if (data.length > 0) return { data, meta: { source: "finnhub", status: "cached", timestamp: (freshAt ?? new Date()).toISOString(), reason: error.message } };
    return unavailable("finnhub", error.message);
  }

  /** Upcoming earnings across several symbols, merged and sorted by report date — backs the portfolio-aware earnings view/tool. */
  async getUpcomingForSymbols(symbols: string[], limit = 30): Promise<LiveData<EarningsEvent[]>> {
    if (symbols.length === 0) {
      return { data: [], meta: { source: "finnhub", status: "live", timestamp: new Date().toISOString() } };
    }
    if (!this.configured) {
      return unavailable("earnings", "Earnings data integration is not connected yet. Set FINNHUB_API_KEY and see docs/RISK_AND_CATALYSTS.md.");
    }

    let anyError: EarningsError | null = null;
    for (const symbol of symbols.map((s) => s.toUpperCase())) {
      const fetchedAt = this.fetchedAt.get(symbol);
      if (fetchedAt && Date.now() - fetchedAt.getTime() < CACHE_TTL_MS) continue;
      try {
        await this.refresh(symbol);
        this.lastSuccessfulFetchAt = new Date();
        this.lastError = null;
      } catch (err) {
        anyError = classifyEarningsError(err);
        this.lastError = anyError;
      }
    }

    const now = new Date();
    const rows = await this.prisma.earnings.findMany({
      where: { instrument: { symbol: { in: symbols.map((s) => s.toUpperCase()) } }, reportDate: { gte: now } },
      orderBy: { reportDate: "asc" },
      take: limit,
      include: { instrument: true },
    });

    if (rows.length === 0 && anyError) return unavailable("finnhub", anyError.message);

    return {
      data: rows.map((row) => toEarningsEvent(row, row.instrument.symbol)),
      meta: { source: "finnhub", status: anyError ? "cached" : "live", timestamp: new Date().toISOString(), reason: anyError?.message },
    };
  }
}
