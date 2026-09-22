import type { LiveData, LiveDataStatus } from "@pcc/shared";
import { unavailable } from "@pcc/shared";
import { GatewayHttpClient, type IbkrHttpClient } from "./client.js";
import { classifyIbkrError, IbkrError } from "./errors.js";
import {
	IbkrSessionManager,
	type IbkrSessionState,
} from "./session-manager.js";
import type {
	IbkrAccountSummaryResponse,
	IbkrLedgerResponse,
	IbkrMarketDataSnapshot,
	IbkrPortfolioAccount,
	IbkrPosition,
} from "./types.js";

const ACCOUNT_CACHE_TTL_MS = 15_000;
const QUOTE_CACHE_TTL_MS = 10_000;
const MARKET_DATA_FIELDS = "31,84,86,82,83,87";
const MAX_POSITION_PAGES = 20; // hard cap against a runaway pagination loop

export interface PortfolioBundle {
	summary: IbkrAccountSummaryResponse;
	ledger: IbkrLedgerResponse | null;
	positions: IbkrPosition[];
	fetchedAt: Date;
}

interface CachedQuote {
	raw: IbkrMarketDataSnapshot;
	fetchedAt: Date;
}

export interface QuoteResult {
	raw: IbkrMarketDataSnapshot | null;
	status: LiveDataStatus;
	timestamp: string | null;
	reason?: string;
}

/**
 * Owns everything IBKR-shaped: the session, account discovery, and cached
 * retrieval of portfolio bundles and market-data snapshots. Returns raw
 * IBKR types (or LiveData-wrapped raw bundles) — mapping into shared
 * (@pcc/shared) types happens one layer up, in ibkr-portfolio-data-source.ts,
 * so this class has no knowledge of the app's public API shapes.
 */
export class IbkrConnectionManager {
	private readonly client: IbkrHttpClient | null;
	private readonly sessionManager: IbkrSessionManager;
	private accountsCache: { accounts: string[]; fetchedAt: Date } | null = null;
	private readonly bundleCache = new Map<string, PortfolioBundle>();
	private readonly quoteCache = new Map<number, CachedQuote>();
	private lastSuccessfulSyncAt: Date | null = null;
	private lastSuccessfulMarketDataAt: Date | null = null;

	/**
	 * `injectedClient` lets tests substitute a fake IbkrHttpClient without a
	 * real gateway; production code always omits it and gets a real
	 * GatewayHttpClient built from `gatewayBaseUrl`.
	 */
	constructor(gatewayBaseUrl: string | null, injectedClient?: IbkrHttpClient) {
		this.client = injectedClient ?? (gatewayBaseUrl ? new GatewayHttpClient(gatewayBaseUrl) : null);
		this.sessionManager = new IbkrSessionManager(this.client);
	}

	get configured(): boolean {
		return this.client !== null;
	}

	start(): void {
		this.sessionManager.start();
	}

	stop(): void {
		this.sessionManager.stop();
	}

	getSessionState(): IbkrSessionState {
		return this.sessionManager.getState();
	}

	getLastSuccessfulSyncAt(): Date | null {
		return this.lastSuccessfulSyncAt;
	}

	/** Forces a fresh session check — backs the "Test IBKR Connection" button. */
	async testConnection(): Promise<IbkrSessionState> {
		return this.sessionManager.refresh();
	}

	/** The exact shape the Settings → IBKR page and GET /integrations/ibkr/status render. */
	getDetailedStatus(): {
		gateway: "reachable" | "unreachable";
		brokerageSession: "connected" | "disconnected";
		authentication: "authenticated" | "unauthenticated";
		accountData: "available" | "unavailable";
		marketData: "available" | "unavailable";
		lastSuccessfulSync: string | null;
		lastError: string | null;
	} {
		const state = this.sessionManager.getState();
		return {
			gateway: state.gatewayReachable ? "reachable" : "unreachable",
			brokerageSession: state.connected ? "connected" : "disconnected",
			authentication: state.authenticated ? "authenticated" : "unauthenticated",
			accountData: this.lastSuccessfulSyncAt ? "available" : "unavailable",
			marketData: this.lastSuccessfulMarketDataAt ? "available" : "unavailable",
			lastSuccessfulSync: this.lastSuccessfulSyncAt?.toISOString() ?? null,
			lastError: state.lastError?.message ?? null,
		};
	}

	private async ensureAccountsInitialized(): Promise<string[]> {
		if (
			this.accountsCache &&
			Date.now() - this.accountsCache.fetchedAt.getTime() < ACCOUNT_CACHE_TTL_MS
		) {
			return this.accountsCache.accounts;
		}
		this.sessionManager.assertAuthenticated();
		if (!this.client) throw new IbkrError("gateway_unreachable");

		// /iserver/accounts must be called to initialize the session's account
		// context before /portfolio/* endpoints behave correctly — see
		// docs/IBKR_INTEGRATION.md §3.
		await this.client.get("/iserver/accounts");
		const portfolioAccounts = await this.client.get<IbkrPortfolioAccount[]>(
			"/portfolio/accounts",
		);
		const accounts = (portfolioAccounts ?? [])
			.map((a) => a.accountId)
			.filter(Boolean);
		this.accountsCache = { accounts, fetchedAt: new Date() };
		return accounts;
	}

