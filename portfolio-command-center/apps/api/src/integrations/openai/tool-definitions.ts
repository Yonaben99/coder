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

const SYMBOL_LIMIT_PARAMS = {
  type: "object",
  properties: {
    symbol: { type: "string", description: "Ticker symbol, e.g. AAPL, WDC." },
    limit: { type: "number", description: "Max number of items to return." },
  },
  required: ["symbol"],
  additionalProperties: false,
} as const;

const LIMIT_PARAMS = {
  type: "object",
  properties: {
    limit: { type: "number", description: "Max number of items to return." },
  },
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
    description:
      "A compact list of deterministic portfolio risk metrics (largest position weight, top-5/10 concentration, sector/country concentration, cash exposure, gross exposure, leverage, margin utilization, unrealized P&L concentration, and 7-day exposure/concentration change where snapshot history exists) — each with its own formula and severity. Never an arbitrary composite 'risk score'. Use for 'how risky is my portfolio', 'am I too concentrated'.",
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
  {
    name: "getAnalystData",
    description:
      "Analyst consensus for a ticker: average/high/low price target, a consensus rating derived from analyst buy/hold/sell counts, and analyst count, with source and timestamp. Analyst-derived information, not this application's own prediction — always label it as such. Use for 'what's the price target on AAPL', 'what do analysts think of WDC'.",
    parameters: SYMBOL_PARAM,
  },
  {
    name: "getAnalystRevisions",
    description:
      "Recent individual analyst rating/target changes for a ticker (firm, previous → new rating, action, date). Use for 'any recent analyst upgrades on WDC', 'who downgraded this stock'.",
    parameters: SYMBOL_LIMIT_PARAMS,
  },
  {
    name: "getUpcomingEarnings",
    description:
      "Upcoming (and recently reported) earnings dates across every symbol currently held in the portfolio, with estimated/actual EPS and revenue where available. Requires IBKR to be connected with visible holdings. Use for 'when does WDC report earnings', 'what earnings are coming up for my portfolio'.",
    parameters: LIMIT_PARAMS,
  },
  {
    name: "getPortfolioCatalysts",
    description:
      "Upcoming and recent catalyst events (earnings, analyst revisions, and medium/high-relevance news) across the portfolio's holdings, each labeled with type, date, whether the date is company-confirmed or estimated, and relevance. Events, not predictions. Use for 'what's coming up for my portfolio', 'any major events on my positions'.",
    parameters: LIMIT_PARAMS,
  },
  {
    name: "getPortfolioRiskSummary",
    description:
      "The full portfolio risk picture in one call: every risk metric plus concentration breakdowns by sector, country, and asset type (ETF vs. individual equity, heuristic), and top positions by weight. The comprehensive counterpart to getRiskMetrics. Use for 'give me a full risk breakdown of my portfolio'.",
    parameters: NO_PARAMS,
  },
  {
    name: "getActiveAlerts",
    description:
      "Currently active (not yet dismissed/acknowledged) alerts the deterministic AlertEngine has detected — price moves, P&L swings, high-relevance news, earnings, analyst revisions, catalysts, concentration/exposure changes, margin thresholds, and connection health. Use for 'do I have any active alerts', 'what needs my attention right now'.",
    parameters: LIMIT_PARAMS,
  },
  {
    name: "getRecentAlerts",
    description: "The most recently detected/updated alerts regardless of read state, most recent first. Use for 'what alerts have fired recently'.",
    parameters: LIMIT_PARAMS,
  },
  {
    name: "getAlertHistory",
    description: "The full alert history for this account, oldest-detection-first pagination via limit. Use for 'show me my alert history'.",
    parameters: LIMIT_PARAMS,
  },
  {
    name: "getMonitoringStatus",
    description:
      "The scheduler's real status: which background jobs are registered (news/analyst/earnings refresh, portfolio snapshots, alert evaluation), each one's interval, last run time, last success time, and last error. Never claims monitoring is active beyond what's actually true. Use for 'is monitoring running', 'when did the news refresh last run'.",
    parameters: NO_PARAMS,
  },
];
