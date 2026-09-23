import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@pcc/db";
import { EarningsError } from "./errors.js";
import { EarningsService } from "./earnings-service.js";
import type { EarningsProvider } from "./earnings-provider.js";
import type { FinnhubEarningsEntry } from "./types.js";

class FakeEarningsProvider implements EarningsProvider {
  readonly name = "finnhub";
  private _configured = true;
  entries = new Map<string, FinnhubEarningsEntry[]>();
  shouldFail = false;
  calls = 0;

  set configured(value: boolean) {
    this._configured = value;
  }
  isConfigured(): boolean {
    return this._configured;
  }
  async getEarningsCalendar(symbol: string): Promise<FinnhubEarningsEntry[]> {
    this.calls++;
    if (this.shouldFail) throw new EarningsError("unavailable");
    return this.entries.get(symbol) ?? [];
  }
}

const RUN = Date.now().toString(36).toUpperCase();
const sym = (n: number): string => `T${RUN}E${n}`;
const usedSymbols: string[] = [];

afterAll(async () => {
  if (usedSymbols.length > 0) {
    await prisma.instrument.deleteMany({ where: { symbol: { in: usedSymbols } } });
  }
  await prisma.$disconnect();
});

function entry(symbol: string, overrides: Partial<FinnhubEarningsEntry> = {}): FinnhubEarningsEntry {
  return {
    symbol,
    date: "2026-06-15",
    year: 2026,
    quarter: 2,
    hour: "amc",
    epsEstimate: 1.5,
    epsActual: null,
    revenueEstimate: 4_000_000_000,
    revenueActual: null,
    ...overrides,
  };
}

describe("EarningsService — not configured", () => {
  it("reports unavailable without calling the provider", async () => {
    const provider = new FakeEarningsProvider();
    provider.configured = false;
    const service = new EarningsService(provider, prisma);
    const result = await service.getForSymbol("WDC");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
    expect(provider.calls).toBe(0);
  });
});

describe("EarningsService — configured", () => {
  it("fetches, normalizes, and stores earnings entries, reporting live", async () => {
    const symbol = sym(1);
    usedSymbols.push(symbol);
    const provider = new FakeEarningsProvider();
    provider.entries.set(symbol, [entry(symbol)]);
    const service = new EarningsService(provider, prisma);

    const result = await service.getForSymbol(symbol);
    expect(result.meta.status).toBe("live");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.period).toBe("Q2 2026");
    expect(result.data?.[0]?.status).toBe("estimated");
  });

  it("serves from cache within the TTL without re-fetching", async () => {
    const symbol = sym(2);
    usedSymbols.push(symbol);
    const provider = new FakeEarningsProvider();
    provider.entries.set(symbol, [entry(symbol)]);
    const service = new EarningsService(provider, prisma);

    await service.getForSymbol(symbol);
    const callsAfterFirst = provider.calls;
    await service.getForSymbol(symbol);
    expect(provider.calls).toBe(callsAfterFirst);
  });

  it("falls back to cached data when a refresh fails after the TTL expires", async () => {
    const symbol = sym(3);
    usedSymbols.push(symbol);
    vi.useFakeTimers();
    try {
      const provider = new FakeEarningsProvider();
      provider.entries.set(symbol, [entry(symbol)]);
      const service = new EarningsService(provider, prisma);

      const first = await service.getForSymbol(symbol);
      expect(first.meta.status).toBe("live");

      vi.advanceTimersByTime(7 * 60 * 60 * 1000); // past the 6-hour cache TTL
      provider.shouldFail = true;

      const second = await service.getForSymbol(symbol);
      expect(second.meta.status).toBe("cached");
      expect(second.data).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getUpcomingForSymbols merges and sorts earnings across multiple symbols, future dates only", async () => {
    const symbolA = sym(4);
    const symbolB = sym(5);
    usedSymbols.push(symbolA, symbolB);
    const future1 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const future2 = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const provider = new FakeEarningsProvider();
    provider.entries.set(symbolA, [entry(symbolA, { date: future1, quarter: 3 })]);
    provider.entries.set(symbolB, [entry(symbolB, { date: future2, quarter: 3 }), entry(symbolB, { date: past, quarter: 1, epsActual: 1.2 })]);
    const service = new EarningsService(provider, prisma);

    const result = await service.getUpcomingForSymbols([symbolA, symbolB]);
    expect(result.meta.status).toBe("live");
    // Only future-dated entries returned, nearest first
    expect(result.data?.map((e) => e.symbol)).toEqual([symbolB, symbolA]);
  });

  it("getUpcomingForSymbols returns empty (not unavailable) for an empty symbol list", async () => {
    const provider = new FakeEarningsProvider();
    const service = new EarningsService(provider, prisma);
    const result = await service.getUpcomingForSymbols([]);
    expect(result.data).toEqual([]);
    expect(result.meta.status).toBe("live");
  });
});
