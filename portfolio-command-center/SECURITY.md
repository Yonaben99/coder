# Security — Portfolio Command Center

Status: Phases 1-4 implemented (auth, IBKR read-only, Portfolio AI, news).
This document sets the rules the implementation follows; where a rule is
now backed by real code, that's called out inline.

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
- Rate limiting / lockout on login attempts to resist credential stuffing
  against our own login (separate from, and no substitute for, IBKR's own
  account security).

## 4. API security

- All backend endpoints require authentication except the login/signup
  routes themselves.
- Input validation on every route (schema validation, e.g. via Fastify's
  built-in JSON Schema/TypeBox support) — especially anything that reaches
  IBKR order endpoints in Phase 7.
- CSRF protection appropriate to a cookie-authenticated API (SameSite=Strict
  cookies plus origin checking on state-changing requests).
- Outbound calls to OpenAI and the news vendor (Finnhub) go through a
  single client module per integration (`OpenAIProvider`,
  `FinnhubHttpClient`) so timeouts, retries, and error handling are
  consistent and auditable in one place.
- News endpoints (`/api/v1/news*`) require the same authenticated session as
  every other route; `getPortfolioNews`/`getPortfolioNewsSummary` are scoped
  to the requesting user's own IBKR holdings — never another user's. See
  `docs/NEWS_INTEGRATION.md` §10.

## 5. Trading safety (Phase 7, not before)

- No order-placement endpoint exists before Phase 7.
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
  "what happened and when" is reconstructable without guessing.
- AI conversations and their tool calls are persisted (`ai_conversations`,
  `ai_messages`) so any AI-influenced decision can be traced back to the
  exact data the model was given.
