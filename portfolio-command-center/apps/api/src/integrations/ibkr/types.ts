/**
 * Raw shapes as returned by the IBKR Client Portal Gateway REST API.
 * Field presence is treated defensively throughout the mapper — see
 * docs/IBKR_INTEGRATION.md §8 for why these are not guaranteed
 * byte-for-byte verified against a live session.
 */

export interface IbkrAuthStatusResponse {
	authenticated: boolean;
	connected: boolean;
	competing?: boolean;
	message?: string;
	MAC?: string;
}

export interface IbkrAccountsResponse {
	accounts?: string[];
	selectedAccount?: string;
}

export interface IbkrPortfolioAccount {
	accountId: string;
	accountVan?: string;
	accountTitle?: string;
	displayName?: string;
	type?: string;
	currency?: string;
}

/** A single keyed metric as returned by /portfolio/{accountId}/summary. */
export interface IbkrSummaryField {
	amount?: number;
	currency?: string;
	value?: string | number;
	timestamp?: number;
	severity?: number;
}

export type IbkrAccountSummaryResponse = Record<
	string,
	IbkrSummaryField | undefined
>;

/** A single currency's row from /portfolio/{accountId}/ledger. */
export interface IbkrLedgerEntry {
	cashbalance?: number;
	netliquidationvalue?: number;
	stockmarketvalue?: number;
	currency?: string;
	timestamp?: number;
}

export type IbkrLedgerResponse = Record<string, IbkrLedgerEntry | undefined>;

export interface IbkrPosition {
	conid: number;
	contractDesc?: string;
	position: number;
	mktPrice?: number;
	mktValue?: number;
	avgCost?: number;
	avgPrice?: number;
	currency?: string;
	unrealizedPnl?: number;
	realizedPnl?: number;
	assetClass?: string;
	sector?: string;
	listingExchange?: string;
	countryCode?: string;
	ticker?: string;
}

/**
 * /iserver/marketdata/snapshot returns one object per conid, keyed by
 * numeric field code as a string (see docs/IBKR_INTEGRATION.md §3).
 */
export interface IbkrMarketDataSnapshot {
	conid?: number;
	conidEx?: string;
	"31"?: string; // last price
	"84"?: string; // bid
	"86"?: string; // ask
	"82"?: string; // change
	"83"?: string; // change %
	"87"?: string; // volume
	"6509"?: string; // market data availability flags
}

export interface IbkrConfig {
	gatewayBaseUrl: string | null;
}
