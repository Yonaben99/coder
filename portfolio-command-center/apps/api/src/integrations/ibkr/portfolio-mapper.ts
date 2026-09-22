import type { AccountSummary, Position } from "@pcc/shared";
import type {
	IbkrAccountSummaryResponse,
	IbkrLedgerResponse,
	IbkrPosition,
} from "./types.js";

function num(value: number | string | undefined | null): number | null {
	if (value === undefined || value === null) return null;
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

/**
 * Reads a /portfolio/{accountId}/summary field defensively — see
 * docs/IBKR_INTEGRATION.md §8 on why exact field names weren't verifiable
 * against a live session from this sandbox.
 */
function summaryAmount(
	summary: IbkrAccountSummaryResponse,
	...keys: string[]
): number | null {
	for (const key of keys) {
		const field = summary[key];
		if (field && field.amount !== undefined) return num(field.amount);
	}
	return null;
}

export interface MappedAccountSummary extends AccountSummary {
	/** Not part of the public AccountSummary shape; used internally to compute position weights. */
	_grossPositionValue: number | null;
}

/**
 * Maps IBKR's /summary (and /ledger as a fallback) into AccountSummary.
 * realizedPnl/unrealizedPnl are aggregated from positions rather than a
 * single account-level field (documented in IBKR_INTEGRATION.md §7 — no
 * single field was reliably present across account types in what could be
 * verified here). dailyPnl is left null: it requires IBKR's PnL
 * subscription/streaming endpoint, out of scope for Phase 2 (read-only,
 * no WebSocket streaming — see IBKR_INTEGRATION.md §4).
 */
export function mapAccountSummary(
	summary: IbkrAccountSummaryResponse,
	ledger: IbkrLedgerResponse | null,
	positions: IbkrPosition[],
): MappedAccountSummary {
	const base = ledger?.BASE;
	const netLiquidation =
		summaryAmount(summary, "netliquidation") ?? num(base?.netliquidationvalue);
	const cash =
		summaryAmount(summary, "totalcashvalue", "cashbalance") ??
		num(base?.cashbalance);
	const buyingPower = summaryAmount(summary, "buyingpower");
	const excessLiquidity = summaryAmount(summary, "excessliquidity");
	const initMargin = summaryAmount(summary, "initmarginreq");
	const maintMargin = summaryAmount(summary, "maintmarginreq");
	const grossPositionValue = summaryAmount(summary, "grosspositionvalue");

	const positionPnls = positions.map((p) => num(p.unrealizedPnl));
	const unrealizedPnl = positionPnls.every((v) => v !== null)
		? positionPnls.reduce((sum, v) => sum + (v ?? 0), 0)
		: null;

	const realizedPnls = positions.map((p) => num(p.realizedPnl));
	const realizedPnl = realizedPnls.every((v) => v !== null)
		? realizedPnls.reduce((sum, v) => sum + (v ?? 0), 0)
		: null;

	const leverage =
		grossPositionValue !== null && netLiquidation
			? grossPositionValue / netLiquidation
			: null;

	return {
		netLiquidation,
		dailyPnl: null,
		ytdPnl: null,
		cash,
		buyingPower,
		excessLiquidity,
		margin: maintMargin ?? initMargin,
		leverage,
		realizedPnl,
		unrealizedPnl,
		_grossPositionValue: grossPositionValue,
	};
}

/**
 * Maps a single IBKR position. `weight` is left null here — it's filled in
 * by the caller once the account's netLiquidation is known (weight_i =
 * position_i.marketValue / account.netLiquidation, see
 * docs/IBKR_INTEGRATION.md §7). `unrealizedPnlPercent` is computed here
 * since IBKR doesn't return it directly: unrealizedPnl / (avgCost * shares) * 100.
 */
export function mapPosition(
	raw: IbkrPosition,
	quotePrice: number | null,
	quoteChangePercent: number | null,
): Position {
	const shares = raw.position;
	const averageCost = num(raw.avgCost) ?? num(raw.avgPrice);
	const currentPrice = quotePrice ?? num(raw.mktPrice);
	const marketValue = num(raw.mktValue);
	const unrealizedPnl = num(raw.unrealizedPnl);

	const costBasis = averageCost !== null ? averageCost * shares : null;
	const unrealizedPnlPercent =
		unrealizedPnl !== null && costBasis !== null && costBasis !== 0
			? (unrealizedPnl / Math.abs(costBasis)) * 100
			: null;

	return {
		symbol: raw.ticker ?? raw.contractDesc?.split(" ")[0] ?? String(raw.conid),
		shares,
		averageCost,
		currentPrice,
		marketValue,
		unrealizedPnl,
		unrealizedPnlPercent,
		weight: null,
		dailyChangePercent: quoteChangePercent,
		contractId: raw.conid ?? null,
		description: raw.contractDesc ?? null,
		currency: raw.currency ?? null,
		assetClass: raw.assetClass ?? null,
		sector: raw.sector ?? null,
		country: raw.countryCode ?? null,
		realizedPnl: num(raw.realizedPnl),
		dailyPnl: null,
	};
}

export function applyPositionWeights(
	positions: Position[],
	netLiquidation: number | null,
): Position[] {
	if (!netLiquidation) return positions;
	return positions.map((p) => ({
		...p,
		weight:
			p.marketValue !== null ? (p.marketValue / netLiquidation) * 100 : null,
	}));
}
