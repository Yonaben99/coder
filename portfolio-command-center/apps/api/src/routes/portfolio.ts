import type { FastifyInstance } from "fastify";
import { buildRequireAuth } from "../auth/middleware.js";

const selectAccountSchema = {
  type: "object",
  required: ["accountId"],
  properties: {
    accountId: { type: "string", minLength: 1, maxLength: 64 },
  },
  additionalProperties: false,
} as const;

interface SelectAccountBody {
  accountId: string;
}

export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.get("/portfolio/summary", { preHandler: requireAuth }, async (request) => {
    return app.portfolioDataSource.getAccountSummary(request.user!.id);
  });

  app.get("/portfolio/positions", { preHandler: requireAuth }, async (request) => {
    return app.portfolioDataSource.getPositions(request.user!.id);
  });

  app.get("/portfolio/allocation", { preHandler: requireAuth }, async (request) => {
    return app.ibkrPortfolioDataSource.getAllocation(request.user!.id);
  });

  app.get("/portfolio/performance", { preHandler: requireAuth }, async () => {
    return app.ibkrPortfolioDataSource.getPerformance();
  });

  app.get("/portfolio/account", { preHandler: requireAuth }, async (request) => {
    return app.ibkrPortfolioDataSource.listAccountsForUser(request.user!.id);
  });

  app.post<{ Body: SelectAccountBody }>(
    "/portfolio/account",
    { preHandler: requireAuth, schema: { body: selectAccountSchema } },
    async (request, reply) => {
      const result = await app.ibkrPortfolioDataSource.selectAccount(request.user!.id, request.body.accountId);
      if (!result.ok) {
        return reply.code(422).send({ error: { code: "ACCOUNT_NOT_AVAILABLE", message: result.reason } });
      }
      return result;
    },
  );
}
