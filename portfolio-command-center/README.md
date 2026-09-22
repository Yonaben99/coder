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

**Phase 0 — architecture only.** No application code exists yet. This repo
currently contains planning documents:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, research findings
  (especially IBKR's actual retail-account authentication constraints), and
  the database schema.
- [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) — phased build plan and each
  phase's exit criteria.
- [`SECURITY.md`](./SECURITY.md) — secrets handling, IBKR credential policy,
  auth, and trading-safety rules.

Phase 1 (repository/frontend/backend/database/auth scaffolding) has not
started and will not start without explicit sign-off.

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

## Running it locally

Not applicable yet — no code exists. This section will be filled in during
Phase 1 with the actual `docker compose up` / `pnpm install` / migration
steps once the scaffolding exists.

## Required environment variables

See [`.env.example`](./.env.example) for the full list once Phase 1 lands.
In short: a Postgres connection string, a session secret, the IBKR gateway's
base URL (not credentials — the gateway itself handles login), an OpenAI API
key, and a market-data/news vendor API key. Nothing here is committed with
real values; copy `.env.example` to `.env` and fill it in locally.

## Development phases

See [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) for the full breakdown.
Summary:

0. Architecture and environment *(current)*
1. Repository, frontend, backend, database, auth, navigation
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
