export type AIMessageRoleDTO = "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";

export interface AIToolCallDTO {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
}

export interface AIMessageDTO {
  id: string;
  conversationId: string;
  role: AIMessageRoleDTO;
  content: string;
  toolCalls: AIToolCallDTO[] | null;
  createdAt: string;
}

export interface AIConversationSummaryDTO {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIConversationDetailDTO extends AIConversationSummaryDTO {
  messages: AIMessageDTO[];
}

export interface SendMessageResult {
  assistantMessage: string;
  toolCallsUsed: string[];
}
