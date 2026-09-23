import type { FastifyInstance } from "fastify";
import { buildRequireAuth } from "../auth/middleware.js";

/**
 * Reports the scheduler's real state — which jobs are registered, when
 * each last ran/succeeded, and its last error — never a claim of "live
 * monitoring" beyond what the scheduler itself has actually done. See
 * docs/ALERTS_AND_MONITORING.md §2 and §6.6.
 */
export async function monitoringRoutes(app: FastifyInstance): Promise<void> {
  app.get("/monitoring/status", { preHandler: buildRequireAuth(app.prisma) }, async () => {
    return app.scheduler.getStatus();
  });
}
