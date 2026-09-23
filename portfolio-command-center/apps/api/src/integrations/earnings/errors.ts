export type EarningsErrorCode =
  | "not_configured"
  | "invalid_api_key"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "malformed_response"
  | "unknown_earnings_error";

const SAFE_MESSAGES: Record<EarningsErrorCode, string> = {
  not_configured: "Earnings data integration is not connected yet.",
  invalid_api_key: "Earnings data provider API key is invalid or was rejected.",
  rate_limited: "Earnings data provider rate-limited this request. Please try again shortly.",
  timeout: "Earnings data provider did not respond in time.",
  unavailable: "Earnings data provider is temporarily unavailable.",
  malformed_response: "Earnings data provider returned a response we couldn't understand.",
  unknown_earnings_error: "An unexpected error occurred while contacting the earnings data provider.",
};

export class EarningsError extends Error {
  readonly code: EarningsErrorCode;
  readonly cause?: unknown;

  constructor(code: EarningsErrorCode, cause?: unknown) {
    super(SAFE_MESSAGES[code]);
    this.name = "EarningsError";
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

/** Mirrors apps/api/src/integrations/analyst/errors.ts and news/errors.ts. */
export function classifyEarningsError(error: unknown): EarningsError {
  if (error instanceof EarningsError) return error;

  const systemCode = (error as NodeSystemError)?.code;
  if (systemCode === "ECONNREFUSED" || systemCode === "ENOTFOUND" || systemCode === "EHOSTUNREACH") {
    return new EarningsError("unavailable", error);
  }
  if (systemCode === "ETIMEDOUT" || systemCode === "UND_ERR_CONNECT_TIMEOUT") {
    return new EarningsError("timeout", error);
  }

  const httpError = error as HttpLikeError;
  const status = httpError?.statusCode ?? httpError?.status;
  if (status === 401 || status === 403) return new EarningsError("invalid_api_key", error);
  if (status === 429) return new EarningsError("rate_limited", error);
  if (typeof status === "number" && status >= 500) return new EarningsError("unavailable", error);

  return new EarningsError("unknown_earnings_error", error);
}
