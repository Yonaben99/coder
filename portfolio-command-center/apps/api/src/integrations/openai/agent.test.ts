import { describe, expect, it, vi } from "vitest";
import { unavailable, type AccountSummary, type LiveData, type MarketData, type Position } from "@pcc/shared";
import type { AIChatMessage, AIProvider, AIProviderResponse, AIProviderStatus, AIToolDefinition } from "../../domain/data-sources/ai-provider.js";
import type { MarketDataSource, PortfolioDataSource } from "../../domain/data-sources/index.js";
import type { IbkrPortfolioDataSource } from "../ibkr/ibkr-portfolio-data-source.js";
import { PortfolioAiAgent } from "./agent.js";
import type { ConversationService } from "./conversation-service.js";

class FakeAIProvider implements AIProvider {
  configured = true;
  queue: AIProviderResponse[] = [];
  calls: Array<{ messages: AIChatMessage[]; tools: AIToolDefinition[] }> = [];

  isConfigured(): boolean {
    return this.configured;
  }
  getStatus(): AIProviderStatus {
    return { configured: this.configured, lastSuccessfulCallAt: null, lastError: null };
  }
  async createResponse(params: { messages: AIChatMessage[]; tools: AIToolDefinition[] }): Promise<AIProviderResponse> {
    this.calls.push(params);
    const next = this.queue.shift();
    if (!next) throw new Error("FakeAIProvider: no scripted response left");
    return next;
  }
}

function fakeConversationService() {
  const appended: Array<{ kind: string; content: string; toolCalls?: unknown }> = [];
  const service = {
    appendAssistantMessage: vi.fn(async (_id: string, content: string, toolCalls?: unknown) => {
      appended.push({ kind: "assistant", content, toolCalls });
      return {} as never;
    }),
    appendToolMessage: vi.fn(async (_id: string, _callId: string, name: string, content: string) => {
      appended.push({ kind: "tool", content: `${name}:${content}` });
      return {} as never;
    }),
  };
  return { service: service as unknown as ConversationService, appended };
}

function fakeServices() {
  const portfolioDataSource: PortfolioDataSource = {
    getAccountSummary: async (): Promise<LiveData<AccountSummary>> =>
      unavailable("IBKR", "IBKR is not connected yet. Connect it in Settings → Connections."),
    getPositions: async (): Promise<LiveData<Position[]>> => unavailable("IBKR", "IBKR is not connected yet."),
  };
  const ibkrPortfolioDataSource = {} as unknown as IbkrPortfolioDataSource;
  const marketDataSource: MarketDataSource = {
    getQuote: async (): Promise<LiveData<MarketData>> => unavailable("market-data", "not connected"),
    getQuotes: async (): Promise<LiveData<MarketData[]>> => unavailable("market-data", "not connected"),
  };
  return { portfolioDataSource, ibkrPortfolioDataSource, marketDataSource };
}

describe("PortfolioAiAgent — not configured", () => {
  it("returns an honest unavailable message without calling the provider's createResponse", async () => {
    const provider = new FakeAIProvider();
    provider.configured = false;
    const { service, appended } = fakeConversationService();
    const agent = new PortfolioAiAgent(provider, fakeServices(), service);

    const result = await agent.runTurn("user-1", "conv-1", []);

    expect(result.toolCallsUsed).toEqual([]);
    expect(result.assistantMessage).toBeTruthy();
    expect(provider.calls).toHaveLength(0);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.kind).toBe("assistant");
  });
});

describe("PortfolioAiAgent — tool-calling loop", () => {
  it("executes a requested tool, feeds the honest unavailable result back, and returns the model's final message", async () => {
    const provider = new FakeAIProvider();
    provider.queue = [
      { type: "tool_calls", toolCalls: [{ id: "call_1", name: "getAccountSummary", arguments: {} }] },
      { type: "message", content: "I can't retrieve that right now." },
    ];
    const { service, appended } = fakeConversationService();
    const agent = new PortfolioAiAgent(provider, fakeServices(), service);

    const result = await agent.runTurn("user-1", "conv-1", []);

    expect(result.toolCallsUsed).toEqual(["getAccountSummary"]);
    expect(result.assistantMessage).toBe("I can't retrieve that right now.");
    expect(provider.calls).toHaveLength(2);

    // The tool result actually sent back to the model must carry the real
    // unavailable status/reason — this is what stops the model from
    // inventing a number, verified at the deterministic plumbing layer.
    const secondCallMessages = provider.calls[1]!.messages;
    const toolMessage = secondCallMessages.find((m): m is Extract<AIChatMessage, { role: "tool" }> => m.role === "tool");
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.content).toContain('"unavailable"');
    expect(toolMessage?.content).toContain("IBKR is not connected");

    // Every step is persisted incrementally, in order: the tool-call intent,
    // the tool result, then the final assistant message.
    expect(appended.map((a) => a.kind)).toEqual(["assistant", "tool", "assistant"]);
  });

  it("stops at the iteration cap instead of looping forever on a provider that only ever requests tools", async () => {
    const provider = new FakeAIProvider();
    // Always request the same tool call, indefinitely.
    provider.queue = Array.from({ length: 10 }, () => ({
      type: "tool_calls" as const,
      toolCalls: [{ id: "call_x", name: "getAccountSummary", arguments: {} }],
    }));
    const { service } = fakeConversationService();
    const agent = new PortfolioAiAgent(provider, fakeServices(), service);

    const result = await agent.runTurn("user-1", "conv-1", []);

    expect(provider.calls.length).toBeLessThanOrEqual(6);
    expect(result.assistantMessage).toBeTruthy();
  });

  it("surfaces a classified provider error as the assistant's reply instead of throwing out of the route", async () => {
    const provider = new FakeAIProvider();
    provider.queue = []; // createResponse will throw "no scripted response"
    const { service } = fakeConversationService();
    const agent = new PortfolioAiAgent(provider, fakeServices(), service);

    const result = await agent.runTurn("user-1", "conv-1", []);
    expect(result.assistantMessage).toBeTruthy();
    expect(result.toolCallsUsed).toEqual([]);
  });
});
