# IBKR Integration — Phase 2

Status: implemented, read-only, **not yet live-verified against a real IBKR
account in this environment** — see [§8 Verification limits](#8-verification-limits-of-this-research)
and [§9 What you need to do to go live](#9-what-you-need-to-do-to-go-live).

## 1. Authentication architecture (unchanged conclusion from Phase 0, re-checked)

Individual retail IBKR accounts have exactly one supported way to reach the
Web API: the **Client Portal Gateway (CP Gateway)**, a small Java process
that:

- Serves a local HTTPS endpoint (default `https://localhost:5000`) with a
  **self-signed certificate** — TLS verification must be disabled for this
  specific loopback connection only (see `client.ts`; this is IBKR's own
  documented setup, not a general security shortcut).
- Requires a **browser-based login** — username, password, and 2FA (IBKR
  Mobile push or security card) — performed by the human, not automatable
  by this application. IBKR does not publish a supported programmatic
  credential exchange for individual accounts. OAuth 1.0a is
  institutional-only; OAuth 2.0 for individuals remains on IBKR's roadmap,
  not generally available.
- **This application never sees, asks for, stores, or transmits the IBKR
  password or a 2FA code.** The user opens the gateway's own login page in
  their own browser; our backend only ever talks to the already-established
  session.

This repo re-confirms the Phase 0 conclusion; nothing in the currently
supported architecture has changed to require individuals to use anything
else. See §8 for exactly what could and couldn't be re-verified against
IBKR's own docs from this sandbox.

## 2. Session states (four distinct things, not one "connected" flag)

| State                               | What it means                                                                           | How we detect it                                                                                                                                                                                                    |
|-------------------------------------|-----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Gateway reachable**               | The CP Gateway process is running and answering HTTPS on its configured port.           | A request to the gateway succeeds or fails with an HTTP-level response (as opposed to a connection error).                                                                                                          |
| **Brokerage session connected**     | The gateway has a live connection to IBKR's backend.                                    | `/iserver/auth/status` response's `connected` field.                                                                                                                                                                |
| **Brokerage session authenticated** | The user's login (password + 2FA) is currently valid.                                   | `/iserver/auth/status` response's `authenticated` field. A gateway can be `connected: true, authenticated: false` — session dropped, needs a fresh browser login.                                                   |
| **Account data available**          | An authenticated session has successfully returned account/position data at least once. | Tracked separately by the connection manager (`lastSuccessfulSyncAt`), because `authenticated: true` doesn't guarantee the next data call succeeds (e.g., a market-data permission gap only affects that one call). |

`IbkrSessionManager` (`apps/api/src/integrations/ibkr/session-manager.ts`)
owns the first three. `IbkrConnectionManager`
(`apps/api/src/integrations/ibkr/connection-manager.ts`) owns the fourth,
layered on top.

## 3. Endpoints used (Phase 2 scope — read-only)

| Endpoint                                    | Method | Purpose                                                                                                                                                                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                               |
|---------------------------------------------|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/iserver/auth/status`                      | POST   | Session state: `connected`, `authenticated`.                                                                                                                                                                                                       | Polled by the tickle loop; also called on demand before a data request if the cached state looks stale.                                                                                                                                                                                                                                                                             |
| `/tickle`                                   | GET    | Keeps the brokerage session alive.                                                                                                                                                                                                                 | IBKR's own guidance: call roughly every 60s; the session times out after about 5–6 minutes idle. `IbkrSessionManager` runs this on an interval while the gateway is configured.                                                                                                                                                                                                     |
| `/iserver/accounts`                         | GET    | List of accounts the authenticated user can access; must be called at least once per session before other calls behave correctly (a documented CP Gateway quirk — some endpoints 500 until the session's account context is initialized this way). | Backs account discovery/selection (§7 of the Phase 2 spec).                                                                                                                                                                                                                                                                                                                         |
| `/portfolio/accounts`                       | GET    | List of accounts for the `/portfolio/*` endpoint family specifically; must be called before other `/portfolio/*` endpoints will return data.                                                                                                       | Called once per session alongside `/iserver/accounts`.                                                                                                                                                                                                                                                                                                                              |
| `/portfolio/{accountId}/summary`            | GET    | Net liquidation, equity with loan value, cash, buying power, excess liquidity, initial/maintenance margin, etc., as a keyed object.                                                                                                                | Primary source for `AccountSummary`.                                                                                                                                                                                                                                                                                                                                                |
| `/portfolio/{accountId}/ledger`             | GET    | Cash balances and net liquidation by currency (including a `BASE` aggregate).                                                                                                                                                                      | Used as a fallback/cross-check for cash and net liquidation when `/summary` omits a field — some fields are only reliably present on one of the two endpoints depending on account configuration.                                                                                                                                                                                   |
| `/portfolio/{accountId}/positions/{pageId}` | GET    | Paginated list of positions: `conid`, `contractDesc`, `position`, `avgCost`, `avgPrice`, `mktPrice`, `mktValue`, `currency`, `unrealizedPnl`, `realizedPnl`, `assetClass`, and (not always present) `sector`/`listingExchange`.                    | Paginated at 100 positions/page by IBKR; `IbkrConnectionManager` walks pages until a short page signals the end.                                                                                                                                                                                                                                                                    |
| `/iserver/marketdata/snapshot`              | GET    | Live-ish quote fields for a set of `conids`, requested via numeric field codes (`31`=last, `84`=bid, `86`=ask, `83`=change %, `82`=change, `87`=volume).                                                                                           | Used to refresh each held position's current price/change; **not** a general quote service in Phase 2 (that's Phase 4's `MarketDataSource` scope for arbitrary symbols). IBKR's own docs note the first snapshot request for a `conid` in a session can return partial data until market data is "primed" — we do not implement retry-priming in Phase 2; see §7 Known limitations. |

Order-related endpoints (`/iserver/account/orders`, trading endpoints) are
**not called anywhere in this codebase** — Phase 2 is read-only by design,
enforced simply by the fact that `IbkrClient` has no methods that issue
those requests.

## 4. Refresh strategy

- **Session heartbeat (`/tickle`)**: every 60 seconds, always, whenever
  `IBKR_GATEWAY_BASE_URL` is configured — independent of whether any page is
  open, because letting the brokerage session expire is more disruptive
  than the cost of one small request a minute.
- **Account summary / positions**: cached per account for 15 seconds
  (`ACCOUNT_CACHE_TTL_MS` in `connection-manager.ts`). A request within that
  window reuses the cached value and reports it as `"live"` (it's fresh
  enough to be current); a request after the window tries a real refresh.
  If the refresh fails but a previous successful value exists, that value
  is returned with `status: "cached"` and its real fetch timestamp — never
  silently re-labeled as live.
- **Market data (position prices)**: cached for 10 seconds per `conid`
  (`MARKET_DATA_CACHE_TTL_MS`), same live/cached/unavailable rule.
- **No WebSocket streaming in Phase 2.** IBKR's Web API supports a
  streaming WebSocket for market data and account updates; implementing it
  is deferred rather than built speculatively, since it can't be verified
  against a live session in this sandbox and polling every 10–15 seconds
  is an honest, sufficient refresh rate for a personal dashboard. This is a
  documented Phase 2 scope decision, not an oversight — see §7.

None of this is polled by the frontend directly: **every IBKR call happens
inside the backend**; the frontend only ever calls our own `/api/v1/*`
routes, which is why the `PortfolioDataSource` abstraction from Phase 1
didn't need to change shape, only gain a real implementation.

## 5. Error classification

`apps/api/src/integrations/ibkr/errors.ts` defines `IbkrErrorCode`:

- `gateway_unreachable` — connection refused/reset/DNS failure reaching the
  configured gateway URL (gateway isn't running, or the URL is wrong).
- `timeout` — the gateway didn't respond in time.
- `authentication_required` — the gateway is reachable but the brokerage
  session isn't authenticated (`authenticated: false`), or the gateway
  returned 401.
- `session_expired` — was authenticated before, `/iserver/auth/status` now
  reports `authenticated: false` after previously reporting `true`.
- `account_unavailable` — the account ID isn't in the authenticated
  session's account list, or a `/portfolio/*` call 404s for it.
- `market_data_permission_missing` — a snapshot response's fields are
  entirely absent for a `conid` in a way that matches IBKR's documented
  "no market data subscription" shape, rather than a transient gap.
- `rate_limited` — HTTP 429.
- `unknown_ibkr_error` — anything else, with the safe (non-sensitive)
  message preserved for logs; never the raw upstream body forwarded to the
  browser.

Every error the frontend can see goes through this classification — routes
never leak an IBKR response body or stack trace to the client (see
`SECURITY.md` §4).

## 6. Account identification (Phase 2 §7 of the task spec)

- No account ID is hardcoded anywhere. `IbkrConnectionManager` discovers
  accounts from `/iserver/accounts` and `/portfolio/accounts` after
  authentication.
- `IBKRConnection.selectedAccountId` (new column, this phase's migration)
  persists which account a user has chosen when they have more than one.
  `GET /api/v1/portfolio/account` returns the discovered list (IDs masked
  in the API response — only the last 4 characters are shown, e.g.
  `U***1234`) plus the current selection; `POST` on the same route changes
  it.
- With exactly one account, it's auto-selected and the account picker is
  simply not shown by the frontend.

## 7. Known limitations (Phase 2 scope, by design)

- No WebSocket streaming (§4).
- No retry-priming for the first market-data snapshot of a session per
  `conid` (§3) — a position's price may briefly show as unavailable right
  after the app starts and correct itself on the next 10-second refresh.
- Performance history (`GET /api/v1/portfolio/performance`) returns
  `status: "unavailable"` with an honest reason — Phase 2 has no portfolio
  snapshot history to compute it from yet (that arrives with the scheduled
  snapshot jobs later in the roadmap). It is not backed by any endpoint
  call in this phase, so nothing here was skipped, only sequenced.
- Portfolio weight is **computed by us**, not returned by IBKR: `weight_i =
  position_i.marketValue / accountSummary.netLiquidation`, using whichever
  of the two values is currently available; if either is unavailable, the
  weight is `null`, never a stale or guessed number.
- Sector/country enrichment on positions is opportunistic (only what
  `/portfolio/{accountId}/positions/{pageId}` itself returns) — no separate
  reference-data lookup is implemented in Phase 2.

## 8. Verification limits of this research

This sandbox's network egress policy blocks direct HTTPS access to
`interactivebrokers.com` (confirmed: a `WebFetch` to
`interactivebrokers.com/campus/...` pages returns `EGRESS_BLOCKED` from the
environment's proxy, the same policy that blocks Yahoo Finance and other
financial data hosts). Web search (which is served through a different,
allowed path) still works, so this document is built from:

- The Phase 0 research already verified this way (IBKR's own Campus/docs
  page titles and summaries returned by search), re-confirmed unchanged.
- Search results surfacing endpoint field names and response shapes from
  IBKR's own documentation pages, from the community client libraries that
  wrap this same API (e.g. `Voyz/ibind`, `tomlister/ibclient`,
  `LittleLittleCloud/ibkr_client`), and from IBKR's own trading-lesson
  articles — cross-checked against each other where more than one source
  was available.
- This assistant's own training knowledge of this specific, long-stable,
  widely-documented API, used only to fill gaps between search results, not
  as a substitute for them.

What that means concretely: the **architecture** (gateway-based auth, the
four session states, the tickle/refresh cadence, the endpoint list, the
error taxonomy) is solid and re-derived independently rather than assumed.
The **exact byte-for-byte JSON field names** on `/portfolio/{accountId}/summary`
and `/portfolio/{accountId}/ledger` in particular could not be checked
against IBKR's live OpenAPI reference from here — `portfolio-mapper.ts`
reads the most commonly documented field names defensively (falls back to
`null` rather than throwing when a field is absent or named slightly
differently than expected) specifically because of this. **This must be
validated against a real authenticated session before being trusted with
real money decisions** — see §9.

## 9. What you need to do to go live

This application cannot establish a real IBKR connection inside this
sandboxed remote environment: there is no way to run the CP Gateway process
here (no outbound access to IBKR's own servers to run/authenticate it, and
no browser for you to complete the 2FA login this architecture requires —
by design, since we never automate that step). To connect your real
account:

1. **Install and run the Client Portal Gateway** on a machine you control
   (your laptop, or a small server), from IBKR's own download:
   `https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/` →
   Client Portal Gateway. It's a Java process; start it with the included
   `bin/run.sh root/conf.yaml` (or `.bat` on Windows).
2. **Log in** by opening `https://localhost:5000` (or whatever port you
   configured) in your own browser and completing your normal IBKR
   username/password/2FA login. Leave that gateway process running.
3. **Point this app at it**: set `IBKR_GATEWAY_BASE_URL` in `.env` (repo
   root, read by `apps/api`) to the gateway's base API URL, e.g.
   `https://localhost:5000/v1/api`.
4. **Restart the backend** (`apps/api`) so it picks up the new env var.
5. Open **Settings → IBKR** in the app and press **Test IBKR Connection** —
   it will show you exactly which of the four states (§2) is failing if
   something isn't right, rather than a generic error.
6. Because the CP Gateway requires that manual browser login, you'll need
   to repeat step 2 periodically (at least once every 24 hours, sometimes
   sooner) — the app will tell you when (`authentication_required` /
   `session_expired` state) instead of silently going stale.

## 10. Sources

- https://www.interactivebrokers.com/campus/trading-lessons/launching-and-authenticating-the-gateway/
- https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/client-portal-gateway-faq
- https://www.interactivebrokers.com/docs/web-api/authentication/faq
- https://www.interactivebrokers.com/docs/web-api/v1/endpoints/session/ping-the-server
- https://www.interactivebrokers.com/docs/web-api/api-reference/trading-market-data/get-md-snapshot
- https://www.interactivebrokers.com/docs/web-api/v1/endpoints/portfolio/positions
- https://interactivebrokers.github.io/cpwebapi/
- https://github.com/Voyz/ibind
- https://github.com/tomlister/ibclient
- https://github.com/LittleLittleCloud/ibkr_client
