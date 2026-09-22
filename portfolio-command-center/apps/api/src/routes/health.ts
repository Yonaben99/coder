import type { FastifyInstance } from "fastify";
import { getAllIntegrationHealth } from "../domain/health/health-checks.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness probe: the process is up. Deliberately does not touch the
  // database or any external integration.
  app.get("/health", async () => ({ status: "ok", uptimeSeconds: Math.round(process.uptime()) }));
}

export async function healthRoutesV1(app: FastifyInstance): Promise<void> {
  app.get("/health", async (request) => {
    const services = await getAllIntegrationHealth(request.server.prisma, request.server.config, request.server.ibkr);
    const overall = services.some((s) => s.status === "failed")
      ? "degraded"
      : services.every((s) => s.status === "operational" || s.status === "not_configured")
        ? "ok"
        : "degraded";

    return { status: overall, services };
  });
}
