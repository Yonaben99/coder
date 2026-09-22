# Development Plan — Portfolio Command Center

Each phase ends with something real and testable — never a mock standing in
for an integration that phase was supposed to build. We do not start a phase
until the previous one is confirmed working. **Only Phase 0 is authorized
right now; do not begin Phase 1 without explicit sign-off.**

## Phase 0 — Architecture and environment (current)

**Goal:** know what we're building and why before writing application code.

- [x] Inspect the environment and available tooling.
- [x] Research IBKR's actual supported authentication method for individual
      retail accounts.
- [x] Research OpenAI tool-calling integration pattern.
- [x] Research market data / news API options.
- [x] Write `ARCHITECTURE.md`, `SECURITY.md`, `README.md`, `.env.example`,
      `.gitignore`.

**Exit criteria:** the user has reviewed the architecture and explicitly
approves moving to Phase 1.

## Phase 1 — Repository, frontend, backend, database, auth, navigation

**Goal:** a running full-stack skeleton with no fake financial data anywhere
in it — every screen either shows real (empty) state or an honest
"not connected yet" placeholder.

- Monorepo layout: `apps/web` (Next.js), `apps/api` (Fastify), `packages/db`
  (Prisma schema/migrations), `packages/shared` (shared TS types).
- Postgres running locally via Docker Compose; Prisma schema for the entities
  in `ARCHITECTURE.md` §6, migrated.
- Auth: signup/login for a single initial user, Argon2-hashed passwords,
  httpOnly session cookies, TOTP 2FA.
- Navigation shell: desktop sidebar + mobile bottom nav across the screens
  listed in the spec (Home, Dashboard, Positions, Position Detail, News,
  Updates, Scan, Targets, Catalysts, Risk, Analysts, Review, AI Chat,
  Settings, Connections, System Health) — screens can be empty/placeholder
  content, but the routes and layout are real.
- System Health page wired to real (currently-all-`Failed`, because nothing
  is connected yet) checks, not hardcoded "Operational".
- CI: typecheck, lint, build on push.

**Exit criteria:** app runs locally end-to-end (login → empty dashboard →
System Health correctly shows every integration as not connected), reviewed
by the user.

## Phase 2 — IBKR read-only integration

**Goal:** real account data, read-only, with honest failure states.

- CP Gateway running as a sidecar the backend manages.
- `IbkrSessionManager`: tickle loop, `/iserver/auth/status` polling,
  connected/authenticated state exposed to System Health.
- `PortfolioDataSource` implementation over the account summary and
  positions endpoints (net liquidation, cash, buying power, excess
  liquidity, margin, realized/unrealized/daily P&L; per-position symbol,
  quantity, avg cost, current price, market value, unrealized P&L, P&L%,
  daily change, weight).
- Home and Positions screens driven entirely by this data, each value
  tagged `source: "IBKR"`, `timestamp`, `status`.
- Explicit decision point with the user: whether to build the manual daily
  gateway login into the workflow as-is, or evaluate an unsupported
  automation tool (e.g. `ibeam`) with the tradeoffs from `SECURITY.md`
  understood and accepted.

**Exit criteria:** logged-in user with a funded/paper IBKR account sees their
real positions and account summary in the app, with correct behavior when the
session expires (visible "re-authenticate" state, no stale/fabricated
numbers).

## Phase 3 — OpenAI integration and tool calling

**Goal:** the AI chat answers questions using the tool functions in
`ARCHITECTURE.md` §3.4, not a static prompt dump.

- Implement the tool functions that Phase 2 makes possible now
  (`getAccountSummary`, `getPositions`, `getPosition`,
  `getPortfolioAllocation`, `getPortfolioPerformance`,
  `getHistoricalPortfolioSnapshots`, `getRecentTrades`, `getOpenOrders`).
  Tools that depend on later phases (`getMarketData`, `getPortfolioNews`,
  `getNews`, `getAnalystChanges`, `getEarnings`, `getCatalysts`,
  `getRiskMetrics`) are added incrementally as those phases land — never
  stubbed with fake data in the meantime.
