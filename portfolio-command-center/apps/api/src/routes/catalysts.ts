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

/**
 * This app has no standalone "every catalyst in the market" feed — every
 * catalyst is derived from a specific symbol's news/earnings/analyst data
 * (docs/RISK_AND_CATALYSTS.md §2), so `/catalysts` with no scope is the
 * same portfolio-aware view as `/catalysts/portfolio`, kept as a separate
 * route only so the API shape matches the spec's minimum endpoint list.
 */
export async function catalystsRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.get<{ Querystring: LimitQuery }>("/catalysts", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 30);
    return app.catalystDataSource.getPortfolioCatalysts(request.user!.id, limit);
  });

  app.get<{ Querystring: LimitQuery }>("/catalysts/portfolio", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 50);
    return app.catalystDataSource.getPortfolioCatalysts(request.user!.id, limit);
  });

  app.get<{ Params: SymbolParams; Querystring: LimitQuery }>("/catalysts/symbol/:symbol", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 30);
    return app.catalystDataSource.getCatalystsForSymbol(request.params.symbol.toUpperCase(), limit);
  });
}