	async listAccounts(): Promise<string[]> {
		return this.ensureAccountsInitialized();
	}

	private async fetchAllPositions(accountId: string): Promise<IbkrPosition[]> {
		if (!this.client) throw new IbkrError("gateway_unreachable");
		const all: IbkrPosition[] = [];
		for (let page = 0; page < MAX_POSITION_PAGES; page++) {
			const pageResults = await this.client.get<IbkrPosition[]>(
				`/portfolio/${accountId}/positions/${page}`,
			);
			if (!pageResults || pageResults.length === 0) break;
			all.push(...pageResults);
			if (pageResults.length < 100) break; // IBKR pages at 100; a short page is the last one
		}
		return all;
	}

	private async fetchBundle(accountId: string): Promise<PortfolioBundle> {
		if (!this.client) throw new IbkrError("gateway_unreachable");
		const [summary, ledger, positions] = await Promise.all([
			this.client.get<IbkrAccountSummaryResponse>(
				`/portfolio/${accountId}/summary`,
			),
			this.client
				.get<IbkrLedgerResponse>(`/portfolio/${accountId}/ledger`)
				.catch(() => null),
			this.fetchAllPositions(accountId),
		]);
		const bundle: PortfolioBundle = {
			summary,
			ledger,
			positions,
			fetchedAt: new Date(),
		};
		this.bundleCache.set(accountId, bundle);
		this.lastSuccessfulSyncAt = bundle.fetchedAt;
		return bundle;
	}

	/**
	 * Live/cached/unavailable per docs/IBKR_INTEGRATION.md §4: a fresh cache
	 * is reported live; a failed refresh falls back to the last known good
	 * bundle reported as cached (never silently relabeled live); no bundle at
	 * all is unavailable.
	 */
	async getPortfolioBundle(
		accountId: string,
	): Promise<LiveData<PortfolioBundle>> {
		const cached = this.bundleCache.get(accountId);
		const isFresh =
			cached && Date.now() - cached.fetchedAt.getTime() < ACCOUNT_CACHE_TTL_MS;
		if (isFresh && cached) {
			return {
				data: cached,
				meta: {
					source: "IBKR",
					status: "live",
					timestamp: cached.fetchedAt.toISOString(),
				},
			};
		}

		try {
			this.sessionManager.assertAuthenticated();
			const bundle = await this.fetchBundle(accountId);
			return {
				data: bundle,
				meta: {
					source: "IBKR",
					status: "live",
					timestamp: bundle.fetchedAt.toISOString(),
				},
			};
		} catch (err) {
			const classified = classifyIbkrError(err);
			if (cached) {
				return {
					data: cached,
					meta: {
						source: "IBKR",
						status: "cached",
						timestamp: cached.fetchedAt.toISOString(),
						reason: classified.message,
					},
				};
			}
			return unavailable("IBKR", classified.message);
		}
	}

	/**
	 * Batched market-data snapshot for a set of conids, same live/cached/
	 * unavailable semantics as getPortfolioBundle, applied per-conid so one
	 * missing quote doesn't take down the whole positions table.
	 */
	async getQuotes(conids: number[]): Promise<Map<number, QuoteResult>> {
		const results = new Map<number, QuoteResult>();
		if (conids.length === 0) return results;

		const now = Date.now();
		const stale = conids.filter((id) => {
			const cached = this.quoteCache.get(id);
			return !cached || now - cached.fetchedAt.getTime() >= QUOTE_CACHE_TTL_MS;
		});

		let refreshError: IbkrError | null = null;
		if (stale.length > 0) {
			try {
				this.sessionManager.assertAuthenticated();
				if (!this.client) throw new IbkrError("gateway_unreachable");
				const snapshots = await this.client.get<IbkrMarketDataSnapshot[]>(
					"/iserver/marketdata/snapshot",
					{
						conids: stale.join(","),
						fields: MARKET_DATA_FIELDS,
					},
				);
				const fetchedAt = new Date();
				for (const snapshot of snapshots ?? []) {
					if (snapshot.conid !== undefined)
						this.quoteCache.set(snapshot.conid, { raw: snapshot, fetchedAt });
				}
				this.lastSuccessfulMarketDataAt = fetchedAt;
			} catch (err) {
				refreshError = classifyIbkrError(err);
			}
		}

		for (const conid of conids) {
			const cached = this.quoteCache.get(conid);
			if (!cached) {
				results.set(conid, {
					raw: null,
					status: "unavailable",
					timestamp: null,
					reason:
						refreshError?.message ??
						"No market data received for this instrument yet.",
				});
				continue;
			}
			const isFresh = now - cached.fetchedAt.getTime() < QUOTE_CACHE_TTL_MS;
			results.set(conid, {
				raw: cached.raw,
				status: isFresh ? "live" : "cached",
				timestamp: cached.fetchedAt.toISOString(),
				reason: isFresh ? undefined : refreshError?.message,
			});
		}
		return results;
	}
}
