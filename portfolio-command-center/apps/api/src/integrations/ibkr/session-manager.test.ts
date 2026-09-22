import { describe, expect, it, vi } from "vitest";
import type { IbkrHttpClient } from "./client.js";
import { IbkrError } from "./errors.js";
import { IbkrSessionManager } from "./session-manager.js";

class FakeClient implements IbkrHttpClient {
  // vi.fn()'s generic inference doesn't preserve IbkrHttpClient's own <T>
  // generic parameter cleanly, so the mock is built untyped and cast once.
  get = vi.fn() as unknown as IbkrHttpClient["get"] & ReturnType<typeof vi.fn>;
  post = vi.fn() as unknown as IbkrHttpClient["post"] & ReturnType<typeof vi.fn>;
}

describe("IbkrSessionManager — not configured", () => {
  it("reports configured:false and refuses to authenticate without ever making a request", () => {
    const manager = new IbkrSessionManager(null);
    expect(manager.configured).toBe(false);
    expect(manager.getState()).toMatchObject({ configured: false, gatewayReachable: false, authenticated: false });
    expect(() => manager.assertAuthenticated()).toThrow(IbkrError);
  });
});

describe("IbkrSessionManager — configured", () => {
  it("reflects an authenticated session after a successful tick", async () => {
    const client = new FakeClient();
    client.get.mockResolvedValue(undefined);
    client.post.mockResolvedValue({ connected: true, authenticated: true });

    const manager = new IbkrSessionManager(client);
    await manager.tick();

    const state = manager.getState();
    expect(state.gatewayReachable).toBe(true);
    expect(state.connected).toBe(true);
    expect(state.authenticated).toBe(true);
    expect(state.lastSuccessfulAuthAt).not.toBeNull();
    expect(() => manager.assertAuthenticated()).not.toThrow();
  });

  it("reports authentication_required when the gateway is reachable but never authenticated", async () => {
    const client = new FakeClient();
    client.get.mockResolvedValue(undefined);
    client.post.mockResolvedValue({ connected: true, authenticated: false });

    const manager = new IbkrSessionManager(client);
    await manager.tick();

    expect(() => manager.assertAuthenticated()).toThrow(expect.objectContaining({ code: "authentication_required" }));
  });

  it("classifies a connection failure as gateway_unreachable and does not crash", async () => {
    const client = new FakeClient();
    client.get.mockRejectedValue(Object.assign(new Error("refused"), { code: "ECONNREFUSED" }));

    const manager = new IbkrSessionManager(client);
    await manager.tick();

    const state = manager.getState();
    expect(state.gatewayReachable).toBe(false);
    expect(state.lastError?.code).toBe("gateway_unreachable");
  });

  it("reports session_expired (not authentication_required) once a session that was authenticated drops", async () => {
    const client = new FakeClient();
    client.get.mockResolvedValue(undefined);
    client.post.mockResolvedValueOnce({ connected: true, authenticated: true });

    const manager = new IbkrSessionManager(client);
    await manager.tick(); // becomes authenticated

    client.get.mockRejectedValueOnce(Object.assign(new Error("refused"), { code: "ECONNREFUSED" }));
    await manager.tick(); // drops

    expect(() => manager.assertAuthenticated()).toThrow(expect.objectContaining({ code: "session_expired" }));
  });

  it("calls the onAuthTransition callback exactly on authenticated-state changes", async () => {
    const client = new FakeClient();
    client.get.mockResolvedValue(undefined);
    const onTransition = vi.fn();
    const manager = new IbkrSessionManager(client, onTransition);

    client.post.mockResolvedValueOnce({ connected: true, authenticated: true });
    await manager.tick();
    expect(onTransition).toHaveBeenCalledWith(false, true);

    client.post.mockResolvedValueOnce({ connected: true, authenticated: true });
    await manager.tick();
    expect(onTransition).toHaveBeenCalledTimes(1); // no change, no second call
  });
});
