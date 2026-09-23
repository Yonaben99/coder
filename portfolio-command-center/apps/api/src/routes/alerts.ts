import type { FastifyInstance } from "fastify";
import type { AlertCategory, AlertSeverity } from "@pcc/shared";
import { buildRequireAuth } from "../auth/middleware.js";

interface LimitQuery {
  limit?: string;
}

interface AlertIdParams {
  id: string;
}

interface SetReadStateBody {
  readState: "read" | "acknowledged";
}

const setReadStateSchema = {
  type: "object",
  required: ["readState"],
  properties: { readState: { type: "string", enum: ["read", "acknowledged"] } },
  additionalProperties: false,
} as const;

interface RuleIdParams {
  id: string;
}

interface CreateRuleBody {
  category: AlertCategory;
  symbol?: string | null;
  enabled?: boolean;
  threshold?: number | null;
  severity?: AlertSeverity;
  cooldownMinutes?: number;
  notifyInApp?: boolean;
}

const createRuleSchema = {
  type: "object",
  required: ["category"],
  properties: {
    category: { type: "string" },
    symbol: { type: ["string", "null"] },
    enabled: { type: "boolean" },
    threshold: { type: ["number", "null"] },
    severity: { type: "string", enum: ["info", "warning", "critical"] },
    cooldownMinutes: { type: "number", minimum: 1 },
    notifyInApp: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

type UpdateRuleBody = Partial<CreateRuleBody>;

const updateRuleSchema = { ...createRuleSchema, required: [] } as const;

function parseLimit(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function alertsRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.get<{ Querystring: LimitQuery }>("/alerts/active", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 50);
    return { alerts: await app.alertService.getActiveAlerts(request.user!.id, limit) };
  });

  app.get<{ Querystring: LimitQuery }>("/alerts/recent", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 20);
    return { alerts: await app.alertService.getRecentAlerts(request.user!.id, limit) };
  });

  app.get<{ Querystring: LimitQuery }>("/alerts/history", { preHandler: requireAuth }, async (request) => {
    const limit = parseLimit(request.query.limit, 100);
    return { alerts: await app.alertService.getAlertHistory(request.user!.id, limit) };
  });

  app.patch<{ Params: AlertIdParams; Body: SetReadStateBody }>(
    "/alerts/:id",
    { preHandler: requireAuth, schema: { body: setReadStateSchema } },
    async (request, reply) => {
      const dbReadState = request.body.readState === "acknowledged" ? "ACKNOWLEDGED" : "READ";
      const alert = await app.alertService.setReadState(request.user!.id, request.params.id, dbReadState);
      if (!alert) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Alert not found." } });
      return { alert };
    },
  );

  app.get("/alert-rules", { preHandler: requireAuth }, async (request) => {
    return { rules: await app.alertService.listRules(request.user!.id) };
  });

  app.post<{ Body: CreateRuleBody }>(
    "/alert-rules",
    { preHandler: requireAuth, schema: { body: createRuleSchema } },
    async (request, reply) => {
      const rule = await app.alertService.createRule(request.user!.id, request.body);
      return reply.code(201).send({ rule });
    },
  );

  app.patch<{ Params: RuleIdParams; Body: UpdateRuleBody }>(
    "/alert-rules/:id",
    { preHandler: requireAuth, schema: { body: updateRuleSchema } },
    async (request, reply) => {
      const rule = await app.alertService.updateRule(request.user!.id, request.params.id, request.body);
      if (!rule) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Alert rule not found." } });
      return { rule };
    },
  );

  app.delete<{ Params: RuleIdParams }>("/alert-rules/:id", { preHandler: requireAuth }, async (request, reply) => {
    const deleted = await app.alertService.deleteRule(request.user!.id, request.params.id);
    if (!deleted) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Alert rule not found." } });
    return reply.code(204).send();
  });
}
