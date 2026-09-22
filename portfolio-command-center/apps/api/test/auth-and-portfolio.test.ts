import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

describe("auth and portfolio routes", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access to portfolio data", async () => {
    app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/portfolio/summary" });
    expect(response.statusCode).toBe(401);
  });

  it("signs up, sets a session cookie, and exposes the user via /auth/me", async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email, password: "correct horse battery staple" },
    });

    expect(signup.statusCode).toBe(201);
    const cookies = signup.cookies;
    expect(cookies.length).toBeGreaterThan(0);

    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: cookieHeader } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { email } });
  });

  it("rejects login with the wrong password", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email, password: "correct horse battery staple" },
    });

    const badLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "wrong password entirely" },
    });

    expect(badLogin.statusCode).toBe(401);
  });

  it("returns an honest 'unavailable' portfolio summary instead of fake data once authenticated", async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email, password: "correct horse battery staple" },
    });
    const cookieHeader = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/portfolio/summary",
      headers: { cookie: cookieHeader },
    });

    expect(summary.statusCode).toBe(200);
    const body = summary.json() as { data: unknown; meta: { status: string; source: string; reason?: string } };
    expect(body.data).toBeNull();
    expect(body.meta.status).toBe("unavailable");
    expect(body.meta.source).toBe("IBKR");
    expect(body.meta.reason).toBeTruthy();
  });
});
