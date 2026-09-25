# Security — Portfolio Command Center

Status: Phases 1-7 implemented (auth, IBKR read-only, Portfolio AI, news,
analysts/earnings/catalysts/risk, alerts and monitoring, production
deployment readiness). This document sets the rules the implementation
follows; where a rule is now backed by real code, that's called out
inline.

## 1. Secrets

- All secrets (OpenAI API key, Finnhub API key, database credentials,
  session signing secret) live in **server-side environment variables
  only** — read by `apps/api`, never bundled into or reachable from
  `apps/web`'s client code.
- `.env` (real values) is git-ignored. `.env.example` in this repo lists
  variable names with placeholder values only — see that file.
- No secret is ever logged. The logging configuration (pino) redacts known
  secret-shaped fields (`*password*`, `*secret*`, `*token*`, `*apiKey*`) at
  the logger level, not left to call sites to remember.
- No secret or credential is ever sent to OpenAI, in a prompt, tool result,
  or system message. OpenAI tool functions return portfolio/market/news data
  only. Confirmed in the Phase 3 implementation:
  `apps/api/src/integrations/openai/tool-executor.ts`'s tools only ever
  return `LiveData<T>` shapes built from `PortfolioDataSource` /
  `IbkrPortfolioDataSource` / `NewsDataSource` — none of them touch IBKR
  session state, cookies, or credentials, and `OPENAI_API_KEY` is read once
  in `config.ts` and never returned by any route or written to Postgres.
  See `docs/OPENAI_INTEGRATION.md` §8.
- Same pattern for the Phase 4 news integration: `FINNHUB_API_KEY` is read
  once in `config.ts`, passed only to `FinnhubNewsProvider`'s constructor,
  never returned by any route, never logged, never written to Postgres.
  See `docs/NEWS_INTEGRATION.md` §10.
- Phase 5's analyst/earnings integrations reuse the same
  `FINNHUB_API_KEY` and the same rule — passed only into
  `FinnhubAnalystProvider`/`FinnhubEarningsProvider`'s constructors, never
  logged or persisted. See `docs/RISK_AND_CATALYSTS.md` §7. Phase 6's
  scheduler and alert engine introduce no new secret at all — every
  service they call already owns its own credential handling.

## 2. IBKR credentials — the hard constraint

IBKR retail/individual accounts authenticate to the Client Portal Gateway via
a **browser-based login with username, password, and 2FA** — see
`ARCHITECTURE.md` §1.1. There is no supported programmatic credential
exchange for individuals today.

Rules that follow from this:

- **We do not store the IBKR password in this application**, plaintext or
  otherwise. The user authenticates directly against IBKR's own login page in
  a browser pointed at the gateway; our backend never sees or handles the
  password.
- The `ibkr_connections` table stores only session/connection *metadata*
  (gateway reachability, last-authenticated timestamp, connection status,
  which account a user has selected) — never credentials, never a session
  token that could be replayed outside the gateway's own session. Confirmed
  in the Phase 2 implementation: nothing in `apps/api/src/integrations/ibkr/`
  reads, accepts, or forwards a password or 2FA code.
