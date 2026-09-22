# Architecture — Portfolio Command Center

Status: **Phase 0 — architecture only. No integrations are implemented yet.**

## 1. Research findings that drive this design

### 1.1 IBKR authentication (retail individual account)

Confirmed against IBKR's own Campus/docs pages and current API documentation:

- Retail/individual accounts are **only approved to access the Web API through the
  Client Portal Gateway (CP Gateway)** — a Java process that runs alongside the
  backend and proxies authenticated requests to IBKR. There is no supported REST
  API key or OAuth 1.0a for individuals today; **OAuth 1.0a is institutional-only**.
  IBKR has stated OAuth 2.0 is on its roadmap for individual access, but it is not
  generally available, so we cannot build against it.
- Logging in to the gateway requires a **browser-based login with username,
  password, and 2FA** (IBKR Mobile push or security card, depending on account
  settings). IBKR does not publish or support an automated login flow for this
  step.
- Once authenticated, the brokerage session is fragile:
  - The gateway-to-IBKR "connected" state and the "authenticated" (brokerage
    session valid) state are reported separately by `/iserver/auth/status`.
  - The brokerage session expires after ~5–6 minutes of inactivity; the `/tickle`
    endpoint must be called roughly every 60 seconds to keep it alive.
  - Sessions still require periodic re-login (observed behavior: at least daily,
    sometimes sooner on IP/device change or IBKR-side maintenance).
- Community tools (e.g. `ibeam`) automate the login form with a headless browser
  and stored credentials. This is **unsupported by IBKR**, requires storing the
  brokerage password somewhere the automation can read it, and can break without
  notice when IBKR changes its login page. We are treating this as an optional,
  explicitly-opt-in convenience for later — **not** a foundation the architecture
  depends on.

**Design consequence:** the backend must treat "IBKR authenticated" as a
transient, testable state, not an assumption. A background process owns the
CP Gateway connection, ticks it, and exposes a real status
(`operational` / `degraded` / `failed`, with a reason) that the rest of the
system reads. When the session is unauthenticated, the product must say
`LIVE DATA UNAVAILABLE` with the real reason, never fall back to synthetic
numbers. Re-authentication is a manual step the user performs (open a browser
to the gateway's login page); the system can only detect and surface the need
for it.

### 1.2 OpenAI integration

OpenAI's current API supports function/tool calling via the `tools` parameter
(the model returns structured calls; the backend executes them against real
data and returns results, possibly across multiple turns before a final
answer). This is stable and is what we will build against. OpenAI is also
converging tool integration toward MCP; because our tools are just backend
functions with JSON-schema signatures, exposing the same functions over MCP
later is an additive change, not a rewrite, provided we keep the tool
implementations separate from the transport that calls them (see §5).

### 1.3 Market data / news beyond IBKR

IBKR's own market data endpoints (subject to the user's IBKR market data
subscriptions) are the right source for **live prices on held positions**,
since that data is already tied to the funded account. For news, analyst price
targets, earnings calendars, and fundamentals, a dedicated provider is more
reliable than scraping — leading options are **Financial Modeling Prep (FMP)**
and **Finnhub**, both with REST APIs covering news, analyst estimates/targets,
and earnings calendars. This is a decision to finalize with the user before
Phase 4 (an API key and its cost/free-tier limits are involved); the
architecture only needs a `MarketIntelligenceProvider` interface so the
concrete vendor is swappable.

## 2. System overview

```
┌────────────────────┐        ┌───────────────────────────────────────┐
│   Frontend (Web)    │  HTTPS │              Backend API               │
│  Next.js (TS, App   │◄──────►│  Node.js (TS), long-running process    │
│  Router), mobile-    │        │  - REST/GraphQL API for the frontend   │
│  first responsive    │        │  - Auth (sessions, authz)              │
│  layout               │        │  - IBKR Gateway client + session mgr   │
└────────────────────┘        │  - OpenAI tool-calling orchestrator     │
                                │  - Market data / news integration       │
                                │  - Scheduler (snapshots, alerts, jobs)  │
                                └───────────────┬─────────────────────────┘
                                                 │
                 ┌───────────────────────────────┼───────────────────────────┐
                 ▼                               ▼                           ▼
      ┌────────────────────┐         ┌─────────────────────┐      ┌──────────────────┐
      │ IBKR Client Portal  │         │      PostgreSQL       │      │  External APIs    │
      │ Gateway (local Java │         │  users, snapshots,    │      │  OpenAI, market    │
      │ process, session-   │         │  positions, news,     │      │  data/news vendor  │
      │ based auth)         │         │  alerts, AI convos,    │      │                    │
      └────────────────────┘         │  orders, audit log     │      └──────────────────┘
                                       └─────────────────────┘
```

