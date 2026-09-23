import type { FastifyInstance } from "fastify";
import { buildRequireAuth } from "../auth/middleware.js";

const createConversationSchema = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 200 },
  },
  additionalProperties: false,
} as const;

const sendMessageSchema = {
  type: "object",
  required: ["content"],
  properties: {
    content: { type: "string", minLength: 1, maxLength: 4000 },
  },
  additionalProperties: false,
} as const;

interface CreateConversationBody {
  title?: string;
}

interface SendMessageBody {
  content: string;
}

function summarizeAsTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = buildRequireAuth(app.prisma);

  app.post<{ Body: CreateConversationBody }>(
    "/ai/conversations",
    { preHandler: requireAuth, schema: { body: createConversationSchema } },
    async (request, reply) => {
      const conversation = await app.conversations.createConversation(request.user!.id, request.body?.title);
      app.log.info({ event: "ai.conversation.created", conversationId: conversation.id, userId: request.user!.id });
      return reply.code(201).send({ conversation });
    },
  );

  app.get("/ai/conversations", { preHandler: requireAuth }, async (request) => {
    const conversations = await app.conversations.listConversations(request.user!.id);
    return { conversations };
  });

  app.get<{ Params: { id: string } }>("/ai/conversations/:id", { preHandler: requireAuth }, async (request, reply) => {
    const conversation = await app.conversations.getConversationForUser(request.user!.id, request.params.id);
    if (!conversation) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
    }
    return { conversation };
  });

  app.post<{ Params: { id: string }; Body: SendMessageBody }>(
    "/ai/conversations/:id/messages",
    { preHandler: requireAuth, schema: { body: sendMessageSchema } },
    async (request, reply) => {
      const userId = request.user!.id;
      const conversation = await app.conversations.getConversationForUser(userId, request.params.id);
      if (!conversation) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
      }

      await app.conversations.appendUserMessage(conversation.id, request.body.content);
      app.log.info({ event: "ai.message.sent", conversationId: conversation.id, userId });

      if (!conversation.title) {
        // Best-effort — a failure here shouldn't fail the user's message.
        await app.prisma.aIConversation
          .update({ where: { id: conversation.id }, data: { title: summarizeAsTitle(request.body.content) } })
          .catch(() => undefined);
      }

      const priorMessages = [...conversation.messages];
      const result = await app.aiAgent.runTurn(userId, conversation.id, [
        ...priorMessages,
        // The user message was just persisted above but isn't in `conversation.messages` yet — include it in-memory for this turn.
        { id: "pending", conversationId: conversation.id, role: "USER", content: request.body.content, toolCalls: null, createdAt: new Date() },
      ]);

      app.log.info({
        event: "ai.response.generated",
        conversationId: conversation.id,
        userId,
        toolCallsUsed: result.toolCallsUsed,
      });

      return { assistantMessage: result.assistantMessage, toolCallsUsed: result.toolCallsUsed };
    },
  );
}
