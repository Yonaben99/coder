import type { FastifyInstance } from "fastify";
import type { ConnectionActionCapability, ConnectionInfo } from "@pcc/shared";
import { getAllIntegrationHealth } from "../domain/health/health-checks.js";
import { buildRequireAuth } from "../auth/middleware.js";

const CAPABILITIES_BY_KEY: Record<string, ConnectionActionCapability[]> = {
  ibkr: ["test_connection", "reconnect"],
  openai: ["test_connection"],
  market_data: ["test_connection"],
  news: ["test_connection"],
  database: ["test_connection"],
};

export async function connectionsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/connections", { preHandler: buildRequireAuth(app.prisma) }, async () => {
    const all = await getAllIntegrationHealth(app.prisma, app.config);
    const connections: ConnectionInfo[] = all
      .filter((integration) => integration.key !== "scheduled_jobs")
      .map((integration) => ({
        ...integration,
        capabilities: CAPABILITIES_BY_KEY[integration.key] ?? [],
      }));

    return { connections };
  });
}
