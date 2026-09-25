# Portfolio Command Center

A production-grade personal investment portfolio operating system: live
IBKR positions and account data, AI-assisted analysis via OpenAI tool
calling, real market/news/analyst data, risk and scenario analysis, and
(eventually, read-only first) controlled IBKR trading.

**This is not a demo with fake data.** Every live figure in the app is
sourced from a real integration (IBKR, a market-data/news vendor, or our own
database) and is labeled with where it came from and when it was fetched. If
an integration isn't connected yet, the app says so instead of making up a
number.

## Current status

**Phases 1-7 implemented; live testing requires an OpenAI API key, a
Finnhub API key, and a real hosting deploy.** On top of Phase 2's real
IBKR integration, Phase 3's Portfolio AI, and Phase 4's news integration,
the app now has:

- **Analysts, earnings, catalysts, risk (Phase 5)** — analyst consensus and
  rating changes, an earnings calendar, a deterministic catalyst engine
  (aggregating news/earnings/analyst events), and a deterministic
  portfolio risk engine (concentration, exposure, margin, leverage — every
  metric documents its own formula, never an arbitrary "risk score"). See
  [`docs/RISK_AND_CATALYSTS.md`](./docs/RISK_AND_CATALYSTS.md).
- **Alerts and monitoring (Phase 6)** — a persistent-process scheduler
  running five background jobs (news/analyst/earnings refresh, portfolio
  snapshots, alert evaluation), a deterministic `AlertEngine` covering 14
  alert categories with cooldown/deduplication, and a real Updates page.
  Detection is 100% deterministic — no LLM call happens anywhere in the
  alert pipeline. See
  [`docs/ALERTS_AND_MONITORING.md`](./docs/ALERTS_AND_MONITORING.md).
- **Production readiness (Phase 7)** — Dockerfiles for both apps, a
  reference `docker-compose.prod.yml`, environment-aware config validation
  (production refuses to start with a weak `SESSION_SECRET` or a
  non-HTTPS `APP_BASE_URL`), rate limiting (global + a strict limit on
  login/signup), a real `/ready` readiness probe, PWA support (installable
  on iPhone), and a hosting-provider evaluation with exact deploy steps.
  Two real production-startup bugs were found and fixed this phase (an
  internal package resolution issue that broke `node dist/index.js`, and a
  Next.js monorepo file-tracing gap) — see
  [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) §9-10 for what broke and how
  it was verified fixed. No trading/order execution — that remains
  deliberately out of scope.

