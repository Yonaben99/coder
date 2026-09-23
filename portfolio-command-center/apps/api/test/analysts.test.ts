import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

describe("analysts routes", () => {
  let app: FastifyInstance;
  let cookieHeader: string;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access to every analysts endpoint", async () => {
    app = await createTestApp();
    const paths = ["/api/v1/analysts", "/api/v1/analysts/AAPL", "/api/v1/analysts/AAPL/revisions"];
    for (const path of paths) {
      const response = await app.inject({ method: "GET", url: path });
      expect(response.statusCode).toBe(401);
    }
  });

  it("signs up a user for the authenticated tests below", async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email, password: "correct horse battery staple" },
    });
    expect(signup.statusCode).toBe(201);
    cookieHeader = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  });

  it("GET /api/v1/analysts reports unavailable — no IBKR connection means no holdings, never a guessed symbol list", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/analysts", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: unknown; meta: { status: string; reason?: string } };
    expect(body.data).toBeNull();
    expect(body.meta.status).toBe("unavailable");
    expect(body.meta.reason).toBeTruthy();
  });

  it("GET /api/v1/analysts/:symbol reports an honest unavailable envelope when FINNHUB_API_KEY isn't set", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/analysts/AAPL", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: unknown; meta: { status: string; reason?: string } };
    expect(body.data).toBeNull();
    expect(body.meta.status).toBe("unavailable");
  });

  it("GET /api/v1/analysts/:symbol/revisions reports the same honest unavailable envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/analysts/AAPL/revisions", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { meta: { status: string } }).meta.status).toBe("unavailable");
  });
});
