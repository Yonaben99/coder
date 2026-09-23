import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

describe("news routes", () => {
  let app: FastifyInstance;
  let cookieHeader: string;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access to every news endpoint", async () => {
    app = await createTestApp();
    const paths = ["/api/v1/news", "/api/v1/news/recent", "/api/v1/news/portfolio", "/api/v1/news/portfolio/summary", "/api/v1/news/symbol/AAPL", "/api/v1/news/some-id"];
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

  it("GET /api/v1/news/recent reports an honest 'unavailable' envelope when FINNHUB_API_KEY isn't set, never fake headlines", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/news/recent", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: unknown; meta: { status: string; reason?: string } };
    expect(body.data).toBeNull();
    expect(body.meta.status).toBe("unavailable");
    expect(body.meta.reason).toBeTruthy();
  });

  it("GET /api/v1/news reports the same honest unavailable envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/news", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { meta: { status: string } }).meta.status).toBe("unavailable");
  });

  it("GET /api/v1/news/portfolio reports unavailable — no IBKR connection means no holdings, never a guessed symbol list", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/news/portfolio", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: unknown; meta: { status: string; reason?: string } };
    expect(body.data).toBeNull();
    expect(body.meta.status).toBe("unavailable");
  });

  it("GET /api/v1/news/portfolio/summary reports unavailable for the same reason", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/news/portfolio/summary", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { meta: { status: string } }).meta.status).toBe("unavailable");
  });

  it("GET /api/v1/news/symbol/:symbol reports unavailable", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/news/symbol/AAPL", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { meta: { status: string } }).meta.status).toBe("unavailable");
  });

  it("GET /api/v1/news/:id returns 404 for an article that doesn't exist, not a fabricated one", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/news/does-not-exist", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(404);
  });
});
