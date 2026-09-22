import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@pcc/db";
import type { IbkrHttpClient } from "./client.js";
import { IbkrConnectionManager } from "./connection-manager.js";
import { IbkrPortfolioDataSource } from "./ibkr-portfolio-data-source.js";
import type { IbkrAccountSummaryResponse, IbkrPortfolioAccount, IbkrPosition } from "./types.js";

class FakeGatewayClient implements IbkrHttpClient {
  authenticated = true;
  accounts: IbkrPortfolioAccount[] = [{ accountId: "U1111111" }];
  positions: IbkrPosition[] = [];
  summary: IbkrAccountSummaryResponse = { netliquidation: { amount: 1000 } };

  async get<T>(path: string): Promise<T> {
    if (path === "/tickle" || path === "/iserver/accounts") return undefined as T;
    if (path === "/portfolio/accounts") return this.accounts as T;
    if (path.includes("/summary")) return this.summary as T;
    if (path.includes("/ledger")) return null as T;
    if (path.includes("/positions/0")) return this.positions as T;
    if (path.includes("/positions/")) return [] as T;
    if (path === "/iserver/marketdata/snapshot") return [] as T;
    throw new Error(`unhandled GET ${path}`);
  }

  async post<T>(path: string): Promise<T> {
    if (path === "/iserver/auth/status") return { connected: true, authenticated: this.authenticated } as T;
    throw new Error(`unhandled POST ${path}`);
  }
}

function fakePrisma(initialSelection: string | null = null) {
  let stored: { userId: string; selectedAccountId: string | null } | null = initialSelection
    ? { userId: "user-1", selectedAccountId: initialSelection }
    : null;

  return {
    iBKRConnection: {
      findUnique: vi.fn(async () => stored),
      upsert: vi.fn(async ({ create, update }: { create: typeof stored; update: Partial<NonNullable<typeof stored>> }) => {
        stored = stored ? { ...stored, ...update } : (create as NonNullable<typeof stored>);
        return stored;
      }),
    },
  } as unknown as PrismaClient;
}

describe("IbkrPortfolioDataSource — not connected", () => {
  it("returns an honest unavailable summary when IBKR isn't configured", async () => {
    const manager = new IbkrConnectionManager(null);
    const source = new IbkrPortfolioDataSource(manager, fakePrisma());
    const result = await source.getAccountSummary("user-1");
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });
});

describe("IbkrPortfolioDataSource — connected", () => {
  it("auto-selects the only account and persists the selection", async () => {
    const client = new FakeGatewayClient();
    const manager = new IbkrConnectionManager(null, client);
    await manager.testConnection();
    const prisma = fakePrisma();
    const source = new IbkrPortfolioDataSource(manager, prisma);

    const result = await source.getAccountSummary("user-1");
    expect(result.data?.netLiquidation).toBe(1000);
    expect(result.meta.status).toBe("live");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma.iBKRConnection.upsert as any)).toHaveBeenCalled();
  });

  it("groups position weight into sector/asset-class allocation", async () => {
    const client = new FakeGatewayClient();
    client.positions = [
      { conid: 1, ticker: "A", position: 1, mktValue: 600, avgCost: 100, unrealizedPnl: 0, assetClass: "STK", sector: "Tech" },
      { conid: 2, ticker: "B", position: 1, mktValue: 400, avgCost: 100, unrealizedPnl: 0, assetClass: "STK", sector: "Healthcare" },
    ];
    client.summary = { netliquidation: { amount: 1000 } };
    const manager = new IbkrConnectionManager(null, client);
    await manager.testConnection();
    const source = new IbkrPortfolioDataSource(manager, fakePrisma());

    const result = await source.getAllocation("user-1");
    expect(result.data?.bySector).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Tech", weight: expect.closeTo(60) }),
        expect.objectContaining({ label: "Healthcare", weight: expect.closeTo(40) }),
      ]),
    );
  });

  it("getPerformance is always honestly unavailable in Phase 2 — no snapshot history exists yet", async () => {
    const client = new FakeGatewayClient();
    const manager = new IbkrConnectionManager(null, client);
    await manager.testConnection();
    const source = new IbkrPortfolioDataSource(manager, fakePrisma());

    const result = await source.getPerformance();
    expect(result.data).toBeNull();
    expect(result.meta.status).toBe("unavailable");
  });
});
