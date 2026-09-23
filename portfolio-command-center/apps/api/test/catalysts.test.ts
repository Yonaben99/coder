import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

describe("catalysts routes", () => {
  let app: FastifyInstance;
  let cookieHeader: string;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access", async () => {
    app = await createTestApp();
    for (const path of ["/api/v1/catalysts", "/api/v1/catalysts/portfolio", "/api/v1/catalysts/symbol/AAPL"]) {
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

  it("GET /api/v1/catalysts reports unavailable — no IBKR connection means no holdings, never a guessed symbol list", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/catalysts", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: unknown; meta: { status: string; reason?: string } };
    expect(body.data).toBeNull();
    expect(body.meta.status).toBe("unavailable");
  });

  it("GET /api/v1/catalysts/portfolio reports the same honest unavailable envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/catalysts/portfolio", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { meta: { status: string } }).meta.status).toBe("unavailable");
  });

  it("GET /api/v1/catalysts/symbol/:symbol reports unavailable when every underlying source is disconnected", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/catalysts/symbol/AAPL", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { meta: { status: string } }).meta.status).toBe("unavailable");
  });
});
