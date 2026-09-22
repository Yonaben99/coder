# Development Plan — Portfolio Command Center

Each phase ends with something real and testable — never a mock standing in
for an integration that phase was supposed to build. We do not start a phase
until the previous one is confirmed working. **Phases 0-3 are implemented.
Do not begin Phase 4 (news and market intelligence) without explicit
sign-off.**

## Phase 0 — Architecture and environment

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

## Phase 1 — Repository, frontend, backend, database, auth, navigation ✅

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

## Phase 2 — IBKR read-only integration ✅ (implemented; live auth requires user setup)

**Goal:** real account data, read-only, with honest failure states.

- [x] `IbkrSessionManager`: tickle loop, `/iserver/auth/status` polling,
      gateway-reachable/connected/authenticated state exposed to System
      Health and a dedicated `GET /api/v1/integrations/ibkr/status`.
- [x] `IbkrPortfolioDataSource implements PortfolioDataSource` over the
      account summary, ledger, and positions endpoints (net liquidation,
      cash, buying power, excess liquidity, margin, realized/unrealized
      P&L computed from positions; per-position symbol, quantity, avg
      cost, current price, market value, unrealized P&L, P&L%, daily
      change, weight, plus contract id/currency/asset class/sector/
      country where IBKR provides them).
- [x] Home, Portfolio, and Position Detail screens driven by this data,
      each value tagged `source: "IBKR"`, `timestamp`, `status`
      (live/cached/unavailable — see `docs/IBKR_INTEGRATION.md` §4).
- [x] Multi-account discovery and per-user selection
      (`GET`/`POST /api/v1/portfolio/account`), never a hardcoded account
      ID.
- [x] 55 unit tests: error classification, mapper fixtures (clearly
      labeled synthetic data), session/connection-manager state machines
      via an injected fake HTTP client.
- [ ] **Live verification against a real IBKR account** — not possible
      from this sandboxed environment (no outbound access to run/authenticate
      a real gateway, no browser for the required 2FA login). See
      `docs/IBKR_INTEGRATION.md` §9 for the exact steps to connect a real
      account; architecture and code are otherwise complete and tested.
- Decision point deferred to the user, not decided here: whether to ever
  adopt an unsupported gateway-login automation tool (e.g. `ibeam`) instead
  of the manual daily browser login this phase assumes — see
  `SECURITY.md` §2.

**Exit criteria:** logged-in user with a funded/paper IBKR account sees their
real positions and account summary in the app, with correct behavior when the
session expires (visible "re-authenticate" state, no stale/fabricated
numbers).

## Phase 3 — OpenAI integration and tool calling ✅ (implemented; live testing requires OPENAI_API_KEY)

**Goal:** the AI chat answers questions using the tool functions in
`ARCHITECTURE.md` §3.4, not a static prompt dump.

- [x] All 11 spec'd tool functions implemented: `getAccountSummary`,
      `getPositions`, `getPosition`, `getPortfolioAllocation`,
      `getPortfolioPerformance`, `getMarketData`, `getRecentTrades`,
      `getOpenOrders`, `getHistoricalPortfolioSnapshots`, `getRiskMetrics`,
      `getPortfolioContext`. The four that depend on capabilities later
      phases build (`getRecentTrades`, `getOpenOrders`,
      `getHistoricalPortfolioSnapshots`, `getRiskMetrics`) are real
      functions returning an honest `unavailable` envelope — never stubbed
      with fake data.
- [x] Tool-calling orchestration loop (`PortfolioAiAgent`) with persisted
      conversations/messages, capped iterations, provider-agnostic
      (`AIProvider` interface, `OpenAIProvider` the only implementation).
- [x] System prompt enforces FACT / CURRENT DATA / ANALYST ESTIMATE / AI
      INTERPRETATION / SCENARIO / UNCERTAINTY labeling, defaults to Hebrew,
      and forbids answering current-state questions from memory alone;
      covered by `system-prompt.test.ts` asserting the rules are present,
      and `agent.test.ts` asserting the plumbing that carries a tool's
      honest status/reason to the model is never altered or dropped.
- [x] Real AI Chat screen: conversation list, message thread, suggested
      prompts, tool-call transparency badges, mobile-responsive.
- [ ] **Live verification against a real OpenAI account** — not possible
      from this sandboxed environment (`OPENAI_API_KEY` unset, confirmed
      before implementation). See `docs/OPENAI_INTEGRATION.md` §9 for the
      exact steps to test live; architecture and code are otherwise
      complete and tested (97 backend tests).

**Exit criteria:** user can ask "what's my AAPL position worth right now"
and get a correct, tool-sourced answer; asking something outside available
tools produces an honest "I don't have that yet" rather than a guess. Code
and tests confirm this mechanically; the live model-behavior confirmation
is blocked on an API key this environment doesn't have.

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
