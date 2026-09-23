import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

describe("alerts routes", () => {
  let app: FastifyInstance;
  let cookieHeaderA: string;
  let cookieHeaderB: string;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access to every alerts endpoint", async () => {
    app = await createTestApp();
    const paths = ["/api/v1/alerts/active", "/api/v1/alerts/recent", "/api/v1/alerts/history", "/api/v1/alert-rules"];
    for (const path of paths) {
      const response = await app.inject({ method: "GET", url: path });
      expect(response.statusCode).toBe(401);
    }
  });

  it("signs up two users for the tests below", async () => {
    const signupA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: uniqueEmail(), password: "correct horse battery staple" },
    });
    expect(signupA.statusCode).toBe(201);
    cookieHeaderA = signupA.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const signupB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: uniqueEmail(), password: "correct horse battery staple" },
    });
    expect(signupB.statusCode).toBe(201);
    cookieHeaderB = signupB.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  });

  it("GET /api/v1/alerts/active returns an empty list for a fresh user — never a fabricated alert", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/alerts/active", headers: { cookie: cookieHeaderA } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { alerts: unknown[] }).alerts).toEqual([]);
  });

  it("POST /api/v1/alert-rules creates a rule owned by the authenticated user", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules",
      headers: { cookie: cookieHeaderA },
      payload: { category: "price_movement", threshold: 5, symbol: "WDC" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { rule: { id: string; category: string; threshold: number } };
    expect(body.rule.category).toBe("price_movement");
    expect(body.rule.threshold).toBe(5);
  });

  it("GET /api/v1/alert-rules only ever returns the authenticated user's own rules", async () => {
    const responseA = await app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: { cookie: cookieHeaderA } });
    expect((responseA.json() as { rules: unknown[] }).rules.length).toBeGreaterThan(0);

    const responseB = await app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: { cookie: cookieHeaderB } });
    expect((responseB.json() as { rules: unknown[] }).rules).toEqual([]);
  });

  it("PATCH/DELETE on another user's rule returns 404 — never cross-user access", async () => {
    const listResponse = await app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: { cookie: cookieHeaderA } });
    const ruleId = (listResponse.json() as { rules: Array<{ id: string }> }).rules[0]!.id;

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/alert-rules/${ruleId}`,
      headers: { cookie: cookieHeaderB },
      payload: { enabled: false },
    });
    expect(patchResponse.statusCode).toBe(404);

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/v1/alert-rules/${ruleId}`, headers: { cookie: cookieHeaderB } });
    expect(deleteResponse.statusCode).toBe(404);
  });

  it("PATCH /api/v1/alerts/:id returns 404 for a nonexistent alert", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/alerts/does-not-exist",
      headers: { cookie: cookieHeaderA },
      payload: { readState: "read" },
    });
    expect(response.statusCode).toBe(404);
  });
});
