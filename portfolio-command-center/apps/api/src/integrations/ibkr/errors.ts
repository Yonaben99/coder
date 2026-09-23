export type IbkrErrorCode =
	| "gateway_unreachable"
	| "timeout"
	| "authentication_required"
	| "session_expired"
	| "account_unavailable"
	| "market_data_permission_missing"
	| "rate_limited"
	| "unknown_ibkr_error";

const SAFE_MESSAGES: Record<IbkrErrorCode, string> = {
	gateway_unreachable: "IBKR gateway is unreachable.",
	timeout: "IBKR gateway did not respond in time.",
	authentication_required: "IBKR brokerage session is not authenticated.",
	session_expired: "IBKR brokerage session has expired.",
	account_unavailable:
		"The requested IBKR account is not available in this session.",
	market_data_permission_missing:
		"Market data subscription/permission is required for this instrument.",
	rate_limited: "IBKR gateway rate-limited this request.",
	unknown_ibkr_error: "An unexpected error occurred while contacting IBKR.",
};

export class IbkrError extends Error {
	readonly code: IbkrErrorCode;
	readonly cause?: unknown;

	constructor(code: IbkrErrorCode, cause?: unknown) {
		super(SAFE_MESSAGES[code]);
		this.name = "IbkrError";
		this.code = code;
		this.cause = cause;
	}
}

interface NodeSystemError {
	code?: string;
}

interface HttpLikeError {
	statusCode?: number;
	status?: number;
	body?: unknown;
}

/**
 * Turns a raw failure (network error, non-2xx HTTP response, or an
 * IBKR-shaped error body) into a classified IbkrError with a safe message.
 * Never forwards the raw error to a caller outside this module — routes
 * only ever see IbkrError.code and IbkrError.message.
 */
export function classifyIbkrError(error: unknown): IbkrError {
	if (error instanceof IbkrError) return error;

	const systemCode = (error as NodeSystemError)?.code;
	if (
		systemCode === "ECONNREFUSED" ||
		systemCode === "ENOTFOUND" ||
		systemCode === "EHOSTUNREACH"
	) {
		return new IbkrError("gateway_unreachable", error);
	}
	if (systemCode === "ETIMEDOUT" || systemCode === "UND_ERR_CONNECT_TIMEOUT") {
		return new IbkrError("timeout", error);
	}

	const httpError = error as HttpLikeError;
	const status = httpError?.statusCode ?? httpError?.status;
	if (status === 401 || status === 403) {
		return new IbkrError("authentication_required", error);
	}
	if (status === 404) {
		return new IbkrError("account_unavailable", error);
	}
	if (status === 429) {
		return new IbkrError("rate_limited", error);
	}
	if (typeof status === "number" && status >= 500) {
		return new IbkrError("unknown_ibkr_error", error);
	}

	return new IbkrError("unknown_ibkr_error", error);
}
