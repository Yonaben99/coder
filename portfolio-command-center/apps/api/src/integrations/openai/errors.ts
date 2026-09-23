export type OpenAiErrorCode =
  | "not_configured"
  | "invalid_api_key"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "malformed_response"
  | "unknown_openai_error";

const SAFE_MESSAGES: Record<OpenAiErrorCode, string> = {
  not_configured: "Portfolio AI is not connected yet.",
  invalid_api_key: "OpenAI API key is invalid or was rejected.",
  rate_limited: "OpenAI rate-limited this request. Please try again shortly.",
  timeout: "OpenAI did not respond in time.",
  unavailable: "Portfolio AI is temporarily unavailable.",
  malformed_response: "Portfolio AI returned a response we couldn't understand.",
  unknown_openai_error: "An unexpected error occurred while contacting Portfolio AI.",
};

export class OpenAiError extends Error {
  readonly code: OpenAiErrorCode;
  readonly cause?: unknown;

  constructor(code: OpenAiErrorCode, cause?: unknown) {
    super(SAFE_MESSAGES[code]);
    this.name = "OpenAiError";
    this.code = code;
    this.cause = cause;
  }
}

interface OpenAiLikeError {
  status?: number;
  name?: string;
}

/**
 * Classifies an OpenAI SDK error (or any thrown value) into a safe
 * OpenAiError — mirrors apps/api/src/integrations/ibkr/errors.ts. Routes
 * and logs only ever see the classified code and safe message, never the
 * raw SDK error (which can include request/response details).
 */
export function classifyOpenAiError(error: unknown): OpenAiError {
  if (error instanceof OpenAiError) return error;

  const err = error as OpenAiLikeError;
  if (err?.name === "APIConnectionTimeoutError") return new OpenAiError("timeout", error);
  if (err?.name === "APIConnectionError") return new OpenAiError("unavailable", error);
  if (err?.status === 401 || err?.status === 403) return new OpenAiError("invalid_api_key", error);
  if (err?.status === 429) return new OpenAiError("rate_limited", error);
  if (typeof err?.status === "number" && err.status >= 500) return new OpenAiError("unavailable", error);

  return new OpenAiError("unknown_openai_error", error);
}
