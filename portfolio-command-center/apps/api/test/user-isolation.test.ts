import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@pcc/db";
import { createTestApp, uniqueEmail } from "./helpers.js";
import { computeHistoricalRiskMetrics } from "../src/integrations/risk/historical-risk.js";

/**
 * Phase 7 §14 — a consolidated, explicit proof (not just per-feature spot
 * checks) that one user's data is never reachable by another, at both the
 * HTTP API layer and, for data the API doesn't expose a raw list of
 * (portfolio snapshots), the service layer directly against a real
 * Postgres instance. Individual features already carry their own
 * isolation tests (test/alerts.test.ts, test/ai-conversations.test.ts);
 * this file is the cross-cutting sweep the production-readiness review
 * asked for, not a replacement for those.
 */

async function signUp(app: FastifyInstance): Promise<{ userId: string; cookieHeader: string }> {
  const email = uniqueEmail();
  const signup = await app.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    payload: { email, password: "correct horse battery staple" },
  });
  const cookieHeader = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const userId = (signup.json() as { user: { id: string } }).user.id;
  return { userId, cookieHeader };
}

describe("user isolation (Phase 7 production-readiness review)", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access across every protected resource area", async () => {
    app = await createTestApp();
    const protectedGetRoutes = [
      "/api/v1/auth/me",
      "/api/v1/portfolio/summary",
      "/api/v1/portfolio/positions",
      "/api/v1/portfolio/allocation",
      "/api/v1/portfolio/account",
      "/api/v1/connections",
      "/api/v1/integrations/ibkr/status",
      "/api/v1/system-health",
      "/api/v1/ai/conversations",
      "/api/v1/news/portfolio",
      "/api/v1/news/portfolio/summary",
      "/api/v1/analysts",
      "/api/v1/earnings",
      "/api/v1/catalysts",
      "/api/v1/catalysts/portfolio",
      "/api/v1/risk",
      "/api/v1/risk/summary",
      "/api/v1/alerts/active",
      "/api/v1/alerts/recent",
      "/api/v1/alerts/history",
      "/api/v1/alert-rules",
      "/api/v1/monitoring/status",
    ];

    for (const url of protectedGetRoutes) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, `expected 401 for GET ${url}`).toBe(401);
    }
  });

  it("never returns another user's alerts from /alerts/active, /recent, or /history", async () => {
    const userA = await signUp(app);
    const userB = await signUp(app);

    const makeAlert = (userId: string, symbol: string) =>
      prisma.alert.create({
        data: {
          userId,
          category: "PRICE_MOVEMENT",
          symbol,
          severity: "WARNING",
          title: `${symbol} moved`,
          explanation: "test fixture",
          condition: { threshold: 5, actualValue: 7 },
          status: "TRIGGERED",
          dedupeKey: `PRICE_MOVEMENT:${symbol}`,
        },
      });

    const alertA = await makeAlert(userA.userId, "AAA");
    const alertB = await makeAlert(userB.userId, "BBB");

    for (const path of ["active", "recent", "history"]) {
      const responseA = await app.inject({ method: "GET", url: `/api/v1/alerts/${path}`, headers: { cookie: userA.cookieHeader } });
      const idsA = (responseA.json() as { alerts: Array<{ id: string }> }).alerts.map((a) => a.id);
      expect(idsA, `${path}: user A should see their own alert`).toContain(alertA.id);
      expect(idsA, `${path}: user A must never see user B's alert`).not.toContain(alertB.id);

      const responseB = await app.inject({ method: "GET", url: `/api/v1/alerts/${path}`, headers: { cookie: userB.cookieHeader } });
      const idsB = (responseB.json() as { alerts: Array<{ id: string }> }).alerts.map((a) => a.id);
      expect(idsB, `${path}: user B should see their own alert`).toContain(alertB.id);
      expect(idsB, `${path}: user B must never see user A's alert`).not.toContain(alertA.id);
    }
  });

  it("never lists another user's AI conversations", async () => {
    const userA = await signUp(app);
    const userB = await signUp(app);

    const createdA = await app.inject({
      method: "POST",
      url: "/api/v1/ai/conversations",
      headers: { cookie: userA.cookieHeader },
      payload: {},
    });
    const conversationA = (createdA.json() as { conversation: { id: string } }).conversation.id;

    const createdB = await app.inject({
      method: "POST",
      url: "/api/v1/ai/conversations",
      headers: { cookie: userB.cookieHeader },
      payload: {},
    });
    const conversationB = (createdB.json() as { conversation: { id: string } }).conversation.id;

    const listA = await app.inject({ method: "GET", url: "/api/v1/ai/conversations", headers: { cookie: userA.cookieHeader } });
    const idsA = (listA.json() as { conversations: Array<{ id: string }> }).conversations.map((c) => c.id);
    expect(idsA).toContain(conversationA);
    expect(idsA).not.toContain(conversationB);

    const listB = await app.inject({ method: "GET", url: "/api/v1/ai/conversations", headers: { cookie: userB.cookieHeader } });
    const idsB = (listB.json() as { conversations: Array<{ id: string }> }).conversations.map((c) => c.id);
    expect(idsB).toContain(conversationB);
    expect(idsB).not.toContain(conversationA);
  });

  it("scopes historical risk metrics to the requesting user's own PortfolioSnapshot history", async () => {
    const userA = await signUp(app);
    const userB = await signUp(app);

    const symbol = `ISOTEST${Date.now()}`;
    const instrument = await prisma.instrument.create({ data: { symbol } });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    for (const [takenAt, netLiq] of [
      [weekAgo, 100_000],
      [now, 150_000],
    ] as const) {
      await prisma.portfolioSnapshot.create({
        data: {
          userId: userA.userId,
          takenAt,
          netLiquidation: netLiq,
          source: "test-fixture",
          positions: { create: [{ instrumentId: instrument.id, quantity: 10, weight: 100, marketValue: netLiq }] },
        },
      });
    }

    const metricsA = await computeHistoricalRiskMetrics(prisma, userA.userId);
    const metricsB = await computeHistoricalRiskMetrics(prisma, userB.userId);

    const exposureA = metricsA.find((m) => m.key === "exposure_change_7d");
    const exposureB = metricsB.find((m) => m.key === "exposure_change_7d");

    expect(exposureA?.value, "user A has snapshot history and should get a computed value").not.toBeNull();
    expect(exposureB?.value, "user B has no snapshots of their own — must stay null, never borrow user A's").toBeNull();
    expect(exposureB?.explanation).toMatch(/no portfolio snapshot history/i);
  });
});
