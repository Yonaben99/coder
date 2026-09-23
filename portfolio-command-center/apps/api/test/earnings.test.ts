import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

describe("earnings routes", () => {
  let app: FastifyInstance;
  let cookieHeader: string;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access", async () => {
    app = await createTestApp();
    for (const path of ["/api/v1/earnings", "/api/v1/earnings/AAPL"]) {
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

  it("GET /api/v1/earnings reports unavailable — no IBKR connection means no holdings", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/earnings", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: unknown; meta: { status: string; reason?: string } };
    expect(body.data).toBeNull();
    expect(body.meta.status).toBe("unavailable");
  });

  it("GET /api/v1/earnings/:symbol reports an honest unavailable envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/earnings/AAPL", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { meta: { status: string } }).meta.status).toBe("unavailable");
  });
});
