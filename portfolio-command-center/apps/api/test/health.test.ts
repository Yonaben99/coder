import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma } from "./helpers.js";

describe("health endpoints", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    await app?.close();
  });

  it("GET /health reports liveness without touching integrations", async () => {
    app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  it("GET /ready reports readiness with a real database check", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ready" });
  });

  it("GET /api/v1/health reports real per-integration status, none hardcoded operational", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; services: Array<{ key: string; status: string }> };

    const keys = body.services.map((s) => s.key).sort();
    expect(keys).toEqual(["analyst", "database", "ibkr", "market_data", "news", "openai", "scheduled_jobs"].sort());

    const database = body.services.find((s) => s.key === "database");
    expect(database?.status).toBe("operational");

    const ibkr = body.services.find((s) => s.key === "ibkr");
    expect(ibkr?.status).toBe("not_configured");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
