import type { Catalyst as SharedCatalyst, LiveData, LiveDataMeta } from "@pcc/shared";
import { unavailable } from "@pcc/shared";
import type { Catalyst as DbCatalyst, PrismaClient } from "@pcc/db";
import type { AnalystDataSource, EarningsDataSource, NewsDataSource } from "../../domain/data-sources/index.js";
import { catalystTypeForCategories } from "./category-map.js";

function toSharedCatalyst(row: DbCatalyst, symbol: string | null): SharedCatalyst {
  return {
    id: row.id,
    symbol,
    type: row.type.toLowerCase() as SharedCatalyst["type"],
    title: row.title,
    description: row.description,
    expectedDate: row.expectedDate ? row.expectedDate.toISOString() : null,
    dateConfirmed: row.dateConfirmed,
    status: row.status.toLowerCase() as SharedCatalyst["status"],
    relevance: row.relevance ? (row.relevance.toLowerCase() as SharedCatalyst["relevance"]) : null,
    source: row.source,
    url: row.url,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    retrievedAt: row.retrievedAt.toISOString(),
  };
}

function combineMeta(metas: LiveDataMeta[]): LiveDataMeta {
  const reasons = metas.map((m) => m.reason).filter((r): r is string => !!r);
  const anyUnavailableOrCached = metas.some((m) => m.status === "cached" || m.status === "unavailable");
  return {
    source: "catalyst-engine",
    status: anyUnavailableOrCached ? "cached" : "live",
    timestamp: new Date().toISOString(),
    reason: reasons[0],
  };
}

/**
 * Aggregates already-normalized news/earnings/analyst-revision data into
 * the shared Catalyst model — a deterministic mapping (docs/RISK_AND_CATALYSTS.md
 * §2), not an AI judgment. Depends only on the existing NewsDataSource /
 * EarningsDataSource / AnalystDataSource interfaces (never a provider
 * directly), so it inherits their honesty: if a source is unavailable, the
 * catalysts it would have produced are simply absent, not fabricated.
 */
export class CatalystService {
  constructor(
    private readonly newsDataSource: NewsDataSource,
    private readonly analystDataSource: AnalystDataSource,
    private readonly earningsDataSource: EarningsDataSource,
    private readonly prisma: PrismaClient,
  ) {}

  private async resolveInstrument(symbol: string): Promise<string> {
    const instrument = await this.prisma.instrument.upsert({ where: { symbol }, create: { symbol }, update: {} });
    return instrument.id;
  }

  private async syncNewsForSymbol(symbol: string, instrumentId: string): Promise<LiveDataMeta> {
    const result = await this.newsDataSource.getNewsForSymbol(symbol, 20);
    if (!result.data) return result.meta;

    for (const item of result.data) {
      if (item.relevance !== "medium" && item.relevance !== "high") continue;
      await this.prisma.catalyst.upsert({
        where: { sourceType_sourceId: { sourceType: "NEWS", sourceId: item.id } },
        create: {
          instrumentId,
          sourceType: "NEWS",
          sourceId: item.id,
          type: catalystTypeForCategories(item.categories) as never,
          title: item.headline,
          description: item.summary ?? item.headline,
          expectedDate: new Date(item.publishedAt),
          dateConfirmed: true,
          status: "COMPLETED",
          relevance: item.relevance.toUpperCase() as never,
          source: item.source,
          url: item.url,
          publishedAt: new Date(item.publishedAt),
        },
        update: { retrievedAt: new Date() },
      });
    }
    return result.meta;
  }

  private async syncEarningsForSymbol(symbol: string, instrumentId: string): Promise<LiveDataMeta> {
    const result = await this.earningsDataSource.getEarningsForSymbol(symbol, 10);
    if (!result.data) return result.meta;

    const now = new Date();
    for (const event of result.data) {
      if (!event.reportDate) continue;
      const reportDate = new Date(event.reportDate);
      const epsPart = event.estimatedEps !== null ? `est. EPS ${event.estimatedEps}` : null;
      const revenuePart = event.estimatedRevenue !== null ? `est. revenue ${event.estimatedRevenue.toLocaleString()}` : null;
      const description = [epsPart, revenuePart].filter(Boolean).join(", ") || "Earnings report";

      await this.prisma.catalyst.upsert({
        where: { sourceType_sourceId: { sourceType: "EARNINGS", sourceId: event.id } },
        create: {
          instrumentId,
          sourceType: "EARNINGS",
          sourceId: event.id,
          type: "EARNINGS",
          title: `${symbol} earnings${event.period ? ` (${event.period})` : ""}`,
          description,
          expectedDate: reportDate,
          dateConfirmed: false, // Finnhub's calendar gives a concrete date but no explicit "confirmed by company" flag — see docs/RISK_AND_CATALYSTS.md §1.
          status: reportDate < now ? "COMPLETED" : "UPCOMING",
          relevance: "HIGH",
          source: event.source,
        },
        update: {
          expectedDate: reportDate,
          status: reportDate < now ? "COMPLETED" : "UPCOMING",
          description,
          retrievedAt: new Date(),
        },
      });
    }
    return result.meta;
  }

