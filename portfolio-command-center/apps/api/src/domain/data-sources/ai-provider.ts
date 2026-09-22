import type { AIMessage } from "@pcc/shared";

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIProvider {
  isConfigured(): boolean;
  sendMessage(conversationId: string, userMessage: string, tools: AIToolDefinition[]): Promise<AIMessage>;
}
