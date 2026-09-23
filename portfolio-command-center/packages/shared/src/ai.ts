export type AIMessageRole = "user" | "assistant" | "system" | "tool";

/**
 * Every AI-generated claim must be labeled with one of these kinds so the
 * UI (and the model itself, via the system prompt) never blurs fact,
 * estimate, and speculation together.
 */
export type AIClaimKind =
  | "fact"
  | "analyst_estimate"
  | "ai_interpretation"
  | "scenario"
  | "uncertainty";

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  createdAt: string;
}

export interface AIConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}
