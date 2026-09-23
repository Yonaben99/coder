import type { FastifyInstance } from "fastify";
import { getAllIntegrationHealth } from "../domain/health/health-checks.js";
import { buildRequireAuth } from "../auth/middleware.js";

export async function systemHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/system-health", { preHandler: buildRequireAuth(app.prisma) }, async () => {
    const services = await getAllIntegrationHealth(app.prisma, app.config, app.ibkr, app.aiAgent, app.newsService, app.analystService, app.scheduler);
    return { services };
  });
}
