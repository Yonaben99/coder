import type { FastifyInstance } from "fastify";
import { buildRequireAuth } from "../auth/middleware.js";

/**
 * `/risk` and `/risk/summary` return the same PortfolioRiskSummary — kept
 * as two routes only so the API shape matches the spec's minimum endpoint
 * list (there is no separate "detail vs. summary" split in this app; every
 * metric already documents its own formula/source, see
 * docs/RISK_AND_CATALYSTS.md §3).
 */
export async function riskRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.get("/risk", { preHandler: requireAuth }, async (request) => {
    return app.riskDataSource.getPortfolioRiskSummary(request.user!.id);
  });

  app.get("/risk/summary", { preHandler: requireAuth }, async (request) => {
    return app.riskDataSource.getPortfolioRiskSummary(request.user!.id);
  });
}