Everything that talks to IBKR, OpenAI, or the market-data/news vendor runs
**server-side only**. The frontend never holds an API key, IBKR token, or
brokerage credential — it only holds a session cookie scoped to our own
backend.

## 3. Components

### 3.1 Frontend

- **Next.js (TypeScript, App Router)**, mobile-first: the spec's mobile nav
  (Home, Portfolio, Updates, Targets, AI) and desktop sidebar nav are both
  views over the same route tree, not separate apps.
- Talks only to our backend's API (same-origin or a configured internal URL).
  No direct calls to IBKR, OpenAI, or the market-data vendor from the browser.
- Every live-data widget renders `source`, `timestamp`, and `status`
  (`LIVE` / `DELAYED` / `LIVE DATA UNAVAILABLE` + reason) using data the
  backend attaches to each response — the frontend does not decide this on
  its own, so it can't accidentally present stale data as live.

### 3.2 Backend API

- **Node.js + TypeScript**, run as a **persistent process** (not serverless
  functions). This is a hard requirement, not a preference: the IBKR session
  needs a `/tickle` heartbeat roughly every 60 seconds, and scheduled jobs and
  (later) WebSocket market-data streaming need a long-lived process.
- Framework: **Fastify** (typed, low-overhead, good plugin model for
  separating the IBKR client, OpenAI orchestrator, and job scheduler as
  isolated modules).
- Internal module boundaries (each independently replaceable):
  - `integrations/ibkr` — CP Gateway session lifecycle, typed client for the
    account/portfolio/order endpoints actually used, health check.
  - `integrations/openai` — chat/tool-calling orchestration only; no business
    logic lives here.
  - `integrations/market-intel` — vendor-agnostic interface for news, analyst
    data, earnings, wrapping whichever provider is chosen.
  - `domain/` — portfolio, risk, scenario, alerting logic. Pure functions over
    data pulled from the modules above; this is what the OpenAI tools and the
    REST endpoints both call, so behavior is defined once.
  - `scheduler/` — cron-style jobs (portfolio snapshot, news poll, alert
    evaluation), built behind a small `JobScheduler` interface so the initial
    in-process implementation (`node-cron`) can be swapped for a queue
    (BullMQ + Redis) later without touching job logic.
  - `auth/` — session issuance/validation, password hashing, authorization
    checks.

### 3.3 IBKR integration layer

**Implemented in Phase 2** — `apps/api/src/integrations/ibkr/`:

- `client.ts` (`GatewayHttpClient`) — thin HTTPS client against the gateway
  the operator runs themselves (TLS verification is disabled only for this
  specific local connection; see `SECURITY.md` §2).
- `session-manager.ts` (`IbkrSessionManager`) — owns three of the four
  states in `docs/IBKR_INTEGRATION.md` §2: pings `/tickle` on a 60s
  interval, polls `/iserver/auth/status`, and exposes gateway-reachable /
  connected / authenticated distinctly (never collapsed into one "connected"
  flag).
- `connection-manager.ts` (`IbkrConnectionManager`) — the fourth state
  (account data available), account discovery/caching, and the
  live/cached/unavailable envelope logic for portfolio bundles and market
  data (see `docs/IBKR_INTEGRATION.md` §4).
- `errors.ts` — classifies every failure into a safe `IbkrErrorCode`; routes
  and logs never see a raw IBKR error body.
