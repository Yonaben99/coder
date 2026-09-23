import type {
	AccountSummary,
	LiveData,
	PortfolioAllocation,
	Position,
} from "@pcc/shared";
import { unavailable } from "@pcc/shared";
import type { PrismaClient } from "@pcc/db";
import type { PortfolioDataSource } from "../../domain/data-sources/index.js";
import type { IbkrConnectionManager } from "./connection-manager.js";
import { classifyIbkrError } from "./errors.js";
import { mapMarketDataSnapshot } from "./market-data.js";
import {
	applyPositionWeights,
	mapAccountSummary,
	mapPosition,
} from "./portfolio-mapper.js";

export interface MaskedAccount {
	accountId: string;
	masked: string;
}

function maskAccountId(accountId: string): string {
	if (accountId.length <= 4) return accountId;
	return `${"*".repeat(accountId.length - 4)}${accountId.slice(-4)}`;
}

/**
 * Real, read-only PortfolioDataSource backed by IBKR's Client Portal
 * Gateway. Everything IBKR-protocol-specific lives in IbkrConnectionManager
 * and the mapper modules; this class only resolves "which account" and
 * assembles the shared (@pcc/shared) response shapes the rest of the app
 * depends on. Swapping this for a future auth mechanism (see
 * ARCHITECTURE.md §5) means writing a new class implementing
 * PortfolioDataSource — routes, the frontend, and (later) the AI tools
 * never reference IBKR directly.
 */
export class IbkrPortfolioDataSource implements PortfolioDataSource {
	constructor(
		private readonly connectionManager: IbkrConnectionManager,
		private readonly prisma: PrismaClient,
	) {}

	private async resolveAccountId(userId: string): Promise<{
		accountId: string | null;
		accounts: string[];
		reason?: string;
	}> {
		if (!this.connectionManager.configured) {
			return {
				accountId: null,
				accounts: [],
				reason:
					"IBKR is not connected yet. Connect it in Settings → Connections.",
			};
		}
		try {
			const accounts = await this.connectionManager.listAccounts();
			if (accounts.length === 0) {
				return {
					accountId: null,
					accounts,
					reason: "No IBKR accounts are visible to this brokerage session.",
				};
			}

			const existing = await this.prisma.iBKRConnection.findUnique({
				where: { userId },
			});
			let selected = existing?.selectedAccountId ?? null;
			if (!selected || !accounts.includes(selected)) {
				selected = accounts[0] ?? null;
				if (selected) {
					await this.prisma.iBKRConnection.upsert({
						where: { userId },
						create: {
							userId,
							selectedAccountId: selected,
							status: "AUTHENTICATED",
						},
						update: { selectedAccountId: selected, status: "AUTHENTICATED" },
					});
				}
			}
			return { accountId: selected, accounts };
		} catch (err) {
			return {
				accountId: null,
				accounts: [],
				reason: classifyIbkrError(err).message,
			};
		}
	}

	async listAccountsForUser(userId: string): Promise<{
		accounts: MaskedAccount[];
		selectedAccountId: string | null;
		reason?: string;
	}> {
		const { accountId, accounts, reason } = await this.resolveAccountId(userId);
		return {
			accounts: accounts.map((id) => ({
				accountId: id,
				masked: maskAccountId(id),
			})),
			selectedAccountId: accountId,
			reason,
		};
	}

	async selectAccount(
		userId: string,
		accountId: string,
	): Promise<{ ok: boolean; reason?: string }> {
		const { accounts } = await this.resolveAccountId(userId);
		if (!accounts.includes(accountId)) {
			return {
				ok: false,
				reason: "That account is not available in the current IBKR session.",
			};
		}
		await this.prisma.iBKRConnection.upsert({
			where: { userId },
			create: { userId, selectedAccountId: accountId, status: "AUTHENTICATED" },
			update: { selectedAccountId: accountId },
		});
		return { ok: true };
	}

	private async getEnrichedPositions(
		userId: string,
	): Promise<
		LiveData<{ positions: Position[]; netLiquidation: number | null }>
	> {
		const { accountId, reason } = await this.resolveAccountId(userId);
		if (!accountId)
			return unavailable("IBKR", reason ?? "No IBKR account available.");

		const bundleResult =
			await this.connectionManager.getPortfolioBundle(accountId);
		if (!bundleResult.data) return { data: null, meta: bundleResult.meta };

		const { summary, ledger, positions: rawPositions } = bundleResult.data;
		const conids = rawPositions
			.map((p) => p.conid)
			.filter((id): id is number => typeof id === "number");
		const quotes = await this.connectionManager.getQuotes(conids);

		const positions = rawPositions.map((raw) => {
			const quote = quotes.get(raw.conid);
			const mappedQuote = quote?.raw ? mapMarketDataSnapshot(quote.raw) : null;
			return mapPosition(
				raw,
				mappedQuote?.price ?? null,
				mappedQuote?.changePercent ?? null,
			);
		});

		const accountSummary = mapAccountSummary(summary, ledger, rawPositions);
		const weighted = applyPositionWeights(
			positions,
			accountSummary.netLiquidation,
		);

		return {
			data: {
				positions: weighted,
				netLiquidation: accountSummary.netLiquidation,
			},
			meta: bundleResult.meta,
		};
	}

	async getAccountSummary(userId: string): Promise<LiveData<AccountSummary>> {
		const { accountId, reason } = await this.resolveAccountId(userId);
		if (!accountId)
			return unavailable("IBKR", reason ?? "No IBKR account available.");

		const bundleResult =
			await this.connectionManager.getPortfolioBundle(accountId);
		if (!bundleResult.data) return { data: null, meta: bundleResult.meta };

		const { _grossPositionValue: _unused, ...summary } = mapAccountSummary(
			bundleResult.data.summary,
			bundleResult.data.ledger,
			bundleResult.data.positions,
		);
		return { data: summary, meta: bundleResult.meta };
	}

	async getPositions(userId: string): Promise<LiveData<Position[]>> {
		const result = await this.getEnrichedPositions(userId);
		if (!result.data) return { data: null, meta: result.meta };
		return { data: result.data.positions, meta: result.meta };
	}

	async getAllocation(userId: string): Promise<LiveData<PortfolioAllocation>> {
		const result = await this.getEnrichedPositions(userId);
		if (!result.data) return { data: null, meta: result.meta };

		const bySector = groupByWeight(
			result.data.positions,
			(p) => p.sector ?? "Unclassified",
		);
		const byAssetClass = groupByWeight(
			result.data.positions,
			(p) => p.assetClass ?? "Unclassified",
		);
		return { data: { bySector, byAssetClass }, meta: result.meta };
	}

	async getPerformance(): Promise<LiveData<unknown>> {
		// Honest per docs/IBKR_INTEGRATION.md §7: no snapshot history exists
		// yet to compute performance from — not backed by any IBKR call.
		return unavailable(
			"IBKR",
			"Performance history requires portfolio snapshot history, which is not implemented yet (a later phase).",
		);
	}
}

function groupByWeight(
	positions: Position[],
	keyFn: (p: Position) => string,
): { label: string; weight: number }[] {
	const totals = new Map<string, number>();
	for (const position of positions) {
		if (position.weight === null) continue;
		const key = keyFn(position);
		totals.set(key, (totals.get(key) ?? 0) + position.weight);
	}
	return [...totals.entries()]
		.map(([label, weight]) => ({ label, weight }))
		.sort((a, b) => b.weight - a.weight);
}
