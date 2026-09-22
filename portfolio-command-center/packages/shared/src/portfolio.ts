export interface AccountSummary {
	netLiquidation: number | null;
	dailyPnl: number | null;
	ytdPnl: number | null;
	cash: number | null;
	buyingPower: number | null;
	excessLiquidity: number | null;
	margin: number | null;
	leverage: number | null;
	realizedPnl: number | null;
	unrealizedPnl: number | null;
}

export interface Position {
	symbol: string;
	shares: number;
	averageCost: number | null;
	currentPrice: number | null;
	marketValue: number | null;
	unrealizedPnl: number | null;
	unrealizedPnlPercent: number | null;
	weight: number | null;
	dailyChangePercent: number | null;
	/** Broker's internal contract identifier (IBKR conid), where applicable. */
	contractId: number | null;
	description: string | null;
	currency: string | null;
	assetClass: string | null;
	sector: string | null;
	country: string | null;
	realizedPnl: number | null;
	/** Requires a PnL subscription/streaming endpoint not implemented in Phase 2 — always null for now. */
	dailyPnl: number | null;
}

export interface AllocationSlice {
	label: string;
	weight: number;
}

export interface PortfolioAllocation {
	bySector: AllocationSlice[];
	byAssetClass: AllocationSlice[];
}
