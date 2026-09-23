import { classifyNewsError } from "./errors.js";

export interface NewsHttpClient {
  get<T>(path: string, query: Record<string, string>): Promise<T>;
}

interface HttpError extends Error {
  statusCode: number;
}

function makeHttpError(statusCode: number): HttpError {
  const error = new Error(`News provider responded with status ${statusCode}`) as HttpError;
  error.statusCode = statusCode;
  return error;
}

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Thin client for Finnhub's REST API — a plain public HTTPS API, unlike the
 * IBKR gateway, so no self-signed-cert handling is needed here (see
 * apps/api/src/integrations/ibkr/client.ts for why that one does).
 */
export class FinnhubHttpClient implements NewsHttpClient {
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
        throw classifyNewsError(makeHttpError(response.status));
      }
      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw classifyNewsError(Object.assign(new Error("News provider request timed out"), { code: "ETIMEDOUT" }));
      }
      throw classifyNewsError(err);
    } finally {
      clearTimeout(timeout);
    }
  }
}
