import type { AIToolDefinition } from "../../domain/data-sources/ai-provider.js";

const NO_PARAMS = { type: "object", properties: {}, additionalProperties: false } as const;

const SYMBOL_PARAM = {
  type: "object",
  properties: {
    symbol: { type: "string", description: "Ticker symbol, e.g. AAPL, WDC." },
  },
  required: ["symbol"],
  additionalProperties: false,
} as const;

const RECENT_NEWS_PARAMS = {
  type: "object",
  properties: {
    limit: { type: "number", description: "Max number of articles to return. Defaults to 20." },
  },
  additionalProperties: false,
} as const;

const SYMBOL_NEWS_PARAMS = {
  type: "object",
  properties: {
    symbol: { type: "string", description: "Ticker symbol, e.g. AAPL, WDC." },
    limit: { type: "number", description: "Max number of articles to return. Defaults to 20." },
  },
  required: ["symbol"],
  additionalProperties: false,
} as const;

/**
 * Every tool the Portfolio AI can call. Each maps 1:1 to a function in
 * tool-executor.ts, which calls the application's existing services
 * (PortfolioDataSource, etc.) — never IBKR directly. Read-only: nothing
 * here places, modifies, or cancels an order.
 */
export const PORTFOLIO_AI_TOOLS: AIToolDefinition[] = [
  {
    name: "getAccountSummary",
    description:
      "Current account-level metrics: net liquidation value, cash, buying power, excess liquidity, margin, leverage, realized/unrealized P&L. Use for 'what's my portfolio worth', 'how much cash do I have', 'what's my margin usage'.",
    parameters: NO_PARAMS,
  },
  {
    name: "getPositions",
    description:
      "All current positions with quantity, average cost, current price, market value, unrealized P&L, and portfolio weight. Use for 'what are my biggest positions', 'show me my holdings', 'what's my biggest unrealized gain'.",
    parameters: NO_PARAMS,
  },
  {
    name: "getPosition",
    description: "A single current position by ticker symbol. Use for 'how many WDC shares do I have', 'what's my cost basis on AAPL'.",
    parameters: SYMBOL_PARAM,
  },
  {
    name: "getPortfolioAllocation",
    description:
      "Portfolio weight grouped by sector and by asset class. Use for 'what's my tech exposure', 'how diversified am I', concentration questions.",
    parameters: NO_PARAMS,
  },
  {
    name: "getPortfolioPerformance",
    description: "Historical portfolio performance over time (returns unavailable — no snapshot history exists yet in this phase).",
    parameters: NO_PARAMS,
  },
  {
    name: "getMarketData",
    description:
      "Current price and daily change for a ticker symbol. Works for symbols currently held in the portfolio; for symbols not held, market data isn't connected yet in this phase.",
    parameters: SYMBOL_PARAM,
  },
  {
    name: "getRecentTrades",
    description: "Recently executed trades (returns unavailable — trade history sync isn't implemented yet in this phase).",
    parameters: NO_PARAMS,
  },
  {
    name: "getOpenOrders",
    description: "Currently open/working orders (returns unavailable — order sync isn't implemented yet in this phase).",
    parameters: NO_PARAMS,
  },
  {
    name: "getHistoricalPortfolioSnapshots",
    description:
      "Past portfolio snapshots, for 'what changed since yesterday' style questions (returns unavailable — snapshot history isn't implemented yet in this phase).",
    parameters: NO_PARAMS,
  },
  {
    name: "getRiskMetrics",
    description: "Concentration, volatility, and exposure risk metrics (returns unavailable — the risk engine isn't implemented yet, a later phase).",
    parameters: NO_PARAMS,
  },
  {
    name: "getPortfolioContext",
    description:
      "A compact combined snapshot of account summary, top positions, and allocation in one call — the efficient starting point for broad questions like 'analyze my portfolio' or 'tell me about my portfolio', instead of calling several tools separately.",
    parameters: NO_PARAMS,
  },
  {
    name: "getRecentNews",
    description:
      "Recent general market news, most recent first, with deterministic categories (earnings, guidance, regulation, etc.) and a low/medium/high relevance label per article. Not filtered to holdings. Use for 'what's happening in the market today'.",
    parameters: RECENT_NEWS_PARAMS,
  },
  {
    name: "getPortfolioNews",
    description:
      "Recent news for every symbol currently held in the user's portfolio, most recent first. Requires IBKR to be connected with visible holdings — otherwise reports why it's unavailable rather than guessing what's held. Use for 'any news on my holdings', 'what's new with my portfolio'.",
    parameters: RECENT_NEWS_PARAMS,
  },
  {
    name: "getNewsForSymbol",
    description: "Recent news for a single ticker symbol, most recent first, regardless of whether it's currently held. Use for 'what's the latest on AAPL'.",
    parameters: SYMBOL_NEWS_PARAMS,
  },
  {
    name: "getMaterialPortfolioUpdates",
    description:
      "The subset of portfolio holdings' news classified medium or high relevance (earnings, guidance, M&A, regulation, litigation, management change, analyst actions, large price moves, etc.) — a filtered, higher-signal view of getPortfolioNews. Use for 'anything important happen with my positions', 'material news on my portfolio'.",
    parameters: NO_PARAMS,
  },
];
