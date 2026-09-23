import type { IbkrMarketDataSnapshot } from "./types.js";

export interface MappedQuote {
	price: number | null;
	bid: number | null;
	ask: number | null;
	change: number | null;
	changePercent: number | null;
	volume: number | null;
}

function num(value: string | undefined): number | null {
	if (value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/**
 * IBKR's snapshot fields are strings, sometimes prefixed with a status
 * character (e.g. "C" for closed, "H" for halted) that isn't part of the
 * numeric value — strip any leading non-numeric characters defensively.
 */
function numField(value: string | undefined): number | null {
	if (value === undefined) return null;
	const cleaned = value.replace(/^[^0-9+-]+/, "");
	if (cleaned === "" || cleaned === "+" || cleaned === "-") return null;
	return num(cleaned);
}

export function mapMarketDataSnapshot(
	raw: IbkrMarketDataSnapshot,
): MappedQuote {
	return {
		price: numField(raw["31"]),
		bid: numField(raw["84"]),
		ask: numField(raw["86"]),
		change: numField(raw["82"]),
		changePercent: numField(raw["83"]),
		volume: numField(raw["87"]),
	};
}
