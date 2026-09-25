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
since that data is already tied to the funded account. For news, analyst
price targets, earnings calendars, and fundamentals, a dedicated provider is
more reliable than scraping — the two candidates evaluated were **Financial
Modeling Prep (FMP)** and **Finnhub**.

**News: decided, Phase 4 — Finnhub.** Chosen over FMP primarily for its
per-minute (not per-day) free-tier rate limit, which comfortably supports a
portfolio-aware feature that queries once per held symbol; see
`docs/NEWS_INTEGRATION.md` §2 for the full comparison and pricing. The
`NewsProvider` interface (`apps/api/src/integrations/news/news-provider.ts`)
keeps the vendor swappable regardless.

**Analyst targets/ratings/earnings calendars: not yet decided** — still a
later phase; the architecture only needs an `AnalystDataSource` interface
(already scaffolded) so the concrete vendor stays swappable when that phase
starts.

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
  No order endpoints are called until the trading phase (DEVELOPMENT_PLAN.md
  Phase 8), and even then every order requires explicit user confirmation in
  the UI before the backend calls IBKR.
- The rest of the app depends only on `PortfolioDataSource`, so a future
  change (e.g. IBKR's own OAuth 2.0 individual rollout, or adding a second
  broker) means writing a new class implementing that interface — routes,
  the frontend, and the future AI tools don't change.

Full endpoint list, refresh strategy, and known limitations:
`docs/IBKR_INTEGRATION.md`.

### 3.4 OpenAI / AI layer

**Implemented in Phase 3** — `apps/api/src/integrations/openai/`:

- `openai-provider.ts` (`OpenAIProvider implements AIProvider`) — the only
  file that imports the `openai` SDK, using its Responses API
  (`client.responses.create`), OpenAI's current recommended API surface.
  `AIProvider` (`domain/data-sources/ai-provider.ts`) is a provider-agnostic
  "one model turn" contract, so a future provider swap means writing one new
  class, not touching the agent, tools, or routes.
- `agent.ts` (`PortfolioAiAgent`) — the orchestrator loop: send message
  history + tool schemas → model requests tool call(s) → `tool-executor.ts`
  runs them against `domain/` and the Phase 2 integration layer (never IBKR
  directly) → results returned to the model, exact status/reason intact →
  repeat (capped at 6 iterations) until a final answer. Every step is
  persisted incrementally via `conversation-service.ts`.
- 11 tools (`tool-definitions.ts` + `tool-executor.ts`):
  `getAccountSummary`, `getPositions`, `getPosition`,
  `getPortfolioAllocation`, `getPortfolioPerformance`, `getMarketData`,
  `getRecentTrades`, `getOpenOrders`, `getHistoricalPortfolioSnapshots`,
  `getRiskMetrics`, `getPortfolioContext`. Each returns the same
  `LiveData<T>` envelope Phase 2 established for IBKR data — the tool layer
  reuses that contract rather than inventing a second one. Tools for
  capabilities that don't exist yet (trades, orders, snapshot history, risk)
  are real functions returning an honest `unavailable` envelope, the same
  pattern as Phase 1/2's `NotConnected*` stand-ins.
- `system-prompt.ts` requires the model to label every claim as **FACT /
  CURRENT DATA / ANALYST ESTIMATE / AI INTERPRETATION / SCENARIO /
  UNCERTAINTY**, defaults responses to Hebrew, and forbids answering a
  current-state question from conversation memory alone; enforced in the
  prompt text and spot-checked in `system-prompt.test.ts`, not just assumed.
- Conversations and messages are persisted (`AIConversation`, `AIMessage`)
  for auditability and continuity — what the AI was told and what it
  concluded is reconstructable later, and a conversation can be resumed.

Full detail, including why data can't be invented mechanically (not just by
prompt instruction), model configuration, and cost controls:
`docs/OPENAI_INTEGRATION.md`.

### 3.5 News layer

**Implemented in Phase 4** — `apps/api/src/integrations/news/`:

- `finnhub-provider.ts` (`FinnhubNewsProvider implements NewsProvider`) —
  the only file that imports Finnhub's actual endpoint shapes.
  `NewsProvider` (`integrations/news/news-provider.ts`) is a
  vendor-agnostic contract, so a future provider swap or addition means
  writing one new class, not touching the service, routes, or AI tools.
- `news-service.ts` (`NewsService`) — fetch/cache/ingest orchestrator,
  mirroring `IbkrConnectionManager`'s live/cached/unavailable pattern
  rather than inventing a new one. Ingestion runs every article through
  `categorizer.ts` (deterministic keyword classification into categories +
  a low/medium/high relevance tier — no AI/ML in this phase) and
  `dedup.ts` (exact re-fetch idempotency via a DB unique constraint, plus
  heuristic cross-query duplicate detection) before upserting into
  Postgres.
