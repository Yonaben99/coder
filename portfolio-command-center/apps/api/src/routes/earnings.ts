import type { FastifyInstance } from "fastify";
import { buildRequireAuth } from "../auth/middleware.js";

interface SymbolParams {
  symbol: string;
}

interface LimitQuery {
  limit?: string;
}

function parseLimit(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function earningsRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  // Portfolio-aware: upcoming earnings across every currently-held symbol.
  app.get<{ Querystring: LimitQuery }>("/earnings", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 30);
    return app.earningsDataSource.getUpcomingPortfolioEarnings(request.user!.id, limit);
  });

  app.get<{ Params: SymbolParams; Querystring: LimitQuery }>("/earnings/:symbol", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 10);
    return app.earningsDataSource.getEarningsForSymbol(request.params.symbol.toUpperCase(), limit);
  });
}
