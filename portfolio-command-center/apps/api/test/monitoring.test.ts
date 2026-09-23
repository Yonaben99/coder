import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

describe("monitoring routes", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access", async () => {
    app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/monitoring/status" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/v1/monitoring/status reports the scheduler's real job list, not a claim of live monitoring", async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email, password: "correct horse battery staple" },
    });
    const cookieHeader = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const response = await app.inject({ method: "GET", url: "/api/v1/monitoring/status", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { schedulerRunning: boolean; jobs: Array<{ name: string; intervalMinutes: number }> };
    expect(typeof body.schedulerRunning).toBe("boolean");
    expect(body.jobs.map((j) => j.name).sort()).toEqual(
      ["evaluateAlerts", "refreshAnalystData", "refreshEarnings", "refreshNews", "refreshPortfolioState"].sort(),
    );
  });
});