- The gateway serves HTTPS on `localhost` with a self-signed certificate by
  default (IBKR's own documented local setup). `GatewayHttpClient`
  (`apps/api/src/integrations/ibkr/client.ts`) disables TLS verification —
  but only for this one client, only ever used against the
  operator-configured `IBKR_GATEWAY_BASE_URL`, never for any other outbound
  request in the app (OpenAI, market data, etc. all keep normal TLS
  verification).
- If, later, the user explicitly opts into an unsupported automation tool
  (e.g. `ibeam`) to avoid the daily manual login, that decision is made
  knowingly and separately — it requires storing IBKR credentials somewhere
  the automation can read them, which is a real risk (credential-store
  compromise, IBKR ToS considerations, silent breakage when IBKR changes its
  login flow) that must be weighed against the convenience before we build
  it. The core architecture does not assume or depend on this path.
- Session-expiry is treated as a normal, expected state (see
  `ARCHITECTURE.md` §1.1), not an error to hide — the UI tells the user
  exactly what to do (re-authenticate in the gateway) rather than showing
  stale numbers.

## 3. Authentication and authorization

- Password storage: Argon2id, per-user salt (library default), no custom
  crypto.
- Sessions: random opaque session ID stored server-side, issued as an
  httpOnly, `Secure`, `SameSite=Strict` cookie. No JWTs kept client-readable
  for session state (nothing sensitive needs to be readable by JS).
- Optional TOTP-based 2FA on top of password login, recommended given this
  app fronts brokerage-adjacent financial data.
- Every backend route re-checks that the authenticated session's user owns
  the resource being accessed — authorization is enforced server-side on
  every request, never inferred from what the frontend chose to render.
- Rate limiting on login/signup attempts to resist credential stuffing
  against our own login (separate from, and no substitute for, IBKR's own
  account security). **Implemented in Phase 7**: `@fastify/rate-limit`
  enforces 10 requests/minute/IP specifically on `/auth/login` and
  `/auth/signup` (`apps/api/src/routes/auth.ts`), on top of a 300/min/IP
  app-wide default (`apps/api/src/app.ts`). A full account-lockout
  mechanism (tracking failed attempts per account, not just per IP) is not
  implemented — the IP-based rate limit is judged sufficient for a
  single/small-N-user personal app; revisit if that assumption changes.

## 4. API security

- All backend endpoints require authentication except the login/signup
  routes themselves.
- Input validation on every route (schema validation, e.g. via Fastify's
  built-in JSON Schema/TypeBox support) — especially anything that will
  reach IBKR order endpoints once trading (DEVELOPMENT_PLAN.md Phase 8) is
  built.
- CSRF protection appropriate to a cookie-authenticated API (SameSite=Strict
  cookies plus a single-origin CORS allowlist on `APP_BASE_URL` — no
  wildcard origin anywhere). No separate CSRF token layer: a
  `SameSite=Strict` cookie is not attached to any cross-site request a
  browser makes (top-level navigation included), which is this app's whole
  CSRF attack surface given it does no cross-site form posting of its own.
- **Implemented in Phase 7**: an explicit 1 MiB `bodyLimit` on the Fastify
  instance, `trustProxy` enabled only in production (so rate limiting and
  any future IP-based logic key on the real client IP behind a hosting
  provider's load balancer, not the proxy's), and a `GET /ready` readiness
  probe (real `SELECT 1`) alongside the pre-existing `GET /health`
  liveness probe — both exempt from rate limiting so a platform's health
  polling is never throttled. See `docs/DEPLOYMENT.md` §10, §13.
- SQL injection: audited repo-wide in Phase 7 — every database access goes
  through Prisma's query builder or a parameterized tagged-template
  `` $queryRaw`SELECT 1` ``; zero uses of `$queryRawUnsafe`,
  `$executeRawUnsafe`, or string-concatenated SQL anywhere in the codebase.
- Outbound calls to OpenAI and the news vendor (Finnhub) go through a
  single client module per integration (`OpenAIProvider`,
  `FinnhubHttpClient`) so timeouts, retries, and error handling are
  consistent and auditable in one place.
- News endpoints (`/api/v1/news*`) require the same authenticated session as
  every other route; `getPortfolioNews`/`getPortfolioNewsSummary` are scoped
  to the requesting user's own IBKR holdings — never another user's. See
  `docs/NEWS_INTEGRATION.md` §10.
- Alert and monitoring endpoints (`/api/v1/alerts*`, `/api/v1/alert-rules*`,
  `/api/v1/monitoring/status`) require the same authenticated session as
  every other route; every query and mutation is scoped to
  `request.user.id` — a user can only read or configure their own alerts
  and alert rules, never another user's. `AlertEngine` detection itself is
  fully deterministic (threshold/rule evaluation over already-fetched
  portfolio, market, news, analyst, and earnings data) — it never makes an
  LLM call as part of a scheduled polling cycle, so the automated alert
  pipeline has no prompt-injection surface. See
  `docs/ALERTS_AND_MONITORING.md` §11.

## 5. Trading safety (Phase 8, not before)

- No order-placement endpoint exists before Phase 8 (DEVELOPMENT_PLAN.md)
  — explicitly, still, after Phase 7's production-deployment work: this
  phase made the app deployable, it did not add trading.
- When it exists: every BUY/SELL/CLOSE/MODIFY/CANCEL requires an explicit,
  itemized user confirmation step (symbol, side, quantity, order type,
  estimated cost) in the same request/response cycle as submission — no
  "confirm once, repeat automatically" pattern, no scheduled/autonomous
  order placement.
- All order attempts (submitted, confirmed, rejected, failed) are written to
  the audit log (`system_events`) with enough detail to reconstruct exactly
  what was requested and what IBKR returned.

## 6. Logging and data privacy

- Structured logs (pino), secret-redacting as in §1.
- Logs capture enough to debug (request IDs, integration call outcomes,
  timing) without capturing full account numbers, positions, or PII beyond
  what's needed operationally.
- Historical snapshots (positions, account values) are the user's own
  financial data; treat the database backup/restore process with the same
  care as credentials — encrypted at rest wherever the hosting provider
  supports it, access restricted to the deploying user.

## 7. Audit-friendliness

- `system_events` captures integration state changes (IBKR
  connected/authenticated transitions, job failures, AI tool-call errors) so
  "what happened and when" is reconstructable without guessing. As of
  Phase 6 this is real and populated, not aspirational: `SystemEventLogger`
  (`apps/api/src/integrations/scheduler/system-event-logger.ts`) writes a
  row for every job started/completed/failed, provider-unavailable
  condition, alert generated, and alert suppressed-by-cooldown event —
  see `docs/ALERTS_AND_MONITORING.md` §9 for the exact event types and
  payload shapes.
- AI conversations and their tool calls are persisted (`ai_conversations`,
  `ai_messages`) so any AI-influenced decision can be traced back to the
  exact data the model was given.
