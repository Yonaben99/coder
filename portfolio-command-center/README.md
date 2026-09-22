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

**Phase 1 — application foundation.** The monorepo skeleton is real and
runs: a Next.js frontend, a Fastify backend, a Postgres schema via Prisma,
session-based auth, and navigation across every planned screen. No external
integration (IBKR, OpenAI, market data, news) is wired up yet — every screen
that would show that data instead shows an honest "not connected" /
"pending" state, never fabricated numbers. See `DEVELOPMENT_PLAN.md` for
what Phase 2 onward adds.

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, research findings
  (especially IBKR's actual retail-account authentication constraints), and
  the database schema.
- [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) — phased build plan and each
  phase's exit criteria.
- [`SECURITY.md`](./SECURITY.md) — secrets handling, IBKR credential policy,
  auth, and trading-safety rules.

Phase 2 (IBKR read-only integration) has not started and will not start
without explicit sign-off.

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
  IBKR password. See `ARCHITECTURE.md` §1.1 and `SECURITY.md` §2.
- **AI:** OpenAI, using backend-defined tool functions (real data lookups)
  the model calls as needed, not a static prompt dump of portfolio state.
- **Market data / news:** a vendor-agnostic interface, backed initially by
  either Financial Modeling Prep or Finnhub (final choice made with the user
  before Phase 4).

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
   `APP_BASE_URL` (`http://localhost:3000` for local dev). Leave the
   IBKR/OpenAI/market-data/news variables unset — every one of them is
   optional until its phase lands, and the app reports those integrations as
   "not configured" rather than failing to start.

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

See [`.env.example`](./.env.example) for the full list. In short: a Postgres
connection string, a session secret, the app's own base URL (for CORS), the
IBKR gateway's base URL (not credentials — the gateway itself handles
login), an OpenAI API key, and a market-data/news vendor API key. Nothing
here is committed with real values; copy `.env.example` to `.env` and fill
it in locally. The frontend additionally reads `NEXT_PUBLIC_API_BASE_URL`
(not secret — just where the browser sends requests) from its own
`apps/web/.env.local`.

## Development phases

See [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) for the full breakdown.
Summary:

0. Architecture and environment
1. Repository, frontend, backend, database, auth, navigation *(current)*
2. IBKR read-only integration
3. OpenAI integration and tool calling
4. News and market intelligence
5. Risk, scenarios, catalysts
6. Monitoring and alerts
7. Trading with explicit confirmation

## A note on the watchlist tickers

`AVUV, CLS, FPS, GFS, MSFT, SPMO, VTI, VXUS, WDC, WMT` appear in planning
material as a **development watchlist only** — symbols to exercise
news/market-data code paths against. They are not, and must never be treated
as, actual position data. Once IBKR is connected (Phase 2), IBKR is the sole
source of truth for real holdings, shares, cost basis, and portfolio value.
