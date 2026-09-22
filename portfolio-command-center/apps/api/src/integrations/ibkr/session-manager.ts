import type { IbkrHttpClient } from "./client.js";
import { classifyIbkrError, IbkrError } from "./errors.js";
import type { IbkrAuthStatusResponse } from "./types.js";

const TICKLE_INTERVAL_MS = 60_000;

export interface IbkrSessionState {
	configured: boolean;
	gatewayReachable: boolean;
	connected: boolean;
	authenticated: boolean;
	lastCheckedAt: Date | null;
	lastSuccessfulAuthAt: Date | null;
	lastError: IbkrError | null;
}

/**
 * Owns the first three of the four states in docs/IBKR_INTEGRATION.md §2:
 * gateway reachable, brokerage session connected, brokerage session
 * authenticated. Runs the /tickle heartbeat IBKR requires to keep an
 * authenticated session alive, independent of whether anything is
 * currently reading data through it.
 */
export class IbkrSessionManager {
	private lastStatus: IbkrAuthStatusResponse | null = null;
	private lastCheckedAt: Date | null = null;
	private lastSuccessfulAuthAt: Date | null = null;
	private lastError: IbkrError | null = null;
	private timer: NodeJS.Timeout | null = null;
	private wasGatewayReachable = false;

	constructor(
		private readonly client: IbkrHttpClient | null,
		private readonly onAuthTransition?: (from: boolean, to: boolean) => void,
	) {}

	get configured(): boolean {
		return this.client !== null;
	}

	start(): void {
		if (!this.client || this.timer) return;
		void this.tick();
		this.timer = setInterval(() => void this.tick(), TICKLE_INTERVAL_MS);
		this.timer.unref?.();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	async tick(): Promise<void> {
		if (!this.client) return;
		const wasAuthenticated = this.lastStatus?.authenticated ?? false;
		try {
			await this.client.get("/tickle");
			const status = await this.client.post<IbkrAuthStatusResponse>(
				"/iserver/auth/status",
			);
			this.lastStatus = status;
			this.lastCheckedAt = new Date();
			this.lastError = null;
			this.wasGatewayReachable = true;
			if (status.authenticated) this.lastSuccessfulAuthAt = new Date();
			if (wasAuthenticated !== status.authenticated)
				this.onAuthTransition?.(wasAuthenticated, status.authenticated);
		} catch (err) {
			const classified = classifyIbkrError(err);
			this.lastError = classified;
			this.lastCheckedAt = new Date();
			if (
				classified.code !== "gateway_unreachable" &&
				classified.code !== "timeout"
			) {
				this.wasGatewayReachable = true;
			}
			if (wasAuthenticated) this.onAuthTransition?.(true, false);
			this.lastStatus = null;
		}
	}

	/** Forces a fresh check rather than waiting for the next tickle tick — used by the "Test connection" button. */
	async refresh(): Promise<IbkrSessionState> {
		await this.tick();
		return this.getState();
	}

	getState(): IbkrSessionState {
		return {
			configured: this.configured,
			gatewayReachable: this.wasGatewayReachable,
			connected: this.lastStatus?.connected ?? false,
			authenticated: this.lastStatus?.authenticated ?? false,
			lastCheckedAt: this.lastCheckedAt,
			lastSuccessfulAuthAt: this.lastSuccessfulAuthAt,
			lastError: this.lastError,
		};
	}

	/** Throws a classified IbkrError if the session isn't currently authenticated. */
	assertAuthenticated(): void {
		const state = this.getState();
		if (!state.configured) throw new IbkrError("gateway_unreachable");
		if (!state.gatewayReachable)
			throw state.lastError ?? new IbkrError("gateway_unreachable");
		if (!state.authenticated) {
			throw new IbkrError(
				state.lastSuccessfulAuthAt
					? "session_expired"
					: "authentication_required",
			);
		}
	}
}