- `portfolio-mapper.ts` / `market-data.ts` — map IBKR's raw JSON into
  `@pcc/shared`'s `AccountSummary`/`Position`/quote shapes.
- `ibkr-portfolio-data-source.ts` (`IbkrPortfolioDataSource implements
  PortfolioDataSource`) — the only implementation of the interface now;
  it reports an honest `unavailable` `LiveData` envelope on its own when
  IBKR isn't configured/authenticated, so no separate "not connected" stub
  class is needed.
- Read-only, as designed: no file in this module calls an order endpoint.
  No order endpoints are called until Phase 7, and even then every order
  requires explicit user confirmation in the UI before the backend calls
  IBKR.
- The rest of the app depends only on `PortfolioDataSource`, so a future
  change (e.g. IBKR's own OAuth 2.0 individual rollout, or adding a second
  broker) means writing a new class implementing that interface — routes,
  the frontend, and the future AI tools don't change.

Full endpoint list, refresh strategy, and known limitations:
`docs/IBKR_INTEGRATION.md`.

### 3.4 OpenAI / AI layer

- Backend defines the tool functions listed in the product spec
  (`getAccountSummary`, `getPositions`, `getPortfolioNews`, `getRiskMetrics`,
  etc.) as thin adapters over `domain/` and the integration layers — never as
  a dump of portfolio state into the prompt.
- The orchestrator loop: send user message + tool schemas → model requests
  tool call(s) → backend executes against real data → results returned to the
  model → repeat until the model returns a final answer.
- System prompt requires the model to label every claim as **FACT / ANALYST
  ESTIMATE / AI INTERPRETATION / SCENARIO / UNCERTAINTY**; this is enforced in
  the prompt and spot-checked in tests, not just requested.
- Conversations and individual tool calls are persisted (`ai_conversations`,
  `ai_messages`) for auditability — what the AI was told and what it
  concluded is reconstructable later.

### 3.5 Market data / news layer

- One interface, one swappable vendor implementation to start. Used both to
  enrich the dashboard directly and as data the OpenAI tools read.
- News/analyst/earnings data is normalized into the DB schema in §6 so the AI
  and UI both read from our own store (with `fetched_at` timestamps) rather
  than hitting the vendor API on every request.

### 3.6 Database

- **PostgreSQL.** Relational integrity fits this domain well (users →
  accounts → positions/snapshots/orders, all with clear foreign keys and the
  need for point-in-time queries like "what changed since yesterday").
- **Prisma** as the ORM/migration tool for TypeScript-native types shared
  between the schema and the backend code.
- No time-series extension needed at personal-portfolio scale; if snapshot
  volume grows enough to matter, TimescaleDB can be added later without a
  schema rewrite (it layers onto Postgres).

### 3.7 Authentication & authorization

- Single-tenant today, but modeled as multi-user from the start (a `users`
  table, session table, per-user IBKR connection) since retrofitting auth is
  expensive and the spec explicitly asks for an audit-friendly design.
- Credential auth (email + password, Argon2 hashing) issuing an httpOnly,
  secure, `SameSite=strict` session cookie. TOTP-based 2FA is available given
  this system fronts brokerage-adjacent data.
- Authorization is checked per-request in the backend (not just hidden UI) —
  every route validates the session belongs to the resource's owner.

### 3.8 Monitoring / System Health

- Each integration (IBKR, OpenAI, market data, news, database, scheduled
  jobs) has a real health-check function the System Health page calls, not a
  hardcoded "Connected". Status is one of `Operational` / `Degraded` /
  `Failed`, cached briefly (a few seconds) to avoid hammering upstream APIs on
  every page load.
- Structured logging (pino) with secret redaction built into the logger
  config, not left to call-site discipline.
- Error tracking (Sentry or equivalent) — decide provider with the user
  before Phase 6; not required for Phase 0.

### 3.9 Deployment

- Both the backend (with its IBKR Gateway sidecar) and Postgres need to run
  somewhere as long-lived containers — a VPS, Fly.io, Railway, or similar.
  Serverless hosting (e.g. Vercel functions) does not fit the backend for the
  reasons in §3.2, though it can still host the Next.js frontend if the
  frontend and backend are deployed separately.
