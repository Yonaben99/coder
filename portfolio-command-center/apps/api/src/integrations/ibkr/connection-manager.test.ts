import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IbkrHttpClient } from "./client.js";
import { IbkrConnectionManager } from "./connection-manager.js";
import type { IbkrAccountSummaryResponse, IbkrMarketDataSnapshot, IbkrPortfolioAccount, IbkrPosition } from "./types.js";

// Route a fake client's requests by path prefix so a single object can
// stand in for the whole gateway across a multi-call sequence
// (accounts -> summary -> ledger -> positions -> market data).
class RoutedFakeClient implements IbkrHttpClient {
  authenticated = true;
  positionsByPage: Record<number, IbkrPosition[]> = { 0: [] };
  summary: IbkrAccountSummaryResponse = {};
  summaryShouldFail = false;
  snapshotResponse: IbkrMarketDataSnapshot[] = [];

  async get<T>(path: string, _query?: Record<string, string>): Promise<T> {
    if (path === "/tickle") return undefined as T;
    if (path === "/iserver/accounts") return undefined as T;
    if (path === "/portfolio/accounts") {
      return [{ accountId: "U1234567" }] as IbkrPortfolioAccount[] as T;
    }
    if (path.startsWith("/portfolio/") && path.includes("/summary")) {
      if (this.summaryShouldFail) throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      return this.summary as T;
    }
    if (path.startsWith("/portfolio/") && path.includes("/ledger")) {
      return null as T;
    }
    if (path.startsWith("/portfolio/") && path.includes("/positions/")) {
      const page = Number(path.split("/").pop());
      return (this.positionsByPage[page] ?? []) as T;
    }
    if (path === "/iserver/marketdata/snapshot") {
      return this.snapshotResponse as T;
    }
    throw new Error(`unhandled GET ${path}`);
  }

  async post<T>(path: string): Promise<T> {
    if (path === "/iserver/auth/status") {
      return { connected: true, authenticated: this.authenticated } as T;
    }
    throw new Error(`unhandled POST ${path}`);
  }
}

describe("IbkrConnectionManager — not configured", () => {
  it("reports unavailable without ever constructing a client", async () => {
    const manager = new IbkrConnectionManager(null);
    expect(manager.configured).toBe(false);
    const result = await manager.getPortfolioBundle("anything");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });
});

describe("IbkrConnectionManager — configured, authenticated", () => {
  let client: RoutedFakeClient;
  let manager: IbkrConnectionManager;

  beforeEach(async () => {
    vi.useFakeTimers();
    client = new RoutedFakeClient();
    client.positionsByPage = {
      0: [{ conid: 1, ticker: "TEST", position: 10, avgCost: 100, mktPrice: 110, mktValue: 1100, unrealizedPnl: 100, realizedPnl: 0 }],
    };
    client.summary = { netliquidation: { amount: 1100 } };
    manager = new IbkrConnectionManager(null, client);
    await manager.testConnection();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("discovers accounts via /iserver/accounts + /portfolio/accounts", async () => {
    const accounts = await manager.listAccounts();
    expect(accounts).toEqual(["U1234567"]);
  });

  it("returns a live bundle on first fetch", async () => {
    const result = await manager.getPortfolioBundle("U1234567");
    expect(result.meta.status).toBe("live");
    expect(result.data?.positions).toHaveLength(1);
    expect(result.data?.summary.netliquidation?.amount).toBe(1100);
  });

  it("serves from cache within the TTL without re-fetching", async () => {
    const first = await manager.getPortfolioBundle("U1234567");
    client.summary = { netliquidation: { amount: 999999 } }; // would show up if re-fetched
    const second = await manager.getPortfolioBundle("U1234567");
    expect(second.data?.summary.netliquidation?.amount).toBe(first.data?.summary.netliquidation?.amount);
    expect(second.meta.status).toBe("live");
  });

  it("falls back to a cached (not live) bundle when a refresh fails after the TTL expires", async () => {
    const first = await manager.getPortfolioBundle("U1234567");
    expect(first.meta.status).toBe("live");

    vi.advanceTimersByTime(20_000); // past the 15s account cache TTL
    client.summaryShouldFail = true;

    const second = await manager.getPortfolioBundle("U1234567");
    expect(second.meta.status).toBe("cached");
    expect(second.meta.reason).toBeTruthy();
    expect(second.data?.positions).toEqual(first.data?.positions); // last known good, not fabricated
  });

  it("reports unavailable (not cached) when there was never a successful fetch", async () => {
    client.summaryShouldFail = true;
    const result = await manager.getPortfolioBundle("U1234567");
    expect(result.meta.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("returns per-conid unavailable for a quote the snapshot response omits", async () => {
    client.snapshotResponse = [{ conid: 1, "31": "110.5" }];
    const quotes = await manager.getQuotes([1, 2]);
    expect(quotes.get(1)?.status).toBe("live");
    expect(quotes.get(2)?.status).toBe("unavailable");
    expect(quotes.get(2)?.reason).toBeTruthy();
  });

  it("caches quotes within the TTL instead of re-requesting every read", async () => {
    client.snapshotResponse = [{ conid: 1, "31": "110.5" }];
    const getSpy = vi.spyOn(client, "get");
    await manager.getQuotes([1]);
    const callsAfterFirst = getSpy.mock.calls.filter((c) => c[0] === "/iserver/marketdata/snapshot").length;
    await manager.getQuotes([1]);
    const callsAfterSecond = getSpy.mock.calls.filter((c) => c[0] === "/iserver/marketdata/snapshot").length;
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });
});
