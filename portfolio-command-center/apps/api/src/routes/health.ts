import type { FastifyInstance } from "fastify";
import { getAllIntegrationHealth } from "../domain/health/health-checks.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness probe: the process is up. Deliberately does not touch the
  // database or any external integration — a slow/down DB must not make an
  // orchestrator kill and restart an otherwise-healthy process. Exempt from
  // the global rate limit (config.rateLimit: false) so a platform's
  // frequent health polling can never be throttled.
  app.get("/health", { config: { rateLimit: false } }, async () => ({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
  }));

  // Readiness probe: the process can actually serve traffic right now. A
  // real SELECT 1, not just "the code exists" — a load balancer/orchestrator
  // should stop routing here (but not restart the process) while this
  // fails. See docs/DEPLOYMENT.md "Health and readiness".
  app.get("/ready", { config: { rateLimit: false } }, async (request, reply) => {
    try {
      await request.server.prisma.$queryRaw`SELECT 1`;
      return reply.code(200).send({ status: "ready" });
    } catch (error) {
      request.log.error({ err: error }, "readiness check failed: database unreachable");
      return reply.code(503).send({ status: "not_ready", reason: "database_unreachable" });
    }
  });
}

export async function healthRoutesV1(app: FastifyInstance): Promise<void> {
  app.get("/health", async (request) => {
    const services = await getAllIntegrationHealth(
      request.server.prisma,
      request.server.config,
      request.server.ibkr,
      request.server.aiAgent,
      request.server.newsService,
      request.server.analystService,
      request.server.scheduler,
    );
    const overall = services.some((s) => s.status === "failed")
      ? "degraded"
      : services.every((s) => s.status === "operational" || s.status === "not_configured")
        ? "ok"
        : "degraded";

    return { status: overall, services };
  });
}
