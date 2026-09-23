import type { FastifyInstance } from "fastify";
import { unavailable, type AnalystEstimateSummary, type LiveData } from "@pcc/shared";
import { buildRequireAuth } from "../auth/middleware.js";

interface SymbolParams {
  symbol: string;
}

interface RevisionsQuery {
  limit?: string;
}

export async function analystsRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  // Portfolio-aware: analyst consensus for every currently-held symbol. Never invents holdings — mirrors /news/portfolio.
  app.get("/analysts", { preHandler: requireAuth }, async (request): Promise<LiveData<AnalystEstimateSummary[]>> => {
    const positions = await app.portfolioDataSource.getPositions(request.user!.id);
    if (!positions.data || positions.data.length === 0) {
      return unavailable<AnalystEstimateSummary[]>(
        "analyst",
        positions.meta.reason ?? "No portfolio holdings to fetch analyst data for. Connect IBKR in Settings → Connections.",
      );
    }
    const symbols = [...new Set(positions.data.map((p) => p.symbol.toUpperCase()))];
    const results = await Promise.all(symbols.map((symbol) => app.analystDataSource.getAnalystEstimate(symbol)));
    const data = results.map((r) => r.data).filter((d): d is AnalystEstimateSummary => d !== null);
    const anyLive = results.some((r) => r.meta.status === "live");
    const anyUnavailable = results.some((r) => r.meta.status === "unavailable");
    return {
      data,
      meta: {
        source: "finnhub",
        status: data.length === 0 ? "unavailable" : anyLive ? "live" : "cached",
        timestamp: new Date().toISOString(),
        reason: anyUnavailable ? "Analyst data unavailable for one or more holdings." : undefined,
      },
    };
  });

  app.get<{ Params: SymbolParams }>("/analysts/:symbol", { preHandler: requireAuth }, async (request) => {
    return app.analystDataSource.getAnalystEstimate(request.params.symbol.toUpperCase());
  });

  app.get<{ Params: SymbolParams; Querystring: RevisionsQuery }>(
    "/analysts/:symbol/revisions",
    { preHandler: requireAuth },
    async (request) => {
      const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : undefined;
      return app.analystDataSource.getAnalystRevisions(request.params.symbol.toUpperCase(), limit);
    },
  );
}
