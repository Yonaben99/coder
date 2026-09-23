import type { AIMessage as DbAIMessage } from "@pcc/db";
import type { AIChatMessage, AIProvider, AIProviderResponse } from "../../domain/data-sources/ai-provider.js";
import { classifyOpenAiError } from "./errors.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { PORTFOLIO_AI_TOOLS } from "./tool-definitions.js";
import { TOOL_EXECUTORS, type ToolServices } from "./tool-executor.js";
import { dbMessageToChatMessage, type ConversationService } from "./conversation-service.js";

const MAX_TOOL_ITERATIONS = 6;

const UNAVAILABLE_MESSAGE = "עוזר תיק ההשקעות אינו זמין כרגע.";
const MAX_ITERATIONS_MESSAGE =
  "לא הצלחתי להשלים את הניתוח בתוך מספר הצעדים המותר. אפשר לנסח את השאלה בצורה ממוקדת יותר?";

export interface AgentTurnResult {
  assistantMessage: string;
  /** Tool names invoked this turn, in call order — used for the UI's "checking..." transparency badges. */
  toolCallsUsed: string[];
}

/**
 * Provider-agnostic tool-calling loop: builds the message history, calls
 * the AIProvider, executes any requested tools against real application
 * services, feeds results back, and repeats until the model returns a
 * final message or the iteration cap is hit. Persists every message
 * incrementally via ConversationService so a mid-loop failure doesn't lose
 * history. Never fabricates data — a failed or unimplemented tool call is
 * fed back to the model exactly as reported (see tool-executor.ts).
 */
export class PortfolioAiAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly services: ToolServices,
    private readonly conversations: ConversationService,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  getProviderStatus() {
    return this.provider.getStatus();
  }

  async runTurn(userId: string, conversationId: string, priorMessages: DbAIMessage[]): Promise<AgentTurnResult> {
    if (!this.provider.isConfigured()) {
      const content = UNAVAILABLE_MESSAGE;
      await this.conversations.appendAssistantMessage(conversationId, content);
      return { assistantMessage: content, toolCallsUsed: [] };
    }

    const history: AIChatMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      ...priorMessages.map(dbMessageToChatMessage),
    ];

    const toolCallsUsed: string[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response: AIProviderResponse;
      try {
        response = await this.provider.createResponse({ messages: history, tools: PORTFOLIO_AI_TOOLS });
      } catch (err) {
        const content = classifyOpenAiError(err).message;
        await this.conversations.appendAssistantMessage(conversationId, content);
        return { assistantMessage: content, toolCallsUsed };
      }

      if (response.type === "message") {
        await this.conversations.appendAssistantMessage(conversationId, response.content);
        return { assistantMessage: response.content, toolCallsUsed };
      }

      // tool_calls: record the assistant's call intent, then execute and feed results back.
      history.push({ role: "assistant", content: "", toolCalls: response.toolCalls });
      await this.conversations.appendAssistantMessage(conversationId, "", response.toolCalls);

      for (const call of response.toolCalls) {
        toolCallsUsed.push(call.name);
        const executor = TOOL_EXECUTORS[call.name];
        let resultPayload: unknown;
        if (!executor) {
          resultPayload = { error: `Unknown tool: ${call.name}` };
        } else {
          try {
            resultPayload = await executor(userId, call.arguments, this.services);
          } catch (err) {
            resultPayload = { error: err instanceof Error ? err.message : "Tool execution failed" };
          }
        }
        const content = JSON.stringify(resultPayload);
        history.push({ role: "tool", toolCallId: call.id, name: call.name, content });
        await this.conversations.appendToolMessage(conversationId, call.id, call.name, content);
      }
    }

    await this.conversations.appendAssistantMessage(conversationId, MAX_ITERATIONS_MESSAGE);
    return { assistantMessage: MAX_ITERATIONS_MESSAGE, toolCallsUsed };
  }
}
