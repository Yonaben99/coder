import { classifyEarningsError } from "./errors.js";

export interface EarningsHttpClient {
  get<T>(path: string, query: Record<string, string>): Promise<T>;
}

interface HttpError extends Error {
  statusCode: number;
}

function makeHttpError(statusCode: number): HttpError {
  const error = new Error(`Earnings data provider responded with status ${statusCode}`) as HttpError;
  error.statusCode = statusCode;
  return error;
}

const REQUEST_TIMEOUT_MS = 8_000;

/** Thin client for Finnhub's REST API — same vendor/key as analyst and news, kept self-contained per this codebase's per-integration-module convention. */
export class FinnhubHttpClient implements EarningsHttpClient {
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
        throw classifyEarningsError(makeHttpError(response.status));
      }
      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw classifyEarningsError(Object.assign(new Error("Earnings data provider request timed out"), { code: "ETIMEDOUT" }));
      }
      throw classifyEarningsError(err);
    } finally {
      clearTimeout(timeout);
    }
  }
}