- Local development mirrors production topology via Docker Compose:
  `web`, `api`, `ibkr-gateway`, `postgres` (and later `redis` if the job
  queue graduates from in-process cron).

## 4. Data flow example — Home screen load

1. Browser requests `/` with its session cookie.
2. Frontend calls backend `GET /api/portfolio/summary`.
3. Backend checks the session, then asks `IbkrSessionManager` for current
   auth state.
   - If authenticated: calls IBKR account summary + positions endpoints,
     computes derived fields (weights, daily P&L%) in `domain/portfolio`,
     returns them tagged `source: "IBKR"`, `status: "LIVE"`,
     `timestamp: <now>`.
   - If not authenticated: returns the same shape with
     `status: "LIVE DATA UNAVAILABLE"` and a `reason` string (e.g.
     "IBKR session expired — re-authenticate in the gateway"). No numbers are
     fabricated or carried over from a stale cache silently.
4. Frontend renders the values it received, including the source/timestamp/
   status badge, unmodified.

## 5. Why this supports later replacement (per the stated requirement)

- IBKR access is isolated behind `PortfolioDataSource`; replacing CP Gateway
  automation with IBKR's future OAuth 2.0 (or adding a second broker) means
  writing a new implementation of that interface, not touching `domain/`,
  the API routes, or the OpenAI tools.
- OpenAI tool functions call into `domain/`, not the other way around, so
  switching the transport (raw `tools` API today, MCP later) only touches
  `integrations/openai`.
- The job scheduler is defined by an interface so `node-cron` can become
  BullMQ + Redis without changing what the jobs do.
- The market-intelligence vendor is behind an interface so FMP, Finnhub, or a
  second provider for redundancy can be swapped or added without touching
  `domain/` or the AI tools.

## 6. Database schema (entities, Phase 1 target)

Matches the spec's list; columns are illustrative, not final DDL:

- `users` — id, email, password_hash, totp_secret (nullable), created_at
- `sessions` — id, user_id, expires_at
- `ibkr_connections` — id, user_id, gateway status metadata, last_authenticated_at
  (never a stored password — see SECURITY.md)
- `instruments` — id, symbol, name, sector, asset_class
- `portfolio_snapshots` — id, user_id, taken_at, net_liquidation, cash,
  buying_power, excess_liquidity, margin, realized_pnl, unrealized_pnl,
  daily_pnl
- `position_snapshots` — id, snapshot_id, instrument_id, quantity, avg_cost,
  market_price, market_value, unrealized_pnl, weight
- `market_data_cache` — id, instrument_id, fetched_at, payload
- `news_items` — id, instrument_id (nullable for portfolio-wide), headline,
  source, url, published_at, event_type, summary, importance
- `analyst_estimates` / `analyst_revisions` — id, instrument_id, target,
  rating, previous_value, new_value, source, dated_at
- `earnings` — id, instrument_id, period, date, estimate_eps, actual_eps
- `catalysts` — id, instrument_id (nullable), description, expected_date
- `alerts` — id, user_id, condition, status, triggered_at
- `ai_conversations` / `ai_messages` — id, user_id, role, content, tool_calls,
  created_at
- `ai_analyses` — id, conversation_id, kind (FACT/ESTIMATE/SCENARIO/…),
  content
- `orders` / `trades` — id, user_id, instrument_id, side, quantity, status,
  ibkr_order_id, confirmed_at, submitted_at (Phase 7)
- `system_events` — id, component, level, message, created_at (audit log)

## 7. Sources

- https://www.interactivebrokers.com/campus/trading-lessons/launching-and-authenticating-the-gateway/
- https://www.interactivebrokers.com/campus/ibkr-api-page/web-api-trading/
- https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/client-portal-gateway-faq
- https://www.interactivebrokers.com/docs/web-api/authentication/faq
- https://www.interactivebrokers.com/docs/web-api/v1/endpoints/session/ping-the-server
- https://developers.openai.com/api/docs/guides/function-calling
- https://site.financialmodelingprep.com/developer/docs
- https://finnhub.io/
