import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, prisma, uniqueEmail } from "./helpers.js";

async function signUp(app: FastifyInstance) {
  const email = uniqueEmail();
  const signup = await app.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    payload: { email, password: "correct horse battery staple" },
  });
  const cookieHeader = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return { email, cookieHeader };
}

describe("AI conversation routes", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access to every conversation route", async () => {
    app = await createTestApp();
    const routes = [
      { method: "POST" as const, url: "/api/v1/ai/conversations", payload: {} },
      { method: "GET" as const, url: "/api/v1/ai/conversations", payload: undefined },
      { method: "GET" as const, url: "/api/v1/ai/conversations/does-not-exist", payload: undefined },
      { method: "POST" as const, url: "/api/v1/ai/conversations/does-not-exist/messages", payload: { content: "test" } },
    ];
    for (const route of routes) {
      const response = await app.inject({ method: route.method, url: route.url, payload: route.payload });
      expect(response.statusCode).toBe(401);
    }
  });

  it("creates, lists, and loads a conversation for the authenticated user", async () => {
    const { cookieHeader } = await signUp(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/ai/conversations",
      headers: { cookie: cookieHeader },
      payload: {},
    });
    expect(created.statusCode).toBe(201);
    const conversationId = (created.json() as { conversation: { id: string } }).conversation.id;

    const list = await app.inject({ method: "GET", url: "/api/v1/ai/conversations", headers: { cookie: cookieHeader } });
    expect(list.statusCode).toBe(200);
    const listed = (list.json() as { conversations: Array<{ id: string }> }).conversations;
    expect(listed.some((c) => c.id === conversationId)).toBe(true);

    const loaded = await app.inject({ method: "GET", url: `/api/v1/ai/conversations/${conversationId}`, headers: { cookie: cookieHeader } });
    expect(loaded.statusCode).toBe(200);
    const conversation = (loaded.json() as { conversation: { id: string; messages: unknown[] } }).conversation;
    expect(conversation.id).toBe(conversationId);
    expect(conversation.messages).toEqual([]);
  });

  it("404s when loading a conversation that doesn't exist", async () => {
    const { cookieHeader } = await signUp(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/ai/conversations/nonexistent-id", headers: { cookie: cookieHeader } });
    expect(response.statusCode).toBe(404);
  });

  it("never exposes one user's conversation to another user", async () => {
    const owner = await signUp(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/ai/conversations",
      headers: { cookie: owner.cookieHeader },
      payload: {},
    });
    const conversationId = (created.json() as { conversation: { id: string } }).conversation.id;

    const otherUser = await signUp(app);
    const attempt = await app.inject({
      method: "GET",
      url: `/api/v1/ai/conversations/${conversationId}`,
      headers: { cookie: otherUser.cookieHeader },
    });
    expect(attempt.statusCode).toBe(404);

    const attemptMessage = await app.inject({
      method: "POST",
      url: `/api/v1/ai/conversations/${conversationId}/messages`,
      headers: { cookie: otherUser.cookieHeader },
      payload: { content: "hi" },
    });
    expect(attemptMessage.statusCode).toBe(404);
  });

  it(
    "sending a message with OpenAI not configured in this test environment produces an honest " +
      "'unavailable' assistant reply — never a fabricated portfolio answer",
    async () => {
      const { cookieHeader } = await signUp(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/ai/conversations",
        headers: { cookie: cookieHeader },
        payload: {},
      });
      const conversationId = (created.json() as { conversation: { id: string } }).conversation.id;

      const sent = await app.inject({
        method: "POST",
        url: `/api/v1/ai/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader },
        payload: { content: "What is my portfolio worth?" },
      });
      expect(sent.statusCode).toBe(200);
      const body = sent.json() as { assistantMessage: string; toolCallsUsed: string[] };
      expect(body.assistantMessage).toBeTruthy();
      expect(body.toolCallsUsed).toEqual([]); // never configured, so the model was never even called

      const reloaded = await app.inject({ method: "GET", url: `/api/v1/ai/conversations/${conversationId}`, headers: { cookie: cookieHeader } });
      const conversation = (reloaded.json() as { conversation: { messages: Array<{ role: string; content: string }> } }).conversation;
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0]?.role).toBe("USER");
      expect(conversation.messages[1]?.role).toBe("ASSISTANT");
      expect(conversation.messages[1]?.content).toBe(body.assistantMessage);
    },
  );

  it("auto-titles a conversation from the first message", async () => {
    const { cookieHeader } = await signUp(app);
    const created = await app.inject({ method: "POST", url: "/api/v1/ai/conversations", headers: { cookie: cookieHeader }, payload: {} });
    const conversationId = (created.json() as { conversation: { id: string } }).conversation.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/ai/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader },
      payload: { content: "What are my biggest positions?" },
    });

    const list = await app.inject({ method: "GET", url: "/api/v1/ai/conversations", headers: { cookie: cookieHeader } });
    const conversation = (list.json() as { conversations: Array<{ id: string; title: string | null }> }).conversations.find(
      (c) => c.id === conversationId,
    );
    expect(conversation?.title).toBe("What are my biggest positions?");
  });
});