- Tool-calling orchestration loop with persisted conversations/messages.
- System prompt enforces FACT / ANALYST ESTIMATE / AI INTERPRETATION /
  SCENARIO / UNCERTAINTY labeling; covered by tests asserting the model
  output is structured, not just prompted.
- AI Chat screen.

**Exit criteria:** user can ask "what's my AAPL position worth right now"
and get a correct, tool-sourced answer; asking something outside available
tools produces an honest "I don't have that yet" rather than a guess.

## Phase 4 — News and market intelligence

**Goal:** real news, analyst data, and earnings, normalized into our DB.

- Finalize the market-intelligence vendor decision with the user (FMP vs.
  Finnhub vs. both) including cost/rate-limit tradeoffs.
- Scheduled jobs poll news/analyst/earnings for held + watchlist symbols
  into `news_items`, `analyst_estimates`, `analyst_revisions`, `earnings`.
- News, Updates, Targets, Analysts, Catalysts screens driven by this data.
- Remaining OpenAI tools (`getMarketData`, `getPortfolioNews`, `getNews`,
  `getAnalystChanges`, `getEarnings`, `getCatalysts`) implemented.

**Exit criteria:** News/Targets/Analysts screens show real, sourced,
timestamped items for the user's actual holdings.

## Phase 5 — Risk, scenarios, catalysts

**Goal:** risk and scenario analysis grounded in real position data.

- Risk metrics (concentration, sector/geographic exposure, volatility,
  drawdown, correlation, beta, margin/liquidity risk, thematic exposure)
  computed in `domain/risk` from real snapshots, each with an explanation of
  its source, not just a label.
- Scenario tool (`getRiskMetrics` extended, plus a scenario endpoint/tool)
  answering "what if X moves N%" questions, clearly labeled
  `SCENARIO / ESTIMATE`.
- Risk and Review screens.

**Exit criteria:** risk page explains *why* something is flagged as risky
using the user's real concentration/exposure numbers.

## Phase 6 — Monitoring and alerts

**Goal:** the system watches itself and the portfolio without the user
having to ask.

- Alert rules (price moves, news importance, catalyst proximity, IBKR
  session health) evaluated by scheduled jobs, delivered in-app (and by
  email/push if the user wants that scoped in).
- System Health page fully real across all six components (IBKR, OpenAI,
  Market Data, News, Database, Scheduled Jobs) with accurate
  Operational/Degraded/Failed states.
- Error tracking wired in.

**Exit criteria:** killing/degrading an integration in a test environment is
visibly reflected in System Health and triggers the right alert, not silence.

## Phase 7 — Trading with explicit confirmation

**Goal:** controlled order placement, never silent.

- Extend `PortfolioDataSource` (or a sibling `OrderGateway`) to submit
  BUY/SELL/CLOSE/MODIFY/CANCEL through IBKR's order endpoints.
- Every order requires an explicit, itemized confirmation step in the UI
  (symbol, side, quantity, order type, estimated cost/proceeds) before
  submission; nothing fires automatically.
- Orders/trades persisted with full audit trail (`orders`, `trades`,
  `system_events`).

**Exit criteria:** placing a real order (starting in an IBKR paper account)
matches exactly what the user confirmed, with a complete audit trail.

## Cross-cutting, every phase

- No fake/hardcoded portfolio numbers land in the app at any point — the
  Phase 0/1 watchlist tickers (AVUV, CLS, FPS, GFS, MSFT, SPMO, VTI, VXUS,
  WDC, WMT) are dev-time symbols to exercise news/market-data code paths,
  never a stand-in for real positions.
- Every live-data UI element carries source/timestamp/status.
- Security review (see `SECURITY.md`) before each phase that touches
  credentials or trading is considered done.
