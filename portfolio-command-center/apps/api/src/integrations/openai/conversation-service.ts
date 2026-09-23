import type { AIConversation, AIMessage as DbAIMessage, PrismaClient } from "@pcc/db";
import type { AIChatMessage, AIToolCall } from "../../domain/data-sources/ai-provider.js";

export interface ConversationWithMessages extends AIConversation {
  messages: DbAIMessage[];
}

/** Maps a stored row back to the provider-agnostic shape the agent works with. */
export function dbMessageToChatMessage(message: Pick<DbAIMessage, "role" | "content" | "toolCalls">): AIChatMessage {
  switch (message.role) {
    case "SYSTEM":
      return { role: "system", content: message.content };
    case "USER":
      return { role: "user", content: message.content };
    case "ASSISTANT": {
      const toolCalls = Array.isArray(message.toolCalls) ? (message.toolCalls as unknown as AIToolCall[]) : undefined;
      return { role: "assistant", content: message.content, toolCalls: toolCalls?.length ? toolCalls : undefined };
    }
    case "TOOL": {
      const stored = Array.isArray(message.toolCalls) ? (message.toolCalls as unknown as Array<{ id: string; name: string }>) : [];
      const ref = stored[0] ?? { id: "", name: "unknown" };
      return { role: "tool", toolCallId: ref.id, name: ref.name, content: message.content };
    }
    default:
      return { role: "user", content: message.content };
  }
}

/**
 * Owns AIConversation/AIMessage persistence and per-user ownership checks —
 * a conversation belonging to another user is treated as not found, never
 * exposed. No IBKR/OpenAI logic lives here; this is pure storage.
 */
export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  async createConversation(userId: string, title?: string): Promise<AIConversation> {
    return this.prisma.aIConversation.create({ data: { userId, title: title ?? null } });
  }

  async listConversations(userId: string): Promise<AIConversation[]> {
    return this.prisma.aIConversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  }

  async getConversationForUser(userId: string, conversationId: string): Promise<ConversationWithMessages | null> {
    const conversation = await this.prisma.aIConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation || conversation.userId !== userId) return null;
    return conversation;
  }

  async appendUserMessage(conversationId: string, content: string): Promise<DbAIMessage> {
    return this.prisma.aIMessage.create({ data: { conversationId, role: "USER", content } });
  }

  async appendAssistantMessage(conversationId: string, content: string, toolCalls?: AIToolCall[]): Promise<DbAIMessage> {
    const message = await this.prisma.aIMessage.create({
      data: { conversationId, role: "ASSISTANT", content, toolCalls: toolCalls?.length ? (toolCalls as object[]) : undefined },
    });
    await this.prisma.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return message;
  }

  async appendToolMessage(conversationId: string, toolCallId: string, name: string, content: string): Promise<DbAIMessage> {
    return this.prisma.aIMessage.create({
      data: { conversationId, role: "TOOL", content, toolCalls: [{ id: toolCallId, name }] },
    });
  }
}
