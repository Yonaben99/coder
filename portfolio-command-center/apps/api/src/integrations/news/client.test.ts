import { afterEach, describe, expect, it, vi } from "vitest";
import { FinnhubHttpClient } from "./client.js";

describe("FinnhubHttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the API key in the X-Finnhub-Token header and builds the query string", async () => {
    let capturedUrl: string | null = null;
    let capturedHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers as Record<string, string> | undefined;
        return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
      }),
    );

    const client = new FinnhubHttpClient("secret-key");
    const result = await client.get<Array<{ id: number }>>("company-news", { symbol: "WDC", from: "2026-01-01", to: "2026-01-08" });

    expect(result).toEqual([{ id: 1 }]);
    expect(capturedUrl).toContain("symbol=WDC");
    expect(capturedUrl).toContain("from=2026-01-01");
    expect(capturedHeaders?.["X-Finnhub-Token"]).toBe("secret-key");
  });

  it("throws a classified error for a non-2xx response, without leaking the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid API key" }), { status: 401 })),
    );

    const client = new FinnhubHttpClient("bad-key");
    await expect(client.get("news", { category: "general" })).rejects.toMatchObject({ code: "invalid_api_key" });
  });

  it("classifies a rate-limit response as rate_limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 429 })),
    );
    const client = new FinnhubHttpClient("key");
    await expect(client.get("news", { category: "general" })).rejects.toMatchObject({ code: "rate_limited" });
  });
});
