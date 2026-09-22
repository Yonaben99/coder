/**
 * A single "model turn": everything a chat-completion-style API needs to
 * produce one response, independent of any specific vendor's SDK shape.
 * The AI agent orchestration loop (apps/api/src/integrations/openai/agent.ts)
 * is written entirely against this interface, never against the OpenAI SDK
 * directly, so a future provider swap only means writing a new class here.
 */

export interface AIToolDefinition {
	name: string;
	description: string;
	/** JSON Schema for the tool's arguments. */
	parameters: Record<string, unknown>;
}

export type AIChatMessage =
	| { role: "system"; content: string }
	| { role: "user"; content: string }
	| { role: "assistant"; content: string; toolCalls?: AIToolCall[] }
	| { role: "tool"; toolCallId: string; name: string; content: string };

export interface AIToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export type AIProviderResponse =
	| { type: "message"; content: string }
	| { type: "tool_calls"; toolCalls: AIToolCall[] };

export interface AIProviderStatus {
	configured: boolean;
	lastSuccessfulCallAt: string | null;
	lastError: string | null;
}

export interface AIProvider {
	isConfigured(): boolean;
	getStatus(): AIProviderStatus;
	/**
	 * One model turn: send the full message history plus available tools,
	 * get back either a final text message or a set of tool calls the caller
	 * must execute and feed back as "tool" messages in the next call.
	 */
	createResponse(params: {
		messages: AIChatMessage[];
		tools: AIToolDefinition[];
	}): Promise<AIProviderResponse>;
}