- `news-integration-data-source.ts` (`NewsIntegrationDataSource implements
  NewsDataSource`) — resolves "what does this user hold" via the existing
  `PortfolioDataSource` (inheriting IBKR's own honesty: no fabricated
  holdings when IBKR isn't connected) and shapes the response; owns
  nothing vendor-specific.
- News data is normalized into the DB schema (`NewsArticle`/`NewsEvent`,
  extending rather than duplicating the Phase 1 schema — see §6) so the AI
  tools and UI both read from our own store (with `publishedAt` and
  `retrievedAt` tracked separately) rather than hitting the vendor API on
  every request.
- 4 AI tools (`getRecentNews`, `getPortfolioNews`, `getNewsForSymbol`,
  `getMaterialPortfolioUpdates`), added to the Phase 3 tool architecture
  the same way every other tool is: each calls `NewsDataSource`, never the
  provider directly, and returns the same `LiveData<T>` envelope.

Full detail, including provider selection/pricing, the classification rule
table, deduplication design, caching policy, and known limitations:
`docs/NEWS_INTEGRATION.md`.

### 3.6 Analysts, earnings, catalysts, risk layer

**Implemented in Phase 5** — `apps/api/src/integrations/{analyst,earnings,catalysts,risk}/`:

- `analyst/` and `earnings/` each follow the exact same
  provider/errors/client/service/data-source module shape as `news/`
  (§3.5), reusing the Phase 4 Finnhub vendor and `FINNHUB_API_KEY` rather
  than onboarding a second one. `AnalystProvider`/`EarningsProvider` are
  their own vendor-agnostic interfaces — a future vendor swap means
  writing one new class per module, same pattern as every prior
  integration.
- `catalysts/` (`CatalystService`) is a deterministic aggregator, not a
  vendor-backed data source: it depends only on the existing
  `NewsDataSource`/`AnalystDataSource`/`EarningsDataSource` interfaces and
  maps their already-normalized output into the shared `Catalyst` model
  (idempotent via a `(sourceType, sourceId)` unique constraint).
- `risk/` (`RiskService` + pure functions in `risk-engine.ts`) computes
  every metric from `Position[]`/`AccountSummary` already returned by the
  existing `PortfolioDataSource` — no vendor call of its own. Each metric
  is individually documented (formula/source/severity), never an
  arbitrary composite score. Two metrics
  (`exposure_change_7d`/`concentration_change_7d`) depend on
  `PortfolioSnapshot` history written by the Phase 6 scheduler (§3.7) —
  honestly `unavailable` until that history exists.
- 6 AI tools (`getAnalystData`, `getAnalystRevisions`,
  `getUpcomingEarnings`, `getPortfolioCatalysts`, `getRiskMetrics`,
  `getPortfolioRiskSummary`), added the same way every other tool is.

Full detail, including the provider decision, the catalyst-type mapping
table, the risk-metric formula table, and known limitations (notably the
ETF-vs-equity heuristic):
`docs/RISK_AND_CATALYSTS.md`.

### 3.7 Alerts and monitoring layer

**Implemented in Phase 6** — `apps/api/src/integrations/{scheduler,alerts}/`:

- `scheduler/` (`Scheduler`) — a persistent-process scheduler (this
  backend is already a long-running process for the IBKR keep-alive, §3.2;
  jobs are additive, not a new deployment shape). Each job
  self-reschedules via `setTimeout` rather than a fixed `setInterval`, so
  a failing job's own interval backs off (capped doubling) without
  affecting any other job. `buildJobs()` (`jobs.ts`) defines five jobs —
  refresh news/analyst-data/earnings for the union of every authenticated
  user's held symbols, write portfolio snapshots, and evaluate alerts —
  each a thin wrapper around existing Phase 2-5 services, never a vendor
  call of its own.
- `alerts/` (`AlertEngine` + `AlertService`) — `AlertEngine` is
  deterministic detection only (no LLM call anywhere in it): one detector
  function per alert category, each reading an existing `*DataSource`
  interface. Cooldown/deduplication lives in one `raise()` method shared
  by every category — a per-alert `dedupeKey` and the rule's
  `cooldownMinutes` decide whether a detection creates a new `Alert` row,
  updates an existing one in place, or is silently suppressed.
  `AlertService` is the separate read/write side routes and AI tools
  depend on; it never runs a detector itself.
- `NotificationProvider` (interface) → `InAppNotificationProvider` (the
  only implemented channel — the `Alert` row itself is the in-app
  notification; email/push are documented as not built, not silently
  assumed).
- Every scheduler/alert action logs a `SystemEvent` (§3.10) — job
  started/completed/failed, alert generated/re-triggered/suppressed.
- 4 AI tools (`getActiveAlerts`, `getRecentAlerts`, `getAlertHistory`,
  `getMonitoringStatus`) — read-only; no tool exists for the AI to create,
  edit, or delete an alert rule, so this is enforced architecturally, not
  just by the system prompt.

Full detail, including the job/interval table, the full alert-category →
detector table, the cooldown/dedup mechanism, and known limitations:
`docs/ALERTS_AND_MONITORING.md`.

### 3.8 Database

- **PostgreSQL.** Relational integrity fits this domain well (users →
  accounts → positions/snapshots/orders, all with clear foreign keys and the
  need for point-in-time queries like "what changed since yesterday").
- **Prisma** as the ORM/migration tool for TypeScript-native types shared
  between the schema and the backend code.
- No time-series extension needed at personal-portfolio scale; if snapshot
  volume grows enough to matter, TimescaleDB can be added later without a
  schema rewrite (it layers onto Postgres).

### 3.9 Authentication & authorization

- Single-tenant today, but modeled as multi-user from the start (a `users`
  table, session table, per-user IBKR connection) since retrofitting auth is
  expensive and the spec explicitly asks for an audit-friendly design.
- Credential auth (email + password, Argon2 hashing) issuing an httpOnly,
  secure, `SameSite=strict` session cookie. TOTP-based 2FA is available given
  this system fronts brokerage-adjacent data.
- Authorization is checked per-request in the backend (not just hidden UI) —
  every route validates the session belongs to the resource's owner.

### 3.10 Monitoring / System Health

- Each integration (IBKR, OpenAI, market data, news, analysts/earnings,
  database, scheduled jobs) has a real health-check function the System
  Health page calls, not a hardcoded "Connected". Status is one of
  `Operational` / `Degraded` / `Failed`, computed from real state on each
  request (IBKR/OpenAI/news/analyst report their own last-call outcome;
  scheduled jobs — **implemented in Phase 6** — report the real
  `Scheduler` state: `operational` while running with no job error,
  `degraded` if a job's last run failed, `failed` if the scheduler isn't
  running at all).
- Structured logging (pino) with secret redaction built into the logger
  config, not left to call-site discipline. Scheduler/alert-engine actions
  additionally write a durable `SystemEvent` row (§3.7) — job
  started/completed/failed, alert generated/suppressed — queryable
  independent of log retention.
- Error tracking (Sentry or equivalent) — still not wired. `SENTRY_DSN` is
  a config placeholder read by `apps/api/src/config.ts` but no SDK
  integration exists yet; structured logs plus `SystemEvent` rows are the
  primary production debugging tool until there's a real Sentry account to
  point it at. See `docs/DEPLOYMENT.md` §14.

### 3.11 Deployment (Phase 7 — implemented)

- Both the backend (with its future IBKR Gateway sidecar) and Postgres run
  as long-lived containers — a VPS, Fly.io, or Railway (the recommended
  provider; see `docs/DEPLOYMENT.md` §2 for the full evaluation and
  reasoning). Serverless hosting (e.g. Vercel functions) does not fit the
  backend for the reasons in §3.2 — the Phase 6 `Scheduler` self-reschedules
  jobs inside the running process with no external cron calling back in, so
  a platform that spins the process down between requests would silently
  stop it.
- `apps/api/Dockerfile` and `apps/web/Dockerfile` (repo root, multi-stage,
  non-root runtime user) plus a reference `docker-compose.prod.yml`
  (Postgres + api + web) cover the self-hosted path; a managed platform
  build (Railway/Fly/Render) uses the same two Dockerfiles directly. Both
  must be built with the **monorepo root** as Docker build context — see
  the comment at the top of each Dockerfile.
- `apps/web` builds with `output: "standalone"` (Next's self-contained
  server, no `node_modules` install needed at runtime) and
  `outputFileTracingRoot` pointed at the monorepo root, since Next's file
  tracer otherwise roots itself at `apps/web` and silently drops workspace
  dependencies living outside it (`packages/shared`).
- `apps/api` builds via `apps/api/build.mjs` (esbuild), not plain `tsc`.
  `@pcc/config`, `@pcc/shared`, and `@pcc/db` all resolve to their
  TypeScript *source* via `package.json`'s `main` field by design, so
  `tsx` (dev) and `vitest` (tests) work with zero build step — but that
  same resolution makes a plain `tsc`-compiled `dist/index.js`
  unexecutable by plain Node in production (`Cannot find module
  '.../src/env.js'`), since Node can't run `.ts` source directly. The
  esbuild bundle inlines those three packages' source into one
  `dist/index.js` while leaving every real npm dependency external. See
  `docs/DEPLOYMENT.md` §10 for the full incident writeup and the exact
  commands that verified the fix.
- Config validation (`apps/api/src/config.ts`) is environment-aware:
  `NODE_ENV=production` additionally requires a `SESSION_SECRET` of at
  least 32 characters and an `APP_BASE_URL` starting with `https://` —
  enforced at startup via a zod `superRefine`, not just documented.
- `GET /health` (liveness, no I/O) and `GET /ready` (readiness, a real
  `SELECT 1`) are separate endpoints, both exempt from rate limiting, so a
  platform's health probe is never throttled and a liveness check never
  restarts a healthy process over a transient DB blip.
- `@fastify/rate-limit` is registered globally (300 req/min/IP) with a
  stricter override (10 req/min/IP) on `/auth/login` and `/auth/signup` —
  this closes a gap SECURITY.md had documented as an intended rule with no
  implementation behind it until this phase.

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
- The job scheduler (`Scheduler`, **implemented Phase 6**) exposes jobs as
  plain `{name, intervalMinutes, run}` definitions independent of its own
  self-rescheduling `setTimeout` mechanism, so swapping to a durable queue
  (BullMQ + Redis) for a multi-instance deployment means changing the
  scheduler's internals, not any job's `run()` body.
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
- `news_articles` (**implemented, Phase 4** — actual model: `NewsArticle`)
  — id, instrument_id (nullable), related_symbols (string array), headline,
  summary, source, provider, external_id (unique with provider — re-fetch
  idempotency), url, published_at, retrieved_at, relevance
  (low/medium/high), status (active/duplicate), duplicate_of_id
- `news_events` (actual model: `NewsEvent`) — id, article_id, event_type
  (one row per matched category; an article can match more than one)
- `analyst_estimates` / `analyst_revisions` (**implemented, Phase 5** —
  actual models: `AnalystEstimate`/`AnalystRevision`) — id, instrument_id,
  target/rating fields, provider, external_id (unique with provider),
  source, as_of/revised_at, retrieved_at
- `earnings` (**implemented, Phase 5** — actual model: `Earnings`) — id,
  instrument_id, period, report_date, announcement_timing, estimated/actual
  eps and revenue, status (estimated/confirmed/actual), provider,
  external_id (unique with provider), retrieved_at
- `catalysts` (**implemented, Phase 5** — actual model: `Catalyst`,
  extended beyond the original illustrative columns) — id, instrument_id
  (nullable), type, title, description, expected_date, date_confirmed,
  status (upcoming/completed), relevance, source, url, published_at,
  retrieved_at, source_type + source_id (unique together — idempotent
  upsert from news/earnings/analyst-revision events, see
  `docs/RISK_AND_CATALYSTS.md` §2)
- `alert_rules` (**implemented, Phase 6** — actual model: `AlertRule`, new
  this phase) — id, user_id, category, symbol (nullable = portfolio-wide),
  enabled, threshold, severity, cooldown_minutes, notify_in_app
- `alerts` (**implemented, Phase 6** — actual model: `Alert`, extended
  from the Phase 1 scaffold) — id, user_id, rule_id (nullable), category,
  symbol, severity, title, explanation, source_url, condition (json —
  the original scaffolded field, reused to hold structured
  threshold/actual-value data), status, read_state (new/read/
  acknowledged), dedupe_key, first_detected_at, last_detected_at,
  triggered_at
- `ai_conversations` / `ai_messages` — id, user_id, role, content, tool_calls,
  created_at
- `ai_analyses` — id, conversation_id, kind (FACT/ESTIMATE/SCENARIO/…),
  content
- `orders` / `trades` — id, user_id, instrument_id, side, quantity, status,
  ibkr_order_id, confirmed_at, submitted_at (Phase 8 — trading, not built)
- `system_events` (**implemented, Phase 6** — actual model: `SystemEvent`,
  Phase 1 scaffold, first populated this phase) — id, component, level,
  message, metadata, created_at (audit log for the scheduler and alert
  engine)

## 7. Sources

- https://www.interactivebrokers.com/campus/trading-lessons/launching-and-authenticating-the-gateway/
- https://www.interactivebrokers.com/campus/ibkr-api-page/web-api-trading/
- https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/client-portal-gateway-faq
- https://www.interactivebrokers.com/docs/web-api/authentication/faq
- https://www.interactivebrokers.com/docs/web-api/v1/endpoints/session/ping-the-server
- https://developers.openai.com/api/docs/guides/function-calling
- https://site.financialmodelingprep.com/developer/docs
- https://finnhub.io/
