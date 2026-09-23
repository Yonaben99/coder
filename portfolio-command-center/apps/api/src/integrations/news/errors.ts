export type NewsErrorCode =
  | "not_configured"
  | "invalid_api_key"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "malformed_response"
  | "unknown_news_error";

const SAFE_MESSAGES: Record<NewsErrorCode, string> = {
  not_configured: "News integration is not connected yet.",
  invalid_api_key: "News provider API key is invalid or was rejected.",
  rate_limited: "News provider rate-limited this request. Please try again shortly.",
  timeout: "News provider did not respond in time.",
  unavailable: "News provider is temporarily unavailable.",
  malformed_response: "News provider returned a response we couldn't understand.",
  unknown_news_error: "An unexpected error occurred while contacting the news provider.",
};

export class NewsError extends Error {
  readonly code: NewsErrorCode;
  readonly cause?: unknown;

  constructor(code: NewsErrorCode, cause?: unknown) {
    super(SAFE_MESSAGES[code]);
    this.name = "NewsError";
    this.code = code;
    this.cause = cause;
  }
}

interface HttpLikeError {
  statusCode?: number;
  status?: number;
}

interface NodeSystemError {
  code?: string;
}

/** Mirrors apps/api/src/integrations/ibkr/errors.ts and .../openai/errors.ts. */
export function classifyNewsError(error: unknown): NewsError {
  if (error instanceof NewsError) return error;

  const systemCode = (error as NodeSystemError)?.code;
  if (systemCode === "ECONNREFUSED" || systemCode === "ENOTFOUND" || systemCode === "EHOSTUNREACH") {
    return new NewsError("unavailable", error);
  }
  if (systemCode === "ETIMEDOUT" || systemCode === "UND_ERR_CONNECT_TIMEOUT") {
    return new NewsError("timeout", error);
  }

  const httpError = error as HttpLikeError;
  const status = httpError?.statusCode ?? httpError?.status;
  if (status === 401 || status === 403) return new NewsError("invalid_api_key", error);
  if (status === 429) return new NewsError("rate_limited", error);
  if (typeof status === "number" && status >= 500) return new NewsError("unavailable", error);

  return new NewsError("unknown_news_error", error);
}
