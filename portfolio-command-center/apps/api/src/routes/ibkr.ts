import type { FastifyInstance } from "fastify";
import { buildRequireAuth } from "../auth/middleware.js";

export async function ibkrRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.get("/integrations/ibkr/status", { preHandler: requireAuth }, async () => {
    return app.ibkr.getDetailedStatus();
  });

  // Forces a fresh check against the gateway rather than reporting the
  // cached heartbeat state — backs the "Test IBKR Connection" button.
  app.post("/integrations/ibkr/test", { preHandler: requireAuth }, async () => {
    await app.ibkr.testConnection();
    return app.ibkr.getDetailedStatus();
  });
}
