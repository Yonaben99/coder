import type { FastifyInstance } from "fastify";
import { buildRequireAuth } from "../auth/middleware.js";

export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.get("/portfolio/summary", { preHandler: requireAuth }, async (request) => {
    return app.portfolioDataSource.getAccountSummary(request.user!.id);
  });

  app.get("/portfolio/positions", { preHandler: requireAuth }, async (request) => {
    return app.portfolioDataSource.getPositions(request.user!.id);
  });
}
