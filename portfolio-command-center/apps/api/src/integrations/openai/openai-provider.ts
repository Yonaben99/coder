import OpenAI from "openai";
import type {
  AIChatMessage,
  AIProvider,
  AIProviderResponse,
  AIProviderStatus,
  AIToolCall,
  AIToolDefinition,
} from "../../domain/data-sources/ai-provider.js";
import { classifyOpenAiError, OpenAiError } from "./errors.js";

/**
 * Maps our provider-agnostic AIChatMessage[] onto the Responses API's
 * `input` array. The leading system message (if any) is pulled out by the
 * caller and sent via `instructions` instead — see createResponse below.
 */
function toResponsesInput(messages: AIChatMessage[]): OpenAI.Responses.ResponseInputItem[] {
  const input: OpenAI.Responses.ResponseInputItem[] = [];
  for (const message of messages) {
    switch (message.role) {
      case "system":
        // Handled via `instructions` — see createResponse.
        continue;
      case "user":
        input.push({ role: "user", content: message.content, type: "message" });
        break;
      case "assistant":
        if (message.toolCalls?.length) {
          for (const call of message.toolCalls) {
            input.push({
              type: "function_call",
              call_id: call.id,
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            });
          }
        } else {
          input.push({ role: "assistant", content: message.content, type: "message" });
        }
        break;
      case "tool":
        input.push({
          type: "function_call_output",
          call_id: message.toolCallId,
          output: message.content,
        });
        break;
    }
  }
  return input;
}

function toResponsesTools(tools: AIToolDefinition[]): OpenAI.Responses.FunctionTool[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }));
}

function safeParseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const MAX_OUTPUT_TOKENS = 2000;

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI | null;
  private lastSuccessfulCallAt: Date | null = null;
  private lastError: OpenAiError | null = null;

  constructor(
    apiKey: string | null,
    private readonly model: string,
  ) {
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getStatus(): AIProviderStatus {
    return {
      configured: this.isConfigured(),
      lastSuccessfulCallAt: this.lastSuccessfulCallAt?.toISOString() ?? null,
      lastError: this.lastError?.message ?? null,
    };
  }

  async createResponse({
    messages,
    tools,
  }: {
    messages: AIChatMessage[];
    tools: AIToolDefinition[];
  }): Promise<AIProviderResponse> {
    if (!this.client) throw new OpenAiError("not_configured");

    const systemMessage = messages.find((m) => m.role === "system");

    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: systemMessage?.content,
        input: toResponsesInput(messages),
        tools: tools.length > 0 ? toResponsesTools(tools) : undefined,
        max_output_tokens: MAX_OUTPUT_TOKENS,
      });

      this.lastSuccessfulCallAt = new Date();
      this.lastError = null;

      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
      );

      if (functionCalls.length > 0) {
        const toolCalls: AIToolCall[] = functionCalls.map((call) => ({
          id: call.call_id,
          name: call.name,
          arguments: safeParseArguments(call.arguments),
        }));
        return { type: "tool_calls", toolCalls };
      }

      return { type: "message", content: response.output_text ?? "" };
    } catch (err) {
      const classified = classifyOpenAiError(err);
      this.lastError = classified;
      throw classified;
    }
  }
}
