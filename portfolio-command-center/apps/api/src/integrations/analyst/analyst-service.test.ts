import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@pcc/db";
import { AnalystError } from "./errors.js";
import { AnalystService } from "./analyst-service.js";
import type { AnalystProvider } from "./analyst-provider.js";
import type { FinnhubPriceTarget, FinnhubRecommendationTrend, FinnhubUpgradeDowngrade } from "./types.js";

/** Fixture-based only — no real Finnhub credentials or network calls. */
class FakeAnalystProvider implements AnalystProvider {
  readonly name = "finnhub";
  private _configured = true;
  trends = new Map<string, FinnhubRecommendationTrend[]>();
  targets = new Map<string, FinnhubPriceTarget | null>();
  revisions = new Map<string, FinnhubUpgradeDowngrade[]>();
  shouldFail = false;
  calls = 0;

  set configured(value: boolean) {
    this._configured = value;
  }
  isConfigured(): boolean {
    return this._configured;
  }
  async getRecommendationTrends(symbol: string): Promise<FinnhubRecommendationTrend[]> {
    this.calls++;
    if (this.shouldFail) throw new AnalystError("unavailable");
    return this.trends.get(symbol) ?? [];
  }
  async getPriceTarget(symbol: string): Promise<FinnhubPriceTarget | null> {
    if (this.shouldFail) throw new AnalystError("unavailable");
    return this.targets.get(symbol) ?? null;
  }
  async getUpgradesDowngrades(symbol: string): Promise<FinnhubUpgradeDowngrade[]> {
    this.calls++;
    if (this.shouldFail) throw new AnalystError("unavailable");
    return this.revisions.get(symbol) ?? [];
  }
}

const RUN = Date.now().toString(36).toUpperCase();
const sym = (n: number): string => `T${RUN}A${n}`;
const usedSymbols: string[] = [];

afterAll(async () => {
  if (usedSymbols.length > 0) {
    await prisma.instrument.deleteMany({ where: { symbol: { in: usedSymbols } } });
  }
  await prisma.$disconnect();
});

function trend(symbol: string, overrides: Partial<FinnhubRecommendationTrend> = {}): FinnhubRecommendationTrend {
  return { symbol, period: "2026-01-01", strongBuy: 5, buy: 3, hold: 2, sell: 0, strongSell: 0, ...overrides };
}

describe("AnalystService — not configured", () => {
  it("reports unavailable without calling the provider", async () => {
    const provider = new FakeAnalystProvider();
    provider.configured = false;
    const service = new AnalystService(provider, prisma);
    const result = await service.getEstimate("WDC");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
    expect(provider.calls).toBe(0);
  });
});

describe("AnalystService — configured", () => {
  it("fetches, normalizes, and stores an estimate, reporting live", async () => {
    const symbol = sym(1);
    usedSymbols.push(symbol);
    const provider = new FakeAnalystProvider();
    provider.trends.set(symbol, [trend(symbol)]);
    provider.targets.set(symbol, { symbol, targetHigh: 90, targetLow: 60, targetMean: 75, targetMedian: 74, lastUpdated: "2026-01-15" });
    const service = new AnalystService(provider, prisma);

    const result = await service.getEstimate(symbol);
    expect(result.meta.status).toBe("live");
    expect(result.data?.averageTarget).toBe(75);
    expect(result.data?.consensusRating).toBe("Strong Buy");
  });

  it("serves from cache within the TTL without re-fetching", async () => {
    const symbol = sym(2);
    usedSymbols.push(symbol);
    const provider = new FakeAnalystProvider();
    provider.trends.set(symbol, [trend(symbol)]);
    const service = new AnalystService(provider, prisma);

    await service.getEstimate(symbol);
    const callsAfterFirst = provider.calls;
    await service.getEstimate(symbol);
    expect(provider.calls).toBe(callsAfterFirst);
  });

  it("falls back to cached data when a refresh fails after the TTL expires", async () => {
    const symbol = sym(3);
    usedSymbols.push(symbol);
    vi.useFakeTimers();
    try {
      const provider = new FakeAnalystProvider();
      provider.trends.set(symbol, [trend(symbol)]);
      const service = new AnalystService(provider, prisma);

      const first = await service.getEstimate(symbol);
      expect(first.meta.status).toBe("live");

      vi.advanceTimersByTime(61 * 60 * 1000); // past the 60-minute cache TTL
      provider.shouldFail = true;

      const second = await service.getEstimate(symbol);
      expect(second.meta.status).toBe("cached");
      expect(second.data).toBeTruthy(); // last known good, not fabricated
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetches and stores revisions, most recent first", async () => {
    const symbol = sym(4);
    usedSymbols.push(symbol);
    const provider = new FakeAnalystProvider();
    provider.revisions.set(symbol, [
      { symbol, company: "Morgan Stanley", gradeTime: 1732104000, fromGrade: "Hold", toGrade: "Buy", action: "up" },
      { symbol, company: "Goldman Sachs", gradeTime: 1732190400, fromGrade: "Buy", toGrade: "Strong Buy", action: "up" },
    ]);
    const service = new AnalystService(provider, prisma);

    const result = await service.getRevisions(symbol);
    expect(result.meta.status).toBe("live");
    expect(result.data).toHaveLength(2);
    expect(result.data?.[0]?.firm).toBe("Goldman Sachs"); // more recent gradeTime first
  });

  it("reports unavailable for revisions when the provider fails and nothing is cached yet", async () => {
    const symbol = sym(5);
    usedSymbols.push(symbol);
    const provider = new FakeAnalystProvider();
    provider.shouldFail = true;
    const service = new AnalystService(provider, prisma);

    const result = await service.getRevisions(symbol);
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });
});
