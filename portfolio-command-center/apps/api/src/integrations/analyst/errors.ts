export type AnalystErrorCode =
  | "not_configured"
  | "invalid_api_key"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "malformed_response"
  | "unknown_analyst_error";

const SAFE_MESSAGES: Record<AnalystErrorCode, string> = {
  not_configured: "Analyst data integration is not connected yet.",
  invalid_api_key: "Analyst data provider API key is invalid or was rejected.",
  rate_limited: "Analyst data provider rate-limited this request. Please try again shortly.",
  timeout: "Analyst data provider did not respond in time.",
  unavailable: "Analyst data provider is temporarily unavailable.",
  malformed_response: "Analyst data provider returned a response we couldn't understand.",
  unknown_analyst_error: "An unexpected error occurred while contacting the analyst data provider.",
};

export class AnalystError extends Error {
  readonly code: AnalystErrorCode;
  readonly cause?: unknown;

  constructor(code: AnalystErrorCode, cause?: unknown) {
    super(SAFE_MESSAGES[code]);
    this.name = "AnalystError";
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

/** Mirrors apps/api/src/integrations/news/errors.ts (and ibkr/openai's equivalents). */
export function classifyAnalystError(error: unknown): AnalystError {
  if (error instanceof AnalystError) return error;

  const systemCode = (error as NodeSystemError)?.code;
  if (systemCode === "ECONNREFUSED" || systemCode === "ENOTFOUND" || systemCode === "EHOSTUNREACH") {
    return new AnalystError("unavailable", error);
  }
  if (systemCode === "ETIMEDOUT" || systemCode === "UND_ERR_CONNECT_TIMEOUT") {
    return new AnalystError("timeout", error);
  }

  const httpError = error as HttpLikeError;
  const status = httpError?.statusCode ?? httpError?.status;
  if (status === 401 || status === 403) return new AnalystError("invalid_api_key", error);
  if (status === 429) return new AnalystError("rate_limited", error);
  if (typeof status === "number" && status >= 500) return new AnalystError("unavailable", error);

  return new AnalystError("unknown_analyst_error", error);
}
