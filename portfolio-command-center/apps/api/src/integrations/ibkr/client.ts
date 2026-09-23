import https from "node:https";
import { URL } from "node:url";
import { classifyIbkrError } from "./errors.js";

export interface IbkrHttpClient {
	get<T>(path: string, query?: Record<string, string>): Promise<T>;
	post<T>(path: string, body?: unknown): Promise<T>;
}

interface HttpError extends Error {
	statusCode: number;
	body: unknown;
}

function makeHttpError(statusCode: number, body: unknown): HttpError {
	const error = new Error(
		`IBKR gateway responded with status ${statusCode}`,
	) as HttpError;
	error.statusCode = statusCode;
	error.body = body;
	return error;
}

/**
 * The CP Gateway serves HTTPS on localhost with a self-signed certificate
 * by default — this is IBKR's own documented local setup, not a general
 * insecure practice, so TLS verification is disabled only for this specific
 * client and only ever used against the operator-configured gateway URL.
 * See docs/IBKR_INTEGRATION.md §1.
 */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

export class GatewayHttpClient implements IbkrHttpClient {
	constructor(
		private readonly baseUrl: string,
		private readonly timeoutMs = 10_000,
	) {}

	async get<T>(path: string, query?: Record<string, string>): Promise<T> {
		const url = new URL(path, this.baseUrl);
		if (query) {
			for (const [key, value] of Object.entries(query))
				url.searchParams.set(key, value);
		}
		return this.request<T>("GET", url);
	}

	async post<T>(path: string, body?: unknown): Promise<T> {
		const url = new URL(path, this.baseUrl);
		return this.request<T>("POST", url, body);
	}

	private request<T>(method: string, url: URL, body?: unknown): Promise<T> {
		return new Promise((resolve, reject) => {
			const payload = body !== undefined ? JSON.stringify(body) : undefined;
			const req = https.request(
				url,
				{
					method,
					agent: insecureAgent,
					timeout: this.timeoutMs,
					headers: {
						Accept: "application/json",
						...(payload
							? {
									"Content-Type": "application/json",
									"Content-Length": Buffer.byteLength(payload),
								}
							: {}),
					},
				},
				(res) => {
					const chunks: Buffer[] = [];
					res.on("data", (chunk: Buffer) => chunks.push(chunk));
					res.on("end", () => {
						const text = Buffer.concat(chunks).toString("utf8");
						const status = res.statusCode ?? 0;
						let parsed: unknown = undefined;
						try {
							parsed = text ? JSON.parse(text) : undefined;
						} catch {
							parsed = text;
						}
						if (status >= 200 && status < 300) {
							resolve(parsed as T);
						} else {
							reject(classifyIbkrError(makeHttpError(status, parsed)));
						}
					});
				},
			);

			req.on("timeout", () => {
				req.destroy();
				reject(
					classifyIbkrError(
						Object.assign(new Error("IBKR gateway request timed out"), {
							code: "ETIMEDOUT",
						}),
					),
				);
			});
			req.on("error", (err) => reject(classifyIbkrError(err)));

			if (payload) req.write(payload);
			req.end();
		});
	}
}