Neither `OPENAI_API_KEY`, `FINNHUB_API_KEY`, nor a live IBKR gateway is
available in this development sandbox, so end-to-end behavior against real
accounts has not been exercised from here; see
[`docs/OPENAI_INTEGRATION.md`](./docs/OPENAI_INTEGRATION.md) §9,
[`docs/IBKR_INTEGRATION.md`](./docs/IBKR_INTEGRATION.md) §9,
[`docs/NEWS_INTEGRATION.md`](./docs/NEWS_INTEGRATION.md) §9, and
[`docs/RISK_AND_CATALYSTS.md`](./docs/RISK_AND_CATALYSTS.md) §4 for exactly
what to set up. The scheduler itself runs regardless (its jobs simply
no-op with zero authenticated users/configured providers) — see
[`docs/ALERTS_AND_MONITORING.md`](./docs/ALERTS_AND_MONITORING.md) §6.

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, research findings
  (especially IBKR's actual retail-account authentication constraints), and
  the database schema.
- [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) — phased build plan and each
  phase's exit criteria.
- [`SECURITY.md`](./SECURITY.md) — secrets handling, IBKR credential policy,
  auth, and trading-safety rules.
- [`docs/IBKR_INTEGRATION.md`](./docs/IBKR_INTEGRATION.md) — IBKR
  architecture, endpoints used, refresh strategy, known limitations, and
  setup/troubleshooting.
- [`docs/OPENAI_INTEGRATION.md`](./docs/OPENAI_INTEGRATION.md) — AI
  architecture, tools, system prompt, conversation model, security, and cost
  controls.
- [`docs/NEWS_INTEGRATION.md`](./docs/NEWS_INTEGRATION.md) — news provider
  selection/pricing, data model, materiality/relevance rules,
  deduplication, caching, endpoints, and setup/troubleshooting.
- [`docs/RISK_AND_CATALYSTS.md`](./docs/RISK_AND_CATALYSTS.md) — analyst/
  earnings provider decision, catalyst engine, risk metric formulas and
  limitations, endpoints, and setup/troubleshooting.
- [`docs/ALERTS_AND_MONITORING.md`](./docs/ALERTS_AND_MONITORING.md) —
  scheduler/job architecture, alert types, cooldown/dedup, notification
  architecture, observability, endpoints, and known limitations.
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — hosting provider
  evaluation, environment separation, secrets, database migrations and
  backups, HTTPS, production build details (including two real bugs found
  and fixed this phase), scheduler behavior in production, security
  headers/CORS/rate limiting, cost estimate, and troubleshooting.

Trading/order execution (originally scoped as a further phase) remains
deliberately out of scope and has not been started.

## How the architecture works (short version)

- **Frontend:** Next.js (TypeScript), mobile-first, talks only to our own
  backend API — never directly to IBKR, OpenAI, or any market-data vendor.
- **Backend:** Node.js (TypeScript, Fastify), run as a persistent process
  because it has to maintain an IBKR Client Portal Gateway session (a
  keep-alive ping roughly every 60 seconds) and run scheduled jobs.
- **Database:** PostgreSQL via Prisma.
- **IBKR:** accessed through the Client Portal Gateway, the only method
  IBKR currently supports for individual retail accounts. Authentication is
  a manual, browser-based login (username, password, 2FA) — IBKR does not
  provide a supported automated flow for individuals. We never store the
  IBKR password. **Implemented** (Phase 2, read-only) in
  `apps/api/src/integrations/ibkr/`. See `ARCHITECTURE.md` §3.3,
  `SECURITY.md` §2, and `docs/IBKR_INTEGRATION.md`.
- **AI:** OpenAI (Responses API), using backend-defined tool functions (real
  data lookups) the model calls as needed, not a static prompt dump of
  portfolio state. **Implemented** (Phase 3, read-only) in
  `apps/api/src/integrations/openai/`. See `ARCHITECTURE.md` §3.4,
  `SECURITY.md` §"AI", and `docs/OPENAI_INTEGRATION.md`.
- **News:** a vendor-agnostic interface (`NewsDataSource`), backed by
  Finnhub (chosen over Financial Modeling Prep — see
  `docs/NEWS_INTEGRATION.md` §2). **Implemented** (Phase 4, read-only) in
  `apps/api/src/integrations/news/`. See `ARCHITECTURE.md` §3.5,
  `SECURITY.md` §1, and `docs/NEWS_INTEGRATION.md`.
- **Analysts, earnings, catalysts, risk:** analyst/earnings data reuse the
  Phase 4 Finnhub key; the catalyst engine and risk engine are
  deterministic aggregators/calculators over existing services, not
  vendor-backed. **Implemented** (Phase 5, read-only) in
  `apps/api/src/integrations/{analyst,earnings,catalysts,risk}/`. See
  `ARCHITECTURE.md` §3.5, and `docs/RISK_AND_CATALYSTS.md`.
- **Alerts and monitoring:** a persistent-process `Scheduler` running
  background jobs, and a deterministic `AlertEngine` (no LLM call in the
  detection path) covering 14 alert categories with cooldown/dedup.
  **Implemented** (Phase 6, observe-and-notify only — never trading) in
  `apps/api/src/integrations/{scheduler,alerts}/`. See `ARCHITECTURE.md`
  §3.6, `SECURITY.md` §1, and `docs/ALERTS_AND_MONITORING.md`.

Full detail, including the data-flow walkthrough and the reasoning behind
each choice, is in `ARCHITECTURE.md`.

## Repository layout

```
apps/
  web/            Next.js (TypeScript) frontend
  api/             Fastify (TypeScript) backend
packages/
  shared/          Types shared between frontend and backend
  config/          Env-validation helper shared across services
prisma/             @pcc/db — Prisma schema, migrations, and client singleton
```

## Running it locally

Prerequisites: Node.js 20+, pnpm, and a local PostgreSQL server (16 is what
this was built and tested against).

1. **Install dependencies** (from the repo root):

   ```bash
   pnpm install
   ```

2. **Start PostgreSQL** and create a database and a user for it, e.g.:

   ```bash
   sudo -u postgres psql -c "CREATE USER pcc_dev WITH PASSWORD 'pcc_dev_password';"
   sudo -u postgres psql -c "CREATE DATABASE portfolio_command_center OWNER pcc_dev;"
   ```

   (Prisma's `migrate dev` also needs permission to create a throwaway
   shadow database: `ALTER USER pcc_dev CREATEDB;`.)

3. **Configure environment variables.** Copy `.env.example` to `.env` at the
   repo root and fill in at least `DATABASE_URL`, `SESSION_SECRET`, and
   `APP_BASE_URL` (`http://localhost:3000` for local dev). Leave
   `MARKET_INTEL_*` unset — standalone market data (for symbols not held)
   is still a later phase, and the app reports it as "not configured"
   rather than failing to start. `IBKR_GATEWAY_BASE_URL`, `OPENAI_API_KEY`,
   and `FINNHUB_API_KEY` are all optional but now real: set
   `IBKR_GATEWAY_BASE_URL` once you have your own Client Portal Gateway
   running and authenticated (see
   [`docs/IBKR_INTEGRATION.md`](./docs/IBKR_INTEGRATION.md) §9), set
   `OPENAI_API_KEY` to enable Portfolio AI (see
   [`docs/OPENAI_INTEGRATION.md`](./docs/OPENAI_INTEGRATION.md) §9), and set
   `FINNHUB_API_KEY` to enable News, Analysts, Earnings, and Catalysts —
   the same key covers all four (see
   [`docs/NEWS_INTEGRATION.md`](./docs/NEWS_INTEGRATION.md) §9 and
   [`docs/RISK_AND_CATALYSTS.md`](./docs/RISK_AND_CATALYSTS.md) §4) — any
   left unset just shows the matching "not connected" placeholder instead
   of failing to start. The Phase 6 scheduler and alert engine need no
   credentials of their own — they run unconditionally and simply have
   nothing to do until IBKR/Finnhub are connected (see
   [`docs/ALERTS_AND_MONITORING.md`](./docs/ALERTS_AND_MONITORING.md) §6).

4. **Run the Prisma migration** against your local database:

   ```bash
   cd prisma
   DATABASE_URL="postgresql://pcc_dev:pcc_dev_password@localhost:5432/portfolio_command_center" \
     npx prisma migrate dev
   ```

5. **Run the backend** (reads env vars from the repo-root `.env` via your
   shell, or export them directly):

   ```bash
   cd apps/api
   pnpm dev            # http://localhost:4000
   ```

6. **Run the frontend**, in a second terminal. It needs to know where the
   API is:

   ```bash
   cd apps/web
   echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:4000" > .env.local
   pnpm dev            # http://localhost:3000
   ```

7. Open `http://localhost:3000`, create an account, and you'll land on the
   Home dashboard showing honest "waiting for IBKR connection" placeholders
   throughout.

## Running tests, lint, typecheck, and build

From the repo root, per package (there is no working root-level Postgres
fixture for `pnpm -r test`, so the backend's DB-backed tests need the same
local database as above):

```bash
pnpm --filter @pcc/shared test
pnpm --filter @pcc/config test
pnpm --filter @pcc/api test       # needs DATABASE_URL — reads apps/api/test/setup.ts, which loads the repo-root .env
pnpm --filter @pcc/web test

pnpm --filter <pkg> typecheck     # @pcc/shared, @pcc/config, @pcc/db, @pcc/api, @pcc/web
pnpm --filter @pcc/web lint       # has its own eslint.config.mjs (adds React Hooks rules)
pnpm --filter <pkg> lint          # other packages use the shared root eslint.config.mjs
pnpm --filter <pkg> build
```

## Required environment variables

See [`.env.example`](./.env.example) for the full list (development), or
[`.env.production.example`](./.env.production.example) for production —
the schema in `apps/api/src/config.ts` enforces stricter rules
(`SESSION_SECRET` ≥32 chars, `APP_BASE_URL` must be `https://`) when
`NODE_ENV=production`. In short: a Postgres connection string, a session
secret, the app's own base URL (for CORS), the IBKR gateway's base URL
(not credentials — the gateway itself handles login), an OpenAI API key,
and a Finnhub API key (news). Nothing here is committed with real values;
copy `.env.example` to `.env` and fill it in locally. The frontend
additionally reads `NEXT_PUBLIC_API_BASE_URL` (not secret — just where the
browser sends requests) from its own `apps/web/.env.local`
(`apps/web/.env.example` documents it).

## Deploying to production

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the full guide:
hosting provider evaluation (Railway recommended), `apps/api/Dockerfile` +
`apps/web/Dockerfile` + `docker-compose.prod.yml` for a self-hosted path,
exact deploy steps, database migrations/backups, and a cost estimate. The
app is designed to deploy correctly with `OPENAI_API_KEY` and
`FINNHUB_API_KEY` left unset — every dependent feature shows an honest
"not connected" state instead of failing.

## Development phases

See [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) for the full breakdown.
Summary:

0. Architecture and environment
1. Repository, frontend, backend, database, auth, navigation
2. IBKR read-only integration
3. OpenAI integration and tool calling
4. News and market intelligence
5. Analysts, earnings, catalysts, risk
6. Alerts and monitoring
7. Production deployment and hardening *(current)*

## A note on the watchlist tickers

`AVUV, CLS, FPS, GFS, MSFT, SPMO, VTI, VXUS, WDC, WMT` appear in planning
material as a **development watchlist only** — symbols to exercise
news/market-data code paths against. They are not, and must never be treated
as, actual position data. Once IBKR is connected (Phase 2), IBKR is the sole
source of truth for real holdings, shares, cost basis, and portfolio value.
