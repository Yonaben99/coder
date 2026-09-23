import { classifyAnalystError } from "./errors.js";

export interface AnalystHttpClient {
  get<T>(path: string, query: Record<string, string>): Promise<T>;
}

interface HttpError extends Error {
  statusCode: number;
}

function makeHttpError(statusCode: number): HttpError {
  const error = new Error(`Analyst data provider responded with status ${statusCode}`) as HttpError;
  error.statusCode = statusCode;
  return error;
}

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Thin client for Finnhub's REST API — same vendor and API key as the
 * Phase 4 news integration, but kept as its own file rather than a shared
 * import, matching this codebase's per-integration-module convention (see
 * apps/api/src/integrations/{ibkr,openai,news}/client.ts).
 */
export class FinnhubHttpClient implements AnalystHttpClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = "https://finnhub.io/api/v1",
  ) {}

  async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { "X-Finnhub-Token": this.apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw classifyAnalystError(makeHttpError(response.status));
      }
      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw classifyAnalystError(Object.assign(new Error("Analyst data provider request timed out"), { code: "ETIMEDOUT" }));
      }
      throw classifyAnalystError(err);
    } finally {
      clearTimeout(timeout);
    }
  }
}