  private async syncRevisionsForSymbol(symbol: string, instrumentId: string): Promise<LiveDataMeta> {
    const result = await this.analystDataSource.getAnalystRevisions(symbol, 10);
    if (!result.data) return result.meta;

    for (const rev of result.data) {
      const isUpDown = rev.ratingChange === "up" || rev.ratingChange === "down";
      await this.prisma.catalyst.upsert({
        where: { sourceType_sourceId: { sourceType: "ANALYST_REVISION", sourceId: rev.id } },
        create: {
          instrumentId,
          sourceType: "ANALYST_REVISION",
          sourceId: rev.id,
          type: "ANALYST_REVISION",
          title: `${rev.firm ?? "Analyst"}${rev.ratingChange ? ` ${rev.ratingChange}` : ""} — ${symbol}`,
          description: `${rev.previousValue ?? "?"} → ${rev.newValue ?? "?"}`,
          expectedDate: new Date(rev.revisedAt),
          dateConfirmed: true,
          status: "COMPLETED",
          relevance: isUpDown ? "HIGH" : "MEDIUM",
          source: rev.source,
          publishedAt: new Date(rev.revisedAt),
        },
        update: { retrievedAt: new Date() },
      });
    }
    return result.meta;
  }

  private async syncSymbol(symbol: string): Promise<LiveDataMeta[]> {
    const instrumentId = await this.resolveInstrument(symbol);
    return Promise.all([
      this.syncNewsForSymbol(symbol, instrumentId),
      this.syncEarningsForSymbol(symbol, instrumentId),
      this.syncRevisionsForSymbol(symbol, instrumentId),
    ]);
  }

  private sortForDisplay<T extends DbCatalyst>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
      if (a.status !== b.status) return a.status === "UPCOMING" ? -1 : 1;
      const aTime = a.expectedDate?.getTime() ?? 0;
      const bTime = b.expectedDate?.getTime() ?? 0;
      return a.status === "UPCOMING" ? aTime - bTime : bTime - aTime;
    });
  }

  async getCatalystsForSymbol(symbol: string, limit = 30): Promise<LiveData<SharedCatalyst[]>> {
    const upper = symbol.toUpperCase();
    const metas = await this.syncSymbol(upper);

    const rows = await this.prisma.catalyst.findMany({
      where: { instrument: { symbol: upper } },
      take: limit,
    });
    const sorted = this.sortForDisplay(rows);

    if (sorted.length === 0 && metas.every((m) => m.status === "unavailable")) {
      return unavailable("catalyst-engine", metas[0]?.reason ?? "No catalyst data available.");
    }
    return { data: sorted.map((row) => toSharedCatalyst(row, upper)), meta: combineMeta(metas) };
  }

  async getPortfolioCatalysts(symbols: string[], limit = 50): Promise<LiveData<SharedCatalyst[]>> {
    if (symbols.length === 0) {
      return { data: [], meta: { source: "catalyst-engine", status: "live", timestamp: new Date().toISOString() } };
    }
    const upperSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];
    const allMetas: LiveDataMeta[] = [];
    for (const symbol of upperSymbols) {
      allMetas.push(...(await this.syncSymbol(symbol)));
    }

    const rows = await this.prisma.catalyst.findMany({
      where: { instrument: { symbol: { in: upperSymbols } } },
      take: limit * upperSymbols.length,
      include: { instrument: true },
    });
    const sorted = this.sortForDisplay(rows).slice(0, limit);

    if (sorted.length === 0 && allMetas.every((m) => m.status === "unavailable")) {
      return unavailable("catalyst-engine", allMetas[0]?.reason ?? "No catalyst data available for this portfolio.");
    }
    return {
      data: sorted.map((row) => toSharedCatalyst(row, row.instrument?.symbol ?? null)),
      meta: combineMeta(allMetas),
    };
  }
}
